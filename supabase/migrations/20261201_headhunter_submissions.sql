-- A headhunter proposes one of their candidates to a case; the candidate confirms each submission,
-- and only then the application reaches the customer. The placement is credited to the headhunter
-- who proposed the candidate.
--   • hh_submissions: submissions awaiting the candidate (status awaiting_candidate → confirmed /
--     declined / withdrawn). The application row is created on confirmation, so the existing
--     applications status rule is untouched and unconfirmed submissions are never visible to customers.
--   • applications.submitted_by_headhunter_id / headhunter_commission_pct: attribution + agreed %.
--   • users.hh_default_commission_pct: the headhunter's default commission.
-- Rules: active representation; case open/estimated; on headhunter-managed cases only the assigned
-- headhunter may propose; one application per consultant per case; per-case limit
-- (system_settings.max_applications_per_case); not counted in the consultant's monthly limit.
-- No DROP / DELETE.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS submitted_by_headhunter_id uuid,
  ADD COLUMN IF NOT EXISTS headhunter_commission_pct numeric;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hh_default_commission_pct numeric;

CREATE TABLE IF NOT EXISTS public.hh_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  consultant_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  headhunter_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  proposed_rate    numeric,
  time_commitment  text,
  avail_type       text,
  start_date       date,
  cover_letter     text,
  commission_pct   numeric,
  status           text NOT NULL DEFAULT 'awaiting_candidate' CHECK (status IN ('awaiting_candidate','confirmed','declined','withdrawn')),
  application_id   uuid,
  decline_note     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz
);
ALTER TABLE public.hh_submissions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS hh_submissions_one_open ON public.hh_submissions (case_id, consultant_id) WHERE status = 'awaiting_candidate';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hh_submissions' AND policyname='hh_submissions_read') THEN
    CREATE POLICY hh_submissions_read ON public.hh_submissions FOR SELECT TO authenticated
      USING (headhunter_id = auth.uid() OR consultant_id = auth.uid() OR public.is_staff());
  END IF;
END $$;

-- Is the case open to a submission by this headhunter? Returns an error text or NULL.
CREATE OR REPLACE FUNCTION public._hh_case_block(p_case uuid, p_consultant uuid, p_hh uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; v_max int; v_count int;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND THEN RETURN 'Case not found'; END IF;
  IF c.status::text NOT IN ('open','estimated') THEN RETURN 'This case is not open for applications'; END IF;
  IF coalesce(c.is_head_hunter, false) AND (c.head_hunter_id IS NULL OR c.head_hunter_id <> p_hh) THEN
    RETURN 'Only the headhunter assigned to this case can propose candidates';
  END IF;
  IF EXISTS (SELECT 1 FROM applications a WHERE a.case_id = p_case AND a.consultant_id = p_consultant) THEN
    RETURN 'This consultant already has an application for this case';
  END IF;
  IF EXISTS (SELECT 1 FROM hh_submissions s WHERE s.case_id = p_case AND s.consultant_id = p_consultant AND s.status = 'awaiting_candidate' AND s.headhunter_id <> p_hh) THEN
    RETURN 'This consultant has already been proposed for this case';
  END IF;
  SELECT nullif((value #>> '{}'), '')::int INTO v_max FROM system_settings WHERE key = 'max_applications_per_case';
  IF v_max IS NOT NULL AND v_max > 0 THEN
    SELECT count(*) INTO v_count FROM applications WHERE case_id = p_case AND status <> 'withdrawn';
    IF v_count >= v_max THEN RETURN 'This case has reached its maximum number of applications'; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._hh_case_block(uuid, uuid, uuid) FROM public, anon, authenticated;

-- Headhunter proposes a candidate
CREATE OR REPLACE FUNCTION public.hh_submit_candidate(p_case uuid, p_consultant uuid, p_rate numeric DEFAULT NULL,
  p_time_commitment text DEFAULT NULL, p_avail_type text DEFAULT NULL, p_start_date date DEFAULT NULL, p_cover_letter text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_block text; v_pct numeric; v_id uuid; v_hh text; v_case text;
BEGIN
  IF coalesce(get_my_role(), '') <> 'headhunter' THEN RAISE EXCEPTION 'Only headhunters can propose candidates' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM headhunter_candidates WHERE headhunter_id = auth.uid() AND consultant_id = p_consultant AND status = 'active') THEN
    RAISE EXCEPTION 'This consultant is not your candidate' USING ERRCODE = '42501';
  END IF;
  v_block := public._hh_case_block(p_case, p_consultant, auth.uid());
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM hh_submissions WHERE case_id = p_case AND consultant_id = p_consultant AND headhunter_id = auth.uid() AND status = 'awaiting_candidate') THEN
    RAISE EXCEPTION 'You already proposed this candidate for this case — waiting for their confirmation' USING ERRCODE = '22023';
  END IF;
  -- Commission: the headhunter's accepted proposal on this case, otherwise their default
  SELECT proposed_commission_pct INTO v_pct FROM hh_proposals
   WHERE case_id = p_case AND headhunter_id = auth.uid() AND status = 'accepted' ORDER BY reviewed_at DESC NULLS LAST LIMIT 1;
  IF v_pct IS NULL THEN SELECT hh_default_commission_pct INTO v_pct FROM users WHERE id = auth.uid(); END IF;

  INSERT INTO hh_submissions (case_id, consultant_id, headhunter_id, proposed_rate, time_commitment, avail_type, start_date, cover_letter, commission_pct)
  VALUES (p_case, p_consultant, auth.uid(), p_rate, NULLIF(trim(coalesce(p_time_commitment, '')), ''), NULLIF(p_avail_type, ''), p_start_date,
          NULLIF(trim(coalesce(p_cover_letter, '')), ''), v_pct)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_hh FROM users WHERE id = auth.uid();
  SELECT title INTO v_case FROM cases WHERE id = p_case;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (p_consultant, 'headhunter', 'Confirm your application',
          coalesce(v_hh, 'Your headhunter') || ' wants to propose you for "' || coalesce(v_case, 'a case') || '". Open Profile → Teams → Headhunters to confirm or decline.',
          jsonb_build_object('submission_id', v_id, 'case_id', p_case), 'headhunter');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, metadata)
  VALUES ('headhunter.candidate_submitted', auth.uid(), 'case', p_case::text, v_case, jsonb_build_object('consultant_id', p_consultant, 'submission_id', v_id));
  RETURN jsonb_build_object('id', v_id, 'commission_pct', v_pct, 'case_title', v_case, 'headhunter_name', v_hh);
END $$;

-- The candidate confirms or declines a submission
CREATE OR REPLACE FUNCTION public.hh_submission_respond(p_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s hh_submissions%ROWTYPE; v_block text; v_app uuid; v_case cases%ROWTYPE; v_name text; v_hh text;
BEGIN
  SELECT * INTO s FROM hh_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.consultant_id <> auth.uid() THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'awaiting_candidate' THEN RAISE EXCEPTION 'This submission was already answered or withdrawn' USING ERRCODE = '22023'; END IF;
  SELECT full_name INTO v_name FROM users WHERE id = auth.uid();
  SELECT * INTO v_case FROM cases WHERE id = s.case_id;

  IF NOT p_accept THEN
    UPDATE hh_submissions SET status = 'declined', responded_at = now(), decline_note = NULLIF(trim(coalesce(p_note, '')), '') WHERE id = p_id;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (s.headhunter_id, 'headhunter', 'Candidate declined the submission',
            coalesce(v_name, 'Your candidate') || ' declined to be proposed for "' || coalesce(v_case.title, 'a case') || '".' || coalesce(' ' || NULLIF(trim(coalesce(p_note, '')), ''), ''),
            jsonb_build_object('submission_id', p_id, 'case_id', s.case_id), 'headhunter');
    RETURN jsonb_build_object('ok', true, 'status', 'declined');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM headhunter_candidates WHERE headhunter_id = s.headhunter_id AND consultant_id = s.consultant_id AND status = 'active') THEN
    RAISE EXCEPTION 'This headhunter no longer represents you' USING ERRCODE = '22023';
  END IF;
  v_block := public._hh_case_block(s.case_id, s.consultant_id, s.headhunter_id);
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block USING ERRCODE = '22023'; END IF;

  INSERT INTO applications (case_id, consultant_id, status, cover_letter, proposed_rate, time_commitment, avail_type, start_date,
                            application_type, submitted_at, submitted_by_headhunter_id, headhunter_commission_pct)
  VALUES (s.case_id, s.consultant_id, 'pending', s.cover_letter, s.proposed_rate,
          NULLIF(regexp_replace(coalesce(s.time_commitment, ''), '[^0-9]', '', 'g'), '')::int, s.avail_type, s.start_date,
          'individual', now(), s.headhunter_id, s.commission_pct)
  RETURNING id INTO v_app;
  UPDATE hh_submissions SET status = 'confirmed', responded_at = now(), application_id = v_app WHERE id = p_id;

  SELECT full_name INTO v_hh FROM users WHERE id = s.headhunter_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (s.headhunter_id, 'headhunter', 'Candidate confirmed',
          coalesce(v_name, 'Your candidate') || ' confirmed the application to "' || coalesce(v_case.title, 'a case') || '". It is now with the customer.',
          jsonb_build_object('submission_id', p_id, 'case_id', s.case_id, 'application_id', v_app), 'headhunter');
  IF v_case.client_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (v_case.client_id, 'application', 'New application',
            coalesce(v_name, 'A consultant') || ' applied to "' || coalesce(v_case.title, 'your case') || '" (proposed by ' || coalesce(v_hh, 'a headhunter') || ').',
            jsonb_build_object('case_id', s.case_id, 'application_id', v_app), 'application');
  END IF;
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, metadata)
  VALUES ('headhunter.submission_confirmed', auth.uid(), 'case', s.case_id::text, v_case.title,
          jsonb_build_object('headhunter_id', s.headhunter_id, 'application_id', v_app));
  RETURN jsonb_build_object('ok', true, 'status', 'confirmed', 'application_id', v_app);
END $$;

-- The headhunter withdraws a submission (before the customer reviews the application)
CREATE OR REPLACE FUNCTION public.hh_submission_withdraw(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s hh_submissions%ROWTYPE; a applications%ROWTYPE;
BEGIN
  SELECT * INTO s FROM hh_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.headhunter_id <> auth.uid() THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE = '42501'; END IF;
  IF s.status = 'awaiting_candidate' THEN
    UPDATE hh_submissions SET status = 'withdrawn', responded_at = now() WHERE id = p_id;
  ELSIF s.status = 'confirmed' THEN
    SELECT * INTO a FROM applications WHERE id = s.application_id;
    IF a.status <> 'pending' OR a.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'The customer has already reviewed this application' USING ERRCODE = '22023'; END IF;
    UPDATE applications SET status = 'withdrawn' WHERE id = a.id;
    UPDATE hh_submissions SET status = 'withdrawn', responded_at = now() WHERE id = p_id;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (s.consultant_id, 'headhunter', 'Application withdrawn', 'Your headhunter withdrew your application to "' || coalesce((SELECT title FROM cases WHERE id = s.case_id), 'a case') || '".',
            jsonb_build_object('case_id', s.case_id), 'headhunter');
  ELSE
    RAISE EXCEPTION 'This submission can no longer be withdrawn' USING ERRCODE = '22023';
  END IF;
END $$;

-- Lists
CREATE OR REPLACE FUNCTION public.hh_my_submissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'status', s.status, 'created_at', s.created_at, 'responded_at', s.responded_at, 'decline_note', s.decline_note,
    'proposed_rate', s.proposed_rate, 'commission_pct', s.commission_pct,
    'case', jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status),
    'consultant', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url),
    'application', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id', a.id, 'status', a.status, 'reviewed_at', a.reviewed_at) END
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM hh_submissions s JOIN cases c ON c.id = s.case_id JOIN users u ON u.id = s.consultant_id
  LEFT JOIN applications a ON a.id = s.application_id
  WHERE s.headhunter_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.hh_submissions_to_confirm()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'created_at', s.created_at, 'proposed_rate', s.proposed_rate, 'time_commitment', s.time_commitment,
    'start_date', s.start_date, 'cover_letter', s.cover_letter,
    'case', jsonb_build_object('id', c.id, 'title', c.title, 'area_sap', c.area_sap, 'description', left(coalesce(c.description, ''), 600)),
    'headhunter_name', h.full_name
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM hh_submissions s JOIN cases c ON c.id = s.case_id JOIN users h ON h.id = s.headhunter_id
  WHERE s.consultant_id = auth.uid() AND s.status = 'awaiting_candidate';
$$;

CREATE OR REPLACE FUNCTION public.hh_set_default_commission(p_pct numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(get_my_role(), '') <> 'headhunter' THEN RAISE EXCEPTION 'Only headhunters' USING ERRCODE = '42501'; END IF;
  IF p_pct IS NOT NULL AND (p_pct < 0 OR p_pct > 100) THEN RAISE EXCEPTION 'Commission must be between 0 and 100' USING ERRCODE = '22023'; END IF;
  UPDATE users SET hh_default_commission_pct = p_pct WHERE id = auth.uid();
END $$;

-- Headhunter of a placement (only the one who proposed the candidate)
CREATE OR REPLACE FUNCTION public.hh_application_headhunter(p_application uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT submitted_by_headhunter_id FROM applications WHERE id = p_application;
$$;

REVOKE ALL ON FUNCTION public.hh_submit_candidate(uuid, uuid, numeric, text, text, date, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_submission_respond(uuid, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_submission_withdraw(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_my_submissions() FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_submissions_to_confirm() FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_set_default_commission(numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_application_headhunter(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hh_submit_candidate(uuid, uuid, numeric, text, text, date, text), public.hh_submission_respond(uuid, boolean, text),
  public.hh_submission_withdraw(uuid), public.hh_my_submissions(), public.hh_submissions_to_confirm(), public.hh_set_default_commission(numeric),
  public.hh_application_headhunter(uuid) TO authenticated;
