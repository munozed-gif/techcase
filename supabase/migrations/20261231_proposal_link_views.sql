-- Proposal links: tell real readers from automatic openers (mail security scanners such as
-- Microsoft Defender Safe Links open every link of an incoming email), and record each email sent
-- to a recipient so it can be resent on its own.
--  * every open of a recipient link is logged with the browser (user agent, from the request headers);
--  * an open becomes "human" only when the page gets a real interaction (scroll, click, key, touch):
--    proposal_view_human(); scanners load the page but do not interact;
--  * the proposal moves to "viewed" (and logs the event) on the first HUMAN open, not on any load.
ALTER TABLE public.proposal_recipient_links ADD COLUMN IF NOT EXISTS human_views    int NOT NULL DEFAULT 0;
ALTER TABLE public.proposal_recipient_links ADD COLUMN IF NOT EXISTS first_human_at timestamptz;
ALTER TABLE public.proposal_recipient_links ADD COLUMN IF NOT EXISTS last_human_at  timestamptz;
ALTER TABLE public.proposal_recipient_links ADD COLUMN IF NOT EXISTS emails_sent    int NOT NULL DEFAULT 0;
ALTER TABLE public.proposal_recipient_links ADD COLUMN IF NOT EXISTS last_email_at  timestamptz;

CREATE TABLE IF NOT EXISTS public.proposal_link_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id       uuid NOT NULL REFERENCES public.proposal_recipient_links(id) ON DELETE CASCADE,
  viewed_at     timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  kind          text NOT NULL DEFAULT 'unconfirmed' CHECK (kind IN ('unconfirmed', 'bot', 'human')),
  interacted_at timestamptz
);
CREATE INDEX IF NOT EXISTS proposal_link_views_link_idx ON public.proposal_link_views (link_id, viewed_at);
ALTER TABLE public.proposal_link_views ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proposal_link_views' AND policyname = 'proposal_link_views_read') THEN
    CREATE POLICY proposal_link_views_read ON public.proposal_link_views FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM proposal_recipient_links l JOIN project_proposals p ON p.id = l.proposal_id
                     WHERE l.id = link_id AND (public.is_staff() OR public.can_manage_proposals(p.project_id))));
  END IF;
END $$;

-- Known automatic clients (security scanners, link previews, scripts).
CREATE OR REPLACE FUNCTION public.proposal_ua_is_bot(p_ua text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_ua IS NULL OR length(trim(p_ua)) < 10
      OR p_ua ~* '(bot|crawl|spider|slurp|preview|headless|python|curl|wget|java/|go-http|okhttp|axios|node-fetch|safelinks|scanner|barracuda|mimecast|proofpoint|symantec|trendmicro|ironport|forcepoint|sophos|checkpoint|phantomjs|lighthouse|bingpreview|google-read|facebookexternalhit|skypeuripreview)'
$$;

CREATE OR REPLACE FUNCTION public.proposal_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; l proposal_recipient_links%ROWTYPE; d jsonb; closed boolean;
        v_ua text; v_view uuid;
BEGIN
  SELECT * INTO l FROM proposal_recipient_links WHERE token = p_token AND active;
  IF FOUND THEN
    SELECT * INTO v FROM project_proposals WHERE id = l.proposal_id;
    BEGIN v_ua := left(current_setting('request.headers', true)::json ->> 'user-agent', 400);
    EXCEPTION WHEN others THEN v_ua := NULL; END;
    UPDATE proposal_recipient_links SET views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now()) WHERE id = l.id;
    INSERT INTO proposal_link_views (link_id, user_agent, kind)
    VALUES (l.id, v_ua, CASE WHEN public.proposal_ua_is_bot(v_ua) THEN 'bot' ELSE 'unconfirmed' END)
    RETURNING id INTO v_view;
    d := l.docs;
  ELSE
    SELECT * INTO v FROM project_proposals WHERE token = p_token;
    d := '{"proposal":true,"deck":true,"summary":true,"attachments":true}'::jsonb;
    -- The proposal's own link (no recipient) keeps the old behaviour: any open counts as viewed.
    IF v.status = 'sent' THEN
      UPDATE project_proposals SET status = 'viewed', viewed_at = now() WHERE id = v.id;
      INSERT INTO proposal_events (proposal_id, event, actor_name) VALUES (v.id, 'viewed', NULL);
      v.status := 'viewed'; v.viewed_at := now();
    END IF;
  END IF;
  IF v.id IS NULL OR v.status IN ('draft') THEN RETURN NULL; END IF;
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
    'view_id', v_view,
    'recipient', CASE WHEN l.id IS NOT NULL THEN jsonb_build_object('name', l.name, 'can_decide', l.can_decide) END,
    'project_name', (SELECT name FROM projects WHERE id = v.project_id),
    'partner_name', (SELECT name FROM partners WHERE id = v.partner_id),
    'customer_name', (SELECT name FROM customers WHERE id = v.customer_id));
END $$;

-- First real interaction on the page: the open was a person. Moves a sent proposal to "viewed".
CREATE OR REPLACE FUNCTION public.proposal_view_human(p_token text, p_view uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l proposal_recipient_links%ROWTYPE; v_upd int; v project_proposals%ROWTYPE;
BEGIN
  SELECT * INTO l FROM proposal_recipient_links WHERE token = p_token AND active;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE proposal_link_views SET kind = 'human', interacted_at = now()
   WHERE id = p_view AND link_id = l.id AND interacted_at IS NULL;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN RETURN; END IF;
  UPDATE proposal_recipient_links SET human_views = human_views + 1, last_human_at = now(),
         first_human_at = coalesce(first_human_at, now()) WHERE id = l.id;
  SELECT * INTO v FROM project_proposals WHERE id = l.proposal_id;
  IF v.status = 'sent' THEN
    UPDATE project_proposals SET status = 'viewed', viewed_at = now() WHERE id = v.id;
    INSERT INTO proposal_events (proposal_id, event, actor_name) VALUES (v.id, 'viewed', coalesce(l.name, l.email));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.proposal_view_human(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_view_human(text, uuid) TO anon, authenticated;

-- An email with the personal link was sent to this recipient (first send or a resend).
CREATE OR REPLACE FUNCTION public.proposal_link_email_sent(p_proposal uuid, p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_proposal;
  IF NOT FOUND OR NOT public.can_manage_proposals(v.project_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE proposal_recipient_links SET emails_sent = emails_sent + 1, last_email_at = now()
   WHERE proposal_id = p_proposal AND lower(email) = lower(trim(p_email)) AND active;
END $$;
REVOKE ALL ON FUNCTION public.proposal_link_email_sent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_link_email_sent(uuid, text) TO authenticated;
