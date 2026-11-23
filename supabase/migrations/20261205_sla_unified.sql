-- Unified SLA: one policy shape everywhere = the service-plan SLA
--   { types:[{key,en,es}], priorities:[{key,en,es}], matrix:{type:{priority:[response_h, solution_h]}},
--     calendar:{start:'09:00', hoursPerDay:8, workDays:[1..5], timezone}, terms:{tier, uptime_pct, dedicated_consultant, priority_support, notes} }
-- Resolution for a case (most specific wins): active service contract of its project → customer override
-- (customers.sla) → partner catalog (partners.service_plans.sla) → platform (system_settings.service_plans_default.sla)
-- → built-in default. Business hours only. Cases with an SLA type are timed in sla_tracking.
-- No DROP / DELETE.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sla jsonb;
ALTER TABLE public.cases     ADD COLUMN IF NOT EXISTS sla_type text;

ALTER TABLE public.sla_tracking
  ADD COLUMN IF NOT EXISTS sla_type          text,
  ADD COLUMN IF NOT EXISTS priority          text,
  ADD COLUMN IF NOT EXISTS source            text,
  ADD COLUMN IF NOT EXISTS contract_id       uuid,
  ADD COLUMN IF NOT EXISTS calendar          jsonb,
  ADD COLUMN IF NOT EXISTS response_hours    numeric,
  ADD COLUMN IF NOT EXISTS resolution_hours  numeric,
  ADD COLUMN IF NOT EXISTS response_due      timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due    timestamptz,
  ADD COLUMN IF NOT EXISTS response_warned   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_warned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS sla_tracking_case_uidx ON public.sla_tracking (case_id);
CREATE INDEX IF NOT EXISTS sla_tracking_running_idx ON public.sla_tracking (status) WHERE status = 'running';

-- Tracking rows are written by the platform (triggers / RPCs), not by users.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_tracking' AND policyname='zz_sla_write_staff_upd') THEN
    CREATE POLICY zz_sla_write_staff_upd ON public.sla_tracking AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_tracking' AND policyname='zz_sla_write_staff_ins') THEN
    CREATE POLICY zz_sla_write_staff_ins ON public.sla_tracking AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_staff());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_tracking' AND policyname='zz_sla_write_staff_del') THEN
    CREATE POLICY zz_sla_write_staff_del ON public.sla_tracking AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_staff());
  END IF;
END $$;

-- ── Policy ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sla_builtin()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{
    "types":[{"key":"error","en":"Error","es":"Error"},{"key":"info","en":"General information","es":"Información general"},{"key":"improvement","en":"Improvement","es":"Mejora"}],
    "priorities":[{"key":"critical","en":"Critical","es":"Crítico"},{"key":"high","en":"High","es":"Alto"},{"key":"normal","en":"Normal","es":"Normal"},{"key":"low","en":"Low","es":"Bajo"}],
    "matrix":{"error":{"critical":[0.5,4],"high":[1,8],"normal":[2,16],"low":[4,32]},
              "info":{"critical":[1,8],"high":[2,16],"normal":[4,32],"low":[8,64]},
              "improvement":{"critical":[2,16],"high":[3,32],"normal":[6,48],"low":[16,96]}},
    "calendar":{"start":"09:00","hoursPerDay":8,"workDays":[1,2,3,4,5],"timezone":"America/Mexico_City"},
    "terms":{"tier":"standard","uptime_pct":99,"dedicated_consultant":false,"priority_support":false,"notes":""}
  }'::jsonb;
$$;

-- Fill a (possibly partial) policy with the built-in defaults; p_catalog_hpd = the catalog's hoursPerDay.
CREATE OR REPLACE FUNCTION public._sla_normalize(p jsonb, p_catalog_hpd numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT b
    || jsonb_build_object('matrix', (b -> 'matrix') || coalesce(CASE WHEN jsonb_typeof(p -> 'matrix') = 'object' THEN p -> 'matrix' END, '{}'::jsonb))
    || CASE WHEN jsonb_typeof(p -> 'types') = 'array' AND jsonb_array_length(p -> 'types') > 0 THEN jsonb_build_object('types', p -> 'types') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(p -> 'priorities') = 'array' AND jsonb_array_length(p -> 'priorities') > 0 THEN jsonb_build_object('priorities', p -> 'priorities') ELSE '{}'::jsonb END
    || jsonb_build_object('calendar', (b -> 'calendar')
         || CASE WHEN p_catalog_hpd IS NOT NULL THEN jsonb_build_object('hoursPerDay', p_catalog_hpd) ELSE '{}'::jsonb END
         || coalesce(CASE WHEN jsonb_typeof(p -> 'calendar') = 'object' THEN p -> 'calendar' END, '{}'::jsonb))
    || jsonb_build_object('terms', (b -> 'terms') || coalesce(CASE WHEN jsonb_typeof(p -> 'terms') = 'object' THEN p -> 'terms' END, '{}'::jsonb))
  FROM (SELECT public._sla_builtin() b) x;
$$;

-- Effective SLA for a customer / project / legacy client user: { policy, source, contract_id }.
CREATE OR REPLACE FUNCTION public._sla_effective(p_customer uuid, p_partner uuid, p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_c uuid; v_cat jsonb;
BEGIN
  IF p_project IS NOT NULL THEN
    SELECT sc.sla, sc.id INTO v, v_c FROM service_contracts sc
     WHERE sc.project_id = p_project AND sc.status = 'active' AND (sc.end_date IS NULL OR sc.end_date >= current_date)
     ORDER BY sc.created_at DESC LIMIT 1;
    IF v IS NOT NULL AND jsonb_typeof(v) = 'object' THEN
      RETURN jsonb_build_object('policy', public._sla_normalize(v), 'source', 'contract', 'contract_id', v_c);
    END IF;
    IF p_customer IS NULL OR p_partner IS NULL THEN
      SELECT coalesce(p_customer, customer_id), coalesce(p_partner, partner_id) INTO p_customer, p_partner FROM projects WHERE id = p_project;
    END IF;
  END IF;
  IF p_customer IS NOT NULL THEN
    SELECT sla, coalesce(p_partner, partner_id) INTO v, p_partner FROM customers WHERE id = p_customer;
    IF v IS NOT NULL AND jsonb_typeof(v) = 'object' THEN
      RETURN jsonb_build_object('policy', public._sla_normalize(v), 'source', 'customer');
    END IF;
  END IF;
  IF p_partner IS NOT NULL THEN
    SELECT service_plans INTO v_cat FROM partners WHERE id = p_partner;
    IF jsonb_typeof(v_cat -> 'sla') = 'object' THEN
      RETURN jsonb_build_object('policy', public._sla_normalize(v_cat -> 'sla', NULLIF(v_cat ->> 'hoursPerDay', '')::numeric), 'source', 'partner');
    END IF;
  END IF;
  SELECT value INTO v_cat FROM system_settings WHERE key = 'service_plans_default';
  IF jsonb_typeof(v_cat -> 'sla') = 'object' THEN
    RETURN jsonb_build_object('policy', public._sla_normalize(v_cat -> 'sla', NULLIF(v_cat ->> 'hoursPerDay', '')::numeric), 'source', 'platform');
  END IF;
  RETURN jsonb_build_object('policy', public._sla_builtin(), 'source', 'default');
END $$;

-- Public read of the effective SLA (customer page, client profile, partner customer card).
CREATE OR REPLACE FUNCTION public.sla_effective(p_customer uuid DEFAULT NULL, p_project uuid DEFAULT NULL, p_client_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF p_customer IS NULL AND p_client_user IS NOT NULL THEN
    SELECT id INTO p_customer FROM customers WHERE client_user_id = p_client_user ORDER BY created_at LIMIT 1;
  END IF;
  IF p_project IS NOT NULL AND NOT public.user_can_access_project(p_project) THEN RETURN NULL; END IF;
  IF p_customer IS NOT NULL THEN
    SELECT partner_id INTO v_partner FROM customers WHERE id = p_customer;
    IF NOT (public.is_staff() OR public.is_partner_member(v_partner) OR public.is_customer_member(p_customer)) THEN RETURN NULL; END IF;
  END IF;
  RETURN public._sla_effective(p_customer, v_partner, p_project);
END $$;

-- Add business hours to a timestamp following the calendar (timezone, start, hours per day, work days).
CREATE OR REPLACE FUNCTION public._sla_add_bhours(p_start timestamptz, p_hours numeric, cal jsonb)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE
  tz text := coalesce(NULLIF(cal ->> 'timezone', ''), 'UTC');
  hpd numeric := greatest(coalesce(NULLIF(cal ->> 'hoursPerDay', '')::numeric, 8), 0.5);
  st time := coalesce(NULLIF(cal ->> 'start', '')::time, '09:00'::time);
  days int[] := coalesce((SELECT array_agg(x::int) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(cal -> 'workDays') = 'array' THEN cal -> 'workDays' END) x), ARRAY[1,2,3,4,5]);
  loc timestamp; d date; ws timestamp; we timestamp; avail numeric; remaining numeric := greatest(coalesce(p_hours, 0), 0) * 3600; i int := 0;
BEGIN
  IF p_start IS NULL THEN RETURN NULL; END IF;
  IF cardinality(days) = 0 THEN days := ARRAY[1,2,3,4,5]; END IF;
  loc := p_start AT TIME ZONE tz;
  LOOP
    i := i + 1;
    EXIT WHEN i > 3000;
    d := loc::date;
    ws := d + st; we := ws + make_interval(secs => hpd * 3600);
    IF extract(isodow FROM d)::int = ANY (days) AND loc < we THEN
      IF loc < ws THEN loc := ws; END IF;
      avail := extract(epoch FROM (we - loc));
      IF remaining <= avail THEN RETURN (loc + make_interval(secs => remaining)) AT TIME ZONE tz; END IF;
      remaining := remaining - avail;
    END IF;
    loc := (d + 1)::timestamp;
  END LOOP;
  RETURN (loc) AT TIME ZONE tz;
END $$;

CREATE OR REPLACE FUNCTION public._sla_priority_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p, 'normal')) WHEN 'critical' THEN 'critical' WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high'
                                            WHEN 'low' THEN 'low' ELSE 'normal' END;
$$;

CREATE OR REPLACE FUNCTION public._sla_is_resolved(s text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(s, '')) IN ('resolved','completed','closed','done','delivered'); $$;
CREATE OR REPLACE FUNCTION public._sla_is_cancelled(s text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(s, '')) IN ('cancelled','canceled','terminated','rejected'); $$;

-- (Re)compute the case's SLA clock. Keeps first response / resolution times already recorded.
CREATE OR REPLACE FUNCTION public._sla_sync(p_case uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; t sla_tracking%ROWTYPE; eff jsonb; pol jsonb; v_prio text; v_pair jsonb; v_resp numeric; v_sol numeric;
        v_start timestamptz; v_rdue timestamptz; v_sdue timestamptz; v_resolved timestamptz; v_status text; v_first timestamptz;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO t FROM sla_tracking WHERE case_id = p_case;
  IF c.sla_type IS NULL THEN
    IF FOUND AND t.status = 'running' THEN UPDATE sla_tracking SET status = 'off', updated_at = now() WHERE id = t.id; END IF;
    RETURN;
  END IF;
  eff := public._sla_effective(c.customer_id, c.partner_id, c.project_id);
  pol := eff -> 'policy';
  v_prio := public._sla_priority_key(c.priority::text);
  v_pair := pol -> 'matrix' -> c.sla_type -> v_prio;
  IF jsonb_typeof(v_pair) <> 'array' THEN v_pair := pol -> 'matrix' -> 'info' -> v_prio; END IF;
  v_resp := NULLIF(v_pair ->> 0, '')::numeric; v_sol := NULLIF(v_pair ->> 1, '')::numeric;
  v_start := coalesce(t.assigned_at, c.created_at, now());
  v_rdue := public._sla_add_bhours(v_start, v_resp, pol -> 'calendar');
  v_sdue := public._sla_add_bhours(v_start, v_sol, pol -> 'calendar');
  v_first := t.first_response_at;
  v_resolved := t.resolved_at;
  IF public._sla_is_resolved(c.status::text) THEN
    v_resolved := coalesce(v_resolved, now()); v_first := coalesce(v_first, v_resolved);
    v_status := CASE WHEN v_resolved > v_sdue OR v_first > v_rdue THEN 'breached' ELSE 'met' END;
  ELSIF public._sla_is_cancelled(c.status::text) THEN
    v_status := 'cancelled';
  ELSE
    v_resolved := NULL; v_status := 'running';
  END IF;
  INSERT INTO sla_tracking (case_id, assigned_at, sla_type, priority, source, contract_id, calendar, response_hours, resolution_hours,
                            response_due, resolution_due, first_response_at, resolved_at, first_response_breached, resolution_breached, status, updated_at)
  VALUES (p_case, v_start, c.sla_type, v_prio, eff ->> 'source', NULLIF(eff ->> 'contract_id', '')::uuid, pol -> 'calendar', v_resp, v_sol,
          v_rdue, v_sdue, v_first, v_resolved,
          coalesce(v_first > v_rdue, false),
          coalesce(v_resolved > v_sdue, false),
          v_status, now())
  ON CONFLICT (case_id) DO UPDATE SET
    sla_type = EXCLUDED.sla_type, priority = EXCLUDED.priority, source = EXCLUDED.source, contract_id = EXCLUDED.contract_id,
    calendar = EXCLUDED.calendar, response_hours = EXCLUDED.response_hours, resolution_hours = EXCLUDED.resolution_hours,
    response_due = EXCLUDED.response_due, resolution_due = EXCLUDED.resolution_due, first_response_at = EXCLUDED.first_response_at,
    resolved_at = EXCLUDED.resolved_at,
    -- Pending targets keep the checker's flag while their due time is unchanged (the checker notifies once).
    first_response_breached = CASE WHEN EXCLUDED.first_response_at IS NOT NULL OR EXCLUDED.status <> 'running' THEN EXCLUDED.first_response_breached
                                   WHEN sla_tracking.response_due = EXCLUDED.response_due THEN sla_tracking.first_response_breached ELSE false END,
    resolution_breached = CASE WHEN EXCLUDED.status <> 'running' THEN EXCLUDED.resolution_breached
                               WHEN sla_tracking.resolution_due = EXCLUDED.resolution_due THEN sla_tracking.resolution_breached ELSE false END,
    status = EXCLUDED.status, updated_at = now(),
    response_warned = CASE WHEN sla_tracking.response_due IS DISTINCT FROM EXCLUDED.response_due THEN false ELSE sla_tracking.response_warned END,
    resolution_warned = CASE WHEN sla_tracking.resolution_due IS DISTINCT FROM EXCLUDED.resolution_due THEN false ELSE sla_tracking.resolution_warned END,
    breach_notified_at = sla_tracking.breach_notified_at;
END $$;
REVOKE ALL ON FUNCTION public._sla_sync(uuid) FROM public, anon, authenticated;

-- Default SLA type: tickets → error; cases of a project with an active service contract → general information.
CREATE OR REPLACE FUNCTION public.sla_case_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sla_type IS NULL AND (TG_OP = 'INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.case_type IS DISTINCT FROM OLD.case_type) THEN
    IF NEW.case_type = 'ticket' THEN NEW.sla_type := 'error';
    ELSIF NEW.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM service_contracts sc WHERE sc.project_id = NEW.project_id AND sc.status = 'active') THEN
      NEW.sla_type := 'info';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER sla_case_defaults BEFORE INSERT OR UPDATE OF project_id, case_type ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.sla_case_defaults();

CREATE OR REPLACE FUNCTION public.sla_case_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Leaving the initial status counts as the first response.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND lower(coalesce(OLD.status::text, '')) IN ('open','new','created','submitted','pending') THEN
    UPDATE sla_tracking SET first_response_at = coalesce(first_response_at, now()) WHERE case_id = NEW.id;
  END IF;
  IF NEW.sla_type IS NOT NULL OR EXISTS (SELECT 1 FROM sla_tracking WHERE case_id = NEW.id) THEN
    PERFORM public._sla_sync(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sla_case_changed AFTER INSERT OR UPDATE OF status, priority, sla_type, project_id, customer_id ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.sla_case_changed();

-- First response: a comment from the delivery side (not the customer), or an assignment.
CREATE OR REPLACE FUNCTION public.sla_first_response_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'case_comments' THEN
    IF NEW.author_id IS NULL OR NEW.author_id = c.client_id OR public._customer_member(c.customer_id, NEW.author_id)
       OR (NEW.author_id = c.created_by AND coalesce((SELECT role::text FROM users WHERE id = NEW.author_id), '') IN ('client','key_user','final_user','invited_client')) THEN
      RETURN NULL;
    END IF;
  END IF;
  UPDATE sla_tracking SET first_response_at = now(),
         first_response_breached = now() > response_due, updated_at = now()
   WHERE case_id = NEW.case_id AND first_response_at IS NULL AND status = 'running';
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sla_first_response_comment AFTER INSERT ON public.case_comments
  FOR EACH ROW EXECUTE FUNCTION public.sla_first_response_event();
CREATE OR REPLACE TRIGGER sla_first_response_assignment AFTER INSERT ON public.case_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sla_first_response_event();

-- Policy changes re-time the running clocks.
CREATE OR REPLACE FUNCTION public._sla_resync_where(p_customer uuid, p_partner uuid, p_project uuid, p_all boolean)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT t.case_id FROM sla_tracking t JOIN cases c ON c.id = t.case_id
           WHERE t.status = 'running' AND (p_all OR c.customer_id = p_customer OR c.partner_id = p_partner OR c.project_id = p_project) LOOP
    PERFORM public._sla_sync(r.case_id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._sla_resync_where(uuid, uuid, uuid, boolean) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sla_policy_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'customers' AND NEW.sla IS DISTINCT FROM OLD.sla THEN
    PERFORM public._sla_resync_where(NEW.id, NULL, NULL, false);
  ELSIF TG_TABLE_NAME = 'partners' AND (NEW.service_plans -> 'sla') IS DISTINCT FROM (OLD.service_plans -> 'sla') THEN
    PERFORM public._sla_resync_where(NULL, NEW.id, NULL, false);
  ELSIF TG_TABLE_NAME = 'service_contracts' AND (NEW.sla IS DISTINCT FROM OLD.sla OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM public._sla_resync_where(NULL, NULL, NEW.project_id, false);
  ELSIF TG_TABLE_NAME = 'system_settings' AND NEW.key = 'service_plans_default' AND (NEW.value -> 'sla') IS DISTINCT FROM (OLD.value -> 'sla') THEN
    PERFORM public._sla_resync_where(NULL, NULL, NULL, true);
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sla_policy_changed AFTER UPDATE OF sla ON public.customers FOR EACH ROW EXECUTE FUNCTION public.sla_policy_changed();
CREATE OR REPLACE TRIGGER sla_policy_changed AFTER UPDATE OF service_plans ON public.partners FOR EACH ROW EXECUTE FUNCTION public.sla_policy_changed();
CREATE OR REPLACE TRIGGER sla_policy_changed AFTER UPDATE OF sla, status ON public.service_contracts FOR EACH ROW EXECUTE FUNCTION public.sla_policy_changed();
CREATE OR REPLACE TRIGGER sla_policy_changed AFTER UPDATE OF value ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.sla_policy_changed();

-- New active contract: its project's open cases without a type get "general information".
CREATE OR REPLACE FUNCTION public.sla_contract_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.project_id IS NOT NULL THEN
    UPDATE cases SET sla_type = 'info'
     WHERE project_id = NEW.project_id AND sla_type IS NULL
       AND NOT public._sla_is_resolved(status::text) AND NOT public._sla_is_cancelled(status::text);
    PERFORM public._sla_resync_where(NULL, NULL, NEW.project_id, false);
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sla_contract_created AFTER INSERT ON public.service_contracts FOR EACH ROW EXECUTE FUNCTION public.sla_contract_created();

-- ── Warnings and breaches (idempotent; the app calls it every few minutes) ─────────────────────
CREATE OR REPLACE FUNCTION public._sla_notify(p_case uuid, p_title text, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type, case_id)
  SELECT DISTINCT u, 'sla', p_title, p_body, jsonb_build_object('case_id', p_case), 'sla', p_case
  FROM (
    SELECT c.manager_id AS u
    UNION SELECT ca.consultant_id FROM case_assignments ca WHERE ca.case_id = p_case AND coalesce(ca.is_active, true)
    UNION SELECT m.user_id FROM partner_members m WHERE m.partner_id = c.partner_id AND m.role IN ('owner','admin')
    UNION SELECT d.submitted_by FROM project_deliveries d WHERE d.project_id = c.project_id AND d.status = 'awarded'
  ) x WHERE u IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public._sla_notify(uuid, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sla_check_breaches()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n_warn int := 0; n_breach int := 0;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  FOR r IN SELECT t.*, c.title FROM sla_tracking t JOIN cases c ON c.id = t.case_id WHERE t.status = 'running' FOR UPDATE OF t SKIP LOCKED LOOP
    -- Response
    IF r.first_response_at IS NULL AND r.response_due IS NOT NULL THEN
      IF now() > r.response_due AND NOT r.first_response_breached THEN
        UPDATE sla_tracking SET first_response_breached = true, breach_notified_at = now() WHERE id = r.id;
        PERFORM public._sla_notify(r.case_id, 'SLA breached — first response', format('"%s" had no first response by %s.', r.title, to_char(r.response_due, 'YYYY-MM-DD HH24:MI TZ')));
        n_breach := n_breach + 1;
      ELSIF NOT r.response_warned AND now() >= r.assigned_at + (r.response_due - r.assigned_at) * 0.8 AND now() <= r.response_due THEN
        UPDATE sla_tracking SET response_warned = true WHERE id = r.id;
        PERFORM public._sla_notify(r.case_id, 'SLA at risk — first response', format('"%s" needs a first response before %s.', r.title, to_char(r.response_due, 'YYYY-MM-DD HH24:MI TZ')));
        n_warn := n_warn + 1;
      END IF;
    END IF;
    -- Resolution
    IF r.resolution_due IS NOT NULL THEN
      IF now() > r.resolution_due AND NOT r.resolution_breached THEN
        UPDATE sla_tracking SET resolution_breached = true, breach_notified_at = now() WHERE id = r.id;
        PERFORM public._sla_notify(r.case_id, 'SLA breached — resolution', format('"%s" was not solved by %s.', r.title, to_char(r.resolution_due, 'YYYY-MM-DD HH24:MI TZ')));
        n_breach := n_breach + 1;
      ELSIF NOT r.resolution_warned AND now() >= r.assigned_at + (r.resolution_due - r.assigned_at) * 0.8 AND now() <= r.resolution_due THEN
        UPDATE sla_tracking SET resolution_warned = true WHERE id = r.id;
        PERFORM public._sla_notify(r.case_id, 'SLA at risk — resolution', format('"%s" must be solved before %s.', r.title, to_char(r.resolution_due, 'YYYY-MM-DD HH24:MI TZ')));
        n_warn := n_warn + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('warned', n_warn, 'breached', n_breach);
END $$;

-- Monitor: the SLA clocks the user can see.
CREATE OR REPLACE FUNCTION public.sla_monitor()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'case_id', c.id, 'title', c.title, 'case_status', c.status, 'sla_type', t.sla_type, 'priority', t.priority, 'source', t.source,
    'started_at', t.assigned_at, 'response_due', t.response_due, 'resolution_due', t.resolution_due,
    'first_response_at', t.first_response_at, 'resolved_at', t.resolved_at,
    'response_breached', t.first_response_breached, 'resolution_breached', t.resolution_breached, 'status', t.status,
    'response_hours', t.response_hours, 'resolution_hours', t.resolution_hours,
    'project', (SELECT jsonb_build_object('id', p.id, 'name', p.name) FROM projects p WHERE p.id = c.project_id),
    'customer', coalesce((SELECT name FROM customers WHERE id = c.customer_id), (SELECT coalesce(cp.company_name, u.full_name) FROM users u LEFT JOIN client_profiles cp ON cp.id = u.id WHERE u.id = c.client_id LIMIT 1)),
    'partner', (SELECT name FROM partners WHERE id = c.partner_id)
  ) ORDER BY (t.status = 'running') DESC, t.resolution_due), '[]'::jsonb)
  FROM sla_tracking t JOIN cases c ON c.id = t.case_id
  WHERE t.status <> 'off' AND (public.is_staff() OR public.user_can_access_case(c.id));
$$;

-- Case detail: one case's clock.
CREATE OR REPLACE FUNCTION public.sla_for_case(p_case uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.user_can_access_case(p_case) THEN (
    SELECT to_jsonb(t) - 'profile_id' FROM sla_tracking t WHERE t.case_id = p_case) END;
$$;

-- Set the SLA type of a case (delivery side / staff).
CREATE OR REPLACE FUNCTION public.sla_set_case_type(p_case uuid, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND OR NOT public.user_can_access_case(p_case) THEN RAISE EXCEPTION 'Case not found' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_staff() OR c.manager_id = auth.uid() OR public.is_partner_member(c.partner_id, ARRAY['owner','admin'])
          OR public.is_project_delivery_member(c.project_id, true) OR c.created_by = auth.uid() OR c.client_id = auth.uid()
          OR public.is_customer_member(c.customer_id)) THEN
    RAISE EXCEPTION 'You cannot change the SLA of this case' USING ERRCODE = '42501';
  END IF;
  UPDATE cases SET sla_type = NULLIF(trim(coalesce(p_type, '')), '') WHERE id = p_case;
END $$;

-- Explicit re-time after a policy edit made through the app (e.g. customer override).
CREATE OR REPLACE FUNCTION public.sla_resync(p_customer uuid DEFAULT NULL, p_project uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff()
          OR (p_customer IS NOT NULL AND EXISTS (SELECT 1 FROM customers x WHERE x.id = p_customer AND public.is_partner_member(x.partner_id, ARRAY['owner','admin'])))
          OR (p_project IS NOT NULL AND public.can_manage_proposals(p_project))) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._sla_resync_where(p_customer, NULL, p_project, false);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['sla_effective(uuid, uuid, uuid)', 'sla_check_breaches()', 'sla_monitor()', 'sla_for_case(uuid)',
                           'sla_set_case_type(uuid, text)', 'sla_resync(uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._sla_effective(uuid, uuid, uuid) FROM public, anon, authenticated;
