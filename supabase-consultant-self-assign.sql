-- Allow consultants to self-assign to cases they created.
-- The existing ca_write_staff policy only covers admin/manager, so this
-- adds a targeted INSERT policy so the creator auto-assignment in
-- useCaseHooks.js createCase() succeeds instead of silently failing.

CREATE POLICY "consultant_can_self_assign"
  ON public.case_assignments FOR INSERT
  WITH CHECK (
    consultant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.cases
      WHERE id = case_id
        AND created_by = auth.uid()
    )
  );
