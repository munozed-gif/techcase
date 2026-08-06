-- ============================================================
-- TechCase — Extended Case Fields for Wizard Steps
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE cases
  -- ── Case Info: Confidentiality ─────────────────────────────
  ADD COLUMN IF NOT EXISTS is_confidential   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nda_required      boolean DEFAULT false,

  -- ── Scope: Work Arrangement ────────────────────────────────
  ADD COLUMN IF NOT EXISTS work_mode         text
    CHECK (work_mode IN ('remote','onsite','hybrid')),
  ADD COLUMN IF NOT EXISTS work_location     text,
  ADD COLUMN IF NOT EXISTS travel_required   boolean DEFAULT false,

  -- ── Roles & People ─────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS key_user_name     text,
  ADD COLUMN IF NOT EXISTS key_user_email    text,
  ADD COLUMN IF NOT EXISTS is_head_hunter    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS head_hunter_name  text,

  -- ── Qualifications ─────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS certifications_required  text[],
  ADD COLUMN IF NOT EXISTS min_years_experience     integer,
  ADD COLUMN IF NOT EXISTS languages_required       text[],
  ADD COLUMN IF NOT EXISTS security_clearance       boolean DEFAULT false,

  -- ── Interview Preferences ──────────────────────────────────
  ADD COLUMN IF NOT EXISTS interview_required    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS interview_format      text
    CHECK (interview_format IN ('phone','video','in_person')),
  ADD COLUMN IF NOT EXISTS interview_rounds      integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS technical_assessment  boolean DEFAULT false;
