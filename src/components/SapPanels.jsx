import { useState, useEffect, useCallback, useRef } from "react";
import mcpScript from '../../sap-mcp-server/index.js?raw';
import {
  Activity, AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Code2, Copy, Eye, FileCode2, FileText, FolderOpen, LayoutGrid, Loader2,
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
  let proxyUrl = config.proxyUrl?.trim() || config._vpnProxyUrl?.trim();
  // If the stored proxy URL points to our own /api/sap-proxy but on a different
  // deployment URL (e.g. a stale Vercel preview link), rewrite it to the current
  // origin so the request stays same-origin and avoids Vercel SSO redirects.
  if (proxyUrl && /\/api\/sap-proxy\b/.test(proxyUrl)) {
    proxyUrl = `${window.location.origin}/api/sap-proxy`;
  }
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
  // Send cookies for same-origin proxy requests (Vercel deployment protection needs them).
  // Omit credentials for direct cross-origin calls to SAP to avoid CORS preflight issues.
  const credentials = proxyUrl ? 'same-origin' : 'omit';
  const res = await fetch(url, { ...opts, headers, credentials });
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

// Map ADT service href patterns → human-readable capability labels
function _inferCapabilities(xml) {
  const caps = [];
  const check = (pattern, label) => { if (pattern.test(xml)) caps.push(label); };
  check(/\/adt\/oo\/classes/,         'OO ABAP (Classes)');
  check(/\/adt\/functions/,           'Function Modules');
  check(/\/adt\/programs/,            'Programs & Reports');
  check(/\/adt\/ddic/,                'DDIC (Tables, Structures, Types)');
  check(/\/adt\/businessservices|\/adt\/odata/i, 'OData / Business Services');
  check(/\/adt\/rap|\/adt\/businessobjects/i,    'RAP (Business Objects)');
  check(/\/adt\/enhancements|\/adt\/badi/i,      'BADIs & Enhancement Spots');
  check(/\/adt\/fiori|\/adt\/ui5/i,              'Fiori / UI5');
  check(/\/adt\/bsp/,                            'BSP Applications');
  check(/\/adt\/atc/,                            'ATC (Code Inspector)');
  check(/\/adt\/abapunit/,                       'ABAP Unit Tests');
  check(/\/adt\/repository\/informationsystem/i, 'Repository Information System');
  return caps;
}

// Detect the most likely ABAP object type from free text (title + description)
function detectSapObjectType(text) {
  const t = (text ?? '').toUpperCase();
  if (/\bclass\b|\/class\b|CL_/.test(t))          return 'class';
  if (/\bfm\b|function.?module|function.?group/.test(t)) return 'function_module';
  if (/\btable\b|dbtable|ddic|structure|data.?element/.test(t)) return 'table';
  if (/\benhancement\b|badi\b|impl(ementation)?\b/.test(t)) return 'enhancement';
  if (/\breport\b|program\b/.test(t))              return 'program';
  return null; // unknown — callers should try multiple types
}

async function sapLiveCheck(config) {
  try {
    const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
      headers: { Accept: 'application/atomsvc+xml' },
    });
    if (!res.ok) return { error: res.status };
    const xml = await res.text();

    // ADT uses namespace-prefixed elements/attrs: <atom:title>, adtcore:release="...", etc.
    // All regexes match the attribute value regardless of prefix (e.g. adtcore:release="757")
    let title  = xml.match(/<(?:\w+:)?title[^>]*>([^<]+)/)?.[1]?.trim() ?? '';
    let ver    = xml.match(/(?::)?release="([^"]+)"/)?.[1] ?? xml.match(/version="([^"]+)"/)?.[1] ?? '';
    let spVer  = xml.match(/(?::)?sp="([^"]+)"/)?.[1] ?? '';
    let sid    = xml.match(/systemId="([^"]+)"/i)?.[1] ?? '';
    let client = xml.match(/(?::)?client="(\d+)"/i)?.[1] ?? xml.match(/sap-client[^=]*=\s*"?(\d{3})/)?.[1] ?? '';

    const capabilities = _inferCapabilities(xml);

    // Second call: software component list + version fallback from system settings
    let components = [];
    try {
      const settRes = await sapApiRequest(config, '/sap/bc/adt/system/settings', {
        headers: { Accept: 'application/xml, application/vnd.sap.adt.system.settings.v2+xml, */*' },
      });
      if (settRes.ok) {
        const settXml = await settRes.text();
        // Also extract version attributes if not found in discovery XML
        if (!ver)    ver    = settXml.match(/(?::)?release="([^"]+)"/)?.[1] ?? settXml.match(/version="([^"]+)"/)?.[1] ?? '';
        if (!spVer)  spVer  = settXml.match(/(?::)?sp="([^"]+)"/)?.[1] ?? '';
        if (!sid)    sid    = settXml.match(/systemId="([^"]+)"/i)?.[1] ?? '';
        if (!client) client = settXml.match(/(?::)?client="(\d+)"/i)?.[1] ?? '';
        if (!title)  title  = settXml.match(/<(?:\w+:)?title[^>]*>([^<]+)/)?.[1]?.trim() ?? '';
        // Match <adtbase:softwareComponent name="..."> or <softwareComponent name="...">
        const compMatches = [...settXml.matchAll(/softwareComponent[^>]+name="([^"]+)"/gi)];
        if (compMatches.length) {
          components = compMatches.map(m => m[1]).filter(Boolean);
        } else {
          // Fallback: category-based match
          const alt = [...settXml.matchAll(/name="([^"]+)"[^>]*category="[^"]*software[^"]*"/gi)];
          components = alt.map(m => m[1]).filter(Boolean);
        }
      }
    } catch { /* system/settings is optional — ignore failures */ }

    // Build systemInfo after both calls so we have all available attributes
    const parts = [
      sid ? `SID: ${sid}` : title,
      ver && `Release ${ver}`,
      spVer && `SP ${spVer}`,
      client && `Client ${client}`,
    ].filter(Boolean);
    // If no version info from ADT, show top software components as proof of live connection
    const compSummary = !ver && components.length ? `Components: ${components.slice(0, 3).join(', ')}` : '';
    const systemInfo = parts.join(' | ') || compSummary || 'Connected';

    return { systemInfo, capabilities, components, sid, client };
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
  const [adtWarnings, setAdtWarnings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});

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
    setAdtWarnings(p => ({ ...p, [env.id]: null }));
    const enriched = enrichEnvWithVpn(env);
    const effectiveProxy = enriched.proxyUrl?.trim() || enriched._vpnProxyUrl;
    try {
      const result = await sapLiveCheck(enriched);
      if (result && !result.error) {
        setTestStates(p => ({ ...p, [env.id]: 'ok' }));
        if (env.type === 'ecc') setAdtWarnings(p => ({ ...p, [env.id]: 'active' }));
      } else {
        setTestStates(p => ({ ...p, [env.id]: 'fail' }));
        const status = result?.error;
        if (env.type === 'ecc' && status === 404) setAdtWarnings(p => ({ ...p, [env.id]: 'inactive' }));
        if (env.type === 'ecc' && status === 403) setAdtWarnings(p => ({ ...p, [env.id]: 'no_auth' }));
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
                          <div className="relative">
                            <input type={showPasswords[env.id] ? 'text' : 'password'} value={env.password} onChange={e => updateEnvField(env.id, 'password', e.target.value)} disabled={!canEdit}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                              autoComplete="new-password" />
                            <button type="button" onClick={() => setShowPasswords(p => ({ ...p, [env.id]: !p[env.id] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                              {showPasswords[env.id] ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                            </button>
                          </div>
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
                        {env.type === 'ecc' && adtWarnings[env.id] === 'active' && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-xs text-green-700 dark:text-green-300">
                            <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
                            <span><strong>ADT is active</strong> on this ECC system — auto-implementation and Auto Config will work.</span>
                          </div>
                        )}
                        {env.type === 'ecc' && adtWarnings[env.id] === 'inactive' && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                            <span><strong>ADT is not activated</strong> on this ECC system. Auto-implementation and Auto Config will fall back to manual SE38 steps.<br />
                            To enable: open <strong>SICF</strong>, activate service path <strong>/sap/bc/adt</strong> and all sub-nodes, then assign auth object <strong>S_ADT_ALL</strong> to your SAP user.</span>
                          </div>
                        )}
                        {env.type === 'ecc' && adtWarnings[env.id] === 'no_auth' && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                            <span><strong>ADT is active</strong> but this user lacks authorization. Assign auth object <strong>S_ADT_ALL</strong> (or role <strong>SAP_BC_DWB_ABAPDEVELOPER</strong>) in SU01/PFCG.</span>
                          </div>
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

function McpRestartButton({ mcpUrl }) {
  const [state, setState] = useState('idle'); // idle | restarting | done | error
  const base = (mcpUrl || '').replace(/\/mcp\/?$/, '').replace(/\/$/, '').trim();
  if (!base) return null;

  async function restart() {
    setState('restarting');
    try {
      await fetch(`${base}/restart`, { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {});
      setState('done');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 4000);
  }

  return (
    <button onClick={restart} disabled={state === 'restarting'} title="Restart MCP server"
      className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed
        ${state === 'done' ? 'border-green-300 text-green-600 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
        : state === 'error' ? 'border-orange-300 text-orange-500 bg-orange-50 dark:bg-orange-900/20'
        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-300 bg-white dark:bg-gray-700'}`}>
      <RefreshCw size={13} className={state === 'restarting' ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{state === 'restarting' ? 'Restarting…' : state === 'done' ? 'Sent' : state === 'error' ? 'Unreachable' : 'Restart MCP'}</span>
    </button>
  );
}

function EnvInfraStatusCard({ env, enrichEnvWithVpn, projectConns, globalMcpUrl, onUpdateMcpUrl }) {
  const STORAGE_KEY = `infra_v2_${env.id}`;
  const bundledVersion = mcpScript.match(/version:\s*'([^']+)'/)?.[1] ?? '?';
  const { settings: sysSettings } = useSystemSettings();
  const diagnosisModel = sysSettings['analysis_model'] ?? sysSettings['ai_model'] ?? 'claude-haiku-5-5';
  const infraCfgRaw = sysSettings['infra_check_settings'] ?? {};
  const infraCfg = {
    vm:  { enabled: infraCfgRaw.vm?.enabled  ?? true, autoSolve: infraCfgRaw.vm?.autoSolve  ?? true },
    vpn: { enabled: infraCfgRaw.vpn?.enabled ?? true, autoSolve: infraCfgRaw.vpn?.autoSolve ?? true },
    mcp: { enabled: infraCfgRaw.mcp?.enabled ?? true, autoSolve: infraCfgRaw.mcp?.autoSolve ?? true },
    sap: { enabled: infraCfgRaw.sap?.enabled ?? true, autoSolve: infraCfgRaw.sap?.autoSolve ?? false },
  };

  const emptyNodes = () => ({
    vm:  { status: 'idle', detail: '', log: [] },
    vpn: { status: 'idle', detail: '', log: [] },
    mcp: { status: 'idle', detail: '', log: [], extra: {} },
    sap: { status: 'idle', detail: '', log: [], extra: {} },
  });

  const loadPersisted = () => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };

  const [running, setRunning] = useState(false);
  const [nodes, setNodes] = useState(() => loadPersisted()?.nodes ?? emptyNodes());
  const [checkedAt, setCheckedAt] = useState(() => loadPersisted()?.checkedAt ?? null);
  const [expanded, setExpanded] = useState({});
  const [stoppedAt, setStoppedAt] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s)?.aiDiagnosis ?? null : null; } catch { return null; } });
  const [diagnosing, setDiagnosing] = useState(false);
  const cancelRef = useRef(false);

  const getMcpBase = () =>
    (env.mcp_server_url?.trim() || globalMcpUrl || '').replace(/\/mcp\/?$/, '').replace(/\/$/, '').trim();

  useEffect(() => {
    if (checkedAt) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, checkedAt, aiDiagnosis })); } catch {}
    }
  }, [nodes, checkedAt, aiDiagnosis]);

  function ts() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  // Because React state batches, we use a local mutable ref during the run
  const liveNodes = useRef(emptyNodes());

  function setLiveNode(key, patch) {
    liveNodes.current = { ...liveNodes.current, [key]: { ...liveNodes.current[key], ...patch } };
    setNodes({ ...liveNodes.current });
  }

  function addLog(key, msg, level = 'info') {
    const entry = { ts: ts(), msg, level };
    const node = liveNodes.current[key];
    const newLog = [...(node.log || []), entry];
    liveNodes.current = { ...liveNodes.current, [key]: { ...node, log: newLog } };
    setNodes({ ...liveNodes.current });
  }

  async function diagnoseFailure(nodeKey, diagContext = {}) {
    setDiagnosing(true);
    try {
      const nodeMeta = { vm: 'Virtual Machine', vpn: 'VPN', mcp: 'MCP Server', sap: 'SAP Connection' };
      const failedNode = liveNodes.current[nodeKey];
      const logText = failedNode.log?.map(e => `  [${e.level.toUpperCase()}] ${e.ts}  ${e.msg}`).join('\n') || '  (no log)';
      const prevPassed = ['vm', 'vpn', 'mcp', 'sap']
        .filter(k => k !== nodeKey && liveNodes.current[k].status === 'ok')
        .map(k => `  ${nodeMeta[k]}: OK — ${liveNodes.current[k].detail}`)
        .join('\n') || '  (none)';

      const { preDiag, postDiag } = diagContext;
      let diagSection = '';
      if (postDiag) {
        diagSection = `\n\nActual VM diagnostic output (post-crash):\n${String(postDiag).slice(0, 2000)}`;
      } else if (preDiag?.journal) {
        diagSection = `\n\nVM diagnostic data (captured before restart):\nJournal: ${preDiag.journal.slice(0, 600)}\nPort: ${preDiag.portDetail || 'N/A'}\nMemory: ${preDiag.memory || 'N/A'}\nNode procs: ${preDiag.nodeProcs || 'none'}`;
      }

      const prompt = `TechCase infrastructure check failed at: ${nodeMeta[nodeKey]}
Error: ${failedNode.detail}
Log:
${logText}
Prior nodes that passed:
${prevPassed}${diagSection}

Give 3-5 numbered steps to fix this. Be brief and specific. No preamble.`;

      const result = await callClaude({
        model: diagnosisModel,
        system: 'You are a DevOps assistant for TechCase. The stack: Node.js MCP server on AWS EC2 Ubuntu, exposed via Cloudflare Quick Tunnel, FortiClient VPN to SAP. Diagnose and give concrete fix steps.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      });
      if (result) setAiDiagnosis(result.trim());
      else setAiDiagnosis('AI returned empty response. Check the VM logs in the node detail above.');
    } catch (e) {
      addLog(nodeKey, `AI diagnosis error: ${e.message?.slice(0, 80) || 'unknown'}`, 'error');
      const rawLogs = diagContext.postDiag
        ? String(diagContext.postDiag).slice(0, 800)
        : diagContext.preDiag?.journal
          ? `Journal:\n${diagContext.preDiag.journal.slice(0, 500)}`
          : null;
      setAiDiagnosis(
        `AI diagnosis failed: ${e.message?.slice(0, 100) || 'unknown error'}` +
        (rawLogs ? `\n\nRaw VM logs:\n${rawLogs}` : '')
      );
    } finally { setDiagnosing(false); }
  }

  async function run() {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setStoppedAt(null);
    setAiDiagnosis(null);
    setDeployMsg('');
    const now = new Date().toISOString();
    setCheckedAt(now);

    const fresh = emptyNodes();
    liveNodes.current = fresh;
    setNodes({ ...fresh });

    let currentMcpBase = getMcpBase();
    let vmStatusData = null;

    // ── Node 1: VM ────────────────────────────────────────────────
    if (!infraCfg.vm.enabled) {
      setLiveNode('vm', { status: 'warning', detail: 'Disabled in settings', log: [{ ts: ts(), msg: 'Node disabled in platform settings', level: 'warn' }] });
    } else {
    setLiveNode('vm', { status: 'checking', detail: 'Connecting…', log: [] });

    if (!currentMcpBase) {
      setLiveNode('vm', { status: 'error', detail: 'No MCP server URL configured' });
      addLog('vm', 'No MCP server URL — configure it in SAP integration settings', 'error');
      setStoppedAt('vm');
      setRunning(false);
      diagnoseFailure('vm');
      return;
    }

    addLog('vm', `Connecting to ${currentMcpBase}…`);

    const tryFetchStatus = async (base) => {
      try {
        const r = await fetch(`${base}/status`, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return await r.json();
        const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (h?.ok) { const hd = await h.json(); return { vm: true, mcp: true, vpn: null, version: hd?.version }; }
        return null;
      } catch { return null; }
    };

    vmStatusData = await tryFetchStatus(currentMcpBase);

    if (!vmStatusData && infraCfg.vm.autoSolve) {
      setLiveNode('vm', { ...liveNodes.current.vm, status: 'fixing', detail: 'Refreshing tunnel URL…' });
      addLog('vm', 'VM unreachable — looking up latest tunnel URL from registry…', 'warn');
      try {
        const { data } = await supabase
          .from('vm_tunnel_registry')
          .select('tunnel_url, updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.tunnel_url) {
          const freshUrl = data.tunnel_url.replace(/\/$/, '');
          const ageMins = Math.round((Date.now() - new Date(data.updated_at).getTime()) / 60000);
          addLog('vm', `Found URL in registry (${ageMins}m ago): ${freshUrl} — retrying…`);
          currentMcpBase = freshUrl;
          if (onUpdateMcpUrl) onUpdateMcpUrl(freshUrl);
          vmStatusData = await tryFetchStatus(currentMcpBase);
        } else {
          addLog('vm', 'No URL in registry — cloudflared may not be running on VM', 'error');
        }
      } catch (e) {
        addLog('vm', `Registry lookup failed: ${e.message?.slice(0, 60)}`, 'error');
      }
    }

    if (!vmStatusData) {
      setLiveNode('vm', { ...liveNodes.current.vm, status: 'error', detail: 'VM unreachable — check AWS console or tunnel' });
      addLog('vm', 'Could not reach VM after URL refresh. Check AWS console.', 'error');
      setStoppedAt('vm');
      setRunning(false);
      diagnoseFailure('vm');
      return;
    }

    const serverVer = vmStatusData?.version ?? null;
    setLiveNode('vm', { ...liveNodes.current.vm, status: 'ok', detail: `Online${serverVer ? ` · v${serverVer}` : ''}` });
    addLog('vm', `VM responded OK${serverVer ? ` (server v${serverVer})` : ''}`, 'success');
    } // end infraCfg.vm.enabled

    if (cancelRef.current) { setRunning(false); return; }

    // ── Node 2: VPN ───────────────────────────────────────────────
    if (!infraCfg.vpn.enabled) {
      setLiveNode('vpn', { status: 'warning', detail: 'Disabled in settings', log: [{ ts: ts(), msg: 'Node disabled in platform settings', level: 'warn' }] });
    } else {
    setLiveNode('vpn', { status: 'checking', detail: 'Reading VPN status from VM…', log: [] });
    addLog('vpn', 'Reading VPN status from VM…');

    const vpnActive = vmStatusData?.vpn;
    const vpnSvc = vmStatusData?.vpnService || '';

    if (vpnActive === null || vpnActive === undefined) {
      setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'warning', detail: 'Status unknown — update MCP server' });
      addLog('vpn', 'VPN status unavailable (old server). Deploy latest to enable monitoring.', 'warn');
    } else if (vpnActive === true) {
      setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'ok', detail: `Connected${vpnSvc ? ` (${vpnSvc})` : ''}` });
      addLog('vpn', `VPN active${vpnSvc ? `: ${vpnSvc}` : ''}`, 'success');
    } else if (!infraCfg.vpn.autoSolve) {
      setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'error', detail: 'VPN inactive — auto-solve disabled in settings' });
      addLog('vpn', 'VPN inactive. Auto-solve is off — enable it in platform settings to auto-start.', 'warn');
      setStoppedAt('vpn');
      setRunning(false);
      diagnoseFailure('vpn');
      return;
    } else {
      addLog('vpn', 'VPN inactive — attempting to start…', 'warn');
      setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'fixing', detail: 'Starting VPN…' });

      const vpnConn = projectConns?.find(c => c.db_type === 'vpn');
      let startBody = null;
      if (vpnConn) {
        const rawHost = vpnConn.meta?.remote_gateway?.trim() || vpnConn.host?.trim() || '';
        const [gHost, gPort] = rawHost.includes(':') ? rawHost.split(':') : [rawHost, String(vpnConn.port || '443')];
        startBody = JSON.stringify({
          host: gHost, port: gPort,
          username: vpnConn.username || '',
          password: vpnConn.meta?.password || '',
          trusted_cert: vpnConn.meta?.trusted_cert || '',
        });
        addLog('vpn', `Using VPN connection "${vpnConn.meta?.conn_name || vpnConn.host}"…`);
      } else {
        addLog('vpn', 'No VPN connection configured in project — trying start without credentials', 'warn');
      }

      let startOk = false;
      try {
        const sr = await fetch(`${currentMcpBase}/vpn/start`, {
          method: 'POST',
          headers: startBody ? { 'Content-Type': 'application/json' } : {},
          body: startBody ?? undefined,
          signal: AbortSignal.timeout(35000),
        });
        const sd = await sr.json();
        if (sd.ok === false) {
          const errMsg = sd.error || 'Unknown error';
          const isCredErr = /password|auth|credential|denied/i.test(errMsg);
          addLog('vpn', `VPN start failed: ${errMsg}`, 'error');
          if (isCredErr) addLog('vpn', 'Authentication error — check VPN credentials in project settings', 'error');
          setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'error', detail: `Cannot start: ${errMsg.slice(0, 80)}` });
          setStoppedAt('vpn');
          setRunning(false);
          diagnoseFailure('vpn');
          return;
        }
        if (sd.vpn === true) {
          startOk = true;
        } else {
          addLog('vpn', 'Start command sent — waiting 8s for tunnel…');
          await new Promise(r => setTimeout(r, 8000));
          const rechk = await fetch(`${currentMcpBase}/status`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
          startOk = rechk?.vpn === true;
        }
      } catch (e) {
        addLog('vpn', `VPN start request failed: ${e.message?.slice(0, 80)}`, 'error');
        setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'error', detail: `Start failed: ${e.message?.slice(0, 60)}` });
        setStoppedAt('vpn');
        setRunning(false);
        diagnoseFailure('vpn');
        return;
      }

      if (!startOk) {
        setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'error', detail: 'VPN still inactive after start attempt' });
        addLog('vpn', 'VPN failed to connect. Check credentials and gateway. Infrastructure check stopped.', 'error');
        setStoppedAt('vpn');
        setRunning(false);
        diagnoseFailure('vpn');
        return;
      }
      setLiveNode('vpn', { ...liveNodes.current.vpn, status: 'ok', detail: 'VPN started successfully' });
      addLog('vpn', 'VPN connected', 'success');
    }
    } // end infraCfg.vpn.enabled

    if (cancelRef.current) { setRunning(false); return; }

    // ── Node 3: MCP ───────────────────────────────────────────────
    if (!infraCfg.mcp.enabled) {
      setLiveNode('mcp', { status: 'warning', detail: 'Disabled in settings', log: [{ ts: ts(), msg: 'Node disabled in platform settings', level: 'warn' }], extra: {} });
    } else {
    setLiveNode('mcp', { status: 'checking', detail: 'Checking MCP server…', log: [], extra: {} });
    addLog('mcp', 'Checking MCP server health…');

    let healthData = null;
    let preDiag = null;
    try {
      const hr = await fetch(`${currentMcpBase}/health`, { signal: AbortSignal.timeout(6000) });
      if (hr.ok) healthData = await hr.json();
    } catch {}

    if (!healthData && !infraCfg.mcp.autoSolve) {
      setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'error', detail: 'MCP health check failed — auto-solve disabled in settings' });
      addLog('mcp', 'Health check failed. Auto-solve is off — enable it in platform settings to auto-restart.', 'warn');
      setStoppedAt('mcp');
      setRunning(false);
      diagnoseFailure('mcp');
      return;
    }
    if (!healthData) {
      addLog('mcp', 'Health check failed — attempting restart…', 'warn');
      setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'fixing', detail: 'Restarting MCP server…' });

      // Grab diagnostics before restart while server may still respond to requests
      try {
        const dr = await fetch(`${currentMcpBase}/diagnostics`, { signal: AbortSignal.timeout(4000) });
        if (dr.ok) { preDiag = await dr.json(); addLog('mcp', 'Pre-restart diagnostics captured', 'info'); }
      } catch {}

      // Step 1: send /restart (works if process is alive but unhealthy; also tries systemctl)
      const restartSent = await fetch(`${currentMcpBase}/restart`, { method: 'POST', signal: AbortSignal.timeout(5000) })
        .then(r => r.ok).catch(() => false);
      addLog('mcp', restartSent ? 'Restart command accepted — polling for recovery…' : 'Server unreachable — waiting for systemd auto-restart…');

      // Step 2: poll /health every 3s for up to 45s (covers systemd RestartSec + startup time)
      const pollStart = Date.now();
      const pollTimeout = 45000;
      while (Date.now() - pollStart < pollTimeout && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 3000));
        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        const rhr = await fetch(`${currentMcpBase}/health`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
        if (rhr?.ok) {
          healthData = await rhr.json();
          addLog('mcp', `MCP recovered after ${elapsed}s`, 'success');
          break;
        }
        setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'fixing', detail: `Waiting for restart… (${elapsed}s / 45s)` });
        if (elapsed % 9 === 0) addLog('mcp', `Still restarting… (${elapsed}s)`);
      }

      // Step 3: if still dead, check if tunnel URL changed (Cloudflare restart generates new URL)
      if (!healthData) {
        addLog('mcp', 'MCP still unreachable — checking if tunnel URL changed…', 'warn');
        try {
          const { data: tData } = await supabase
            .from('vm_tunnel_registry')
            .select('tunnel_url, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1).maybeSingle();
          if (tData?.tunnel_url) {
            const freshUrl = tData.tunnel_url.replace(/\/$/, '');
            if (freshUrl !== currentMcpBase) {
              addLog('mcp', `New tunnel URL: ${freshUrl} — retrying…`);
              currentMcpBase = freshUrl;
              if (onUpdateMcpUrl) onUpdateMcpUrl(freshUrl);
              const rhr2 = await fetch(`${currentMcpBase}/health`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
              if (rhr2?.ok) { healthData = await rhr2.json(); addLog('mcp', 'MCP reached via new tunnel URL', 'success'); }
            }
          }
        } catch {}
      }

      // Step 4: last resort — queue restart command via Supabase (VM polls this every 60s)
      if (!healthData) {
        addLog('mcp', 'Queuing restart command via Supabase (VM polls every 60s)…', 'warn');
        setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'fixing', detail: 'Queued restart — polling for VM response…' });
        try {
          const { error: qErr } = await supabase
            .from('vm_command_queue')
            .insert({ command: 'restart_mcp', status: 'pending' });
          if (!qErr) {
            addLog('mcp', 'Restart queued ✓ — VM will execute within 60s. Polling for 90s more…');
            const qPollStart = Date.now();
            while (Date.now() - qPollStart < 90000 && !cancelRef.current) {
              await new Promise(r => setTimeout(r, 5000));
              const elapsed2 = Math.round((Date.now() - qPollStart) / 1000);
              const rhr3 = await fetch(`${currentMcpBase}/health`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
              if (rhr3?.ok) {
                healthData = await rhr3.json();
                addLog('mcp', `MCP recovered ${elapsed2}s after queue restart`, 'success');
                break;
              }
              setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'fixing', detail: `Queue restart pending… (${elapsed2}s / 90s)` });
            }
          } else {
            addLog('mcp', `Queue write failed: ${qErr.message?.slice(0, 60)} — create vm_command_queue table in Supabase`, 'error');
          }
        } catch (qe) {
          addLog('mcp', `Queue unavailable: ${qe.message?.slice(0, 60)}`, 'warn');
        }
      }
    }

    if (!healthData) {
      setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'error', detail: 'MCP server unresponsive — SAP calls will fail' });
      addLog('mcp', 'MCP server not responding. SAP check skipped.', 'error');
      setStoppedAt('mcp');
      setRunning(false);
      // Async: fetch VM crash logs via queue, then run AI diagnosis with real data
      (async () => {
        let postDiag = null;
        try {
          const { data: dqData, error: dqErr } = await supabase
            .from('vm_command_queue')
            .insert({ command: 'get_diagnostics', status: 'pending' })
            .select('id').single();
          if (!dqErr && dqData?.id) {
            addLog('mcp', 'Fetching VM crash logs… (up to 90s)', 'info');
            const t0 = Date.now();
            while (Date.now() - t0 < 90000) {
              await new Promise(r => setTimeout(r, 5000));
              const { data: qRow } = await supabase
                .from('vm_command_queue').select('status, result').eq('id', dqData.id).single();
              if (qRow?.status === 'done' && qRow?.result) {
                postDiag = qRow.result;
                addLog('mcp', 'VM crash logs received ✓ — running AI analysis…', 'success');
                break;
              }
            }
            if (!postDiag) addLog('mcp', 'VM logs timed out — using available data for analysis', 'warn');
          }
        } catch {}
        diagnoseFailure('mcp', { preDiag, postDiag });
      })();
      return;
    }

    const deployedVer = healthData?.version ?? serverVer ?? null;
    const verMismatch = deployedVer && bundledVersion && bundledVersion !== '?' && deployedVer !== bundledVersion;
    const mcpExtra = { deployedVersion: deployedVer, bundledVersion, needsDeploy: verMismatch };

    if (verMismatch) {
      setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'warning', detail: `v${deployedVer} running — v${bundledVersion} available`, extra: mcpExtra });
      addLog('mcp', `Version mismatch: deployed v${deployedVer}, bundled v${bundledVersion} — use Deploy button to update`, 'warn');
    } else {
      setLiveNode('mcp', { ...liveNodes.current.mcp, status: 'ok', detail: `v${deployedVer ?? '?'} running`, extra: mcpExtra });
      addLog('mcp', `MCP server OK (v${deployedVer ?? '?'})`, 'success');
    }
    } // end infraCfg.mcp.enabled

    if (cancelRef.current) { setRunning(false); return; }

    // ── Node 4: SAP ───────────────────────────────────────────────
    if (!infraCfg.sap.enabled) {
      setLiveNode('sap', { status: 'warning', detail: 'Disabled in settings', log: [{ ts: ts(), msg: 'Node disabled in platform settings', level: 'warn' }], extra: {} });
    } else {
    setLiveNode('sap', { status: 'checking', detail: 'Testing SAP ADT connection…', log: [], extra: {} });
    addLog('sap', `Connecting to SAP at ${env.host || '(no host configured)'}…`);

    if (!env.host || !env.username || !env.password) {
      setLiveNode('sap', { ...liveNodes.current.sap, status: 'warning', detail: 'No SAP credentials configured' });
      addLog('sap', 'Host, username or password not configured — skipping SAP check', 'warn');
    } else {
      const doSapCheck = async () => {
        const r = await fetch(`${currentMcpBase}/sap-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: env.host, username: env.username, password: env.password, client: env.client || '100' }),
          signal: AbortSignal.timeout(35000),
        });
        return r.json();
      };

      let sapResult = null;
      try {
        sapResult = await doSapCheck();
      } catch (e) {
        addLog('sap', `Attempt 1 failed (${e.message?.slice(0, 50)}) — retrying…`, 'warn');
        try { await new Promise(r => setTimeout(r, 2000)); sapResult = await doSapCheck(); } catch {}
      }

      if (!sapResult) {
        setLiveNode('sap', { ...liveNodes.current.sap, status: 'error', detail: 'SAP unreachable — network or timeout error' });
        addLog('sap', 'SAP unreachable after 2 attempts', 'error');
      } else if (sapResult.ok) {
        const info = sapResult.systemInfo || `Connected (${env.host})`;
        setLiveNode('sap', { ...liveNodes.current.sap, status: 'ok', detail: info, extra: { systemInfo: info } });
        addLog('sap', `SAP connected: ${info}`, 'success');
      } else {
        const code = sapResult.status;
        const errMsg = sapResult.error || `HTTP ${code || 'error'}`;
        setLiveNode('sap', { ...liveNodes.current.sap, status: 'error', detail: errMsg });
        addLog('sap', `SAP error: ${errMsg}`, 'error');
        if (code === 401) addLog('sap', 'Wrong credentials — check username and password', 'error');
        else if (code === 403) addLog('sap', 'No ADT authorization — check user roles in SAP', 'error');
        else if (code === 404) addLog('sap', 'ADT service not active — check SICF in SAP', 'error');
      }
    }
    } // end infraCfg.sap.enabled

    setRunning(false);
  }

  async function deployServer() {
    const base = getMcpBase();
    if (!base || deploying) return;
    setDeploying(true);
    setDeployMsg('Deploying…');
    try {
      const r = await fetch(`${base}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: mcpScript,
        signal: AbortSignal.timeout(25000),
      }).then(res => res.json()).catch(e => ({ ok: false, error: e.message }));
      if (r.ok) {
        setDeployMsg('Deployed — restarting server…');
        await new Promise(resolve => setTimeout(resolve, 4500));
        setDeployMsg('');
        run();
      } else {
        setDeployMsg(`Failed: ${r.error?.slice(0, 80) || 'unknown'}`);
      }
    } catch (e) {
      setDeployMsg(`Error: ${e.message?.slice(0, 60)}`);
    } finally {
      setDeploying(false);
    }
  }

  const NODE_META = [
    { key: 'vm',  label: 'Virtual Machine' },
    { key: 'vpn', label: 'VPN' },
    { key: 'mcp', label: 'MCP Server' },
    { key: 'sap', label: 'SAP Connection' },
  ];

  const statusIcon = (status) => {
    if (status === 'checking' || status === 'fixing') return <RefreshCw size={14} className="animate-spin text-blue-400" />;
    if (status === 'ok')      return <CheckCircle2 size={14} className="text-green-500" />;
    if (status === 'warning') return <AlertTriangle size={14} className="text-amber-400" />;
    if (status === 'error')   return <XCircle size={14} className="text-red-400" />;
    return <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gray-200 dark:border-gray-600" />;
  };

  const statusPill = (status) => {
    const cls = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none';
    if (status === 'checking') return <span className={`${cls} bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300`}>Checking…</span>;
    if (status === 'fixing')   return <span className={`${cls} bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300`}>Fixing…</span>;
    if (status === 'ok')       return <span className={`${cls} bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300`}>OK</span>;
    if (status === 'warning')  return <span className={`${cls} bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300`}>Warning</span>;
    if (status === 'error')    return <span className={`${cls} bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300`}>Error</span>;
    return <span className={`${cls} bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500`}>Pending</span>;
  };

  const logColor = (level) => ({
    info:    'text-gray-500 dark:text-gray-400',
    warn:    'text-amber-500 dark:text-amber-400',
    error:   'text-red-500 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  }[level] ?? 'text-gray-500 dark:text-gray-400');

  const nodeBg = (status) =>
    status === 'ok'       ? 'border-green-100 dark:border-green-900/40 bg-green-50/40 dark:bg-green-900/10'
    : status === 'error'  ? 'border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-900/10'
    : status === 'warning'? 'border-amber-100 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-900/10'
    : (status === 'checking' || status === 'fixing') ? 'border-blue-100 dark:border-blue-800/40 bg-blue-50/20 dark:bg-blue-900/10'
    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/20';

  const lastCheckedLabel = checkedAt
    ? (() => {
        const diffMs = Date.now() - new Date(checkedAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        return new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      })()
    : null;

  const overallStatus = () => {
    const statuses = Object.values(nodes).map(n => n.status);
    if (statuses.every(s => s === 'idle')) return null;
    if (statuses.some(s => s === 'error')) return 'error';
    if (statuses.some(s => s === 'warning')) return 'warning';
    if (statuses.every(s => s === 'ok')) return 'all-ok';
    return null;
  };

  const overall = overallStatus();

  return (
    <div className="mt-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          onClick={running ? () => { cancelRef.current = true; setRunning(false); } : run}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
            ${running
              ? 'border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:border-red-400 bg-white dark:bg-gray-800'
              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:text-blue-600 bg-white dark:bg-gray-800'
            }`}
        >
          {running
            ? <><X size={12} className="shrink-0" /> Stop</>
            : <><Activity size={12} className="shrink-0" /> Check Infrastructure</>
          }
        </button>
        <div className="flex items-center gap-2">
          {overall === 'all-ok' && <span className="text-[10px] font-medium text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 size={10} /> All systems OK</span>}
          {overall === 'error' && <span className="text-[10px] font-medium text-red-500 flex items-center gap-1"><XCircle size={10} /> Issue detected</span>}
          {overall === 'warning' && <span className="text-[10px] font-medium text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Warnings</span>}
          {lastCheckedLabel && <span className="text-[10px] text-gray-400 dark:text-gray-500">{lastCheckedLabel}</span>}
        </div>
      </div>

      {/* Node pipeline */}
      <div className="space-y-1">
        {NODE_META.map(({ key, label }, idx) => {
          const node = nodes[key];
          const isExpandedLog = !!expanded[key];
          const hasLog = node.log?.length > 0;
          const showDeploy = key === 'mcp' && (node.extra?.needsDeploy || node.status === 'error');

          return (
            <div key={key} className={`rounded-lg border transition-colors ${nodeBg(node.status)}`}>
              {/* Node row */}
              <div className="flex items-start gap-2.5 px-3 py-2">
                <div className="shrink-0 mt-0.5">{statusIcon(node.status)}</div>
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-[9px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center leading-none">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</span>
                    {statusPill(node.status)}
                  </div>
                  {node.detail && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug break-words">{node.detail}</p>
                  )}
                </div>
                {showDeploy && (
                  <button onClick={deployServer} disabled={deploying}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
                    {deploying ? <RefreshCw size={9} className="animate-spin" /> : <Upload size={9} />}
                    {deploying ? 'Deploying…' : 'Deploy'}
                  </button>
                )}
                {hasLog && (
                  <button onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                    className="shrink-0 p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors">
                    <ChevronDown size={12} className={`transition-transform duration-150 ${isExpandedLog ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {/* Deploy message */}
              {showDeploy && deployMsg && (
                <div className="px-10 pb-2">
                  <p className={`text-[10px] ${deployMsg.startsWith('Failed') || deployMsg.startsWith('Error') ? 'text-red-400' : 'text-blue-400'}`}>{deployMsg}</p>
                </div>
              )}

              {/* Collapsible log */}
              {isExpandedLog && hasLog && (
                <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 pt-2 pb-2.5">
                  <div className="space-y-0.5">
                    {node.log.map((entry, i) => (
                      <div key={i} className="flex items-start gap-2 font-mono">
                        <span className="shrink-0 text-[10px] text-gray-300 dark:text-gray-600 tabular-nums">{entry.ts}</span>
                        <span className={`text-[10px] ${logColor(entry.level)}`}>{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stop banner + AI diagnosis */}
      {stoppedAt && !running && (
        <div className="mt-1.5 rounded-lg border border-red-100 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2">
            <AlertTriangle size={12} className="text-red-400 shrink-0" />
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Stopped at <strong>{NODE_META.find(n => n.key === stoppedAt)?.label}</strong>
              {diagnosing ? ' — asking AI for diagnosis…' : aiDiagnosis ? ' — see steps below' : ''}
            </p>
            {diagnosing && <RefreshCw size={10} className="animate-spin text-blue-400 ml-auto shrink-0" />}
          </div>
          {(diagnosing || aiDiagnosis) && (
            <div className="border-t border-red-100 dark:border-red-800/30 px-3 py-2.5">
              {diagnosing && !aiDiagnosis && (
                <div className="flex items-center gap-2">
                  <RefreshCw size={10} className="animate-spin text-blue-400" />
                  <span className="text-[11px] text-blue-500 dark:text-blue-400">Analyzing issue with AI…</span>
                </div>
              )}
              {aiDiagnosis && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wide">AI Diagnosis</p>
                  <div className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{aiDiagnosis}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function VpnStatusBanner({ linkedConn, isVpn, mcpUrl, env }) {
  const [checking, setChecking] = useState(false);
  const [infra, setInfra] = useState(null); // null | { vm, vpn, sap }

  async function checkAll() {
    const base = (mcpUrl ?? '').trim().replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    setChecking(true);
    setInfra(null);
    let vm = false, vpn = false, sap = false;

    // 1. VM + VPN via /status
    if (base) {
      try {
        const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { const d = await res.json(); vm = true; vpn = d.vpn === true; }
        else if (res.status === 404) {
          const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
          if (h?.ok) { vm = true; vpn = null; }
        }
      } catch { /* vm stays false */ }
    }

    // 2. SAP connection check (only if we have credentials)
    if (env?.host && env?.username && env?.password) {
      try {
        const result = await sapLiveCheck(env);
        sap = !result?.error;
      } catch { sap = false; }
    }

    setInfra({ vm, vpn, sap });
    setChecking(false);
  }

  const dot = (val, label) => (
    <span className="flex items-center gap-1 text-xs">
      {val === true  ? <CheckCircle2 size={12} className="text-green-500" />
       : val === false ? <XCircle size={12} className="text-red-400" />
       : <AlertTriangle size={12} className="text-gray-300" />}
      <span className={val === true ? 'text-green-700 dark:text-green-400' : val === false ? 'text-red-500' : 'text-gray-400'}>{label}</span>
    </span>
  );

  return (
    <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
      <Activity size={13} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {isVpn ? (
          <span>
            Connect via <strong>{linkedConn.meta?.conn_name || 'VPN'}</strong>
            {linkedConn.meta?.remote_gateway ? <> — gateway: <strong>{linkedConn.meta.remote_gateway}</strong></> : ''}
            {linkedConn.meta?.vpn_client ? ` (${linkedConn.meta.vpn_client})` : ''} before testing.
          </span>
        ) : (
          <span>Using <strong>{linkedConn.db_type.toUpperCase()}</strong> connection at <strong>{linkedConn.host}</strong>.</span>
        )}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <button
            onClick={checkAll}
            disabled={checking}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:border-blue-400 disabled:opacity-50 transition-all"
          >
            {checking ? <RefreshCw size={10} className="animate-spin" /> : <Activity size={10} />}
            Check connection
          </button>
          {infra && (
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-700 rounded-md px-2 py-0.5">
              {dot(infra.vm,  'VM')}
              {isVpn && dot(infra.vpn, infra.vpn === null ? 'VPN?' : 'VPN')}
              {dot(infra.sap, 'SAP')}
            </div>
          )}
        </div>
      </div>
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
  const [adtWarnings, setAdtWarnings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [infraChecks, setInfraChecks] = useState({}); // { [envId]: { checking, vm, vpn, sap } }

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


  async function checkInfra(env, e) {
    e.stopPropagation();
    const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
    const isVpn = linkedConn?.db_type === 'vpn';
    const mcpUrl = (env.mcp_server_url?.trim() || ssCtx.settings['sap_mcp_server_url'] || '').trim().replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    setInfraChecks(p => ({ ...p, [env.id]: { checking: true } }));
    let vm = false, vpn = null, sap = false;
    if (mcpUrl) {
      try {
        const res = await fetch(mcpUrl + '/status', { signal: AbortSignal.timeout(8000) });
        if (res.ok) { const d = await res.json(); vm = true; vpn = isVpn ? d.vpn === true : null; }
        else if (res.status === 404) {
          const h = await fetch(mcpUrl + '/health', { signal: AbortSignal.timeout(5000) }).catch(() => null);
          if (h?.ok) { vm = true; }
        }
      } catch { /* vm stays false */ }
    }
    if (env.host && env.username && env.password) {
      try {
        const enriched = enrichEnvWithVpn(env);
        const sapCfg = mcpUrl && !enriched.proxyUrl?.trim() && !enriched._vpnProxyUrl
          ? { ...enriched, proxyUrl: `${mcpUrl}/sap-proxy` }
          : enriched;
        const r = await sapLiveCheck(sapCfg);
        sap = r && r.error == null;
      } catch { sap = false; }
    }
    setInfraChecks(p => ({ ...p, [env.id]: { checking: false, vm, vpn, sap, isVpn } }));
  }

  async function testConnection(env) {
    setTestStates(p => ({ ...p, [env.id]: 'testing' }));
    setTestErrors(p => ({ ...p, [env.id]: null }));
    setAdtWarnings(p => ({ ...p, [env.id]: null }));
    try {
      const enriched = enrichEnvWithVpn(env);
      const effectiveProxy = enriched.proxyUrl?.trim() || enriched._vpnProxyUrl;
      const result = await sapLiveCheck(enriched);
      if (result && !result.error) {
        setTestStates(p => ({ ...p, [env.id]: 'ok' }));
        if (env.type === 'ecc') setAdtWarnings(p => ({ ...p, [env.id]: 'active' }));
      } else {
        setTestStates(p => ({ ...p, [env.id]: 'fail' }));
        const status = result?.error;
        if (env.type === 'ecc' && status === 404) setAdtWarnings(p => ({ ...p, [env.id]: 'inactive' }));
        if (env.type === 'ecc' && status === 403) setAdtWarnings(p => ({ ...p, [env.id]: 'no_auth' }));
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
                    {/* Infra status dots */}
                    {(() => {
                      const ic = infraChecks[env.id];
                      if (!ic || ic.checking) return (
                        ic?.checking
                          ? <RefreshCw size={12} className="animate-spin text-gray-400 flex-shrink-0" />
                          : null
                      );
                      const dot = (val) => val === true
                        ? <CheckCircle2 size={12} className="text-green-500" />
                        : val === false
                        ? <XCircle size={12} className="text-red-400" />
                        : <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />;
                      return (
                        <span className="flex items-center gap-1 flex-shrink-0 ml-1" title="VM / VPN / SAP">
                          {dot(ic.vm)}{ic.isVpn && dot(ic.vpn)}{dot(ic.sap)}
                        </span>
                      );
                    })()}
                    <button onClick={e => checkInfra(env, e)}
                      title="Check VM, VPN and SAP connection"
                      className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                      <Activity size={13} />
                    </button>
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
                            <div className="relative">
                              <input type={showPasswords[env.id] ? 'text' : 'password'} value={env.password} onChange={e => updateEnvField(env.id, 'password', e.target.value)} disabled={!canEdit}
                                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100"
                                autoComplete="new-password" />
                              <button type="button" onClick={() => setShowPasswords(p => ({ ...p, [env.id]: !p[env.id] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                {showPasswords[env.id] ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                              </button>
                            </div>
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
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            SAP MCP Server URL <span className="text-gray-400 font-normal">(optional — overrides global setting)</span>
                          </label>
                          <div className="flex gap-2 items-center">
                            <input value={env.mcp_server_url ?? ''} onChange={e => updateEnvField(env.id, 'mcp_server_url', e.target.value)} disabled={!canEdit}
                              placeholder={ssCtx.settings['sap_mcp_server_url'] ? `Global: ${ssCtx.settings['sap_mcp_server_url']}` : 'https://your-mcp-server.trycloudflare.com'}
                              className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500" />
                            <McpRestartButton mcpUrl={env.mcp_server_url?.trim() || ssCtx.settings['sap_mcp_server_url']} />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Leave blank to use the global MCP server URL from AI Configuration settings.</p>
                          {/* Detailed infra status check */}
                          <EnvInfraStatusCard env={env} enrichEnvWithVpn={enrichEnvWithVpn} projectConns={projectConns} globalMcpUrl={ssCtx.settings['sap_mcp_server_url']} onUpdateMcpUrl={(url) => updateEnvField(env.id, 'mcp_server_url', url)} />
                        </div>
                      </div>

                      {/* VPN / connection banner */}
                      {(() => {
                        const linkedConn = env.connectionId ? projectConns.find(c => c.id === env.connectionId) : null;
                        if (!linkedConn) return null;
                        const isVpn = linkedConn.db_type === 'vpn';
                        const effectiveMcpUrl = env.mcp_server_url?.trim() || ssCtx.settings['sap_mcp_server_url'];
                        return <VpnStatusBanner linkedConn={linkedConn} isVpn={isVpn} mcpUrl={effectiveMcpUrl} env={enrichEnvWithVpn(env)} />;
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
                          {env.type === 'ecc' && adtWarnings[env.id] === 'active' && (
                            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-xs text-green-700 dark:text-green-300">
                              <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
                              <span><strong>ADT is active</strong> on this ECC system — auto-implementation and Auto Config will work.</span>
                            </div>
                          )}
                          {env.type === 'ecc' && adtWarnings[env.id] === 'inactive' && (
                            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
                              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                              <span><strong>ADT is not activated</strong> on this ECC system. Auto-implementation and Auto Config will fall back to manual SE38 steps.<br />
                              To enable: open <strong>SICF</strong>, activate service path <strong>/sap/bc/adt</strong> and all sub-nodes, then assign auth object <strong>S_ADT_ALL</strong> to your SAP user.</span>
                            </div>
                          )}
                          {env.type === 'ecc' && adtWarnings[env.id] === 'no_auth' && (
                            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
                              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                              <span><strong>ADT is active</strong> but this user lacks authorization. Assign auth object <strong>S_ADT_ALL</strong> (or role <strong>SAP_BC_DWB_ABAPDEVELOPER</strong>) in SU01/PFCG.</span>
                            </div>
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
  { id: 'config',      label: 'Customizing',     desc: 'SPRO / IMG configuration',   headerCls: 'bg-orange-50 dark:bg-orange-900/30 border-b-2 border-orange-200 dark:border-orange-800', bodyCls: 'bg-orange-50/40 dark:bg-orange-900/20', textCls: 'text-orange-700 dark:text-orange-300' },
  { id: 'dictionary',  label: 'Data Dictionary', desc: 'Tables, structures, domains', headerCls: 'bg-violet-50 dark:bg-violet-900/30 border-b-2 border-violet-200 dark:border-violet-800', bodyCls: 'bg-violet-50/40 dark:bg-violet-900/20', textCls: 'text-violet-700 dark:text-violet-300' },
  { id: 'development', label: 'Development',     desc: 'Programs, classes, FMs',      headerCls: 'bg-blue-50 dark:bg-blue-900/30 border-b-2 border-blue-200 dark:border-blue-800',       bodyCls: 'bg-blue-50/40 dark:bg-blue-900/20',     textCls: 'text-blue-700 dark:text-blue-300'     },
  { id: 'integration', label: 'Integration',     desc: 'RFCs, BAPIs, OData',         headerCls: 'bg-cyan-50 dark:bg-cyan-900/30 border-b-2 border-cyan-200 dark:border-cyan-800',       bodyCls: 'bg-cyan-50/40 dark:bg-cyan-900/20',     textCls: 'text-cyan-700 dark:text-cyan-300'     },
  { id: 'enhancement', label: 'Enhancement',     desc: 'BAdIs, user exits',           headerCls: 'bg-amber-50 dark:bg-amber-900/30 border-b-2 border-amber-200 dark:border-amber-800',  bodyCls: 'bg-amber-50/40 dark:bg-amber-900/20',   textCls: 'text-amber-700 dark:text-amber-300'   },
  { id: 'ui',          label: 'UI / Output',     desc: 'Reports, forms, Fiori',       headerCls: 'bg-pink-50 dark:bg-pink-900/30 border-b-2 border-pink-200 dark:border-pink-800',     bodyCls: 'bg-pink-50/40 dark:bg-pink-900/20',     textCls: 'text-pink-700 dark:text-pink-300'     },
];

const BP_TYPES = {
  config:         { label: 'Customizing (SPRO)', short: 'CFG',  ai: false, phase: 'config'      },
  table:          { label: 'Table',              short: 'TABL', ai: false, phase: 'dictionary'  },
  structure:      { label: 'Structure',          short: 'STRU', ai: false, phase: 'dictionary'  },
  domain:         { label: 'Domain',             short: 'DOMA', ai: false, phase: 'dictionary'  },
  data_element:   { label: 'Data Element',       short: 'DTEL', ai: false, phase: 'dictionary'  },
  message_class:  { label: 'Message Class',      short: 'MSG',  ai: false, phase: 'dictionary'  },
  program:        { label: 'Program',            short: 'PROG', ai: true,  phase: 'development' },
  include:        { label: 'Include',            short: 'INCL', ai: true,  phase: 'development' },
  class:          { label: 'Class',              short: 'CLAS', ai: true,  phase: 'development' },
  function_module:{ label: 'Function Module',    short: 'FM',   ai: true,  phase: 'development' },
  bapi:           { label: 'BAPI / RFC',         short: 'RFC',  ai: true,  phase: 'integration' },
  odata:          { label: 'OData Service',      short: 'ODATA',ai: false, phase: 'integration' },
  badi:           { label: 'BAdI Impl',          short: 'BADI', ai: true,  phase: 'enhancement' },
  enhancement:    { label: 'Enhancement',        short: 'ENHO', ai: true,  phase: 'enhancement' },
  report:         { label: 'Report (ALV)',        short: 'RPT',  ai: true,  phase: 'ui'          },
  smartform:      { label: 'SmartForm',          short: 'SF',   ai: false, phase: 'ui'          },
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
                placeholder={form.type === 'config' ? 'PAYMENT_TERMS_CONFIG' : 'ZPROG_ORDER'}
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
          {form.type === 'config' ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-800 leading-relaxed">
              <strong>Customizing (SPRO/IMG)</strong> — configured manually in DEV via transaction SPRO. No ABAP code is generated. SAP creates the customizing transport automatically. Use the <strong>Transports tab</strong> to move it to QA/PRD.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="bp-ai" checked={form.aiCapable} onChange={e => f('aiCapable', e.target.checked)}
                className="rounded" />
              <label htmlFor="bp-ai" className="text-sm text-gray-700">AI can generate ABAP code</label>
            </div>
          )}
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

function SapBlueprintCanvas({ caseData, auth, activities, sapConfig, autoImplEnabled, genModel, transportReq, ssCtx, configOps }) {
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
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const containerRef = useRef(null);
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
  const [reviewerUserId, setReviewerUserId] = useState(null);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerAvatar, setReviewerAvatar] = useState(null);
  const [reviewerInput, setReviewerInput] = useState('');
  const [reviewerLookup, setReviewerLookup] = useState(null); // null | 'searching' | { found, user, isFunctional }
  const reviewerDebounce = useRef(null);
  const [reviewerSaving, setReviewerSaving] = useState(false);
  const [parentConsultant, setParentConsultant] = useState(null);
  const [approvalLinkCopied, setApprovalLinkCopied] = useState(false);
  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [syncingReviews, setSyncingReviews] = useState(false);
  const [syncedCount, setSyncedCount] = useState(null);

  // NL → Blueprint
  const [showNlModal, setShowNlModal] = useState(false);
  const [nlText, setNlText] = useState('');
  const [nlGenerating, setNlGenerating] = useState(false);

  // Load reviewer info on mount
  useEffect(() => {
    async function loadReviewer() {
      const { data: c } = await supabase
        .from('cases')
        .select('reviewer_email, reviewer_user_id, reviewer_name, parent_case_id')
        .eq('id', caseId)
        .single();
      if (!c) return;
      if (c.reviewer_email) setReviewerEmail(c.reviewer_email);
      if (c.reviewer_user_id) setReviewerUserId(c.reviewer_user_id);
      if (c.reviewer_user_id) {
        const { data: u } = await supabase.from('users').select('full_name, avatar_url').eq('id', c.reviewer_user_id).single();
        if (u?.full_name && !c.reviewer_name) setReviewerName(u.full_name);
        if (u?.avatar_url) setReviewerAvatar(u.avatar_url);
      }
      if (c.reviewer_name) setReviewerName(c.reviewer_name);
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

  function handleReviewerInputChange(val) {
    setReviewerInput(val);
    setReviewerLookup(null);
    clearTimeout(reviewerDebounce.current);
    const clean = val.trim().toLowerCase();
    if (!clean.includes('@') || !clean.includes('.')) return;
    reviewerDebounce.current = setTimeout(async () => {
      setReviewerLookup('searching');
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email, role, avatar_url')
        .eq('email', clean)
        .maybeSingle();
      if (!data) { setReviewerLookup({ found: false }); return; }
      const FUNCTIONAL = ['key_user', 'project_manager', 'internal_consultant'];
      setReviewerLookup({ found: true, user: data, isFunctional: FUNCTIONAL.includes(data.role) });
    }, 500);
  }

  async function saveReviewer() {
    const email = reviewerInput.trim().toLowerCase();
    if (!email) return;
    setReviewerSaving(true);
    const userId = (reviewerLookup?.found && reviewerLookup?.isFunctional)
      ? reviewerLookup.user.id
      : null;
    const name = reviewerLookup?.user?.full_name ?? null;
    await supabase.from('cases').update({
      reviewer_email: email,
      reviewer_user_id: userId,
      reviewer_name: name,
    }).eq('id', caseId);
    setReviewerEmail(email);
    setReviewerUserId(userId);
    setReviewerName(reviewerLookup?.user?.full_name ?? '');
    setReviewerAvatar(reviewerLookup?.user?.avatar_url ?? null);

    // Add platform reviewer to case_key_users so they can access the case
    if (userId) {
      const { error: ckuErr } = await supabase.from('case_key_users')
        .upsert(
          { case_id: caseId, user_id: userId, area: 'reviewer' },
          { onConflict: 'case_id,user_id' }
        );
      if (ckuErr) console.warn('case_key_users upsert:', ckuErr.message, ckuErr.details);
    }

    setReviewerInput('');
    setReviewerLookup(null);
    setReviewerSaving(false);
  }

  async function generateApprovalLink() {
    const email = parentConsultant?.email ?? reviewerEmail;
    if (!email) return;
    setGenLinkLoading(true);
    try {
      // Look for any existing request for this case (any status)
      let { data: existing } = await supabase
        .from('approval_requests')
        .select('id, token, status')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const reviewerMeta = {
        reviewer_email: email,
        reviewer_name: reviewerName || null,
        reviewer_avatar_url: reviewerAvatar || null,
      };

      if (existing && existing.status !== 'pending') {
        // Reactivate it — reset to pending and refresh expiry
        await supabase
          .from('approval_requests')
          .update({
            ...reviewerMeta,
            status: 'pending',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', existing.id);
      } else if (existing) {
        // Update reviewer info in case it changed
        await supabase.from('approval_requests').update(reviewerMeta).eq('id', existing.id);
      }

      if (!existing) {
        const { data: created, error: insErr } = await supabase
          .from('approval_requests')
          .insert({ ...reviewerMeta, case_id: caseId, project_id: caseData.project_id ?? null })
          .select('id, token, status')
          .single();
        if (insErr) { alert('Could not create review link: ' + insErr.message); return; }
        existing = created;
      }

      if (!existing?.token) { alert('Review link generation failed — no token returned.'); return; }

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
    } catch (e) {
      alert('Review link error: ' + e.message);
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

    const prompt = `You are an SAP architect. Analyze this implementation case and suggest ALL SAP objects needed — both custom ABAP development AND SPRO/IMG customizing configuration.

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? 'general'}
Activities: ${activities.slice(0, 15).map(a => a.title).join(', ')}

Include BOTH:
1. ABAP development objects (programs, classes, BAdIs, tables, etc.)
2. Customizing/SPRO objects (type "config") — any IMG setting, parameter, movement type, account key, payment term, plant config, etc. that needs to be created or adjusted.

For config objects: use a short uppercase descriptor as name (e.g. MT_901, PAYMENT_TERMS_30D, PLANT_CONFIG_1000). Include the source entry to copy from in the description if applicable.

Return ONLY a valid JSON array (no markdown, no explanation). Each object must have:
- name: string
- type: one of [${Object.keys(BP_TYPES).join(', ')}]
- phase: one of [config, dictionary, development, integration, enhancement, ui]
- description: string (for config: describe what to configure and source key if copying)
- aiCapable: boolean (always false for type "config")
- dependsOn: array of names of other objects in this list this depends on

Suggest 5-15 objects covering the full scope.`;

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
          phase: (item.phase && BP_PHASES.some(p => p.id === item.phase)) ? item.phase : (BP_TYPES[item.type]?.phase ?? 'development'),
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

  async function handleNlGenerate() {
    if (!nlText.trim()) return;
    setNlGenerating(true);
    const prompt = `You are an SAP architect. Based on this description, generate a complete set of SAP implementation objects needed.

Description: ${nlText}
SAP Module context: ${caseData.area_sap ?? 'general'}

Return ONLY a valid JSON array (no markdown, no explanation). Each object must have:
- name: string (short uppercase identifier, e.g. ZMM_PROC_REPORT, MT_901, PAYMENT_TERMS_30D)
- type: one of [${Object.keys(BP_TYPES).join(', ')}]
- phase: one of [config, dictionary, development, integration, enhancement, ui]
- description: string
- aiCapable: boolean (always false for type "config")
- dependsOn: array of names of other objects in this list this depends on

Suggest 5-15 objects covering the full scope of the described solution.`;
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
          phase: (item.phase && BP_PHASES.some(p => p.id === item.phase)) ? item.phase : (BP_TYPES[item.type]?.phase ?? 'development'),
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
      parsed.forEach((item, i) => {
        if (item.dependsOn?.length) {
          newObjs[i].dependsOn = item.dependsOn.map(n => nameToId[n]).filter(Boolean);
        }
      });
      const prevAiObjs = objects.filter(o => o.aiSuggested);
      const kept = prevAiObjs.length > 0 ? objects.filter(o => !o.aiSuggested) : [];
      const next = [...newObjs, ...kept];
      setObjects(next);
      await saveBlueprint(next);
      setShowNlModal(false);
      setNlText('');
    } catch (e) {
      alert('Generation failed: ' + e.message);
    } finally {
      setNlGenerating(false);
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
          max_tokens: 8000,
          mcp_servers: buildSapMcpConfig(sapConfig, sapConfig?.mcp_server_url?.trim() || ssCtx.settings['sap_mcp_server_url']),
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
    setShowModal(false);
  }

  function handleDelete(id) {
    const next = objects.filter(o => o.id !== id);
    setObjects(next);
    saveBlueprint(next);
    if (selectedId === id) setSelectedId(null);
  }

  const selectedObj = objects.find(o => o.id === selectedId);

  // Compute highlighted chain for hovered node (upstream + downstream)
  const hoveredChain = (() => {
    if (!hoveredId) return null;
    const upstream = new Set();
    const downstream = new Set();
    function findUp(id) { objects.find(o => o.id === id)?.dependsOn?.forEach(d => { upstream.add(d); findUp(d); }); }
    function findDown(id) { objects.filter(o => (o.dependsOn ?? []).includes(id)).forEach(o => { downstream.add(o.id); findDown(o.id); }); }
    findUp(hoveredId); findDown(hoveredId);
    return { upstream, downstream };
  })();

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
              <button onClick={() => setShowNlModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                <Sparkles size={11} />From Description
              </button>
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
        <div className="px-4 py-2 border-b border-white/10 flex items-center gap-3 flex-wrap text-xs">
          <Mail size={12} className="text-indigo-400 flex-shrink-0" />
          <span className="font-medium text-gray-400 flex-shrink-0">Reviewer:</span>

          {/* Inherited from parent case */}
          {parentConsultant ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/30 rounded-lg text-indigo-300 font-medium">
              {parentConsultant.full_name} · {parentConsultant.email}
              <span className="text-[10px] text-indigo-400/60 font-normal ml-0.5">(inherited)</span>
            </span>
          ) : reviewerEmail ? (
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-medium ${
              reviewerUserId
                ? 'bg-green-500/15 border border-green-500/30 text-green-300'
                : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
            }`}>
              {reviewerUserId && reviewerAvatar ? (
                <img src={reviewerAvatar} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
              ) : reviewerUserId ? (
                <span className="w-4 h-4 rounded-full bg-green-500/40 flex items-center justify-center text-[9px] font-bold text-green-200 flex-shrink-0">
                  {(reviewerName || reviewerEmail).charAt(0).toUpperCase()}
                </span>
              ) : null}
              {reviewerUserId && reviewerName ? reviewerName : reviewerEmail}
              <span className="text-[10px] font-normal opacity-60 ml-0.5">
                {reviewerUserId ? '· in-app' : '· external link'}
              </span>
            </span>
          ) : reviewerInput !== undefined ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={reviewerInput}
                  onChange={e => handleReviewerInputChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveReviewer()}
                  placeholder="reviewer@email.com"
                  className="text-xs border border-white/20 bg-white/5 text-white/80 placeholder-white/25 rounded-lg px-2 py-0.5 w-48 focus:outline-none focus:border-indigo-400/60"
                />
                <button
                  onClick={saveReviewer}
                  disabled={reviewerSaving || !reviewerInput.trim() || reviewerLookup === 'searching'}
                  className="px-2 py-0.5 text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/30 disabled:opacity-40 transition-colors">
                  {reviewerSaving ? '…' : 'Save'}
                </button>
              </div>
              {/* Lookup feedback */}
              {reviewerLookup === 'searching' && (
                <span className="text-[10px] text-white/30 flex items-center gap-1">
                  <Loader2 size={9} className="animate-spin" />Checking…
                </span>
              )}
              {reviewerLookup?.found && reviewerLookup.isFunctional && (
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <Check size={9} />{reviewerLookup.user.full_name} · on platform — will see this in-app
                </span>
              )}
              {reviewerLookup?.found && !reviewerLookup.isFunctional && (
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  ⚠ {reviewerLookup.user.full_name} is on the platform but has role <strong>{reviewerLookup.user.role}</strong> — not a functional reviewer. They'll receive an external link instead.
                </span>
              )}
              {reviewerLookup?.found === false && (
                <span className="text-[10px] text-blue-400/60 flex items-center gap-1">
                  Not on platform — you'll share an external review link with them
                </span>
              )}
            </div>
          ) : null}

          {/* Change reviewer */}
          {reviewerEmail && !parentConsultant && (
            <button
              onClick={() => { setReviewerEmail(''); setReviewerInput(''); }}
              className="text-white/30 hover:text-white/60 transition-colors text-[10px] underline">
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
                  ? 'bg-green-500/20 border-green-500/30 text-green-300'
                  : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
              }`}>
              {approvalLinkCopied ? <><Check size={11} />Copied!</> : <><Link2 size={11} />{genLinkLoading ? 'Generating…' : 'Copy Review Link'}</>}
            </button>
          )}

          {/* Sync reviews back from reviewer decisions */}
          {objects.some(o => o.approval_status === 'pending_review') && (
            <button
              onClick={syncReviews}
              disabled={syncingReviews}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-white/15 text-white/40 rounded-lg hover:bg-white/5 hover:text-white/60 transition-colors disabled:opacity-40">
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
              {/* Phase swim lanes */}
              <div className="flex gap-0 min-w-max">
                {BP_PHASES.map(phase => {
                  const phaseObjs = objects
                    .filter(o => o.phase === phase.id)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  if (phaseObjs.length === 0) return null;
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
                              onClick={() => setSelectedId(isSelected ? null : obj.id)}
                              onMouseEnter={() => setHoveredId(obj.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              style={{ transition: 'opacity .15s, box-shadow .15s, transform .1s' }}
                              className={`w-52 rounded-xl border-2 p-2.5 cursor-pointer select-none ${BP_STATUS_STYLE[obj.status] ?? BP_STATUS_STYLE.planned} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${checkedIds.has(obj.id) ? 'outline outline-2 outline-blue-500 outline-offset-1' : ''} ${
                                hoveredChain
                                  ? obj.id === hoveredId
                                    ? 'shadow-lg scale-[1.02] ring-2 ring-blue-400 ring-offset-1'
                                    : (hoveredChain.upstream.has(obj.id) || hoveredChain.downstream.has(obj.id))
                                      ? 'shadow-md ring-1 ring-indigo-300'
                                      : 'opacity-35'
                                  : 'hover:shadow-md'
                              }`}>
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
                                    {obj.aiCapable ? <Sparkles size={9} /> : <Settings size={9} />}
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
                  <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">{BP_TYPES[selectedObj.type]?.label ?? selectedObj.type} · {selectedObj.phase} · {selectedObj.aiCapable ? <><Sparkles size={10} /> AI-capable</> : <><Settings size={10} /> Manual</>}</p>
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
                <details className="mt-3 pt-3 border-t border-white/10">
                  <summary className="text-xs font-semibold text-white/40 uppercase tracking-wide cursor-pointer select-none mb-1">
                    Auto-generated ABAP Code
                  </summary>
                  <pre className="bg-black/40 text-green-300 text-xs rounded-xl p-3 overflow-x-auto max-h-56 leading-relaxed mt-2">
                    {selectedObj.generatedCode}
                  </pre>
                </details>
              )}

              {/* Non-config object tools — Creation Guide + ADT Code (manual only) or pending note (AI-capable) */}
              {selectedObj.type !== 'config' && configOps && (() => {
                const { manualSpecs, setManualSpecs, onGenerateCreationGuide, onGenerateAdtCode } = configOps;
                const specState = manualSpecs[selectedObj.id] ?? {};
                const canAdt = ADT_CODE_TYPES.has(selectedObj.type);
                const isAiCapable = selectedObj.aiCapable ?? BP_TYPES[selectedObj.type]?.ai ?? true;
                const abapTab = specState._abapTab ?? 'guide';
                const setTab = (v) => setManualSpecs(p => ({ ...p, [selectedObj.id]: { ...(p[selectedObj.id] ?? {}), _abapTab: v } }));

                if (isAiCapable && !selectedObj.generatedCode) {
                  return (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                        <Sparkles size={12} className="flex-shrink-0 mt-0.5" />
                        <span>Code will be <strong>auto-generated</strong> when the implementation pipeline runs. Once generated it will appear here. Resolve any dependency objects first.</span>
                      </div>
                    </div>
                  );
                }

                if (isAiCapable) return null;

                return (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex gap-0 border-b border-white/10 mb-3">
                      {[
                        ['guide', 'Creation Guide'],
                        ...(canAdt ? [['adt', 'ADT Code']] : []),
                      ].map(([k, lbl]) => (
                        <button key={k} onClick={() => setTab(k)}
                          className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors
                            ${abapTab === k ? 'border-amber-400 text-amber-300' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    {abapTab === 'guide' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Step-by-step SAP creation instructions</span>
                          <button onClick={() => onGenerateCreationGuide(selectedObj)} disabled={specState.generating}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-colors">
                            <Sparkles size={11} />{specState.generating ? 'Generating…' : specState.spec ? 'Regenerate' : 'Generate Steps'}
                          </button>
                        </div>
                        {specState.error && <p className="text-xs text-red-400">Error: {specState.error}</p>}
                        {specState.spec
                          ? <pre className="text-xs text-white/80 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-white/10 rounded-lg p-3 max-h-[28rem] overflow-y-auto">{specState.spec}</pre>
                          : !specState.generating && <p className="text-xs text-white/30">Click "Generate Steps" for AI-written creation instructions.</p>}
                      </div>
                    )}

                    {abapTab === 'adt' && canAdt && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Paste into Eclipse ADT to create this object</span>
                          <div className="flex gap-2">
                            {specState.adtCode && (
                              <button onClick={() => navigator.clipboard?.writeText(specState.adtCode)}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-white/10 text-white/50 border border-white/15 hover:bg-white/15">
                                <Copy size={9}/>Copy
                              </button>
                            )}
                            <button onClick={() => onGenerateAdtCode(selectedObj)} disabled={specState.generatingAdt}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 transition-colors">
                              <Sparkles size={11} />{specState.generatingAdt ? 'Generating…' : specState.adtCode ? 'Regenerate' : 'Generate Code'}
                            </button>
                          </div>
                        </div>
                        {specState.adtError && <p className="text-xs text-red-400">Error: {specState.adtError}</p>}
                        {specState.adtCode
                          ? <pre className="text-xs text-green-200 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-green-500/20 rounded-lg p-3 max-h-72 overflow-y-auto">{specState.adtCode}</pre>
                          : !specState.generatingAdt && <p className="text-xs text-white/30">Click "Generate Code" for ADT-ready source to paste in Eclipse.</p>}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Config object tools — SPRO Guide, BCset, Auto Config */}
              {selectedObj.type === 'config' && configOps && (() => {
                const { manualSpecs, setManualSpecs, saveSpecs, bcsetSysType, setBcsetSysType,
                        onGenerateSpro, onGenerateBcset, onGenerateConfigScript,
                        onApplyConfigScript, onRunConfigScript } = configOps;
                const specState = manualSpecs[selectedObj.id] ?? {};
                const cfgTab = specState._cfgTab ?? 'spro';
                const setTab = (v) => setManualSpecs(p => ({ ...p, [selectedObj.id]: { ...(p[selectedObj.id] ?? {}), _cfgTab: v } }));
                return (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {/* Tab row */}
                    <div className="flex gap-0 border-b border-white/10 mb-3">
                      {[
                        ['spro',       'SPRO Guide'],
                        ['bcset',      'BCset'],
                        ...(sapConfig?.host ? [['autoconfig', 'Auto Config']] : []),
                      ].map(([k, lbl]) => (
                        <button key={k} onClick={() => setTab(k)}
                          className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors
                            ${cfgTab === k ? 'border-amber-400 text-amber-300' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    {/* SPRO Guide */}
                    {cfgTab === 'spro' && (
                      <div className="space-y-2">
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                          Customizing done manually in DEV via SPRO/IMG. SAP creates the transport automatically.
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">IMG path · direct t-code · field values</span>
                          <button onClick={() => onGenerateSpro(selectedObj)} disabled={specState.generating}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-colors">
                            <Sparkles size={11} />{specState.generating ? 'Generating…' : specState.spec ? 'Regenerate' : 'Generate SPRO Path'}
                          </button>
                        </div>
                        {specState.error && <p className="text-xs text-red-400">Error: {specState.error}</p>}
                        {specState.spec
                          ? <pre className="text-xs text-white/80 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-white/10 rounded-lg p-3 max-h-[28rem] overflow-y-auto">{specState.spec}</pre>
                          : !specState.generating && <p className="text-xs text-white/30">Click "Generate SPRO Path" for the exact IMG route, direct t-code, and field values.</p>}
                      </div>
                    )}

                    {/* BCset */}
                    {cfgTab === 'bcset' && (
                      <div className="space-y-2">
                        <div className="flex gap-1 mb-1">
                          {[['ecc','ECC 6.0'],['s4_onprem','S/4HANA On-Prem'],['s4_cloud','S/4HANA Cloud']].map(([val,lbl]) => (
                            <button key={val} onClick={() => setBcsetSysType(val)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all
                                ${bcsetSysType === val ? 'border-violet-400 bg-violet-500/20 text-violet-300' : 'border-white/15 text-white/30 hover:border-white/30 hover:text-white/60'}`}>
                              {lbl}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2.5 py-1.5">
                          {bcsetSysType === 's4_cloud'
                            ? 'S/4HANA Cloud uses Central Business Configuration (CBC) — BCsets don\'t exist.'
                            : 'BCsets activate via SCPR20 and write directly to customizing tables.'}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">{bcsetSysType === 's4_cloud' ? 'Scope item · CBC path' : 'BCset name · SCPR20 steps'}</span>
                          <div className="flex gap-2">
                            {specState.bcsetInfo && <button onClick={() => navigator.clipboard?.writeText(specState.bcsetInfo)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-white/10 text-white/50 border border-white/15 hover:bg-white/15"><Copy size={9}/>Copy</button>}
                            <button onClick={() => onGenerateBcset(selectedObj)} disabled={specState.generatingBcset}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50 transition-colors">
                              <Sparkles size={11} />{specState.generatingBcset ? 'Generating…' : specState.bcsetInfo ? 'Regenerate' : bcsetSysType === 's4_cloud' ? 'Find Scope Item' : 'Find BCset'}
                            </button>
                          </div>
                        </div>
                        {specState.bcsetError && <p className="text-xs text-red-400">Error: {specState.bcsetError}</p>}
                        {specState.bcsetInfo
                          ? <pre className="text-xs text-violet-200 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-violet-500/20 rounded-lg p-3 max-h-72 overflow-y-auto">{specState.bcsetInfo}</pre>
                          : !specState.generatingBcset && <p className="text-xs text-white/30">{bcsetSysType === 's4_cloud' ? 'Find CBC scope item and activation path.' : 'Find BCset name and SCPR20 steps.'}</p>}
                      </div>
                    )}

                    {/* Auto Config */}
                    {cfgTab === 'autoconfig' && sapConfig?.host && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 mb-2">
                          {[{n:1,label:'Generate',done:!!specState.configScript},{n:2,label:'Write to SAP',done:!!specState.appliedScript},{n:3,label:'Execute',done:!!specState.scriptExecuted}].map((s,i,arr) => (
                            <div key={s.n} className="flex items-center gap-1">
                              <span className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${s.done ? 'bg-green-500 text-white' : 'bg-white/10 text-white/30'}`}>{s.done ? '✓' : s.n}</span>
                              <span className={`text-[10px] ${s.done ? 'text-green-400' : 'text-white/30'}`}>{s.label}</span>
                              {i < arr.length-1 && <span className="text-white/20 text-[10px]">→</span>}
                            </div>
                          ))}
                          {bcsetSysType === 's4_cloud' && <span className="ml-auto text-[9px] text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full border border-violet-500/30">Cloud</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">{bcsetSysType === 's4_cloud' ? 'OData API or CBC guide' : 'ABAP report for customizing automation'}</span>
                          <div className="flex gap-2">
                            {specState.configScript && <button onClick={() => navigator.clipboard?.writeText(specState.configScript)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-white/10 text-white/50 border border-white/15 hover:bg-white/15"><Copy size={9}/>Copy</button>}
                            <button onClick={() => onGenerateConfigScript(selectedObj)} disabled={specState.generatingScript}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50 transition-colors">
                              <Sparkles size={11} />{specState.generatingScript ? 'Generating…' : specState.configScript ? 'Regenerate' : bcsetSysType === 's4_cloud' ? 'Generate Cloud Guide' : 'Generate ABAP Script'}
                            </button>
                          </div>
                        </div>
                        {specState.scriptError && <p className="text-xs text-red-400">Error: {specState.scriptError}</p>}
                        {specState.configScript && (
                          <pre className="text-xs text-green-200 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-green-500/20 rounded-lg p-3 max-h-56 overflow-y-auto">{specState.configScript}</pre>
                        )}
                        {specState.configScript && bcsetSysType !== 's4_cloud' && (
                          <div className="flex items-center gap-2 pt-1">
                            <button onClick={() => onApplyConfigScript(selectedObj)} disabled={specState.applyingScript || specState.appliedScript}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 transition-colors">
                              <Upload size={11} />{specState.applyingScript ? 'Writing…' : specState.appliedScript ? '✓ Written to SAP' : 'Write to SAP'}
                            </button>
                            {specState.appliedScript && (
                              <button onClick={() => onRunConfigScript(selectedObj)} disabled={specState.runningScript || specState.scriptExecuted}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-40 transition-colors">
                                <Play size={11} />{specState.runningScript ? 'Running…' : specState.scriptExecuted ? '✓ Executed' : 'Run on SAP'}
                              </button>
                            )}
                          </div>
                        )}
                        {specState.scriptLog?.length > 0 && (
                          <div className="bg-black/30 rounded-lg p-2.5 space-y-0.5">
                            {specState.scriptLog.map((line, i) => (
                              <p key={i} className={`text-[10px] font-mono ${line.startsWith('✓') ? 'text-green-400' : line.startsWith('⚠') ? 'text-amber-400' : line.startsWith('→') ? 'text-blue-300' : 'text-white/50'}`}>{line}</p>
                            ))}
                          </div>
                        )}
                        {specState.runError && <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">ADT run unavailable — open SE38 → {specState.appliedProgramName} → F8</p>}
                        {specState.scriptExecuted && <p className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1.5">✓ Customizing applied. Check transport in SE01.</p>}
                        {!specState.configScript && !specState.generatingScript && <p className="text-xs text-white/30">Generate an ABAP script, then write and run it directly on SAP.</p>}
                      </div>
                    )}
                  </div>
                );
              })()}
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

      {/* NL → Blueprint modal */}
      {showNlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={15} className="text-emerald-600" />Generate Blueprint from Description
              </h3>
              <button onClick={() => { setShowNlModal(false); setNlText(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500">Describe in plain language what you need to implement in SAP. The AI will generate the full set of required objects.</p>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none h-36"
              placeholder="e.g. We need a custom procurement report that reads open purchase orders by vendor, calculates overdue amounts, and sends automatic email reminders via workflow. The report must save to the database and be accessible via a Fiori tile."
              value={nlText}
              onChange={e => setNlText(e.target.value)}
              disabled={nlGenerating}
            />
            {objects.length > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                AI-suggested objects will be replaced. Manually added objects are kept.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowNlModal(false); setNlText(''); }} disabled={nlGenerating}
                className="px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleNlGenerate} disabled={!nlText.trim() || nlGenerating}
                className="px-4 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                {nlGenerating ? <><Loader2 size={12} className="animate-spin" />Generating…</> : <><Sparkles size={12} />Generate Blueprint</>}
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

// Object type ordering for implementation sequence
const TYPE_PRIORITY    = { config:0, table:1, enhancement:2, badi:3, class:4, function_module:5, program:6, other:7 };
const MANUAL_TYPES     = new Set(['table','enhancement','badi','config']);
const OBJ_TRANSACTION  = { table:'SE11', enhancement:'SE18', badi:'SE18', config:'SPRO', class:'SE24', function_module:'SE37', program:'SE38', other:'SE80' };
// config (SPRO) has no ADT-pasteable code — pure IMG customizing
const ADT_CODE_TYPES   = new Set(['table','structure','enhancement','badi']);

function SapImplementationTab({ caseData, auth, activities, updateActivity }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;

  // ── Connections / environments ──────────────────────────
  const { projectConns, clientConns } = useProjectDbConnections(caseData.project_id, caseData.client_id);
  const allConns = [...projectConns, ...clientConns.map(c => ({ ...c, _inherited: true }))];
  const sapCaseConnMap  = settings['sap_case_conn'] ?? {};
  const selectedConnId  = sapCaseConnMap[caseData.id] ?? null;
  async function saveCaseConn(connId) {
    await ssCtx.setSetting('sap_case_conn', { ...sapCaseConnMap, [caseData.id]: connId || null });
  }
  const allSapConfigs   = settings['sap_integration'] ?? {};
  const clientSapData   = caseData.client_id
    ? (allSapConfigs[caseData.client_id] ?? {})
    : (allSapConfigs[`proj_${caseData.project_id}`] ?? {});
  const sapEnvironmentsFromSettings = clientSapData.environments ?? (clientSapData.host ? [clientSapData] : []);
  // Fall back to db_connections records of SAP/HANA type when no sap_integration setting exists
  const sapEnvsFromConns = sapEnvironmentsFromSettings.length === 0
    ? [...projectConns, ...clientConns]
        .filter(c => ['sap', 'hana', 'sap_hana', 'sap hana'].includes((c.db_type ?? '').toLowerCase().replace(/_/g, ' ')))
        .map(c => ({
          id:     c.id,
          label:  c.meta?.label ?? (c.db_type ?? 'SAP').toUpperCase(),
          host:   c.host,
          port:   c.port ?? 443,
          username: c.username ?? '',
          system_id: c.db_name ?? '',
          client: c.meta?.client ?? '100',
          _fromDbConn: true,
        }))
    : [];
  const sapEnvironments = sapEnvironmentsFromSettings.length > 0 ? sapEnvironmentsFromSettings : sapEnvsFromConns;
  const sapProjectEnvMap = settings['sap_project_env'] ?? {};
  const sapCaseEnvMap    = settings['sap_case_env']    ?? {};
  const selectedSapEnvId = sapCaseEnvMap[caseData.id] ?? sapProjectEnvMap[caseData.project_id] ?? null;
  const sapConfig = selectedSapEnvId
    ? (sapEnvironments.find(e => e.id === selectedSapEnvId) ?? sapEnvironments[0] ?? null)
    : (sapEnvironments[0] ?? null);
  const autoImplEnabled = sapConfig?.autoImplementEnabled ?? false;
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

  // ── Object / activity state ─────────────────────────────
  const savedObjects = settings['sap_activity_objects'] ?? {};
  const [objectMap, setObjectMap] = useState(savedObjects);
  const [actState, setActState] = useState({});
  const [checkedActIds, setCheckedActIds] = useState(new Set());
  const [transportReq, setTransportReq] = useState(settings['sap_impl_transport']?.[caseData.id] ?? '');
  const [savingTransport, setSavingTransport] = useState(false);
  const genModel = settings["ai_model"] ?? 'claude-haiku-5-5';

  const implActivities = activities.filter(a =>
    !['completed'].includes(a.phase) &&
    (a.phase === 'development' || a.phase === 'design' || !a.phase || a.progress_pct < 100)
  );

  // ── Pipeline step state ─────────────────────────────────
  const [implStep, setImplStep] = useState(1);
  const [stopOnError,      setStopOnError]      = useState(true);
  const _savedSetup = settings['sap_impl_setup']?.[caseData.id] ?? {};
  const [implMode,         setImplModeRaw]      = useState(_savedSetup.implMode         ?? 'all');
  const [includeViewer,    setIncludeViewerRaw] = useState(_savedSetup.includeViewer    ?? true);
  const [notifyOnComplete, setNotifyRaw]        = useState(_savedSetup.notifyOnComplete ?? false);
  const [logTab, setLogTab] = useState('platform');
  const [expandedManual, setExpandedManual] = useState(new Set());
  const [expandedAuto,   setExpandedAuto]   = useState(new Set());
  const [manualSpecs, setManualSpecs] = useState(settings['sap_impl_specs']?.[caseData.id] ?? {});
  const [bcsetSysType, setBcsetSysType] = useState('s4_onprem'); // 'ecc' | 's4_onprem' | 's4_cloud'

  // ── Existing handlers ───────────────────────────────────
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
  async function saveSpecs(newSpecs) {
    const cur = settings['sap_impl_specs'] ?? {};
    await ssCtx.setSetting('sap_impl_specs', { ...cur, [caseData.id]: newSpecs });
  }
  async function _saveSetup(patch) {
    const cur = settings['sap_impl_setup'] ?? {};
    await ssCtx.setSetting('sap_impl_setup', { ...cur, [caseData.id]: { implMode, includeViewer, notifyOnComplete, ...patch } });
  }
  function setImplMode(v)        { setImplModeRaw(v);       _saveSetup({ implMode: v }); }
  function setIncludeViewer(v)   { setIncludeViewerRaw(v);  _saveSetup({ includeViewer: v }); }
  function setNotifyOnComplete(v){ setNotifyRaw(v);         _saveSetup({ notifyOnComplete: v }); }

  async function handleGenerateConfigScript(obj) {
    const isCloud = bcsetSysType === 's4_cloud';
    setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingScript: true, scriptError: null } }));
    try {
      let prompt, system;
      if (isCloud) {
        prompt = `You are an SAP S/4HANA Cloud Public Edition configuration expert.
For the following customizing requirement, determine if SAP provides a standard OData/REST API on the SAP API Business Hub.

Configuration: ${obj.name}
Description: ${obj.description ?? ''}
SAP Module: ${caseData.area_sap ?? 'general'}
Project: ${caseData.title}

Respond in this exact structure:

API AVAILABLE: [Yes / No / Partial]
API ENDPOINT: [if Yes: full OData service name + entity set + HTTP method, e.g. POST /sap/opu/odata/sap/API_PAYMENTTERMS_SRV/A_PaymentTerms]
REQUEST BODY: [if Yes: minimal JSON/XML sample showing required fields and values]
AUTHENTICATION: [OAuth2 / Basic — and which scope if OAuth2]

CBC PATH: [if No/Partial: exact path in "Configure Your Solution" or Central Business Configuration: Scope Item > Configuration Activity > field values]
FIORI APP: [Fiori app name/ID if applicable]

LIMITATIONS: [what cannot be configured via API or CBC — escalate to SAP]
NOTES: [transport/change management, release dependency, prerequisites]`;
        system = 'You are an expert SAP S/4HANA Cloud configuration specialist. Be precise and honest about API availability.';
      } else {
        prompt = `You are an SAP ABAP developer. Generate a complete, executable ABAP report to implement this customizing configuration in SAP ECC or S/4HANA On-Premise.

Configuration: ${obj.name}
Description: ${obj.description ?? ''}
SAP Module: ${caseData.area_sap ?? 'general'}
Transport Request: ${transportReq || 'will be assigned at runtime'}
Project: ${caseData.title}

Requirements:
- REPORT name must start with ZTECHCASE_ followed by a short descriptor (max 30 chars total)
- If copying an existing entry (e.g. MT 101 → 901): read from source customizing tables and INSERT target rows
- Use standard SAP customizing tables directly (e.g. T156/T156X/T156W for movement types, T052/T052U for payment terms)
- Assign changes to transport: use CALL FUNCTION 'TR_OBJECT_INSERT' or set sy-tcode and let SAP auto-assign
- Output results with WRITE: object created, transport assigned, errors
- Handle exceptions: check if target already exists before inserting
- Comment each section

Return ONLY the ABAP code — no explanation, no markdown fences.`;
        system = 'You are an expert SAP ABAP developer specializing in customizing automation. Return only raw ABAP code.';
      }
      const resp = await callClaude({
        model: genModel, system,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 8000,
      });
      const configScript = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), generatingScript: false, configScript, scriptType: isCloud ? 'cloud' : 'abap' } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingScript: false, scriptError: e.message } }));
    }
  }

  async function handleApplyConfigScript(obj) {
    if (!sapConfig?.host) return;
    const specState = manualSpecs[obj.id] ?? {};
    if (!specState.configScript || specState.scriptType !== 'abap') return;
    const programName = ('ZTECHCASE_' + obj.name.replace(/[^A-Z0-9]/gi, '').toUpperCase()).slice(0, 30);
    const addLog = (msg) => setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), scriptLog: [...(p[obj.id]?.scriptLog ?? []), msg] } }));
    setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), applyingScript: true, scriptLog: [], appliedScript: false, scriptApplyError: null } }));
    try {
      addLog(`Writing ${programName} to SAP…`);
      const writeResult = await sapWriteSourceDetail(enrichedSapConfig, 'program', programName, specState.configScript, transportReq || undefined);
      if (!writeResult.ok) throw new Error(writeResult.error ?? writeResult.hint ?? `HTTP ${writeResult.status}`);
      addLog('✓ Program written to SAP');
      addLog('Activating…');
      try {
        const csrfToken = await sapGetCsrfToken(enrichedSapConfig);
        const activateBody = `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/${programName}" adtcore:name="${programName}"/></adtcore:objectReferences>`;
        await sapApiRequest(enrichedSapConfig, '/sap/bc/adt/activation/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.sap.adt.activation.request+xml; charset=utf-8', 'X-CSRF-Token': csrfToken },
          body: activateBody,
        });
        addLog('✓ Activated');
      } catch (e) { addLog(`⚠ Activation: ${e.message}`); }
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), applyingScript: false, appliedScript: true, appliedProgramName: programName, scriptLog: [...(manualSpecs[obj.id]?.scriptLog ?? []), '→ Click "Run on SAP" to execute'] } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), applyingScript: false, scriptApplyError: e.message } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    }
  }

  async function handleRunConfigScript(obj) {
    if (!sapConfig?.host) return;
    const specState = manualSpecs[obj.id] ?? {};
    const programName = specState.appliedProgramName;
    if (!programName) return;
    setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), runningScript: true, runError: null } }));
    try {
      const csrfToken = await sapGetCsrfToken(enrichedSapConfig);
      const runResp = await sapApiRequest(enrichedSapConfig, `/sap/bc/adt/programs/programs/${programName}/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.sap.adt.programs.runs.newrun+xml', 'X-CSRF-Token': csrfToken },
        body: `<?xml version="1.0"?><programs:newRun xmlns:programs="http://www.sap.com/adt/programs"><programs:mode>foreground</programs:mode></programs:newRun>`,
      });
      const ok = runResp.ok || runResp.status === 200 || runResp.status === 201;
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), runningScript: false, scriptExecuted: ok, runError: ok ? null : `SAP returned HTTP ${runResp.status} — run manually in SE38` } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), runningScript: false, runError: e.message } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    }
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
      const standards = resolveAbapStandards(settings, caseData.client_id, caseData.project_id, caseData.id);
      const standardsBlock = buildAbapStandardsPrompt(standards, obj.objectType ?? 'program', obj.objectName, act, caseData, transportReq, isModification);
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
        mcp_servers: buildSapMcpConfig(sapConfig, sapConfig?.mcp_server_url?.trim() || ssCtx.settings['sap_mcp_server_url']),
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
    const obj  = objectMap[act.id];
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
          activityId: act.id, activityTitle: act.title,
          objectName: obj.objectName, objectType: obj.objectType,
          appliedAt: new Date().toISOString(), transport: transportReq,
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
      const obj  = objectMap[act.id];
      const code = actState[act.id]?.generatedCode;
      if (obj?.objectName && code && !actState[act.id]?.applied) await handleApplyToSap(act);
    }
  }
  async function handleApplySelected() {
    for (const act of implActivities) {
      if (!checkedActIds.has(act.id)) continue;
      const obj  = objectMap[act.id];
      const code = actState[act.id]?.generatedCode;
      if (obj?.objectName && code && !actState[act.id]?.applied) await handleApplyToSap(act);
    }
  }
  function toggleActCheck(actId, e) {
    e.stopPropagation();
    setCheckedActIds(prev => { const n = new Set(prev); n.has(actId) ? n.delete(actId) : n.add(actId); return n; });
  }
  function toggleActCheckAll() {
    if (checkedActIds.size === implActivities.length) setCheckedActIds(new Set());
    else setCheckedActIds(new Set(implActivities.map(a => a.id)));
  }
  async function handleGenerateManualSpec(obj) {
    const typeMeta = BP_TYPES[obj.type] ?? {};
    const transaction = OBJ_TRANSACTION[obj.type] ?? 'SE80';
    const isConfig = obj.type === 'config';
    setManualSpecs(p => ({ ...p, [obj.id]: { generating: true } }));
    try {
      const prompt = isConfig
        ? `You are an SAP functional consultant. Provide the exact SPRO/IMG customizing instructions for the following configuration object.

Configuration Parameter: ${obj.name}
Description: ${obj.description ?? 'No description provided'}
SAP Module: ${caseData.area_sap ?? 'general'}
Project: ${caseData.title}

Respond in this exact structure (plain text, no markdown):

DIRECT T-CODE: [if a direct transaction exists besides SPRO, e.g. OX09, OBA7, OME9 — otherwise write "SPRO only"]

IMG PATH:
[Full customizing path, e.g.:
SPRO → Enterprise Structure → Definition → Materials Management → Maintain Storage Locations]

WHAT TO CONFIGURE:
[Numbered steps: field names, values to set, key fields to fill in]

TRANSPORT:
[Whether saving this parameter creates a customizing transport request, what type (client-specific / cross-client), and how to assign it to a transport]

VERIFICATION:
[How to confirm the configuration is active and correct]

NOTES:
[Any dependencies, activation steps, or client-specific vs. cross-client considerations]`

        : `You are an SAP functional/technical consultant. Provide clear, step-by-step instructions for manually creating the following SAP object.

Object Name: ${obj.name}
Object Type: ${typeMeta.label ?? obj.type} (${typeMeta.short ?? obj.type})
SAP Transaction: ${transaction}
Description: ${obj.description ?? 'No description provided'}
Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? 'general'}

Provide:
1. Which SAP transaction to open and menu path
2. Step-by-step field values / settings to configure
3. Any technical notes (activation, transport assignment, naming conventions)
4. How to verify the object was created correctly

Be concise and use numbered steps. Format as plain text, no markdown headers.`;

      const resp = await callClaude({
        model: genModel,
        system: isConfig
          ? 'You are an expert SAP functional consultant. Always provide the exact IMG customizing path and direct t-code when one exists. Be precise about field names and values.'
          : 'You are an expert SAP consultant. Provide concise, actionable step-by-step creation instructions for SAP objects.',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 1800,
      });
      const spec = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), generating: false, spec } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      setManualSpecs(p => ({ ...p, [obj.id]: { generating: false, error: e.message } }));
    }
  }
  async function handleGenerateAdtCode(obj) {
    const typeMeta = BP_TYPES[obj.type] ?? {};
    setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingAdt: true } }));
    const prompts = {
      table: `Generate ABAP CDS DDL source code for a transparent database table named ${obj.name} in SAP ADT.
Description: ${obj.description ?? ''}
Case: ${caseData.title} · SAP Module: ${caseData.area_sap ?? 'general'}
Use @AbapCatalog annotations, define all key fields (mandt, then business key), add relevant data element references.
Output ONLY the CDS DDL source (no explanation). Start with @AbapCatalog.sqlViewName.`,

      structure: `Generate ABAP CDS DDL source code for a flat structure (no key, no MANDT) named ${obj.name} in SAP ADT.
Description: ${obj.description ?? ''}
Case: ${caseData.title} · SAP Module: ${caseData.area_sap ?? 'general'}
Use @AbapCatalog annotations. Output ONLY the CDS DDL source (no explanation).`,

      enhancement: `Generate the ABAP class skeleton for a BAdI implementation of enhancement ${obj.name} in SAP ADT.
Description: ${obj.description ?? ''}
Case: ${caseData.title} · SAP Module: ${caseData.area_sap ?? 'general'}
Include: CLASS DEFINITION with PUBLIC FINAL CREATE PUBLIC, the relevant interface, and stub METHOD implementations.
Output ONLY the ABAP source (CLASS DEFINITION ... CLASS IMPLEMENTATION ... ENDCLASS). No explanation.`,

      badi: `Generate the ABAP implementation class skeleton for BAdI ${obj.name} in SAP ADT (Eclipse).
Description: ${obj.description ?? ''}
Case: ${caseData.title} · SAP Module: ${caseData.area_sap ?? 'general'}
Include: CLASS DEFINITION with the BAdI interface, constructor, and stub method implementations.
Output ONLY the ABAP source (CLASS DEFINITION ... CLASS IMPLEMENTATION ... ENDCLASS). No explanation.`,
    };
    const prompt = prompts[obj.type] ?? `Generate ABAP source code for ${typeMeta.label ?? obj.type} object ${obj.name}.\nDescription: ${obj.description ?? ''}\nOutput ONLY the ABAP source.`;
    try {
      const resp = await callClaude({
        model: genModel,
        system: 'You are an expert SAP ABAP developer. Output only clean, compilable ABAP or CDS DDL source code. No markdown fences, no explanations.',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 8000,
      });
      const adtCode = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), generatingAdt: false, adtCode } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingAdt: false, adtError: e.message } }));
    }
  }

  async function handleGenerateBcsetInfo(obj) {
    setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingBcset: true } }));
    const sysLabel = bcsetSysType === 'ecc' ? 'SAP ECC 6.0'
      : bcsetSysType === 's4_onprem'        ? 'SAP S/4HANA On-Premise / Private Cloud Edition'
      :                                        'SAP S/4HANA Cloud Public Edition';

    const promptEccOnprem = `You are an SAP Best Practices expert for ${sysLabel}. For the following SAP customizing parameter, identify the relevant SAP Best Practices BCset(s) and provide activation guidance.

Configuration: ${obj.name}
Description: ${obj.description ?? 'No description provided'}
SAP Module: ${caseData.area_sap ?? 'general'}
Project: ${caseData.title}
Target System: ${sysLabel}

Respond in this exact structure (plain text, no markdown):

BCSET NAME(S):
[Exact SAP Best Practices BCset name(s) for ${sysLabel}, e.g. /SMB40/J_1BTXJUR_C — or "Not covered by standard BCsets" if none exist]

SCOPE ITEM / PACKAGE:
[The Best Practices scope item and package this BCset belongs to, e.g. "J45 – Accounts Payable" in package "SAP Best Practices for SAP S/4HANA"]

CUSTOMIZING TABLES AFFECTED:
[Main customizing tables this BCset writes to, e.g. T001, TVKO, T005]

ACTIVATION STEPS:
1. Go to SAP Best Practices Explorer (rapid.sap.com) → download the scope item if not installed
2. ${bcsetSysType === 'ecc' ? 'Run transaction /SMB/BBI or SPRO → Activate SAP Best Practices' : 'Run SPRO → SAP Reference IMG → Activate SAP Best Practices, or transaction /SMB/BBI'}
3. [Continue with exact SCPR20 steps: find BCset → activation mode → client assignment → execute]

ACTIVATION MODE:
[Client-specific (client-dependent) or Cross-client (client-independent), and what that means for transport]

PREREQUISITES:
[BCsets or configuration that must exist first]

TRANSPORT GENERATED:
[Transport type created on save and how to assign it]

IF NOT INSTALLED:
[How to obtain: download from rapid.sap.com → import via /SMB/BBI → or configure manually via SPRO as fallback]`;

    const promptCloud = `You are an SAP Best Practices expert for SAP S/4HANA Cloud Public Edition. For the following configuration parameter, provide the activation path using SAP Central Business Configuration (CBC) and the Configure Your Solution app.

Configuration: ${obj.name}
Description: ${obj.description ?? 'No description provided'}
SAP Module: ${caseData.area_sap ?? 'general'}
Project: ${caseData.title}

Respond in this exact structure (plain text, no markdown):

SCOPE ITEM:
[The SAP S/4HANA Cloud Best Practices scope item ID and name, e.g. "J45 – Accounts Payable" — this replaces BCsets in Cloud]

CBC ACTIVATION PATH:
[SAP Central Business Configuration steps: which product / solution scope to select, how to activate this process area]

CONFIGURE YOUR SOLUTION (Fiori):
[Steps in the "Configure Your Solution" Fiori app — which configuration activity covers this parameter, the activity path, and what values to set]

MANAGED CONFIGURATION:
[Whether SAP manages this setting centrally (customer cannot change) or it is customer-configurable]

TRANSPORT / CHANGE MANAGEMENT:
[How changes are tracked in S/4HANA Cloud — Change Management app, transport to Production via 3-system landscape or 2-system landscape]

LIMITATIONS vs ON-PREM:
[What cannot be changed in S/4HANA Cloud that would be configurable on-premise — important for fit-gap analysis]

FALLBACK:
[If the parameter is not configurable via CBC, what extensibility option exists: key user extensibility, partner extensibility, or SAP support request]`;

    try {
      const prompt = bcsetSysType === 's4_cloud' ? promptCloud : promptEccOnprem;
      const system = bcsetSysType === 's4_cloud'
        ? 'You are an expert SAP S/4HANA Cloud consultant. Focus on CBC, Configure Your Solution, and the cloud activation model. Be precise about what is and is not customer-configurable.'
        : 'You are an expert SAP Best Practices consultant. Always provide exact BCset names. If a BCset does not exist for this configuration, say so clearly and explain the manual SPRO alternative.';

      const resp = await callClaude({
        model: genModel,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 1800,
      });
      const bcsetInfo = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      const newSpecs = { ...manualSpecs, [obj.id]: { ...(manualSpecs[obj.id] ?? {}), generatingBcset: false, bcsetInfo } };
      setManualSpecs(newSpecs);
      saveSpecs(newSpecs);
    } catch (e) {
      setManualSpecs(p => ({ ...p, [obj.id]: { ...(p[obj.id] ?? {}), generatingBcset: false, bcsetError: e.message } }));
    }
  }

  // ── Derived data ────────────────────────────────────────
  const implLog      = (settings['sap_impl_log'] ?? {})[caseData.id] ?? [];
  const appliedCount = implLog.length;
  const totalCount   = implActivities.length;

  // Blueprint canvas objects (primary source for Sequence step)
  const bpObjects = (settings['sap_blueprint'] ?? {})[caseData.id]?.objects ?? [];
  const bpSorted  = bpObjects.length > 0 ? topoSort(bpObjects) : [];

  // Activity-based objects (for Run step)
  const sortedActivities = [...implActivities]
    .filter(a => objectMap[a.id]?.objectName)
    .sort((a, b) => {
      const ta = TYPE_PRIORITY[objectMap[a.id]?.objectType ?? 'other'] ?? 7;
      const tb = TYPE_PRIORITY[objectMap[b.id]?.objectType ?? 'other'] ?? 7;
      return ta - tb;
    });
  const unassignedActivities = implActivities.filter(a => !objectMap[a.id]?.objectName);
  const manualCount = bpSorted.length > 0
    ? bpSorted.filter(o => !(o.aiCapable ?? BP_TYPES[o.type]?.ai ?? true)).length
    : sortedActivities.filter(a => MANUAL_TYPES.has(objectMap[a.id]?.objectType ?? '')).length;
  const autoCount = bpSorted.length > 0
    ? bpSorted.filter(o => (o.aiCapable ?? BP_TYPES[o.type]?.ai ?? true)).length
    : sortedActivities.length - manualCount;

  // ── Pipeline stepper ────────────────────────────────────
  const PIPELINE_STEPS = [
    { label: 'Setup',    icon: <Settings size={13} /> },
    { label: 'Sequence', icon: <LayoutGrid size={13} /> },
    { label: 'Review',   icon: <Eye size={13} /> },
    { label: 'Run',      icon: <Play size={13} /> },
    { label: 'Results',  icon: <CheckCircle2 size={13} /> },
    { label: 'Logs',     icon: <FileText size={13} /> },
  ];

  const PipelineStepper = () => (
    <div className="bg-gray-900/60 rounded-2xl border border-white/10 shadow-sm px-4 py-3">
      <div className="flex items-start overflow-x-auto gap-0 pb-0.5">
        {PIPELINE_STEPS.map((s, i) => {
          const n = i + 1;
          const isActive = implStep === n;
          const isDone   = implStep > n;
          return (
            <button key={n} onClick={() => setImplStep(n)}
              className="flex flex-col items-center flex-1 min-w-[52px] relative">
              {i > 0 && (
                <div className={`absolute top-[15px] right-1/2 w-full h-0.5 ${isDone ? 'bg-blue-500' : 'bg-white/15'}`} />
              )}
              <div className={`w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center relative z-10 transition-all
                ${isActive ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                : isDone   ? 'border-green-500 bg-green-500/20 text-green-400'
                           : 'border-white/20 bg-white/5 text-white/30'}`}>
                {isDone ? <Check size={12} /> : s.icon}
              </div>
              <span className={`text-[9px] font-bold mt-1 uppercase tracking-wider
                ${isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-white/30'}`}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Toggle row helper ───────────────────────────────────
  const ToggleRow = ({ label, desc, value, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer"
      onClick={() => onChange(!value)}>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-white/40 mt-0.5">{desc}</p>}
      </div>
      <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${value ? 'bg-blue-500' : 'bg-white/20'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </div>
  );

  // ── Activity card (used in both Sequence and Run steps) ──
  const ActivityCard = ({ act, seqNum, showControls = false }) => {
    const obj = objectMap[act.id] ?? {};
    const as  = actState[act.id] ?? {};
    const isApplied  = as.applied || implLog.some(l => l.activityId === act.id);
    const isManual   = MANUAL_TYPES.has(obj.objectType ?? '');
    const transaction = OBJ_TRANSACTION[obj.objectType ?? ''] ?? 'SE80';
    const checkRes   = as.checkResult;

    return (
      <div className={`rounded-xl border transition-all ${
        isApplied  ? 'border-green-200 bg-green-50/50' :
        isManual   ? 'border-amber-200 bg-amber-50/30' :
                     'border-gray-100 bg-white'
      }`}>
        <div className="px-4 py-3 flex items-center gap-3 cursor-pointer"
          onClick={() => setActField(act.id, { expanded: !as.expanded })}>
          {/* Status dot */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isApplied   ? 'bg-green-500' :
            as.applying ? 'bg-amber-400 animate-pulse' :
            isManual    ? 'bg-amber-400' :
                          'bg-gray-300'
          }`} />
          {/* Seq number */}
          {seqNum != null && (
            <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-gray-100 text-gray-500 flex-shrink-0 font-mono">
              {seqNum}
            </span>
          )}
          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {obj.objectName
                ? <span className="font-mono text-xs font-semibold text-gray-800">{obj.objectName}</span>
                : <span className="text-xs text-gray-400 italic">{act.title}</span>}
              {obj.objectName && (
                <span className="text-xs text-gray-500 truncate">{act.title}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {obj.objectType && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                  {t(SAP_OBJECT_TYPES.find(o => o.value === obj.objectType)?.labelKey ?? '') || obj.objectType}
                </span>
              )}
              {isManual
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{transaction}</span>
                : obj.objectName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">Auto</span>}
              {isApplied && <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5"><CheckCircle2 size={9} />Applied</span>}
            </div>
          </div>
          <ChevronRight size={13} className={`text-gray-300 flex-shrink-0 transition-transform ${as.expanded ? 'rotate-90' : ''}`} />
        </div>

        {as.expanded && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Object type + name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('sap.impl_object_type')}</label>
                <select value={obj.objectType ?? 'program'}
                  onChange={e => setObjectField(act.id, 'objectType', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {SAP_OBJECT_TYPES.map(ot => <option key={ot.value} value={ot.value}>{t(ot.labelKey)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('sap.impl_object_name')}</label>
                <input value={obj.objectName ?? ''}
                  onChange={e => setObjectField(act.id, 'objectName', e.target.value.toUpperCase())}
                  placeholder="ZOBJ_NAME"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => handleCheckSap(act.id)}
                disabled={as.checking || !obj.objectName}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {as.checking ? t('sap.impl_checking') : t('sap.impl_check_sap')}
              </button>
              {checkRes && (
                checkRes.found
                  ? <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><CheckCircle2 size={10} />{t('sap.impl_found')}</span>
                  : <span className="text-xs text-gray-400 flex items-center gap-1"><XCircle size={10} />{t('sap.impl_not_found')}</span>
              )}
              <button onClick={() => handleGenerateCode(act)}
                disabled={as.generating || !obj.objectName}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
                {as.generating ? t('sap.impl_generating') : t('sap.impl_gen_code')}
              </button>
              {autoImplEnabled && as.generatedCode && (
                <button onClick={() => handleApplyToSap(act)}
                  disabled={as.applying || isApplied}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors
                    ${isApplied ? 'bg-green-100 text-green-700' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                  {as.applying ? t('sap.impl_applying') : isApplied ? t('sap.impl_applied') : t('sap.impl_apply')}
                </button>
              )}
            </div>
            {/* Apply log */}
            {as.applyLog?.length > 0 && (
              <div className="rounded-lg bg-gray-950 p-3 space-y-1">
                {as.applyLog.map((msg, i) => (
                  <p key={i} className={`text-xs font-mono leading-snug
                    ${msg.startsWith('✓') ? 'text-green-400' : msg.startsWith('✗') ? 'text-red-400' : 'text-gray-400'}`}>{msg}</p>
                ))}
              </div>
            )}
            {/* Existing source */}
            {checkRes?.found && checkRes.source && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Eye size={10} />{t('sap.live_existing_source')}
                </p>
                <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto max-h-44 leading-relaxed">
                  {checkRes.source.slice(0, 2000)}
                </pre>
              </div>
            )}
            {/* Generated code */}
            {as.generatedCode && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Code2 size={10} />Generated ABAP
                </p>
                <textarea value={as.generatedCode}
                  onChange={e => setActField(act.id, { generatedCode: e.target.value })}
                  className="w-full bg-gray-900 text-green-300 text-xs rounded-lg p-3 font-mono leading-relaxed h-56 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── No config guard ─────────────────────────────────────
  if (!sapConfig?.host) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <Code2 size={36} className="text-gray-400 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">{t('sap.impl_no_config')}</p>
        <p className="text-xs text-gray-400">{t('sap.impl_configure')}</p>
      </div>
    );
  }

  // ── Panel shell ─────────────────────────────────────────
  const Panel = ({ icon, title, sub, children }) => (
    <div className="bg-gray-900/60 rounded-2xl border border-white/10 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
          {icon}
        </div>
        <div>
          <p className="font-bold text-white text-sm">{title}</p>
          {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );

  const StepNav = ({ prev, next, prevLabel = '← Back', nextLabel = 'Continue →' }) => (
    <div className="flex gap-2 pt-2">
      {prev && <button onClick={() => setImplStep(prev)} className="px-4 py-2 text-xs font-semibold border border-white/15 rounded-lg hover:bg-white/5 text-white/60 transition-colors">{prevLabel}</button>}
      {next && <button onClick={() => setImplStep(next)} className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">{nextLabel}</button>}
    </div>
  );

  const SectionLabel = ({ children }) => (
    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-3">{children}</p>
  );

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Blueprint canvas stays on top */}
      <SapBlueprintCanvas
        caseData={caseData} auth={auth} activities={implActivities}
        sapConfig={enrichedSapConfig} autoImplEnabled={autoImplEnabled}
        genModel={genModel} transportReq={transportReq} ssCtx={ssCtx}
        configOps={{
          manualSpecs, setManualSpecs, saveSpecs,
          bcsetSysType, setBcsetSysType,
          onGenerateSpro:           handleGenerateManualSpec,
          onGenerateBcset:          handleGenerateBcsetInfo,
          onGenerateConfigScript:   handleGenerateConfigScript,
          onApplyConfigScript:      handleApplyConfigScript,
          onRunConfigScript:        handleRunConfigScript,
          onGenerateCreationGuide:  handleGenerateManualSpec,
          onGenerateAdtCode:        handleGenerateAdtCode,
        }}
      />

      {/* Pipeline stepper */}
      <PipelineStepper />

      {/* ── STEP 1: Setup ─────────────────────────────── */}
      {implStep === 1 && (
        <Panel icon={<Settings size={15} />} title="Setup & Parameters" sub="Connection, environment and execution options">

          <SectionLabel>SAP Connection</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {allConns.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Connection</label>
                <select value={selectedConnId ?? ''} onChange={e => saveCaseConn(e.target.value)}
                  className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— None —</option>
                  {projectConns.map(c => (
                    <option key={c.id} value={c.id}>{CONN_TYPE_LABELS[c.db_type] ?? c.db_type} · {c.host}{c.notes ? ` (${c.notes})` : ''}</option>
                  ))}
                  {clientConns.map(c => (
                    <option key={c.id} value={c.id}>{CONN_TYPE_LABELS[c.db_type] ?? c.db_type} · {c.host} — client{c.notes ? ` (${c.notes})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            {sapEnvironments.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">{t('sap.case_env_label')}</label>
                <div className="flex gap-2 items-center">
                  <select value={sapCaseEnvMap[caseData.id] ?? ''} onChange={e => saveCaseEnv(e.target.value)}
                    className="flex-1 border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">{t('sap.case_env_inherit')}</option>
                    {sapEnvironments.map(env => {
                      const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
                      return <option key={env.id} value={env.id}>{env.name} ({meta.label})</option>;
                    })}
                  </select>
                  {sapConfig && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${(SAP_ENV_TYPE_META[sapConfig.envType] ?? SAP_ENV_TYPE_META.dev).color}`}>
                      {sapConfig.name}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">{t('sap.transport_req')}</label>
              <input value={transportReq}
                onChange={e => setTransportReq(e.target.value)}
                onBlur={() => saveTransport(transportReq)}
                placeholder={t('sap.ph_transport_req')}
                className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm font-mono bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <SectionLabel>Execution Options</SectionLabel>
          <div className="flex gap-2 mb-3">
            {[['all', <><RefreshCw size={11} /> All Objects at Once</>], ['one-by-one', <><Settings size={11} /> Object by Object</>]].map(([val, lbl]) => (
              <button key={val} onClick={() => setImplMode(val)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg border transition-all
                  ${implMode === val ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/15 text-white/40 hover:border-white/25'}`}>
                {lbl}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <ToggleRow label="Stop on Error" desc="Pause the process if any object fails to implement" value={stopOnError} onChange={setStopOnError} />
            <ToggleRow label="Include Viewer in Transport" desc="Add viewer/display variants alongside main objects" value={includeViewer} onChange={setIncludeViewer} />
            <ToggleRow label="Notify Reviewer on Complete" desc="Send an email when implementation finishes" value={notifyOnComplete} onChange={setNotifyOnComplete} />
          </div>

          <SectionLabel>ABAP Standards</SectionLabel>
          <AbapStandardsPanel level="case" entityId={caseData.id} clientId={caseData.client_id} projectId={caseData.project_id} auth={auth} />

          <StepNav next={2} nextLabel="Save & Continue →" />
        </Panel>
      )}

      {/* ── STEP 2: Sequence Map ───────────────────────── */}
      {implStep === 2 && (() => {
        // Use blueprint canvas objects if available; fall back to activity-assigned objects
        const seqObjects = bpSorted.length > 0 ? bpSorted : sortedActivities.map(a => ({
          id: a.id,
          name: objectMap[a.id].objectName,
          type: objectMap[a.id].objectType ?? 'program',
          description: a.title,
          aiCapable: !(MANUAL_TYPES.has(objectMap[a.id].objectType ?? '')),
          dependsOn: [],
          status: actState[a.id]?.applied || implLog.some(l => l.activityId === a.id) ? 'done' : 'planned',
        }));
        const seqManual = seqObjects.filter(o => !(o.aiCapable ?? BP_TYPES[o.type]?.ai ?? true));
        const seqAuto   = seqObjects.filter(o =>  (o.aiCapable ?? BP_TYPES[o.type]?.ai ?? true));
        const nameById  = Object.fromEntries(bpSorted.map(o => [o.id, o.name]));

        return (
          <Panel icon={<LayoutGrid size={15} />} title="Object Sequence Map"
            sub={`${seqObjects.length} objects · ${seqManual.length} manual · ${seqAuto.length} auto · dependency order`}>

            {seqObjects.length === 0 ? (
              <div className="text-center py-8">
                <Code2 size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No objects in blueprint yet.</p>
                <p className="text-xs text-gray-300 mt-1">Add objects in the <strong>Blueprint Canvas</strong> above, or go to <strong>Run</strong> and assign SAP object names to activities.</p>
              </div>
            ) : (
              <>
                {seqManual.length > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>Objects marked <strong>Manual</strong> must be created in SAP first. Auto objects that depend on them will wait until you verify creation in the Run step.</span>
                  </div>
                )}

                {seqManual.length > 0 && (
                  <>
                    <SectionLabel>Phase 1 — Manual (create in SAP before running)</SectionLabel>
                    <div className="space-y-2">
                      {seqManual.map((obj, i) => {
                        const bpType    = BP_TYPES[obj.type] ?? {};
                        const deps      = (obj.dependsOn ?? []).map(id => nameById[id] ?? id).filter(Boolean);
                        const tx        = OBJ_TRANSACTION[obj.type] ?? 'SE80';
                        const isOpen    = expandedManual.has(obj.id);
                        const specState = manualSpecs[obj.id] ?? {};
                        const toggleOpen = () => setExpandedManual(p => { const n = new Set(p); n.has(obj.id) ? n.delete(obj.id) : n.add(obj.id); return n; });
                        return (
                          <div key={obj.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={toggleOpen}>
                              <span className="w-5 h-5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 flex items-center justify-center font-mono flex-shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-sm font-semibold text-white truncate">{obj.name}</div>
                                {obj.description && <div className="text-xs text-white/50 truncate">{obj.description}</div>}
                                {deps.length > 0 && <div className="text-[10px] text-amber-400 mt-0.5">← requires: {deps.join(', ')}</div>}
                              </div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 flex-shrink-0">{bpType.label ?? obj.type}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-700 text-amber-300 flex-shrink-0 font-mono">{tx}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex-shrink-0">Manual</span>
                              {obj.status === 'done' && <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />}
                              <span className="text-white/30 flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                            </div>
                            {isOpen && (() => {
                              const canAdt = ADT_CODE_TYPES.has(obj.type);
                              // Config objects: lightweight status — full detail lives in the Blueprint canvas panel
                              if (obj.type === 'config') {
                                return (
                                  <div className="border-t border-amber-500/20 px-3 py-3">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                                      {[
                                        { label: 'SPRO Guide', ready: !!specState.spec },
                                        { label: 'BCset',      ready: !!specState.bcsetInfo },
                                        { label: 'Script',     ready: !!specState.configScript },
                                        { label: 'Executed',   ready: !!specState.scriptExecuted },
                                      ].map(({ label, ready }) => (
                                        <span key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border
                                          ${ready
                                            ? 'bg-green-500/15 border-green-500/30 text-green-400'
                                            : 'bg-white/5 border-white/10 text-white/25'}`}>
                                          {ready ? <CheckCircle2 size={9} /> : <span className="w-2 h-2 rounded-full border border-current inline-block" />}
                                          {label}
                                        </span>
                                      ))}
                                    </div>
                                    <p className="text-[10px] text-white/30 leading-relaxed">
                                      Click this object in the <strong className="text-white/50">Blueprint canvas</strong> to view and generate the SPRO Guide, BCset, and Auto Config details.
                                    </p>
                                  </div>
                                );
                              }
                              // Non-config manual objects: status badges — full detail lives in the Blueprint canvas panel
                              return (
                                <div className="border-t border-amber-500/20 px-3 py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                                    {[
                                      { label: 'Creation Guide', ready: !!specState.spec },
                                      ...(canAdt ? [{ label: 'ADT Code', ready: !!specState.adtCode }] : []),
                                    ].map(({ label, ready }) => (
                                      <span key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border
                                        ${ready
                                          ? 'bg-green-500/15 border-green-500/30 text-green-400'
                                          : 'bg-white/5 border-white/10 text-white/25'}`}>
                                        {ready ? <CheckCircle2 size={9} /> : <span className="w-2 h-2 rounded-full border border-current inline-block" />}
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-white/30 leading-relaxed">
                                    Click this object in the <strong className="text-white/50">Blueprint canvas</strong> to generate the Creation Guide{canAdt ? ' and ADT Code' : ''}.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {seqAuto.length > 0 && (
                  <>
                    <SectionLabel>Phase {seqManual.length > 0 ? '2' : '1'} — Auto (implemented via ADT)</SectionLabel>
                    <div className="space-y-2">
                      {seqAuto.map((obj, i) => {
                        const bpType    = BP_TYPES[obj.type] ?? {};
                        const deps      = (obj.dependsOn ?? []).map(id => nameById[id] ?? id).filter(Boolean);
                        const seq       = seqManual.length + i + 1;
                        const isOpen    = expandedAuto.has(obj.id);
                        const toggleOpen = () => setExpandedAuto(p => { const n = new Set(p); n.has(obj.id) ? n.delete(obj.id) : n.add(obj.id); return n; });
                        const statusColor = obj.status === 'done'      ? 'text-green-400'
                                          : obj.status === 'error'     ? 'text-red-400'
                                          : obj.status === 'applying'  ? 'text-blue-300'
                                          : obj.status === 'generating'? 'text-amber-300'
                                          : 'text-white/30';
                        return (
                          <div key={obj.id} className="rounded-xl border border-blue-500/30 bg-blue-500/10 overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer" onClick={toggleOpen}>
                              <span className="w-5 h-5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 flex items-center justify-center font-mono flex-shrink-0">{seq}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-sm font-semibold text-white truncate">{obj.name}</div>
                                {obj.description && <div className="text-xs text-white/50 truncate">{obj.description}</div>}
                                {deps.length > 0 && <div className="text-[10px] text-blue-400 mt-0.5">← requires: {deps.join(', ')}</div>}
                              </div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 flex-shrink-0">{bpType.label ?? obj.type}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 flex-shrink-0">Auto · {bpType.short ?? '—'}</span>
                              {obj.status === 'done'
                                ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                                : obj.status && <span className={`text-[10px] font-semibold flex-shrink-0 ${statusColor}`}>{obj.status}</span>}
                              <span className="text-white/30 flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                            </div>
                            {isOpen && (
                              <div className="border-t border-blue-500/20 px-3 py-3 space-y-2">
                                {obj.generatedCode ? (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-white/40">Auto-generated ABAP code</span>
                                      <button onClick={() => navigator.clipboard?.writeText(obj.generatedCode)}
                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-white/10 text-white/50 border border-white/15 hover:bg-white/15">
                                        <Copy size={9}/>Copy
                                      </button>
                                    </div>
                                    <pre className="text-xs text-green-300 font-mono leading-relaxed whitespace-pre-wrap bg-black/30 border border-green-500/20 rounded-lg p-3 max-h-64 overflow-y-auto">{obj.generatedCode}</pre>
                                    {obj.error && <p className="text-[10px] text-red-400">Error: {obj.error}</p>}
                                  </>
                                ) : (
                                  <p className="text-[10px] text-white/30 leading-relaxed">
                                    {obj.status === 'error'
                                      ? <span className="text-red-400">Error: {obj.error || 'Unknown error'}</span>
                                      : 'Code will be generated automatically when the implementation pipeline runs. Check dependencies are resolved first.'}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            <StepNav prev={1} next={3} nextLabel="Confirm Sequence →" />
          </Panel>
        );
      })()}

      {/* ── STEP 3: Review ────────────────────────────── */}
      {implStep === 3 && (
        <Panel icon={<Eye size={15} />} title="Functional Review" sub="Send objects to reviewer for approval before going live">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300">
            <Link2 size={14} className="flex-shrink-0 mt-0.5" />
            <span>The review link is managed in the <strong>Blueprint</strong> tab. Select a reviewer there and generate the approval link — the reviewer sees the object list and approves or rejects each one.</span>
          </div>

          {bpSorted.length > 0 && (
            <>
              <SectionLabel>Objects that will be reviewed ({bpSorted.length})</SectionLabel>
              <div className="space-y-1.5">
                {bpSorted.map((obj, i) => {
                  const isAuto = obj.aiCapable ?? BP_TYPES[obj.type]?.ai ?? true;
                  const bpType = BP_TYPES[obj.type] ?? {};
                  return (
                    <div key={obj.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                      <span className="w-4 h-4 rounded text-[9px] font-bold bg-white/10 text-white/60 flex items-center justify-center font-mono flex-shrink-0">{i + 1}</span>
                      <span className="font-mono text-xs font-semibold text-white flex-1 truncate">{obj.name}</span>
                      <span className="text-[10px] text-white/40 truncate max-w-[100px] hidden sm:block">{bpType.label ?? obj.type}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${!isAuto ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'}`}>
                        {!isAuto ? 'Manual' : 'Auto'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <StepNav prev={2} next={4} nextLabel="Go to Run →" />
        </Panel>
      )}

      {/* ── STEP 4: Run ───────────────────────────────── */}
      {implStep === 4 && (
        <Panel icon={<Play size={15} />} title="Implementation Run"
          sub={`${totalCount} activities · ${autoImplEnabled ? 'auto-implement enabled' : 'manual apply mode'}`}>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-white/40 mb-1.5">
              <span>{t('sap.impl_progress_title')}</span>
              <span>{t('sap.impl_done_count').replace('{n}', appliedCount).replace('{total}', totalCount)}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: totalCount ? `${Math.round(appliedCount / totalCount * 100)}%` : '0%' }} />
            </div>
          </div>

          {/* Bulk actions (auto mode) */}
          {autoImplEnabled && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={toggleActCheckAll}
                className="px-3 py-1.5 text-xs font-semibold border border-white/15 rounded-lg hover:bg-white/5 text-white/60 transition-colors">
                {checkedActIds.size === implActivities.length && implActivities.length > 0 ? t('sap.deselect_all') : t('sap.select_all')}
              </button>
              {checkedActIds.size > 0 && (
                <button onClick={handleApplySelected}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                  {t('sap.impl_apply_selected').replace('{n}', checkedActIds.size)}
                </button>
              )}
              <button onClick={handleApplyAll}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">
                {t('sap.impl_apply_all')}
              </button>
            </div>
          )}

          {/* Activity list */}
          {implActivities.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/40">No implementation activities found.</div>
          ) : (
            <div className="space-y-2">
              {/* Sorted (assigned) activities first */}
              {sortedActivities.map((act, i) => (
                <ActivityCard key={act.id} act={act} seqNum={i + 1} showControls />
              ))}
              {/* Unassigned activities at bottom */}
              {unassignedActivities.map(act => (
                <ActivityCard key={act.id} act={act} seqNum={null} showControls />
              ))}
            </div>
          )}

          <StepNav prev={3} next={5} nextLabel="See Results →" />
        </Panel>
      )}

      {/* ── STEP 5: Results ───────────────────────────── */}
      {implStep === 5 && (
        <Panel icon={<CheckCircle2 size={15} />} title="Results"
          sub={appliedCount > 0 ? `Last applied ${new Date(implLog[implLog.length - 1]?.appliedAt).toLocaleString()}` : 'No objects applied yet'}>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total',        value: totalCount,   color: 'text-blue-400' },
              { label: 'Auto Applied', value: implLog.filter(l => !MANUAL_TYPES.has(l.objectType ?? '')).length, color: 'text-green-400' },
              { label: 'Manual',       value: manualCount,  color: 'text-amber-400' },
              { label: '% Complete',   value: totalCount ? `${Math.round(appliedCount / totalCount * 100)}%` : '—', color: 'text-blue-400' },
              { label: 'Applied',      value: appliedCount, color: 'text-green-400' },
              { label: 'Remaining',    value: Math.max(0, totalCount - appliedCount), color: totalCount - appliedCount > 0 ? 'text-amber-400' : 'text-white/30' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className={`text-2xl font-bold font-variant-numeric-tabular ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {implLog.length > 0 && (
            <>
              <SectionLabel>Applied Objects</SectionLabel>
              <div className="space-y-1.5">
                {implLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10">
                    <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                    <span className="font-mono text-xs font-semibold text-white flex-shrink-0">{entry.objectName}</span>
                    <span className="text-xs text-white/50 truncate flex-1">{entry.activityTitle}</span>
                    {entry.transport && <span className="text-[10px] text-white/30 font-mono flex-shrink-0">{entry.transport}</span>}
                    <span className="text-[10px] text-white/25 flex-shrink-0">{new Date(entry.appliedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <StepNav prev={4} next={6} nextLabel="View Logs →" />
        </Panel>
      )}

      {/* ── STEP 6: Logs ──────────────────────────────── */}
      {implStep === 6 && (
        <Panel icon={<FileText size={15} />} title="Implementation Logs" sub="Platform events · AI code generation trace">
          <div className="flex gap-0 border-b border-white/10 -mt-2 mb-4">
            {[['platform', 'Platform Logs'], ['ai', 'AI Code Trace']].map(([key, label]) => (
              <button key={key} onClick={() => setLogTab(key)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px
                  ${logTab === key ? 'border-blue-500 text-blue-400' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                {label}
              </button>
            ))}
          </div>

          {logTab === 'platform' && (
            implLog.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-6">No implementation events yet.</p>
            ) : (
              <div className="space-y-1 font-mono text-xs max-h-80 overflow-y-auto">
                {implLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-white/5">
                    <span className="text-white/25 flex-shrink-0">{new Date(entry.appliedAt).toLocaleTimeString()}</span>
                    <span className="text-green-400 font-bold flex-shrink-0 w-8"> OK </span>
                    <span className="text-white/60">
                      <span className="text-blue-400">{entry.objectName}</span>
                      {' '}applied{entry.transport ? ` → ${entry.transport}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {logTab === 'ai' && (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {implActivities
                .filter(a => actState[a.id]?.generatedCode)
                .map(act => {
                  const obj = objectMap[act.id] ?? {};
                  const as  = actState[act.id] ?? {};
                  return (
                    <div key={act.id} className="rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/70">
                          <Sparkles size={11} /> {obj.objectName || act.title}
                        </span>
                        <span className="text-[10px] text-green-400 font-semibold">Generated</span>
                      </div>
                      <div className="px-3 py-2 text-xs text-blue-300/70 border-b border-white/5 bg-blue-500/10 font-mono">
                        PROMPT → {obj.objectType ?? 'program'} {obj.objectName} · {act.title}
                      </div>
                      <div className="px-3 py-2 max-h-28 overflow-y-auto">
                        <pre className="text-xs text-white/60 font-mono leading-relaxed whitespace-pre-wrap">
                          {as.generatedCode?.slice(0, 600)}{as.generatedCode?.length > 600 ? '\n…' : ''}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              {implActivities.filter(a => actState[a.id]?.generatedCode).length === 0 && (
                <p className="text-sm text-white/40 text-center py-6">No code generated yet. Go to <strong>Run</strong> and use Generate on any activity.</p>
              )}
            </div>
          )}

          <StepNav prev={5} />
        </Panel>
      )}
    </div>
  );
}

export { useClientProfile, ABAP_STANDARDS_DEFAULTS, resolveAbapStandards, buildAbapStandardsPrompt, sapObjectPath, SAP_ENV_TYPE_META, SapIntegrationPanel, ProjectSapEnvPanel, ProjectOwnSapPanel, AbapStandardsPanel, AbapTemplatesSection, SAP_OBJECT_TYPES, SapImplementationTab, SapBlueprintCanvas, BP_PHASES, BP_TYPES, BP_STATUS_STYLE, sapLiveCheck, sapFetchSource, detectSapObjectType };
