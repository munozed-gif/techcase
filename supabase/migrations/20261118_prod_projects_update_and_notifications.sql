-- Production (ArenaSolPlatf) alignment with preproduction; already applied there.
-- 1. The project creator and project managers can update the project. Before, only the client
--    and admins/managers could, so a consultant's create-project wizard failed at its second
--    step ("Cannot coerce the result to a single JSON object").
ALTER POLICY projects_update ON public.projects
  USING (
    client_id = auth.uid()
    OR created_by = auth.uid()
    OR coalesce(get_my_role(), '') IN ('admin', 'manager', 'project_manager')
  );

-- 2. Approved users can create notifications for other users (the app notifies managers,
--    inviters, reviewers…). Reading/changing stays limited to the recipient.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'zz_sec_notify_others') THEN
    CREATE POLICY zz_sec_notify_others ON public.notifications FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;
