// Landing page visits and key events (Settings → Visits). The browser sends the event; this function
// adds the location Vercel gives for the request (country, region, city) and an ANONYMIZED IP, and
// stores it in landing_visits with the service role (the table is not writable from the browser).
// No personal data: visitor_id / session_id are random ids generated in the browser.

const EVENTS = new Set(['pageview', 'cta', 'video_play', 'video_complete', 'signin_open', 'signup']);
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|python|curl|wget|java\/|go-http|okhttp|axios|node-fetch|lighthouse|pingdom|uptime|monitor|facebookexternalhit|whatsapp|telegram|slack|discord|skypeuripreview|bingpreview|google-read/i;

const str = (v, n = 200) => (v == null ? null : String(v).slice(0, n).trim() || null);
const header = (req, name) => {
  const v = req.headers[name];
  if (!v) return null;
  try { return decodeURIComponent(Array.isArray(v) ? v[0] : v); } catch { return String(v); }
};

// IPv4: last block to 0 (190.1.2.33 → 190.1.2.0). IPv6: keep the first 3 groups (/48).
function anonymizeIp(raw) {
  const ip = String(raw ?? '').split(',')[0].trim();
  if (!ip) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.0');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::`;
  return null;
}

function parseUa(ua) {
  const s = String(ua ?? '');
  const device = /ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(s) ? 'tablet'
    : /mobi|iphone|ipod|android.*mobile|windows phone/i.test(s) ? 'mobile' : 'desktop';
  const browser = /edg\//i.test(s) ? 'Edge' : /opr\/|opera/i.test(s) ? 'Opera' : /samsungbrowser/i.test(s) ? 'Samsung Internet'
    : /firefox|fxios/i.test(s) ? 'Firefox' : /chrome|crios/i.test(s) ? 'Chrome' : /safari/i.test(s) ? 'Safari' : 'Other';
  const os = /windows/i.test(s) ? 'Windows' : /iphone|ipad|ipod/i.test(s) ? 'iOS' : /mac os x|macintosh/i.test(s) ? 'macOS'
    : /android/i.test(s) ? 'Android' : /linux/i.test(s) ? 'Linux' : 'Other';
  return { device, browser, os };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body ?? {};
    const event = String(body.event ?? '');
    if (!EVENTS.has(event)) return res.status(204).end();
    const ua = req.headers['user-agent'] ?? '';
    if (!ua || BOT_RE.test(ua)) return res.status(204).end();

    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(204).end();

    let referrerHost = null;
    try {
      const h = body.referrer ? new URL(String(body.referrer)).hostname.replace(/^www\./, '') : null;
      const own = String(req.headers.host ?? '').replace(/^www\./, '');
      referrerHost = h && h !== own ? h.slice(0, 120) : null;
    } catch { /* invalid referrer */ }
    const u = body.utm ?? {};
    const { device, browser, os } = parseUa(ua);
    const meta = body.meta && typeof body.meta === 'object' ? Object.fromEntries(Object.entries(body.meta).slice(0, 8).map(([k, v]) => [String(k).slice(0, 40), str(v, 120)])) : null;

    const row = {
      event,
      visitor_id: str(body.visitor_id, 64), session_id: str(body.session_id, 64),
      path: str(body.path, 200), referrer_host: referrerHost,
      utm_source: str(u.source, 100), utm_medium: str(u.medium, 100), utm_campaign: str(u.campaign, 100),
      utm_content: str(u.content, 100), utm_term: str(u.term, 100),
      device, browser, os, lang: str(body.lang, 10),
      country: str(header(req, 'x-vercel-ip-country'), 4),
      region: str(header(req, 'x-vercel-ip-country-region'), 10),
      city: str(header(req, 'x-vercel-ip-city'), 80),
      ip_anon: anonymizeIp(req.headers['x-forwarded-for'] ?? req.headers['x-real-ip']),
      meta,
    };
    await fetch(`${url}/rest/v1/landing_visits`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) {
    console.error('[track]', e?.message ?? e);
  }
  return res.status(204).end();
}
