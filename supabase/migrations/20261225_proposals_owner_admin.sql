-- Proposals and Service tabs: admins (manage_proposals), the project's owner (manage_own_project_proposals
-- on projects they created), the project's approved seller and the partner OWNER (no longer partner admins).
CREATE OR REPLACE FUNCTION public.can_manage_proposals(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    coalesce(public.get_my_role(), '') = 'admin'
    OR public.role_permission('manage_proposals', '{"admin":true}'::jsonb)
    OR (EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.created_by = auth.uid())
        AND public.role_permission('manage_own_project_proposals',
              '{"admin":true,"manager":true,"client":true,"project_manager":true}'::jsonb))
    OR (public.is_project_seller(p_project) AND public.is_approved_seller())
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project AND p.partner_id IS NOT NULL
        AND public.is_partner_member(p.partner_id, ARRAY['owner'])
        AND coalesce((public.partner_limits(p.partner_id) ->> 'proposals')::boolean, true)
    ));
$$;

-- "Any project" is for admins only: managers off (can be switched back in Settings → Roles).
UPDATE system_settings SET value = jsonb_set(value, '{manage_proposals,manager}', 'false'::jsonb)
WHERE key = 'role_permissions' AND value ? 'manage_proposals';
