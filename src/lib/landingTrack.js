// Landing page statistics (Settings → Visits): page views and key events sent to /api/track, which adds
// the location and an anonymized IP. Ids are random and stay in the browser; nothing personal is sent.
// Respects "Do Not Track", and never runs inside the platform for signed-in users.

const VISITOR_KEY = 'arena_vid';
const SESSION_KEY = 'arena_sid';
const UTM_KEY = 'arena_utm';

function rid() {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}
function stored(storage, key, make) {
  try { let v = storage.getItem(key); if (!v) { v = make(); storage.setItem(key, v); } return v; } catch { return make(); }
}
const dnt = () => {
  try { return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true; } catch { return false; }
};

// UTM parameters of the visit (kept for the session, so later events carry the campaign).
function utm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const fresh = Object.fromEntries(['source', 'medium', 'campaign', 'content', 'term'].map(k => [k, q.get(`utm_${k}`)]).filter(([, v]) => v));
    if (Object.keys(fresh).length) { sessionStorage.setItem(UTM_KEY, JSON.stringify(fresh)); return fresh; }
    return JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}');
  } catch { return {}; }
}

export function trackLanding(event, meta = null) {
  if (typeof window === 'undefined' || dnt()) return;
  try {
    const payload = JSON.stringify({
      event, meta,
      visitor_id: stored(localStorage, VISITOR_KEY, rid),
      session_id: stored(sessionStorage, SESSION_KEY, rid),
      path: window.location.pathname,
      referrer: document.referrer || null,
      utm: utm(),
      lang: (() => { try { return localStorage.getItem('tc_lang') || (navigator.language || '').slice(0, 2); } catch { return null; } })(),
    });
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', blob)) return;
    fetch('/api/track', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch { /* never break the page */ }
}

/** Click on a call-to-action button: records its text and section, then runs the action. */
export function ctaClick(action) {
  return e => {
    const el = e?.currentTarget;
    trackLanding('cta', { label: el?.textContent?.trim().slice(0, 60) ?? null, section: el?.closest?.('section')?.id || el?.closest?.('section')?.className?.split(' ')[0] || null });
    action?.(e);
  };
}
