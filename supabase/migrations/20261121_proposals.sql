-- ============================================================================
-- Proposals: a partner (owner/admin) or an Arena admin/manager builds a
-- commercial proposal for a project's customer from selected cases, sends it by
-- secure link, and the customer accepts, asks for changes or rejects it.
--
-- Case lifecycle: putting a case in a proposal moves it to the system stage
-- 'proposal_pending' (it leaves the Arena). Approval sets the case budget and
-- returns it to 'estimated' (ready to assign). Rejection, withdrawal or removal
-- from the proposal restores the status the case had before. Only proposal
-- actions move a case into or out of 'proposal_pending' (Arena admins excepted).
-- Additive only: no DROP / DELETE.
-- ============================================================================

ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'proposal_pending';

CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(p_table text, p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_name) THEN
    EXECUTE p_sql;
  END IF;
END $$;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  partner_id       uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  title            text NOT NULL DEFAULT 'Proposal',
  version          int  NOT NULL DEFAULT 1,
  parent_id        uuid REFERENCES public.project_proposals(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','viewed','changes_requested','accepted','rejected','withdrawn','superseded')),
  language         text NOT NULL DEFAULT 'en',
  currency         text NOT NULL DEFAULT 'USD',
  case_ids         uuid[] NOT NULL DEFAULT '{}',
  case_prev_status jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- {case_id: status before it entered the proposal}
  sources          jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- {case_id: {request, spec, plan, manual, docs:[ids]}}
  commercials      jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- rates, price basis, contingency, discount, tax, terms
  totals           jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- computed in the app: {cases:{id:{...,budget}}, total, ...}
  content_md       text,
  html             text,
  attachments      jsonb  NOT NULL DEFAULT '[]'::jsonb,   -- [{doc_id, case_id, file_name, file_url, file_type}]
  recipients       jsonb  NOT NULL DEFAULT '[]'::jsonb,   -- [{name, email}]
  token            text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  valid_until      date,
  sent_at          timestamptz,
  viewed_at        timestamptz,
  decided_at       timestamptz,
  decided_by_name  text,
  decision_note    text,
  created_by       uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_proposals_project_idx ON public.project_proposals(project_id);
CREATE INDEX IF NOT EXISTS project_proposals_cases_idx   ON public.project_proposals USING gin (case_ids);

CREATE TABLE IF NOT EXISTS public.proposal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.project_proposals(id) ON DELETE CASCADE,
  event       text NOT NULL,
  actor_id    uuid,
  actor_name  text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_events_proposal_idx ON public.proposal_events(proposal_id);

CREATE OR REPLACE FUNCTION public.proposals_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER trg_project_proposals_updated_at BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_touch_updated_at();

-- ── Who may manage proposals ────────────────────────────────────────────────
-- Arena admins/managers always; partner owners/admins of the project's partner
-- when the partner's plan includes "proposals" (Settings → Plans; on by default).
CREATE OR REPLACE FUNCTION public.can_manage_proposals(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project AND p.partner_id IS NOT NULL
        AND public.is_partner_member(p.partner_id, ARRAY['owner','admin'])
        AND coalesce((public.partner_limits(p.partner_id) ->> 'proposals')::boolean, true)
    ));
$$;

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_events  ENABLE ROW LEVEL SECURITY;

SELECT pg_temp.ensure_policy('project_proposals', 'proposals_manage',
  $p$CREATE POLICY proposals_manage ON public.project_proposals FOR ALL TO authenticated
     USING (public.can_manage_proposals(project_id)) WITH CHECK (public.can_manage_proposals(project_id))$p$);
SELECT pg_temp.ensure_policy('proposal_events', 'proposal_events_read',
  $p$CREATE POLICY proposal_events_read ON public.proposal_events FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.project_proposals pp WHERE pp.id = proposal_id AND public.can_manage_proposals(pp.project_id)))$p$);
SELECT pg_temp.ensure_policy('proposal_events', 'proposal_events_insert',
  $p$CREATE POLICY proposal_events_insert ON public.proposal_events FOR INSERT TO authenticated
     WITH CHECK (EXISTS (SELECT 1 FROM public.project_proposals pp WHERE pp.id = proposal_id AND public.can_manage_proposals(pp.project_id)))$p$);

-- ── Case status changes made by proposals ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._proposal_case_status(p_case uuid, p_status text, p_actor uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text; v_title text;
BEGIN
  SELECT status::text, title INTO v_old, v_title FROM cases WHERE id = p_case;
  IF v_old IS NULL OR v_old = p_status THEN RETURN; END IF;
  PERFORM set_config('app.proposal_ctx', '1', true);
  UPDATE cases SET status = p_status::case_status WHERE id = p_case;
  PERFORM set_config('app.proposal_ctx', '', true);
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, old_value, new_value, metadata)
  VALUES ('case.status_changed', p_actor, 'case', p_case::text, v_title,
          jsonb_build_object('status', v_old), jsonb_build_object('status', p_status),
          jsonb_build_object('source', 'proposal', 'note', p_note));
END $$;

-- Cases enter / leave 'proposal_pending' only through proposal actions (an Arena admin may override).
CREATE OR REPLACE FUNCTION public.guard_proposal_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.proposal_ctx', true), '') <> '1'
     AND coalesce(get_my_role(), '') <> 'admin' THEN
    IF OLD.status::text = 'proposal_pending' THEN
      RAISE EXCEPTION 'This case is waiting for its proposal to be approved' USING ERRCODE = '42501';
    END IF;
    IF NEW.status::text = 'proposal_pending' THEN
      RAISE EXCEPTION 'Cases move to Proposal pending only by adding them to a proposal' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER guard_proposal_pending BEFORE UPDATE OF status ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_pending();

CREATE OR REPLACE FUNCTION public._proposal_restore_cases(p_id uuid, p_cases uuid[], p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; c uuid;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_id;
  FOREACH c IN ARRAY coalesce(p_cases, '{}') LOOP
    IF EXISTS (SELECT 1 FROM cases WHERE id = c AND status::text = 'proposal_pending') THEN
      PERFORM public._proposal_case_status(c, coalesce(v.case_prev_status ->> c::text, 'estimated'), auth.uid(), p_note);
    END IF;
  END LOOP;
END $$;

-- ── Set the cases of a draft ────────────────────────────────────────────────
-- Added cases move to 'proposal_pending' (their status is remembered); removed
-- cases get their previous status back.
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
    IF v_status <> 'proposal_pending' THEN
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

-- ── Withdraw a proposal (draft or sent): its cases get their previous status back
CREATE OR REPLACE FUNCTION public.proposal_withdraw(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_proposals(v.project_id) THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501';
  END IF;
  IF v.status NOT IN ('draft','sent','viewed','changes_requested') THEN
    RAISE EXCEPTION 'This proposal is already closed' USING ERRCODE = '22023';
  END IF;
  PERFORM public._proposal_restore_cases(p_id, v.case_ids, 'Proposal ' || v.title || ' withdrawn');
  UPDATE project_proposals SET status = 'withdrawn' WHERE id = p_id;
  INSERT INTO proposal_events (proposal_id, event, actor_id) VALUES (p_id, 'withdrawn', auth.uid());
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── New version from a sent proposal (usually after "changes requested") ───
-- The cases stay in 'proposal_pending' and move to the new draft.
CREATE OR REPLACE FUNCTION public.proposal_new_version(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; v_new uuid;
BEGIN
  SELECT * INTO v FROM project_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_proposals(v.project_id) THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501';
  END IF;
  IF v.status NOT IN ('sent','viewed','changes_requested') THEN
    RAISE EXCEPTION 'Only a sent proposal can get a new version' USING ERRCODE = '22023';
  END IF;
  INSERT INTO project_proposals (project_id, partner_id, customer_id, title, version, parent_id, status, language, currency,
                                 case_ids, case_prev_status, sources, commercials, totals, content_md, html, attachments,
                                 recipients, valid_until)
  VALUES (v.project_id, v.partner_id, v.customer_id, v.title, v.version + 1, v.id, 'draft', v.language, v.currency,
          v.case_ids, v.case_prev_status, v.sources, v.commercials, v.totals, v.content_md, v.html, v.attachments,
          v.recipients, v.valid_until)
  RETURNING id INTO v_new;
  UPDATE project_proposals SET status = 'superseded' WHERE id = p_id;
  INSERT INTO proposal_events (proposal_id, event, actor_id, note) VALUES (p_id, 'superseded', auth.uid(), 'New version v' || (v.version + 1));
  RETURN v_new;
END $$;

-- ── Customer side (secure link, no login) ──────────────────────────────────
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
    'html', CASE WHEN v.status IN ('withdrawn','superseded') THEN NULL ELSE v.html END,
    'attachments', CASE WHEN v.status IN ('withdrawn','superseded') THEN '[]'::jsonb ELSE v.attachments END,
    'project_name', (SELECT name FROM projects WHERE id = v.project_id),
    'partner_name', (SELECT name FROM partners WHERE id = v.partner_id),
    'customer_name', (SELECT name FROM customers WHERE id = v.customer_id));
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

-- ── Grants ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._proposal_case_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._proposal_restore_cases(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_set_cases(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.proposal_withdraw(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.proposal_new_version(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proposal_set_cases(uuid, uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.proposal_withdraw(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.proposal_new_version(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_proposals(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_by_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.proposal_decide(text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.proposal_by_token(text) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proposal_decide(text, text, text, text) TO anon, authenticated;
