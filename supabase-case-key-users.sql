-- ============================================================
-- TechCase — case_key_users junction table (many-to-many)
-- Replaces the single cases.key_user_id column so multiple
-- key users can collaborate on the same case.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create the junction table
CREATE TABLE IF NOT EXISTS case_key_users (
  case_id    uuid NOT NULL REFERENCES cases(id)  ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

CREATE INDEX IF NOT EXISTS case_key_users_user_id_idx ON case_key_users(user_id);

-- 2. Migrate existing single key_user_id data into the new table
INSERT INTO case_key_users (case_id, user_id)
SELECT id, key_user_id
FROM cases
WHERE key_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Drop the old single-value column (no longer needed)
ALTER TABLE cases DROP COLUMN IF EXISTS key_user_id;
