-- SAP passwords out of system_settings.
--
-- Before: SAP environment passwords were stored inside system_settings.sap_integration, which
-- every approved user can read (the browser needed them to talk to SAP).
-- After: passwords live in sap_env_secrets, which only the service role can read (the ADT
-- bridge on the VM and the Vercel API). The browser no longer receives them: it sends host
-- and user, and the server fills in the password after checking that the logged-in user may
-- use that SAP system (admin/manager/project manager, the customer, or someone on one of the
-- customer's / project's cases).
-- For the AI's SAP tools (MCP), whose calls come from Anthropic's servers without an app
-- login, the app issues a short-lived ticket (sap_mcp_tickets) instead of the password.

CREATE TABLE IF NOT EXISTS public.sap_env_secrets (
  scope_key  text NOT NULL,              -- sap_integration key: customer id or proj_<project id>
  env_id     text NOT NULL,              -- environment id inside that entry
  password   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (scope_key, env_id)
);
ALTER TABLE public.sap_env_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sap_env_secrets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.sap_mcp_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  sap_host     text NOT NULL,
  sap_username text NOT NULL,
  sap_client   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
ALTER TABLE public.sap_mcp_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sap_mcp_tickets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._norm_sap_host(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(regexp_replace(trim(coalesce(p, '')), '^https?://', '', 'i'), '/.*$', ''));
$$;

-- Is this user on this case? (Same rule as user_can_access_case, for a given user.)
CREATE OR REPLACE FUNCTION public._user_on_case(p_user uuid, p_case uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases c
    WHERE c.id = p_case
      AND (c.client_id = p_user OR c.created_by = p_user OR c.manager_id = p_user OR c.area_leader_id = p_user
           OR c.head_hunter_id = p_user OR c.reviewer_user_id = p_user
           OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = p_user)
           OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = p_user)
           OR EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id AND (p.client_id = p_user OR p.created_by = p_user))));
$$;

-- May this user use the SAP systems saved under this sap_integration key?
CREATE OR REPLACE FUNCTION public._user_can_use_sap_scope(p_user uuid, p_scope text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_id   uuid;
  UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  SELECT role::text INTO v_role FROM users WHERE id = p_user AND verification_status = 'approved';
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role IN ('admin', 'manager', 'project_manager') THEN RETURN true; END IF;
  IF p_scope ~ UUID_RE THEN                         -- customer
    v_id := p_scope::uuid;
    RETURN v_id = p_user
        OR EXISTS (SELECT 1 FROM cases c WHERE c.client_id = v_id AND public._user_on_case(p_user, c.id))
        OR EXISTS (SELECT 1 FROM projects p WHERE p.client_id = v_id AND p.created_by = p_user);
  ELSIF p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE THEN   -- project
    v_id := substr(p_scope, 6)::uuid;
    RETURN EXISTS (SELECT 1 FROM projects p WHERE p.id = v_id AND (p.created_by = p_user OR p.client_id = p_user))
        OR EXISTS (SELECT 1 FROM cases c WHERE c.project_id = v_id AND public._user_on_case(p_user, c.id));
  END IF;
  RETURN false;
END $$;

-- The password for host + SAP user (+ client) for this platform user, or NULL.
-- Service role only (ADT bridge, Vercel API).
CREATE OR REPLACE FUNCTION public.sap_env_password_for(p_user uuid, p_host text, p_username text, p_client text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_pw text;
BEGIN
  FOR r IN
    SELECT c.key AS scope, e AS env
    FROM system_settings s, jsonb_each(CASE WHEN jsonb_typeof(s.value) = 'object' THEN s.value ELSE '{}'::jsonb END) c,
         jsonb_array_elements(CASE WHEN jsonb_typeof(c.value -> 'environments') = 'array' THEN c.value -> 'environments'
                                   WHEN c.value ? 'host' THEN jsonb_build_array(c.value || jsonb_build_object('id', 'default'))
                                   ELSE '[]'::jsonb END) e
    WHERE s.key = 'sap_integration'
      AND public._norm_sap_host(e ->> 'host') = public._norm_sap_host(p_host)
      AND upper(coalesce(e ->> 'username', '')) = upper(coalesce(p_username, ''))
      AND (p_client IS NULL OR p_client = '' OR coalesce(nullif(e ->> 'client', ''), '100') = p_client)
  LOOP
    IF NOT public._user_can_use_sap_scope(p_user, r.scope) THEN CONTINUE; END IF;
    v_pw := NULL;
    SELECT nullif(password, '') INTO v_pw FROM sap_env_secrets WHERE scope_key = r.scope AND env_id = coalesce(r.env ->> 'id', 'default');
    v_pw := coalesce(v_pw, nullif(r.env ->> 'password', ''));
    IF v_pw IS NOT NULL THEN RETURN v_pw; END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- Save (or clear) an environment's password. Admins/managers, the customer for its own
-- entry, or the project owner for a project entry. Also removes any password left in the
-- settings and marks the environment has_password.
CREATE OR REPLACE FUNCTION public.set_sap_env_password(p_scope text, p_env_id text, p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := coalesce(get_my_role(), '');
  v_has  boolean := coalesce(p_password, '') <> '';
  UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT (v_role IN ('admin', 'manager')
          OR p_scope = auth.uid()::text
          OR (p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE AND public.user_owns_project(substr(p_scope, 6)::uuid))) THEN
    RAISE EXCEPTION 'You cannot change the SAP password of this environment' USING ERRCODE = '42501';
  END IF;
  IF v_has THEN
    INSERT INTO sap_env_secrets (scope_key, env_id, password, updated_at, updated_by)
    VALUES (p_scope, p_env_id, p_password, now(), auth.uid())
    ON CONFLICT (scope_key, env_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now(), updated_by = auth.uid();
  ELSE
    -- Cleared: kept as an empty password (treated as none).
    UPDATE sap_env_secrets SET password = '', updated_at = now(), updated_by = auth.uid()
     WHERE scope_key = p_scope AND env_id = p_env_id;
  END IF;
  UPDATE system_settings s
     SET value = jsonb_set(s.value, ARRAY[p_scope, 'environments'],
                   (SELECT coalesce(jsonb_agg(CASE WHEN e ->> 'id' = p_env_id
                                                   THEN (e - 'password') || jsonb_build_object('has_password', v_has)
                                                   ELSE e END), '[]'::jsonb)
                      FROM jsonb_array_elements(s.value -> p_scope -> 'environments') e))
   WHERE s.key = 'sap_integration' AND jsonb_typeof(s.value -> p_scope -> 'environments') = 'array';
END $$;

-- A 30-minute ticket the AI's SAP tools (MCP) carry instead of the password.
CREATE OR REPLACE FUNCTION public.issue_sap_mcp_ticket(p_host text, p_username text, p_client text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  INSERT INTO sap_mcp_tickets (user_id, sap_host, sap_username, sap_client)
  VALUES (auth.uid(), public._norm_sap_host(p_host), upper(coalesce(p_username, '')), nullif(p_client, ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Service role: the password behind an MCP ticket (checked against host/user).
CREATE OR REPLACE FUNCTION public.sap_mcp_ticket_password(p_ticket uuid, p_host text, p_username text, p_client text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t sap_mcp_tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM sap_mcp_tickets WHERE id = p_ticket AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF t.sap_host <> public._norm_sap_host(p_host) OR t.sap_username <> upper(coalesce(p_username, '')) THEN RETURN NULL; END IF;
  RETURN public.sap_env_password_for(t.user_id, p_host, p_username, coalesce(nullif(p_client, ''), t.sap_client));
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_user_on_case(uuid, uuid)', '_user_can_use_sap_scope(uuid, text)',
                           'sap_env_password_for(uuid, text, text, text)', 'sap_mcp_ticket_password(uuid, text, text, text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['set_sap_env_password(text, text, text)', 'issue_sap_mcp_ticket(text, text, text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Copy the passwords saved so far into sap_env_secrets (they are removed from the settings
-- in a second step, once the bridge and the app fill them in server-side).
INSERT INTO public.sap_env_secrets (scope_key, env_id, password)
SELECT c.key, e ->> 'id', e ->> 'password'
FROM system_settings s, jsonb_each(CASE WHEN jsonb_typeof(s.value) = 'object' THEN s.value ELSE '{}'::jsonb END) c,
     jsonb_array_elements(CASE WHEN jsonb_typeof(c.value -> 'environments') = 'array' THEN c.value -> 'environments' ELSE '[]'::jsonb END) e
WHERE s.key = 'sap_integration' AND coalesce(e ->> 'password', '') <> '' AND coalesce(e ->> 'id', '') <> ''
ON CONFLICT (scope_key, env_id) DO NOTHING;
