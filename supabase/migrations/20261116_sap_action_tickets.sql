-- Server-side validation (Phase 4): /api/adt-write checks role permissions and the case's
-- validation rules, then issues a one-time ticket for that exact SAP write / transport
-- release. The ADT bridge only performs writes and releases that carry a valid, unused
-- ticket, so the checks cannot be skipped by calling the bridge directly.
-- Only the service role (Vercel API, ADT bridge) reads or writes this table: RLS is on
-- and there are no policies for app users.
CREATE TABLE IF NOT EXISTS public.sap_action_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  case_id     uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('write', 'release')),
  object_name text,
  transport   text,
  sap_host    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS sap_action_tickets_case_idx ON public.sap_action_tickets (case_id, created_at DESC);
ALTER TABLE public.sap_action_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sap_action_tickets FROM anon, authenticated;
