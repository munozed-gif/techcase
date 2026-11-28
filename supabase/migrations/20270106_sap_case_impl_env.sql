-- The SAP Implementation tab has its own environment per case (sap_case_impl_env), separate from the
-- one the Spec tab checks against (sap_case_env). Consultants can save it, like sap_case_env.
CREATE OR REPLACE FUNCTION public.can_write_system_setting(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    coalesce(public.get_my_role(), '') IN ('admin', 'manager')
    OR p_key = ANY (ARRAY[
      'sap_blueprint', 'sap_impl_log', 'sap_impl_runs', 'sap_impl_feedback',
      'sap_impl_transport', 'sap_impl_package', 'sap_impl_setup', 'sap_impl_specs',
      'sap_activity_objects', 'sap_case_env', 'sap_case_impl_env', 'sap_case_conn', 'abap_standards_case',
      'case_invitations', 'case_visibility', 'company_visibility',
      'case_sap_live_check', 'case_additional_ctx',
      'transport_approvals', 'bcset_packages', 'project_docs',
      'vm_restart_requested', 'adt_bridge_restart_requested'
    ])
  )
$function$;
