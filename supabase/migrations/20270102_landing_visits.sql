-- Landing page visits and key events, for the admin statistics (Settings → Visits).
-- Written only by the /api/track server function (service role): it adds the location that Vercel
-- gives for each request (country, region, city) and an ANONYMIZED IP (last IPv4 block / last 80 bits
-- of IPv6 removed). No personal data: visitor_id / session_id are random ids kept in the browser.
CREATE TABLE IF NOT EXISTS public.landing_visits (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  event         text NOT NULL CHECK (event IN ('pageview', 'cta', 'video_play', 'video_complete', 'signin_open', 'signup')),
  visitor_id    text,
  session_id    text,
  path          text,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  device        text,
  browser       text,
  os            text,
  lang          text,
  country       text,
  region        text,
  city          text,
  ip_anon       text,
  meta          jsonb
);
CREATE INDEX IF NOT EXISTS landing_visits_created_idx ON public.landing_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS landing_visits_event_idx   ON public.landing_visits (event, created_at DESC);
ALTER TABLE public.landing_visits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landing_visits' AND policyname = 'landing_visits_admin_read') THEN
    CREATE POLICY landing_visits_admin_read ON public.landing_visits FOR SELECT TO authenticated
      USING (coalesce(public.get_my_role(), '') = 'admin');
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.landing_visits FROM anon, authenticated;

-- Aggregated statistics for a period (admins only).
CREATE OR REPLACE FUNCTION public.landing_stats(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF coalesce(public.get_my_role(), '') <> 'admin' THEN RAISE EXCEPTION 'Only administrators' USING ERRCODE = '42501'; END IF;
  WITH v AS (SELECT * FROM landing_visits WHERE created_at >= p_from AND created_at < p_to),
       pv AS (SELECT * FROM v WHERE event = 'pageview'),
       src AS (SELECT coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), '(direct)') AS s, visitor_id FROM pv)
  SELECT jsonb_build_object(
    'pageviews', (SELECT count(*) FROM pv),
    'visitors',  (SELECT count(DISTINCT visitor_id) FROM pv),
    'sessions',  (SELECT count(DISTINCT session_id) FROM pv),
    'by_day',    (SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'), '[]') FROM (SELECT jsonb_build_object('day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'), 'pageviews', count(*), 'visitors', count(DISTINCT visitor_id)) x FROM pv GROUP BY date_trunc('day', created_at)) d),
    'by_country',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'visitors')::int DESC), '[]') FROM (SELECT jsonb_build_object('key', coalesce(country, '?'), 'visitors', count(DISTINCT visitor_id), 'pageviews', count(*)) x FROM pv GROUP BY country ORDER BY count(DISTINCT visitor_id) DESC LIMIT 20) d),
    'by_city',   (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'visitors')::int DESC), '[]') FROM (SELECT jsonb_build_object('key', coalesce(city, '?') || coalesce(', ' || region, '') || coalesce(' (' || country || ')', ''), 'visitors', count(DISTINCT visitor_id), 'pageviews', count(*)) x FROM pv GROUP BY city, region, country ORDER BY count(DISTINCT visitor_id) DESC LIMIT 20) d),
    'by_source', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'visitors')::int DESC), '[]') FROM (SELECT jsonb_build_object('key', s, 'visitors', count(DISTINCT visitor_id), 'pageviews', count(*)) x FROM src GROUP BY s ORDER BY count(DISTINCT visitor_id) DESC LIMIT 20) d),
    'by_campaign',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'visitors')::int DESC), '[]') FROM (SELECT jsonb_build_object('key', utm_campaign, 'visitors', count(DISTINCT visitor_id)) x FROM pv WHERE coalesce(utm_campaign, '') <> '' GROUP BY utm_campaign ORDER BY count(DISTINCT visitor_id) DESC LIMIT 20) d),
    'by_device', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT jsonb_build_object('key', coalesce(device, '?'), 'visitors', count(DISTINCT visitor_id)) x FROM pv GROUP BY device ORDER BY count(DISTINCT visitor_id) DESC) d),
    'by_browser',(SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT jsonb_build_object('key', coalesce(browser, '?') || ' · ' || coalesce(os, '?'), 'visitors', count(DISTINCT visitor_id)) x FROM pv GROUP BY browser, os ORDER BY count(DISTINCT visitor_id) DESC LIMIT 12) d),
    'by_lang',   (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT jsonb_build_object('key', coalesce(lang, '?'), 'visitors', count(DISTINCT visitor_id)) x FROM pv GROUP BY lang ORDER BY count(DISTINCT visitor_id) DESC) d),
    'funnel', jsonb_build_object(
      'visitors',       (SELECT count(DISTINCT visitor_id) FROM pv),
      'video_play',     (SELECT count(DISTINCT visitor_id) FROM v WHERE event = 'video_play'),
      'video_complete', (SELECT count(DISTINCT visitor_id) FROM v WHERE event = 'video_complete'),
      'cta',            (SELECT count(DISTINCT visitor_id) FROM v WHERE event = 'cta'),
      'signup',         (SELECT count(DISTINCT visitor_id) FROM v WHERE event = 'signup')),
    'by_cta',    (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT jsonb_build_object('key', coalesce(meta->>'label', '?'), 'clicks', count(*), 'visitors', count(DISTINCT visitor_id)) x FROM v WHERE event = 'cta' GROUP BY meta->>'label' ORDER BY count(*) DESC LIMIT 15) d)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.landing_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.landing_stats(timestamptz, timestamptz) TO authenticated;
