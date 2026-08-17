-- ============================================================
-- TechCase — Extend case_status enum
-- Adds all lifecycle stage keys used in lifecycle templates so
-- custom lifecycles (Support Center, etc.) can be used as case status.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'estimated';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'standby';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'functional_test';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'user_test';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'adjustments';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'terminated';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'screening';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'shortlisted';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'sourcing';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'evaluation';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'resolved';
