-- ============================================================
-- Spec Review Tokens — customer-facing spec review links
-- Run this in the Supabase SQL Editor after supabase-approval-requests.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.spec_review_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  case_id        uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'changes_requested')),
  customer_name  text,
  customer_email text,
  approved_at    timestamptz,
  feedback       text,
  doc_ids        jsonb DEFAULT '{}', -- {a: case_doc_id, b: ..., c: ..., d: ..., proto: ...}
  case_title     text
);

-- RLS
ALTER TABLE public.spec_review_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated: full access (consultants/managers create and manage links)
DROP POLICY IF EXISTS "spec_review_tokens_auth" ON public.spec_review_tokens;
CREATE POLICY "spec_review_tokens_auth" ON public.spec_review_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon: read non-expired tokens (so the public review page can load)
DROP POLICY IF EXISTS "spec_review_tokens_anon_read" ON public.spec_review_tokens;
CREATE POLICY "spec_review_tokens_anon_read" ON public.spec_review_tokens
  FOR SELECT TO anon
  USING (expires_at > now());

-- Anon: update status (customer approves or requests changes)
DROP POLICY IF EXISTS "spec_review_tokens_anon_update" ON public.spec_review_tokens;
CREATE POLICY "spec_review_tokens_anon_update" ON public.spec_review_tokens
  FOR UPDATE TO anon
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status IN ('approved', 'changes_requested'));

-- Anon: read case_documents belonging to a case that has a live review token
DROP POLICY IF EXISTS "case_documents_spec_review_anon_read" ON public.case_documents;
CREATE POLICY "case_documents_spec_review_anon_read" ON public.case_documents
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.spec_review_tokens t
      WHERE t.case_id = case_documents.case_id
        AND t.expires_at > now()
    )
  );

-- Anon: read cases that have a live review token
-- (may already exist from supabase-approval-requests.sql — DROP IF EXISTS is safe)
DROP POLICY IF EXISTS "cases_spec_review_anon_read" ON public.cases;
CREATE POLICY "cases_spec_review_anon_read" ON public.cases
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.spec_review_tokens t
      WHERE t.case_id = cases.id
        AND t.expires_at > now()
    )
  );
