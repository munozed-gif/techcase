-- ============================================================
-- TechCase — Add area column to case_key_users
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE case_key_users ADD COLUMN IF NOT EXISTS area text;
