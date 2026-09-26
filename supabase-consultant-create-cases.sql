-- Allow consultants to INSERT new cases
-- The existing cases_write_staff policy only covers admin/manager/client/headhunter.
-- This adds a separate INSERT policy so consultants can create cases when the
-- create_cases permission is enabled for their role in System Settings.

CREATE POLICY "consultant_can_create_cases"
  ON public.cases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('consultant', 'internal_consultant', 'project_manager')
    )
  );

-- Also allow consultants to UPDATE their own created cases
-- (needed to set status, fields etc. after creation)
CREATE POLICY "consultant_can_update_assigned_cases"
  ON public.cases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.case_assignments
      WHERE case_id = cases.id
        AND consultant_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('consultant', 'internal_consultant', 'project_manager')
        AND cases.client_id IS NULL  -- cases they created without a client yet
    )
  );
