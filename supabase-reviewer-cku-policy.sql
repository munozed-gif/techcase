-- ============================================================
-- Allow consultants to write to case_key_users
-- (needed so they can assign a reviewer from the blueprint canvas)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop the old staff-only write policy and replace it with one
-- that also allows consultants (they manage the blueprint).
DROP POLICY IF EXISTS "cku_write_staff" ON public.case_key_users;

CREATE POLICY "cku_write_staff" ON public.case_key_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'client', 'consultant')
    )
  );
