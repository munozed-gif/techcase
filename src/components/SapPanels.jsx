import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight,
  Clock, Code2, Eye, FileCode2, FileText, FolderOpen, LayoutGrid, Loader2,
  Link2, Mail, RefreshCw,
  Play, Plus, Save, Settings, Sparkles, ThumbsDown, ThumbsUp, Upload, User, X, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useDbConnections, useProjectDbConnections } from "../hooks/useCoreHooks.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { callClaude, logEvent } from "../lib/utils.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";
import { fmtDate, fmt } from "../lib/uiUtils.jsx";

function useClientProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data: updated, error } = await supabase
      .from("client_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      const { error: ie } = await supabase
        .from("client_profiles")
        .insert({ id: userId, ...updates });
      if (ie) throw new Error(`Profile create failed: ${ie.message}`);
    }
    await fetchProfile();
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}

// ============================================================
// ABAP CODING STANDARDS
// ============================================================

const ABAP_STANDARDS_DEFAULTS = {
  globalPrefix: 'Z',
  namespacePrefix: '',
  objectTypePrefixes: {
    program: 'R_', class: 'CL_', interface: 'IF_',
    function_module: '', table: 'ZT_', enhancement: 'E_', badi: 'BD_', other: '',
  },
  authorId: '',
  headerTemplate:
    `*&---------------------------------------------------------------------*\n` +
    `*& Object  : {object_name}\n` +
    `*& Author  : {author}\n` +
    `*& Date    : {date}\n` +
    `*& TR      : {transport}\n` +
    `*& Desc.   : {description}\n` +
    `*&---------------------------------------------------------------------*`,
  changeLogTemplate: `*& {date} {author} {transport}: {change_description}`,
  changeLogLocation: 'top',
  oldCodeHandling: 'comment_block',
  oldCodeBeginMarker: `*-BEGIN OLD: {transport} {date} {author}`,
  oldCodeEndMarker:   `*-END OLD: {transport}`,
  markNewCode: true,
  newCodeBeginMarker: `*-BEGIN NEW: {transport} {date} {author}`,
  newCodeEndMarker:   `*-END NEW: {transport}`,
  abapVersion: 'modern',
  errorHandling: 'subrc',
  selectStyle: 'into_table',
  localVarNaming: true,
  additionalInstructions: '',
};

function resolveAbapStandards(settings, clientId, projectId, caseId) {
  const clientStd  = (settings['abap_standards_client']  ?? {})[clientId]  ?? {};
  const projectStd = (settings['abap_standards_project'] ?? {})[projectId] ?? {};
  const caseStd    = (settings['abap_standards_case']    ?? {})[caseId]    ?? {};
  return {
    ...ABAP_STANDARDS_DEFAULTS,
    ...clientStd,
    objectTypePrefixes: {
      ...ABAP_STANDARDS_DEFAULTS.objectTypePrefixes,
      ...(clientStd.objectTypePrefixes ?? {}),
      ...(projectStd.objectTypePrefixes ?? {}),
      ...(caseStd.objectTypePrefixes ?? {}),
    },
    ...projectStd,
    ...caseStd,
  };
}

function buildAbapStandardsPrompt(standards, objectType, objectName, act, caseData, transportReq, isModification) {
  const today = new Date().toISOString().slice(0, 10);
  const tr = transportReq || '{TRANSPORT}';
  const author = standards.authorId || '{AUTHOR}';

  const header = standards.headerTemplate
    .replace(/{object_name}/g, objectName)
    .replace(/{author}/g, author)
    .replace(/{date}/g, today)
    .replace(/{transport}/g, tr)
    .replace(/{description}/g, act?.description || act?.title || '');

  const changeLog = standards.changeLogTemplate
    .replace(/{date}/g, today)
    .replace(/{author}/g, author)
    .replace(/{transport}/g, tr)
    .replace(/{change_description}/g, act?.title || 'Implementation');

  const typePfx = (standards.objectTypePrefixes ?? {})[objectType] ?? standards.objectTypePrefixes?.other ?? '';
  const globalPfx = standards.namespacePrefix
    ? `/${standards.namespacePrefix}/`
    : (standards.globalPrefix || 'Z');

  const lines = [
    `== ABAP CODING STANDARDS (MANDATORY — follow exactly) ==`,
    ``,
    `NAMING:`,
    `  Global prefix for new objects: ${globalPfx}`,
    typePfx ? `  Object type prefix for ${objectType}: ${typePfx} (e.g. ${globalPfx}${typePfx}${objectName.replace(/^[A-Z\/]+/, '')})` : '',
    standards.localVarNaming ? `  Local variables: lv_ prefix, local structures: ls_, local tables: lt_, field-symbols: <lv_>/<ls_>/<lt_>` : '',
    ``,
    `PROGRAM HEADER (place at the very top):`,
    header,
    ``,
    isModification ? [
      `CHANGE LOG — add this entry in the ${standards.changeLogLocation === 'bottom' ? 'BOTTOM' : 'TOP'} changelog section:`,
      changeLog,
      ``,
      `OLD CODE HANDLING (${standards.oldCodeHandling}):`,
      standards.oldCodeHandling === 'delete'
        ? `  Remove old code entirely — do NOT leave commented-out blocks.`
        : standards.oldCodeHandling === 'keep'
          ? `  Keep old code as-is — do NOT comment it out.`
          : [
              `  Wrap OLD code with markers:`,
              `  ${standards.oldCodeBeginMarker.replace(/{transport}/g, tr).replace(/{date}/g, today).replace(/{author}/g, author)}`,
              `  ... old code ...`,
              `  ${standards.oldCodeEndMarker.replace(/{transport}/g, tr)}`,
            ].join('\n'),
      standards.markNewCode ? [
        ``,
        `NEW CODE MARKERS — wrap new/changed logic with:`,
        `  ${standards.newCodeBeginMarker.replace(/{transport}/g, tr).replace(/{date}/g, today).replace(/{author}/g, author)}`,
        `  ... new code ...`,
        `  ${standards.newCodeEndMarker.replace(/{transport}/g, tr)}`,
      ].join('\n') : '',
    ].filter(Boolean).join('\n') : '',
    ``,
    `ABAP STYLE:`,
    standards.abapVersion === 'modern'
      ? `  Use modern ABAP syntax (inline declarations, string templates, method chaining).`
      : `  Use classic ABAP syntax compatible with older NetWeaver releases. Avoid inline declarations.`,
    standards.errorHandling === 'exceptions'
      ? `  Error handling: use class-based exceptions (cx_* classes).`
      : `  Error handling: check sy-subrc after every database/function call.`,
    standards.selectStyle === 'for_all_entries'
      ? `  SELECT: prefer FOR ALL ENTRIES pattern for multi-row reads.`
      : `  SELECT: use SELECT ... INTO TABLE @DATA(lt_result) pattern.`,
    ``,
    standards.additionalInstructions ? [`ADDITIONAL PROJECT INSTRUCTIONS:`, standards.additionalInstructions, ``].join('\n') : '',
    `== END ABAP CODING STANDARDS ==`,
  ].filter(s => s !== '').join('\n');

  return lines;
}

// ============================================================
// SAP MCP HELPERS
// ============================================================

/**
 * Encode SAP env credentials as a base64 Bearer token for the MCP server.
 * The MCP server decodes this to make ADT calls server-side.
 */
function buildSapMcpToken(sapConfig) {
  if (!sapConfig?.host || !sapConfig?.username || !sapConfig?.password) return null;
  const payload = {
    host:     sapConfig.host,
    username: sapConfig.username,
    password: sapConfig.password,
    client:   sapConfig.client ?? '100',
    type:     sapConfig.type ?? 's4hana',
    proxyUrl: sapConfig.proxyUrl ?? '',
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Build the mcp_servers array for callClaude when a SAP env + MCP server URL are configured.
 * Returns undefined when either is missing so callClaude falls back to plain generation.
 */
function buildSapMcpConfig(sapConfig, mcpServerUrl) {
  if (!mcpServerUrl?.trim() || !sapConfig?.host) return undefined;
  const token = buildSapMcpToken(sapConfig);
  if (!token) return undefined;
  return [
    {
      type: 'url',
      url: mcpServerUrl.trim().replace(/\/$/, '') + '/mcp',
      name: 'sap-tools',
      authorization_token: token,
    },
  ];
}

// ============================================================
// SAP API UTILITIES
// ============================================================

async function sapApiRequest(config, path, opts = {}) {
  // Prefer manual proxyUrl or VPN-linked proxy; otherwise call SAP directly.
  const proxyUrl = config.proxyUrl?.trim() || config._vpnProxyUrl?.trim();
  const base = (proxyUrl || config.host.trim()).replace(/\/$/, '');
  const auth = btoa(`${config.username}:${config.password}`);
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/xml, text/xml, text/plain',
    'sap-client': String(config.client || '100'),
    ...(proxyUrl ? { 'X-Sap-Target': config.host.trim().replace(/\/$/, '') } : {}),
    ...(opts.headers ?? {}),
  };
  const url = `${base}${path}`;
  const res = await fetch(url, { ...opts, headers, credentials: 'omit' });
  return res;
}

async function sapGetCsrfToken(config) {
  const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
    method: 'GET',
    headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CSRF fetch failed HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
  }
  return res.headers.get('X-CSRF-Token') ?? '';
}

async function sapWriteSourceDetail(config, objectType, objectName, source, transportRequest) {
  const path = sapObjectPath(objectType, objectName);

  // Try to get CSRF token; if it fails (e.g. CORS blocks X-CSRF-Token header),
  // attempt the PUT without a token — some SAP systems don't enforce it.
  let csrfToken = '';
  let csrfError = null;
  try {
    csrfToken = await sapGetCsrfToken(config);
  } catch (e) {
    csrfError = e.message;
    // Continue without token — will fail with 403 if SAP requires it
  }

  let res;
  try {
    res = await sapApiRequest(config, path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        Accept: 'application/xml',
        ...(transportRequest ? { corrNbr: transportRequest } : {}),
      },
      body: source,
    });
  } catch (e) {
    // Network/CORS error on the PUT itself
    const corsHint = `Load failed — SAP needs CORS configured for PUT requests from ${typeof window !== 'undefined' ? window.location.origin : 'this domain'}. ` +
      `Ask your SAP basis team to allow PUT, X-CSRF-Token, corrNbr in SICF CORS settings.` +
      (csrfError ? ` (CSRF fetch also failed: ${csrfError})` : '');
    return { ok: false, phase: 'write', error: corsHint };
  }

  const body = await res.text().catch(() => '');
  if (!res.ok && res.status === 403 && csrfError) {
    return {
      ok: false, phase: 'csrf', status: res.status,
      error: `SAP requires CSRF token but the prefetch was blocked (likely CORS). ` +
        `Enable X-CSRF-Token in SICF CORS allowed headers. Detail: ${csrfError}`,
    };
  }
  return { ok: res.ok, status: res.status, body: body.slice(0, 200), phase: 'write' };
}

async function sapLiveCheck(config) {
  try {
    const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
      headers: { Accept: 'application/atomsvc+xml' },
    });
    if (!res.ok) return { error: res.status };
    const xml = await res.text();
    const title = xml.match(/<title[^>]*>([^<]+)/)?.[1]?.trim() ?? '';
    const ver   = xml.match(/release="([^"]+)"/)?.[1] ?? xml.match(/version="([^"]+)"/)?.[1] ?? '';
    const spVer = xml.match(/sp="([^"]+)"/)?.[1] ?? '';
    const systemInfo = [title, ver && `Release ${ver}`, spVer && `SP ${spVer}`].filter(Boolean).join(' | ') || 'Connected';
    return { systemInfo, components: [], raw: xml.slice(0, 300) };
  } catch (e) { return { error: 0, message: e?.message ?? String(e) }; }
}

function sapObjectPath(objectType, objectName) {
  const n = (objectName ?? '').toUpperCase();
  switch (objectType) {
    case 'program':     return `/sap/bc/adt/programs/programs/${n}/source/main`;
    case 'class':       return `/sap/bc/adt/oo/classes/${n}/source/main`;
    case 'function_module': {
      const [fg, fm] = n.includes('/') ? n.split('/') : [n, n];
      return `/sap/bc/adt/functions/groups/${fg}/fmodules/${fm}/source/main`;
    }
    case 'table':       return `/sap/bc/adt/ddic/dbtables/${n}/source/main`;
    case 'enhancement': return `/sap/bc/adt/enhancements/${n}/source/main`;
    default:            return `/sap/bc/adt/programs/programs/${n}/source/main`;
  }
}

async function sapFetchSource(config, objectType, objectName) {
  const path = sapObjectPath(objectType, objectName);
  const res = await sapApiRequest(config, path, {
    headers: { Accept: 'text/plain, application/vnd.sap.adt.abapsource+text, */*' },
  });
  if (!res.ok) return null;
  return res.text();
}

async function sapWriteSource(config, objectType, objectName, source, transportRequest) {
  const path = sapObjectPath(objectType, objectName);
  const csrfToken = await sapGetCsrfToken(config);
  const res = await sapApiRequest(config, path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-CSRF-Token': csrfToken,
      Accept: 'application/xml',
      ...(transportRequest ? { corrNbr: transportRequest } : {}),
    },
    body: source,
  });
  return res.ok;
}

// ============================================================
// SAP INTEGRATION PANEL (ClientProfileView tab)
// ============================================================
const SAP_ENV_TYPE_META = {
  dev: { label: 'Development (DEV)', color: 'bg-blue-100 text-blue-700' },
  qas: { label: 'Quality (QAS)',     color: 'bg-amber-100 text-amber-700' },
  prd: { label: 'Production (PRD)', color: 'bg-red-100 text-red-700' },
  snd: { label: 'Sandbox (SND)',    color: 'bg-green-100 text-green-700' },
};

function SapIntegrationPanel({ clientId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const allConfigs = ssCtx.settings['sap_integration'] ?? {};
  const clientRaw = allConfigs[clientId] ?? {};

  // Backward compat: old format was flat { host, client, ... } — migrate to environments array
  const initialEnvs = clientRaw.environments ?? (
    clientRaw.host ? [{ id: 'default', name: 'Default', envType: 'dev', ...clientRaw }] : []
  );

  const [environments, setEnvironments] = useState(initialEnvs);
  const [expandedId, setExpandedId] = useState(null);
  const [testStates, setTestStates] = useState({});
  const [testErrors, setTestErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canEdit = auth.isAdmin || auth.isManager || auth.isClient;

  async function saveEnvironments(envs) {
    setSaving(true);
    await ssCtx.setSetting('sap_integration', { ...allConfigs, [clientId]: { ...(allConfigs[clientId] ?? {}), environments: envs } });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function addEnvironment() {
    const newEnv = {
      id: crypto.randomUUID(),
      name: 'New Environment',
      envType: 'dev',
      host: '',
      client: '100',
      username: '',
      password: '',
      proxyUrl: '',
      type: 's4hana',
      liveCheckOnGenerate: false,
      autoImplementEnabled: false,
    };
    const updated = [...environments, newEnv];
    setEnvironments(updated);
    setExpandedId(newEnv.id);
  }

  function updateEnvField(id, field, value) {
    setEnvironments(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    setTestStates(p => ({ ...p, [id]: null }));
  }

  function deleteEnv(id) {
    const updated = environments.filter(e => e.id !== id);
    setEnvironments(updated);
    if (expandedId === id) setExpandedId(null);
    saveEnvironments(updated);
  }

  function enrichEnvWithVpn(env) {
    const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
    const vpnProxyUrl = linkedConn?.db_type === 'vpn' ? linkedConn.meta?.proxy_url?.trim() : null;
    return vpnProxyUrl ? { ...env, _vpnProxyUrl: vpnProxyUrl } : env;
  }

  async function testConnection(env) {
    setTestStates(p => ({ ...p, [env.id]: 'testing' }));
    setTestErrors(p => ({ ...p, [env.id]: null }));
    const enriched = enrichEnvWithVpn(env);
    const effectiveProxy = enriched.proxyUrl?.trim() || enriched._vpnProxyUrl;
    try {
      const result = await sapLiveCheck(enriched);
      if (result && !result.error) {
        setTestStates(p => ({ ...p, [env.id]: 'ok' }));
      } else {
        setTestStates(p => ({ ...p, [env.id]: 'fail' }));
        const status = result?.error;
        const statusMsg = status === 401 ? 'HTTP 401 — Wrong username, password or client (MANDT).'
          : status === 403 ? 'HTTP 403 — User lacks ADT authorizations in SAP.'
          : status === 404 ? 'HTTP 404 — ADT service not active. Enable /sap/bc/adt in SICF.'
          : status ? `HTTP ${status} — SAP returned an error.`
          : result?.message ? `Proxy error: ${result.message}`
          : null;
        setTestErrors(p => ({ ...p, [env.id]: effectiveProxy
          ? (statusMsg ?? 'SAP returned an error. Check credentials and client number.')
          : 'Failed — SAP may be blocking browser requests (CORS). Set a Proxy URL or enable CORS on your SAP system.' }));
      }
    } catch (e) {
      setTestStates(p => ({ ...p, [env.id]: 'fail' }));
      const msg = e?.message ?? String(e);
      setTestErrors(p => ({ ...p, [env.id]: /fetch|network|cors|failed to fetch/i.test(msg)
        ? 'Network error — SAP is likely blocking browser requests (CORS). Set a Proxy URL above.'
        : msg }));
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Code2 size={16} className="text-blue-600" />{t('sap.integration_title')}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('sap.integration_subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={addEnvironment}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
            <Plus size={13} />{t('sap.add_environment')}
          </button>
        )}
      </div>

      {environments.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
          {t('sap.no_environments')}
        </div>
      ) : (
        <div className="space-y-3">
          {environments.map(env => {
            const isExpanded = expandedId === env.id;
            const typeMeta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
            const testStatus = testStates[env.id];
            const testError  = testErrors[env.id];
            return (
              <div key={env.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-200' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : env.id)}>
                  <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta.color}`}>{typeMeta.label}</span>
                  <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{env.name || 'Unnamed'}</span>
                  {env.host && <span className="text-xs text-gray-400 truncate hidden sm:block max-w-[180px]">{env.host}</span>}
                  {testStatus === 'ok'   && <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />}
                  {testStatus === 'fail' && <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                  {canEdit && (
                    <button onClick={e => { e.stopPropagation(); deleteEnv(env.id); }}
                      className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-1 px-2 py-1 rounded hover:bg-red-50">
                      {t('sap.delete_env')}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/40 dark:bg-black/20 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.env_name')}</label>
                        <input value={env.name} onChange={e => updateEnvField(env.id, 'name', e.target.value)} disabled={!canEdit}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.env_type')}</label>
                        <select value={env.envType} onChange={e => updateEnvField(env.id, 'envType', e.target.value)} disabled={!canEdit}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
                          <option value="dev">Development (DEV)</option>
                          <option value="qas">Quality / Testing (QAS)</option>
                          <option value="prd">Production (PRD)</option>
                          <option value="snd">Sandbox (SND)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Connection</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_host')}</label>
                          <input value={env.host} onChange={e => updateEnvField(env.id, 'host', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                            placeholder={t('sap.conn_ph_host')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_client')}</label>
                          <input value={env.client} onChange={e => updateEnvField(env.id, 'client', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                            placeholder={t('sap.conn_ph_client')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_username')}</label>
                          <input value={env.username} onChange={e => updateEnvField(env.id, 'username', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                            autoComplete="off" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_password')}</label>
                          <input type="password" value={env.password} onChange={e => updateEnvField(env.id, 'password', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                            autoComplete="new-password" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_type')}</label>
                          <select value={env.type} onChange={e => updateEnvField(env.id, 'type', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="s4hana">SAP S/4HANA</option>
                            <option value="ecc">SAP ECC / NetWeaver</option>
                            <option value="btp">SAP BTP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_proxy')}</label>
                          <input value={env.proxyUrl} onChange={e => updateEnvField(env.id, 'proxyUrl', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                            placeholder={t('sap.conn_ph_proxy')} />
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <button onClick={() => testConnection(env)} disabled={testStatus === 'testing' || !env.host || !env.username}
                            className="px-4 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded-xl disabled:opacity-50 transition-colors">
                            {testStatus === 'testing' ? t('sap.testing') : t('sap.test_connection')}
                          </button>
                          {testStatus === 'ok'   && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />{t('sap.test_ok')}</span>}
                          {testStatus === 'fail' && <span className="text-sm text-red-500 font-medium flex items-center gap-1"><XCircle size={14} />{t('sap.test_fail')}</span>}
                        </div>
                        {testStatus === 'fail' && testError && (
                          <p className="text-xs text-red-500 leading-snug max-w-sm">{testError}</p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Features</div>
                      {[
                        { key: 'liveCheckOnGenerate', labelKey: 'sap.live_check_label', descKey: 'sap.live_check_desc', color: 'bg-blue-600' },
                        { key: 'autoImplementEnabled', labelKey: 'sap.auto_impl_label', descKey: 'sap.auto_impl_desc', color: 'bg-amber-500' },
                      ].map(({ key, labelKey, descKey, color }) => (
                        <div key={key} className="flex items-start gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/60">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t(labelKey)}</p>
                            <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t(descKey)}</p>
                          </div>
                          <button disabled={!canEdit}
                            onClick={() => updateEnvField(env.id, key, !env[key])}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${env[key] ? color : 'bg-gray-200 dark:bg-gray-600'}`}
                            role="switch" aria-checked={env[key]}>
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${env[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button onClick={() => saveEnvironments(environments)} disabled={saving}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                          {saving ? '…' : t('sap.save_config')}
                        </button>
                        {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />Saved</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI model in use — read from settings, never hardcoded */}
      {(() => {
        const aiModel = ssCtx.settings["ai_model"];
        const MODEL_LABELS = {
          "claude-haiku-4-5-20251001":  t("model.haiku_label"),
          "claude-sonnet-4-6":          t("model.sonnet_label"),
          "claude-sonnet-5-20251001":   t("model.sonnet_label"),
          "claude-opus-5-20250101":     t("model.opus_label"),
        };
        const displayName = aiModel
          ? (MODEL_LABELS[aiModel] ?? aiModel)
          : t("sys.model_label");
        return (
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={13} className="text-purple-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700">AI for Code Generation</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">Used for ABAP generation &amp; analysis · Configure in Settings → Generation</p>
              </div>
            </div>
            <span className="flex-shrink-0 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1 whitespace-nowrap">
              {aiModel ? displayName : <span className="text-gray-400 font-normal">Not set</span>}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// PROJECT SAP ENVIRONMENT SELECTOR
// ============================================================
function ProjectSapEnvPanel({ projectId, clientId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  const clientSapData = (settings['sap_integration'] ?? {})[clientId] ?? {};
  const rawEnvs = clientSapData.environments ?? (clientSapData.host ? [{ id: 'default', name: 'Default', envType: 'dev', ...clientSapData }] : []);
  const sapProjectEnv = settings['sap_project_env'] ?? {};
  const selectedEnvId = sapProjectEnv[projectId] ?? '';
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedEnv = rawEnvs.find(e => e.id === selectedEnvId) ?? rawEnvs[0] ?? null;

  async function handleSelect(envId) {
    setSaving(true);
    await ssCtx.setSetting('sap_project_env', { ...sapProjectEnv, [projectId]: envId || null });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!rawEnvs.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <Code2 size={36} className="text-gray-400 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">{t('sap.no_environments')}</p>
        <p className="text-xs text-gray-400">{t('sap.integration_subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <Code2 size={16} className="text-blue-600" />{t('sap.project_env_label')}
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.project_env_label')}</label>
          <select value={selectedEnvId} onChange={e => handleSelect(e.target.value)} disabled={saving}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="">{t('sap.project_env_none')}</option>
            {rawEnvs.map(env => {
              const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
              return (
                <option key={env.id} value={env.id}>
                  {env.name} — {env.host || t('sap.conn_ph_host')} ({meta.label})
                </option>
              );
            })}
          </select>
          {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1 mt-2"><CheckCircle2 size={14} />Saved</span>}
        </div>

        {selectedEnv && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(SAP_ENV_TYPE_META[selectedEnv.envType] ?? SAP_ENV_TYPE_META.dev).color}`}>
                {(SAP_ENV_TYPE_META[selectedEnv.envType] ?? SAP_ENV_TYPE_META.dev).label}
              </span>
              <span className="font-semibold text-sm text-gray-800">{selectedEnv.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
              <div><span className="font-medium text-gray-600">Host:</span> {selectedEnv.host || '—'}</div>
              <div><span className="font-medium text-gray-600">Client:</span> {selectedEnv.client || '—'}</div>
              <div><span className="font-medium text-gray-600">User:</span> {selectedEnv.username || '—'}</div>
              <div><span className="font-medium text-gray-600">System:</span> {selectedEnv.type?.toUpperCase() || '—'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('sap.environments')}</h4>
        <div className="space-y-2">
          {rawEnvs.map(env => {
            const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
            const isActive = env.id === (selectedEnvId || rawEnvs[0]?.id);
            return (
              <div key={env.id}
                onClick={() => handleSelect(env.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'border-blue-200 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.color}`}>{meta.label}</span>
                <span className="font-medium text-sm text-gray-800 flex-1">{env.name}</span>
                <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[200px]">{env.host}</span>
                {isActive && <CheckCircle2 size={14} className="text-blue-500 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <AbapStandardsPanel level="project" entityId={projectId} clientId={clientId} auth={auth} />
    </div>
  );
}

// ============================================================
// ABAP STANDARDS DOCUMENT SECTION
// ============================================================
function AbapTemplateSection({ projectId, canEdit }) {
  const ssCtx = useSystemSettings();
  const allConfigs = ssCtx.settings['sap_integration'] ?? {};
  const storageKey = `proj_${projectId}`;
  const projCfg = allConfigs[storageKey] ?? {};

  // Support legacy single-object and new array format
  const rawSaved = projCfg.abap_templates ?? (projCfg.abap_template ? [projCfg.abap_template] : []);

  const [projectDocs, setProjectDocs] = useState([]);
  const [selected, setSelected]       = useState('');
  const [uploading, setUploading]     = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    async function loadDocs() {
      const { data: cases } = await supabase.from('cases').select('id').eq('project_id', projectId);
      if (!cases?.length) return;
      const { data: docs } = await supabase.from('case_documents')
        .select('id, file_name, file_url, file_type, file_size_kb')
        .in('case_id', cases.map(c => c.id))
        .order('created_at', { ascending: false });
      setProjectDocs((docs ?? []).filter(d =>
        /\.(docx?|pdf|md|txt)$/i.test(d.file_name ?? '') ||
        /word|pdf|markdown|plain/i.test(d.file_type ?? '')
      ));
    }
    loadDocs();
  }, [projectId]);

  async function saveTemplates(list) {
    await ssCtx.setSetting('sap_integration', {
      ...allConfigs,
      [storageKey]: { ...projCfg, abap_templates: list, abap_template: undefined },
    });
  }

  async function handleSelect(docId) {
    setSelected(docId);
    if (!docId) return;
    const doc = projectDocs.find(d => d.id === docId);
    if (!doc) return;
    const already = rawSaved.some(t => t.url === doc.file_url);
    if (!already) await saveTemplates([...rawSaved, { name: doc.file_name, url: doc.file_url, size_kb: doc.file_size_kb, source: 'case_doc' }]);
    setSelected('');
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `project-templates/${projectId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from('case-documents').upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('case-documents').getPublicUrl(path);
        added.push({ name: file.name, url: publicUrl, size_kb: Math.round(file.size / 1024), source: 'upload' });
      } catch (err) { alert(`${file.name}: ${err.message}`); }
    }
    if (added.length) await saveTemplates([...rawSaved, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleRemove(idx) {
    await saveTemplates(rawSaved.filter((_, i) => i !== idx));
  }

  // Docs not yet added
  const availableDocs = projectDocs.filter(d => !rawSaved.some(t => t.url === d.file_url));

  return (
    <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={15} className="text-amber-500" />
        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">ABAP Standards Documents</h3>
      </div>
      <p className="text-xs text-gray-400 leading-snug -mt-2">
        Attach your customer's ABAP naming conventions, coding standards, or transport strategy documents.
        They will be included as context when generating functional specs for this project.
      </p>

      {rawSaved.length > 0 && (
        <div className="space-y-2">
          {rawSaved.map((tmpl, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
              <FileText size={16} className="text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{tmpl.name}</p>
                {tmpl.size_kb && <p className="text-xs text-gray-400">{tmpl.size_kb} KB</p>}
              </div>
              <a href={tmpl.url} target="_blank" rel="noreferrer"
                className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors">
                View
              </a>
              {canEdit && (
                <button onClick={() => handleRemove(idx)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          {availableDocs.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <select value={selected} onChange={e => handleSelect(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">— Add from project documents —</option>
                {availableDocs.map(d => (
                  <option key={d.id} value={d.id}>{d.file_name}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
          <input ref={fileRef} type="file" accept=".doc,.docx,.pdf,.md,.txt" multiple className="hidden" onChange={handleUpload} />
        </div>
      )}

      {rawSaved.length === 0 && !canEdit && (
        <p className="text-xs text-gray-400 italic">No documents attached.</p>
      )}
    </div>
  );
}

// PROJECT-OWNED SAP PANEL (no client linked)
// ============================================================
function ProjectOwnSapPanel({ projectId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const allConfigs = ssCtx.settings['sap_integration'] ?? {};
  const storageKey = `proj_${projectId}`;
  const projectRaw = allConfigs[storageKey] ?? {};
  const initialEnvs = projectRaw.environments ?? (projectRaw.host ? [{ id: 'default', name: 'Default', envType: 'dev', ...projectRaw }] : []);

  const { projectConns } = useProjectDbConnections(projectId);

  const [environments, setEnvironments] = useState(initialEnvs);
  const [expandedId, setExpandedId] = useState(null);
  const [testStates, setTestStates] = useState({});
  const [testErrors, setTestErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sapProjectEnv = ssCtx.settings['sap_project_env'] ?? {};
  const selectedEnvId = sapProjectEnv[projectId] ?? '';

  const canEdit = auth.isAdmin || auth.isManager;

  async function saveEnvironments(envs) {
    setSaving(true);
    await ssCtx.setSetting('sap_integration', { ...allConfigs, [storageKey]: { ...(allConfigs[storageKey] ?? {}), environments: envs } });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSelectDefault(envId) {
    await ssCtx.setSetting('sap_project_env', { ...sapProjectEnv, [projectId]: envId || null });
  }

  function addEnvironment() {
    const newEnv = {
      id: crypto.randomUUID(),
      name: 'New Environment',
      envType: 'dev',
      host: '',
      client: '100',
      username: '',
      password: '',
      proxyUrl: '',
      type: 's4hana',
      liveCheckOnGenerate: false,
      autoImplementEnabled: false,
    };
    const updated = [...environments, newEnv];
    setEnvironments(updated);
    setExpandedId(newEnv.id);
  }

  function updateEnvField(id, field, value) {
    setEnvironments(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    setTestStates(p => ({ ...p, [id]: null }));
  }

  function deleteEnv(id) {
    const updated = environments.filter(e => e.id !== id);
    setEnvironments(updated);
    if (expandedId === id) setExpandedId(null);
    saveEnvironments(updated);
  }

  function enrichEnvWithVpn(env) {
    const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
    const vpnProxyUrl = linkedConn?.db_type === 'vpn' ? linkedConn.meta?.proxy_url?.trim() : null;
    return vpnProxyUrl ? { ...env, _vpnProxyUrl: vpnProxyUrl } : env;
  }

  async function testConnection(env) {
    setTestStates(p => ({ ...p, [env.id]: 'testing' }));
    setTestErrors(p => ({ ...p, [env.id]: null }));
    try {
      const enriched = enrichEnvWithVpn(env);
      const effectiveProxy = enriched.proxyUrl?.trim() || enriched._vpnProxyUrl;
      const result = await sapLiveCheck(enriched);
      if (result && !result.error) {
        setTestStates(p => ({ ...p, [env.id]: 'ok' }));
      } else {
        setTestStates(p => ({ ...p, [env.id]: 'fail' }));
        const status = result?.error;
        const statusMsg = status === 401 ? 'HTTP 401 — Wrong username, password or client (MANDT).'
          : status === 403 ? 'HTTP 403 — User lacks ADT authorizations in SAP.'
          : status === 404 ? 'HTTP 404 — ADT service not active. Enable /sap/bc/adt in SICF.'
          : status ? `HTTP ${status} — SAP returned an error.`
          : result?.message ? `Proxy error: ${result.message}`
          : null;
        setTestErrors(p => ({ ...p, [env.id]: effectiveProxy
          ? (statusMsg ?? 'SAP returned an error. Check credentials and client number.')
          : 'Failed — SAP may be blocking browser requests (CORS). Set a Proxy URL or enable CORS on your SAP system.' }));
      }
    } catch (e) {
      setTestStates(p => ({ ...p, [env.id]: 'fail' }));
      const msg = e?.message ?? String(e);
      setTestErrors(p => ({ ...p, [env.id]: /fetch|network|cors|failed to fetch/i.test(msg)
        ? 'Network error — SAP is likely blocking browser requests (CORS). Set a Proxy URL above.'
        : msg }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Code2 size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-snug">
          <span className="font-semibold">Project-owned SAP environments.</span>{' '}
          These credentials are stored for this project and are used for all cases that don't have a client linked.
        </p>
      </div>

      {/* Credential management */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <Code2 size={16} className="text-blue-600" />{t('sap.integration_title')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('sap.integration_subtitle')}</p>
          </div>
          {canEdit && (
            <button onClick={addEnvironment}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
              <Plus size={13} />{t('sap.add_environment')}
            </button>
          )}
        </div>

        {environments.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
            {t('sap.no_environments')}
          </div>
        ) : (
          <div className="space-y-3">
            {environments.map(env => {
              const isExpanded = expandedId === env.id;
              const typeMeta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
              const testStatus = testStates[env.id];
              const testError  = testErrors[env.id];
              const isDefault = env.id === (selectedEnvId || environments[0]?.id);
              return (
                <div key={env.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-200' : 'border-gray-100 dark:border-gray-700'}`}>
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : env.id)}>
                    <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta.color}`}>{typeMeta.label}</span>
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 flex-1 truncate">{env.name || 'Unnamed'}</span>
                    {isDefault && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">Default</span>}
                    {env.host && <span className="text-xs text-gray-400 truncate hidden sm:block max-w-[180px]">{env.host}</span>}
                    {testStatus === 'ok'   && <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />}
                    {testStatus === 'fail' && <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                    {canEdit && !isDefault && (
                      <button onClick={e => { e.stopPropagation(); handleSelectDefault(env.id); }}
                        className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0 ml-1 px-2 py-1 rounded hover:bg-blue-50">
                        Set default
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={e => { e.stopPropagation(); deleteEnv(env.id); }}
                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-1 px-2 py-1 rounded hover:bg-red-50">
                        {t('sap.delete_env')}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/40 dark:bg-black/20 space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.env_name')}</label>
                          <input value={env.name} onChange={e => updateEnvField(env.id, 'name', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.env_type')}</label>
                          <select value={env.envType} onChange={e => updateEnvField(env.id, 'envType', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="dev">Development (DEV)</option>
                            <option value="qas">Quality / Testing (QAS)</option>
                            <option value="prd">Production (PRD)</option>
                            <option value="snd">Sandbox (SND)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Connection</div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_host')}</label>
                            <input value={env.host} onChange={e => updateEnvField(env.id, 'host', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                              placeholder={t('sap.conn_ph_host')} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_client')}</label>
                            <input value={env.client} onChange={e => updateEnvField(env.id, 'client', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                              placeholder={t('sap.conn_ph_client')} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_username')}</label>
                            <input value={env.username} onChange={e => updateEnvField(env.id, 'username', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                              autoComplete="off" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_password')}</label>
                            <input type="password" value={env.password} onChange={e => updateEnvField(env.id, 'password', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                              autoComplete="new-password" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_type')}</label>
                            <select value={env.type} onChange={e => updateEnvField(env.id, 'type', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
                              <option value="s4hana">SAP S/4HANA</option>
                              <option value="ecc">SAP ECC / NetWeaver</option>
                              <option value="btp">SAP BTP</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('sap.conn_proxy')}</label>
                            <input value={env.proxyUrl} onChange={e => updateEnvField(env.id, 'proxyUrl', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                              placeholder={t('sap.conn_ph_proxy')} />
                          </div>
                        </div>
                        {/* Network connection selector */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Network Connection <span className="text-gray-400 font-normal">(optional — VPN or tunnel to reach this SAP)</span></label>
                          <select value={env.connectionId ?? ''} onChange={e => updateEnvField(env.id, 'connectionId', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">— None —</option>
                            {projectConns.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.db_type === 'vpn' ? '🔒 VPN' : c.db_type.toUpperCase()} — {c.host}{c.port ? `:${c.port}` : ''}{c.meta?.conn_name ? ` (${c.meta.conn_name})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* VPN reminder banner */}
                      {(() => {
                        const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
                        if (!linkedConn) return null;
                        const isVpn = linkedConn.db_type === 'vpn';
                        return (
                          <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
                            <Activity size={13} className="mt-0.5 flex-shrink-0" />
                            {isVpn ? (
                              <span>
                                Connect via <strong>{linkedConn.meta?.conn_name || 'VPN'}</strong>
                                {linkedConn.meta?.remote_gateway ? <> — gateway: <strong>{linkedConn.meta.remote_gateway}</strong></> : ''}
                                {linkedConn.meta?.vpn_client ? ` (${linkedConn.meta.vpn_client})` : ''} before testing.
                              </span>
                            ) : (
                              <span>Using <strong>{linkedConn.db_type.toUpperCase()}</strong> connection at <strong>{linkedConn.host}</strong>.</span>
                            )}
                          </div>
                        );
                      })()}

                      {canEdit && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <button onClick={() => testConnection(env)} disabled={testStatus === 'testing' || !env.host || !env.username}
                              className="px-4 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded-xl disabled:opacity-50 transition-colors">
                              {testStatus === 'testing' ? t('sap.testing') : t('sap.test_connection')}
                            </button>
                            {testStatus === 'ok'   && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />{t('sap.test_ok')}</span>}
                            {testStatus === 'fail' && <span className="text-sm text-red-500 font-medium flex items-center gap-1"><XCircle size={14} />{t('sap.test_fail')}</span>}
                          </div>
                          {testStatus === 'fail' && testError && (() => {
                            const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
                            const vpnHint = linkedConn?.db_type === 'vpn'
                              ? ` Make sure you're connected to "${linkedConn.meta?.conn_name || 'VPN'}" first.`
                              : '';
                            return <p className="text-xs text-red-500 leading-snug max-w-sm">{testError}{vpnHint}</p>;
                          })()}
                        </div>
                      )}

                      <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Features</div>
                        {[
                          { key: 'liveCheckOnGenerate', labelKey: 'sap.live_check_label', descKey: 'sap.live_check_desc', color: 'bg-blue-600' },
                          { key: 'autoImplementEnabled', labelKey: 'sap.auto_impl_label', descKey: 'sap.auto_impl_desc', color: 'bg-amber-500' },
                        ].map(({ key, labelKey, descKey, color }) => (
                          <div key={key} className="flex items-start gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/60">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t(labelKey)}</p>
                              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t(descKey)}</p>
                            </div>
                            <button disabled={!canEdit}
                              onClick={() => updateEnvField(env.id, key, !env[key])}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${env[key] ? color : 'bg-gray-200 dark:bg-gray-600'}`}
                              role="switch" aria-checked={env[key]}>
                              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${env[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => saveEnvironments(environments)} disabled={saving}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                            {saving ? '…' : t('sap.save_config')}
                          </button>
                          {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />Saved</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AbapTemplateSection projectId={projectId} canEdit={canEdit} />
      <AbapStandardsPanel level="project" entityId={projectId} clientId={null} auth={auth} />
    </div>
  );
}

// ============================================================
// ABAP STANDARDS PANEL
// ============================================================
function AbapStandardsPanel({ level, entityId, clientId, projectId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  // Clients can edit their own company-level standards; admins/managers can edit at any level
  const canEdit = auth.isAdmin || auth.isManager || (level === 'client' && auth.isClient);

  const settingKey = level === 'client'  ? 'abap_standards_client'
                   : level === 'project' ? 'abap_standards_project'
                   :                       'abap_standards_case';

  // Resolve inherited for display purposes
  const resolvedBase = resolveAbapStandards(
    settings,
    level === 'client'  ? entityId : (clientId ?? ''),
    level === 'project' ? entityId : (projectId ?? ''),
    level === 'case'    ? entityId : '',
  );

  const currentMap = settings[settingKey] ?? {};
  const current = currentMap[entityId] ?? {};

  const [form, setForm] = useState(() => ({ ...resolvedBase, ...current }));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function f(key, value) { setForm(p => ({ ...p, [key]: value })); }
  function fPfx(objType, value) {
    setForm(p => ({ ...p, objectTypePrefixes: { ...(p.objectTypePrefixes ?? {}), [objType]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    const toSave = { ...form };
    await ssCtx.setSetting(settingKey, { ...currentMap, [entityId]: toSave });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white font-mono";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";
  const sectionCls = "space-y-4 pt-5 border-t border-gray-100 first:border-t-0 first:pt-0";

  const OBJECT_TYPES_FOR_PREFIX = ['program','class','interface','function_module','table','enhancement','badi','other'];

  if (level === 'case') {
    // Compact version for the case implementation tab
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileCode2 size={14} className="text-amber-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t('abap.tab_title')}</span>
          <span className="text-xs text-amber-500 ml-auto">{t('abap.inherited_hint')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('abap.global_prefix')}</label>
            <input value={form.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={10} />
          </div>
          <div>
            <label className={labelCls}>{t('abap.author_id')}</label>
            <input value={form.authorId} onChange={e => f('authorId', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={40} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('abap.ai_instructions')}</label>
          <textarea value={form.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)}
            disabled={!canEdit} rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white resize-none"
            placeholder={t('abap.ai_instructions_ph')} />
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? '…' : t('abap.save')}
            </button>
            {saved && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} />{t('abap.saved')}</span>}
          </div>
        )}
      </div>
    );
  }

  const templates = ssCtx.settings['abap_standards_templates'] ?? [];
  const [selectedTplId, setSelectedTplId] = useState('');
  const [tplApplied, setTplApplied] = useState(false);

  function applyTemplate() {
    const tpl = templates.find(t => t.id === selectedTplId);
    if (!tpl) return;
    const { id: _id, name: _name, ...fields } = tpl;
    setForm(p => ({
      ...p,
      ...fields,
      objectTypePrefixes: {
        ...(p.objectTypePrefixes ?? {}),
        ...(fields.objectTypePrefixes ?? {}),
      },
    }));
    setSelectedTplId('');
    setTplApplied(true);
    setTimeout(() => setTplApplied(false), 3000);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-0">
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <FileCode2 size={16} className="text-amber-600" />{t('abap.tab_title')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('abap.tab_subtitle')}</p>
            {level !== 'client' && (
              <p className="text-xs text-blue-500 mt-1">{t('abap.inherited_hint')}</p>
            )}
          </div>
          {canEdit && templates.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                <option value="">{t('abap.select_template')}</option>
                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </select>
              <button onClick={applyTemplate} disabled={!selectedTplId}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors">
                {t('abap.apply_template')}
              </button>
            </div>
          )}
        </div>
        {tplApplied && (
          <p className="text-xs text-amber-700 font-medium mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} />{t('abap.template_applied')}
          </p>
        )}
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_naming')}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('abap.global_prefix')}</label>
            <input value={form.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={10} placeholder="Z" />
          </div>
          <div>
            <label className={labelCls}>{t('abap.namespace_prefix')}</label>
            <input value={form.namespacePrefix} onChange={e => f('namespacePrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={20} placeholder="MYNAMESPACE" />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('abap.object_type_prefixes')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OBJECT_TYPES_FOR_PREFIX.map(ot => (
              <div key={ot}>
                <label className="block text-[10px] text-gray-500 mb-0.5 capitalize">{ot.replace('_', ' ')}</label>
                <input value={(form.objectTypePrefixes ?? {})[ot] ?? ''} onChange={e => fPfx(ot, e.target.value)}
                  disabled={!canEdit} className={inputCls} maxLength={10} placeholder="—" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={!canEdit} onClick={() => f('localVarNaming', !form.localVarNaming)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${form.localVarNaming ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.localVarNaming}>
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${form.localVarNaming ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700">{t('abap.local_var_naming')}</span>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_header')}</h4>
        <div>
          <label className={labelCls}>{t('abap.author_id')}</label>
          <input value={form.authorId} onChange={e => f('authorId', e.target.value)} disabled={!canEdit}
            className={inputCls} maxLength={40} placeholder="JSMITH" />
        </div>
        <div>
          <label className={labelCls}>{t('abap.header_template')} <span className="text-gray-400 font-normal">({`{object_name} {author} {date} {transport} {description}`})</span></label>
          <textarea value={form.headerTemplate} onChange={e => f('headerTemplate', e.target.value)}
            disabled={!canEdit} rows={7}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white font-mono resize-y" />
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_changelog')}</h4>
        <div>
          <label className={labelCls}>{t('abap.changelog_template')} <span className="text-gray-400 font-normal">({`{date} {author} {transport} {change_description}`})</span></label>
          <input value={form.changeLogTemplate} onChange={e => f('changeLogTemplate', e.target.value)}
            disabled={!canEdit} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('abap.changelog_location')}</label>
          <select value={form.changeLogLocation} onChange={e => f('changeLogLocation', e.target.value)}
            disabled={!canEdit}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
            <option value="top">{t('abap.changelog_top')}</option>
            <option value="bottom">{t('abap.changelog_bottom')}</option>
          </select>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_modifications')}</h4>
        <div>
          <label className={labelCls}>{t('abap.old_code_handling')}</label>
          <select value={form.oldCodeHandling} onChange={e => f('oldCodeHandling', e.target.value)}
            disabled={!canEdit}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
            <option value="comment_block">{t('abap.old_code_comment')}</option>
            <option value="delete">{t('abap.old_code_delete')}</option>
            <option value="keep">{t('abap.old_code_keep')}</option>
          </select>
        </div>
        {form.oldCodeHandling === 'comment_block' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('abap.old_code_begin')}</label>
              <input value={form.oldCodeBeginMarker} onChange={e => f('oldCodeBeginMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('abap.old_code_end')}</label>
              <input value={form.oldCodeEndMarker} onChange={e => f('oldCodeEndMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button disabled={!canEdit} onClick={() => f('markNewCode', !form.markNewCode)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${form.markNewCode ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.markNewCode}>
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${form.markNewCode ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700">{t('abap.mark_new_code')}</span>
        </div>
        {form.markNewCode && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('abap.new_code_begin')}</label>
              <input value={form.newCodeBeginMarker} onChange={e => f('newCodeBeginMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('abap.new_code_end')}</label>
              <input value={form.newCodeEndMarker} onChange={e => f('newCodeEndMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_style')}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('abap.abap_version')}</label>
            <select value={form.abapVersion} onChange={e => f('abapVersion', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="modern">{t('abap.version_modern')}</option>
              <option value="classic">{t('abap.version_classic')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('abap.error_handling')}</label>
            <select value={form.errorHandling} onChange={e => f('errorHandling', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="subrc">{t('abap.error_subrc')}</option>
              <option value="exceptions">{t('abap.error_exceptions')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('abap.select_style')}</label>
            <select value={form.selectStyle} onChange={e => f('selectStyle', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="into_table">{t('abap.select_into_table')}</option>
              <option value="for_all_entries">{t('abap.select_fae')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_ai')}</h4>
        <div>
          <label className={labelCls}>{t('abap.ai_instructions')}</label>
          <textarea value={form.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)}
            disabled={!canEdit} rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white resize-y"
            placeholder={t('abap.ai_instructions_ph')} />
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? '…' : t('abap.save')}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />{t('abap.saved')}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ABAP TEMPLATES (platform-level CRUD)
// ============================================================
function AbapTemplatesSection({ auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  const canEdit = auth.isAdmin || auth.isManager;

  const templates = settings['abap_standards_templates'] ?? [];
  const [editingId, setEditingId] = useState(null); // null=list, 'new'=new form, uuid=edit form
  const [editName, setEditName] = useState('');
  const [editForm, setEditForm] = useState({ ...ABAP_STANDARDS_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function startNew() {
    setEditingId('new');
    setEditName('');
    setEditForm({ ...ABAP_STANDARDS_DEFAULTS });
  }

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditForm({ ...ABAP_STANDARDS_DEFAULTS, ...tpl });
  }

  function cancelEdit() { setEditingId(null); setSaved(false); }

  function f(key, value) { setEditForm(p => ({ ...p, [key]: value })); }
  function fPfx(objType, value) {
    setEditForm(p => ({ ...p, objectTypePrefixes: { ...(p.objectTypePrefixes ?? {}), [objType]: value } }));
  }

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    let updated;
    if (editingId === 'new') {
      const newTpl = { id: crypto.randomUUID(), name: editName.trim(), ...editForm };
      updated = [...templates, newTpl];
    } else {
      updated = templates.map(t => t.id === editingId ? { ...t, name: editName.trim(), ...editForm } : t);
    }
    await ssCtx.setSetting('abap_standards_templates', updated);
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); setEditingId(null); }, 1200);
  }

  async function handleDelete(id) {
    if (!window.confirm(t('abap_tpl.confirm_delete'))) return;
    await ssCtx.setSetting('abap_standards_templates', templates.filter(t => t.id !== id));
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";
  const sectionCls = "space-y-4 pt-4 border-t border-gray-100";
  const OBJECT_TYPES_FOR_PREFIX = ['program','class','interface','function_module','table','enhancement','badi','other'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <FileCode2 size={16} className="text-amber-600" />{t('abap_tpl.title')}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('abap_tpl.subtitle')}</p>
        </div>
        {canEdit && editingId === null && (
          <button onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus size={14} />{t('abap_tpl.new')}
          </button>
        )}
      </div>

      {/* Template list */}
      {editingId === null && (
        templates.length === 0
          ? <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center text-sm text-gray-400">{t('abap_tpl.no_templates')}</div>
          : <div className="space-y-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
                  <FileCode2 size={16} className="text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{tpl.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Prefix: {tpl.globalPrefix || 'Z'} · {tpl.abapVersion === 'modern' ? 'Modern ABAP' : 'Classic ABAP'} · {tpl.errorHandling === 'exceptions' ? 'cx_* exceptions' : 'sy-subrc'}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(tpl)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        {t('abap_tpl.edit')}
                      </button>
                      <button onClick={() => handleDelete(tpl.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        {t('abap_tpl.delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
      )}

      {/* Edit / New form */}
      {editingId !== null && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm space-y-0">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('abap_tpl.name')}</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              placeholder={t('abap_tpl.name_ph')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-semibold" />
          </div>

          {/* ── Naming ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_naming')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>{t('abap.global_prefix')}</label>
                <input value={editForm.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} className={inputCls} maxLength={10} placeholder="Z" /></div>
              <div><label className={labelCls}>{t('abap.namespace_prefix')}</label>
                <input value={editForm.namespacePrefix} onChange={e => f('namespacePrefix', e.target.value)} className={inputCls} maxLength={20} /></div>
            </div>
            <div>
              <label className={labelCls}>{t('abap.object_type_prefixes')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {OBJECT_TYPES_FOR_PREFIX.map(ot => (
                  <div key={ot}>
                    <label className="block text-[10px] text-gray-500 mb-0.5 capitalize">{ot.replace('_',' ')}</label>
                    <input value={(editForm.objectTypePrefixes ?? {})[ot] ?? ''} onChange={e => fPfx(ot, e.target.value)} className={inputCls} maxLength={10} placeholder="—" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => f('localVarNaming', !editForm.localVarNaming)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${editForm.localVarNaming ? 'bg-blue-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={editForm.localVarNaming}>
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.localVarNaming ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{t('abap.local_var_naming')}</span>
            </div>
          </div>

          {/* ── Header ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_header')}</h4>
            <div><label className={labelCls}>{t('abap.author_id')}</label>
              <input value={editForm.authorId} onChange={e => f('authorId', e.target.value)} className={inputCls} maxLength={40} placeholder="JSMITH" /></div>
            <div>
              <label className={labelCls}>{t('abap.header_template')}</label>
              <textarea value={editForm.headerTemplate} onChange={e => f('headerTemplate', e.target.value)} rows={7}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono resize-y" />
            </div>
          </div>

          {/* ── Change Log ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_changelog')}</h4>
            <div><label className={labelCls}>{t('abap.changelog_template')}</label>
              <input value={editForm.changeLogTemplate} onChange={e => f('changeLogTemplate', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('abap.changelog_location')}</label>
              <select value={editForm.changeLogLocation} onChange={e => f('changeLogLocation', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="top">{t('abap.changelog_top')}</option>
                <option value="bottom">{t('abap.changelog_bottom')}</option>
              </select>
            </div>
          </div>

          {/* ── Modification rules ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_modifications')}</h4>
            <div><label className={labelCls}>{t('abap.old_code_handling')}</label>
              <select value={editForm.oldCodeHandling} onChange={e => f('oldCodeHandling', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="comment_block">{t('abap.old_code_comment')}</option>
                <option value="delete">{t('abap.old_code_delete')}</option>
                <option value="keep">{t('abap.old_code_keep')}</option>
              </select>
            </div>
            {editForm.oldCodeHandling === 'comment_block' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>{t('abap.old_code_begin')}</label>
                  <input value={editForm.oldCodeBeginMarker} onChange={e => f('oldCodeBeginMarker', e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>{t('abap.old_code_end')}</label>
                  <input value={editForm.oldCodeEndMarker} onChange={e => f('oldCodeEndMarker', e.target.value)} className={inputCls} /></div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => f('markNewCode', !editForm.markNewCode)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${editForm.markNewCode ? 'bg-blue-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={editForm.markNewCode}>
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.markNewCode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{t('abap.mark_new_code')}</span>
            </div>
            {editForm.markNewCode && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>{t('abap.new_code_begin')}</label>
                  <input value={editForm.newCodeBeginMarker} onChange={e => f('newCodeBeginMarker', e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>{t('abap.new_code_end')}</label>
                  <input value={editForm.newCodeEndMarker} onChange={e => f('newCodeEndMarker', e.target.value)} className={inputCls} /></div>
              </div>
            )}
          </div>

          {/* ── Style ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_style')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className={labelCls}>{t('abap.abap_version')}</label>
                <select value={editForm.abapVersion} onChange={e => f('abapVersion', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="modern">{t('abap.version_modern')}</option>
                  <option value="classic">{t('abap.version_classic')}</option>
                </select>
              </div>
              <div><label className={labelCls}>{t('abap.error_handling')}</label>
                <select value={editForm.errorHandling} onChange={e => f('errorHandling', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="subrc">{t('abap.error_subrc')}</option>
                  <option value="exceptions">{t('abap.error_exceptions')}</option>
                </select>
              </div>
              <div><label className={labelCls}>{t('abap.select_style')}</label>
                <select value={editForm.selectStyle} onChange={e => f('selectStyle', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="into_table">{t('abap.select_into_table')}</option>
                  <option value="for_all_entries">{t('abap.select_fae')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── AI Instructions ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_ai')}</h4>
            <div><label className={labelCls}>{t('abap.ai_instructions')}</label>
              <textarea value={editForm.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-y"
                placeholder={t('abap.ai_instructions_ph')} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving || !editName.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? '…' : t('abap_tpl.save')}
            </button>
            {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />Saved</span>}
            <button onClick={cancelEdit}
              className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 rounded-xl transition-colors ml-auto">
              {t('abap_tpl.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SAP BLUEPRINT CANVAS — constants, helpers, components
// ============================================================

const BP_PHASES = [
  { id: 'dictionary',  label: 'Data Dictionary', desc: 'Tables, structures, domains', headerCls: 'bg-violet-50 dark:bg-violet-900/30 border-b-2 border-violet-200 dark:border-violet-800', bodyCls: 'bg-violet-50/40 dark:bg-violet-900/20', textCls: 'text-violet-700 dark:text-violet-300' },
  { id: 'development', label: 'Development',     desc: 'Programs, classes, FMs',      headerCls: 'bg-blue-50 dark:bg-blue-900/30 border-b-2 border-blue-200 dark:border-blue-800',       bodyCls: 'bg-blue-50/40 dark:bg-blue-900/20',     textCls: 'text-blue-700 dark:text-blue-300'     },
  { id: 'integration', label: 'Integration',     desc: 'RFCs, BAPIs, OData',         headerCls: 'bg-cyan-50 dark:bg-cyan-900/30 border-b-2 border-cyan-200 dark:border-cyan-800',       bodyCls: 'bg-cyan-50/40 dark:bg-cyan-900/20',     textCls: 'text-cyan-700 dark:text-cyan-300'     },
  { id: 'enhancement', label: 'Enhancement',     desc: 'BAdIs, user exits',           headerCls: 'bg-amber-50 dark:bg-amber-900/30 border-b-2 border-amber-200 dark:border-amber-800',  bodyCls: 'bg-amber-50/40 dark:bg-amber-900/20',   textCls: 'text-amber-700 dark:text-amber-300'   },
  { id: 'ui',          label: 'UI / Output',     desc: 'Reports, forms, Fiori',       headerCls: 'bg-pink-50 dark:bg-pink-900/30 border-b-2 border-pink-200 dark:border-pink-800',     bodyCls: 'bg-pink-50/40 dark:bg-pink-900/20',     textCls: 'text-pink-700 dark:text-pink-300'     },
];

const BP_TYPES = {
  table:          { label: 'Table',          short: 'TABL', ai: false, phase: 'dictionary'  },
  structure:      { label: 'Structure',      short: 'STRU', ai: false, phase: 'dictionary'  },
  domain:         { label: 'Domain',         short: 'DOMA', ai: false, phase: 'dictionary'  },
  data_element:   { label: 'Data Element',   short: 'DTEL', ai: false, phase: 'dictionary'  },
  message_class:  { label: 'Message Class',  short: 'MSG',  ai: false, phase: 'dictionary'  },
  program:        { label: 'Program',        short: 'PROG', ai: true,  phase: 'development' },
  include:        { label: 'Include',        short: 'INCL', ai: true,  phase: 'development' },
  class:          { label: 'Class',          short: 'CLAS', ai: true,  phase: 'development' },
  function_module:{ label: 'Function Module',short: 'FM',   ai: true,  phase: 'development' },
  bapi:           { label: 'BAPI / RFC',     short: 'RFC',  ai: true,  phase: 'integration' },
  odata:          { label: 'OData Service',  short: 'ODATA',ai: false, phase: 'integration' },
  badi:           { label: 'BAdI Impl',      short: 'BADI', ai: true,  phase: 'enhancement' },
  enhancement:    { label: 'Enhancement',    short: 'ENHO', ai: true,  phase: 'enhancement' },
  report:         { label: 'Report (ALV)',   short: 'RPT',  ai: true,  phase: 'ui'          },
  smartform:      { label: 'SmartForm',      short: 'SF',   ai: false, phase: 'ui'          },
};

const BP_STATUS_STYLE = {
  planned:    'border-gray-300 bg-white text-gray-700',
  generating: 'border-blue-400 bg-blue-50 text-blue-700',
  generated:  'border-teal-400 bg-teal-50 text-teal-700',
  applying:   'border-amber-400 bg-amber-50 text-amber-700',
  done:       'border-green-500 bg-green-50 text-green-700',
  error:      'border-red-500 bg-red-50 text-red-700',
  blocked:    'border-gray-200 bg-gray-50 text-gray-400',
  manual:     'border-orange-300 bg-orange-50 text-orange-700',
  skipped:    'border-yellow-300 bg-yellow-50 text-yellow-700',
};

function topoSort(objects) {
  const map = Object.fromEntries(objects.map(o => [o.id, o]));
  const visited = new Set();
  const result = [];
  function visit(obj) {
    if (visited.has(obj.id)) return;
    visited.add(obj.id);
    (obj.dependsOn ?? []).forEach(depId => { if (map[depId]) visit(map[depId]); });
    result.push(obj);
  }
  objects.forEach(visit);
  return result;
}

function AddEditBlueprintObjectModal({ existing, allObjects, onSave, onClose }) {
  const isEdit = !!existing;
  const blank = { name: '', type: 'program', phase: 'development', description: '', aiCapable: true, dependsOn: [], order: allObjects.length + 1, transport: '', };
  const [form, setForm] = useState(existing ? { ...existing } : blank);

  function f(field, val) {
    setForm(p => {
      const next = { ...p, [field]: val };
      if (field === 'type' && BP_TYPES[val]) {
        next.phase = BP_TYPES[val].phase;
        next.aiCapable = BP_TYPES[val].ai;
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{isEdit ? 'Edit Object' : 'Add Blueprint Object'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input value={form.name} onChange={e => f('name', e.target.value.toUpperCase())}
                placeholder="ZPROG_ORDER"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => f('type', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {Object.entries(BP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phase</label>
              <select value={form.phase} onChange={e => f('phase', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {BP_PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
              <input type="number" min={1} value={form.order} onChange={e => f('order', parseInt(e.target.value) || 1)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transport Request</label>
            <input value={form.transport ?? ''} onChange={e => f('transport', e.target.value.toUpperCase())}
              placeholder="DEVK900123"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bp-ai" checked={form.aiCapable} onChange={e => f('aiCapable', e.target.checked)}
              className="rounded" />
            <label htmlFor="bp-ai" className="text-sm text-gray-700">AI can generate ABAP code</label>
          </div>
          {allObjects.filter(o => o.id !== existing?.id).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Depends On</label>
              <div className="border border-gray-200 rounded-xl p-2 max-h-32 overflow-y-auto space-y-1">
                {allObjects.filter(o => o.id !== existing?.id).map(o => (
                  <label key={o.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input type="checkbox"
                      checked={(form.dependsOn ?? []).includes(o.id)}
                      onChange={e => f('dependsOn', e.target.checked
                        ? [...(form.dependsOn ?? []), o.id]
                        : (form.dependsOn ?? []).filter(id => id !== o.id))} />
                    <span className="font-mono text-blue-700">{o.name}</span>
                    <span className="text-gray-400">{BP_TYPES[o.type]?.short ?? o.type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-gray-100">
          <button onClick={() => form.name.trim() && onSave(form)}
            disabled={!form.name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {isEdit ? 'Save Changes' : 'Add Object'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl transition-colors ml-auto">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SapBlueprintCanvas({ caseData, auth, activities, sapConfig, autoImplEnabled, genModel, transportReq, ssCtx }) {
  const { settings } = ssCtx;
  const caseId = caseData.id;
  const bpKey = 'sap_blueprint';

  const saved = (settings[bpKey] ?? {})[caseId] ?? {};
  const [objects, setObjects] = useState(saved.objects ?? []);
  const [stopOnError, setStopOnError] = useState(saved.stopOnError ?? true);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [transportView, setTransportView] = useState(false);
  const [arrows, setArrows] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef(null);
  const cardRefs = useRef({});
  const stopRef = useRef(false);

  // Role-based access
  const userRole = auth?.profile?.role ?? auth?.role ?? '';
  const isReadOnly = ['client', 'invited_client'].includes(userRole);
  const isFunctional = ['key_user', 'project_manager', 'internal_consultant'].includes(userRole);
  const canDevelop = !isReadOnly && !isFunctional; // consultant, admin, manager

  // Blueprint templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [bpTemplates, setBpTemplates] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Reviewer
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [reviewerInput, setReviewerInput] = useState('');
  const [reviewerSaving, setReviewerSaving] = useState(false);
  const [parentConsultant, setParentConsultant] = useState(null);
  const [approvalLinkCopied, setApprovalLinkCopied] = useState(false);
  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [syncingReviews, setSyncingReviews] = useState(false);
  const [syncedCount, setSyncedCount] = useState(null);

  // Load reviewer info on mount
  useEffect(() => {
    async function loadReviewer() {
      const { data: c } = await supabase
        .from('cases')
        .select('reviewer_email, reviewer_user_id, parent_case_id')
        .eq('id', caseId)
        .single();
      if (!c) return;
      if (c.reviewer_email) setReviewerEmail(c.reviewer_email);
      if (c.parent_case_id) {
        const { data: parent } = await supabase
          .from('cases')
          .select('case_assignments(users(full_name, email))')
          .eq('id', c.parent_case_id)
          .single();
        const consultant = parent?.case_assignments?.[0]?.users;
        if (consultant) setParentConsultant(consultant);
      }
    }
    loadReviewer();
  }, [caseId]);

  async function saveReviewer() {
    const email = reviewerInput.trim();
    if (!email) return;
    setReviewerSaving(true);
    await supabase.from('cases').update({ reviewer_email: email }).eq('id', caseId);
    setReviewerEmail(email);
    setReviewerInput('');
    setReviewerSaving(false);
  }

  async function generateApprovalLink() {
    const email = parentConsultant?.email ?? reviewerEmail;
    if (!email) return;
    setGenLinkLoading(true);
    try {
      // Find or create pending request for this case
      let { data: existing } = await supabase
        .from('approval_requests')
        .select('id, token')
        .eq('case_id', caseId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!existing) {
        const { data: created } = await supabase
          .from('approval_requests')
          .insert({ reviewer_email: email, case_id: caseId, project_id: caseData.project_id ?? null })
          .select('id, token')
          .single();
        existing = created;
      }

      if (!existing) { setGenLinkLoading(false); return; }

      // Sync all pending_review objects into approval_request_objects
      const pendingObjs = objects.filter(o => o.approval_status === 'pending_review');
      if (pendingObjs.length > 0) {
        await supabase.from('approval_request_objects').upsert(
          pendingObjs.map(o => ({
            approval_request_id: existing.id,
            object_id:          o.id,
            object_name:        o.name,
            object_type:        o.type,
            object_description: o.description ?? null,
            object_phase:       o.phase ?? null,
          })),
          { onConflict: 'approval_request_id,object_id', ignoreDuplicates: false }
        );
      }

      const link = `${window.location.origin}/approve/${existing.token}`;
      await navigator.clipboard.writeText(link);
      setApprovalLinkCopied(true);
      setTimeout(() => setApprovalLinkCopied(false), 2500);
    } finally {
      setGenLinkLoading(false);
    }
  }

  async function syncReviews() {
    setSyncingReviews(true);
    setSyncedCount(null);
    const { data: req } = await supabase
      .from('approval_requests')
      .select('id')
      .eq('case_id', caseId)
      .eq('status', 'pending')
      .maybeSingle();
    if (!req) { setSyncingReviews(false); return; }

    const { data: decisions } = await supabase
      .from('approval_request_objects')
      .select('object_id, decision, rejection_reason, decided_at')
      .eq('approval_request_id', req.id)
      .not('decision', 'is', null);

    if (!decisions?.length) { setSyncingReviews(false); setSyncedCount(0); return; }

    let count = 0;
    const next = objects.map(o => {
      const d = decisions.find(d => d.object_id === o.id);
      if (!d) return o;
      count++;
      return { ...o, approval_status: d.decision, approved_by: 'reviewer', approved_at: d.decided_at, rejected_reason: d.rejection_reason ?? o.rejected_reason };
    });
    setObjects(next);
    saveBlueprint(next);
    setSyncedCount(count);
    setSyncingReviews(false);
  }

  async function loadBpTemplates() {
    const { data } = await supabase
      .from('case_templates')
      .select('id, name, description, template_data, created_at')
      .eq('category', 'blueprint')
      .order('created_at', { ascending: false });
    setBpTemplates(data ?? []);
  }

  async function saveAsTemplate() {
    if (!templateName.trim() || objects.length === 0) return;
    setSavingTemplate(true);
    await supabase.from('case_templates').insert({
      name: templateName.trim(),
      category: 'blueprint',
      description: `${objects.length} objects`,
      template_data: { objects: objects.map(o => ({ ...o, status: 'planned', generatedCode: null, appliedAt: null, error: null, approval_status: 'draft', approved_by: null, approved_at: null })) },
      is_global: false,
      created_by: auth?.user?.id ?? null,
    });
    setSavingTemplate(false);
    setTemplateName('');
    setShowSaveTemplate(false);
  }

  async function applyTemplate(tpl) {
    const tplObjects = (tpl.template_data?.objects ?? []).map(o => ({ ...o, id: crypto.randomUUID(), status: 'planned', generatedCode: null, appliedAt: null, error: null, approval_status: 'draft' }));
    const next = [...objects, ...tplObjects];
    setObjects(next);
    await saveBlueprint(next);
    setShowTemplates(false);
  }

  async function saveBlueprint(newObjects, newStopOnError) {
    const all = settings[bpKey] ?? {};
    await ssCtx.setSetting(bpKey, { ...all, [caseId]: { objects: newObjects, stopOnError: newStopOnError ?? stopOnError } });
  }

  function updateObj(id, updates) {
    setObjects(prev => {
      const next = prev.map(o => o.id === id ? { ...o, ...updates } : o);
      saveBlueprint(next);
      return next;
    });
  }

  function submitForReview(id) {
    updateObj(id, { approval_status: 'pending_review' });
  }

  function approveObj(id) {
    updateObj(id, { approval_status: 'approved', approved_by: auth?.user?.id, approved_at: new Date().toISOString() });
  }

  function rejectObj(id, reason = '') {
    updateObj(id, { approval_status: 'rejected', rejected_reason: reason, approved_by: auth?.user?.id, approved_at: new Date().toISOString() });
  }

  function addLog(msg, status) {
    setRunLog(p => [...p, { msg, status, ts: new Date().toLocaleTimeString() }]);
  }

  // Compute SVG arrows
  useEffect(() => {
    if (!containerRef.current) return;
    const cont = containerRef.current;
    const contRect = cont.getBoundingClientRect();
    const scrollLeft = cont.scrollLeft;
    const newArrows = [];
    for (const obj of objects) {
      if (!obj.dependsOn?.length) continue;
      const toEl = cardRefs.current[obj.id];
      if (!toEl) continue;
      const toRect = toEl.getBoundingClientRect();
      for (const depId of obj.dependsOn) {
        const fromEl = cardRefs.current[depId];
        if (!fromEl) continue;
        const fromRect = fromEl.getBoundingClientRect();
        const x1 = fromRect.right - contRect.left + scrollLeft;
        const y1 = fromRect.top + fromRect.height / 2 - contRect.top;
        const x2 = toRect.left - contRect.left + scrollLeft;
        const y2 = toRect.top + toRect.height / 2 - contRect.top;
        const mx = (x1 + x2) / 2;
        newArrows.push({ id: `${depId}-${obj.id}`, x1, y1, x2, y2, mx });
      }
    }
    setArrows(newArrows);
  });

  async function handleAiSuggest() {
    const prevAiObjs = objects.filter(o => o.aiSuggested);
    const legacyObjs = objects.filter(o => !o.aiSuggested); // added before flag existed
    if (objects.length > 0) {
      const edited = objects.filter(o => o.status !== 'planned' || o.generatedCode);
      let msg;
      if (prevAiObjs.length > 0) {
        msg = edited.length > 0
          ? `Replace ${prevAiObjs.length} AI-suggested objects (${edited.length} modified)? Manually added objects will be kept.`
          : `Replace ${prevAiObjs.length} AI-suggested objects with a new set? Manually added objects will be kept.`;
      } else {
        msg = edited.length > 0
          ? `The blueprint has ${legacyObjs.length} existing objects (${edited.length} modified). Regenerate will replace all of them. Continue?`
          : `The blueprint has ${legacyObjs.length} existing objects. Regenerate will replace all of them. Continue?`;
      }
      if (!window.confirm(msg)) return;
    }

    const prompt = `You are an SAP architect. Analyze this implementation case and suggest the SAP development objects needed.

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? 'general'}
Activities: ${activities.slice(0, 10).map(a => a.title).join(', ')}

Return ONLY a valid JSON array (no markdown, no explanation) of objects. Each object must have:
- name: string (SAP object name, e.g. ZPROG_ORDER)
- type: one of [${Object.keys(BP_TYPES).join(', ')}]
- phase: one of [dictionary, development, integration, enhancement, ui]
- description: string (one sentence)
- aiCapable: boolean
- dependsOn: array of names of other objects in this list that this depends on (use names, not ids)

Suggest 5-12 objects that cover the full implementation scope.`;

    try {
      const resp = await callClaude({
        model: genModel,
        system: 'You are an expert SAP architect. Return only valid JSON arrays, no markdown.',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 2000,
      });
      const raw = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      const parsed = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim());
      const nameToId = {};
      const newObjs = parsed.map((item, i) => {
        const id = crypto.randomUUID();
        nameToId[item.name] = id;
        return {
          id,
          name: item.name,
          type: BP_TYPES[item.type] ? item.type : 'program',
          phase: item.phase ?? BP_TYPES[item.type]?.phase ?? 'development',
          description: item.description ?? '',
          aiCapable: item.aiCapable ?? (BP_TYPES[item.type]?.ai ?? true),
          dependsOn: [],
          order: i + 1,
          status: 'planned',
          error: null,
          transport: transportReq ?? '',
          generatedCode: null,
          appliedAt: null,
          aiSuggested: true,
        };
      });
      // Resolve name-based dependsOn to ids
      parsed.forEach((item, i) => {
        if (item.dependsOn?.length) {
          newObjs[i].dependsOn = item.dependsOn.map(n => nameToId[n]).filter(Boolean);
        }
      });
      // Keep manually added objects; for legacy canvases with no flags, replace all
      const kept = prevAiObjs.length > 0 ? objects.filter(o => !o.aiSuggested) : [];
      const next = [...newObjs, ...kept];
      setObjects(next);
      await saveBlueprint(next);
    } catch (e) {
      alert('AI suggest failed: ' + e.message);
    }
  }

  async function handleRun(subset) {
    if (running) { stopRef.current = true; return; }
    stopRef.current = false;
    setRunning(true);
    setRunLog([]);
    const sorted = topoSort(subset);
    const standards = resolveAbapStandards(settings, caseData.client_id, caseData.project_id, caseData.id);

    for (const obj of sorted) {
      if (stopRef.current) { addLog('Stopped by user.', 'skipped'); break; }
      if (obj.status === 'done') { addLog(`${obj.name}: already done, skipping.`, 'skipped'); continue; }

      // Check deps
      const depsDone = (obj.dependsOn ?? []).every(depId => {
        const dep = objects.find(o => o.id === depId);
        return dep && (dep.status === 'done' || dep.status === 'manual' || dep.status === 'skipped');
      });
      if (!depsDone) {
        updateObj(obj.id, { status: 'blocked' });
        addLog(`${obj.name}: blocked (dependencies not done).`, 'blocked');
        continue;
      }

      if (!obj.aiCapable) {
        updateObj(obj.id, { status: 'manual' });
        addLog(`${obj.name}: manual (not AI-capable).`, 'manual');
        continue;
      }

      try {
        updateObj(obj.id, { status: 'generating', error: null });
        addLog(`${obj.name}: generating ABAP...`, 'generating');
        const standardsBlock = buildAbapStandardsPrompt(standards, obj.type, obj.name, null, caseData, transportReq, false);
        const prompt = `You are an SAP ABAP developer. Create ${obj.type} ${obj.name}.
Description: ${obj.description}
Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? 'general'}

${standardsBlock}

Output ONLY the ABAP source code, no explanations.`;
        const resp = await callClaude({
          model: genModel,
          system: 'You are an expert SAP ABAP developer. Output only clean ABAP source code.',
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          max_tokens: 3000,
          mcp_servers: buildSapMcpConfig(sapConfig, ssCtx.settings['sap_mcp_server_url']),
        });
        const code = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
        updateObj(obj.id, { status: 'generated', generatedCode: code });
        addLog(`${obj.name}: code generated.`, 'generated');

        if (autoImplEnabled && sapConfig?.host) {
          updateObj(obj.id, { status: 'applying' });
          addLog(`${obj.name}: applying directly browser → ${sapConfig.host}`, 'applying');
          const result = await sapWriteSourceDetail(sapConfig, obj.type, obj.name, code, obj.transport || transportReq || undefined);
          if (result.ok) {
            updateObj(obj.id, { status: 'done', appliedAt: new Date().toISOString() });
            addLog(`${obj.name}: ✓ applied (HTTP ${result.status}).`, 'done');
          } else {
            const detail = result.status ? `HTTP ${result.status}` : result.error;
            throw new Error(
              result.phase === 'csrf' ? `CSRF fetch failed — ${result.error}`
              : result.status === 401 ? `HTTP 401 — wrong credentials`
              : result.status === 403 ? `HTTP 403 — insufficient ADT authorizations`
              : result.status === 404 ? `HTTP 404 — ${obj.name} not found in SAP`
              : detail
            );
          }
        } else {
          updateObj(obj.id, { status: 'generated' });
        }
      } catch (e) {
        updateObj(obj.id, { status: 'error', error: e.message });
        addLog(`${obj.name}: ERROR — ${e.message}`, 'error');
        if (stopOnError) { addLog('Stopped on error.', 'error'); break; }
      }
    }
    setRunning(false);
  }

  function confirmAndRun(subset) {
    if (autoImplEnabled && sapConfig?.host) {
      const names = subset.filter(o => o.aiCapable).map(o => o.name).join(', ');
      const msg = `Auto-implement is ON. This will write the following objects directly to SAP (${sapConfig.host}):\n\n${names || '(none AI-capable)'}\n\nContinue?`;
      if (!window.confirm(msg)) return;
    }
    handleRun(subset);
  }

  function handleRunAll() { confirmAndRun(objects); }
  function handleRunSelected() { confirmAndRun(objects.filter(o => checkedIds.has(o.id))); }

  function toggleCheck(id, e) {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCheckAll() {
    setCheckedIds(prev => prev.size === objects.length ? new Set() : new Set(objects.map(o => o.id)));
  }

  async function handleApplyOne(obj) {
    if (!sapConfig?.host || !autoImplEnabled) return;
    const code = obj.generatedCode;
    if (!code) return;
    if (!window.confirm(`Apply ${obj.name} directly to SAP (${sapConfig.host})?`)) return;
    updateObj(obj.id, { status: 'applying', error: null });
    const mcpUrl = ssCtx.settings['sap_mcp_server_url'];
    const proxyInUse = sapConfig.proxyUrl?.trim() || sapConfig._vpnProxyUrl?.trim();
    addLog(`${obj.name}: connecting directly browser → ${sapConfig.host}${proxyInUse ? ` via proxy ${proxyInUse}` : ''}`, 'applying');
    if (mcpUrl) addLog(`MCP server (AI generation): ${mcpUrl}`, 'generated');
    const result = await sapWriteSourceDetail(sapConfig, obj.type, obj.name, code, obj.transport || transportReq || undefined);
    if (result.ok) {
      updateObj(obj.id, { status: 'done', appliedAt: new Date().toISOString(), error: null });
      addLog(`${obj.name}: ✓ applied successfully (HTTP ${result.status}).`, 'done');
    } else {
      const detail = result.status ? `HTTP ${result.status}` : result.error;
      const hint = result.status === 401 ? 'HTTP 401 — wrong username or password'
        : result.status === 403 ? (result.error || 'HTTP 403 — missing ADT authorization or CSRF token rejected')
        : result.status === 404 ? `HTTP 404 — object ${obj.name} not found in SAP (create it first)`
        : result.error || detail;
      updateObj(obj.id, { status: 'generated', error: detail });
      addLog(`${obj.name}: ✗ ${hint}`, 'error');
    }
  }

  function handleAddObject(form) {
    const newObj = {
      id: crypto.randomUUID(),
      ...form,
      status: 'planned',
      error: null,
      generatedCode: null,
      appliedAt: null,
    };
    const next = [...objects, newObj];
    setObjects(next);
    saveBlueprint(next);
    setShowModal(false);
  }

  function handleEditObject(form) {
    const next = objects.map(o => o.id === editTarget.id ? { ...o, ...form } : o);
    setObjects(next);
    saveBlueprint(next);
    setEditTarget(null);
  }

  function handleDelete(id) {
    const next = objects.filter(o => o.id !== id);
    setObjects(next);
    saveBlueprint(next);
    if (selectedId === id) setSelectedId(null);
  }

  const selectedObj = objects.find(o => o.id === selectedId);

  // Transport view grouping
  const transportGroups = {};
  if (transportView) {
    for (const obj of objects) {
      const key = obj.transport || transportReq || '(unassigned)';
      if (!transportGroups[key]) transportGroups[key] = [];
      transportGroups[key].push(obj);
    }
  }

  const statusDotColor = {
    planned: 'bg-gray-300', generating: 'bg-blue-400 animate-pulse', generated: 'bg-teal-400',
    applying: 'bg-amber-400 animate-pulse', done: 'bg-green-500', error: 'bg-red-500',
    blocked: 'bg-gray-200', manual: 'bg-orange-300', skipped: 'bg-yellow-300',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Canvas header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid size={15} className="text-violet-600" />
          <span className="font-bold text-gray-900 text-sm">Implementation Blueprint</span>
          <span className="text-xs text-gray-400 hidden sm:inline">({objects.length} objects)</span>
          {isReadOnly && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-medium">Read-only</span>}
          {isFunctional && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">Reviewer</span>}
          <button onClick={() => setCollapsed(p => !p)}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1 px-1.5 py-0.5 border border-gray-200 rounded-lg">
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canDevelop && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={stopOnError} onChange={e => { setStopOnError(e.target.checked); saveBlueprint(objects, e.target.checked); }} />
              Stop on error
            </label>
          )}
          <button onClick={() => setTransportView(p => !p)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${transportView ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Transport view
          </button>
          {/* Template buttons */}
          <button onClick={() => { loadBpTemplates(); setShowTemplates(true); }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <FolderOpen size={11} />Templates
          </button>
          {canDevelop && objects.length > 0 && (
            <button onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              <Save size={11} />Save Template
            </button>
          )}
          {canDevelop && (
            <>
              <button onClick={handleAiSuggest}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
                <Sparkles size={11} />{objects.length > 0 ? 'AI Regenerate' : 'AI Suggest'}
              </button>
              <button onClick={() => { setEditTarget(null); setShowModal(true); }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                <Plus size={11} />Add Object
              </button>
              {objects.length > 0 && (
                <button onClick={toggleCheckAll}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  {checkedIds.size === objects.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              {checkedIds.size > 0 && !running && (
                <button onClick={handleRunSelected}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  <Play size={11} />Run Selected ({checkedIds.size})
                </button>
              )}
              <button onClick={() => { if (running) { stopRef.current = true; } else { handleRunAll(); } }}
                className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${running ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                {running ? <><X size={11} />Stop</> : <><Play size={11} />Run All</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reviewer row */}
      {canDevelop && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3 flex-wrap text-xs">
          <Mail size={12} className="text-indigo-400 flex-shrink-0" />
          <span className="font-medium text-gray-500 flex-shrink-0">Reviewer:</span>

          {/* Inherited from parent case */}
          {parentConsultant ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 font-medium">
              {parentConsultant.full_name} · {parentConsultant.email}
              <span className="text-[10px] text-indigo-400 font-normal ml-0.5">(inherited)</span>
            </span>
          ) : reviewerEmail ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-200 rounded-lg text-green-700 font-medium">
              {reviewerEmail}
            </span>
          ) : reviewerInput !== undefined ? (
            <div className="flex items-center gap-1.5">
              <input
                value={reviewerInput}
                onChange={e => setReviewerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveReviewer()}
                placeholder="reviewer@email.com"
                className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 w-48 focus:outline-none focus:border-indigo-400"
              />
              <button
                onClick={saveReviewer}
                disabled={reviewerSaving || !reviewerInput.trim()}
                className="px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors">
                {reviewerSaving ? '…' : 'Save'}
              </button>
            </div>
          ) : null}

          {/* Change reviewer */}
          {reviewerEmail && !parentConsultant && (
            <button
              onClick={() => { setReviewerEmail(''); setReviewerInput(''); }}
              className="text-gray-400 hover:text-gray-600 transition-colors text-[10px] underline">
              change
            </button>
          )}

          {/* Generate / copy link */}
          {(reviewerEmail || parentConsultant) && objects.some(o => o.approval_status === 'pending_review') && (
            <button
              onClick={generateApprovalLink}
              disabled={genLinkLoading}
              className={`ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                approvalLinkCopied
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}>
              {approvalLinkCopied ? <><Check size={11} />Copied!</> : <><Link2 size={11} />{genLinkLoading ? 'Generating…' : 'Copy Review Link'}</>}
            </button>
          )}

          {/* Sync reviews back from reviewer decisions */}
          {objects.some(o => o.approval_status === 'pending_review') && (
            <button
              onClick={syncReviews}
              disabled={syncingReviews}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40">
              <RefreshCw size={11} className={syncingReviews ? 'animate-spin' : ''} />
              {syncedCount !== null ? `Synced ${syncedCount}` : 'Sync Reviews'}
            </button>
          )}
        </div>
      )}

      {!collapsed && (
        <>
          {/* Canvas body */}
          {!transportView ? (
            <div className="relative overflow-x-auto" ref={containerRef} style={{ minHeight: 300 }}>
              {/* SVG arrows */}
              {arrows.length > 0 && (
                <svg className="absolute inset-0 pointer-events-none z-10"
                  style={{ width: '100%', height: '100%', minWidth: '100%', minHeight: '100%' }}>
                  <defs>
                    <marker id="bp-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {arrows.map(a => (
                    <path key={a.id}
                      d={`M ${a.x1},${a.y1} C ${a.mx},${a.y1} ${a.mx},${a.y2} ${a.x2},${a.y2}`}
                      fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3"
                      markerEnd="url(#bp-arrow)" />
                  ))}
                </svg>
              )}
              {/* Phase swim lanes */}
              <div className="flex gap-0 min-w-max">
                {BP_PHASES.map(phase => {
                  const phaseObjs = objects
                    .filter(o => o.phase === phase.id)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  return (
                    <div key={phase.id} className="flex flex-col border-r border-gray-100 dark:border-gray-700 last:border-0" style={{ minWidth: 220 }}>
                      {/* Lane header */}
                      <div className={`px-3 py-2 sticky top-0 z-20 ${phase.headerCls}`}>
                        <p className={`text-xs font-bold ${phase.textCls}`}>{phase.label}</p>
                        <p className={`text-[10px] opacity-70 ${phase.textCls}`}>{phase.desc}</p>
                      </div>
                      {/* Cards */}
                      <div className={`p-2 space-y-2 ${phase.bodyCls}`}>
                        {phaseObjs.map(obj => {
                          const typeMeta = BP_TYPES[obj.type] ?? { short: obj.type.slice(0, 4).toUpperCase(), ai: false };
                          const isSelected = selectedId === obj.id;
                          return (
                            <div
                              key={obj.id}
                              ref={el => { if (el) cardRefs.current[obj.id] = el; else delete cardRefs.current[obj.id]; }}
                              onClick={() => setSelectedId(isSelected ? null : obj.id)}
                              className={`w-52 rounded-xl border-2 p-2.5 cursor-pointer transition-all select-none ${BP_STATUS_STYLE[obj.status] ?? BP_STATUS_STYLE.planned} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : 'hover:shadow-md'} ${checkedIds.has(obj.id) ? 'outline outline-2 outline-blue-500 outline-offset-1' : ''}`}>
                              <div className="flex items-start gap-1.5">
                                {canDevelop && (
                                  <input type="checkbox" checked={checkedIds.has(obj.id)}
                                    onClick={e => toggleCheck(obj.id, e)}
                                    onChange={() => {}}
                                    className="mt-1 flex-shrink-0 cursor-pointer accent-blue-600" />
                                )}
                                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusDotColor[obj.status] ?? 'bg-gray-300'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-xs font-mono font-bold truncate">{obj.name}</span>
                                    {obj.order != null && <span className="text-[9px] text-gray-400">#{obj.order}</span>}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <span className="text-[9px] px-1 py-0 rounded font-semibold bg-white/60 border border-current">
                                      {typeMeta.short}
                                    </span>
                                    <span className="text-[9px]">{obj.aiCapable ? '🤖' : '🔧'}</span>
                                    <span className={`text-[9px] capitalize font-medium`}>{obj.status}</span>
                                  </div>
                                  {/* Approval status badge */}
                                  {obj.approval_status && obj.approval_status !== 'draft' && (
                                    <div className={`mt-1 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0 rounded ${
                                      obj.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                                      obj.approval_status === 'pending_review' ? 'bg-amber-100 text-amber-700' :
                                      obj.approval_status === 'rejected' ? 'bg-red-100 text-red-700' : ''
                                    }`}>
                                      {obj.approval_status === 'approved' && <Check size={7} />}
                                      {obj.approval_status === 'pending_review' && <Clock size={7} />}
                                      {obj.approval_status === 'rejected' && <X size={7} />}
                                      {obj.approval_status === 'approved' ? 'Approved' : obj.approval_status === 'pending_review' ? 'In Review' : 'Rejected'}
                                    </div>
                                  )}
                                  {obj.description && (
                                    <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 leading-snug">{obj.description}</p>
                                  )}
                                  {obj.error && (
                                    <p className="text-[9px] text-red-600 mt-1 flex items-center gap-0.5 line-clamp-1">
                                      <AlertTriangle size={8} />{obj.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {phaseObjs.length === 0 && (
                          <p className={`text-[10px] text-center py-4 opacity-40 ${phase.textCls}`}>No objects</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Transport view */
            <div className="p-4 space-y-3">
              {Object.entries(transportGroups).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No objects yet.</p>
              )}
              {Object.entries(transportGroups).map(([tr, objs]) => (
                <details key={tr} open className="border border-gray-200 rounded-xl overflow-hidden">
                  <summary className="px-4 py-2.5 bg-gray-50 font-mono text-sm font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between">
                    <span>{tr}</span>
                    <span className="text-xs font-normal text-gray-400">{objs.length} object{objs.length !== 1 ? 's' : ''}</span>
                  </summary>
                  <div className="p-3 flex flex-wrap gap-2">
                    {objs.map(obj => (
                      <div key={obj.id}
                        onClick={() => setSelectedId(selectedId === obj.id ? null : obj.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-xs font-mono cursor-pointer transition-all ${BP_STATUS_STYLE[obj.status] ?? BP_STATUS_STYLE.planned} ${selectedId === obj.id ? 'ring-2 ring-blue-400' : ''} ${checkedIds.has(obj.id) ? 'outline outline-2 outline-blue-500 outline-offset-1' : ''}`}>
                        <input type="checkbox" checked={checkedIds.has(obj.id)}
                          onClick={e => toggleCheck(obj.id, e)} onChange={() => {}}
                          className="cursor-pointer accent-blue-600 flex-shrink-0" />
                        {obj.name} <span className="opacity-50">{BP_TYPES[obj.type]?.short ?? ''}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Object detail panel */}
          {selectedObj && (
            <div className="border-t border-gray-100 p-4 bg-gray-50">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-mono font-bold text-gray-900">{selectedObj.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{BP_TYPES[selectedObj.type]?.label ?? selectedObj.type} · {selectedObj.phase} · {selectedObj.aiCapable ? '🤖 AI-capable' : '🔧 Manual'}</p>
                  {selectedObj.description && <p className="text-sm text-gray-600 mt-1">{selectedObj.description}</p>}
                  {selectedObj.error && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} />{selectedObj.error}
                    </p>
                  )}
                  {selectedObj.appliedAt && (
                    <p className="text-xs text-green-600 mt-1">Applied: {new Date(selectedObj.appliedAt).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <button onClick={() => { setEditTarget(selectedObj); setShowModal(true); }}
                    className="px-2.5 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-white transition-colors">Edit</button>
                  {selectedObj.status === 'error' && (
                    <button onClick={() => updateObj(selectedObj.id, { status: 'planned', error: null })}
                      className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">Retry</button>
                  )}
                  {autoImplEnabled && selectedObj.generatedCode && selectedObj.status !== 'done' && selectedObj.status !== 'applying' && (
                    <button onClick={() => handleApplyOne(selectedObj)}
                      className="px-2.5 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                      Apply to SAP
                    </button>
                  )}
                  {selectedObj.status === 'applying' && (
                    <span className="px-2.5 py-1 text-xs text-amber-700 font-medium">Applying…</span>
                  )}
                  {canDevelop && (
                    <button onClick={() => handleDelete(selectedObj.id)}
                      className="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">Delete</button>
                  )}
                </div>
              </div>

              {/* Approval gate row */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Review:</span>
                {(!selectedObj.approval_status || selectedObj.approval_status === 'draft') && canDevelop && (
                  <button onClick={() => submitForReview(selectedObj.id)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                    <Clock size={11} />Submit for Review
                  </button>
                )}
                {selectedObj.approval_status === 'pending_review' && isFunctional && (
                  <>
                    <button onClick={() => approveObj(selectedObj.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
                      <ThumbsUp size={11} />Approve
                    </button>
                    <button onClick={() => { const r = prompt('Rejection reason (optional):') ?? ''; rejectObj(selectedObj.id, r); }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                      <ThumbsDown size={11} />Reject
                    </button>
                  </>
                )}
                {selectedObj.approval_status === 'approved' && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Check size={12} />Approved</span>
                )}
                {selectedObj.approval_status === 'rejected' && (
                  <span className="flex items-center gap-1 text-xs text-red-600 font-medium"><X size={12} />Rejected{selectedObj.rejected_reason ? `: ${selectedObj.rejected_reason}` : ''}</span>
                )}
                {(!selectedObj.approval_status || selectedObj.approval_status === 'draft') && !canDevelop && (
                  <span className="text-xs text-gray-400">Not submitted yet</span>
                )}
                {selectedObj.approval_status === 'pending_review' && !isFunctional && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock size={11} />Waiting for review</span>
                )}
              </div>

              {selectedObj.generatedCode && (
                <details>
                  <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none mb-1">
                    Generated ABAP Code
                  </summary>
                  <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-3 overflow-x-auto max-h-56 leading-relaxed mt-1">
                    {selectedObj.generatedCode}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Run log */}
          {runLog.length > 0 && (
            <div className="border-t border-gray-100 p-3 max-h-36 overflow-y-auto bg-gray-950">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Run Log</p>
              <div className="space-y-0.5">
                {runLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className="text-gray-600 flex-shrink-0 font-mono">{entry.ts}</span>
                    <span className={`${entry.status === 'error' ? 'text-red-400' : entry.status === 'done' ? 'text-green-400' : entry.status === 'blocked' ? 'text-gray-500' : 'text-gray-300'}`}>
                      {entry.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Blueprint templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={15} className="text-blue-600" />Blueprint Templates</h3>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {bpTemplates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No templates saved yet.<br/>Save the current blueprint as a template to reuse it.</p>
              )}
              {bpTemplates.map(tpl => (
                <div key={tpl.id} className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tpl.name}</p>
                    {tpl.description && <p className="text-xs text-gray-400">{tpl.description}</p>}
                  </div>
                  {canDevelop && (
                    <button onClick={() => applyTemplate(tpl)}
                      className="px-3 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 flex-shrink-0">
                      Apply
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save as template modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Save size={14} />Save as Template</h3>
              <button onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Template name</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. S/4 Credit Management"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveAsTemplate()}
              />
              <p className="text-xs text-gray-400 mt-1">{objects.length} objects will be saved (status and code are reset)</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }}
                className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={saveAsTemplate} disabled={!templateName.trim() || savingTemplate}
                className="px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {savingTemplate ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <AddEditBlueprintObjectModal
          existing={editTarget}
          allObjects={objects}
          onSave={editTarget ? handleEditObject : handleAddObject}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}

// ============================================================
// SAP IMPLEMENTATION TAB
// ============================================================
const SAP_OBJECT_TYPES = [
  { value: 'program',         labelKey: 'sap.obj_type_program' },
  { value: 'class',           labelKey: 'sap.obj_type_class' },
  { value: 'function_module', labelKey: 'sap.obj_type_fm' },
  { value: 'table',           labelKey: 'sap.obj_type_table' },
  { value: 'enhancement',     labelKey: 'sap.obj_type_enhancement' },
  { value: 'badi',            labelKey: 'sap.obj_type_badi' },
  { value: 'config',          labelKey: 'sap.obj_type_config' },
  { value: 'other',           labelKey: 'sap.obj_type_other' },
];

const CONN_TYPE_LABELS = {
  postgresql: 'PostgreSQL', mysql: 'MySQL', mssql: 'MSSQL', oracle: 'Oracle',
  mongodb: 'MongoDB', sap_gui: 'SAP GUI', sap_hana: 'SAP HANA',
  sap_rfc: 'SAP RFC', sap_odata: 'SAP OData', vpn: 'VPN', other: 'Other',
};

function SapImplementationTab({ caseData, auth, activities, updateActivity }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;

  // Connections from project + client
  const { projectConns, clientConns } = useProjectDbConnections(caseData.project_id, caseData.client_id);
  const allConns = [...projectConns, ...clientConns.map(c => ({ ...c, _inherited: true }))];
  const sapCaseConnMap = settings['sap_case_conn'] ?? {};
  const selectedConnId  = sapCaseConnMap[caseData.id] ?? null;

  async function saveCaseConn(connId) {
    await ssCtx.setSetting('sap_case_conn', { ...sapCaseConnMap, [caseData.id]: connId || null });
  }

  const allSapConfigs = settings['sap_integration'] ?? {};
  const clientSapData = caseData.client_id
    ? (allSapConfigs[caseData.client_id] ?? {})
    : (allSapConfigs[`proj_${caseData.project_id}`] ?? {});
  const sapEnvironments = clientSapData.environments ?? (clientSapData.host ? [clientSapData] : []);
  const sapProjectEnvMap = settings['sap_project_env'] ?? {};
  const sapCaseEnvMap   = settings['sap_case_env']    ?? {};
  // Resolution: case env → project env → first client env
  const selectedSapEnvId = sapCaseEnvMap[caseData.id]
    ?? sapProjectEnvMap[caseData.project_id]
    ?? null;
  const sapConfig = selectedSapEnvId
    ? (sapEnvironments.find(e => e.id === selectedSapEnvId) ?? sapEnvironments[0] ?? null)
    : (sapEnvironments[0] ?? null);
  const autoImplEnabled = sapConfig?.autoImplementEnabled ?? false;

  // Enrich sapConfig with VPN proxy URL from linked connection (same as settings test panel)
  const allConnsForEnrich = [...projectConns, ...clientConns];
  function enrichWithVpn(env) {
    if (!env) return env;
    const linked = env.connectionId ? allConnsForEnrich.find(c => c.id === env.connectionId) : null;
    const vpnProxyUrl = linked?.db_type === 'vpn' ? linked.meta?.proxy_url?.trim() : null;
    return vpnProxyUrl ? { ...env, _vpnProxyUrl: vpnProxyUrl } : env;
  }
  const enrichedSapConfig = enrichWithVpn(sapConfig);

  async function saveCaseEnv(envId) {
    await ssCtx.setSetting('sap_case_env', { ...sapCaseEnvMap, [caseData.id]: envId || null });
  }

  // Per-activity SAP object assignments: { [actId]: { objectType, objectName } }
  const savedObjects = settings['sap_activity_objects'] ?? {};
  const [objectMap, setObjectMap] = useState(savedObjects);
  // Per-activity state: { [actId]: { checking, checkResult, generatedCode, applying, applied, expanded } }
  const [actState, setActState] = useState({});
  // Multi-select for apply
  const [checkedActIds, setCheckedActIds] = useState(new Set());

  const [transportReq, setTransportReq] = useState(settings['sap_impl_transport']?.[caseData.id] ?? '');
  const [savingTransport, setSavingTransport] = useState(false);

  const genModel = settings["ai_model"] ?? 'claude-haiku-4-5-20251001';

  // Only show development-phase activities
  const implActivities = activities.filter(a =>
    !['completed'].includes(a.phase) &&
    (a.phase === 'development' || a.phase === 'design' || !a.phase || a.progress_pct < 100)
  );

  function setActField(actId, updates) {
    setActState(p => ({ ...p, [actId]: { ...(p[actId] ?? {}), ...updates } }));
  }

  async function saveObjectMap(newMap) {
    setObjectMap(newMap);
    await ssCtx.setSetting('sap_activity_objects', newMap);
  }

  function setObjectField(actId, field, value) {
    const updated = { ...objectMap, [actId]: { ...(objectMap[actId] ?? {}), [field]: value } };
    saveObjectMap(updated);
  }

  async function saveTransport(val) {
    setSavingTransport(true);
    const cur = settings['sap_impl_transport'] ?? {};
    await ssCtx.setSetting('sap_impl_transport', { ...cur, [caseData.id]: val });
    setSavingTransport(false);
  }

  async function handleCheckSap(actId) {
    if (!sapConfig?.host) return;
    const obj = objectMap[actId];
    if (!obj?.objectName) return;
    setActField(actId, { checking: true, checkResult: null });
    try {
      const src = await sapFetchSource(enrichedSapConfig, obj.objectType ?? 'program', obj.objectName);
      setActField(actId, { checking: false, checkResult: src ? { found: true, source: src } : { found: false } });
    } catch (e) {
      setActField(actId, { checking: false, checkResult: { found: false, error: e.message } });
    }
  }

  async function handleGenerateCode(act) {
    const obj = objectMap[act.id];
    if (!obj?.objectName) return;
    setActField(act.id, { generating: true });
    try {
      const existingSource = actState[act.id]?.checkResult?.source ?? '';
      const isModification = !!existingSource;
      const standards = resolveAbapStandards(
        settings,
        caseData.client_id,
        caseData.project_id,
        caseData.id,
      );
      const standardsBlock = buildAbapStandardsPrompt(
        standards,
        obj.objectType ?? 'program',
        obj.objectName,
        act,
        caseData,
        transportReq,
        isModification,
      );
      const prompt = `You are an SAP ABAP developer. ${isModification ? 'MODIFY' : 'CREATE'} ${obj.objectType ?? 'ABAP program'} code for SAP object ${obj.objectName}.

Activity: ${act.title}
Description: ${act.description ?? ''}
Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? 'general'}
${isModification ? `\nExisting source to MODIFY:\n\`\`\`abap\n${existingSource.slice(0, 3000)}\n\`\`\`` : '\nThis is a NEW object — generate complete source.'}

${standardsBlock}

Output ONLY the ABAP source code, no explanations. Follow the coding standards above exactly.`;
      const resp = await callClaude({
        model: genModel,
        system: 'You are an expert SAP ABAP developer. Output only clean, compilable ABAP source code. Follow all coding standards provided in the user message without exception.',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 4000,
        mcp_servers: buildSapMcpConfig(sapConfig, ssCtx.settings['sap_mcp_server_url']),
      });
      const code = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      setActField(act.id, { generating: false, generatedCode: code });
    } catch (e) {
      setActField(act.id, { generating: false });
      alert('Code generation failed: ' + e.message);
    }
  }

  async function handleApplyToSap(act) {
    if (!sapConfig?.host || !autoImplEnabled) return;
    const obj = objectMap[act.id];
    const code = actState[act.id]?.generatedCode;
    if (!obj?.objectName || !code) return;
    setActField(act.id, { applying: true, applyLog: [`Connecting to SAP via /api/sap-proxy → ${sapConfig.host}…`] });
    const pushLog = msg => setActField(act.id, s => ({ applyLog: [...(s.applyLog ?? []), msg] }));
    const result = await sapWriteSourceDetail(enrichedSapConfig, obj.objectType ?? 'program', obj.objectName, code, transportReq || undefined);
    if (result.ok) {
      pushLog(`✓ Applied successfully (HTTP ${result.status})`);
      setActField(act.id, { applying: false, applied: true });
      await updateActivity(act.id, { progress_pct: 100 });
      const cur = settings['sap_impl_log'] ?? {};
      const caseLog = cur[caseData.id] ?? [];
      await ssCtx.setSetting('sap_impl_log', {
        ...cur,
        [caseData.id]: [...caseLog, {
          activityId: act.id,
          activityTitle: act.title,
          objectName: obj.objectName,
          objectType: obj.objectType,
          appliedAt: new Date().toISOString(),
          transport: transportReq,
        }],
      });
    } else {
      const detail = result.status ? `HTTP ${result.status}` : result.error;
      const hint = result.status === 401 ? 'HTTP 401 — wrong username or password'
        : result.status === 403 ? (result.error || 'HTTP 403 — missing ADT authorization or CSRF token rejected')
        : result.status === 404 ? `HTTP 404 — object ${obj.objectName} does not exist in SAP yet`
        : result.error || (result.body ? `${detail}: ${result.body}` : detail);
      pushLog(`✗ ${hint}`);
      setActField(act.id, { applying: false, applyError: hint });
    }
  }

  async function handleApplyAll() {
    for (const act of implActivities) {
      const obj = objectMap[act.id];
      const code = actState[act.id]?.generatedCode;
      if (obj?.objectName && code && !actState[act.id]?.applied) {
        await handleApplyToSap(act);
      }
    }
  }

  async function handleApplySelected() {
    for (const act of implActivities) {
      if (!checkedActIds.has(act.id)) continue;
      const obj = objectMap[act.id];
      const code = actState[act.id]?.generatedCode;
      if (obj?.objectName && code && !actState[act.id]?.applied) {
        await handleApplyToSap(act);
      }
    }
  }

  function toggleActCheck(actId, e) {
    e.stopPropagation();
    setCheckedActIds(prev => {
      const next = new Set(prev);
      next.has(actId) ? next.delete(actId) : next.add(actId);
      return next;
    });
  }

  function toggleActCheckAll() {
    if (checkedActIds.size === implActivities.length) {
      setCheckedActIds(new Set());
    } else {
      setCheckedActIds(new Set(implActivities.map(a => a.id)));
    }
  }

  const implLog = (settings['sap_impl_log'] ?? {})[caseData.id] ?? [];
  const appliedCount = implLog.length;
  const totalCount   = implActivities.length;

  if (!sapConfig?.host) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <Code2 size={36} className="text-gray-400 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">{t('sap.impl_no_config')}</p>
        <p className="text-xs text-gray-400">{t('sap.impl_configure')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SapBlueprintCanvas
        caseData={caseData}
        auth={auth}
        activities={implActivities}
        sapConfig={enrichedSapConfig}
        autoImplEnabled={autoImplEnabled}
        genModel={genModel}
        transportReq={transportReq}
        ssCtx={ssCtx}
      />
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Code2 size={16} className="text-blue-600" />{t('sap.impl_tab_title')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('sap.impl_tab_subtitle')}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Connection selector */}
            {allConns.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Connection:</label>
                <select
                  value={selectedConnId ?? ''}
                  onChange={e => saveCaseConn(e.target.value)}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— None —</option>
                  {projectConns.map(c => (
                    <option key={c.id} value={c.id}>
                      {CONN_TYPE_LABELS[c.db_type] ?? c.db_type} · {c.host}{c.notes ? ` (${c.notes})` : ''}
                    </option>
                  ))}
                  {clientConns.map(c => (
                    <option key={c.id} value={c.id}>
                      {CONN_TYPE_LABELS[c.db_type] ?? c.db_type} · {c.host} — client{c.notes ? ` (${c.notes})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Environment selector */}
            {sapEnvironments.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium">{t('sap.case_env_label')}:</label>
                <select
                  value={sapCaseEnvMap[caseData.id] ?? ''}
                  onChange={e => saveCaseEnv(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">{t('sap.case_env_inherit')}</option>
                  {sapEnvironments.map(env => {
                    const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
                    return <option key={env.id} value={env.id}>{env.name} ({meta.label})</option>;
                  })}
                </select>
                {sapConfig && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(SAP_ENV_TYPE_META[sapConfig.envType] ?? SAP_ENV_TYPE_META.dev).color}`}>
                    {sapConfig.name}
                  </span>
                )}
              </div>
            )}
            {/* Transport request */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">{t('sap.transport_req')}:</label>
              <input value={transportReq}
                onChange={e => setTransportReq(e.target.value)}
                onBlur={() => saveTransport(transportReq)}
                placeholder={t('sap.ph_transport_req')}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {autoImplEnabled && (
              <>
                <button onClick={toggleActCheckAll}
                  className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  {checkedActIds.size === implActivities.length && implActivities.length > 0
                    ? t('sap.deselect_all') : t('sap.select_all')}
                </button>
                {checkedActIds.size > 0 && (
                  <button onClick={handleApplySelected}
                    className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors">
                    {t('sap.impl_apply_selected').replace('{n}', checkedActIds.size)}
                  </button>
                )}
                <button onClick={handleApplyAll}
                  className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors">
                  {t('sap.impl_apply_all')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{t('sap.impl_progress_title')}</span>
            <span>{t('sap.impl_done_count').replace('{n}', appliedCount).replace('{total}', totalCount)}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: totalCount ? `${Math.round(appliedCount / totalCount * 100)}%` : '0%' }} />
          </div>
        </div>
      </div>

      {/* Case-level ABAP Standards override */}
      <AbapStandardsPanel
        level="case"
        entityId={caseData.id}
        clientId={caseData.client_id}
        projectId={caseData.project_id}
        auth={auth}
      />

      {/* Activity cards */}
      {implActivities.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          No implementation activities found.
        </div>
      ) : implActivities.map(act => {
        const obj  = objectMap[act.id] ?? {};
        const as   = actState[act.id] ?? {};
        const isApplied = as.applied || implLog.some(l => l.activityId === act.id);

        return (
          <div key={act.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${isApplied ? 'border-green-200 bg-green-50/40' : checkedActIds.has(act.id) ? 'border-amber-300' : 'border-gray-100'}`}>
            {/* Card header */}
            <div className="p-4 flex items-start gap-3 cursor-pointer"
              onClick={() => setActField(act.id, { expanded: !as.expanded })}>
              {autoImplEnabled && (
                <input type="checkbox"
                  checked={checkedActIds.has(act.id)}
                  onChange={e => toggleActCheck(act.id, e)}
                  onClick={e => e.stopPropagation()}
                  className="mt-1.5 flex-shrink-0 accent-amber-500 cursor-pointer" />
              )}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isApplied ? 'bg-green-100' : 'bg-blue-100'}`}>
                {isApplied ? <CheckCircle2 size={14} className="text-green-600" /> : <Code2 size={14} className="text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 leading-tight">{act.title}</p>
                {act.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{act.description}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {act.phase && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{act.phase?.replace(/_/g,' ')}</span>}
                  {obj.objectName && <span className="text-xs text-blue-600 font-mono">{obj.objectName}</span>}
                  {isApplied && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 size={10} />{t('sap.impl_applied')}</span>}
                </div>
              </div>
              <ChevronRight size={14} className={`text-gray-400 mt-1 transition-transform flex-shrink-0 ${as.expanded ? 'rotate-90' : ''}`} />
            </div>

            {as.expanded && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {/* Object configuration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.impl_object_type')}</label>
                    <select value={obj.objectType ?? 'program'}
                      onChange={e => setObjectField(act.id, 'objectType', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {SAP_OBJECT_TYPES.map(ot => (
                        <option key={ot.value} value={ot.value}>{t(ot.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.impl_object_name')}</label>
                    <input value={obj.objectName ?? ''}
                      onChange={e => setObjectField(act.id, 'objectName', e.target.value.toUpperCase())}
                      placeholder="ZFIN_PAYMENT_REP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Check in SAP */}
                  <button
                    onClick={() => handleCheckSap(act.id)}
                    disabled={as.checking || !obj.objectName || !sapConfig?.host}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {as.checking ? t('sap.impl_checking') : t('sap.impl_check_sap')}
                  </button>
                  {/* Check result badge */}
                  {as.checkResult && (
                    as.checkResult.found
                      ? <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><CheckCircle2 size={10} />{t('sap.impl_found')}</span>
                      : <span className="text-xs text-gray-400 flex items-center gap-1"><XCircle size={10} />{t('sap.impl_not_found')}</span>
                  )}
                  {/* Generate code */}
                  <button
                    onClick={() => handleGenerateCode(act)}
                    disabled={as.generating || !obj.objectName}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors">
                    {as.generating ? t('sap.impl_generating') : t('sap.impl_gen_code')}
                  </button>
                  {/* Apply to SAP */}
                  {autoImplEnabled && as.generatedCode && (
                    <button
                      onClick={() => handleApplyToSap(act)}
                      disabled={as.applying || isApplied}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors ${isApplied ? 'bg-green-100 text-green-700' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                      {as.applying ? t('sap.impl_applying') : isApplied ? t('sap.impl_applied') : t('sap.impl_apply')}
                    </button>
                  )}
                </div>

                {/* Apply log */}
                {(as.applyLog?.length > 0 || as.applyError) && (
                  <div className="rounded-xl bg-gray-950 p-3 space-y-1">
                    {(as.applyLog ?? []).map((msg, i) => (
                      <p key={i} className={`text-xs font-mono leading-snug ${msg.startsWith('✓') ? 'text-green-400' : msg.startsWith('✗') ? 'text-red-400' : 'text-gray-400'}`}>{msg}</p>
                    ))}
                  </div>
                )}

                {/* Existing source (from SAP check) */}
                {as.checkResult?.found && as.checkResult.source && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Eye size={10} />{t('sap.live_existing_source')}
                    </p>
                    <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto max-h-48 leading-relaxed">
                      {as.checkResult.source.slice(0, 2000)}
                    </pre>
                  </div>
                )}

                {/* Generated code */}
                {as.generatedCode && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Code2 size={10} />Generated ABAP
                    </p>
                    <textarea
                      value={as.generatedCode}
                      onChange={e => setActField(act.id, { generatedCode: e.target.value })}
                      className="w-full bg-gray-900 text-green-300 text-xs rounded-xl p-4 font-mono leading-relaxed h-64 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Implementation log */}
      {implLog.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" />Implementation Log
          </h4>
          <div className="space-y-2">
            {implLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-mono text-blue-600 font-medium">{entry.objectName}</span>
                <span className="text-gray-400">·</span>
                <span className="truncate flex-1">{entry.activityTitle}</span>
                {entry.transport && <span className="text-gray-400 font-mono">{entry.transport}</span>}
                <span className="text-gray-300">{new Date(entry.appliedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { useClientProfile, ABAP_STANDARDS_DEFAULTS, resolveAbapStandards, buildAbapStandardsPrompt, sapObjectPath, SAP_ENV_TYPE_META, SapIntegrationPanel, ProjectSapEnvPanel, ProjectOwnSapPanel, AbapStandardsPanel, AbapTemplatesSection, SAP_OBJECT_TYPES, SapImplementationTab, SapBlueprintCanvas, BP_PHASES, BP_TYPES, BP_STATUS_STYLE, sapLiveCheck, sapFetchSource };
