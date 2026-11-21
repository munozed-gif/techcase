-- Accepted proposal: estimated (held) cases get the budget and return to 'estimated';
-- draft cases (any other status) get their latest specification approved — which unlocks the
-- manual "Generate development plan" — plus the agreed budget. Their case status is not changed.
-- No DROP / DELETE.

CREATE OR REPLACE FUNCTION public.proposal_decide(p_token text, p_decision text, p_name text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; c uuid; v_budget numeric; u uuid; v_title text; v_body text; v_spec uuid;
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
      v_budget := NULLIF(v.totals -> 'cases' -> c::text ->> 'budget', '')::numeric;
      IF EXISTS (SELECT 1 FROM cases WHERE id = c AND status::text = 'proposal_pending') THEN
        -- Held (estimated) case: agreed budget and back to estimated.
        IF v_budget IS NOT NULL THEN
          UPDATE cases SET budget = round(v_budget, 2), currency = v.currency WHERE id = c;
        END IF;
        PERFORM public._proposal_case_status(c, 'estimated', NULL, 'Proposal ' || v.title || ' accepted by ' || trim(p_name));
      ELSE
        -- Draft case (any other status): the customer's acceptance approves its specification, so the
        -- development plan can be generated manually. The case status is not changed.
        SELECT id INTO v_spec FROM case_specifications WHERE case_id = c ORDER BY created_at DESC LIMIT 1;
        IF v_spec IS NOT NULL THEN
          UPDATE case_specifications
             SET status = 'approved', approved_at = now(), rejected_reason = NULL, updated_at = now()
           WHERE id = v_spec AND status IS DISTINCT FROM 'approved';
          IF FOUND THEN
            INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, old_value, new_value, metadata)
            SELECT 'spec.approved', NULL, 'case', c::text, title, NULL, jsonb_build_object('spec_status', 'approved'),
                   jsonb_build_object('source', 'proposal', 'proposal_id', v.id, 'approved_by_customer', trim(p_name))
            FROM cases WHERE id = c;
          END IF;
        END IF;
        IF v_budget IS NOT NULL THEN
          UPDATE cases SET budget = round(v_budget, 2), currency = v.currency WHERE id = c;
        END IF;
      END IF;
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
