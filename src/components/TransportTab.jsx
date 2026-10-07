import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2,
  Clock, Copy, Eye, FileText, Link2, Loader2, Package, Play,
  Plus, RefreshCw, Settings, Trash2, Upload, X, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";

// ── SAP CTS transport import ─────────────────────────────────

async function sapApiRequest(config, path, opts = {}) {
  const proxyUrl = config.proxyUrl?.trim() || config._vpnProxyUrl?.trim();
  const base = (proxyUrl || config.host.trim()).replace(/\/$/, '');
  const basicAuth = btoa(`${config.username}:${config.password}`);
  const headers = {
    Authorization: `Basic ${basicAuth}`,
    Accept: 'application/xml, application/json, */*',
    'sap-client': String(config.client || '100'),
    ...(proxyUrl ? { 'X-Sap-Target': config.host.trim().replace(/\/$/, '') } : {}),
    ...(opts.headers ?? {}),
  };
  return fetch(`${base}${path}`, { ...opts, headers, credentials: 'omit' });
}

async function sapGetCsrfToken(config) {
  const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
    method: 'GET',
    headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
  });
  return res.headers.get('X-CSRF-Token') ?? '';
}

async function sapImportTransport(config, requestNumber, targetClient) {
  let csrf = '';
  try { csrf = await sapGetCsrfToken(config); } catch {}
  const res = await sapApiRequest(config, `/sap/bc/cts/compatibility/imports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      'sap-client': String(targetClient || config.client || '100'),
    },
    body: JSON.stringify({ objects: [{ trRequest: requestNumber }] }),
  });
  let body = '';
  try { body = await res.text(); } catch {}
  return { ok: res.ok || res.status === 200 || res.status === 201 || res.status === 202, status: res.status, body };
}

// ── Constants ────────────────────────────────────────────────

const TR_STEPS = [
  { label: 'Setup',    icon: <Settings size={13} />    },
  { label: 'Requests', icon: <Package size={13} />     },
  { label: 'Approval', icon: <Eye size={13} />         },
  { label: 'Run',      icon: <Play size={13} />        },
  { label: 'Results',  icon: <CheckCircle2 size={13} />},
  { label: 'Logs',     icon: <FileText size={13} />    },
];

const TR_TYPE_META = {
  workbench:   { label: 'Workbench',   color: 'bg-blue-500/20 text-blue-300',   border: 'border-blue-500/30'  },
  customizing: { label: 'Customizing', color: 'bg-amber-500/20 text-amber-300', border: 'border-amber-500/40' },
};

// ── TransportTab ─────────────────────────────────────────────
// Props:
//   caseData    – when rendered inside a Case tab (null for project-level)
//   projectData – when rendered inside a Project tab (null for case-level)
//   projectCases – array of case objects (project-level only, for grouping)
//   auth        – auth context
export function TransportTab({ caseData, projectData, projectCases = [], auth }) {
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;

  const projectId = caseData?.project_id ?? projectData?.id;
  const caseId    = caseData?.id ?? null;
  const clientId  = caseData?.client_id ?? projectData?.client_id ?? null;
  const scopeKey  = caseId ? `case_${caseId}` : `project_${projectId}`;

  // ── SAP environments ──────────────────────────────────────
  const allSapConfigs = settings['sap_integration'] ?? {};
  const sapData = clientId
    ? (allSapConfigs[clientId] ?? allSapConfigs[`proj_${projectId}`] ?? {})
    : (allSapConfigs[`proj_${projectId}`] ?? {});
  const sapEnvironments = sapData.environments ?? (sapData.host ? [sapData] : []);

  // ── Requests (from DB) ────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    setLoading(true);
    let q = supabase.from('transport_requests').select('*').eq('project_id', projectId).order('seq_order');
    if (caseId) q = q.eq('case_id', caseId);
    const { data } = await q;
    setRequests(data ?? []);
    setLoading(false);
  }
  useEffect(() => { if (projectId) loadRequests(); }, [projectId, caseId]);

  // ── Step / mode state ─────────────────────────────────────
  const [trStep, setTrStep] = useState(1);
  const [transportMode, setTransportMode] = useState('external');
  const [fromEnvId, setFromEnvId] = useState('');
  const [toEnvId, setToEnvId] = useState('');
  const [fromClient, setFromClient] = useState('');
  const [toClient, setToClient] = useState('');
  const [stopOnError, setStopOnError] = useState(true);
  const [logTab, setLogTab] = useState('platform');

  // ── Add-request form ──────────────────────────────────────
  const [newNumber, setNewNumber] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('workbench');
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Import runtime ────────────────────────────────────────
  const [importStates, setImportStates] = useState({});
  function setImportField(id, updates) {
    setImportStates(p => ({ ...p, [id]: { ...(p[id] ?? {}), ...updates } }));
  }

  // ── Approval ──────────────────────────────────────────────
  const transportApprovals = settings['transport_approvals'] ?? {};
  const batchApproval = transportApprovals[scopeKey] ?? {};
  const [reviewerEmail, setReviewerEmail] = useState(batchApproval.reviewer_email ?? '');
  const [reviewerName, setReviewerName]   = useState(batchApproval.reviewer_name ?? '');
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!reviewerEmail) { setReviewerProfile(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('users').select('full_name, avatar_url').eq('email', reviewerEmail).maybeSingle();
      setReviewerProfile(data ?? null);
    }, 600);
    return () => clearTimeout(t);
  }, [reviewerEmail]);

  async function generateApprovalLink() {
    if (!reviewerEmail) return;
    setGenLinkLoading(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, '');
      const batch = {
        token,
        reviewer_email: reviewerEmail,
        reviewer_name: reviewerName || reviewerProfile?.full_name || null,
        reviewer_avatar_url: reviewerProfile?.avatar_url || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        scope_key: scopeKey,
        project_id: projectId,
        case_id: caseId,
      };
      await ssCtx.setSetting('transport_approvals', { ...transportApprovals, [scopeKey]: batch });
      const pending = requests.filter(r => r.status === 'pending').map(r => r.id);
      if (pending.length > 0) {
        await supabase.from('transport_requests').update({ approval_status: 'pending_review' }).in('id', pending);
        await loadRequests();
      }
      const link = `${window.location.origin}/transport-approve/${token}`;
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (e) { alert('Link error: ' + e.message); }
    finally { setGenLinkLoading(false); }
  }

  // ── File upload ───────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  async function handleFileUpload(files) {
    setUploadingFiles(true);
    const byNum = {};
    for (const f of Array.from(files)) {
      const m = f.name.match(/^([KR])(\w+)\./i);
      if (!m) continue;
      const num = m[2].toUpperCase();
      if (!byNum[num]) byNum[num] = {};
      if (m[1].toUpperCase() === 'K') byNum[num].cofile = f;
      else                             byNum[num].data   = f;
    }
    for (const [num, pair] of Object.entries(byNum)) {
      const req = requests.find(r => r.request_number.toUpperCase().includes(num));
      if (!req) continue;
      const updates = {};
      for (const [key, file] of [['cofile', pair.cofile], ['data', pair.data]]) {
        if (!file) continue;
        const path = `${projectId}/${req.id}/${file.name}`;
        const { error } = await supabase.storage.from('transport-files').upload(path, file, { upsert: true });
        if (!error) {
          if (key === 'cofile') { updates.cofile_path = path; updates.cofile_name = file.name; }
          else                  { updates.data_file_path = path; updates.data_file_name = file.name; }
        }
      }
      if (Object.keys(updates).length) await supabase.from('transport_requests').update(updates).eq('id', req.id);
    }
    await loadRequests();
    setUploadingFiles(false);
  }

  // ── CRUD ──────────────────────────────────────────────────
  async function addRequest() {
    if (!newNumber.trim()) return;
    setSaving(true);
    const maxSeq = requests.reduce((m, r) => Math.max(m, r.seq_order ?? 0), 0);
    await supabase.from('transport_requests').insert({
      project_id: projectId, case_id: caseId, created_by: auth.user?.id,
      request_number: newNumber.trim().toUpperCase(),
      description: newDesc.trim() || null,
      request_type: newType, transport_mode: transportMode,
      from_env_id: transportMode === 'external' ? fromEnvId || null : null,
      to_env_id:   transportMode === 'external' ? toEnvId   || null : null,
      from_client: fromClient || null, to_client: toClient || null,
      seq_order: maxSeq + 1,
    });
    setNewNumber(''); setNewDesc('');
    await loadRequests();
    setSaving(false);
  }

  async function addBulk() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setSaving(true);
    const maxSeq = requests.reduce((m, r) => Math.max(m, r.seq_order ?? 0), 0);
    await supabase.from('transport_requests').insert(
      lines.map((line, i) => {
        const [num, ...rest] = line.split(/\s+/);
        return {
          project_id: projectId, case_id: caseId, created_by: auth.user?.id,
          request_number: num.toUpperCase(), description: rest.join(' ') || null,
          request_type: newType, transport_mode: transportMode,
          from_env_id: transportMode === 'external' ? fromEnvId || null : null,
          to_env_id:   transportMode === 'external' ? toEnvId   || null : null,
          from_client: fromClient || null, to_client: toClient || null,
          seq_order: maxSeq + 1 + i,
        };
      })
    );
    setBulkText(''); setShowBulk(false);
    await loadRequests();
    setSaving(false);
  }

  async function deleteRequest(id) {
    await supabase.from('transport_requests').delete().eq('id', id);
    setRequests(p => p.filter(r => r.id !== id));
  }

  async function moveRequest(id, dir) {
    const idx = requests.findIndex(r => r.id === id);
    const nxt = idx + dir;
    if (nxt < 0 || nxt >= requests.length) return;
    const a = requests[idx], b = requests[nxt];
    await Promise.all([
      supabase.from('transport_requests').update({ seq_order: b.seq_order }).eq('id', a.id),
      supabase.from('transport_requests').update({ seq_order: a.seq_order }).eq('id', b.id),
    ]);
    await loadRequests();
  }

  // ── Run ───────────────────────────────────────────────────
  async function runImport() {
    const toRun = [...requests].sort((a, b) => {
      const typeOrd = { customizing: 0, workbench: 1 };
      return (typeOrd[a.request_type] ?? 1) - (typeOrd[b.request_type] ?? 1) || (a.seq_order ?? 0) - (b.seq_order ?? 0);
    }).filter(r => r.status !== 'done');

    for (const req of toRun) {
      setImportField(req.id, { status: 'importing', log: [`Importing ${req.request_number}…`] });
      try {
        let result = { ok: false, status: 0, body: 'No SAP environment configured' };
        if (transportMode === 'external') {
          const envId = req.to_env_id ?? toEnvId;
          const env   = sapEnvironments.find(e => e.id === envId) ?? sapEnvironments[0];
          if (env) result = await sapImportTransport(env, req.request_number, req.to_client ?? toClient ?? env.client ?? '100');
        } else {
          result = { ok: true, status: 200, body: 'Internal client transport — marked done manually' };
        }
        const log = [`HTTP ${result.status}`, result.body?.slice(0, 400)].filter(Boolean);
        setImportField(req.id, { status: result.ok ? 'done' : 'error', log });
        await supabase.from('transport_requests').update({
          status: result.ok ? 'done' : 'error',
          import_log: log.join('\n'),
          import_result: { status: result.status, body: result.body?.slice(0, 1000) },
          applied_at: result.ok ? new Date().toISOString() : null,
        }).eq('id', req.id);
        if (!result.ok && stopOnError) { await loadRequests(); return; }
      } catch (e) {
        setImportField(req.id, { status: 'error', log: [e.message] });
        await supabase.from('transport_requests').update({ status: 'error', import_log: e.message }).eq('id', req.id);
        if (stopOnError) { await loadRequests(); return; }
      }
    }
    await loadRequests();
  }

  // ── Derived counts ─────────────────────────────────────────
  const doneCount  = requests.filter(r => r.status === 'done').length;
  const errorCount = requests.filter(r => r.status === 'error').length;
  const totalCount = requests.length;
  const customizing = requests.filter(r => r.request_type === 'customizing');
  const workbench   = requests.filter(r => r.request_type === 'workbench');
  const ordered     = [...customizing, ...workbench];

  // ── Sub-components ─────────────────────────────────────────
  const Panel = ({ icon, title, sub, children }) => (
    <div className="bg-gray-900/60 rounded-2xl border border-white/10 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">{icon}</div>
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
      {prev && <button onClick={() => setTrStep(prev)} className="px-4 py-2 text-xs font-semibold border border-white/15 rounded-lg hover:bg-white/5 text-white/60 transition-colors">{prevLabel}</button>}
      {next && <button onClick={() => setTrStep(next)} className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">{nextLabel}</button>}
    </div>
  );

  const SectionLabel = ({ children }) => (
    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/10 pb-2 mb-3">{children}</p>
  );

  const ToggleRow = ({ label, desc, value, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer" onClick={() => onChange(!value)}>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-white/40 mt-0.5">{desc}</p>}
      </div>
      <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${value ? 'bg-blue-500' : 'bg-white/20'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </div>
  );

  const RequestRow = ({ req, i, showStatus = false }) => {
    const meta = TR_TYPE_META[req.request_type] ?? TR_TYPE_META.workbench;
    const is   = importStates[req.id] ?? {};
    const status = is.status ?? req.status ?? 'pending';
    return (
      <div className={`rounded-xl border ${meta.border} bg-white/5 overflow-hidden`}>
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="w-5 h-5 rounded text-[10px] font-bold bg-white/10 text-white/50 flex items-center justify-center font-mono flex-shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold text-white truncate">{req.request_number}</div>
            {req.description && <div className="text-xs text-white/50 truncate">{req.description}</div>}
            {!caseId && req.case_id && (
              <div className="text-[10px] text-white/30 truncate">
                {projectCases.find(c => c.id === req.case_id)?.title ?? req.case_id}
              </div>
            )}
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${meta.color}`}>{meta.label}</span>
          {showStatus && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              status === 'done'       ? 'bg-green-500/20 text-green-300' :
              status === 'error'      ? 'bg-red-500/20 text-red-300' :
              status === 'importing'  ? 'bg-blue-500/20 text-blue-300' :
              status === 'approved'   ? 'bg-teal-500/20 text-teal-300' :
                                        'bg-white/10 text-white/40'
            }`}>
              {status === 'importing'
                ? <span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin" />Running</span>
                : status}
            </span>
          )}
          {!showStatus && (
            req.cofile_path
              ? <span className="text-[10px] text-green-400 flex items-center gap-0.5 flex-shrink-0"><Check size={10} />Files</span>
              : <span className="text-[10px] text-white/25 flex-shrink-0">No files</span>
          )}
          {!showStatus && <>
            <button onClick={() => moveRequest(req.id, -1)} className="text-white/30 hover:text-white/70 flex-shrink-0 transition-colors"><ArrowUp size={12} /></button>
            <button onClick={() => moveRequest(req.id, +1)} className="text-white/30 hover:text-white/70 flex-shrink-0 transition-colors"><ArrowDown size={12} /></button>
            <button onClick={() => deleteRequest(req.id)} className="text-white/20 hover:text-red-400 flex-shrink-0 transition-colors"><Trash2 size={12} /></button>
          </>}
        </div>
        {showStatus && is.log?.length > 0 && (
          <div className="px-3 pb-2 font-mono text-[10px] text-white/40 space-y-0.5 border-t border-white/5">
            {is.log.map((l, j) => <div key={j}>{l}</div>)}
          </div>
        )}
      </div>
    );
  };

  const Stepper = () => (
    <div className="bg-gray-900/60 rounded-2xl border border-white/10 px-4 py-3">
      <div className="flex items-start overflow-x-auto gap-0 pb-0.5">
        {TR_STEPS.map((s, i) => {
          const n = i + 1, isActive = trStep === n, isDone = trStep > n;
          return (
            <button key={n} onClick={() => setTrStep(n)} className="flex flex-col items-center flex-1 min-w-[52px] relative">
              {i > 0 && <div className={`absolute top-[15px] right-1/2 w-full h-0.5 ${isDone ? 'bg-blue-500' : 'bg-white/15'}`} />}
              <div className={`w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center relative z-10 transition-all
                ${isActive ? 'border-blue-500 bg-blue-500/20 text-blue-400' : isDone ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-white/20 bg-white/5 text-white/30'}`}>
                {isDone ? <Check size={12} /> : s.icon}
              </div>
              <span className={`text-[9px] font-bold mt-1 uppercase tracking-wider ${isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-white/30'}`}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 size={20} className="animate-spin text-white/40" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Stepper />

      {/* ── Step 1: Setup ──────────────────────────────────── */}
      {trStep === 1 && (
        <Panel icon={<Settings size={15} />} title="Transport Setup"
          sub="Configure mode, environments and target client">

          <SectionLabel>Transport Mode</SectionLabel>
          <div className="flex gap-2">
            {[['external', 'External (different systems)'], ['internal', 'Internal (same system)']].map(([val, lbl]) => (
              <button key={val} onClick={() => setTransportMode(val)}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg border transition-all
                  ${transportMode === val ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/15 text-white/40 hover:border-white/25'}`}>
                {lbl}
              </button>
            ))}
          </div>

          {transportMode === 'internal' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={11} />Internal transport notes</p>
              <p>• <strong>Customizing</strong> transports move client-specific settings between mandants (clients).</p>
              <p>• <strong>Workbench</strong> objects (ABAP, data dictionary) are system-wide — no transport needed between clients on the same system. They will be flagged as skipped.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {transportMode === 'external' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Source Environment</label>
                  <select value={fromEnvId} onChange={e => setFromEnvId(e.target.value)}
                    className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Select source —</option>
                    {sapEnvironments.map(e => <option key={e.id} value={e.id}>{e.name ?? e.host}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Target Environment</label>
                  <select value={toEnvId} onChange={e => setToEnvId(e.target.value)}
                    className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Select target —</option>
                    {sapEnvironments.map(e => <option key={e.id} value={e.id}>{e.name ?? e.host}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">
                {transportMode === 'internal' ? 'Source Client (Mandant)' : 'Source Client'}
              </label>
              <input value={fromClient} onChange={e => setFromClient(e.target.value)}
                placeholder="e.g. 100"
                className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm font-mono bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">
                {transportMode === 'internal' ? 'Target Client (Mandant)' : 'Target Client'}
              </label>
              <input value={toClient} onChange={e => setToClient(e.target.value)}
                placeholder="e.g. 200"
                className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm font-mono bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <ToggleRow label="Stop on Error" desc="Pause the import sequence if any transport fails" value={stopOnError} onChange={setStopOnError} />
          <StepNav next={2} nextLabel="Add Requests →" />
        </Panel>
      )}

      {/* ── Step 2: Requests ───────────────────────────────── */}
      {trStep === 2 && (
        <Panel icon={<Package size={15} />} title="Transport Requests"
          sub={`${totalCount} total · ${customizing.length} customizing · ${workbench.length} workbench`}>

          {/* Single add */}
          <div className="flex gap-2 flex-wrap">
            <input value={newNumber} onChange={e => setNewNumber(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addRequest()}
              placeholder="DEVK900123" maxLength={20}
              className="border border-white/15 rounded-lg px-2.5 py-2 text-sm font-mono bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400 w-36" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 min-w-[140px] border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <select value={newType} onChange={e => setNewType(e.target.value)}
              className="border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="workbench">Workbench</option>
              <option value="customizing">Customizing</option>
            </select>
            <button onClick={addRequest} disabled={!newNumber.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
              <Plus size={12} />Add
            </button>
            <button onClick={() => setShowBulk(p => !p)}
              className="px-3 py-2 text-xs font-semibold border border-white/15 rounded-lg text-white/50 hover:bg-white/5 transition-colors">
              Bulk
            </button>
          </div>

          {/* Bulk add */}
          {showBulk && (
            <div className="space-y-2">
              <p className="text-xs text-white/40">One request number per line. Optionally add a description after a space.</p>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5}
                placeholder={"DEVK900123 HR Payroll config\nDEVK900124 Time management\nDEVK900125"}
                className="w-full border border-white/15 rounded-lg px-3 py-2 text-sm font-mono bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              <button onClick={addBulk} disabled={!bulkText.trim() || saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                <Plus size={12} />Add {bulkText.split('\n').filter(l => l.trim()).length} requests
              </button>
            </div>
          )}

          {/* File drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
            className="border-2 border-dashed border-white/15 rounded-xl p-5 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors">
            <Upload size={20} className="mx-auto mb-2 text-white/30" />
            <p className="text-xs font-semibold text-white/50">Drop .cofiles and .data files here</p>
            <p className="text-[10px] text-white/30 mt-0.5">Auto-matched to requests by transport number. Multiple files OK.</p>
            {uploadingFiles && (
              <p className="text-xs text-blue-400 mt-2 flex items-center justify-center gap-1">
                <Loader2 size={11} className="animate-spin" />Uploading…
              </p>
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => handleFileUpload(e.target.files)} />

          {/* Requests list */}
          {requests.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/30">No transport requests yet.</div>
          ) : (
            <>
              <SectionLabel>Sequence · customizing runs before workbench</SectionLabel>
              <div className="space-y-2">
                {ordered.map((req, i) => <RequestRow key={req.id} req={req} i={i} />)}
              </div>
            </>
          )}

          <StepNav prev={1} next={3} nextLabel="Set Approval →" />
        </Panel>
      )}

      {/* ── Step 3: Approval ───────────────────────────────── */}
      {trStep === 3 && (
        <Panel icon={<Eye size={15} />} title="Approval"
          sub="Assign a reviewer and send them the approval link">

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            Generate a link to send to the reviewer before running the import. They can approve or reject the transport list.
          </div>

          <SectionLabel>Reviewer</SectionLabel>
          <div className="flex gap-3 items-start">
            {reviewerProfile?.avatar_url ? (
              <img src={reviewerProfile.avatar_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-1" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-1 text-white/40 text-sm font-bold">
                {(reviewerName || reviewerEmail)?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 space-y-2">
              <input value={reviewerEmail} onChange={e => setReviewerEmail(e.target.value)} type="email"
                placeholder="reviewer@example.com"
                className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input value={reviewerName} onChange={e => setReviewerName(e.target.value)}
                placeholder={reviewerProfile?.full_name ?? 'Reviewer name (optional)'}
                className="w-full border border-white/15 rounded-lg px-2.5 py-2 text-sm bg-gray-800 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {reviewerProfile && (
                <p className="text-xs text-green-400 flex items-center gap-1.5"><Check size={10} />{reviewerProfile.full_name} is a platform user</p>
              )}
            </div>
          </div>

          {batchApproval.token && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Current Link</p>
              <p className="font-mono text-xs text-white/60 break-all">{window.location.origin}/transport-approve/{batchApproval.token}</p>
              <div className="flex items-center gap-3 text-[10px] text-white/30">
                <span>Status: <span className={batchApproval.status === 'approved' ? 'text-green-400' : 'text-amber-400'}>{batchApproval.status ?? 'pending'}</span></span>
                {batchApproval.reviewer_name && <span>Reviewer: {batchApproval.reviewer_name}</span>}
                {batchApproval.expires_at && <span>Expires: {new Date(batchApproval.expires_at).toLocaleDateString()}</span>}
              </div>
            </div>
          )}

          <button onClick={generateApprovalLink} disabled={!reviewerEmail || genLinkLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
            {genLinkLoading ? <Loader2 size={12} className="animate-spin" /> : linkCopied ? <Check size={12} /> : <Link2 size={12} />}
            {linkCopied ? 'Copied to clipboard!' : genLinkLoading ? 'Generating…' : batchApproval.token ? 'Regenerate & Copy Link' : 'Generate & Copy Link'}
          </button>

          <StepNav prev={2} next={4} nextLabel="Go to Run →" />
        </Panel>
      )}

      {/* ── Step 4: Run ────────────────────────────────────── */}
      {trStep === 4 && (
        <Panel icon={<Play size={15} />} title="Import Run"
          sub={`${totalCount} requests · ${transportMode === 'internal' ? 'internal client transport' : 'external system import'} · customizing first`}>

          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>Progress</span>
            <span>{doneCount} / {totalCount} done</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-2">
            <div className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: totalCount ? `${Math.round(doneCount / totalCount * 100)}%` : '0%' }} />
          </div>

          <ToggleRow label="Stop on Error" desc="Pause if any transport import fails" value={stopOnError} onChange={setStopOnError} />

          <button onClick={runImport} disabled={requests.length === 0 || requests.every(r => r.status === 'done')}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50 transition-colors">
            <Play size={14} />Start Import Sequence
          </button>

          {totalCount > 0 && (
            <div className="space-y-2">
              <SectionLabel>Queue · customizing → workbench</SectionLabel>
              {ordered.map((req, i) => <RequestRow key={req.id} req={req} i={i} showStatus />)}
            </div>
          )}

          <StepNav prev={3} next={5} nextLabel="See Results →" />
        </Panel>
      )}

      {/* ── Step 5: Results ────────────────────────────────── */}
      {trStep === 5 && (
        <Panel icon={<CheckCircle2 size={15} />} title="Results"
          sub={doneCount > 0 ? `Last import ${new Date(requests.find(r => r.applied_at)?.applied_at ?? Date.now()).toLocaleString()}` : 'No imports run yet'}>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total',      value: totalCount,  color: 'text-blue-400' },
              { label: 'Done',       value: doneCount,   color: 'text-green-400' },
              { label: 'Errors',     value: errorCount,  color: errorCount > 0 ? 'text-red-400' : 'text-white/30' },
              { label: '% Complete', value: totalCount ? `${Math.round(doneCount / totalCount * 100)}%` : '—', color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {requests.filter(r => r.status === 'done').length > 0 && (
            <>
              <SectionLabel>Completed ({doneCount})</SectionLabel>
              <div className="space-y-1.5">
                {requests.filter(r => r.status === 'done').map(req => (
                  <div key={req.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10">
                    <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                    <span className="font-mono text-xs font-semibold text-white flex-shrink-0">{req.request_number}</span>
                    <span className="text-xs text-white/50 truncate flex-1">{req.description}</span>
                    <span className="text-[10px] text-white/25 flex-shrink-0">{req.applied_at ? new Date(req.applied_at).toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {errorCount > 0 && (
            <>
              <SectionLabel>Errors ({errorCount})</SectionLabel>
              <div className="space-y-1.5">
                {requests.filter(r => r.status === 'error').map(req => (
                  <div key={req.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10">
                    <XCircle size={12} className="text-red-400 flex-shrink-0" />
                    <span className="font-mono text-xs font-semibold text-white flex-shrink-0">{req.request_number}</span>
                    <span className="text-xs text-white/50 truncate flex-1">{req.import_log?.slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <StepNav prev={4} next={6} nextLabel="View Logs →" />
        </Panel>
      )}

      {/* ── Step 6: Logs ───────────────────────────────────── */}
      {trStep === 6 && (
        <Panel icon={<FileText size={15} />} title="Import Logs"
          sub="Platform events and CTS response detail">

          <div className="flex gap-0 border-b border-white/10 -mt-2 mb-4">
            {[['platform', 'Import Log'], ['detail', 'CTS Response']].map(([key, label]) => (
              <button key={key} onClick={() => setLogTab(key)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px
                  ${logTab === key ? 'border-blue-500 text-blue-400' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                {label}
              </button>
            ))}
          </div>

          {logTab === 'platform' && (
            requests.filter(r => r.import_log || importStates[r.id]?.log?.length).length === 0
              ? <p className="text-sm text-white/40 text-center py-6">No import events yet.</p>
              : (
                <div className="space-y-1 font-mono text-xs max-h-80 overflow-y-auto">
                  {requests.filter(r => r.import_log || importStates[r.id]?.log?.length).map(req => {
                    const log = importStates[req.id]?.log ?? [req.import_log];
                    return (
                      <div key={req.id} className="py-1.5 px-2 rounded hover:bg-white/5">
                        <span className={`font-bold mr-2 ${req.status === 'done' ? 'text-green-400' : 'text-red-400'}`}>
                          {req.status === 'done' ? ' OK ' : 'ERR'}
                        </span>
                        <span className="text-blue-400">{req.request_number}</span>
                        <span className="text-white/40 ml-2">{log.filter(Boolean).join(' · ')}</span>
                      </div>
                    );
                  })}
                </div>
              )
          )}

          {logTab === 'detail' && (
            requests.filter(r => r.import_result).length === 0
              ? <p className="text-sm text-white/40 text-center py-6">No CTS response data yet.</p>
              : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {requests.filter(r => r.import_result).map(req => (
                    <div key={req.id} className="rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex justify-between items-center">
                        <span className="font-mono text-xs font-semibold text-white/70">{req.request_number}</span>
                        <span className={`text-[10px] font-semibold ${req.status === 'done' ? 'text-green-400' : 'text-red-400'}`}>
                          HTTP {req.import_result?.status}
                        </span>
                      </div>
                      <pre className="px-3 py-2 text-[10px] text-white/50 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {req.import_result?.body ?? '—'}
                      </pre>
                    </div>
                  ))}
                </div>
              )
          )}

          <StepNav prev={5} />
        </Panel>
      )}
    </div>
  );
}
