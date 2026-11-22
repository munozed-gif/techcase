-- Service-plan proposals (UE plans / on demand) and service contracts with an hours pool.
--   • partners.service_plans: each partner's catalog (UE hours, bands, rates per term, extra hour,
--     on-demand, multipliers, SLA, premises). Platform default: system_settings.service_plans_default.
--   • project_proposals.accepted_option: the plan option (term) the customer chose.
--   • service_contracts: created when a plan / on-demand proposal is accepted.
--   • time_logs.service_factor: 1 normal, 1.5 specialist, 2 on site (hours counted against the pool).
--   • invoices: service_contract_id / period_month / kind / currency / project_id for contract billing.
--   • proposal_decide_v2(token, decision, name, note, option): customer picks the option; the old
--     proposal_decide delegates to it.
-- No DROP / DELETE.

ALTER TABLE public.partners          ADD COLUMN IF NOT EXISTS service_plans jsonb;
ALTER TABLE public.project_proposals ADD COLUMN IF NOT EXISTS accepted_option jsonb;
ALTER TABLE public.time_logs         ADD COLUMN IF NOT EXISTS service_factor numeric NOT NULL DEFAULT 1;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS service_contract_id uuid,
  ADD COLUMN IF NOT EXISTS period_month date,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS project_id uuid;

CREATE TABLE IF NOT EXISTS public.service_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  partner_id      uuid REFERENCES public.partners(id),
  customer_id     uuid,
  proposal_id     uuid REFERENCES public.project_proposals(id),
  kind            text NOT NULL CHECK (kind IN ('plan','on_demand')),
  ue              numeric,
  band            text,
  band_name       text,
  hours_per_month numeric,
  months          integer,
  total_hours     numeric,
  start_date      date NOT NULL,
  end_date        date,
  currency        text NOT NULL DEFAULT 'USD',
  hour_rate       numeric,
  total_amount    numeric,
  monthly_amount  numeric,
  extra_hour_rate numeric,
  min_monthly     numeric,
  tax_pct         numeric NOT NULL DEFAULT 0,
  factors         jsonb,
  sla             jsonb,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','cancelled')),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_contracts' AND policyname='service_contracts_read') THEN
    CREATE POLICY service_contracts_read ON public.service_contracts FOR SELECT TO authenticated
      USING (public.is_staff() OR public.can_manage_proposals(project_id) OR public.user_can_access_project(project_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_contracts' AND policyname='service_contracts_update') THEN
    CREATE POLICY service_contracts_update ON public.service_contracts FOR UPDATE TO authenticated
      USING (public.is_staff() OR public.can_manage_proposals(project_id))
      WITH CHECK (public.is_staff() OR public.can_manage_proposals(project_id));
  END IF;
END $$;

CREATE OR REPLACE TRIGGER service_contracts_touch BEFORE UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.proposals_touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS invoices_contract_period_kind
  ON public.invoices (service_contract_id, period_month, kind) WHERE service_contract_id IS NOT NULL;

-- ── Customer decision with plan option ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proposal_decide_v2(p_token text, p_decision text, p_name text, p_note text DEFAULT NULL, p_option integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v project_proposals%ROWTYPE; c uuid; v_budget numeric; u uuid; v_title text; v_body text; v_spec uuid;
        v_type text; v_opt jsonb; v_n int; v_start date; v_contract uuid;
BEGIN
  IF p_decision NOT IN ('accepted','changes_requested','rejected') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Your name is required' USING ERRCODE = '22023'; END IF;
  IF p_decision <> 'accepted' AND coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Please add a comment' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM project_proposals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '42501'; END IF;
  IF v.status NOT IN ('sent','viewed') THEN RAISE EXCEPTION 'This proposal can no longer be answered' USING ERRCODE = '42501'; END IF;
  IF v.valid_until IS NOT NULL AND v.valid_until < current_date THEN RAISE EXCEPTION 'This proposal has expired' USING ERRCODE = '42501'; END IF;

  v_type := coalesce(v.totals ->> 'type', 'cases');

  -- Plan proposals: the customer chooses one of the offered terms
  IF p_decision = 'accepted' AND v_type = 'plan' THEN
    v_n := coalesce(jsonb_array_length(v.totals -> 'options'), 0);
    IF v_n = 0 THEN RAISE EXCEPTION 'This proposal has no plan options' USING ERRCODE = '22023'; END IF;
    IF p_option IS NULL AND v_n = 1 THEN
      v_opt := v.totals -> 'options' -> 0;
    ELSE
      SELECT o INTO v_opt FROM jsonb_array_elements(v.totals -> 'options') o WHERE (o ->> 'months')::int = p_option;
      IF v_opt IS NULL THEN RAISE EXCEPTION 'Please choose one of the plan options' USING ERRCODE = '22023'; END IF;
    END IF;
  END IF;

  UPDATE project_proposals SET status = p_decision, decided_at = now(), decided_by_name = trim(p_name),
         decision_note = NULLIF(trim(coalesce(p_note, '')), ''), accepted_option = v_opt WHERE id = v.id;
  INSERT INTO proposal_events (proposal_id, event, actor_name, note)
  VALUES (v.id, p_decision, trim(p_name),
          NULLIF(trim(coalesce(p_note, '') || CASE WHEN v_opt IS NOT NULL THEN ' [' || (v_opt ->> 'months') || ' months]' ELSE '' END), ''));

  IF p_decision = 'accepted' THEN
    FOREACH c IN ARRAY v.case_ids LOOP
      v_budget := CASE WHEN v_type = 'cases' THEN NULLIF(v.totals -> 'cases' -> c::text ->> 'budget', '')::numeric END;
      IF EXISTS (SELECT 1 FROM cases WHERE id = c AND status::text = 'proposal_pending') THEN
        IF v_budget IS NOT NULL THEN
          UPDATE cases SET budget = round(v_budget, 2), currency = v.currency WHERE id = c;
        END IF;
        PERFORM public._proposal_case_status(c, 'estimated', NULL, 'Proposal ' || v.title || ' accepted by ' || trim(p_name));
      ELSE
        SELECT id INTO v_spec FROM case_specifications WHERE case_id = c ORDER BY created_at DESC LIMIT 1;
        IF v_spec IS NOT NULL THEN
          UPDATE case_specifications SET status = 'approved', approved_at = now(), rejected_reason = NULL, updated_at = now()
           WHERE id = v_spec AND status IS DISTINCT FROM 'approved';
          IF FOUND THEN
            INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, old_value, new_value, metadata)
            SELECT 'spec.approved', NULL, 'case', c::text, title, NULL, jsonb_build_object('spec_status', 'approved'),
                   jsonb_build_object('source', 'proposal', 'proposal_id', v.id, 'approved_by_customer', trim(p_name))
            FROM cases WHERE id = c;
          END IF;
        END IF;
        IF v_budget IS NOT NULL THEN
          UPDATE cases SET budget = round(v_budget, 2), currency = v.currency WHERE id = c;
        END IF;
      END IF;
    END LOOP;

    -- Service contract for plan / on-demand proposals
    IF v_type IN ('plan','on_demand') THEN
      v_start := coalesce(NULLIF(v.commercials ->> 'startDate', '')::date, current_date);
      INSERT INTO service_contracts (project_id, partner_id, customer_id, proposal_id, kind, ue, band, band_name,
        hours_per_month, months, total_hours, start_date, end_date, currency, hour_rate, total_amount, monthly_amount,
        extra_hour_rate, min_monthly, tax_pct, factors, sla, created_by)
      VALUES (v.project_id, v.partner_id, v.customer_id, v.id, v_type,
        CASE WHEN v_type = 'plan' THEN (v.totals ->> 'ue')::numeric END,
        v_opt ->> 'band', v_opt ->> 'bandName',
        (v_opt ->> 'hoursMonth')::numeric, (v_opt ->> 'months')::int, (v_opt ->> 'totalHours')::numeric,
        v_start,
        CASE WHEN v_type = 'plan' THEN ((v_start + make_interval(months => (v_opt ->> 'months')::int))::date - 1) END,
        v.currency,
        CASE WHEN v_type = 'plan' THEN (v_opt ->> 'rate')::numeric ELSE (v.totals ->> 'rate')::numeric END,
        (v_opt ->> 'total')::numeric, (v_opt ->> 'monthly')::numeric,
        (v.totals ->> 'extraHourRate')::numeric,
        CASE WHEN v_type = 'on_demand' THEN (v.totals ->> 'minMonthly')::numeric END,
        coalesce((v.totals ->> 'taxPct')::numeric, 0),
        v.totals -> 'factors', v.totals -> 'sla', v.created_by)
      RETURNING id INTO v_contract;
    END IF;
  ELSIF p_decision = 'rejected' THEN
    PERFORM public._proposal_restore_cases(v.id, v.case_ids, 'Proposal ' || v.title || ' rejected by ' || trim(p_name));
  END IF;

  v_title := CASE p_decision WHEN 'accepted' THEN 'Proposal accepted' WHEN 'rejected' THEN 'Proposal rejected' ELSE 'Proposal: changes requested' END;
  v_body  := v.title || ' (v' || v.version || ') — ' || trim(p_name)
             || CASE WHEN v_opt IS NOT NULL THEN ' · ' || (v_opt ->> 'months') || ' months' ELSE '' END
             || coalesce(': ' || NULLIF(trim(coalesce(p_note, '')), ''), '');
  FOR u IN
    SELECT DISTINCT x FROM (
      SELECT v.created_by AS x
      UNION SELECT m.user_id FROM partner_members m WHERE m.partner_id = v.partner_id AND m.role IN ('owner','admin')
    ) s WHERE x IS NOT NULL
  LOOP
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (u, 'proposal', v_title, v_body, jsonb_build_object('proposal_id', v.id, 'project_id', v.project_id, 'contract_id', v_contract), 'proposal');
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'status', p_decision, 'contract_id', v_contract);
END $$;

CREATE OR REPLACE FUNCTION public.proposal_decide(p_token text, p_decision text, p_name text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.proposal_decide_v2(p_token, p_decision, p_name, p_note, NULL);
$$;

REVOKE ALL ON FUNCTION public.proposal_decide_v2(text, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.proposal_decide_v2(text, text, text, text, integer) TO anon, authenticated;

-- ── Contract usage (hours pool) ─────────────────────────────────────────────
-- Hours logged on the project's cases inside the contract period, weighted by service_factor.
CREATE OR REPLACE FUNCTION public.service_contract_usage(p_contract uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k service_contracts%ROWTYPE; v_months jsonb; v_used numeric;
BEGIN
  SELECT * INTO k FROM service_contracts WHERE id = p_contract;
  IF NOT FOUND OR NOT (public.is_staff() OR public.can_manage_proposals(k.project_id) OR public.user_can_access_project(k.project_id)) THEN
    RAISE EXCEPTION 'Contract not found' USING ERRCODE = '42501';
  END IF;
  WITH logs AS (
    SELECT date_trunc('month', t.log_date)::date AS m, sum(t.hours) AS raw, sum(t.hours * coalesce(t.service_factor, 1)) AS counted
    FROM time_logs t JOIN cases c ON c.id = t.case_id
    WHERE c.project_id = k.project_id AND t.log_date >= k.start_date AND (k.end_date IS NULL OR t.log_date <= k.end_date)
    GROUP BY 1
  ), cum AS (
    SELECT m, raw, counted, sum(counted) OVER (ORDER BY m) AS cumulative FROM logs
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'month', m, 'raw', round(raw, 2), 'counted', round(counted, 2), 'cumulative', round(cumulative, 2),
           'extra', CASE WHEN k.kind = 'plan' THEN round(greatest(0, cumulative - k.total_hours) - greatest(0, cumulative - counted - k.total_hours), 2) ELSE 0 END,
           'invoices', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'amount', i.amount, 'status', i.status, 'number', i.invoice_number)), '[]'::jsonb)
                        FROM invoices i WHERE i.service_contract_id = k.id AND i.period_month = m)
         ) ORDER BY m), '[]'::jsonb), coalesce(max(cumulative), 0)
    INTO v_months, v_used FROM cum;
  RETURN jsonb_build_object('contract_id', k.id, 'kind', k.kind, 'total_hours', k.total_hours, 'used', round(v_used, 2),
    'remaining', CASE WHEN k.kind = 'plan' THEN round(greatest(0, k.total_hours - v_used), 2) END,
    'months', v_months,
    'invoices', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'period_month', i.period_month, 'amount', i.amount,
                   'status', i.status, 'number', i.invoice_number, 'issue_date', i.issue_date, 'due_date', i.due_date) ORDER BY i.created_at), '[]'::jsonb)
                 FROM invoices i WHERE i.service_contract_id = k.id));
END $$;
REVOKE ALL ON FUNCTION public.service_contract_usage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.service_contract_usage(uuid) TO authenticated;

-- ── Contract invoices ───────────────────────────────────────────────────────
--   prepaid     (plan)      : the whole term, once, at the start
--   extra       (plan)      : hours of month p_month beyond the pool × extra-hour rate
--   minimum     (on_demand) : minimum monthly payment for p_month
--   consumption (on_demand) : hours of p_month × rate, minus the minimum already paid
CREATE OR REPLACE FUNCTION public.service_contract_invoice(p_contract uuid, p_kind text, p_month date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k service_contracts%ROWTYPE; v_month date; v_hours numeric := 0; v_amount numeric; v_note text; v_id uuid;
        v_client uuid; v_cum_before numeric; v_cum_after numeric;
BEGIN
  SELECT * INTO k FROM service_contracts WHERE id = p_contract;
  IF NOT FOUND OR NOT (public.is_staff() OR public.can_manage_proposals(k.project_id)) THEN
    RAISE EXCEPTION 'Contract not found' USING ERRCODE = '42501';
  END IF;
  IF (k.kind = 'plan' AND p_kind NOT IN ('prepaid','extra')) OR (k.kind = 'on_demand' AND p_kind NOT IN ('minimum','consumption')) THEN
    RAISE EXCEPTION 'Invalid invoice type for this contract' USING ERRCODE = '22023';
  END IF;
  v_month := date_trunc('month', coalesce(p_month, CASE WHEN p_kind = 'prepaid' THEN k.start_date ELSE current_date END))::date;

  IF p_kind IN ('extra','consumption') THEN
    SELECT coalesce(sum(t.hours * coalesce(t.service_factor, 1)), 0) INTO v_hours
    FROM time_logs t JOIN cases c ON c.id = t.case_id
    WHERE c.project_id = k.project_id AND t.log_date >= greatest(k.start_date, v_month)
      AND t.log_date < (v_month + interval '1 month') AND (k.end_date IS NULL OR t.log_date <= k.end_date);
  END IF;

  IF p_kind = 'prepaid' THEN
    v_amount := k.total_amount;
    v_note := format('Prepaid plan %s — %s months, %s hours (%s h/month)', coalesce(k.band_name, ''), k.months, k.total_hours, k.hours_per_month);
  ELSIF p_kind = 'extra' THEN
    SELECT coalesce(sum(t.hours * coalesce(t.service_factor, 1)), 0) INTO v_cum_before
    FROM time_logs t JOIN cases c ON c.id = t.case_id
    WHERE c.project_id = k.project_id AND t.log_date >= k.start_date AND t.log_date < v_month;
    v_cum_after := v_cum_before + v_hours;
    v_hours := greatest(0, v_cum_after - k.total_hours) - greatest(0, v_cum_before - k.total_hours);
    IF v_hours <= 0 THEN RAISE EXCEPTION 'No additional hours in that month' USING ERRCODE = '22023'; END IF;
    v_amount := v_hours * k.extra_hour_rate;
    v_note := format('Additional hours %s: %s h × %s', to_char(v_month, 'YYYY-MM'), round(v_hours, 2), k.extra_hour_rate);
  ELSIF p_kind = 'minimum' THEN
    v_amount := k.min_monthly;
    v_note := format('On-demand minimum payment %s', to_char(v_month, 'YYYY-MM'));
  ELSE
    v_amount := greatest(0, v_hours * k.hour_rate - coalesce(k.min_monthly, 0));
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Consumption in that month is covered by the minimum payment' USING ERRCODE = '22023'; END IF;
    v_note := format('On-demand consumption %s: %s h × %s, minus minimum %s', to_char(v_month, 'YYYY-MM'), round(v_hours, 2), k.hour_rate, coalesce(k.min_monthly, 0));
  END IF;

  v_amount := round(v_amount * (1 + coalesce(k.tax_pct, 0) / 100), 2);
  IF coalesce(k.tax_pct, 0) > 0 THEN v_note := v_note || format(' (incl. %s%% tax)', k.tax_pct); END IF;
  SELECT client_id INTO v_client FROM projects WHERE id = k.project_id;

  INSERT INTO invoices (invoice_number, client_id, amount, status, issue_date, due_date, notes, issued_by,
                        service_contract_id, period_month, kind, currency, project_id)
  VALUES ('SVC-' || to_char(v_month, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          v_client, v_amount, 'draft', current_date, current_date + 5, v_note, auth.uid(),
          k.id, v_month, p_kind, k.currency, k.project_id)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'An invoice of this type already exists for that month' USING ERRCODE = '23505';
END $$;
REVOKE ALL ON FUNCTION public.service_contract_invoice(uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.service_contract_invoice(uuid, text, date) TO authenticated;

-- Contract invoices are readable by whoever manages the contract
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoices' AND policyname='inv_read_service_contract') THEN
    CREATE POLICY inv_read_service_contract ON public.invoices FOR SELECT TO authenticated
      USING (service_contract_id IS NOT NULL AND project_id IS NOT NULL AND public.can_manage_proposals(project_id));
  END IF;
END $$;
