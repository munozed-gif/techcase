-- ============================================================
-- TechCase — Add case_defaults column to client_profiles
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS case_defaults jsonb;
