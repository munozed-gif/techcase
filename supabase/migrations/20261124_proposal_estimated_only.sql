-- Proposals change a case's status only when the case is 'estimated' (the Arena stage).
--   • Picking an estimated case → 'proposal_pending' (leaves the Arena until the customer answers).
--   • Any other status (open, confirmed, draft …) is left untouched: the proposal is a draft
--     offer for cases that are not approved yet.
--   • Accepted: only cases that were held in 'proposal_pending' go back to 'estimated' and get the
--     agreed budget; the others are not changed.
-- Also repairs open proposals whose non-estimated cases were moved to 'proposal_pending'.
-- No DROP / DELETE.

CREATE OR REPLACE FUNCTION public.proposal_set_cases(p_id uuid, p_case_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; c uuid; v_prev jsonb; v_status text; v_new uuid[] := coalesce(p_case_ids, '{}');
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_proposals(v.project_id) THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501';
  END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Only draft proposals can change their cases' USING ERRCODE = '22023'; END IF;
  v_prev := v.case_prev_status;

  FOREACH c IN ARRAY v_new LOOP
    CONTINUE WHEN c = ANY (v.case_ids);
    SELECT status::text INTO v_status FROM cases WHERE id = c AND project_id = v.project_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Case % is not part of this project', c USING ERRCODE = '22023'; END IF;
    IF v_status IN ('completed','cancelled','closed','terminated','resolved','approved') THEN
      RAISE EXCEPTION 'A finished or cancelled case cannot go into a proposal' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM case_assignments a WHERE a.case_id = c AND coalesce(a.is_active, true)) THEN
      RAISE EXCEPTION 'A case that already has a consultant assigned cannot go into a proposal' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM project_proposals o WHERE o.id <> p_id AND c = ANY (o.case_ids)
               AND o.status IN ('draft','sent','viewed','changes_requested')) THEN
      RAISE EXCEPTION 'A case is already in another open proposal' USING ERRCODE = '22023';
    END IF;
    -- Only an estimated case (in the Arena) is held while the customer decides.
    IF v_status = 'estimated' THEN
      v_prev := v_prev || jsonb_build_object(c::text, v_status);
      PERFORM public._proposal_case_status(c, 'proposal_pending', auth.uid(), 'Added to proposal ' || v.title);
    END IF;
  END LOOP;

  PERFORM public._proposal_restore_cases(p_id,
    ARRAY(SELECT x FROM unnest(v.case_ids) x WHERE NOT (x = ANY (v_new))), 'Removed from proposal ' || v.title);
  v_prev := (SELECT coalesce(jsonb_object_agg(k, val), '{}'::jsonb) FROM jsonb_each_text(v_prev) e(k, val)
             WHERE k::uuid = ANY (v_new));

  UPDATE project_proposals SET case_ids = v_new, case_prev_status = v_prev WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'case_ids', to_jsonb(v_new));
END $$;

CREATE OR REPLACE FUNCTION public.proposal_decide(p_token text, p_decision text, p_name text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; c uuid; v_budget numeric; u uuid; v_title text; v_body text;
BEGIN
  IF p_decision NOT IN ('accepted','changes_requested','rejected') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Your name is required' USING ERRCODE = '22023'; END IF;
  IF p_decision <> 'accepted' AND coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Please add a comment' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM project_proposals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501'; END IF;
  IF v.status NOT IN ('sent','viewed') THEN RAISE EXCEPTION 'This proposal can no longer be answered' USING ERRCODE = '42501'; END IF;
  IF v.valid_until IS NOT NULL AND v.valid_until < current_date THEN RAISE EXCEPTION 'This proposal has expired' USING ERRCODE = '42501'; END IF;

  UPDATE project_proposals SET status = p_decision, decided_at = now(), decided_by_name = trim(p_name),
         decision_note = NULLIF(trim(coalesce(p_note, '')), '') WHERE id = v.id;
  INSERT INTO proposal_events (proposal_id, event, actor_name, note) VALUES (v.id, p_decision, trim(p_name), NULLIF(trim(coalesce(p_note, '')), ''));

  IF p_decision = 'accepted' THEN
    FOREACH c IN ARRAY v.case_ids LOOP
      -- Only cases held by this proposal (they were estimated) get the budget and return to estimated.
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM cases WHERE id = c AND status::text = 'proposal_pending');
      v_budget := NULLIF(v.totals -> 'cases' -> c::text ->> 'budget', '')::numeric;
      IF v_budget IS NOT NULL THEN
        UPDATE cases SET budget = round(v_budget, 2), currency = v.currency WHERE id = c;
      END IF;
      PERFORM public._proposal_case_status(c, 'estimated', NULL, 'Proposal ' || v.title || ' accepted by ' || trim(p_name));
    END LOOP;
  ELSIF p_decision = 'rejected' THEN
    PERFORM public._proposal_restore_cases(v.id, v.case_ids, 'Proposal ' || v.title || ' rejected by ' || trim(p_name));
  END IF;

  v_title := CASE p_decision WHEN 'accepted' THEN 'Proposal accepted' WHEN 'rejected' THEN 'Proposal rejected' ELSE 'Proposal: changes requested' END;
  v_body  := v.title || ' (v' || v.version || ') — ' || trim(p_name) || coalesce(': ' || NULLIF(trim(coalesce(p_note, '')), ''), '');
  FOR u IN
    SELECT DISTINCT x FROM (
      SELECT v.created_by AS x
      UNION SELECT m.user_id FROM partner_members m WHERE m.partner_id = v.partner_id AND m.role IN ('owner','admin')
    ) s WHERE x IS NOT NULL
  LOOP
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (u, 'proposal', v_title, v_body, jsonb_build_object('proposal_id', v.id, 'project_id', v.project_id), 'proposal');
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'status', p_decision);
END $$;

-- Repair: cases in open proposals that were moved to proposal_pending although they were not estimated
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id AS pid, p.title, c.id AS cid, p.case_prev_status ->> c.id::text AS prev
    FROM project_proposals p JOIN cases c ON c.id = ANY (p.case_ids)
    WHERE p.status IN ('draft','sent','viewed','changes_requested')
      AND c.status::text = 'proposal_pending'
      AND coalesce(p.case_prev_status ->> c.id::text, 'estimated') <> 'estimated'
  LOOP
    PERFORM public._proposal_case_status(r.cid, r.prev, NULL, 'Proposal ' || r.title || ': only estimated cases are held');
    UPDATE project_proposals SET case_prev_status = case_prev_status - r.cid::text WHERE id = r.pid;
  END LOOP;
END $$;
