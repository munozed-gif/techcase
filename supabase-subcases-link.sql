-- ============================================================
-- TechCase — Sub-case Activities Link
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Ensure parent_case_id exists on cases (self-referencing FK)
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS parent_case_id UUID REFERENCES cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cases_parent_case_id_idx ON cases(parent_case_id);

-- 2. Add activity_type to case_activities
--    'task'     = regular task (default, existing rows)
--    'sub_case' = backed by a real case
ALTER TABLE case_activities
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'task'
    CHECK (activity_type IN ('task', 'sub_case'));

-- 3. Add linked_case_id — the sub-case backing this activity row
ALTER TABLE case_activities
  ADD COLUMN IF NOT EXISTS linked_case_id UUID REFERENCES cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS case_activities_linked_case_id_idx ON case_activities(linked_case_id);
