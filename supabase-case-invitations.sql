-- Case invitation system for client onboarding via consultant invite link
-- Invited clients get limited access (invited_client role) until they request full access

-- Add invited_client to the user_role enum type
-- (role column uses a PostgreSQL enum, not a text CHECK constraint)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'invited_client';

-- Case invitations table
CREATE TABLE IF NOT EXISTS public.case_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  invited_email text       NOT NULL,
  invited_name  text,
  invited_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  token        uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- Index for fast token lookups (join screen query)
CREATE INDEX IF NOT EXISTS case_invitations_token_idx
  ON public.case_invitations (token);

-- Index for listing invitations per case
CREATE INDEX IF NOT EXISTS case_invitations_case_id_idx
  ON public.case_invitations (case_id);

-- RLS
ALTER TABLE public.case_invitations ENABLE ROW LEVEL SECURITY;

-- Anyone can look up an invitation by token (needed for the public /join route before auth)
CREATE POLICY "public token lookup"
  ON public.case_invitations FOR SELECT
  USING (true);

-- Consultants, admins and managers can insert invitations for cases they own / manage
CREATE POLICY "consultants can invite"
  ON public.case_invitations FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
  );

-- Only the inviter or an admin/manager can update (e.g. expire old tokens, resend)
CREATE POLICY "inviter or admin can update"
  ON public.case_invitations FOR UPDATE
  USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin','manager')
    )
  );
