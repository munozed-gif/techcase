-- Per-project VPN profiles for SAP environments.
--
-- A VPN profile belongs to a sap_integration entry (scope_key: customer id or proj_<project id>)
-- and is linked from an environment with environments[].vpn_profile_id. On the VM, the ADT
-- bridge brings each profile up in its own network namespace, so several customers' VPNs run
-- side by side without route conflicts and without touching the VM's own internet access.
-- Secrets (password, client config) are readable only by the service role (ADT bridge); the
-- app lists profiles without them. Profiles are archived, never deleted.

CREATE TABLE IF NOT EXISTS public.sap_vpn_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key    text NOT NULL,
  name         text NOT NULL,
  vpn_type     text NOT NULL CHECK (vpn_type IN ('fortinet', 'anyconnect', 'globalprotect', 'pulse', 'openvpn', 'wireguard')),
  gateway      text,                -- host or URL of the VPN gateway (not used by openvpn/wireguard)
  port         integer,
  username     text,
  secret       text NOT NULL DEFAULT '',   -- password
  config       text NOT NULL DEFAULT '',   -- .ovpn / WireGuard config (may contain keys)
  trusted_cert text,                -- gateway certificate pin (sha256) when it is self-signed
  realm        text,                -- realm / auth group / gateway group, when the VPN uses one
  options      jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);
ALTER TABLE public.sap_vpn_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sap_vpn_profiles FROM anon, authenticated;

-- May the current user manage the SAP setup of this sap_integration entry?
CREATE OR REPLACE FUNCTION public._can_manage_sap_scope(p_scope text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RETURN false; END IF;
  RETURN coalesce(get_my_role(), '') IN ('admin', 'manager')
      OR p_scope = auth.uid()::text
      OR (p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE AND public.user_owns_project(substr(p_scope, 6)::uuid));
END $$;

-- Create or update a profile. p_secret / p_config: NULL keeps the saved value, '' clears it.
CREATE OR REPLACE FUNCTION public.save_sap_vpn_profile(
  p_id uuid, p_scope text, p_name text, p_type text, p_gateway text, p_port integer,
  p_username text, p_secret text, p_config text, p_trusted_cert text, p_realm text, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public._can_manage_sap_scope(p_scope) THEN
    RAISE EXCEPTION 'You cannot manage the VPN profiles of this SAP setup' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'The VPN profile needs a name' USING ERRCODE = '22023'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO sap_vpn_profiles (scope_key, name, vpn_type, gateway, port, username, secret, config, trusted_cert, realm, options, updated_by)
    VALUES (p_scope, trim(p_name), p_type, nullif(trim(p_gateway), ''), p_port, nullif(trim(p_username), ''),
            coalesce(p_secret, ''), coalesce(p_config, ''), nullif(trim(p_trusted_cert), ''), nullif(trim(p_realm), ''),
            coalesce(p_options, '{}'::jsonb), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE sap_vpn_profiles SET
      name = trim(p_name), vpn_type = p_type, gateway = nullif(trim(p_gateway), ''), port = p_port,
      username = nullif(trim(p_username), ''),
      secret = coalesce(p_secret, secret), config = coalesce(p_config, config),
      trusted_cert = nullif(trim(p_trusted_cert), ''), realm = nullif(trim(p_realm), ''),
      options = coalesce(p_options, options), archived = false, updated_at = now(), updated_by = auth.uid()
    WHERE id = p_id AND scope_key = p_scope
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'VPN profile not found' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.archive_sap_vpn_profile(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope text;
BEGIN
  SELECT scope_key INTO v_scope FROM sap_vpn_profiles WHERE id = p_id;
  IF v_scope IS NULL OR NOT public._can_manage_sap_scope(v_scope) THEN
    RAISE EXCEPTION 'You cannot manage this VPN profile' USING ERRCODE = '42501';
  END IF;
  UPDATE sap_vpn_profiles SET archived = true, updated_at = now(), updated_by = auth.uid() WHERE id = p_id;
END $$;

-- Profiles of these sap_integration entries, without secrets (for the SAP setup screens).
CREATE OR REPLACE FUNCTION public.list_sap_vpn_profiles(p_scopes text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'scope_key', v.scope_key, 'name', v.name, 'vpn_type', v.vpn_type, 'gateway', v.gateway,
           'port', v.port, 'username', v.username, 'has_secret', v.secret <> '', 'has_config', v.config <> '',
           'trusted_cert', v.trusted_cert, 'realm', v.realm, 'options', v.options, 'updated_at', v.updated_at)
         ORDER BY v.name), '[]'::jsonb)
  FROM sap_vpn_profiles v
  WHERE NOT v.archived AND v.scope_key = ANY (p_scopes)
    AND auth.uid() IS NOT NULL
    AND (public._can_manage_sap_scope(v.scope_key) OR public._user_can_use_sap_scope(auth.uid(), v.scope_key));
$$;

-- Service role (ADT bridge): password + VPN profile of the SAP environment with this host /
-- SAP user / client that this platform user may use. NULL when there is none.
CREATE OR REPLACE FUNCTION public.sap_env_connection_for(p_user uuid, p_host text, p_username text, p_client text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_pw text; v_vpn jsonb;
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
    v_vpn := NULL;
    IF coalesce(r.env ->> 'vpn_profile_id', '') ~ '^[0-9a-fA-F-]{36}$' THEN
      SELECT jsonb_build_object('id', v.id, 'name', v.name, 'type', v.vpn_type, 'gateway', v.gateway, 'port', v.port,
                                'username', v.username, 'secret', v.secret, 'config', v.config,
                                'trusted_cert', v.trusted_cert, 'realm', v.realm, 'options', v.options,
                                'updated_at', v.updated_at)
        INTO v_vpn
      FROM sap_vpn_profiles v
      WHERE v.id = (r.env ->> 'vpn_profile_id')::uuid AND NOT v.archived
        AND public._user_can_use_sap_scope(p_user, v.scope_key);
    END IF;
    RETURN jsonb_build_object('scope', r.scope, 'env_id', coalesce(r.env ->> 'id', 'default'),
                              'password', v_pw, 'vpn', v_vpn);
  END LOOP;
  RETURN NULL;
END $$;

-- Service role: the same for the AI's SAP tools, through a 30-minute MCP ticket.
CREATE OR REPLACE FUNCTION public.sap_mcp_ticket_connection(p_ticket uuid, p_host text, p_username text, p_client text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t sap_mcp_tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM sap_mcp_tickets WHERE id = p_ticket AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF t.sap_host <> public._norm_sap_host(p_host) OR t.sap_username <> upper(coalesce(p_username, '')) THEN RETURN NULL; END IF;
  RETURN public.sap_env_connection_for(t.user_id, p_host, p_username, coalesce(nullif(p_client, ''), t.sap_client));
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['sap_env_connection_for(uuid, text, text, text)', 'sap_mcp_ticket_connection(uuid, text, text, text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['_can_manage_sap_scope(text)',
                           'save_sap_vpn_profile(uuid, text, text, text, text, integer, text, text, text, text, text, jsonb)',
                           'archive_sap_vpn_profile(uuid)', 'list_sap_vpn_profiles(text[])'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
