-- Terms of use and privacy policy: versioned documents (draft → published) and a record of who accepted
-- which version, when and where. Sign-up stores the accepted versions in the auth metadata
-- (legal_accept = {terms, privacy}); a trigger records them once the users row exists.
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('terms', 'privacy')),
  version      int  NOT NULL,
  body_es      text NOT NULL DEFAULT '',
  body_en      text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  terms_version    int,
  privacy_version  int,
  context          text NOT NULL DEFAULT 'login',   -- signup | login | invitation
  user_agent       text,
  accepted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON public.legal_acceptances (user_id, accepted_at DESC);
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_documents' AND policyname = 'legal_documents_staff') THEN
    CREATE POLICY legal_documents_staff ON public.legal_documents FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_acceptances' AND policyname = 'legal_acceptances_read') THEN
    CREATE POLICY legal_acceptances_read ON public.legal_acceptances FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
  END IF;
END $$;

-- Current published versions (public: sign-up screen and the /terminos, /privacidad pages).
CREATE OR REPLACE FUNCTION public.legal_current()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'terms',   (SELECT jsonb_build_object('version', version, 'es', body_es, 'en', body_en, 'published_at', published_at)
                  FROM legal_documents WHERE kind = 'terms' AND status = 'published' ORDER BY version DESC LIMIT 1),
    'privacy', (SELECT jsonb_build_object('version', version, 'es', body_es, 'en', body_en, 'published_at', published_at)
                  FROM legal_documents WHERE kind = 'privacy' AND status = 'published' ORDER BY version DESC LIMIT 1));
$$;
GRANT EXECUTE ON FUNCTION public.legal_current() TO anon, authenticated;

-- What the signed-in user still has to accept: {terms, privacy} = required versions, accepted = up to date.
CREATE OR REPLACE FUNCTION public.my_legal_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cur AS (
    SELECT (SELECT max(version) FROM legal_documents WHERE kind = 'terms' AND status = 'published') t,
           (SELECT max(version) FROM legal_documents WHERE kind = 'privacy' AND status = 'published') p),
  mine AS (
    SELECT max(terms_version) t, max(privacy_version) p FROM legal_acceptances WHERE user_id = auth.uid())
  SELECT jsonb_build_object('terms', cur.t, 'privacy', cur.p,
           'accepted', (cur.t IS NULL OR coalesce(mine.t, 0) >= cur.t) AND (cur.p IS NULL OR coalesce(mine.p, 0) >= cur.p))
  FROM cur, mine;
$$;
GRANT EXECUTE ON FUNCTION public.my_legal_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.legal_accept(p_terms int, p_privacy int, p_context text DEFAULT 'login', p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  INSERT INTO legal_acceptances (user_id, terms_version, privacy_version, context, user_agent)
  VALUES (auth.uid(), p_terms, p_privacy, left(coalesce(p_context, 'login'), 30), left(p_user_agent, 300));
END $$;
REVOKE ALL ON FUNCTION public.legal_accept(int, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_accept(int, int, text, text) TO authenticated;

-- Publish: the draft of that kind becomes the new published version (admins only).
CREATE OR REPLACE FUNCTION public.legal_publish(p_kind text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF coalesce(public.get_my_role(), '') <> 'admin' THEN RAISE EXCEPTION 'Only administrators' USING ERRCODE = '42501'; END IF;
  UPDATE legal_documents SET status = 'published', published_at = now(), updated_at = now()
   WHERE id = (SELECT id FROM legal_documents WHERE kind = p_kind AND status = 'draft' ORDER BY version DESC LIMIT 1)
   RETURNING version INTO v;
  IF v IS NULL THEN RAISE EXCEPTION 'There is no draft to publish' USING ERRCODE = '22023'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.legal_publish(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_publish(text) TO authenticated;

-- Acceptance list for admins (with names).
CREATE OR REPLACE FUNCTION public.legal_acceptances_list()
RETURNS TABLE (user_id uuid, full_name text, email text, role text, terms_version int, privacy_version int, context text, accepted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.user_id, u.full_name, u.email, u.role::text, a.terms_version, a.privacy_version, a.context, a.accepted_at
    FROM legal_acceptances a JOIN users u ON u.id = a.user_id
   WHERE public.is_staff() ORDER BY a.accepted_at DESC;
$$;
REVOKE ALL ON FUNCTION public.legal_acceptances_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_acceptances_list() TO authenticated;

-- Sign-up: record the versions accepted on the sign-up screen once both rows exist.
CREATE OR REPLACE FUNCTION public._legal_from_signup(p_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT raw_user_meta_data -> 'legal_accept' INTO v FROM auth.users WHERE id = p_uid;
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_uid) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM legal_acceptances WHERE user_id = p_uid AND context = 'signup') THEN RETURN; END IF;
  INSERT INTO legal_acceptances (user_id, terms_version, privacy_version, context, user_agent)
  VALUES (p_uid, nullif(v ->> 'terms', '')::int, nullif(v ->> 'privacy', '')::int, 'signup', left(v ->> 'ua', 300));
EXCEPTION WHEN OTHERS THEN RAISE WARNING '_legal_from_signup: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public._legal_from_signup(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.legal_from_signup_auth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.raw_user_meta_data ? 'legal_accept' THEN PERFORM public._legal_from_signup(NEW.id); END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.legal_from_signup_users() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._legal_from_signup(NEW.id); RETURN NEW; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_legal_accept' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_legal_accept AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.legal_from_signup_auth();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_users_legal_accept' AND tgrelid = 'public.users'::regclass) THEN
    CREATE TRIGGER on_users_legal_accept AFTER INSERT ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.legal_from_signup_users();
  END IF;
END $$;
