-- SLA pause: while a case waits for the customer (status pending_customer / pending_user) its SLA
-- clock stops. The business hours spent waiting are added to the due times when the case resumes.
-- No DROP / DELETE.

ALTER TABLE public.sla_tracking
  ADD COLUMN IF NOT EXISTS paused_at    timestamptz,
  ADD COLUMN IF NOT EXISTS paused_hours numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._sla_is_paused_status(s text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(s, '')) IN ('pending_customer','pending_user'); $$;

-- Business hours between two instants on the calendar.
CREATE OR REPLACE FUNCTION public._sla_bhours_between(p_from timestamptz, p_to timestamptz, cal jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE
  tz text := coalesce(NULLIF(cal ->> 'timezone', ''), 'UTC');
  hpd numeric := greatest(coalesce(NULLIF(cal ->> 'hoursPerDay', '')::numeric, 8), 0.5);
  st time := coalesce(NULLIF(cal ->> 'start', '')::time, '09:00'::time);
  days int[] := coalesce((SELECT array_agg(x::int) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(cal -> 'workDays') = 'array' THEN cal -> 'workDays' END) x), ARRAY[1,2,3,4,5]);
  a timestamp; b timestamp; d date; ws timestamp; we timestamp; secs numeric := 0; i int := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RETURN 0; END IF;
  IF cardinality(days) = 0 THEN days := ARRAY[1,2,3,4,5]; END IF;
  a := p_from AT TIME ZONE tz; b := p_to AT TIME ZONE tz;
  d := a::date;
  WHILE d <= b::date AND i < 3000 LOOP
    i := i + 1;
    IF extract(isodow FROM d)::int = ANY (days) THEN
      ws := greatest(d + st, a); we := least(d + st + make_interval(secs => hpd * 3600), b);
      IF we > ws THEN secs := secs + extract(epoch FROM (we - ws)); END IF;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN round(secs / 3600.0, 4);
END $$;

-- (Re)compute the clock; handles pause / resume.
CREATE OR REPLACE FUNCTION public._sla_sync(p_case uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; t sla_tracking%ROWTYPE; eff jsonb; pol jsonb; v_prio text; v_pair jsonb; v_resp numeric; v_sol numeric;
        v_start timestamptz; v_rdue timestamptz; v_sdue timestamptz; v_resolved timestamptz; v_status text; v_first timestamptz;
        v_paused_at timestamptz; v_paused numeric;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO t FROM sla_tracking WHERE case_id = p_case;
  IF c.sla_type IS NULL THEN
    IF FOUND AND t.status IN ('running','paused') THEN UPDATE sla_tracking SET status = 'off', paused_at = NULL, updated_at = now() WHERE id = t.id; END IF;
    RETURN;
  END IF;
  eff := public._sla_effective(c.customer_id, c.partner_id, c.project_id);
  pol := eff -> 'policy';
  v_prio := public._sla_priority_key(c.priority::text);
  v_pair := pol -> 'matrix' -> c.sla_type -> v_prio;
  IF jsonb_typeof(v_pair) <> 'array' THEN v_pair := pol -> 'matrix' -> 'info' -> v_prio; END IF;
  v_resp := NULLIF(v_pair ->> 0, '')::numeric; v_sol := NULLIF(v_pair ->> 1, '')::numeric;
  v_start := coalesce(t.assigned_at, c.created_at, now());

  -- Pause bookkeeping: close an open pause unless the case is still waiting for the customer.
  v_paused := coalesce(t.paused_hours, 0);
  v_paused_at := t.paused_at;
  IF v_paused_at IS NOT NULL AND NOT public._sla_is_paused_status(c.status::text) THEN
    v_paused := v_paused + public._sla_bhours_between(v_paused_at, now(), pol -> 'calendar');
    v_paused_at := NULL;
  ELSIF v_paused_at IS NULL AND public._sla_is_paused_status(c.status::text) THEN
    v_paused_at := now();
  END IF;

  v_rdue := public._sla_add_bhours(v_start, v_resp + v_paused, pol -> 'calendar');
  v_sdue := public._sla_add_bhours(v_start, v_sol + v_paused, pol -> 'calendar');
  v_first := t.first_response_at;
  v_resolved := t.resolved_at;
  IF public._sla_is_resolved(c.status::text) THEN
    v_resolved := coalesce(v_resolved, now()); v_first := coalesce(v_first, v_resolved);
    v_status := CASE WHEN v_resolved > v_sdue OR v_first > v_rdue THEN 'breached' ELSE 'met' END;
  ELSIF public._sla_is_cancelled(c.status::text) THEN
    v_status := 'cancelled';
  ELSIF v_paused_at IS NOT NULL THEN
    v_resolved := NULL; v_status := 'paused';
  ELSE
    v_resolved := NULL; v_status := 'running';
  END IF;
  INSERT INTO sla_tracking (case_id, assigned_at, sla_type, priority, source, contract_id, calendar, response_hours, resolution_hours,
                            response_due, resolution_due, first_response_at, resolved_at, first_response_breached, resolution_breached,
                            status, paused_at, paused_hours, updated_at)
  VALUES (p_case, v_start, c.sla_type, v_prio, eff ->> 'source', NULLIF(eff ->> 'contract_id', '')::uuid, pol -> 'calendar', v_resp, v_sol,
          v_rdue, v_sdue, v_first, v_resolved,
          coalesce(v_first > v_rdue, false),
          coalesce(v_resolved > v_sdue, false),
          v_status, v_paused_at, v_paused, now())
  ON CONFLICT (case_id) DO UPDATE SET
    sla_type = EXCLUDED.sla_type, priority = EXCLUDED.priority, source = EXCLUDED.source, contract_id = EXCLUDED.contract_id,
    calendar = EXCLUDED.calendar, response_hours = EXCLUDED.response_hours, resolution_hours = EXCLUDED.resolution_hours,
    response_due = EXCLUDED.response_due, resolution_due = EXCLUDED.resolution_due, first_response_at = EXCLUDED.first_response_at,
    resolved_at = EXCLUDED.resolved_at, paused_at = EXCLUDED.paused_at, paused_hours = EXCLUDED.paused_hours,
    first_response_breached = CASE WHEN EXCLUDED.first_response_at IS NOT NULL OR EXCLUDED.status NOT IN ('running','paused') THEN EXCLUDED.first_response_breached
                                   WHEN sla_tracking.response_due = EXCLUDED.response_due THEN sla_tracking.first_response_breached ELSE false END,
    resolution_breached = CASE WHEN EXCLUDED.status NOT IN ('running','paused') THEN EXCLUDED.resolution_breached
                               WHEN sla_tracking.resolution_due = EXCLUDED.resolution_due THEN sla_tracking.resolution_breached ELSE false END,
    status = EXCLUDED.status, updated_at = now(),
    response_warned = CASE WHEN sla_tracking.response_due IS DISTINCT FROM EXCLUDED.response_due THEN false ELSE sla_tracking.response_warned END,
    resolution_warned = CASE WHEN sla_tracking.resolution_due IS DISTINCT FROM EXCLUDED.resolution_due THEN false ELSE sla_tracking.resolution_warned END,
    breach_notified_at = sla_tracking.breach_notified_at;
END $$;
REVOKE ALL ON FUNCTION public._sla_sync(uuid) FROM public, anon, authenticated;

-- Paused clocks are re-timed with the others when a policy changes.
CREATE OR REPLACE FUNCTION public._sla_resync_where(p_customer uuid, p_partner uuid, p_project uuid, p_all boolean)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT t.case_id FROM sla_tracking t JOIN cases c ON c.id = t.case_id
           WHERE t.status IN ('running','paused') AND (p_all OR c.customer_id = p_customer OR c.partner_id = p_partner OR c.project_id = p_project) LOOP
    PERFORM public._sla_sync(r.case_id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._sla_resync_where(uuid, uuid, uuid, boolean) FROM public, anon, authenticated;

-- First response also counts while paused (e.g. a comment while waiting for the customer).
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
   WHERE case_id = NEW.case_id AND first_response_at IS NULL AND status IN ('running','paused');
  RETURN NULL;
END $$;

-- Monitor: include pause info (checker keeps skipping paused clocks: it only reads status = 'running').
CREATE OR REPLACE FUNCTION public.sla_monitor()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'case_id', c.id, 'title', c.title, 'case_status', c.status, 'sla_type', t.sla_type, 'priority', t.priority, 'source', t.source,
    'started_at', t.assigned_at, 'response_due', t.response_due, 'resolution_due', t.resolution_due,
    'first_response_at', t.first_response_at, 'resolved_at', t.resolved_at,
    'response_breached', t.first_response_breached, 'resolution_breached', t.resolution_breached, 'status', t.status,
    'paused_at', t.paused_at, 'paused_hours', t.paused_hours,
    'response_hours', t.response_hours, 'resolution_hours', t.resolution_hours,
    'project', (SELECT jsonb_build_object('id', p.id, 'name', p.name) FROM projects p WHERE p.id = c.project_id),
    'customer', coalesce((SELECT name FROM customers WHERE id = c.customer_id), (SELECT coalesce(cp.company_name, u.full_name) FROM users u LEFT JOIN client_profiles cp ON cp.id = u.id WHERE u.id = c.client_id LIMIT 1)),
    'partner', (SELECT name FROM partners WHERE id = c.partner_id)
  ) ORDER BY (t.status IN ('running','paused')) DESC, t.resolution_due), '[]'::jsonb)
  FROM sla_tracking t JOIN cases c ON c.id = t.case_id
  WHERE t.status <> 'off' AND (public.is_staff() OR public.user_can_access_case(c.id));
$$;
