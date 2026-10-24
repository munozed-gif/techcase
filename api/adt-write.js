// Vercel serverless proxy for ADT bridge /sap-write
// Browser calls this (same origin → no CORS), we forward to the Cloudflare tunnel
// server-side where there are no CORS restrictions.
//
// Reads the current bridge URL from Supabase system_settings so it stays fresh
// even when the Cloudflare quick tunnel URL rotates.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function getBridgeUrl(explicitUrl) {
  if (explicitUrl?.trim()) return explicitUrl.trim().replace(/\/$/, '');
  // Fall back to registry
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/system_settings?key=eq.adt_bridge_tunnel_url&select=value`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();
    return rows?.[0]?.value?.trim().replace(/\/$/, '') || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { bridgeUrl, ...writePayload } = body;
  const targetBase = await getBridgeUrl(bridgeUrl);
  if (!targetBase) return res.status(503).json({ ok: false, error: 'ADT bridge URL not found — update it in SAP Config or ensure start-local.sh is running' });

  try {
    const r = await fetch(`${targetBase}/sap-write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(writePayload),
      signal: AbortSignal.timeout(50000),
    });
    const rawText = await r.text().catch(() => '');
    let data;
    try { data = JSON.parse(rawText); }
    catch { data = { ok: false, error: `Bridge returned non-JSON (HTTP ${r.status}): ${rawText.slice(0, 200)}` }; }
    return res.status(r.ok ? 200 : 502).json(data);
  } catch (e) {
    const msg = e.message?.slice(0, 200) || 'Bridge unreachable';
    const hint = /timeout|abort/i.test(msg) ? `Timeout reaching ${targetBase} — is start-local.sh still running?`
      : /ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg) ? `Cannot reach ${targetBase} — Cloudflare tunnel may have stopped`
      : msg;
    return res.status(502).json({ ok: false, error: hint, bridgeUrl: targetBase });
  }
}
