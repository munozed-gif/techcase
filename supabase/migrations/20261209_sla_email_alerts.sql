-- SLA email alerts through an email outbox.
--   • email_outbox: one row per email; sent by the edge function send-queued-emails (service role),
--     retried up to 3 times; the pg_cron job "send-queued-emails" calls it every minute when mail is waiting.
--   • SLA "at risk" / "breached" alerts: in-app notification + queued email per recipient (same recipients),
--     in the recipient's language, respecting notification_prefs.sla (in_app / email) and
--     system_settings.sla_alerts { email_enabled, email_events, app_url }.
-- No DROP / DELETE.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  to_email        text NOT NULL,
  subject         text NOT NULL,
  title           text,
  body_html       text NOT NULL,
  cta_text        text,
  cta_url         text,
  kind            text NOT NULL DEFAULT 'general',
  ref             jsonb,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  provider_id     text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON public.email_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS email_outbox_kind_idx ON public.email_outbox (kind, created_at DESC);
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_outbox' AND policyname='email_outbox_staff_read') THEN
    CREATE POLICY email_outbox_staff_read ON public.email_outbox FOR SELECT TO authenticated USING (public.is_staff());
  END IF;
END $$;
GRANT SELECT ON public.email_outbox TO authenticated;

-- Sender side (service role only): claim a batch / record the result.
CREATE OR REPLACE FUNCTION public.email_outbox_claim(p_limit int DEFAULT 25)
RETURNS SETOF public.email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Rescue rows stuck in "sending" (sender crashed).
  UPDATE email_outbox SET status = 'pending' WHERE status = 'sending' AND next_attempt_at < now() - interval '10 minutes';
  RETURN QUERY
  UPDATE email_outbox e SET status = 'sending', attempts = e.attempts + 1, next_attempt_at = now()
   WHERE e.id IN (SELECT id FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()
                  ORDER BY created_at LIMIT greatest(1, least(p_limit, 100)) FOR UPDATE SKIP LOCKED)
  RETURNING e.*;
END $$;

CREATE OR REPLACE FUNCTION public.email_outbox_result(p_id uuid, p_ok boolean, p_error text DEFAULT NULL, p_provider_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ok THEN
    UPDATE email_outbox SET status = 'sent', sent_at = now(), provider_id = p_provider_id, last_error = NULL WHERE id = p_id;
  ELSE
    UPDATE email_outbox SET last_error = left(p_error, 500),
           status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
           next_attempt_at = now() + make_interval(mins => (2 ^ attempts)::int)
     WHERE id = p_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.email_outbox_claim(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_outbox_result(uuid, boolean, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_outbox_claim(int), public.email_outbox_result(uuid, boolean, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public._html_esc(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- One SLA alert: in-app notification + queued email per recipient.
-- p_event: 'at_risk' | 'breached' · p_target: 'response' | 'solution'
CREATE OR REPLACE FUNCTION public._sla_alert(p_case uuid, p_event text, p_target text, p_due timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c cases%ROWTYPE; t sla_tracking%ROWTYPE; cfg jsonb; v_tz text; v_due text; v_customer text; v_project text;
  v_email_on boolean; v_events jsonb; v_url text; r record; es boolean; v_title text; v_body text; v_subject text; v_lead text;
  v_type text; v_prio text;
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO t FROM sla_tracking WHERE case_id = p_case;
  SELECT value INTO cfg FROM system_settings WHERE key = 'sla_alerts';
  v_email_on := coalesce((cfg ->> 'email_enabled')::boolean, true);
  v_events := coalesce(cfg -> 'email_events', '["at_risk","breached"]'::jsonb);
  v_url := rtrim(coalesce(NULLIF(cfg ->> 'app_url', ''), 'https://www.arenasolutionsplatform.com'), '/') || '/?case=' || p_case;
  v_tz := coalesce(NULLIF(t.calendar ->> 'timezone', ''), 'UTC');
  v_due := to_char(p_due AT TIME ZONE v_tz, 'YYYY-MM-DD HH24:MI') || ' (' || v_tz || ')';
  v_customer := coalesce((SELECT name FROM customers WHERE id = c.customer_id),
                         (SELECT coalesce(cp.company_name, u.full_name) FROM users u LEFT JOIN client_profiles cp ON cp.id = u.id WHERE u.id = c.client_id));
  v_project := (SELECT name FROM projects WHERE id = c.project_id);

  FOR r IN
    SELECT DISTINCT u.id, u.email, u.language_pref, u.notification_prefs
    FROM (
      SELECT c.manager_id AS uid
      UNION SELECT ca.consultant_id FROM case_assignments ca WHERE ca.case_id = p_case AND coalesce(ca.is_active, true)
      UNION SELECT m.user_id FROM partner_members m WHERE m.partner_id = c.partner_id AND m.role IN ('owner','admin')
      UNION SELECT d.submitted_by FROM project_deliveries d WHERE d.project_id = c.project_id AND d.status = 'awarded'
    ) x JOIN users u ON u.id = x.uid
    WHERE coalesce(u.is_active, true)
  LOOP
    es := lower(coalesce(r.language_pref, 'en')) LIKE 'es%';
    v_type := CASE t.sla_type WHEN 'error' THEN 'Error' WHEN 'info' THEN CASE WHEN es THEN 'Información general' ELSE 'General information' END
                              WHEN 'improvement' THEN CASE WHEN es THEN 'Mejora' ELSE 'Improvement' END ELSE coalesce(t.sla_type, '—') END;
    v_prio := CASE t.priority WHEN 'critical' THEN CASE WHEN es THEN 'Crítico' ELSE 'Critical' END WHEN 'high' THEN CASE WHEN es THEN 'Alto' ELSE 'High' END
                              WHEN 'low' THEN CASE WHEN es THEN 'Bajo' ELSE 'Low' END ELSE 'Normal' END;
    v_title := CASE
      WHEN p_event = 'breached' AND p_target = 'response' THEN CASE WHEN es THEN 'SLA incumplido — primera respuesta' ELSE 'SLA breached — first response' END
      WHEN p_event = 'breached' THEN CASE WHEN es THEN 'SLA incumplido — solución' ELSE 'SLA breached — resolution' END
      WHEN p_target = 'response' THEN CASE WHEN es THEN 'SLA en riesgo — primera respuesta' ELSE 'SLA at risk — first response' END
      ELSE CASE WHEN es THEN 'SLA en riesgo — solución' ELSE 'SLA at risk — resolution' END END;
    v_lead := CASE
      WHEN p_event = 'breached' AND p_target = 'response' THEN CASE WHEN es THEN 'El caso no tuvo primera respuesta antes del vencimiento.' ELSE 'The case had no first response by its due time.' END
      WHEN p_event = 'breached' THEN CASE WHEN es THEN 'El caso no se resolvió antes del vencimiento.' ELSE 'The case was not solved by its due time.' END
      WHEN p_target = 'response' THEN CASE WHEN es THEN 'El caso necesita una primera respuesta antes del vencimiento.' ELSE 'The case needs a first response before its due time.' END
      ELSE CASE WHEN es THEN 'El caso debe resolverse antes del vencimiento.' ELSE 'The case must be solved before its due time.' END END;

    -- In-app (unless the user turned SLA in-app alerts off)
    IF coalesce(r.notification_prefs -> 'sla' ->> 'in_app', 'true') <> 'false' THEN
      INSERT INTO notifications (user_id, type, title, body, payload, event_type, case_id)
      VALUES (r.id, 'sla', v_title, format('"%s" — %s %s.', c.title, CASE WHEN es THEN 'vence' ELSE 'due' END, v_due),
              jsonb_build_object('case_id', p_case, 'event', p_event, 'target', p_target), 'sla', p_case);
    END IF;

    -- Email
    IF v_email_on AND v_events ? p_event AND r.email IS NOT NULL
       AND coalesce(r.notification_prefs -> 'sla' ->> 'email', 'true') <> 'false' THEN
      v_subject := '[SLA] ' || v_title || ': ' || c.title;
      v_body := '<p>' || _html_esc(v_lead) || '</p>'
        || '<table cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;font-size:14px;line-height:1.6">'
        || '<tr><td style="color:#64748b;padding:2px 12px 2px 0;white-space:nowrap">' || CASE WHEN es THEN 'Caso' ELSE 'Case' END || '</td><td style="color:#f1f5f9;font-weight:700">' || _html_esc(c.title) || '</td></tr>'
        || CASE WHEN v_customer IS NOT NULL THEN '<tr><td style="color:#64748b;padding:2px 12px 2px 0">' || CASE WHEN es THEN 'Cliente' ELSE 'Customer' END || '</td><td style="color:#e2e8f0">' || _html_esc(v_customer) || '</td></tr>' ELSE '' END
        || CASE WHEN v_project IS NOT NULL THEN '<tr><td style="color:#64748b;padding:2px 12px 2px 0">' || CASE WHEN es THEN 'Proyecto' ELSE 'Project' END || '</td><td style="color:#e2e8f0">' || _html_esc(v_project) || '</td></tr>' ELSE '' END
        || '<tr><td style="color:#64748b;padding:2px 12px 2px 0">' || CASE WHEN es THEN 'Tipo · prioridad' ELSE 'Type · priority' END || '</td><td style="color:#e2e8f0">' || _html_esc(v_type || ' · ' || v_prio) || '</td></tr>'
        || '<tr><td style="color:#64748b;padding:2px 12px 2px 0">' || CASE WHEN p_target = 'response' THEN CASE WHEN es THEN 'Primera respuesta' ELSE 'First response' END ELSE CASE WHEN es THEN 'Solución' ELSE 'Solution' END END
        || '</td><td style="color:' || CASE WHEN p_event = 'breached' THEN '#f87171' ELSE '#fbbf24' END || ';font-weight:700">' || _html_esc(v_due) || '</td></tr>'
        || '</table>'
        || '<p style="font-size:12px;color:#64748b">' || CASE WHEN es THEN 'Horario laboral del SLA; las pausas por espera del cliente no cuentan.' ELSE 'SLA business hours; time waiting on the customer does not count.' END || '</p>';
      INSERT INTO email_outbox (user_id, to_email, subject, title, body_html, cta_text, cta_url, kind, ref)
      VALUES (r.id, r.email, v_subject, v_title, v_body, CASE WHEN es THEN 'Abrir caso' ELSE 'Open case' END, v_url, 'sla',
              jsonb_build_object('case_id', p_case, 'event', p_event, 'target', p_target));
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._sla_alert(uuid, text, text, timestamptz) FROM public, anon, authenticated;

-- The checker now raises alerts through _sla_alert (in-app + email).
CREATE OR REPLACE FUNCTION public.sla_check_breaches()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n_warn int := 0; n_breach int := 0;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  FOR r IN SELECT t.* FROM sla_tracking t WHERE t.status = 'running' FOR UPDATE OF t SKIP LOCKED LOOP
    IF r.first_response_at IS NULL AND r.response_due IS NOT NULL THEN
      IF now() > r.response_due AND NOT r.first_response_breached THEN
        UPDATE sla_tracking SET first_response_breached = true, breach_notified_at = now() WHERE id = r.id;
        PERFORM public._sla_alert(r.case_id, 'breached', 'response', r.response_due);
        n_breach := n_breach + 1;
      ELSIF NOT r.response_warned AND now() >= r.assigned_at + (r.response_due - r.assigned_at) * 0.8 AND now() <= r.response_due THEN
        UPDATE sla_tracking SET response_warned = true WHERE id = r.id;
        PERFORM public._sla_alert(r.case_id, 'at_risk', 'response', r.response_due);
        n_warn := n_warn + 1;
      END IF;
    END IF;
    IF r.resolution_due IS NOT NULL THEN
      IF now() > r.resolution_due AND NOT r.resolution_breached THEN
        UPDATE sla_tracking SET resolution_breached = true, breach_notified_at = now() WHERE id = r.id;
        PERFORM public._sla_alert(r.case_id, 'breached', 'solution', r.resolution_due);
        n_breach := n_breach + 1;
      ELSIF NOT r.resolution_warned AND now() >= r.assigned_at + (r.resolution_due - r.assigned_at) * 0.8 AND now() <= r.resolution_due THEN
        UPDATE sla_tracking SET resolution_warned = true WHERE id = r.id;
        PERFORM public._sla_alert(r.case_id, 'at_risk', 'solution', r.resolution_due);
        n_warn := n_warn + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('warned', n_warn, 'breached', n_breach);
END $$;

-- Sender trigger: every minute, call the edge function when mail is waiting.
-- system_settings.email_sender = { "function_url": "https://<project>.supabase.co/functions/v1/send-queued-emails" }
CREATE OR REPLACE FUNCTION public._email_outbox_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()) THEN RETURN; END IF;
  SELECT value ->> 'function_url' INTO v_url FROM system_settings WHERE key = 'email_sender';
  IF coalesce(v_url, '') = '' THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 30000);
END $$;
REVOKE ALL ON FUNCTION public._email_outbox_kick() FROM public, anon, authenticated;
SELECT cron.schedule('send-queued-emails', '* * * * *', 'SELECT public._email_outbox_kick()');

-- Recent SLA emails for Settings (staff).
CREATE OR REPLACE FUNCTION public.sla_email_log(p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_staff() THEN coalesce(jsonb_agg(jsonb_build_object(
    'to', e.to_email, 'subject', e.subject, 'status', e.status, 'attempts', e.attempts, 'error', e.last_error,
    'created_at', e.created_at, 'sent_at', e.sent_at) ORDER BY e.created_at DESC), '[]'::jsonb) END
  FROM (SELECT * FROM email_outbox WHERE kind = 'sla' ORDER BY created_at DESC LIMIT greatest(1, least(p_limit, 50))) e;
$$;
REVOKE ALL ON FUNCTION public.sla_email_log(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sla_email_log(int) TO authenticated;

-- Defaults: email on for both events.
UPDATE system_settings SET value = '{"email_enabled": true, "email_events": ["at_risk","breached"], "app_url": "https://www.arenasolutionsplatform.com"}'::jsonb || value
 WHERE key = 'sla_alerts';

-- Where the sender function lives (one per environment; prod shown, preprod uses its own project URL).
INSERT INTO system_settings (key, value) VALUES ('email_sender', '{"function_url": "https://xwiduokkkoaxrhfyuwye.supabase.co/functions/v1/send-queued-emails"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
