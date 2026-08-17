-- ============================================================
-- TechCase — Add max_available_at_submission to applications
-- Stores the consultant's calculated free capacity at the moment
-- they submitted the application (audit trail + ranking input).
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS max_available_at_submission int
    CHECK (max_available_at_submission BETWEEN 0 AND 100);
