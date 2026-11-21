-- Who may use a project's Proposals tab is set in Settings → Roles (system_settings.role_permissions):
--   manage_proposals              → any project          (default: admin, manager)
--   manage_own_project_proposals  → projects they created (default: admin, manager, client, project_manager)
-- Partner owners/admins keep access to their partner's projects when the partner plan includes proposals.
-- Admin always has access. Defaults mirror ROLE_PERMISSIONS_DEFAULTS in src/lib/constants.js.
-- No DROP / DELETE.

CREATE OR REPLACE FUNCTION public.role_permission(p_cap text, p_defaults jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    ((p_defaults || coalesce((SELECT value -> p_cap FROM system_settings WHERE key = 'role_permissions'), '{}'::jsonb))
      ->> coalesce(public.get_my_role(), ''))::boolean,
    false);
$$;
REVOKE ALL ON FUNCTION public.role_permission(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.role_permission(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_proposals(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    coalesce(public.get_my_role(), '') = 'admin'
    OR public.role_permission('manage_proposals', '{"admin":true,"manager":true}'::jsonb)
    OR (EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.created_by = auth.uid())
        AND public.role_permission('manage_own_project_proposals',
              '{"admin":true,"manager":true,"client":true,"project_manager":true}'::jsonb))
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project AND p.partner_id IS NOT NULL
        AND public.is_partner_member(p.partner_id, ARRAY['owner','admin'])
        AND coalesce((public.partner_limits(p.partner_id) ->> 'proposals')::boolean, true)
    ));
$$;
