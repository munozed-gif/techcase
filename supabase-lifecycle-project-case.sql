-- ============================================================
-- TechCase — Case Lifecycle on Projects & Cases
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Allow project-level lifecycle override
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS case_lifecycle jsonb;

-- Allow case-level lifecycle override
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS case_lifecycle jsonb;
