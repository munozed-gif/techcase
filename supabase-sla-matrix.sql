-- ============================================================
-- TechCase — Add sla_matrix column to sla_configs
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS sla_matrix jsonb;
