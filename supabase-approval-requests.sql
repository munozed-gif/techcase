-- ============================================================
-- Approval Requests — tokenized review links for functional users
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Reviewer columns on cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS reviewer_email text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS reviewer_user_id uuid REFERENCES auth.users(id);

-- Approval requests table (one per case review cycle)
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  reviewer_email text NOT NULL,
  reviewer_user_id uuid REFERENCES auth.users(id),
  case_id        uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending',   -- pending | completed | expired
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

-- Objects inside an approval request
CREATE TABLE IF NOT EXISTS public.approval_request_objects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id  uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  object_id            text NOT NULL,          -- blueprint object UUID from system_settings
  object_name          text,
  object_type          text,
  object_description   text,
  object_phase         text,
  decision             text,                   -- null | 'approved' | 'rejected'
  rejection_reason     text,
  decided_at           timestamptz,
  UNIQUE (approval_request_id, object_id)
);

-- RLS
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_objects ENABLE ROW LEVEL SECURITY;

-- Authenticated: full access (consultants manage requests)
DROP POLICY IF EXISTS "approval_requests_auth" ON public.approval_requests;
CREATE POLICY "approval_requests_auth" ON public.approval_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "approval_request_objects_auth" ON public.approval_request_objects;
CREATE POLICY "approval_request_objects_auth" ON public.approval_request_objects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon: read valid pending requests (for the public review page)
DROP POLICY IF EXISTS "approval_requests_anon_read" ON public.approval_requests;
CREATE POLICY "approval_requests_anon_read" ON public.approval_requests
  FOR SELECT TO anon
  USING (status = 'pending' AND expires_at > now());

-- Anon: read objects of valid requests
DROP POLICY IF EXISTS "approval_request_objects_anon_read" ON public.approval_request_objects;
CREATE POLICY "approval_request_objects_anon_read" ON public.approval_request_objects
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id = approval_request_id
        AND r.status = 'pending'
        AND r.expires_at > now()
    )
  );

-- Anon: update objects of valid requests (approve / reject)
DROP POLICY IF EXISTS "approval_request_objects_anon_update" ON public.approval_request_objects;
CREATE POLICY "approval_request_objects_anon_update" ON public.approval_request_objects
  FOR UPDATE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id = approval_request_id
        AND r.status = 'pending'
        AND r.expires_at > now()
    )
  )
  WITH CHECK (true);

-- Anon must also be able to read cases + projects for the review page
DROP POLICY IF EXISTS "cases_approval_anon_read" ON public.cases;
CREATE POLICY "cases_approval_anon_read" ON public.cases
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.case_id = id
        AND r.status = 'pending'
        AND r.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "projects_approval_anon_read" ON public.projects;
CREATE POLICY "projects_approval_anon_read" ON public.projects
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.project_id = id
        AND r.status = 'pending'
        AND r.expires_at > now()
    )
  );
