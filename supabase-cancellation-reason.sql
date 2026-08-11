-- ============================================================
-- TechCase — Add cancellation reason fields to cases
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cancellation_notes  text;
