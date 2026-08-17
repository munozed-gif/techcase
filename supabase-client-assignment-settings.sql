-- ============================================================
-- TechCase — Add assignment_settings to client_profiles
-- Stores auto-assignment config and scoring weights per client.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS assignment_settings jsonb DEFAULT '{}'::jsonb;
