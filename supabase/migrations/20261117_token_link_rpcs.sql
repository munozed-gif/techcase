-- Public links (no login): blueprint review (/approve/:token), spec review (/review/:token),
-- client invitation (/join/:token) and project share (/share/:token).
--
-- Before: the pages read the tables directly as the anonymous role, so the anon policies had
-- to allow reading every pending request / token / invitation / shared project. Anyone with
-- the public key could list all tokens and approve specs or objects, or read shared projects.
--
-- After: each page calls a SECURITY DEFINER function that takes the token and returns or
-- changes only that one item; the anonymous table policies are switched off (USING false).
-- Nothing is dropped.

-- ── Project share ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_share_by_token(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'status', p.status,
                                  'start_date', p.start_date, 'end_date', p.end_date, 'area_sap', p.area_sap),
    'cases', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status,
                                       'priority', c.priority, 'progress_pct', c.progress_pct, 'area_sap', c.area_sap)
                                       ORDER BY c.created_at)
                       FROM cases c WHERE c.project_id = p.id), '[]'::jsonb))
  FROM projects p
  WHERE p.share_token IS NOT NULL AND p.share_token::text = p_token
  LIMIT 1;
$$;

-- ── Blueprint review ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approval_request_by_token(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'request', jsonb_build_object(
      'id', r.id, 'reviewer_email', r.reviewer_email, 'reviewer_name', r.reviewer_name,
      'reviewer_avatar_url', r.reviewer_avatar_url, 'status', r.status, 'expires_at', r.expires_at,
      'case_id', r.case_id, 'project_id', r.project_id,
      'cases', (SELECT jsonb_build_object('title', c.title, 'area_sap', c.area_sap, 'reviewer_name', c.reviewer_name)
                FROM cases c WHERE c.id = r.case_id),
      'projects', (SELECT jsonb_build_object('name', p.name) FROM projects p WHERE p.id = r.project_id)),
    'objects', coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.object_phase, o.object_name)
                         FROM approval_request_objects o WHERE o.approval_request_id = r.id), '[]'::jsonb))
  FROM approval_requests r
  WHERE r.token::text = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.approval_request_decide(p_token text, p_object_id uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req approval_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_req FROM approval_requests WHERE token::text = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review link not found' USING ERRCODE = '42501'; END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN RAISE EXCEPTION 'This review link has expired' USING ERRCODE = '42501'; END IF;
  IF v_req.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'This review is closed' USING ERRCODE = '42501'; END IF;
  UPDATE approval_request_objects
     SET decision = p_decision, rejection_reason = NULLIF(trim(coalesce(p_reason, '')), ''), decided_at = now()
   WHERE id = p_object_id AND approval_request_id = v_req.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Object not part of this review' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Spec review ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spec_review_by_token(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'token', to_jsonb(t),
    'case', (SELECT jsonb_build_object('description', c.description, 'area_sap', c.area_sap, 'area_industry', c.area_industry,
                                       'priority', c.priority, 'due_date', c.due_date,
                                       'projects', (SELECT jsonb_build_object('name', p.name) FROM projects p WHERE p.id = c.project_id))
             FROM cases c WHERE c.id = t.case_id),
    'creator_name', (SELECT u.full_name FROM users u WHERE u.id = t.created_by),
    'documents', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'file_name', d.file_name, 'file_url', d.file_url, 'file_type', d.file_type))
                           FROM case_documents d
                           WHERE d.case_id = t.case_id
                             AND d.id::text IN (SELECT value FROM jsonb_each_text(CASE WHEN jsonb_typeof(t.doc_ids) = 'object' THEN t.doc_ids ELSE '{}'::jsonb END))),
                          '[]'::jsonb))
  FROM spec_review_tokens t
  WHERE t.token::text = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.spec_review_submit(p_token text, p_status text, p_feedback text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok spec_review_tokens%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'changes_requested') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023'; END IF;
  IF p_status = 'changes_requested' AND coalesce(trim(p_feedback), '') = '' THEN RAISE EXCEPTION 'Feedback is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_tok FROM spec_review_tokens WHERE token::text = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review link not found' USING ERRCODE = '42501'; END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN RAISE EXCEPTION 'This review link has expired' USING ERRCODE = '42501'; END IF;
  IF v_tok.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'This review was already submitted' USING ERRCODE = '42501'; END IF;
  UPDATE spec_review_tokens
     SET status = p_status, feedback = NULLIF(trim(coalesce(p_feedback, '')), ''),
         approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END
   WHERE id = v_tok.id;
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END $$;

-- ── Client invitation ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.case_invitation_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv case_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM case_invitations WHERE token::text = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_inv.status = 'pending' AND v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    UPDATE case_invitations SET status = 'expired' WHERE id = v_inv.id;
    v_inv.status := 'expired';
  END IF;
  RETURN jsonb_build_object(
    'id', v_inv.id, 'case_id', v_inv.case_id, 'invited_email', v_inv.invited_email, 'invited_name', v_inv.invited_name,
    'invited_by', v_inv.invited_by, 'status', v_inv.status, 'expires_at', v_inv.expires_at,
    'cases', (SELECT jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'area_sap', c.area_sap)
              FROM cases c WHERE c.id = v_inv.case_id));
END $$;

-- Marks the invitation accepted and tells the inviter. When called with a session whose
-- email is the invited one, the case is also linked to that user as its client.
CREATE OR REPLACE FUNCTION public.case_invitation_complete(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv case_invitations%ROWTYPE; v_email text; v_linked boolean := false; v_name text;
BEGIN
  SELECT * INTO v_inv FROM case_invitations WHERE token::text = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '42501'; END IF;
  IF v_inv.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'This invitation is %', v_inv.status USING ERRCODE = '42501'; END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() AND v_inv.status = 'pending' THEN
    RAISE EXCEPTION 'This invitation has expired' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    IF lower(v_email) = lower(v_inv.invited_email) THEN
      UPDATE cases SET client_id = auth.uid() WHERE id = v_inv.case_id AND client_id IS DISTINCT FROM auth.uid();
      v_linked := true;
    END IF;
  END IF;
  IF v_inv.status = 'pending' THEN
    UPDATE case_invitations SET status = 'accepted' WHERE id = v_inv.id;
    IF v_inv.invited_by IS NOT NULL THEN
      SELECT full_name INTO v_name FROM users WHERE lower(email) = lower(v_inv.invited_email) LIMIT 1;
      INSERT INTO notifications (user_id, title, body, is_read, case_id, event_type)
      VALUES (v_inv.invited_by, 'Client accepted invitation',
              coalesce(v_name, v_inv.invited_email) || ' joined the case.', false, v_inv.case_id, 'case_invitation_accepted');
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'linked', v_linked);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['project_share_by_token(text)', 'approval_request_by_token(text)',
                           'approval_request_decide(text, uuid, text, text)', 'spec_review_by_token(text)',
                           'spec_review_submit(text, text, text)', 'case_invitation_by_token(text)',
                           'case_invitation_complete(text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;

-- ── Switch off the anonymous table access ──────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.alter_if_exists(p_table text, p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_name) THEN
    EXECUTE p_sql;
  END IF;
END $$;

SELECT pg_temp.alter_if_exists('approval_requests', 'approval_requests_anon_read',
  'ALTER POLICY approval_requests_anon_read ON public.approval_requests USING (false)');
SELECT pg_temp.alter_if_exists('approval_request_objects', 'approval_request_objects_anon_read',
  'ALTER POLICY approval_request_objects_anon_read ON public.approval_request_objects USING (false)');
SELECT pg_temp.alter_if_exists('approval_request_objects', 'approval_request_objects_anon_update',
  'ALTER POLICY approval_request_objects_anon_update ON public.approval_request_objects USING (false) WITH CHECK (false)');
SELECT pg_temp.alter_if_exists('spec_review_tokens', 'spec_review_tokens_anon_read',
  'ALTER POLICY spec_review_tokens_anon_read ON public.spec_review_tokens USING (false)');
SELECT pg_temp.alter_if_exists('spec_review_tokens', 'spec_review_tokens_anon_update',
  'ALTER POLICY spec_review_tokens_anon_update ON public.spec_review_tokens USING (false) WITH CHECK (false)');
SELECT pg_temp.alter_if_exists('case_invitations', 'anon_read_by_token',
  'ALTER POLICY anon_read_by_token ON public.case_invitations USING (false)');
-- "public token lookup" let every logged-in user read every invitation.
SELECT pg_temp.alter_if_exists('case_invitations', 'public token lookup',
  'ALTER POLICY "public token lookup" ON public.case_invitations TO authenticated
     USING (invited_by = auth.uid() OR public.user_can_access_case(case_id))');
SELECT pg_temp.alter_if_exists('cases', 'cases_approval_anon_read',
  'ALTER POLICY cases_approval_anon_read ON public.cases USING (false)');
SELECT pg_temp.alter_if_exists('cases', 'cases_spec_review_anon_read',
  'ALTER POLICY cases_spec_review_anon_read ON public.cases USING (false)');
SELECT pg_temp.alter_if_exists('cases', 'cases_share_read',
  'ALTER POLICY cases_share_read ON public.cases USING (false)');
SELECT pg_temp.alter_if_exists('projects', 'projects_share_read',
  'ALTER POLICY projects_share_read ON public.projects USING (false)');
SELECT pg_temp.alter_if_exists('projects', 'projects_approval_anon_read',
  'ALTER POLICY projects_approval_anon_read ON public.projects USING (false)');
SELECT pg_temp.alter_if_exists('case_documents', 'case_documents_spec_review_anon_read',
  'ALTER POLICY case_documents_spec_review_anon_read ON public.case_documents USING (false)');
SELECT pg_temp.alter_if_exists('case_documents', 'case_docs_anon_read',
  'ALTER POLICY case_docs_anon_read ON public.case_documents USING (false)');
-- Notifications could be created by anyone, even without logging in.
SELECT pg_temp.alter_if_exists('notifications', 'notif_insert_any',
  'ALTER POLICY notif_insert_any ON public.notifications TO authenticated WITH CHECK (true)');
-- Preproduction names of the same anonymous policies.
SELECT pg_temp.alter_if_exists('approval_requests', 'Anon read by token',
  'ALTER POLICY "Anon read by token" ON public.approval_requests USING (false)');
SELECT pg_temp.alter_if_exists('spec_review_tokens', 'Anon read non-expired tokens',
  'ALTER POLICY "Anon read non-expired tokens" ON public.spec_review_tokens USING (false)');
SELECT pg_temp.alter_if_exists('spec_review_tokens', 'Anon update token status',
  'ALTER POLICY "Anon update token status" ON public.spec_review_tokens USING (false) WITH CHECK (false)');

-- Logged-in users: review tokens and blueprint review decisions only for their cases
-- (any logged-in user could approve any spec or object before).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spec_review_tokens' AND policyname = 'zz_sec_scope') THEN
    CREATE POLICY zz_sec_scope ON public.spec_review_tokens AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.user_can_access_case(case_id)) WITH CHECK (public.user_can_access_case(case_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approval_request_objects' AND policyname = 'zz_sec_scope') THEN
    CREATE POLICY zz_sec_scope ON public.approval_request_objects AS RESTRICTIVE FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM approval_requests r WHERE r.id = approval_request_id
                     AND (r.reviewer_user_id = auth.uid() OR public.user_can_access_case(r.case_id))))
      WITH CHECK (EXISTS (SELECT 1 FROM approval_requests r WHERE r.id = approval_request_id
                          AND (r.reviewer_user_id = auth.uid() OR public.user_can_access_case(r.case_id))));
  END IF;
END $$;
