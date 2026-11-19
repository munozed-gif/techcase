-- Case costs, part 2: SAP operations made from the app (connection tests, live checks) are
-- recorded per case, so the VM cost share counts them too.
CREATE TABLE IF NOT EXISTS public.sap_ops_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id    uuid,
  project_id uuid,
  user_id    uuid DEFAULT auth.uid(),
  kind       text NOT NULL CHECK (kind IN ('connection_test', 'live_check', 'proxy', 'other'))
);
CREATE INDEX IF NOT EXISTS sap_ops_events_case_idx ON public.sap_ops_events (case_id, created_at);
ALTER TABLE public.sap_ops_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sap_ops_events FROM anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sap_ops_events' AND policyname = 'sap_ops_events_staff_read') THEN
    CREATE POLICY sap_ops_events_staff_read ON public.sap_ops_events FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;

-- Any approved user who can see the case records an operation on it (no direct inserts).
CREATE OR REPLACE FUNCTION public.log_sap_op(p_case uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RETURN; END IF;
  IF p_kind NOT IN ('connection_test', 'live_check', 'proxy', 'other') THEN RETURN; END IF;
  IF p_case IS NOT NULL AND NOT public.user_can_access_case(p_case) THEN RETURN; END IF;
  INSERT INTO sap_ops_events (case_id, project_id, kind)
  VALUES (p_case, (SELECT project_id FROM cases WHERE id = p_case), p_kind);
END $$;
REVOKE EXECUTE ON FUNCTION public.log_sap_op(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_sap_op(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sap_ops_share(p_case uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ops AS (
    SELECT case_id, date_trunc('month', created_at) m FROM sap_action_tickets
    UNION ALL
    SELECT case_id, date_trunc('month', created_at) m FROM ai_usage_events WHERE mcp
    UNION ALL
    SELECT case_id, date_trunc('month', created_at) m FROM sap_ops_events
  ),
  tot AS (SELECT m, count(*) n FROM ops GROUP BY m),
  mine AS (SELECT m, count(*) n FROM ops WHERE case_id = p_case GROUP BY m)
  SELECT CASE WHEN public.is_staff() THEN coalesce(jsonb_agg(jsonb_build_object('month', to_char(mine.m, 'YYYY-MM'), 'ops', mine.n, 'total', tot.n) ORDER BY mine.m), '[]'::jsonb) ELSE '[]'::jsonb END
  FROM mine JOIN tot USING (m);
$$;
