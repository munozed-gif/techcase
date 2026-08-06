-- ============================================================
-- TechCase — Extended Project Fields for Project Wizard
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE projects
  -- ── Objectives ─────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS objectives         text,
  ADD COLUMN IF NOT EXISTS deliverables       text[],
  ADD COLUMN IF NOT EXISTS success_criteria   text,
  ADD COLUMN IF NOT EXISTS out_of_scope       text,

  -- ── Team & Contacts ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS stakeholder_name        text,
  ADD COLUMN IF NOT EXISTS stakeholder_email       text,
  ADD COLUMN IF NOT EXISTS billing_contact_name    text,
  ADD COLUMN IF NOT EXISTS billing_contact_email   text,
  ADD COLUMN IF NOT EXISTS expected_consultants    integer,

  -- ── Requirements & Preferences ─────────────────────────────
  ADD COLUMN IF NOT EXISTS skills_required    text[],
  ADD COLUMN IF NOT EXISTS work_mode          text
    CHECK (work_mode IN ('remote','onsite','hybrid')),
  ADD COLUMN IF NOT EXISTS compliance_notes   text,
  ADD COLUMN IF NOT EXISTS priority           text DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical'));
