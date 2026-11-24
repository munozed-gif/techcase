import { supabase } from "./supabase.js";

// ── Notification helpers ─────────────────────────────────────
async function notify(userId, title, body, type = 'general') {
  if (!userId) return;
  try {
    const { data: u } = await supabase.from('users')
      .select('notification_prefs').eq('id', userId).maybeSingle();
    if (u?.notification_prefs?.[type]?.in_app === false) return;
    await supabase.from("notifications").insert({ user_id: userId, title, body, is_read: false });
  } catch (_) {}
}
async function notifyManagers(title, body, eventType = 'general') {
  try {
    const { data } = await supabase.from("users").select("id").in("role", ["admin","manager"]).eq("is_active", true);
    if (!data?.length) return;
    await supabase.from("notifications").insert(data.map(u => ({ user_id: u.id, title, body, is_read: false, event_type: eventType })));
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
function buildEmailHtml({ title, preheader = '', bodyHtml, ctaText, ctaUrl, footerNote = '', platformName = 'Arena Solutions Platform' }) {
  const cta = ctaText && ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px">
         <tr><td align="center">
           <a href="${ctaUrl}" style="display:inline-block;background:#4F6EF7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;font-family:'Plus Jakarta Sans',Arial,sans-serif">${ctaText}</a>
         </td></tr>
       </table>`
    : '';
  const footer = footerNote
    ? `<p style="font-size:12px;color:#4a5568;margin:20px 0 0;line-height:1.6;text-align:center">${footerNote}</p>`
    : '';
  const preheaderHtml = preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}</span>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:dark">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<style>:root{color-scheme:dark}body{background-color:#0B0F1A!important}</style>
${preheaderHtml}
</head>
<body style="margin:0;padding:0;background:#0B0F1A!important;font-family:'Plus Jakarta Sans',Arial,sans-serif;color-scheme:dark">
<!--[if mso]><table width="100%" bgcolor="#0B0F1A" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;min-height:100vh">
  <tr><td align="center" style="padding:40px 16px">

    <!-- Logo -->
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin-bottom:28px">
      <tr><td align="center" style="padding-bottom:10px">
        <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cmFkaWFsR3JhZGllbnQgaWQ9Im9nIiBjeD0iMzYlIiBjeT0iMzMlIiByPSI3OCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0RjZFRjciLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwRDFGM0MiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSIzOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEY2RUY3IiBzdHJva2Utb3BhY2l0eT0iMC4xOCIgc3Ryb2tlLXdpZHRoPSIxIi8+PGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iMjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNkVGNyIgc3Ryb2tlLW9wYWNpdHk9IjAuMzUiIHN0cm9rZS13aWR0aD0iMSIvPjxjaXJjbGUgY3g9IjQwIiBjeT0iNDAiIHI9IjEzIiBmaWxsPSJ1cmwoI29nKSIvPjx0ZXh0IHg9IjQwIiB5PSI0NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiNmZmZmZmYiPkE8L3RleHQ+PGNpcmNsZSBjeD0iNDAiIGN5PSIxLjUiIHI9IjMiIGZpbGw9IiM0RjZFRjciLz48Y2lyY2xlIGN4PSIxMyIgY3k9IjY0IiByPSIyLjIiIGZpbGw9IiM4MThjZjgiIG9wYWNpdHk9IjAuOCIvPjxjaXJjbGUgY3g9IjY4IiBjeT0iMTgiIHI9IjIuNSIgZmlsbD0iIzYzNjZmMSIvPjwvc3ZnPg==" width="72" height="72" alt="Arena" style="display:block;margin:0 auto">
      </td></tr>
      <tr><td align="center">
        <div style="display:inline-block">
          <span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:26px;font-weight:800;color:#4F6EF7;letter-spacing:-0.04em">Arena</span>
          <span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:0.01em;margin-left:6px;vertical-align:middle">Solutions Platform</span>
        </div>
      </td></tr>
    </table>

    <!-- Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1826;border-radius:18px;border:1px solid rgba(79,110,247,0.25);overflow:hidden">
      <tr><td style="background:linear-gradient(90deg,#4F6EF7 0%,#3b55d4 100%);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:36px 36px 28px">
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.3;letter-spacing:-0.02em;font-family:'Plus Jakarta Sans',Arial,sans-serif">${title}</h1>
        <div style="font-size:15px;line-height:1.7;color:#94a3b8;font-family:'Plus Jakarta Sans',Arial,sans-serif">${bodyHtml}</div>
        ${cta}
        ${footer}
      </td></tr>
      <tr><td style="background:#080d16;border-top:1px solid rgba(79,110,247,0.15);padding:16px 36px;text-align:center">
        <p style="margin:0;font-size:12px;color:#334155;font-family:'Plus Jakarta Sans',Arial,sans-serif">
          You received this because you have an account on <span style="color:#4F6EF7">${platformName}</span>.
        </p>
      </td></tr>
    </table>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</body></html>`;
}

async function sendEmail(toEmail, subject, html) {
  if (!toEmail) return;
  try {
    await supabase.functions.invoke("send-email", { body: { to: toEmail, subject, html } });
  } catch (_) {}
}

async function sendEmailToUser(userId, subject, html, type = 'general') {
  if (!userId) return;
  try {
    const { data } = await supabase.from("users")
      .select("email, notification_prefs").eq("id", userId).maybeSingle();
    if (!data?.email) return;
    if (data.notification_prefs?.[type]?.email === false) return;
    await sendEmail(data.email, subject, html);
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

// Case / project the AI calls belong to (set by the case screen), for the Costs tab.
let _aiContext = { caseId: null, projectId: null };
function setAiContext(ctx) { _aiContext = { caseId: ctx?.caseId ?? null, projectId: ctx?.projectId ?? null }; }

// The AI answers in the user's profile language (kept in localStorage 'tc_lang' by the i18n
// provider). Callers that need a specific document language (e.g. a proposal written for a
// customer) pass outputLang; outputLang: false disables the instruction.
const AI_LANG_NAMES = { es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese' };
function aiLanguageNote(outputLang) {
  if (outputLang === false) return '';
  let code = outputLang;
  if (!code) { try { code = localStorage.getItem('tc_lang'); } catch { code = null; } }
  const name = code && code !== 'en' ? AI_LANG_NAMES[code] : null;
  if (!name) return '';
  return `\n\nLANGUAGE: Write all human-readable output (prose, headings, summaries, descriptions, lists, recommendations, questions) in ${name}. `
    + `Keep code, SAP object/transaction names, technical identifiers, JSON keys and enum values exactly as requested (enum values stay in English).`;
}

// Resolves when the page is visible and the device is online (a phone that locked its screen or
// went to the background cuts the open requests: "Load failed" / "Failed to fetch").
function _whenUsable(maxWaitMs = 10 * 60 * 1000) {
  const ok = () => (typeof document === 'undefined' || document.visibilityState === 'visible') && (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (ok()) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { if (!ok()) return; cleanup(); resolve(); };
    const cleanup = () => { document.removeEventListener('visibilitychange', done); window.removeEventListener('online', done); clearTimeout(t); };
    const t = setTimeout(() => { cleanup(); resolve(); }, maxWaitMs);
    document.addEventListener('visibilitychange', done); window.addEventListener('online', done);
  });
}
const _isNetworkError = e => e instanceof TypeError || /load failed|failed to fetch|networkerror|network connection was lost/i.test(e?.message ?? '');

async function callClaude({ system, messages, max_tokens = 2048, model = 'claude-haiku-4-5', mcp_servers, feature, caseId, projectId, outputLang }) {
  const langNote = aiLanguageNote(outputLang);
  if (langNote) system = (system ?? '') + langNote;
  // Attach current user id so the server can track usage / apply the right key
  let userId = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
  } catch (_) {}

  const payload = JSON.stringify(sanitizeDeep({
    system, messages, max_tokens, model,
    user_id: userId,
    case_id: caseId ?? _aiContext.caseId ?? null,
    project_id: projectId ?? _aiContext.projectId ?? null,
    feature: feature ?? 'other',
    ...(mcp_servers?.length ? { mcp_servers } : {}),
  }));
  // Connection lost (screen locked, app in background, network change): wait until the page is
  // usable again and retry, up to 3 times, instead of failing every spec generated in parallel.
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      await _whenUsable();
      res = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      break;
    } catch (e) {
      if (!_isNetworkError(e) || attempt >= 3) {
        const err = new Error(_isNetworkError(e)
          ? 'Se perdió la conexión con el servidor durante la generación (por ejemplo, la pantalla se bloqueó o el navegador pasó a segundo plano). Mantenga la pantalla activa y vuelva a intentarlo.'
          : (e?.message ?? String(e)));
        err.code = _isNetworkError(e) ? 'network' : undefined;
        throw err;
      }
      await new Promise(r => setTimeout(r, [2000, 6000, 15000][attempt]));
    }
  }
  // Errors that are not JSON (gateway timeout, request too large) get a readable message.
  const readJson = async () => { const t = await res.text(); try { return JSON.parse(t); } catch { return { error: { message: t.slice(0, 200) } }; } };

  if (res.status === 402) {
    const e = await readJson();
    const err = new Error(e.error?.message ?? 'Monthly AI generation limit reached. Go to Profile → AI to add your API key or upgrade to Pro.');
    err.code = 'ai_limit_reached';
    err.used  = e.error?.used;
    err.limit = e.error?.limit;
    try { window.dispatchEvent(new CustomEvent('ai-limit-reached', { detail: { used: err.used, limit: err.limit } })); } catch (_) {}
    throw err;
  }

  if (!res.ok) {
    if (res.status === 504) throw new Error('El servidor de IA tardó demasiado en responder (tiempo límite). Vuelva a intentarlo.');
    if (res.status === 413) throw new Error('La solicitud a la IA es demasiado grande (documentos o imágenes). Quite documentos que no sean necesarios y vuelva a intentarlo.');
    const e = await readJson(); throw new Error(e.error?.message || `Claude API error (${res.status})`);
  }
  const data = await readJson();
  // The answer can hold thinking, text and tool blocks. With live SAP tools (MCP) it reads
  // "intro text → tool calls → tool results → final text": the answer is the text written after
  // the last tool step, not the first text block (that was only the intro).
  const blocks = Array.isArray(data?.content) ? data.content : [];
  let lastTool = -1;
  blocks.forEach((b, i) => { if (/tool_(use|result)$/.test(b?.type ?? '')) lastTool = i; });
  const textAfter = blocks.slice(lastTool + 1).filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n\n').trim();
  const text = textAfter || blocks.filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n\n').trim();
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

function resolveNavigation(n) {
  const title = n.title ?? "";
  if (/team invitation/i.test(title)) return { view: "profile", tab: "teams" };
  if (/vouched for you/i.test(title)) return { view: "profile", tab: "experience" };
  if (/you received a.*rating/i.test(title)) return { view: "profile", tab: "experience" };
  if (n.case_id) return { view: "cases", caseId: n.case_id };
  return null;
}

export { notify, notifyManagers, notifyCaseParticipants, callClaude, setAiContext, logEvent, clearAuditConfigCache, buildEmailHtml, sendEmail, sendEmailToUser, sendEmailToManagers, resolveNavigation };
