-- As-built spec: after development and tests, the approved spec is updated with what was
-- actually built in SAP. The generated documents go to the case Docs tab ("As-built
-- documentation"); this column tracks their review state for the Approved-stage gate:
-- { status: 'submitted'|'approved'|'rejected', version, docs: [{key, name, file_name}],
--   notes, generated_at, generated_by, approved_by, approved_at, rejected_reason }
ALTER TABLE public.case_specifications
  ADD COLUMN IF NOT EXISTS asbuilt jsonb;
