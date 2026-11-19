-- Case costs: AI usage per call (tokens and cost, by case and step), manual case expenses,
-- and a currency on customers and projects (case → project → customer → platform USD).

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  user_id            uuid,
  case_id            uuid,
  project_id         uuid,
  feature            text,
  model              text,
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  mcp                boolean NOT NULL DEFAULT false,
  cost_usd           numeric(12, 6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_usage_events_case_idx ON public.ai_usage_events (case_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_month_idx ON public.ai_usage_events (created_at);
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_events FROM anon;

CREATE TABLE IF NOT EXISTS public.case_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES public.cases(id),
  category    text NOT NULL DEFAULT 'other' CHECK (category IN ('travel', 'license', 'subcontractor', 'hardware', 'other')),
  description text,
  amount      numeric(14, 2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT current_date,
  receipt_url text,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS case_expenses_case_idx ON public.case_expenses (case_id);
ALTER TABLE public.case_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_expenses FROM anon;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.projects  ADD COLUMN IF NOT EXISTS currency text;

CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(p_table text, p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_name) THEN
    EXECUTE p_sql;
  END IF;
END $$;

-- Costs are visible to Arena administrators and managers only. AI usage rows are written by
-- the server (service role) only.
SELECT pg_temp.ensure_policy('ai_usage_events', 'ai_usage_events_staff_read',
  $p$CREATE POLICY ai_usage_events_staff_read ON public.ai_usage_events FOR SELECT TO authenticated USING (public.is_staff())$p$);
SELECT pg_temp.ensure_policy('case_expenses', 'case_expenses_staff_all',
  $p$CREATE POLICY case_expenses_staff_all ON public.case_expenses FOR ALL TO authenticated
     USING (public.is_staff()) WITH CHECK (public.is_staff())$p$);

-- SAP operations per case and month (VM cost allocation by share): writes / releases
-- (sap_action_tickets) and AI calls that used the live SAP tools.
CREATE OR REPLACE FUNCTION public.sap_ops_share(p_case uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ops AS (
    SELECT case_id, date_trunc('month', created_at) m FROM sap_action_tickets
    UNION ALL
    SELECT case_id, date_trunc('month', created_at) m FROM ai_usage_events WHERE mcp
  ),
  tot AS (SELECT m, count(*) n FROM ops GROUP BY m),
  mine AS (SELECT m, count(*) n FROM ops WHERE case_id = p_case GROUP BY m)
  SELECT CASE WHEN public.is_staff() THEN coalesce(jsonb_agg(jsonb_build_object('month', to_char(mine.m, 'YYYY-MM'), 'ops', mine.n, 'total', tot.n) ORDER BY mine.m), '[]'::jsonb) ELSE '[]'::jsonb END
  FROM mine JOIN tot USING (m);
$$;
REVOKE EXECUTE ON FUNCTION public.sap_ops_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sap_ops_share(uuid) TO authenticated, service_role;
