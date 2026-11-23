-- SLA pause statuses are configurable: the SLA policy carries "pause_statuses" (default: every waiting
-- status). Edited with the SLA (platform, partner, customer, contract). No DROP / DELETE.

CREATE OR REPLACE FUNCTION public._sla_builtin()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{
    "types":[{"key":"error","en":"Error","es":"Error"},{"key":"info","en":"General information","es":"Información general"},{"key":"improvement","en":"Improvement","es":"Mejora"}],
    "priorities":[{"key":"critical","en":"Critical","es":"Crítico"},{"key":"high","en":"High","es":"Alto"},{"key":"normal","en":"Normal","es":"Normal"},{"key":"low","en":"Low","es":"Bajo"}],
    "matrix":{"error":{"critical":[0.5,4],"high":[1,8],"normal":[2,16],"low":[4,32]},
              "info":{"critical":[1,8],"high":[2,16],"normal":[4,32],"low":[8,64]},
              "improvement":{"critical":[2,16],"high":[3,32],"normal":[6,48],"low":[16,96]}},
    "calendar":{"start":"09:00","hoursPerDay":8,"workDays":[1,2,3,4,5],"timezone":"America/Mexico_City"},
    "terms":{"tier":"standard","uptime_pct":99,"dedicated_consultant":false,"priority_support":false,"notes":""},
    "pause_statuses":["pending_customer","pending_user","pending_sap","pending_vendor","on_hold","standby"]
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public._sla_normalize(p jsonb, p_catalog_hpd numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT b
    || jsonb_build_object('matrix', (b -> 'matrix') || coalesce(CASE WHEN jsonb_typeof(p -> 'matrix') = 'object' THEN p -> 'matrix' END, '{}'::jsonb))
    || CASE WHEN jsonb_typeof(p -> 'types') = 'array' AND jsonb_array_length(p -> 'types') > 0 THEN jsonb_build_object('types', p -> 'types') ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(p -> 'priorities') = 'array' AND jsonb_array_length(p -> 'priorities') > 0 THEN jsonb_build_object('priorities', p -> 'priorities') ELSE '{}'::jsonb END
    || jsonb_build_object('calendar', (b -> 'calendar')
         || CASE WHEN p_catalog_hpd IS NOT NULL THEN jsonb_build_object('hoursPerDay', p_catalog_hpd) ELSE '{}'::jsonb END
         || coalesce(CASE WHEN jsonb_typeof(p -> 'calendar') = 'object' THEN p -> 'calendar' END, '{}'::jsonb))
    || CASE WHEN jsonb_typeof(p -> 'pause_statuses') = 'array' THEN jsonb_build_object('pause_statuses', p -> 'pause_statuses') ELSE '{}'::jsonb END
    || jsonb_build_object('terms', (b -> 'terms') || coalesce(CASE WHEN jsonb_typeof(p -> 'terms') = 'object' THEN p -> 'terms' END, '{}'::jsonb))
  FROM (SELECT public._sla_builtin() b) x;
$$;

CREATE OR REPLACE FUNCTION public._sla_sync(p_case uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; t sla_tracking%ROWTYPE; eff jsonb; pol jsonb; v_prio text; v_pair jsonb; v_resp numeric; v_sol numeric;
        v_start timestamptz; v_rdue timestamptz; v_sdue timestamptz; v_resolved timestamptz; v_status text; v_first timestamptz;
        v_paused_at timestamptz; v_paused numeric; v_pause_on boolean;
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
  -- Statuses that pause the clock come from the SLA (Settings → Workflow → SLA, or partner / customer / contract).
  v_pause_on := c.status::text IN (SELECT jsonb_array_elements_text(coalesce(pol -> 'pause_statuses', '[]'::jsonb)));
  v_paused := coalesce(t.paused_hours, 0);
  v_paused_at := t.paused_at;
  IF v_paused_at IS NOT NULL AND NOT v_pause_on THEN
    v_paused := v_paused + public._sla_bhours_between(v_paused_at, now(), pol -> 'calendar');
    v_paused_at := NULL;
  ELSIF v_paused_at IS NULL AND v_pause_on THEN
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

-- The first save of the platform SLA is an INSERT: re-time running clocks then too.
CREATE OR REPLACE TRIGGER sla_policy_changed AFTER INSERT OR UPDATE OF value ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.sla_policy_changed();

-- Fix: read the changed fields through jsonb so a trigger on one table never touches another table's columns.
CREATE OR REPLACE FUNCTION public.sla_policy_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n jsonb := to_jsonb(NEW); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
  IF TG_TABLE_NAME = 'customers' THEN
    IF (n -> 'sla') IS DISTINCT FROM (o -> 'sla') THEN PERFORM public._sla_resync_where((n ->> 'id')::uuid, NULL, NULL, false); END IF;
  ELSIF TG_TABLE_NAME = 'partners' THEN
    IF (n -> 'service_plans' -> 'sla') IS DISTINCT FROM (o -> 'service_plans' -> 'sla') THEN PERFORM public._sla_resync_where(NULL, (n ->> 'id')::uuid, NULL, false); END IF;
  ELSIF TG_TABLE_NAME = 'service_contracts' THEN
    IF (n -> 'sla') IS DISTINCT FROM (o -> 'sla') OR (n ->> 'status') IS DISTINCT FROM (o ->> 'status') THEN
      PERFORM public._sla_resync_where(NULL, NULL, (n ->> 'project_id')::uuid, false);
    END IF;
  ELSIF TG_TABLE_NAME = 'system_settings' THEN
    IF n ->> 'key' = 'service_plans_default' AND (n -> 'value' -> 'sla') IS DISTINCT FROM (o -> 'value' -> 'sla') THEN
      PERFORM public._sla_resync_where(NULL, NULL, NULL, true);
    END IF;
  END IF;
  RETURN NULL;
END $$;
