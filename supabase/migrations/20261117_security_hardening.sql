-- Security hardening (both projects; written to be idempotent and to work on either schema).
-- Nothing is dropped: existing policies stay, and new RESTRICTIVE policies (AND-ed with the
-- existing permissive ones) narrow access. Every new policy is named zz_sec_* so it can be
-- found, and switched off with ALTER POLICY ... USING (true) if one ever needs reverting.
--
--  1. Helpers: user_can_access_case / user_owns_project / user_involved_in_project_cases
--     (already in preproduction) and is_approved_user / case_is_public.
--  2. Row level security switched on for consultant_profiles, consultant_teams,
--     consultant_team_members (production: policies existed but RLS was off, so the tables
--     were open to anyone with the public key) and spec_generation_templates (no RLS, no
--     policies). Templates: read by logged-in users, written by admins/managers.
--  3. Accounts that are not approved yet get no data (except their own user/profile rows
--     and the sign-up settings).
--  4. Case content (specs, documents, activities, files, milestones, transports, time,
--     SLA, invoices, approval requests) only for people involved in the case (open Arena
--     cases are still listed, but their content isn't). case_files no longer readable
--     without logging in.
--  5. db_connections: consultants could read and change every connection (incl. VPN
--     passwords); now they only read those of clients/projects of their cases.
--  6. search_path fixed on the functions the advisor flagged.

-- ── 1. Helpers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.verification_status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_case(p_case uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR EXISTS (
        SELECT 1 FROM cases c
        WHERE c.id = p_case
          AND (c.client_id = auth.uid() OR c.created_by = auth.uid() OR c.manager_id = auth.uid()
               OR c.area_leader_id = auth.uid() OR c.head_hunter_id = auth.uid() OR c.reviewer_user_id = auth.uid()
               OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = auth.uid())
               OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = auth.uid())
               OR EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id
                          AND (p.client_id = auth.uid() OR p.created_by = auth.uid())))
      );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND (p.client_id = auth.uid() OR p.created_by = auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.user_involved_in_project_cases(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases c
    WHERE c.project_id = p_project
      AND (c.created_by = auth.uid() OR c.client_id = auth.uid() OR c.manager_id = auth.uid()
           OR c.area_leader_id = auth.uid() OR c.reviewer_user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = auth.uid())
           OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION public.case_is_public(p_case uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case AND c.is_public = true);
$$;

-- Project access: owners, people on its cases, staff.
CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR public.user_owns_project(p_project) OR public.user_involved_in_project_cases(p_project);
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['is_approved_user()', 'user_can_access_case(uuid)', 'user_owns_project(uuid)',
                           'user_involved_in_project_cases(uuid)', 'case_is_public(uuid)', 'user_can_access_project(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Create a policy only if one with that name doesn't exist yet.
CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(p_table text, p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_name) THEN
    EXECUTE p_sql;
  END IF;
END $$;

-- ── 2. Tables without row level security ────────────────────────────────────
ALTER TABLE IF EXISTS public.consultant_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultant_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultant_team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.spec_generation_templates ENABLE ROW LEVEL SECURITY;

SELECT pg_temp.ensure_policy('spec_generation_templates', 'zz_sec_templates_read',
  $p$CREATE POLICY zz_sec_templates_read ON public.spec_generation_templates FOR SELECT TO authenticated USING (true)$p$);
SELECT pg_temp.ensure_policy('spec_generation_templates', 'zz_sec_templates_staff_write',
  $p$CREATE POLICY zz_sec_templates_staff_write ON public.spec_generation_templates FOR ALL TO authenticated
     USING (get_my_role() IN ('admin', 'manager')) WITH CHECK (get_my_role() IN ('admin', 'manager'))$p$);
-- Admins/managers edit consultant profiles (ConsultantProfileView) as well as the owner.
SELECT pg_temp.ensure_policy('consultant_profiles', 'zz_sec_cprof_staff_write',
  $p$CREATE POLICY zz_sec_cprof_staff_write ON public.consultant_profiles FOR ALL TO authenticated
     USING (get_my_role() IN ('admin', 'manager')) WITH CHECK (get_my_role() IN ('admin', 'manager'))$p$);
SELECT pg_temp.ensure_policy('consultant_profiles', 'zz_sec_cprof_read',
  $p$CREATE POLICY zz_sec_cprof_read ON public.consultant_profiles FOR SELECT TO authenticated USING (true)$p$);

-- ── 3. Not-yet-approved accounts get no data ────────────────────────────────
DO $$
DECLARE r record; v_expr text;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT LIKE 'bb\_%' AND c.relname <> 'sap_action_tickets'
  LOOP
    v_expr := CASE r.relname
      WHEN 'users'               THEN '(select public.is_approved_user()) OR id = auth.uid()'
      WHEN 'consultant_profiles' THEN '(select public.is_approved_user()) OR id = auth.uid()'
      WHEN 'client_profiles'     THEN '(select public.is_approved_user()) OR id = auth.uid()'
      WHEN 'system_settings'     THEN '(select public.is_approved_user()) OR key = ANY (ARRAY[''signup_roles_visible'', ''signup_flow_per_role'', ''role_permissions'', ''auto_approve_domains'', ''platform_name'', ''platform_tagline'', ''brand_logo_url''])'
      ELSE '(select public.is_approved_user())'
    END;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.relname AND policyname = 'zz_sec_approved_only') THEN
      EXECUTE format('CREATE POLICY zz_sec_approved_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                     r.relname, v_expr, v_expr);
    END IF;
  END LOOP;
END $$;

-- ── 4. Case content only for people involved in the case ────────────────────
DO $$
DECLARE t text; v_read text; v_write text;
BEGIN
  FOREACH t IN ARRAY ARRAY['case_specifications', 'case_documents', 'case_activities', 'case_files',
                           'case_milestones', 'time_entries', 'sla_tracking', 'case_comments'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    -- Specs, documents, files etc. only for people on the case. Open (Arena) cases are
    -- still listed (cases table), but their content is not shown to everyone.
    v_read  := '(case_id IS NULL OR public.user_can_access_case(case_id))';
    v_write := '(case_id IS NULL OR public.user_can_access_case(case_id))';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'zz_sec_case_read') THEN
      EXECUTE format('CREATE POLICY zz_sec_case_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING %s', t, v_read);
      EXECUTE format('CREATE POLICY zz_sec_case_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK %s', t, v_write);
      EXECUTE format('CREATE POLICY zz_sec_case_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING %s WITH CHECK %s', t, v_write, v_write);
      EXECUTE format('CREATE POLICY zz_sec_case_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING %s', t, v_write);
    END IF;
  END LOOP;
END $$;

-- case_files: was readable by anyone, even without logging in.
SELECT pg_temp.ensure_policy('case_files', 'zz_sec_no_anon',
  $p$CREATE POLICY zz_sec_no_anon ON public.case_files AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)$p$);

-- Transport requests: case members, or project members for project-level requests.
SELECT pg_temp.ensure_policy('case_transport_requests', 'zz_sec_scope',
  $p$CREATE POLICY zz_sec_scope ON public.case_transport_requests AS RESTRICTIVE FOR ALL TO authenticated
     USING (CASE WHEN case_id IS NOT NULL THEN public.user_can_access_case(case_id)
                 WHEN project_id IS NOT NULL THEN public.user_can_access_project(project_id) ELSE true END)
     WITH CHECK (CASE WHEN case_id IS NOT NULL THEN public.user_can_access_case(case_id)
                      WHEN project_id IS NOT NULL THEN public.user_can_access_project(project_id) ELSE true END)$p$);

-- Approval requests (blueprint review links): case members and the named reviewer.
SELECT pg_temp.ensure_policy('approval_requests', 'zz_sec_scope',
  $p$CREATE POLICY zz_sec_scope ON public.approval_requests AS RESTRICTIVE FOR ALL TO authenticated
     USING (reviewer_user_id = auth.uid() OR public.user_can_access_case(case_id))
     WITH CHECK (reviewer_user_id = auth.uid() OR public.user_can_access_case(case_id))$p$);

-- Invoices: staff, the issuer, the client, the consultant, or people on the case.
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'issued_by')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'zz_sec_scope') THEN
    EXECUTE $p$CREATE POLICY zz_sec_scope ON public.invoices AS RESTRICTIVE FOR ALL TO authenticated
      USING (get_my_role() IN ('admin', 'manager') OR issued_by = auth.uid() OR client_id = auth.uid()
             OR consultant_id = auth.uid() OR (case_id IS NOT NULL AND public.user_can_access_case(case_id)))
      WITH CHECK (get_my_role() IN ('admin', 'manager') OR issued_by = auth.uid())$p$;
  END IF;
END $$;

-- ── 5. db_connections ──────────────────────────────────────────────────────
SELECT pg_temp.ensure_policy('db_connections', 'zz_sec_scope',
  $p$CREATE POLICY zz_sec_scope ON public.db_connections AS RESTRICTIVE FOR SELECT TO authenticated
     USING (get_my_role() IN ('admin', 'manager') OR client_id = auth.uid()
            OR (project_id IS NOT NULL AND public.user_can_access_project(project_id))
            OR (client_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.client_id = db_connections.client_id
                                                  AND public.user_can_access_case(c.id))))$p$);
SELECT pg_temp.ensure_policy('db_connections', 'zz_sec_write',
  $p$CREATE POLICY zz_sec_write ON public.db_connections AS RESTRICTIVE FOR INSERT TO authenticated
     WITH CHECK (get_my_role() IN ('admin', 'manager') OR client_id = auth.uid()
                 OR (project_id IS NOT NULL AND public.user_owns_project(project_id)))$p$);
SELECT pg_temp.ensure_policy('db_connections', 'zz_sec_update',
  $p$CREATE POLICY zz_sec_update ON public.db_connections AS RESTRICTIVE FOR UPDATE TO authenticated
     USING (get_my_role() IN ('admin', 'manager') OR client_id = auth.uid()
            OR (project_id IS NOT NULL AND public.user_owns_project(project_id)))$p$);
SELECT pg_temp.ensure_policy('db_connections', 'zz_sec_delete',
  $p$CREATE POLICY zz_sec_delete ON public.db_connections AS RESTRICTIVE FOR DELETE TO authenticated
     USING (get_my_role() IN ('admin', 'manager') OR client_id = auth.uid()
            OR (project_id IS NOT NULL AND public.user_owns_project(project_id)))$p$);
-- Project owners manage their project's connections (useCoreHooks).
SELECT pg_temp.ensure_policy('db_connections', 'zz_sec_project_owner',
  $p$CREATE POLICY zz_sec_project_owner ON public.db_connections FOR ALL TO authenticated
     USING (project_id IS NOT NULL AND public.user_owns_project(project_id))
     WITH CHECK (project_id IS NOT NULL AND public.user_owns_project(project_id))$p$);

-- ── 6. Function search_path ─────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('update_updated_at_column', 'set_updated_at', 'handle_updated_at', '_is_team_member',
                        '_is_team_owner', '_tmp_req_headers', 'vm_tunnel_registry_touch', 'get_my_role')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
