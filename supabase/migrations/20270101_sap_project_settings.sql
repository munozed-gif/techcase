-- A project's SAP choices (default environment, assigned environments, per-project overrides) were
-- written straight into system_settings, which only admins / managers may write: a project owner who
-- may manage the project's SAP setup (e.g. an area leader) got a silent 403 on "Set default".
-- This RPC writes one project's entry with the same rule as the SAP environments themselves
-- (_can_manage_sap_scope('proj_<id>')), merged in the database so other projects are untouched.
CREATE OR REPLACE FUNCTION public.set_sap_project_setting(p_key text, p_project uuid, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_key NOT IN ('sap_project_env', 'sap_project_envs', 'sap_project_env_overrides',
                   'sap_project_live_check', 'sap_project_allow_case_override') THEN
    RAISE EXCEPTION 'Unknown project SAP setting %', p_key USING ERRCODE = '22023';
  END IF;
  IF p_project IS NULL OR NOT (coalesce(public.get_my_role(), '') IN ('admin', 'manager')
                               OR public._can_manage_sap_scope('proj_' || p_project::text)) THEN
    RAISE EXCEPTION 'You cannot change the SAP setup of this project' USING ERRCODE = '42501';
  END IF;
  INSERT INTO system_settings (key, value) VALUES (p_key, jsonb_build_object(p_project::text, p_value))
  ON CONFLICT (key) DO UPDATE SET value =
    CASE WHEN p_value IS NULL OR p_value = 'null'::jsonb
         THEN (CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END) - p_project::text
         ELSE (CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END) || jsonb_build_object(p_project::text, p_value)
    END;
END $$;
REVOKE ALL ON FUNCTION public.set_sap_project_setting(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sap_project_setting(text, uuid, jsonb) TO authenticated;
