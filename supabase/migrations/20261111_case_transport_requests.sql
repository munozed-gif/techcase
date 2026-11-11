-- Case/project transport list used by the Transport tab (TransportTab.jsx), the
-- project PDF report and the case transport counter.
--
-- These screens were written against a `transport_requests` table with
-- request_number/project_id/case_id/seq_order..., but both Supabase projects have
-- the Migration Hub's `transport_requests` (tr_number/migration_project_id/...),
-- created first by 20261010_transport_fitgap_testing.sql. The CREATE TABLE IF NOT
-- EXISTS for the case version therefore never ran and the Transport tab has always
-- been empty. Give it its own table; the Migration Hub table is left untouched.
--
-- The SAP implementation pipeline records each transport it writes objects into via
-- record_case_transport(); existing transports are backfilled from the blueprint
-- objects stored in system_settings.sap_blueprint.

CREATE TABLE IF NOT EXISTS public.case_transport_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  case_id         uuid REFERENCES public.cases(id)    ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id)      ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  request_number  text NOT NULL,
  description     text,
  request_type    text NOT NULL DEFAULT 'workbench'
                  CHECK (request_type IN ('workbench', 'customizing')),

  transport_mode  text NOT NULL DEFAULT 'external'
                  CHECK (transport_mode IN ('internal', 'external')),
  from_env_id     text,
  to_env_id       text,
  from_client     text,
  to_client       text,

  seq_order       integer NOT NULL DEFAULT 0,

  cofile_path     text,
  data_file_path  text,
  cofile_name     text,
  data_file_name  text,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'importing', 'done', 'error', 'skipped')),
  approval_status text NOT NULL DEFAULT 'draft'
                  CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected')),
  import_result   jsonb,
  import_log      text,
  applied_at      timestamptz,

  -- 'manual' = added in the Transport tab; 'sap_implementation' = created by the pipeline
  source          text NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'sap_implementation')),
  -- Objects the pipeline wrote into this transport: [{ "name": ..., "type": ... }]
  sap_objects     jsonb NOT NULL DEFAULT '[]'::jsonb,

  CONSTRAINT case_transport_requests_case_number_key UNIQUE (case_id, request_number)
);

CREATE INDEX IF NOT EXISTS case_transport_requests_project_idx ON public.case_transport_requests (project_id);

ALTER TABLE public.case_transport_requests ENABLE ROW LEVEL SECURITY;

-- Access: where the case-access helper exists (it does in ArenaSolPlatf), only people
-- involved in the case (or, for project-level rows, who can see the project); elsewhere
-- any logged-in user, matching that project's existing transport table.
DO $$
BEGIN
  IF to_regprocedure('public.user_can_access_case(uuid)') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY case_transport_requests_access ON public.case_transport_requests
        FOR ALL TO authenticated
        USING (CASE WHEN case_id IS NOT NULL THEN public.user_can_access_case(case_id)
                    ELSE EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id) END)
        WITH CHECK (CASE WHEN case_id IS NOT NULL THEN public.user_can_access_case(case_id)
                         ELSE EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id) END)
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY case_transport_requests_access ON public.case_transport_requests
        FOR ALL TO authenticated
        USING (auth.uid() IS NOT NULL)
        WITH CHECK (auth.uid() IS NOT NULL)
    $p$;
  END IF;
END $$;

-- Called by the SAP implementation pipeline after it writes an object with a transport.
-- Adds the transport to the case's list, or appends the object to an existing entry.
-- SECURITY INVOKER: the caller's RLS applies (they must be able to see the case).
CREATE OR REPLACE FUNCTION public.record_case_transport(
  p_case_id        uuid,
  p_request_number text,
  p_object_name    text DEFAULT NULL,
  p_object_type    text DEFAULT NULL,
  p_description    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tr   text := upper(trim(p_request_number));
  v_proj uuid;
  v_obj  jsonb;
  v_id   uuid;
BEGIN
  IF v_tr IS NULL OR v_tr = '' OR p_case_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT project_id INTO v_proj FROM cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case % not found or not accessible', p_case_id USING ERRCODE = '42501';
  END IF;

  v_obj := CASE WHEN p_object_name IS NULL THEN NULL
                ELSE jsonb_build_object('name', upper(p_object_name), 'type', p_object_type) END;

  INSERT INTO case_transport_requests
    (project_id, case_id, created_by, request_number, description, source, sap_objects, seq_order)
  VALUES
    (v_proj, p_case_id, auth.uid(), v_tr,
     coalesce(p_description, 'Created by the SAP implementation pipeline'),
     'sap_implementation',
     CASE WHEN v_obj IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_obj) END,
     coalesce((SELECT max(seq_order) FROM case_transport_requests WHERE case_id = p_case_id), 0) + 1)
  ON CONFLICT (case_id, request_number) DO UPDATE
    SET sap_objects = CASE
          WHEN v_obj IS NULL OR case_transport_requests.sap_objects @> jsonb_build_array(v_obj)
            THEN case_transport_requests.sap_objects
          ELSE case_transport_requests.sap_objects || jsonb_build_array(v_obj) END,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_case_transport(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_case_transport(uuid, text, text, text, text) TO authenticated;

-- Backfill from transports already stored on blueprint objects (appliedTransport).
INSERT INTO public.case_transport_requests
  (project_id, case_id, request_number, description, source, sap_objects, seq_order, created_at)
SELECT t.project_id, t.case_id, t.request_number,
       'Created by the SAP implementation pipeline', 'sap_implementation',
       t.objects,
       row_number() OVER (PARTITION BY t.case_id ORDER BY t.first_at NULLS LAST, t.request_number),
       coalesce(t.first_at, now())
FROM (
  SELECT c.project_id, c.id AS case_id,
         upper(trim(o->>'appliedTransport')) AS request_number,
         jsonb_agg(DISTINCT jsonb_build_object('name', upper(o->>'name'), 'type', o->>'type')) AS objects,
         min(CASE WHEN o->>'appliedAt' ~ '^\d{4}-\d{2}-\d{2}' THEN (o->>'appliedAt')::timestamptz END) AS first_at
  FROM public.system_settings s
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.value) = 'object' THEN s.value ELSE '{}'::jsonb END) e(k, v)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.v->'objects') = 'array' THEN e.v->'objects' ELSE '[]'::jsonb END) o
  JOIN public.cases c ON c.id::text = e.k
  WHERE s.key = 'sap_blueprint'
    AND nullif(trim(o->>'appliedTransport'), '') IS NOT NULL
  GROUP BY c.project_id, c.id, upper(trim(o->>'appliedTransport'))
) t
ON CONFLICT (case_id, request_number) DO NOTHING;

-- Private bucket for uploaded cofiles/data files (TransportTab file upload).
INSERT INTO storage.buckets (id, name, public)
VALUES ('transport-files', 'transport-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'transport_files_authenticated') THEN
    CREATE POLICY transport_files_authenticated ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'transport-files')
      WITH CHECK (bucket_id = 'transport-files');
  END IF;
END $$;
