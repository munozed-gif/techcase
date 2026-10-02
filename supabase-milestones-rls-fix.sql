-- Fix cm_write_staff to use get_my_role() instead of querying public.users directly.
-- The original policy's subquery on public.users can fail when the users table's
-- own RLS policies have not been fully migrated (recursion risk from users_admin_all).
-- Requires supabase-rls-fix-users-recursion.sql to have been applied first.

DROP POLICY IF EXISTS "cm_write_staff" ON public.case_milestones;

CREATE POLICY "cm_write_staff" ON public.case_milestones FOR ALL
  USING (public.get_my_role() IN ('admin', 'manager', 'consultant', 'internal_consultant', 'project_manager'));
