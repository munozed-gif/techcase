-- ============================================================
-- TechCase — Consultant availability_status + work_mode
-- Adds availability_status and work_mode to consultant_profiles
-- for use in the Headhunter talent roster and smart matching.
--
-- NOTE: The old availability_type check constraint (renamed
-- from a previous column) is dropped first so the new values
-- ('available','busy','unavailable') can be applied cleanly.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop old check constraint left over from availability_type rename
ALTER TABLE public.consultant_profiles
  DROP CONSTRAINT IF EXISTS consultant_profiles_availability_type_check;

-- availability_status
ALTER TABLE public.consultant_profiles
  ADD COLUMN IF NOT EXISTS availability_status text;

ALTER TABLE public.consultant_profiles
  DROP CONSTRAINT IF EXISTS consultant_profiles_availability_status_check;

ALTER TABLE public.consultant_profiles
  ADD CONSTRAINT consultant_profiles_availability_status_check
  CHECK (availability_status IN ('available', 'busy', 'unavailable'));

-- work_mode
ALTER TABLE public.consultant_profiles
  ADD COLUMN IF NOT EXISTS work_mode text DEFAULT 'remote';

ALTER TABLE public.consultant_profiles
  DROP CONSTRAINT IF EXISTS consultant_profiles_work_mode_check;

ALTER TABLE public.consultant_profiles
  ADD CONSTRAINT consultant_profiles_work_mode_check
  CHECK (work_mode IN ('remote', 'hybrid', 'onsite'));
