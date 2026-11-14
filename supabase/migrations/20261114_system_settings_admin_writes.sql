-- system_settings holds platform configuration, including SAP connection credentials,
-- SMTP/email config, Stripe price IDs, plans and role permissions. Until now any logged-in
-- user (ArenaSolPlatf: ss_write_auth) - or anyone at all (Phoenix: admin_access, TO public,
-- true) - could change any of it.
--
-- New rule: only admins and managers change settings, except the per-case / per-entity
-- working keys that the case screens save while consultants, clients and key users work
-- (SAP implementation canvas and logs, case transport/package, visibility, invitations,
-- project docs, and the Restart VM / Restart Bridge requests).
-- Policies are altered in place (not dropped).

CREATE OR REPLACE FUNCTION public.can_write_system_setting(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    coalesce(public.get_my_role(), '') IN ('admin', 'manager')
    OR p_key = ANY (ARRAY[
      'sap_blueprint', 'sap_impl_log', 'sap_impl_runs', 'sap_impl_feedback',
      'sap_impl_transport', 'sap_impl_package', 'sap_impl_setup', 'sap_impl_specs',
      'sap_activity_objects', 'sap_case_env', 'sap_case_conn', 'abap_standards_case',
      'case_invitations', 'case_visibility', 'company_visibility',
      'case_sap_live_check', 'case_additional_ctx',
      'transport_approvals', 'bcset_packages', 'project_docs',
      'vm_restart_requested', 'adt_bridge_restart_requested'
    ])
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_system_setting(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_system_setting(text) TO authenticated;

DO $$
BEGIN
  -- ArenaSolPlatf: writes were open to every logged-in user.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'ss_write_auth') THEN
    EXECUTE 'ALTER POLICY ss_write_auth ON public.system_settings TO authenticated
               USING (public.can_write_system_setting(key))
               WITH CHECK (public.can_write_system_setting(key))';
  END IF;

  -- Phoenix: a single policy open to everyone (even logged out) for read and write.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'admin_access') THEN
    EXECUTE 'ALTER POLICY admin_access ON public.system_settings TO authenticated
               USING (public.can_write_system_setting(key))
               WITH CHECK (public.can_write_system_setting(key))';
    -- admin_access also granted reads; keep reads for logged-in users ...
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'ss_read_auth') THEN
      EXECUTE 'CREATE POLICY ss_read_auth ON public.system_settings FOR SELECT TO authenticated USING (true)';
    END IF;
    -- ... and the public settings the sign-up / login screens read before login.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'anon can read auth settings') THEN
      EXECUTE $p$CREATE POLICY "anon can read auth settings" ON public.system_settings FOR SELECT TO anon
               USING (key = ANY (ARRAY['signup_roles_visible', 'signup_flow_per_role', 'role_permissions',
                                       'auto_approve_domains', 'platform_name', 'platform_tagline', 'brand_logo_url']))$p$;
    END IF;
  END IF;
END $$;
