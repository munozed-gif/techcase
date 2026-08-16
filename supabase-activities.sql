-- ============================================================
-- TechCase — Case Activities & Activity-linked Time Entries
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Case activities table
CREATE TABLE IF NOT EXISTS case_activities (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task_no         INTEGER NOT NULL DEFAULT 1,
  title           TEXT NOT NULL,
  description     TEXT,
  detail          TEXT,
  est_hours       NUMERIC(7,2) DEFAULT 0,
  start_date_plan DATE,
  end_date_plan   DATE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','blocked')),
  progress_pct    INTEGER NOT NULL DEFAULT 0
                    CHECK (progress_pct BETWEEN 0 AND 100),
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS case_activities_case_id_idx ON case_activities(case_id);

-- 2. Link time entries to activities (optional — existing rows stay NULL)
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES case_activities(id) ON DELETE SET NULL;

-- 3. Customer-level setting: whether to show/use the activities feature
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS activities_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Enable Row Level Security (mirrors pattern used by other tables)
ALTER TABLE case_activities ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read activities for cases they can see.
-- Adjust this policy to match your existing RLS strategy on the `cases` table.
CREATE POLICY "Authenticated users can read case activities"
  ON case_activities FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert case activities"
  ON case_activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update case activities"
  ON case_activities FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete case activities"
  ON case_activities FOR DELETE
  USING (auth.role() = 'authenticated');
