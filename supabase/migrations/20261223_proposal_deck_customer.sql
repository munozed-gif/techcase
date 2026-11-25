-- The customer sees the proposal presentation from the proposal link.
ALTER TABLE project_proposals ADD COLUMN IF NOT EXISTS deck_html text;

CREATE OR REPLACE FUNCTION public.proposal_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE token = p_token;
  IF NOT FOUND OR v.status IN ('draft') THEN RETURN NULL; END IF;
  IF v.status = 'sent' THEN
    UPDATE project_proposals SET status = 'viewed', viewed_at = now() WHERE id = v.id;
    INSERT INTO proposal_events (proposal_id, event) VALUES (v.id, 'viewed');
    v.status := 'viewed'; v.viewed_at := now();
  END IF;
  RETURN jsonb_build_object(
    'id', v.id, 'title', v.title, 'version', v.version, 'status', v.status, 'language', v.language,
    'currency', v.currency, 'totals', v.totals, 'valid_until', v.valid_until, 'sent_at', v.sent_at,
    'decided_at', v.decided_at, 'decided_by_name', v.decided_by_name, 'decision_note', v.decision_note,
    'accepted_option', v.accepted_option,
    'html', CASE WHEN v.status IN ('withdrawn','superseded') THEN NULL ELSE v.html END,
    'deck_html', CASE WHEN v.status IN ('withdrawn','superseded') THEN NULL ELSE v.deck_html END,
    'attachments', CASE WHEN v.status IN ('withdrawn','superseded') THEN '[]'::jsonb ELSE v.attachments END,
    'project_name', (SELECT name FROM projects WHERE id = v.project_id),
    'partner_name', (SELECT name FROM partners WHERE id = v.partner_id),
    'customer_name', (SELECT name FROM customers WHERE id = v.customer_id));
END $$;
