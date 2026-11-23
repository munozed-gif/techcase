-- Server-side SLA alerts: pg_cron runs public.sla_check_breaches() on a schedule controlled by
-- system_settings.sla_alerts = { enabled: bool, interval_minutes: 1|5|10|15|30|60 } (Settings → Workflow → SLA).
-- Turning it off unschedules the job (no DROP / DELETE of data).

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public._sla_apply_schedule()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE cfg jsonb; v_on boolean; v_min int; v_expr text;
BEGIN
  SELECT value INTO cfg FROM system_settings WHERE key = 'sla_alerts';
  v_on := coalesce((cfg ->> 'enabled')::boolean, true);
  v_min := coalesce(NULLIF(cfg ->> 'interval_minutes', '')::int, 5);
  IF v_min NOT IN (1, 5, 10, 15, 30, 60) THEN v_min := 5; END IF;
  IF v_on THEN
    v_expr := CASE WHEN v_min = 60 THEN '0 * * * *' WHEN v_min = 1 THEN '* * * * *' ELSE '*/' || v_min || ' * * * *' END;
    PERFORM cron.schedule('sla-check-breaches', v_expr, 'SELECT public.sla_check_breaches()');
    RETURN 'scheduled ' || v_expr;
  ELSE
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-check-breaches') THEN
      PERFORM cron.unschedule('sla-check-breaches');
    END IF;
    RETURN 'off';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._sla_apply_schedule() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sla_alerts_setting_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.key = 'sla_alerts' THEN PERFORM public._sla_apply_schedule(); END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER sla_alerts_setting_changed AFTER INSERT OR UPDATE OF value ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.sla_alerts_setting_changed();

-- Status for Settings: the job and its last runs (staff only).
CREATE OR REPLACE FUNCTION public.sla_schedule_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE j record; v_runs jsonb;
BEGIN
  IF NOT public.is_staff() THEN RETURN NULL; END IF;
  SELECT jobid, schedule, active INTO j FROM cron.job WHERE jobname = 'sla-check-breaches';
  IF NOT FOUND THEN RETURN jsonb_build_object('scheduled', false); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('start', start_time, 'end', end_time, 'status', status, 'message', left(return_message, 200)) ORDER BY start_time DESC), '[]'::jsonb)
    INTO v_runs FROM (SELECT * FROM cron.job_run_details WHERE jobid = j.jobid ORDER BY start_time DESC LIMIT 5) r;
  RETURN jsonb_build_object('scheduled', true, 'schedule', j.schedule, 'active', j.active, 'runs', v_runs);
END $$;
REVOKE ALL ON FUNCTION public.sla_schedule_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sla_schedule_status() TO authenticated;

-- Default: on, every 5 minutes (the trigger schedules the job).
INSERT INTO system_settings (key, value) VALUES ('sla_alerts', '{"enabled": true, "interval_minutes": 5}'::jsonb)
ON CONFLICT (key) DO NOTHING;
SELECT public._sla_apply_schedule();
