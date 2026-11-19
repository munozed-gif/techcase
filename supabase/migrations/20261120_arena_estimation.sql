-- Arena estimation: each activity keeps the standard (manual, mid-level) hours next to the
-- Arena estimate, how it is implemented and the seniority used; cases get an expected seniority.
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS expected_seniority text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_expected_seniority_check') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_expected_seniority_check
      CHECK (expected_seniority IS NULL OR expected_seniority IN ('junior', 'mid', 'senior', 'expert'));
  END IF;
END $$;

ALTER TABLE public.case_activities ADD COLUMN IF NOT EXISTS est_hours_manual numeric;
ALTER TABLE public.case_activities ADD COLUMN IF NOT EXISTS impl_mode text;
ALTER TABLE public.case_activities ADD COLUMN IF NOT EXISTS seniority text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_activities_impl_mode_check') THEN
    ALTER TABLE public.case_activities ADD CONSTRAINT case_activities_impl_mode_check
      CHECK (impl_mode IS NULL OR impl_mode IN ('auto', 'semi', 'manual', 'design'));
  END IF;
END $$;
