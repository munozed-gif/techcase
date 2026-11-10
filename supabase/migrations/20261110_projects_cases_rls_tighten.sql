-- ArenaSolPlatf: stop every logged-in user from reading (and every client from
-- writing) all projects and cases.
--
-- Before: projects_read_auth / cases_read_auth let any authenticated user read
-- every row, and projects_write_staff / cases_write_staff gave every client
-- (and headhunter, for cases) full access to all rows. Permissive policies are
-- OR-ed, so the narrower projects_select never took effect.
--
-- After:
--   projects visible to: admin, manager, project_manager; the project's client
--     or creator; anyone involved in one of its cases (creator, client,
--     manager, area leader, reviewer, assigned consultant, key user).
--   cases visible to: public (open) cases for any logged-in user; the case's
--     client, creator, manager, area leader, headhunter, reviewer; assigned
--     consultants; key users; owners of the case's project; admin, manager,
--     project_manager, dispatch.
--   full write on all rows: admin and manager only. Clients/headhunters write
--     only their own cases; project update/delete rules are unchanged.
--
-- Existing policies are changed with ALTER POLICY rather than dropped:
-- cases_read_auth becomes cases_select, and projects_read_auth is switched off
-- (USING false) and renamed projects_read_auth_disabled.
--
-- Cross-table checks go through SECURITY DEFINER helpers so the cases and
-- projects policies don't query each other under RLS (that recursion is what
-- broke anon /join reads in the other project).

CREATE OR REPLACE FUNCTION public.user_involved_in_project_cases(p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases c
    WHERE c.project_id = p_project
      AND (c.created_by = auth.uid() OR c.client_id = auth.uid() OR c.manager_id = auth.uid()
           OR c.area_leader_id = auth.uid() OR c.reviewer_user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = auth.uid())
           OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_project(p_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project AND (p.client_id = auth.uid() OR p.created_by = auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_involved_in_project_cases(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_involved_in_project_cases(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_project(uuid) TO authenticated;

-- ── projects ────────────────────────────────────────────────────────────
ALTER POLICY projects_read_auth ON public.projects RENAME TO projects_read_auth_disabled;
ALTER POLICY projects_read_auth_disabled ON public.projects USING (false);

ALTER POLICY projects_select ON public.projects
  TO authenticated
  USING (
    get_my_role() IN ('admin', 'manager', 'project_manager')
    OR client_id = auth.uid()
    OR created_by = auth.uid()
    OR public.user_involved_in_project_cases(id)
  );

ALTER POLICY projects_write_staff ON public.projects
  TO authenticated
  USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── cases ───────────────────────────────────────────────────────────────
ALTER POLICY cases_read_auth ON public.cases RENAME TO cases_select;
ALTER POLICY cases_select ON public.cases
  TO authenticated
  USING (
    is_public = true
    OR client_id = auth.uid()
    OR created_by = auth.uid()
    OR manager_id = auth.uid()
    OR area_leader_id = auth.uid()
    OR head_hunter_id = auth.uid()
    OR reviewer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = cases.id AND ca.consultant_id = auth.uid())
    OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = cases.id AND k.user_id = auth.uid())
    OR (project_id IS NOT NULL AND public.user_owns_project(project_id))
    OR get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
  );

ALTER POLICY cases_write_staff ON public.cases
  TO authenticated
  USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

CREATE POLICY cases_client_own ON public.cases
  FOR ALL TO authenticated
  USING (get_my_role() IN ('client', 'headhunter')
         AND (client_id = auth.uid() OR created_by = auth.uid() OR head_hunter_id = auth.uid()))
  WITH CHECK (get_my_role() IN ('client', 'headhunter')
              AND (client_id = auth.uid() OR created_by = auth.uid() OR head_hunter_id = auth.uid()));
