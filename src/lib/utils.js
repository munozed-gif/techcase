import { supabase } from "./supabase.js";

// ── Notification helpers ─────────────────────────────────────
async function notify(userId, title, body) {
  if (!userId) return;
  try { await supabase.from("notifications").insert({ user_id: userId, title, body, is_read: false }); } catch (_) {}
}
async function notifyManagers(title, body) {
  try {
    const { data } = await supabase.from("users").select("id").in("role", ["admin","manager"]).eq("is_active", true);
    if (!data?.length) return;
    await supabase.from("notifications").insert(data.map(u => ({ user_id: u.id, title, body, is_read: false })));
  } catch (_) {}
}
async function notifyCaseParticipants(caseId, excludeUserId, title, body, opts = {}) {
  try {
    const { data: c } = await supabase.from("cases")
      .select("client_id, manager_id, case_key_users(user_id), case_assignments(consultant_id)").eq("id", caseId).single();
    if (!c) return;
    const ids = new Set();
    if (c.client_id  && c.client_id  !== excludeUserId) ids.add(c.client_id);
    if (c.manager_id && c.manager_id !== excludeUserId) ids.add(c.manager_id);
    (c.case_key_users  ?? []).forEach(ku => { if (ku.user_id      !== excludeUserId) ids.add(ku.user_id); });
    (c.case_assignments ?? []).forEach(a  => { if (a.consultant_id !== excludeUserId) ids.add(a.consultant_id); });
    if (!ids.size) return;
    await supabase.from("notifications").insert([...ids].map(uid => ({
      user_id: uid, title, body, is_read: false,
      case_id: opts.case_id ?? caseId ?? null,
      event_type: opts.event_type ?? "general",
    })));
  } catch (_) {}
}
// ── Email helpers ─────────────────────────────────────────────
function buildEmailHtml({ title, preheader = '', bodyHtml, ctaText, ctaUrl, footerNote = '', platformName = 'Arena Solutions Platform', logoUrl = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${preheader ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}</span>` : ''}
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <!-- Header -->
      <tr><td style="background:#1d4ed8;padding:28px 32px;text-align:center">
        ${logoUrl ? `<img src="${logoUrl}" alt="${platformName}" style="height:36px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto">` : ''}
        <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">${platformName}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 32px 24px">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;line-height:1.3">${title}</h1>
        <div style="font-size:15px;line-height:1.6;color:#374151">${bodyHtml}</div>
        ${ctaText && ctaUrl ? `
        <div style="margin:28px 0">
          <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;font-weight:600">${ctaText}</a>
        </div>` : ''}
        ${footerNote ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0;line-height:1.5">${footerNote}</p>` : ''}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center">
        <p style="margin:0;font-size:12px;color:#9ca3af">You received this because you have an account on ${platformName}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendEmail(toEmail, subject, html) {
  if (!toEmail) return;
  try {
    await supabase.functions.invoke("send-email", { body: { to: toEmail, subject, html } });
  } catch (_) {}
}

async function sendEmailToUser(userId, subject, html) {
  if (!userId) return;
  try {
    const { data } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
    if (data?.email) await sendEmail(data.email, subject, html);
  } catch (_) {}
}

async function sendEmailToManagers(subject, html) {
  try {
    const { data } = await supabase.from("users").select("email").in("role", ["admin","manager"]).eq("is_active", true);
    if (!data?.length) return;
    await Promise.all(data.map(u => sendEmail(u.email, subject, html)));
  } catch (_) {}
}
// ─────────────────────────────────────────────────────────────

// ── Claude API helper ────────────────────────────────────────
function stripSurrogates(s) {
  // charCodeAt never throws on lone surrogates (regex-based .replace CAN on WebKit/Safari).
  // Also strips null bytes and ASCII control chars — Anthropic rejects them in JSON strings.
  // TAB (0x09), LF (0x0A), CR (0x0D) are kept.
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDFFF) continue;
    if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) continue;
    out += s[i];
  }
  return out;
}

function sanitizeDeep(v) {
  if (typeof v === 'string') return stripSurrogates(v);
  if (Array.isArray(v)) return v.map(sanitizeDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = sanitizeDeep(v[k]);
    return out;
  }
  return v;
}

async function callClaude({ system, messages, max_tokens = 2048, model = 'claude-haiku-4-5', mcp_servers }) {
  // Attach current user id so the server can track usage / apply the right key
  let userId = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
  } catch (_) {}

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizeDeep({
      system, messages, max_tokens, model,
      user_id: userId,
      ...(mcp_servers?.length ? { mcp_servers } : {}),
    })),
  });

  if (res.status === 402) {
    const e = await res.json();
    const err = new Error(e.error?.message ?? 'Monthly AI generation limit reached. Go to Profile → AI to add your API key or upgrade to Pro.');
    err.code = 'ai_limit_reached';
    err.used  = e.error?.used;
    err.limit = e.error?.limit;
    throw err;
  }

  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Claude API error'); }
  const data = await res.json();
  // Sonnet 5+ may return a thinking block before the text block — find by type
  const text = data?.content?.find(b => b.type === 'text')?.text;
  if (text) return text;
  // If the model ran out of tokens before generating any text (e.g. thinking consumed all tokens),
  // provide a clear error rather than raw API debug info
  if (data?.stop_reason === 'max_tokens') {
    throw new Error('La respuesta de IA fue cortada (max_tokens). Por favor intente de nuevo.');
  }
  const detail = data?.error?.message
    ?? `stop_reason=${data?.stop_reason ?? 'none'}, content_blocks=${data?.content?.length ?? 0}, model=${data?.model ?? model}`;
  throw new Error(detail);
}

let _auditCfgCache = null; // null = not yet fetched

function clearAuditConfigCache() { _auditCfgCache = null; }

async function _getAuditConfig() {
  if (_auditCfgCache !== null) return _auditCfgCache;
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'audit_log_config').maybeSingle();
    _auditCfgCache = data?.value ?? {};
  } catch (_) { _auditCfgCache = {}; }
  return _auditCfgCache;
}

async function logEvent(eventType, opts = {}) {
  try {
    const cfg = await _getAuditConfig();
    const disabled = cfg.disabled ?? [];
    if (disabled.includes(eventType)) return;
    let uid = opts.userId ?? null;
    let uemail = opts.userEmail ?? null;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      uid    = user?.id    ?? null;
      uemail = uemail ?? user?.email ?? null;
    }
    await supabase.from('audit_logs').insert({
      event_type:  eventType,
      user_id:     uid,
      user_name:   opts.userName   ?? null,
      user_email:  uemail,
      entity_type: opts.entityType ?? null,
      entity_id:   opts.entityId  != null ? String(opts.entityId) : null,
      entity_name: opts.entityName ?? null,
      old_value:   opts.oldValue   ?? null,
      new_value:   opts.newValue   ?? null,
      metadata:    opts.metadata   ?? null,
    });
  } catch (_) {}
}

export { notify, notifyManagers, notifyCaseParticipants, callClaude, logEvent, clearAuditConfigCache, buildEmailHtml, sendEmail, sendEmailToUser, sendEmailToManagers };
