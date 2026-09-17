-- ============================================================
-- TechCase — HH Proposals table
-- Headhunters submit proposals to manage open HH cases or
-- resource-need cases. Managers/clients review and accept.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hh_proposals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  headhunter_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message                  text,
  candidate_count_estimate integer,
  proposed_commission_pct  numeric(5,2),
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_at              timestamptz,
  reviewed_by              uuid REFERENCES auth.users(id),
  UNIQUE (case_id, headhunter_id)
);

CREATE INDEX IF NOT EXISTS hh_proposals_case_id_idx       ON public.hh_proposals (case_id);
CREATE INDEX IF NOT EXISTS hh_proposals_headhunter_id_idx ON public.hh_proposals (headhunter_id);
CREATE INDEX IF NOT EXISTS hh_proposals_status_idx        ON public.hh_proposals (status) WHERE status = 'pending';

-- RLS: headhunters can read/insert their own rows;
--      managers and admins can read all and update status.
ALTER TABLE public.hh_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hh_proposals_select ON public.hh_proposals;
CREATE POLICY hh_proposals_select ON public.hh_proposals
  FOR SELECT USING (
    auth.uid() = headhunter_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin','manager','client')
    )
  );

DROP POLICY IF EXISTS hh_proposals_insert ON public.hh_proposals;
CREATE POLICY hh_proposals_insert ON public.hh_proposals
  FOR INSERT WITH CHECK (
    auth.uid() = headhunter_id
    AND EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'headhunter'
    )
  );

DROP POLICY IF EXISTS hh_proposals_update ON public.hh_proposals;
CREATE POLICY hh_proposals_update ON public.hh_proposals
  FOR UPDATE USING (
    -- headhunter can withdraw their own pending proposal
    (auth.uid() = headhunter_id AND status = 'pending')
    OR
    -- admin/manager can accept or reject
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin','manager','client')
    )
  );
