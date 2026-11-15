-- Transport tab: releases happen in SAP through the ADT bridge (CTS transportRelease);
-- imports into QA / PRD are done by Basis (STMS) and confirmed in the app.
ALTER TABLE public.case_transport_requests
  ADD COLUMN IF NOT EXISTS released_at     timestamptz,
  ADD COLUMN IF NOT EXISTS released_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_log     text,
  ADD COLUMN IF NOT EXISTS qa_imported_at  timestamptz,
  ADD COLUMN IF NOT EXISTS qa_imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prd_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS prd_imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
