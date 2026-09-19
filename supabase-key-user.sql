-- ============================================================
-- TechCase — key_user role support
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add key_user_id column to cases
--    Links a registered key_user account to the case they were pre-registered on.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS key_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cases_key_user_id_idx ON cases(key_user_id);

-- 2. Backfill: only runs if the old key_user_email column exists (dev→prod migration safety)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cases' AND column_name = 'key_user_email'
  ) THEN
    UPDATE cases c
    SET key_user_id = u.id
    FROM users u
    WHERE u.email = c.key_user_email
      AND u.role = 'key_user'
      AND c.key_user_id IS NULL;
  END IF;
END $$;

-- 3. (Optional) RLS policy — key users can read cases they are linked to.
--    Skip if you manage all access client-side.
-- CREATE POLICY "key_users_read_own_cases" ON cases
--   FOR SELECT USING (key_user_id = auth.uid());
