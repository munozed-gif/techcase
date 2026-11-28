-- The database follows the role matrix (Settings → Roles) instead of fixed role lists.
-- has_capability(cap): admin always; otherwise the stored matrix (system_settings.role_permissions),
-- and when a role has no stored value, the app defaults (role_permission_defaults(), the same values as
-- ROLE_PERMISSIONS_DEFAULTS in src/lib/constants.js — keep both in sync). The defaults reproduce the
-- previous fixed lists, so nothing changes until an administrator edits the matrix.
-- Existing policies are changed in place (none is removed).

CREATE OR REPLACE FUNCTION public.role_permission_defaults()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"create_cases":{"admin":true,"manager":true,"client":true,"key_user":true,"internal_consultant":true,"project_manager":true},"view_all_cases":{"admin":true,"manager":true,"project_manager":true},"approve_specs":{"admin":true,"manager":true,"project_manager":true},"regen_specs":{"admin":true,"manager":true},"upload_docs":{"admin":true,"manager":true,"consultant":true,"internal_consultant":true,"project_manager":true},"delete_docs":{"admin":true,"manager":true},"delete_own_docs":{"admin":true,"manager":true},"view_docs":{"admin":true,"manager":true,"consultant":true,"client":true,"key_user":true,"final_user":true,"internal_consultant":true,"project_manager":true},"add_activities":{"admin":true,"manager":true,"consultant":true,"internal_consultant":true,"project_manager":true},"log_time":{"admin":true,"manager":true,"consultant":true,"internal_consultant":true},"apply_to_cases":{"consultant":true,"headhunter":true},"view_reports":{"admin":true,"manager":true,"client":true,"project_manager":true},"manage_invoices":{"admin":true,"manager":true,"client":true},"view_lifecycle":{"admin":true,"manager":true,"consultant":true,"client":true,"final_user":true,"internal_consultant":true,"project_manager":true},"submit_specs":{"admin":true,"manager":true,"consultant":true,"client":true,"key_user":true,"internal_consultant":true,"project_manager":true},"generate_dev_plan":{"admin":true,"manager":true,"consultant":true},"require_team_signup":{"key_user":true,"final_user":true,"internal_consultant":true,"project_manager":true},"edit_activity_phase":{"admin":true,"manager":true,"consultant":true,"internal_consultant":true,"project_manager":true},"edit_activity_predecessors":{"admin":true,"manager":true,"consultant":true,"internal_consultant":true,"project_manager":true},"bulk_delete_activities":{"admin":true,"manager":true},"bulk_delete_subcases":{"admin":true,"manager":true},"arena_see_all_cases":{"admin":true,"manager":true,"consultant":true,"headhunter":true,"internal_consultant":true,"project_manager":true},"create_projects":{"admin":true,"manager":true,"client":true,"project_manager":true},"view_audit_log":{"admin":true,"manager":true},"reopen_cases":{"admin":true,"manager":true,"project_manager":true},"edit_lifecycle":{"admin":true,"manager":true,"project_manager":true},"export_pdf_docs":{"admin":true,"manager":true,"consultant":true,"client":true,"key_user":true,"internal_consultant":true,"project_manager":true},"manage_proposals":{"admin":true},"manage_own_project_proposals":{"admin":true,"manager":true,"client":true,"project_manager":true,"area_leader":true},"upload_project_docs":{"admin":true,"manager":true,"project_manager":true},"run_sap_implementation":{"admin":true,"manager":true,"consultant":true},"edit_sap_setup":{"admin":true,"manager":true},"release_transports":{"admin":true,"manager":true,"consultant":true},"confirm_transport_imports":{"admin":true,"manager":true,"project_manager":true},"approve_asbuilt_spec":{"admin":true,"manager":true,"project_manager":true},"add_subcases":{"admin":true,"manager":true,"client":true},"view_case_costs":{"admin":true,"manager":true},"change_case_sap_env":{"admin":true,"manager":true},"invite_case_client":{"admin":true,"manager":true,"consultant":true},"manage_case_consultants":{"admin":true,"manager":true},"save_as_template":{"admin":true,"manager":true},"manage_milestones":{"admin":true,"manager":true,"consultant":true},"post_internal_comments":{"admin":true,"manager":true},"approve_time":{"admin":true,"manager":true},"delete_time_entries":{"admin":true,"manager":true},"bulk_edit_cases":{"admin":true,"manager":true},"move_kanban_cards":{"admin":true,"manager":true},"manage_sla":{"admin":true,"manager":true},"manage_db_connections":{"admin":true,"manager":true},"manage_team_members":{"admin":true,"manager":true},"manage_migrations":{"admin":true,"manager":true}}'::jsonb
$$;

CREATE OR REPLACE FUNCTION public.has_capability(p_cap text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_row jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  SELECT value -> p_cap INTO v_row FROM system_settings WHERE key = 'role_permissions';
  RETURN coalesce((v_row ->> v_role)::boolean, (role_permission_defaults() -> p_cap ->> v_role)::boolean, false);
END $$;
REVOKE ALL ON FUNCTION public.has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated;

-- Runs an ALTER POLICY only where the policy exists (preprod and prod differ).
CREATE OR REPLACE FUNCTION public._alter_policy_if_exists(p_table text, p_policy text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_policy) THEN
    EXECUTE p_sql;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public._alter_policy_if_exists(text, text, text) FROM PUBLIC, anon, authenticated;

-- Activities and milestones of a case.
SELECT public._alter_policy_if_exists('case_activities', 'cact_write_staff', $q$ALTER POLICY cact_write_staff ON public.case_activities USING (public.has_capability('add_activities'))$q$);
SELECT public._alter_policy_if_exists('case_milestones', 'cm_write_staff', $q$ALTER POLICY cm_write_staff   ON public.case_milestones USING (public.has_capability('manage_milestones'))$q$);

-- Case documents and files: the uploader, or a role with "delete documents".
SELECT public._alter_policy_if_exists('case_documents', 'cdoc_delete_own', $q$ALTER POLICY cdoc_delete_own ON public.case_documents USING (uploaded_by = auth.uid() OR public.has_capability('delete_docs'))$q$);
SELECT public._alter_policy_if_exists('case_files', 'cf_delete_own', $q$ALTER POLICY cf_delete_own   ON public.case_files     USING (user_id = auth.uid() OR public.has_capability('delete_docs'))$q$);

-- Time: approve (update others' entries) and delete.
SELECT public._alter_policy_if_exists('time_entries', 'te_update_staff', $q$ALTER POLICY te_update_staff ON public.time_entries
  USING (consultant_id = auth.uid() OR public.has_capability('approve_time'))
  WITH CHECK (public.has_capability('approve_time') OR (consultant_id = auth.uid() AND is_approved IS NOT TRUE AND approved_by IS NULL))$q$);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'te_delete_cap') THEN
    CREATE POLICY te_delete_cap ON public.time_entries FOR DELETE TO authenticated USING (public.has_capability('delete_time_entries'));
  END IF;
END $$;
SELECT public._alter_policy_if_exists('time_logs', 'Auth users manage time_logs', $q$ALTER POLICY "Auth users manage time_logs" ON public.time_logs
  USING (auth.uid() = user_id OR public.has_capability('approve_time') OR public.has_capability('delete_time_entries'))$q$);

-- Consultants of a case (release, add co-consultant).
SELECT public._alter_policy_if_exists('case_assignments', 'ca_write_staff', $q$ALTER POLICY ca_write_staff ON public.case_assignments USING (public.has_capability('manage_case_consultants'))$q$);

-- Templates (save a case / project as template).
SELECT public._alter_policy_if_exists('case_templates', 'ct_write_admin', $q$ALTER POLICY ct_write_admin ON public.case_templates    USING (public.has_capability('save_as_template')) WITH CHECK (public.has_capability('save_as_template'))$q$);
SELECT public._alter_policy_if_exists('project_templates', 'pt_write_staff', $q$ALTER POLICY pt_write_staff ON public.project_templates USING (public.has_capability('save_as_template'))$q$);

-- SLA.
SELECT public._alter_policy_if_exists('sla_configs', 'sla_write_staff', $q$ALTER POLICY sla_write_staff ON public.sla_configs  USING (coalesce(public.get_my_role(), '') = 'client' OR public.has_capability('manage_sla'))$q$);
SELECT public._alter_policy_if_exists('sla_configs', 'staff_read_sla', $q$ALTER POLICY staff_read_sla  ON public.sla_configs  USING (public.has_capability('manage_sla'))$q$);
SELECT public._alter_policy_if_exists('sla_profiles', 'Admins manage sla_profiles', $q$ALTER POLICY "Admins manage sla_profiles" ON public.sla_profiles USING (public.has_capability('manage_sla'))$q$);

-- Database connections (the client and project owners keep their own access).
SELECT public._alter_policy_if_exists('db_connections', 'dbc_read_staff', $q$ALTER POLICY dbc_read_staff         ON public.db_connections USING (client_id = auth.uid() OR public.has_capability('manage_db_connections'))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'dbc_write_staff', $q$ALTER POLICY dbc_write_staff        ON public.db_connections USING (client_id = auth.uid() OR public.has_capability('manage_db_connections'))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'staff_read_connections', $q$ALTER POLICY staff_read_connections ON public.db_connections USING (public.has_capability('manage_db_connections'))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'zz_sec_delete', $q$ALTER POLICY zz_sec_delete ON public.db_connections
  USING (public.has_capability('manage_db_connections') OR client_id = auth.uid() OR (project_id IS NOT NULL AND user_owns_project(project_id)))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'zz_sec_update', $q$ALTER POLICY zz_sec_update ON public.db_connections
  USING (public.has_capability('manage_db_connections') OR client_id = auth.uid() OR (project_id IS NOT NULL AND user_owns_project(project_id)))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'zz_sec_write', $q$ALTER POLICY zz_sec_write ON public.db_connections
  WITH CHECK (public.has_capability('manage_db_connections') OR client_id = auth.uid() OR (project_id IS NOT NULL AND user_owns_project(project_id)))$q$);
SELECT public._alter_policy_if_exists('db_connections', 'zz_sec_scope', $q$ALTER POLICY zz_sec_scope ON public.db_connections
  USING (public.has_capability('manage_db_connections') OR client_id = auth.uid()
         OR (project_id IS NOT NULL AND user_can_access_project(project_id))
         OR (client_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.client_id = db_connections.client_id AND user_can_access_case(c.id))))$q$);

-- Customer team members (the client keeps managing its own team).
SELECT public._alter_policy_if_exists('client_team_members', 'ctm_client_manage', $q$ALTER POLICY ctm_client_manage ON public.client_team_members USING (auth.uid() = client_id OR public.has_capability('manage_team_members'))$q$);
SELECT public._alter_policy_if_exists('client_team_members', 'staff_read_team', $q$ALTER POLICY staff_read_team   ON public.client_team_members USING (public.has_capability('manage_team_members'))$q$);

-- Audit log.
SELECT public._alter_policy_if_exists('audit_logs', 'ae_read_admin', $q$ALTER POLICY ae_read_admin            ON public.audit_logs USING (public.has_capability('view_audit_log'))$q$);
SELECT public._alter_policy_if_exists('audit_logs', 'Admins read audit_logs', $q$ALTER POLICY "Admins read audit_logs" ON public.audit_logs USING (public.has_capability('view_audit_log'))$q$);

-- Bulk status change and Kanban moves: update cases the user can open.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cases' AND policyname = 'cases_update_cap') THEN
    CREATE POLICY cases_update_cap ON public.cases FOR UPDATE TO authenticated
      USING ((public.has_capability('bulk_edit_cases') OR public.has_capability('move_kanban_cards')) AND user_can_access_case(id))
      WITH CHECK ((public.has_capability('bulk_edit_cases') OR public.has_capability('move_kanban_cards')) AND user_can_access_case(id));
  END IF;
END $$;
