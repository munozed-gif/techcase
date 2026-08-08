-- ============================================================
-- TechCase — key_user role support
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add key_user_id column to cases
--    Links a registered key_user account to the case they were pre-registered on.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS key_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cases_key_user_id_idx ON cases(key_user_id);

-- 2. Backfill: if any key_user accounts already exist in users table,
--    link them to matching cases immediately.
UPDATE cases c
SET key_user_id = u.id
FROM users u
WHERE u.email = c.key_user_email
  AND u.role = 'key_user'
  AND c.key_user_id IS NULL;

-- 3. (Optional) RLS policy — key users can read cases they are linked to.
--    Skip if you manage all access client-side.
-- CREATE POLICY "key_users_read_own_cases" ON cases
--   FOR SELECT USING (key_user_id = auth.uid());
