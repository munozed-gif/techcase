-- Role setting for deleting case documents (Settings → Roles):
--   delete_docs      → may delete any document in a case they can access
--   delete_own_docs  → may delete only documents they uploaded
-- Admin always may. Matrix stored in system_settings.role_permissions;
-- defaults mirror ROLE_PERMISSIONS_DEFAULTS in src/lib/constants.js.
-- Generated spec/prototype files (SpecA_…, SpecB_…, SpecC_…, SpecD_…, Prototype_…) are
-- replaced automatically on regeneration, so anyone with access to the case may replace them.
-- No DROP / DELETE: adds restrictive policies on top of the existing ones.

CREATE OR REPLACE FUNCTION public.can_delete_case_doc(p_uploaded_by uuid, p_case_id uuid, p_file_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_stored jsonb;
  v_any    jsonb;
  v_own    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT role INTO v_role FROM users WHERE id = auth.uid();
  IF v_role IS NULL THEN RETURN false; END IF;
  IF p_case_id IS NOT NULL AND NOT user_can_access_case(p_case_id) THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF p_file_name ~ '^(SpecA_CustomABAP|SpecB_StandardSAP|SpecC_PropuestaCliente|SpecD_EspecCliente|Prototype_)' THEN
    RETURN true;
  END IF;

  SELECT value INTO v_stored FROM system_settings WHERE key = 'role_permissions';
  v_any := '{"admin":true,"manager":true}'::jsonb || coalesce(v_stored->'delete_docs', '{}'::jsonb);
  v_own := '{"admin":true,"manager":true}'::jsonb || coalesce(v_stored->'delete_own_docs', '{}'::jsonb);

  IF coalesce((v_any->>v_role)::boolean, false) THEN RETURN true; END IF;
  RETURN p_uploaded_by = auth.uid() AND coalesce((v_own->>v_role)::boolean, false);
END $$;

REVOKE ALL ON FUNCTION public.can_delete_case_doc(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_case_doc(uuid, uuid, text) TO authenticated;

-- Restrictive policies are AND-ed with every existing permissive policy, so they
-- enforce the role setting whatever other policies each environment has.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_documents' AND policyname='zz_sec_doc_delete_role') THEN
    CREATE POLICY zz_sec_doc_delete_role ON public.case_documents
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.can_delete_case_doc(uploaded_by, case_id, file_name));
  ELSE
    ALTER POLICY zz_sec_doc_delete_role ON public.case_documents
      USING (public.can_delete_case_doc(uploaded_by, case_id, file_name));
  END IF;

  -- Storage files in the case-documents bucket: previously any logged-in user could
  -- delete any file. Now only someone allowed to delete the matching document row.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='zz_case_docs_delete_role') THEN
    CREATE POLICY zz_case_docs_delete_role ON storage.objects
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (
        bucket_id <> 'case-documents' OR EXISTS (
          SELECT 1 FROM public.case_documents d
          WHERE d.file_url LIKE '%/case-documents/' || storage.objects.name
            AND public.can_delete_case_doc(d.uploaded_by, d.case_id, d.file_name)
        )
      );
  ELSE
    ALTER POLICY zz_case_docs_delete_role ON storage.objects
      USING (
        bucket_id <> 'case-documents' OR EXISTS (
          SELECT 1 FROM public.case_documents d
          WHERE d.file_url LIKE '%/case-documents/' || storage.objects.name
            AND public.can_delete_case_doc(d.uploaded_by, d.case_id, d.file_name)
        )
      );
  END IF;
END $$;
