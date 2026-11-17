// Server-side validation for SAP writes and transport releases (Phase 4).
// /api/adt-write calls validateSapAction() before forwarding to the ADT bridge. It repeats
// the checks the app makes (role permissions + the case's validation rules, resolved
// Global → Customer → Project) so they cannot be skipped by calling the API directly,
// then issues a one-time ticket the bridge requires for the write / release.
//
// Reads use the caller's own token (RLS: a user who cannot see the case cannot write for
// it). Only the ticket insert uses the service role.
import { createClient } from '@supabase/supabase-js';
import { ROLE_PERMISSIONS_DEFAULTS } from '../src/lib/constants.js';
import { resolvePolicies, isProtectedSapEnv, sapNamingProblems } from '../src/lib/validationPolicies.js';

const URL_ = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const ANON = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SVC_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SVC_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const PRE_DEV = ['open', 'new', 'confirmed', 'returned', 'estimated', 'assigned', 'screening', 'shortlisted', 'triage', 'in_analysis'];
const CLOSED  = ['completed', 'cancelled', 'terminated', 'closed', 'resolved', 'approved'];
const SETTING_KEYS = ['role_permissions', 'validation_policies', 'validation_overrides', 'sap_integration',
  'sap_blueprint', 'transport_approvals', 'sap_adt_write_policy'];

const normHost = (h) => String(h ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function can(role, cap, matrix) {
  if (!role) return false;
  if (role === 'admin') return true;
  return { ...(ROLE_PERMISSIONS_DEFAULTS[cap] ?? {}), ...((matrix ?? {})[cap] ?? {}) }[role] === true;
}

// Every SAP environment saved anywhere (customer, project, legacy single config) with this host.
function envsForHost(sapIntegration, host) {
  const h = normHost(host);
  const out = [];
  for (const cfg of Object.values(sapIntegration ?? {})) {
    if (!cfg || typeof cfg !== 'object') continue;
    const envs = Array.isArray(cfg.environments) ? cfg.environments : (cfg.host ? [cfg] : []);
    for (const e of envs) if (e?.host && normHost(e.host) === h) out.push(e);
  }
  return out;
}

const fail = (status, error) => ({ ok: false, status, error: `Server validation: ${error}` });

/**
 * action: 'write' | 'release'. body: the /api/adt-write payload.
 * Returns { ok: true, ticket, warnings } or { ok: false, status, error }.
 */
export async function validateSapAction(token, action, body) {
  if (!URL_ || !ANON || !SVC_URL || !SVC_KEY) return fail(503, 'not configured on the server (Supabase keys missing) — SAP writes are disabled');
  if (!token) return fail(401, 'sign in to the platform and retry');

  const db = createClient(URL_, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await db.auth.getUser(token);
  const userId = u?.user?.id;
  if (uErr || !userId) return fail(401, 'your session expired — sign in again and retry');

  const [{ data: prof }, { data: rows }] = await Promise.all([
    db.from('users').select('role, verification_status').eq('id', userId).maybeSingle(),
    db.from('system_settings').select('key, value').in('key', SETTING_KEYS),
  ]);
  const settings = Object.fromEntries((rows ?? []).map(r => [r.key, r.value]));
  const role = prof?.role ?? null;
  if (prof && prof.verification_status && prof.verification_status !== 'approved') {
    return fail(403, 'your account is not approved yet');
  }

  const cap = action === 'release' ? 'release_transports' : 'run_sap_implementation';
  if (!can(role, cap, settings.role_permissions)) {
    return fail(403, `your role (${role ?? 'unknown'}) is not allowed to ${action === 'release' ? 'release transports' : 'write to SAP'} (Settings → Roles & Perms)`);
  }

  // Never write to / release on QA or Production systems (always on).
  const envs = envsForHost(settings.sap_integration, body?.host);
  const prot = envs.find(isProtectedSapEnv);
  if (prot) return fail(403, `${prot.name ?? body?.host} is a ${String(prot.envType).toUpperCase()} system — the platform only writes to development/sandbox systems`);

  // The case (or project) this is for. RLS: no row = this user has no access to it.
  const caseId = body?.caseId || null;
  let projectId = body?.projectId || null;
  let clientId = null;
  let caseRow = null;
  if (caseId) {
    const { data } = await db.from('cases').select('id, status, client_id, project_id').eq('id', caseId).maybeSingle();
    if (!data) return fail(403, 'case not found or you have no access to it');
    caseRow = data;
    projectId = data.project_id ?? null;
    clientId = data.client_id ?? null;
  } else if (action === 'write') {
    return fail(400, 'SAP writes must be made from a case (no case was given)');
  }
  if (projectId) {
    const { data: prj } = await db.from('projects').select('id, client_id').eq('id', projectId).maybeSingle();
    if (!prj && !caseRow) return fail(403, 'project not found or you have no access to it');
    clientId = clientId ?? prj?.client_id ?? null;
  }
  if (!caseRow && !projectId) return fail(400, 'no case or project was given');

  const pol = resolvePolicies(settings, { clientId, projectId });
  const warnings = [];
  let objectName = null;
  let transport = null;

  if (action === 'write') {
    objectName = String(body?.name ?? '').trim().toUpperCase() || null;

    // Spec approved and case In Progress (or later, not closed).
    if (pol.sap_require_spec_and_stage.mode === 'block') {
      const st = String(caseRow.status ?? '').toLowerCase();
      const { data: sp } = await db.from('case_specifications').select('status').eq('case_id', caseId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const why = [
        sp?.status !== 'approved' ? 'the spec is not approved' : null,
        PRE_DEV.includes(st) ? `the case is still "${caseRow.status}" (not In Progress yet)` : null,
        CLOSED.includes(st) ? `the case is "${caseRow.status}" (closed for development)` : null,
      ].filter(Boolean);
      if (why.length) return fail(403, `cannot write to SAP: ${why.join(' and ')}`);
    }

    // SAP naming rules.
    if (pol.sap_naming_check.mode === 'block' && objectName && body?.objectType) {
      const probs = sapNamingProblems(body.objectType, objectName);
      if (probs.length) return fail(403, `${objectName}: ${probs.join('; ')}`);
    }

    // Package required (no $TMP).
    let pkgMode = pol.sap_require_package.mode;
    if (pol.sap_require_package.source === 'default' && settings.sap_adt_write_policy?.requirePackage) pkgMode = 'block';
    const pkg = String(body?.parentName ?? '').trim().toUpperCase();
    if (pkgMode === 'block' && (!pkg || pkg === '$TMP')) return fail(403, `${objectName}: no SAP package — objects must be created in a development package, not $TMP`);

    // Blueprint objects approved before writing.
    if (pol.sap_require_object_approval.mode === 'block') {
      const bpObj = ((settings.sap_blueprint ?? {})[caseId]?.objects ?? [])
        .find(o => String(o?.name ?? '').trim().toUpperCase() === objectName);
      if (bpObj && bpObj.approval_status !== 'approved') return fail(403, `${objectName}: not approved yet — submit it for review and get it approved before writing to SAP`);
    }
  } else {
    transport = String(body?.transport ?? '').trim().toUpperCase();
    // Only transports the platform tracks for this case / project can be released here.
    let q = db.from('case_transport_requests').select('id, case_id, project_id').eq('request_number', transport);
    q = caseId ? q.eq('case_id', caseId) : q.eq('project_id', projectId);
    const { data: trs } = await q.limit(1);
    if (!trs?.length) return fail(403, `${transport} is not a transport of this ${caseId ? 'case' : 'project'}`);

    if (pol.transport_release_requires_approval.mode === 'block') {
      const appr = settings.transport_approvals ?? {};
      const scoped = appr[caseId ? `case_${caseId}` : `project_${projectId}`] ?? (caseId && projectId ? appr[`project_${projectId}`] : null);
      if (scoped?.status !== 'approved') return fail(403, 'release requires the transport approval link to be approved first (Approval step)');
    }
  }

  // One-time ticket for this exact action, checked and used up by the ADT bridge.
  const svc = createClient(SVC_URL, SVC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: t, error: tErr } = await svc.from('sap_action_tickets').insert({
    user_id: userId, case_id: caseId, project_id: projectId, action,
    object_name: objectName, transport, sap_host: normHost(body?.host),
  }).select('id').single();
  if (tErr || !t?.id) return fail(503, `could not issue the write ticket (${tErr?.message ?? 'unknown error'})`);

  return { ok: true, ticket: t.id, warnings };
}
