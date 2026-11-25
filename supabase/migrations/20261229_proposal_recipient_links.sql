-- Proposals: a personal link per recipient. The customer page shows four cards (proposal, presentation,
-- attachments summary, attachments); each recipient only gets the ones ticked for them, and only
-- recipients with "can decide" may accept / ask for changes / reject. Plus the attachments summary document.
ALTER TABLE public.project_proposals ADD COLUMN IF NOT EXISTS summary_md text;
ALTER TABLE public.project_proposals ADD COLUMN IF NOT EXISTS summary_html text;

CREATE TABLE IF NOT EXISTS public.proposal_recipient_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     uuid NOT NULL REFERENCES public.project_proposals(id) ON DELETE CASCADE,
  token           text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  name            text,
  email           text NOT NULL,
  docs            jsonb NOT NULL DEFAULT '{"proposal":true,"deck":true,"summary":true,"attachments":true}',
  can_decide      boolean NOT NULL DEFAULT true,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  views           int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS proposal_recipient_links_email_idx ON public.proposal_recipient_links (proposal_id, lower(email));
ALTER TABLE public.proposal_recipient_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proposal_recipient_links' AND policyname = 'proposal_recipient_links_read') THEN
    CREATE POLICY proposal_recipient_links_read ON public.proposal_recipient_links FOR SELECT TO authenticated
      USING (public.is_staff() OR EXISTS (SELECT 1 FROM project_proposals p WHERE p.id = proposal_id AND public.can_manage_proposals(p.project_id)));
  END IF;
END $$;

-- Save the recipients (name, email, docs, can_decide) of a proposal; returns [{email, token}].
-- Recipients removed from the list are deactivated (their link stops working).
CREATE OR REPLACE FUNCTION public.proposal_set_recipient_links(p_proposal uuid, p_recipients jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; r jsonb; v_email text; out jsonb := '[]'::jsonb; v_tok text;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_proposal;
  IF NOT FOUND OR NOT public.can_manage_proposals(v.project_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE proposal_recipient_links SET active = false
   WHERE proposal_id = p_proposal
     AND lower(email) NOT IN (SELECT lower(trim(x ->> 'email')) FROM jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb)) x);
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb)) LOOP
    v_email := lower(trim(coalesce(r ->> 'email', '')));
    CONTINUE WHEN v_email !~ '^\S+@\S+\.\S+$';
    INSERT INTO proposal_recipient_links (proposal_id, name, email, docs, can_decide, active)
    VALUES (p_proposal, nullif(trim(coalesce(r ->> 'name', '')), ''), v_email,
            coalesce(r -> 'docs', '{"proposal":true,"deck":true,"summary":true,"attachments":true}'::jsonb),
            coalesce((r ->> 'can_decide')::boolean, true), true)
    ON CONFLICT (proposal_id, lower(email)) DO UPDATE
      SET name = EXCLUDED.name, docs = EXCLUDED.docs, can_decide = EXCLUDED.can_decide, active = true
    RETURNING token INTO v_tok;
    out := out || jsonb_build_array(jsonb_build_object('email', v_email, 'token', v_tok));
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.proposal_set_recipient_links(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_set_recipient_links(uuid, jsonb) TO authenticated;

-- Customer page. A recipient token returns only that recipient's cards; the proposal's own token
-- (used inside the app and by the proposal owner) returns everything, as before.
CREATE OR REPLACE FUNCTION public.proposal_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; l proposal_recipient_links%ROWTYPE; d jsonb; closed boolean;
BEGIN
  SELECT * INTO l FROM proposal_recipient_links WHERE token = p_token AND active;
  IF FOUND THEN
    SELECT * INTO v FROM project_proposals WHERE id = l.proposal_id;
    UPDATE proposal_recipient_links SET views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now()) WHERE id = l.id;
    d := l.docs;
  ELSE
    SELECT * INTO v FROM project_proposals WHERE token = p_token;
    d := '{"proposal":true,"deck":true,"summary":true,"attachments":true}'::jsonb;
  END IF;
  IF v.id IS NULL OR v.status IN ('draft') THEN RETURN NULL; END IF;
  IF v.status = 'sent' THEN
    UPDATE project_proposals SET status = 'viewed', viewed_at = now() WHERE id = v.id;
    INSERT INTO proposal_events (proposal_id, event, actor_name) VALUES (v.id, 'viewed', l.name);
    v.status := 'viewed'; v.viewed_at := now();
  END IF;
  closed := v.status IN ('withdrawn','superseded');
  RETURN jsonb_build_object(
    'id', v.id, 'title', v.title, 'version', v.version, 'status', v.status, 'language', v.language,
    'currency', v.currency,
    'totals', CASE WHEN (d ->> 'proposal')::boolean THEN v.totals END,
    'valid_until', v.valid_until, 'sent_at', v.sent_at,
    'decided_at', v.decided_at, 'decided_by_name', v.decided_by_name, 'decision_note', v.decision_note,
    'accepted_option', CASE WHEN (d ->> 'proposal')::boolean THEN v.accepted_option END,
    'html',         CASE WHEN closed OR NOT (d ->> 'proposal')::boolean THEN NULL ELSE v.html END,
    'deck_html',    CASE WHEN closed OR NOT (d ->> 'deck')::boolean THEN NULL ELSE v.deck_html END,
    'summary_html', CASE WHEN closed OR NOT (d ->> 'summary')::boolean THEN NULL ELSE v.summary_html END,
    'attachments',  CASE WHEN closed OR NOT (d ->> 'attachments')::boolean THEN '[]'::jsonb ELSE v.attachments END,
    'docs', d,
    'recipient', CASE WHEN l.id IS NOT NULL THEN jsonb_build_object('name', l.name, 'can_decide', l.can_decide) END,
    'project_name', (SELECT name FROM projects WHERE id = v.project_id),
    'partner_name', (SELECT name FROM partners WHERE id = v.partner_id),
    'customer_name', (SELECT name FROM customers WHERE id = v.customer_id));
END $$;

-- Decision from a recipient link (only when that recipient may decide).
CREATE OR REPLACE FUNCTION public.proposal_decide_link(p_token text, p_decision text, p_name text, p_note text DEFAULT NULL, p_option integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l proposal_recipient_links%ROWTYPE; v_tok text;
BEGIN
  SELECT * INTO l FROM proposal_recipient_links WHERE token = p_token AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501'; END IF;
  IF NOT l.can_decide THEN RAISE EXCEPTION 'This link can only view the proposal' USING ERRCODE = '42501'; END IF;
  SELECT token INTO v_tok FROM project_proposals WHERE id = l.proposal_id;
  RETURN public.proposal_decide_v2(v_tok, p_decision, coalesce(nullif(trim(p_name), ''), l.name, l.email), p_note, p_option);
END $$;
GRANT EXECUTE ON FUNCTION public.proposal_decide_link(text, text, text, text, integer) TO anon, authenticated;
