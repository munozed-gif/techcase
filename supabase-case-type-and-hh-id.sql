-- ============================================================
-- TechCase — Case type, headhunter FK, and interview round config
-- Adds:
--   case_type        — 'case' | 'ticket' | 'resource_need'
--   external_client_name / email — for resource needs without a
--                                   registered client account
--   head_hunter_id   — FK to auth.users for the assigned HH
--   interview_rounds_config — JSONB per-round ownership detail
-- Also makes client_id nullable so resource_need cases can
-- exist before the customer registers.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_type text DEFAULT 'case';

ALTER TABLE public.cases
  DROP CONSTRAINT IF EXISTS cases_case_type_check;

ALTER TABLE public.cases
  ADD CONSTRAINT cases_case_type_check
  CHECK (case_type IN ('case', 'ticket', 'resource_need'));

-- Allow resource_need cases that have no registered client yet
ALTER TABLE public.cases
  ALTER COLUMN client_id DROP NOT NULL;

-- External contact info for resource needs (customer not yet on platform)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS external_client_name  text,
  ADD COLUMN IF NOT EXISTS external_client_email text;

-- Headhunter FK (alongside existing head_hunter_name text column)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS head_hunter_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cases_head_hunter_id_idx
  ON public.cases (head_hunter_id)
  WHERE head_hunter_id IS NOT NULL;

-- Per-round interview ownership config
-- Format: [{ round: 1, conducted_by: 'headhunter'|'client_team', interviewer_name: '' }]
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS interview_rounds_config jsonb DEFAULT '[]'::jsonb;
