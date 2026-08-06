-- ============================================================
-- TechCase — Case Lifecycle Configuration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Remove status CHECK constraint from cases
--    (allows custom lifecycle stage keys beyond the default 5)
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;

-- 2. Add lifecycle config to client_profiles
--    Stores { preset: "short"|"standard"|"large"|"custom", stages: [...] }
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS case_lifecycle jsonb;
