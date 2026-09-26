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
// ─────────────────────────────────────────────────────────────

// ── Claude API helper ────────────────────────────────────────
async function callClaude({ system, messages, max_tokens = 2048, model = 'claude-haiku-4-5-20251001' }) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens, model }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Claude API error'); }
  const data = await res.json();
  return data.content[0].text;
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

export { notify, notifyManagers, notifyCaseParticipants, callClaude, logEvent, clearAuditConfigCache };
