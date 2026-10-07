-- Transport Requests table
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.transport_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid REFERENCES public.projects(id)  ON DELETE CASCADE NOT NULL,
  case_id         uuid REFERENCES public.cases(id)     ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),

  request_number  text NOT NULL,
  description     text,
  request_type    text DEFAULT 'workbench',   -- 'workbench' | 'customizing'

  transport_mode  text DEFAULT 'external',    -- 'internal' | 'external'
  from_env_id     text,
  to_env_id       text,
  from_client     text,
  to_client       text,

  seq_order       integer DEFAULT 0,

  -- Uploaded transport files stored in Supabase Storage bucket 'transport-files'
  cofile_path     text,
  data_file_path  text,
  cofile_name     text,
  data_file_name  text,

  status          text DEFAULT 'pending',     -- 'pending'|'importing'|'done'|'error'|'skipped'
  approval_status text DEFAULT 'draft',       -- 'draft'|'pending_review'|'approved'|'rejected'
  import_result   jsonb,
  import_log      text,
  applied_at      timestamptz
);

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (tighten per project membership as needed)
CREATE POLICY "transport_requests_authenticated"
  ON public.transport_requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- NOTE: also create a 'transport-files' Storage bucket in your Supabase dashboard
-- (Storage → New bucket → Name: transport-files, Private)
