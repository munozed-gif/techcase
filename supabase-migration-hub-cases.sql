-- ============================================================
-- TechCase — Migration Hub ↔ Cases Integration
-- Adds migration_ref column to cases and blueprint column to
-- wricef_objects so the Sync Hub → Cases feature can track
-- auto-generated cases and store AI blueprints.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Link cases back to a migration project / object
ALTER TABLE cases ADD COLUMN IF NOT EXISTS migration_ref jsonb;

-- GIN index so Supabase can filter by JSONB fields efficiently
CREATE INDEX IF NOT EXISTS cases_migration_ref_idx ON cases USING gin(migration_ref);

-- Store AI-generated technical blueprint per WRICEF object
ALTER TABLE wricef_objects ADD COLUMN IF NOT EXISTS blueprint jsonb;

-- Expand case_type CHECK to include migration-generated types
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_case_type_check;
ALTER TABLE cases ADD CONSTRAINT cases_case_type_check
  CHECK (case_type IN (
    'case', 'ticket', 'resource_need',
    'migration_phase', 'wricef_registry', 'wricef_object', 'cutover_plan'
  ));
