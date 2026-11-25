-- Administrators can send a proposal back to draft to adjust and resend it. The customer links stop
-- working while it is a draft (proposal_by_token ignores drafts); the decision fields are cleared and the
-- change is kept in the proposal history. Effects of an earlier acceptance on the cases are not undone.
CREATE OR REPLACE FUNCTION public.proposal_reopen(p_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; me users%ROWTYPE;
BEGIN
  IF coalesce(public.get_my_role(), '') <> 'admin' THEN RAISE EXCEPTION 'Only administrators can send a proposal back to draft' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM project_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '22023'; END IF;
  IF v.status IN ('draft', 'superseded') THEN RAISE EXCEPTION 'This proposal cannot be sent back to draft' USING ERRCODE = '22023'; END IF;
  SELECT * INTO me FROM users WHERE id = auth.uid();
  INSERT INTO proposal_events (proposal_id, event, actor_id, actor_name, note)
  VALUES (p_id, 'reopened', auth.uid(), coalesce(me.full_name, me.email),
          'Back to draft (was ' || v.status || coalesce(', sent ' || to_char(v.sent_at, 'YYYY-MM-DD HH24:MI') || ' UTC', '')
          || coalesce(', decided by ' || v.decided_by_name, '') || ')' || coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  UPDATE project_proposals SET status = 'draft', sent_at = NULL, decided_at = NULL, decided_by_name = NULL, decision_note = NULL
   WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.proposal_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_reopen(uuid, text) TO authenticated;
