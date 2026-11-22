-- Headhunter ↔ consultant representation with consent.
--   • headhunter_candidates: many-to-many (a consultant can be represented by several headhunters).
--   • hh_candidate_invites: e-mail invitations with a secure token (30 days); the account that
--     accepts must have the invited e-mail.
--   • users.hh_referral_code: each headhunter's personal link (/hh/:code); whoever opens it and
--     confirms becomes their candidate.
--   • Links are created only by the consultant accepting (SECURITY DEFINER functions), never by
--     the headhunter. Either side can end the representation.
--   • Contact details (e-mail) of a candidate are visible to the headhunters who represent them.
--   users.headhunter_id is kept (no DROP) and backfilled as a 'legacy' link.
-- No DROP / DELETE.

CREATE TABLE IF NOT EXISTS public.headhunter_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headhunter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  source        text NOT NULL DEFAULT 'invite' CHECK (source IN ('invite','link','legacy')),
  invite_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  ended_by      uuid,
  UNIQUE (headhunter_id, consultant_id)
);
ALTER TABLE public.headhunter_candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hh_candidate_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headhunter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text,
  message       text,
  lang          text NOT NULL DEFAULT 'en',
  token         text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  consultant_id uuid,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz
);
ALTER TABLE public.hh_candidate_invites ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS hh_invites_one_pending ON public.hh_candidate_invites (headhunter_id, lower(email)) WHERE status = 'pending';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hh_referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_hh_referral_code ON public.users (hh_referral_code) WHERE hh_referral_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='headhunter_candidates' AND policyname='hh_candidates_read') THEN
    CREATE POLICY hh_candidates_read ON public.headhunter_candidates FOR SELECT TO authenticated
      USING (headhunter_id = auth.uid() OR consultant_id = auth.uid() OR public.is_staff());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hh_candidate_invites' AND policyname='hh_invites_read') THEN
    CREATE POLICY hh_invites_read ON public.hh_candidate_invites FOR SELECT TO authenticated
      USING (headhunter_id = auth.uid() OR public.is_staff());
  END IF;
END $$;

-- Backfill existing single-headhunter links
INSERT INTO public.headhunter_candidates (headhunter_id, consultant_id, source)
SELECT u.headhunter_id, u.id, 'legacy' FROM public.users u
WHERE u.headhunter_id IS NOT NULL
ON CONFLICT (headhunter_id, consultant_id) DO NOTHING;

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._hh_link(p_hh uuid, p_consultant uuid, p_source text, p_invite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  INSERT INTO headhunter_candidates (headhunter_id, consultant_id, status, source, invite_id)
  VALUES (p_hh, p_consultant, 'active', p_source, p_invite)
  ON CONFLICT (headhunter_id, consultant_id)
  DO UPDATE SET status = 'active', source = EXCLUDED.source, invite_id = EXCLUDED.invite_id, ended_at = NULL, ended_by = NULL, created_at = now();
  SELECT full_name INTO v_name FROM users WHERE id = p_consultant;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (p_hh, 'headhunter', 'New candidate', coalesce(v_name, 'A consultant') || ' accepted to be represented by you.',
          jsonb_build_object('consultant_id', p_consultant), 'headhunter');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value, metadata)
  VALUES ('headhunter.candidate_linked', p_consultant, 'user', p_consultant::text, v_name,
          jsonb_build_object('headhunter_id', p_hh), jsonb_build_object('source', p_source));
END $$;
REVOKE ALL ON FUNCTION public._hh_link(uuid, uuid, text, uuid) FROM public, anon, authenticated;

-- ── Headhunter: invite by e-mail ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hh_invite_create(p_email text, p_name text DEFAULT NULL, p_message text DEFAULT NULL, p_lang text DEFAULT 'en')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(trim(coalesce(p_email, ''))); v_user users%ROWTYPE; v_inv hh_candidate_invites%ROWTYPE; v_me text;
BEGIN
  IF coalesce(get_my_role(), '') NOT IN ('headhunter','admin') THEN RAISE EXCEPTION 'Only headhunters can invite candidates' USING ERRCODE = '42501'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid e-mail address' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_user FROM users WHERE lower(email) = v_email LIMIT 1;
  IF FOUND THEN
    IF v_user.id = auth.uid() THEN RAISE EXCEPTION 'You cannot invite yourself' USING ERRCODE = '22023'; END IF;
    IF v_user.role <> 'consultant' THEN RAISE EXCEPTION 'This e-mail belongs to an account that is not a consultant' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM headhunter_candidates WHERE headhunter_id = auth.uid() AND consultant_id = v_user.id AND status = 'active') THEN
      RAISE EXCEPTION 'This consultant is already your candidate' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM hh_candidate_invites WHERE headhunter_id = auth.uid() AND lower(email) = v_email AND status = 'pending' AND expires_at > now()) THEN
    RAISE EXCEPTION 'You already have a pending invitation for this e-mail — resend it instead' USING ERRCODE = '22023';
  END IF;
  -- an expired pending invitation for the same e-mail is closed so the new one can be created
  UPDATE hh_candidate_invites SET status = 'revoked', responded_at = now()
   WHERE headhunter_id = auth.uid() AND lower(email) = v_email AND status = 'pending';
  INSERT INTO hh_candidate_invites (headhunter_id, email, name, message, lang)
  VALUES (auth.uid(), v_email, NULLIF(trim(coalesce(p_name, '')), ''), NULLIF(trim(coalesce(p_message, '')), ''), CASE WHEN p_lang = 'es' THEN 'es' ELSE 'en' END)
  RETURNING * INTO v_inv;
  SELECT full_name INTO v_me FROM users WHERE id = auth.uid();
  IF v_user.id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (v_user.id, 'headhunter', 'Representation invitation',
            coalesce(v_me, 'A headhunter') || ' invites you to be represented as a candidate. Open Profile → Headhunters to answer.',
            jsonb_build_object('invite_token', v_inv.token), 'headhunter');
  END IF;
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value)
  VALUES ('headhunter.candidate_invited', auth.uid(), 'user', auth.uid()::text, v_me, jsonb_build_object('email', v_email));
  RETURN jsonb_build_object('id', v_inv.id, 'token', v_inv.token, 'existing_user', v_user.id IS NOT NULL,
                            'user_name', v_user.full_name, 'headhunter_name', v_me);
END $$;

CREATE OR REPLACE FUNCTION public.hh_invite_resend(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v hh_candidate_invites%ROWTYPE;
BEGIN
  UPDATE hh_candidate_invites SET expires_at = now() + interval '30 days'
   WHERE id = p_id AND headhunter_id = auth.uid() AND status = 'pending' RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found or already answered' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('token', v.token, 'email', v.email, 'name', v.name, 'message', v.message, 'lang', v.lang,
                            'headhunter_name', (SELECT full_name FROM users WHERE id = auth.uid()));
END $$;

CREATE OR REPLACE FUNCTION public.hh_invite_revoke(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE hh_candidate_invites SET status = 'revoked', responded_at = now()
   WHERE id = p_id AND headhunter_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found or already answered' USING ERRCODE = '22023'; END IF;
END $$;

-- ── Invitation page (no login needed to read it) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.hh_invite_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v hh_candidate_invites%ROWTYPE; h users%ROWTYPE;
BEGIN
  SELECT * INTO v FROM hh_candidate_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO h FROM users WHERE id = v.headhunter_id;
  RETURN jsonb_build_object('email', v.email, 'name', v.name, 'message', v.message, 'lang', v.lang,
    'status', CASE WHEN v.status = 'pending' AND v.expires_at <= now() THEN 'expired' ELSE v.status END,
    'expires_at', v.expires_at,
    'headhunter', jsonb_build_object('name', h.full_name, 'avatar_url', h.avatar_url),
    'account_exists', EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(v.email)));
END $$;

-- The consultant answers (must be logged in with the invited e-mail)
CREATE OR REPLACE FUNCTION public.hh_invite_respond(p_token text, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v hh_candidate_invites%ROWTYPE; me users%ROWTYPE;
BEGIN
  SELECT * INTO v FROM hh_candidate_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'pending' THEN RAISE EXCEPTION 'This invitation was already answered or cancelled' USING ERRCODE = '22023'; END IF;
  IF v.expires_at <= now() THEN RAISE EXCEPTION 'This invitation has expired — ask the headhunter to resend it' USING ERRCODE = '22023'; END IF;
  SELECT * INTO me FROM users WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Log in to answer the invitation' USING ERRCODE = '42501'; END IF;
  IF lower(coalesce(me.email, '')) <> lower(v.email) THEN
    RAISE EXCEPTION 'This invitation is for %, but you are logged in as %', v.email, me.email USING ERRCODE = '42501';
  END IF;
  IF p_accept AND me.role <> 'consultant' THEN RAISE EXCEPTION 'Only consultant accounts can be represented by a headhunter' USING ERRCODE = '22023'; END IF;
  UPDATE hh_candidate_invites SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         consultant_id = me.id, responded_at = now() WHERE id = v.id;
  IF p_accept THEN
    PERFORM public._hh_link(v.headhunter_id, me.id, 'invite', v.id);
  ELSE
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (v.headhunter_id, 'headhunter', 'Invitation declined', coalesce(me.full_name, v.email) || ' declined your representation invitation.',
            jsonb_build_object('consultant_id', me.id), 'headhunter');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END);
END $$;

-- ── Personal referral link ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hh_referral_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF coalesce(get_my_role(), '') <> 'headhunter' THEN RAISE EXCEPTION 'Only headhunters have a referral link' USING ERRCODE = '42501'; END IF;
  SELECT hh_referral_code INTO v_code FROM users WHERE id = auth.uid();
  IF v_code IS NULL THEN
    LOOP
      v_code := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE hh_referral_code = v_code);
    END LOOP;
    UPDATE users SET hh_referral_code = v_code WHERE id = auth.uid();
  END IF;
  RETURN v_code;
END $$;

CREATE OR REPLACE FUNCTION public.hh_referral_info(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('name', full_name, 'avatar_url', avatar_url)
  FROM users WHERE hh_referral_code = lower(p_code) AND role = 'headhunter';
$$;

CREATE OR REPLACE FUNCTION public.hh_referral_accept(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hh uuid; me users%ROWTYPE;
BEGIN
  SELECT id INTO v_hh FROM users WHERE hh_referral_code = lower(p_code) AND role = 'headhunter';
  IF v_hh IS NULL THEN RAISE EXCEPTION 'This link is not valid' USING ERRCODE = '22023'; END IF;
  SELECT * INTO me FROM users WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'Log in to accept' USING ERRCODE = '42501'; END IF;
  IF me.role <> 'consultant' THEN RAISE EXCEPTION 'Only consultant accounts can be represented by a headhunter' USING ERRCODE = '22023'; END IF;
  IF me.id = v_hh THEN RAISE EXCEPTION 'You cannot represent yourself' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM headhunter_candidates WHERE headhunter_id = v_hh AND consultant_id = me.id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already');
  END IF;
  PERFORM public._hh_link(v_hh, me.id, 'link', NULL);
  RETURN jsonb_build_object('ok', true, 'status', 'accepted');
END $$;

-- ── Lists ───────────────────────────────────────────────────────────────────
-- Headhunter: my active candidates with contact details (they accepted)
CREATE OR REPLACE FUNCTION public.hh_my_candidates()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'full_name', u.full_name, 'email', u.email, 'avatar_url', u.avatar_url,
    'since', l.created_at, 'source', l.source,
    'consultant_profiles', (SELECT to_jsonb(cp) FROM (SELECT headline, skills, hourly_rate, years_experience, availability_status, work_mode
                                                       FROM consultant_profiles WHERE id = u.id) cp)
  ) ORDER BY u.full_name), '[]'::jsonb)
  FROM headhunter_candidates l JOIN users u ON u.id = l.consultant_id
  WHERE l.headhunter_id = auth.uid() AND l.status = 'active';
$$;

-- Consultant: my headhunters + pending invitations for my e-mail
CREATE OR REPLACE FUNCTION public.hh_my_headhunters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'active', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'full_name', h.full_name, 'email', h.email, 'avatar_url', h.avatar_url, 'since', l.created_at) ORDER BY l.created_at), '[]'::jsonb)
               FROM headhunter_candidates l JOIN users h ON h.id = l.headhunter_id
               WHERE l.consultant_id = auth.uid() AND l.status = 'active'),
    'invitations', (SELECT coalesce(jsonb_agg(jsonb_build_object('token', i.token, 'headhunter_name', h.full_name, 'message', i.message, 'created_at', i.created_at) ORDER BY i.created_at DESC), '[]'::jsonb)
                    FROM hh_candidate_invites i JOIN users h ON h.id = i.headhunter_id
                    WHERE lower(i.email) = (SELECT lower(email) FROM users WHERE id = auth.uid())
                      AND i.status = 'pending' AND i.expires_at > now()));
$$;

-- Either side ends the representation
CREATE OR REPLACE FUNCTION public.hh_end_representation(p_headhunter uuid, p_consultant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_other uuid; v_name text;
BEGIN
  IF auth.uid() NOT IN (p_headhunter, p_consultant) AND NOT public.is_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE headhunter_candidates SET status = 'ended', ended_at = now(), ended_by = auth.uid()
   WHERE headhunter_id = p_headhunter AND consultant_id = p_consultant AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'No active representation' USING ERRCODE = '22023'; END IF;
  -- keep the legacy column consistent
  UPDATE users SET headhunter_id = NULL WHERE id = p_consultant AND headhunter_id = p_headhunter;
  v_other := CASE WHEN auth.uid() = p_headhunter THEN p_consultant ELSE p_headhunter END;
  SELECT full_name INTO v_name FROM users WHERE id = auth.uid();
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (v_other, 'headhunter', 'Representation ended', coalesce(v_name, 'The other party') || ' ended the representation.',
          jsonb_build_object('headhunter_id', p_headhunter, 'consultant_id', p_consultant), 'headhunter');
END $$;

-- Is this consultant represented by me? (contact visibility in the Arena / directory)
CREATE OR REPLACE FUNCTION public.hh_is_my_candidate(p_consultant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM headhunter_candidates WHERE headhunter_id = auth.uid() AND consultant_id = p_consultant AND status = 'active');
$$;

-- Headhunters of a consultant (placement notifications)
CREATE OR REPLACE FUNCTION public.hh_headhunters_of(p_consultant uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(headhunter_id), '{}') FROM headhunter_candidates WHERE consultant_id = p_consultant AND status = 'active';
$$;

REVOKE ALL ON FUNCTION public.hh_invite_create(text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_invite_resend(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_invite_revoke(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_invite_respond(text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_referral_code() FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_referral_accept(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_my_candidates() FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_my_headhunters() FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_end_representation(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_is_my_candidate(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_headhunters_of(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hh_invite_create(text, text, text, text), public.hh_invite_resend(uuid), public.hh_invite_revoke(uuid),
  public.hh_invite_respond(text, boolean), public.hh_referral_code(), public.hh_referral_accept(text), public.hh_my_candidates(),
  public.hh_my_headhunters(), public.hh_end_representation(uuid, uuid), public.hh_is_my_candidate(uuid), public.hh_headhunters_of(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.hh_invite_by_token(text) FROM public;
REVOKE ALL ON FUNCTION public.hh_referral_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hh_invite_by_token(text), public.hh_referral_info(text) TO anon, authenticated;
