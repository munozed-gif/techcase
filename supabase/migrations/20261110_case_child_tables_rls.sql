-- ArenaSolPlatf: case documents, comments, files and time entries were readable
-- by any logged-in user (documents by anyone at all, without logging in), and
-- anyone logged in could add rows to any case.
--
-- After:
--   read:  people involved in the case (see user_can_access_case) and the
--          row's own author. Internal comments are hidden from client-side
--          roles (client, invited_client, key_user, final_user).
--   anon:  only documents listed in a non-expired spec review token
--          (CustomerSpecReviewView), instead of every document.
--   write: only on cases you're involved in, as yourself. Consultants can't
--          approve their own time entries; admins/managers can.
--
-- Existing policies are changed with ALTER POLICY (none are dropped).

CREATE OR REPLACE FUNCTION public.user_can_access_case(p_case uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR EXISTS (
        SELECT 1 FROM cases c
        WHERE c.id = p_case
          AND (c.client_id = auth.uid() OR c.created_by = auth.uid() OR c.manager_id = auth.uid()
               OR c.area_leader_id = auth.uid() OR c.head_hunter_id = auth.uid() OR c.reviewer_user_id = auth.uid()
               OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = auth.uid())
               OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = auth.uid())
               OR EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id
                          AND (p.client_id = auth.uid() OR p.created_by = auth.uid())))
      );
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_case(uuid) TO authenticated;

-- ── case_documents ──────────────────────────────────────────────────────
ALTER POLICY cdoc_read_auth ON public.case_documents
  TO authenticated
  USING (uploaded_by = auth.uid() OR public.user_can_access_case(case_id));

ALTER POLICY case_docs_anon_read ON public.case_documents
  TO anon
  USING (EXISTS (
    SELECT 1 FROM spec_review_tokens t
    WHERE t.expires_at > now()
      AND jsonb_path_exists(t.doc_ids, '$.* ? (@ == $id)', jsonb_build_object('id', case_documents.id::text))
  ));

ALTER POLICY cdoc_insert_auth ON public.case_documents
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.user_can_access_case(case_id));

-- ── case_comments ───────────────────────────────────────────────────────
ALTER POLICY cc_read_auth ON public.case_comments
  TO authenticated
  USING (
    (author_id = auth.uid() OR public.user_can_access_case(case_id))
    AND (is_internal IS NOT TRUE
         OR COALESCE(get_my_role(), '') NOT IN ('client', 'invited_client', 'key_user', 'final_user'))
  );

ALTER POLICY cc_insert_auth ON public.case_comments
  TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.user_can_access_case(case_id));

-- ── case_files ──────────────────────────────────────────────────────────
ALTER POLICY cf_read_auth ON public.case_files
  TO authenticated
  USING (user_id = auth.uid() OR public.user_can_access_case(case_id));

ALTER POLICY cf_insert_auth ON public.case_files
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.user_can_access_case(case_id));

-- ── time_entries ────────────────────────────────────────────────────────
ALTER POLICY te_read_auth ON public.time_entries
  TO authenticated
  USING (consultant_id = auth.uid() OR public.user_can_access_case(case_id));

ALTER POLICY te_insert_self ON public.time_entries
  TO authenticated
  WITH CHECK (consultant_id = auth.uid() AND public.user_can_access_case(case_id)
              AND is_approved IS NOT TRUE AND approved_by IS NULL);

ALTER POLICY te_update_staff ON public.time_entries
  TO authenticated
  USING (consultant_id = auth.uid() OR get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager')
              OR (consultant_id = auth.uid() AND is_approved IS NOT TRUE AND approved_by IS NULL));
