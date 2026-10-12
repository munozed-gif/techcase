// ============================================================
// MigrationViews.jsx — SAP Migration Hub
// Modules: Migration Project Hub, SAP Activate Phase Gates,
//          WRICEF Registry, Cutover Planner
// ============================================================

import { useState, useEffect, useCallback, Fragment, useRef } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, BookOpen, Calendar,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock,
  Code2, Database, Download, FileText, Filter, Layers, Link2,
  Loader2, Milestone, Plus, RefreshCw, Rocket, Settings,
  ShieldCheck, Trash2, Users, X, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { callClaude } from "../lib/utils.js";
import { useT } from "../i18n/index.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";
import { DEFAULT_MIGRATION_CONFIG } from "../lib/businessConstants.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES = ['discover', 'prepare', 'explore', 'realize', 'deploy', 'run'];

const PHASE_LABEL_KEYS = {
  discover: 'mig.phase_discover',
  prepare:  'mig.phase_prepare',
  explore:  'mig.phase_explore',
  realize:  'mig.phase_realize',
  deploy:   'mig.phase_deploy',
  run:      'mig.phase_run',
};

const PHASE_HEX = {
  discover: '#7C3AED', prepare: '#2563EB', explore: '#0891B2',
  realize:  '#D97706', deploy:  '#16A34A', run:     '#059669',
};
const PHASE_LIGHT = {
  discover: '#A78BFA', prepare: '#60A5FA', explore: '#22D3EE',
  realize:  '#FCD34D', deploy:  '#4ADE80', run:     '#34D399',
};

const PHASE_COLORS = {
  discover: { dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', border: 'border-l-violet-400' },
  prepare:  { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',     border: 'border-l-blue-400' },
  explore:  { dot: 'bg-cyan-500',   badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',     border: 'border-l-cyan-400' },
  realize:  { dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', border: 'border-l-amber-400' },
  deploy:   { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', border: 'border-l-green-400' },
  run:      { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', border: 'border-l-emerald-400' },
};

const PHASE_DELIVERABLES = {
  discover: [
    'Business case & ROI analysis',
    'High-level scope definition',
    'Stakeholder identification',
    'Executive sponsorship confirmed',
    'Vendor selection completed',
  ],
  prepare: [
    'Project charter signed',
    'Project team onboarded',
    'System landscape defined',
    'SAP Activate roadmap confirmed',
    'Project governance established',
    'Development environment ready',
  ],
  explore: [
    'Fit-to-standard workshops completed',
    'Business process scope confirmed',
    'Delta design decisions documented',
    'WRICEF inventory completed',
    'Data migration strategy approved',
    'Configuration specs signed off',
  ],
  realize: [
    'Baseline configuration completed',
    'WRICEF objects developed & unit tested',
    'Integration testing completed',
    'UAT completed & signed off',
    'Data migration trial runs completed',
    'Cutover plan approved',
    'Training materials ready',
  ],
  deploy: [
    'Go-live readiness checklist approved',
    'Dress rehearsal 1 completed',
    'Dress rehearsal 2 completed',
    'Go/no-go decision confirmed',
    'Production cutover executed',
    'Hypercare plan activated',
  ],
  run: [
    'Hypercare period completed',
    'Knowledge transfer done',
    'Support contract activated',
    'Project closure report signed',
  ],
};

const WRICEF_META = {
  W: { label: 'Workflow',    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  R: { label: 'Report',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  I: { label: 'Interface',   cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  C: { label: 'Conversion',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  E: { label: 'Enhancement', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  F: { label: 'Form',        cls: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
};

const WRICEF_STATUS_CLS = {
  open:        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  remediated:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  tested:      'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  signed_off:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const RUN_TYPE_LABEL_KEYS = {
  dr1:     'mig.dr1',
  dr2:     'mig.dr2',
  go_live: 'mig.go_live_run',
};

const RUN_TYPE_COLORS = {
  dr1:     'border-t-4 border-t-blue-400',
  dr2:     'border-t-4 border-t-indigo-400',
  go_live: 'border-t-4 border-t-green-400',
};

const RUN_STATUS_CLS = {
  planned:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
};

const TASK_STATUS_CLS = {
  pending:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done:        'bg-green-100 text-green-700',
  skipped:     'bg-gray-100 text-gray-400',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

const fmtDate = d => d ? new Date(d).toLocaleDateString() : '—';
const fmtDt   = d => d ? new Date(d).toLocaleString()     : '—';

function cap(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function useFetchUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    supabase.from('users').select('id, full_name').then(({ data }) => {
      if (data) setUsers(data);
    });
  }, []);
  return users;
}

function userName(users, id) {
  if (!id) return '—';
  return users.find(u => u.id === id)?.full_name ?? '—';
}

// ─── MigrationHub ─────────────────────────────────────────────────────────────

export function MigrationHub({ auth }) {
  const { t } = useT();
  const [migProjects, setMigProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('migration_projects')
      .select('*, project:project_id(id, name, status)')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setMigProjects(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <MigrationProjectDetail
        migProject={selected}
        auth={auth}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Milestone className="w-6 h-6 text-blue-500" />
            {t('mig.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('mig.subtitle')}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('mig.new_project')}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg mb-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : migProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Milestone className="w-10 h-10 text-gray-300 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('mig.no_projects')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {migProjects.map(mp => (
            <MigrationProjectCard
              key={mp.id}
              mp={mp}
              t={t}
              onClick={() => setSelected(mp)}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateMigrationModal
          auth={auth}
          t={t}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── MigrationProjectCard ─────────────────────────────────────────────────────

function MigrationProjectCard({ mp, t, onClick }) {
  const phase = mp.current_phase ?? 'discover';
  const pc = PHASE_COLORS[phase] ?? PHASE_COLORS.discover;
  const approachColors = {
    greenfield: 'bg-green-100 text-green-700',
    brownfield: 'bg-amber-100 text-amber-700',
    bluefield:  'bg-blue-100 text-blue-700',
  };
  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
          {mp.project?.name ?? '—'}
        </h3>
        <Badge className={approachColors[mp.approach] ?? 'bg-gray-100 text-gray-600'}>
          {t(`mig.${mp.approach ?? 'brownfield'}`)}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
        <span><span className="font-medium text-gray-700 dark:text-gray-300">{t('mig.source_version')}:</span> {mp.source_version ?? '—'}</span>
        <span><span className="font-medium text-gray-700 dark:text-gray-300">{t('mig.target_version')}:</span> {mp.target_version ?? '—'}</span>
        <span><span className="font-medium text-gray-700 dark:text-gray-300">{t('mig.go_live')}:</span> {fmtDate(mp.go_live_date)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${pc.dot}`} />
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${pc.badge}`}>
          {t(`mig.phase_${phase}`)}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{t('mig.current_phase')}</span>
      </div>
    </button>
  );
}

// ─── CreateMigrationModal ─────────────────────────────────────────────────────

function CreateMigrationModal({ auth, t, onClose, onCreated }) {
  const [projects, setProjects] = useState([]);
  const [loadingProj, setLoadingProj] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [form, setForm] = useState({
    project_id: '',
    approach: 'brownfield',
    source_version: '',
    target_version: 'SAP S/4HANA 2023',
    go_live_date: '',
  });

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => {
      setProjects(data ?? []);
      setLoadingProj(false);
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.project_id) { setErrMsg(t('mig.select_project_required')); return; }
    setSaving(true);
    setErrMsg('');
    try {
      // Create migration project
      const { data: mp, error: mpErr } = await supabase
        .from('migration_projects')
        .insert({
          project_id: form.project_id,
          approach: form.approach,
          source_version: form.source_version || null,
          target_version: form.target_version || 'SAP S/4HANA 2023',
          go_live_date: form.go_live_date || null,
          current_phase: 'discover',
          created_by: auth.user?.id,
        })
        .select()
        .single();
      if (mpErr) throw new Error(mpErr.message);

      // Fetch migration config for seeding
      const { data: cfgRow } = await supabase.from('system_settings').select('value').eq('key', 'migration_config').maybeSingle();
      const migConfig = cfgRow?.value ?? DEFAULT_MIGRATION_CONFIG;
      const configPhases = (migConfig.phases ?? DEFAULT_MIGRATION_CONFIG.phases);

      // Seed phase deliverables
      const deliverables = [];
      for (const phaseCfg of configPhases) {
        for (const title of (phaseCfg.deliverables ?? [])) {
          deliverables.push({ migration_project_id: mp.id, phase: phaseCfg.key, title });
        }
      }
      await supabase.from('migration_phase_deliverables').insert(deliverables);

      // Seed phase gates
      const gates = configPhases.map(p => ({
        migration_project_id: mp.id,
        phase: p.key,
        status: 'not_started',
      }));
      await supabase.from('migration_phase_gates').insert(gates);

      // Seed cutover runs
      const runs = ['dr1', 'dr2', 'go_live'].map(run_type => ({
        migration_project_id: mp.id,
        run_type,
      }));
      await supabase.from('cutover_runs').insert(runs);

      onCreated();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  const projOptions = [
    { value: '', label: `— ${t('mig.select_project')} —` },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];
  const approachOptions = [
    { value: 'brownfield', label: t('mig.brownfield') },
    { value: 'greenfield', label: t('mig.greenfield') },
    { value: 'bluefield',  label: t('mig.bluefield') },
  ];

  return (
    <Modal open onClose={onClose} title={t('mig.new_project')}>
      <form onSubmit={handleSubmit}>
        {loadingProj ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
        ) : (
          <>
            <Select
              label={t('mig.select_project')}
              options={projOptions}
              value={form.project_id}
              onChange={e => set('project_id', e.target.value)}
            />
            <Select
              label={t('mig.approach')}
              options={approachOptions}
              value={form.approach}
              onChange={e => set('approach', e.target.value)}
            />
            <Input
              label={t('mig.source_version')}
              placeholder="e.g. SAP ECC 6.0 EHP8"
              value={form.source_version}
              onChange={e => set('source_version', e.target.value)}
            />
            <Input
              label={t('mig.target_version')}
              placeholder="e.g. SAP S/4HANA 2023"
              value={form.target_version}
              onChange={e => set('target_version', e.target.value)}
            />
            <Input
              label={t('mig.go_live')}
              type="date"
              value={form.go_live_date}
              onChange={e => set('go_live_date', e.target.value)}
            />
          </>
        )}
        {errMsg && (
          <p className="text-red-600 text-xs mb-3 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />{errMsg}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white">
            {t('action.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || loadingProj}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? t('mig.creating') : t('mig.create_btn')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── MigrationProjectDetail ───────────────────────────────────────────────────

function MigrationProjectDetail({ migProject, auth, onBack }) {
  const { t } = useT();
  const [activeWorkstream, setActiveWorkstream] = useState('wricef');
  const [showSync, setShowSync] = useState(false);

  const workstreams = [
    { id: 'wricef',  label: t('mig.tab_wricef'),  Icon: Code2,     color: '#7C3AED', colorLight: '#A78BFA', sub: 'Objects & sign-off' },
    { id: 'cutover', label: t('mig.tab_cutover'),  Icon: RefreshCw, color: '#2563EB', colorLight: '#60A5FA', sub: 'Runs & task plan' },
    { id: 'data',    label: t('mig.tab_data'),     Icon: Database,  color: '#0891B2', colorLight: '#22D3EE', sub: 'Extraction & loads' },
    { id: 'simplif', label: t('mig.tab_simplif'),  Icon: Layers,    color: '#D97706', colorLight: '#FCD34D', sub: 'Scope simplification' },
    { id: 'cases',   label: t('mig.tab_cases'),    Icon: FileText,  color: '#16A34A', colorLight: '#4ADE80', sub: 'Linked support cases' },
  ];

  const approachColors = {
    greenfield: 'bg-green-100 text-green-700',
    brownfield: 'bg-amber-100 text-amber-700',
    bluefield:  'bg-blue-100 text-blue-700',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('mig.back')}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {migProject.project?.name ?? '—'}
          </h1>
          <Badge className={approachColors[migProject.approach] ?? 'bg-gray-100 text-gray-600'}>
            {t(`mig.${migProject.approach ?? 'brownfield'}`)}
          </Badge>
          <button
            onClick={() => setShowSync(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Link2 size={13} />
            {t('mig.sync_btn')}
          </button>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{t('mig.source_version')}: <strong className="text-gray-700 dark:text-gray-300">{migProject.source_version ?? '—'}</strong></span>
          <span>{t('mig.target_version')}: <strong className="text-gray-700 dark:text-gray-300">{migProject.target_version ?? '—'}</strong></span>
          <span>{t('mig.go_live')}: <strong className="text-gray-700 dark:text-gray-300">{fmtDate(migProject.go_live_date)}</strong></span>
        </div>
      </div>

      {/* Phase carousel — always visible */}
      <PhasesTab migProject={migProject} auth={auth} />

      {/* Workstream section — pill tabs + content card */}
      <div style={{ marginTop: 28 }}>
        {/* Pill tab row — same style as cases detail tab bar */}
        <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch", gap:8, paddingBottom:2 }}>
          {workstreams.map((ws) => {
            const isActiveWs = ws.id === activeWorkstream;
            const { Icon } = ws;
            return (
              <button key={ws.id}
                onClick={() => setActiveWorkstream(ws.id)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:99,
                  border:`1.5px solid ${isActiveWs ? ws.color : "rgba(100,160,220,.18)"}`,
                  background: isActiveWs ? ws.color : "rgba(100,160,220,.06)",
                  color: isActiveWs ? "#fff" : "var(--t-text2)",
                  fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                  boxShadow: isActiveWs ? `0 0 0 3px ${ws.color}30` : "none",
                  transition:"all .2s" }}>
                <Icon size={14} />
                {ws.label}
              </button>
            );
          })}
        </div>

        {/* Content card */}
        <div style={{ marginTop:16, background:"var(--t-card-bg)", borderRadius:12, border:"1px solid rgba(100,160,220,.12)", padding:20 }}>
          {activeWorkstream === 'wricef'  && <WricefTab   migProject={migProject} auth={auth} />}
          {activeWorkstream === 'cutover' && <CutoverTab  migProject={migProject} auth={auth} />}
          {activeWorkstream === 'data'    && <DataTab     migProject={migProject} auth={auth} />}
          {activeWorkstream === 'simplif' && <SimplifTab  migProject={migProject} auth={auth} />}
          {activeWorkstream === 'cases'   && <MigCasesTab migProject={migProject} />}
        </div>
      </div>

      {showSync && (
        <SyncModal
          migProject={migProject}
          onClose={() => setShowSync(false)}
          onDone={() => setActiveWorkstream('cases')}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULE 1 — SAP Activate Phase Gates
// ════════════════════════════════════════════════════════════════

function PhasesTab({ migProject, auth }) {
  const { t } = useT();
  const users = useFetchUsers();
  const [gates, setGates]           = useState({});
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [activeCIdx, setActiveCIdx] = useState(() => Math.max(0, PHASES.indexOf(migProject.current_phase ?? 'discover')));
  const phaseTrackRef = useRef(null);
  const [marking, setMarking]       = useState(null);
  const [toggling, setToggling]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: gateData, error: gErr }, { data: delivData, error: dErr }] = await Promise.all([
      supabase.from('migration_phase_gates').select('*').eq('migration_project_id', migProject.id),
      supabase.from('migration_phase_deliverables').select('*').eq('migration_project_id', migProject.id),
    ]);
    if (gErr || dErr) { setError((gErr ?? dErr).message); }
    else {
      const gateMap = {};
      (gateData ?? []).forEach(g => { gateMap[g.phase] = g; });
      setGates(gateMap);
      setDeliverables(delivData ?? []);
    }
    setLoading(false);
  }, [migProject.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || !phaseTrackRef.current) return;
    const card = phaseTrackRef.current.children[activeCIdx];
    if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCIdx, loading]);

  async function toggleDeliverable(deliverable) {
    if (toggling) return;
    const newVal = !deliverable.completed;
    setToggling(deliverable.id);
    const update = {
      completed: newVal,
      completed_by: newVal ? auth.user?.id : null,
      completed_at: newVal ? new Date().toISOString() : null,
    };
    const { error: err } = await supabase
      .from('migration_phase_deliverables')
      .update(update)
      .eq('id', deliverable.id);
    if (!err) {
      setDeliverables(prev =>
        prev.map(d => d.id === deliverable.id ? { ...d, ...update } : d)
      );
      // Update phase gate status to in_progress if any deliverable is now checked
      const phase = deliverable.phase;
      const phaseDelivs = deliverables.map(d =>
        d.id === deliverable.id ? { ...d, ...update } : d
      ).filter(d => d.phase === phase);
      const anyDone = phaseDelivs.some(d => d.completed);
      const gate = gates[phase];
      if (gate && gate.status === 'not_started' && anyDone) {
        await supabase.from('migration_phase_gates')
          .update({ status: 'in_progress' })
          .eq('id', gate.id);
        setGates(prev => ({ ...prev, [phase]: { ...gate, status: 'in_progress' } }));
      }
    }
    setToggling(null);
  }

  async function markPhaseComplete(phase) {
    const phaseDelivs = deliverables.filter(d => d.phase === phase);
    if (!phaseDelivs.every(d => d.completed)) return;
    const gate = gates[phase];
    if (!gate) return;
    setMarking(phase);
    const update = {
      status: 'completed',
      approved_by: auth.user?.id,
      approved_at: new Date().toISOString(),
    };
    const { error: err } = await supabase
      .from('migration_phase_gates')
      .update(update)
      .eq('id', gate.id);
    if (!err) {
      setGates(prev => ({ ...prev, [phase]: { ...gate, ...update } }));
      // Advance current_phase on migration_project if applicable
      const idx = PHASES.indexOf(phase);
      if (idx >= 0 && idx < PHASES.length - 1) {
        const nextPhase = PHASES[idx + 1];
        if (migProject.current_phase === phase) {
          await supabase.from('migration_projects')
            .update({ current_phase: nextPhase })
            .eq('id', migProject.id);
          migProject.current_phase = nextPhase;
        }
      }
    }
    setMarking(null);
  }

  if (loading) return <Spinner />;
  if (error)   return <p className="text-red-600 text-sm">{error}</p>;

  const stepperActiveIdx = PHASES.indexOf(migProject.current_phase ?? 'discover');

  return (
    <div>
      {/* Horizontal Stepper — kept */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex items-center min-w-max gap-0">
          {PHASES.map((phase, idx) => {
            const gate = gates[phase];
            const status = gate?.status ?? 'not_started';
            const pc = PHASE_COLORS[phase];
            const isActive = idx === stepperActiveIdx;
            const isDone   = status === 'completed';
            return (
              <div key={phase} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isDone   ? `${pc.dot} text-white border-transparent` :
                    isActive ? `border-blue-500 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400` :
                               'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400'
                  }`}>
                    {isDone ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className={`mt-1.5 text-xs font-medium whitespace-nowrap ${
                    isActive ? 'text-blue-600 dark:text-blue-400' :
                    isDone   ? 'text-gray-600 dark:text-gray-300' :
                               'text-gray-400 dark:text-gray-500'
                  }`}>
                    {t(PHASE_LABEL_KEYS[phase])}
                  </span>
                </div>
                {idx < PHASES.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 mb-4 ${
                    PHASES.slice(0, idx + 1).every(p => (gates[p]?.status ?? '') === 'completed')
                      ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase carousel */}
      <div style={{ position: "relative" }}>
        {activeCIdx > 0 && (
          <button onClick={() => setActiveCIdx(i => Math.max(0, i - 1))}
            style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-60%)", zIndex:10, width:30, height:30, borderRadius:"50%", border:"1.5px solid var(--t-arrow-border)", background:"var(--t-arrow-bg)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.15)" }}>
            <ChevronLeft size={15} style={{ color:"var(--t-text2)" }} />
          </button>
        )}
        {activeCIdx < PHASES.length - 1 && (
          <button onClick={() => setActiveCIdx(i => Math.min(PHASES.length - 1, i + 1))}
            style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-60%)", zIndex:10, width:30, height:30, borderRadius:"50%", border:"1.5px solid var(--t-arrow-border)", background:"var(--t-arrow-bg)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.15)" }}>
            <ChevronRight size={15} style={{ color:"var(--t-text2)" }} />
          </button>
        )}

        <div ref={phaseTrackRef}
          style={{ display:"flex", overflowX:"scroll", scrollSnapType:"x mandatory", scrollbarWidth:"none", WebkitOverflowScrolling:"touch", gap:10, padding:"4px 20px 8px" }}>
          {PHASES.map((phase, idx) => {
            const gate = gates[phase];
            const status = gate?.status ?? 'not_started';
            const phaseDelivs = deliverables.filter(d => d.phase === phase);
            const doneCount   = phaseDelivs.filter(d => d.completed).length;
            const allDone     = phaseDelivs.length > 0 && doneCount === phaseDelivs.length;
            const isActive    = idx === activeCIdx;
            const canComplete = (auth.isAdmin || auth.isManager) && allDone && status !== 'completed';

            const color      = PHASE_HEX[phase];
            const colorLight = PHASE_LIGHT[phase];
            const statusLabel = { not_started: t('mig.phase_not_started'), in_progress: t('mig.phase_in_progress'), completed: t('mig.phase_completed') }[status] ?? status;
            const statusBg    = status === 'completed' ? 'rgba(34,197,94,.15)' : status === 'in_progress' ? `${color}33` : 'rgba(100,116,139,.12)';
            const statusColor = status === 'completed' ? '#22C55E' : status === 'in_progress' ? colorLight : 'var(--t-text2)';
            const borderColor = isActive ? (status === 'completed' ? 'rgba(34,197,94,.5)' : status === 'in_progress' ? color : 'rgba(100,116,139,.3)') : 'rgba(100,160,220,.1)';
            const cardBg      = isActive && status === 'in_progress' ? `${color}0d` : 'var(--t-card-bg)';
            const headerBg    = isActive ? (status === 'in_progress' ? `${color}22` : status === 'completed' ? 'rgba(34,197,94,.12)' : 'var(--t-tab-active)') : 'transparent';

            return (
              <div key={phase}
                style={{ flex:"0 0 calc(33.333% - 8px)", width:"calc(33.333% - 8px)", minWidth:0, scrollSnapAlign:"center", scrollSnapStop:"always",
                  height:340, borderRadius:12, border:`1px solid ${borderColor}`, background:cardBg,
                  display:"flex", flexDirection:"column", overflow:"hidden",
                  cursor: isActive ? "default" : "pointer",
                  opacity: isActive ? 1 : 0.5, transform: isActive ? "scale(1)" : "scale(0.97)",
                  transition:"opacity .25s, transform .25s, box-shadow .25s",
                  boxShadow: isActive ? "0 4px 20px rgba(0,0,0,.12)" : "none" }}
                onClick={() => !isActive && setActiveCIdx(idx)}>

                {/* Card header */}
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderBottom:"1px solid rgba(100,160,220,.1)", background:headerBg, flexShrink:0 }}>
                  {status === 'completed'
                    ? <div style={{ width:16, height:16, borderRadius:"50%", background:"#22C55E", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <Check size={9} color="white" strokeWidth={3} />
                      </div>
                    : <div style={{ width:8, height:8, borderRadius:"50%", background: isActive ? color : "rgba(100,116,139,.3)", flexShrink:0, marginRight:2 }} />
                  }
                  <span style={{ flex:1, fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: isActive ? (status === 'completed' ? '#22C55E' : status === 'in_progress' ? colorLight : 'var(--t-text2)') : 'var(--t-text2)' }}>
                    {t(PHASE_LABEL_KEYS[phase])}
                  </span>
                  <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:99, background:statusBg, color:statusColor, flexShrink:0 }}>
                    {statusLabel}
                  </span>
                </div>

                {/* Card body — deliverables as gate rows */}
                <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:6, flex:1, overflowY:"auto", position:"relative" }}>
                  {phaseDelivs.length > 0 ? phaseDelivs.map(d => {
                    const isPass    = status === 'completed' || d.completed;
                    const isPending = !isPass && status === 'in_progress';
                    const bg        = isPass ? "rgba(16,185,129,.08)" : isPending ? "rgba(245,158,11,.08)" : "rgba(100,116,139,.06)";
                    const border    = isPass ? "rgba(16,185,129,.3)"  : isPending ? "rgba(245,158,11,.3)"  : "rgba(100,116,139,.15)";
                    const iconColor = isPass ? "#10B981"               : isPending ? "#F59E0B"               : "var(--t-text2)";
                    const textColor = isPass ? "var(--t-text2)"        : isPending ? "#FCD34D"               : "var(--t-text2)";
                    const icon      = isPass ? "✓"                     : isPending ? "⚠"                    : "○";
                    return (
                      <div key={d.id}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 10px", borderRadius:8, border:`1px solid ${border}`, background:bg, flexShrink:0, cursor: isActive && status === 'in_progress' ? "pointer" : "default" }}
                        onClick={e => { e.stopPropagation(); if (isActive && status !== 'completed') toggleDeliverable(d); }}>
                        {toggling === d.id
                          ? <Loader2 size={12} className="animate-spin" style={{ color:iconColor, flexShrink:0 }} />
                          : <span style={{ fontSize:11, fontWeight:700, color:iconColor, flexShrink:0, width:14, textAlign:"center" }}>{icon}</span>
                        }
                        <span style={{ fontSize:11, lineHeight:1.35, color:textColor, flex:1, textDecoration: d.completed && status !== 'completed' ? 'line-through' : 'none' }}>
                          {d.title}
                        </span>
                      </div>
                    );
                  }) : (
                    <p style={{ fontSize:12, color:"var(--t-text2)", margin:0 }}>No deliverables configured</p>
                  )}

                  {isActive && canComplete && (
                    <button
                      onClick={e => { e.stopPropagation(); markPhaseComplete(phase); }}
                      disabled={!!marking}
                      style={{ marginTop:8, display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#16A34A", borderRadius:8, border:"none", color:"white", fontSize:12, fontWeight:600, cursor:"pointer", opacity: marking ? 0.6 : 1, flexShrink:0 }}>
                      {marking === phase ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      {marking === phase ? t('mig.marking') : t('mig.mark_complete')}
                    </button>
                  )}
                  {isActive && (auth.isAdmin || auth.isManager) && !allDone && status === 'in_progress' && (
                    <p style={{ fontSize:11, color:"#F59E0B", display:"flex", alignItems:"center", gap:4, margin:"4px 0 0", flexShrink:0 }}>
                      <AlertCircle size={11} />{t('mig.all_deliverables_required')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dot indicators */}
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:8 }}>
          {PHASES.map((phase, idx) => (
            <div key={phase}
              onClick={() => setActiveCIdx(idx)}
              style={{ width: idx === activeCIdx ? 20 : 6, height:6, borderRadius:99, background: idx === activeCIdx ? PHASE_HEX[phase] : "rgba(100,160,220,.2)", cursor:"pointer", transition:"all .2s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULE 2 — WRICEF Registry
// ════════════════════════════════════════════════════════════════

function WricefTab({ migProject, auth }) {
  const { t } = useT();
  const users = useFetchUsers();
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filters, setFilters] = useState({ type: '', status: '', complexity: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [signing, setSigning]     = useState(null);
  const [expandedBp, setExpandedBp] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('wricef_objects')
      .select('*')
      .eq('migration_project_id', migProject.id)
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    else setObjects(data ?? []);
    setLoading(false);
  }, [migProject.id]);

  useEffect(() => { load(); }, [load]);

  async function handleSignOff(obj) {
    setSigning(obj.id);
    const { error: err } = await supabase
      .from('wricef_objects')
      .update({ status: 'signed_off', signed_off_by: auth.user?.id, signed_off_at: new Date().toISOString() })
      .eq('id', obj.id);
    if (!err) load();
    setSigning(null);
  }

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const filtered = objects.filter(o =>
    (!filters.type || o.type === filters.type) &&
    (!filters.status || o.status === filters.status) &&
    (!filters.complexity || o.complexity === filters.complexity)
  );

  // Summary tiles
  const total = objects.length;
  const byType = 'WRICEF'.split('').reduce((acc, c) => {
    acc[c] = objects.filter(o => o.type === c).length;
    return acc;
  }, {});
  const signedOff = objects.filter(o => o.status === 'signed_off').length;
  const completion = total ? Math.round((signedOff / total) * 100) : 0;

  // Export by type
  function exportByType() {
    const rows = ['Type,Label,Count'];
    Object.entries(WRICEF_META).forEach(([type, meta]) => {
      rows.push(`${type},${meta.label},${byType[type] ?? 0}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'wricef_summary.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;
  if (error)   return <p className="text-red-600 text-sm">{error}</p>;

  const typeOptions = [
    { value: '', label: t('mig.wricef_all_types') },
    ...Object.entries(WRICEF_META).map(([v, m]) => ({ value: v, label: `${v} — ${m.label}` })),
  ];
  const statusOptions = [
    { value: '', label: t('mig.wricef_all_statuses') },
    { value: 'open',        label: t('mig.wricef_open') },
    { value: 'in_progress', label: t('mig.wricef_in_progress') },
    { value: 'remediated',  label: t('mig.wricef_remediated') },
    { value: 'tested',      label: t('mig.wricef_tested') },
    { value: 'signed_off',  label: t('mig.wricef_signed_off_label') },
  ];
  const complexityOptions = [
    { value: '', label: t('mig.all_complexities') },
    { value: 'low',    label: t('mig.complexity_low') },
    { value: 'medium', label: t('mig.complexity_medium') },
    { value: 'high',   label: t('mig.complexity_high') },
  ];

  return (
    <div>
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{total}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('mig.wricef_total')}</div>
        </div>
        {Object.entries(WRICEF_META).map(([type, meta]) => (
          <div key={type} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
            <Badge className={meta.cls}>{type}</Badge>
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{byType[type] ?? 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{meta.label}</div>
            </div>
          </div>
        ))}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completion}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('mig.wricef_completion')}</div>
          <div className="mt-1.5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={filters.type}
          onChange={e => setFilter('type', e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filters.complexity}
          onChange={e => setFilter('complexity', e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {complexityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportByType}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('mig.wricef_export')}
          </button>
          {(auth.isAdmin || auth.isManager) && (
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('mig.wricef_new')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">{t('mig.wricef_no_objects')}</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('mig.wricef_type')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('mig.wricef_name')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">{t('mig.wricef_complexity')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">{t('mig.wricef_effort')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">{t('mig.wricef_owner')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('mig.wricef_status')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('action.edit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(obj => {
                  const bpOpen = expandedBp.has(obj.id);
                  const toggleBp = () => setExpandedBp(s => {
                    const n = new Set(s);
                    bpOpen ? n.delete(obj.id) : n.add(obj.id);
                    return n;
                  });
                  return (
                    <Fragment key={obj.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <Badge className={WRICEF_META[obj.type]?.cls ?? ''}>
                            {obj.type} — {WRICEF_META[obj.type]?.label ?? obj.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{obj.name}</div>
                          {obj.object_id && <div className="text-xs text-gray-400 dark:text-gray-500">{obj.object_id}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            obj.complexity === 'high'   ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            obj.complexity === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          }`}>
                            {t(`mig.complexity_${obj.complexity ?? 'medium'}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                          {obj.effort_days != null ? `${obj.effort_days}d` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                          {userName(users, obj.owner_id)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge className={WRICEF_STATUS_CLS[obj.status] ?? ''}>
                              {cap(obj.status)}
                            </Badge>
                            {obj.status === 'tested' && !obj.signed_off_at && (
                              <button
                                onClick={() => handleSignOff(obj)}
                                disabled={signing === obj.id}
                                className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 rounded border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
                              >
                                {signing === obj.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('mig.wricef_sign_off')}
                              </button>
                            )}
                            {obj.signed_off_at && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 hidden lg:block">
                                {fmtDate(obj.signed_off_at)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setEditing(obj); setShowModal(true); }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {t('action.edit')}
                            </button>
                            <button
                              onClick={toggleBp}
                              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                                bpOpen
                                  ? 'text-purple-600 dark:text-purple-400'
                                  : obj.blueprint
                                    ? 'text-purple-500 dark:text-purple-400'
                                    : 'text-gray-400 dark:text-gray-500 hover:text-purple-500'
                              }`}
                              title="Technical Blueprint"
                            >
                              <Code2 size={12} />
                              {obj.blueprint ? 'Blueprint' : 'AI Blueprint'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {bpOpen && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <WricefBlueprintPanel
                              obj={obj}
                              onSaved={bp => setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, blueprint: bp } : o))}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WRICEF Modal */}
      {showModal && (
        <WricefModal
          migProjectId={migProject.id}
          auth={auth}
          users={users}
          editing={editing}
          t={t}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── WricefModal ──────────────────────────────────────────────────────────────

function WricefModal({ migProjectId, auth, users, editing, t, onClose, onSaved }) {
  const isEdit = !!editing;
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [form, setForm] = useState({
    type: editing?.type ?? 'W',
    name: editing?.name ?? '',
    object_id: editing?.object_id ?? '',
    description: editing?.description ?? '',
    complexity: editing?.complexity ?? 'medium',
    effort_days: editing?.effort_days ?? '',
    owner_id: editing?.owner_id ?? '',
    remediation_approach: editing?.remediation_approach ?? '',
    status: editing?.status ?? 'open',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErrMsg(t('mig.wricef_name_required')); return; }
    setSaving(true);
    setErrMsg('');
    const payload = {
      ...form,
      effort_days: form.effort_days !== '' ? parseFloat(form.effort_days) : null,
      owner_id: form.owner_id || null,
      migration_project_id: migProjectId,
    };
    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from('wricef_objects').update(payload).eq('id', editing.id));
    } else {
      ({ error: err } = await supabase.from('wricef_objects').insert(payload));
    }
    if (err) setErrMsg(err.message);
    else onSaved();
    setSaving(false);
  }

  const typeOptions     = Object.entries(WRICEF_META).map(([v, m]) => ({ value: v, label: `${v} — ${m.label}` }));
  const complexityOpts  = [{ value: 'low', label: t('mig.complexity_low') }, { value: 'medium', label: t('mig.complexity_medium') }, { value: 'high', label: t('mig.complexity_high') }];
  const statusOpts      = [
    { value: 'open',        label: t('mig.wricef_open') },
    { value: 'in_progress', label: t('mig.wricef_in_progress') },
    { value: 'remediated',  label: t('mig.wricef_remediated') },
    { value: 'tested',      label: t('mig.wricef_tested') },
    { value: 'signed_off',  label: t('mig.wricef_signed_off_label') },
  ];
  const ownerOpts = [
    { value: '', label: `— ${t('mig.wricef_owner')} —` },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];

  return (
    <Modal open onClose={onClose} title={isEdit ? t('mig.wricef_edit') : t('mig.wricef_new')} wide>
      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Select label={t('mig.wricef_type')} options={typeOptions} value={form.type} onChange={e => set('type', e.target.value)} />
          <Input label={t('mig.wricef_name')} value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('mig.wricef_name')} required />
          <Input label={t('mig.wricef_object_id')} value={form.object_id} onChange={e => set('object_id', e.target.value)} placeholder="e.g. ZREPORT_001" />
          <Select label={t('mig.wricef_complexity')} options={complexityOpts} value={form.complexity} onChange={e => set('complexity', e.target.value)} />
          <Input label={t('mig.wricef_effort')} type="number" step="0.5" min="0" value={form.effort_days} onChange={e => set('effort_days', e.target.value)} placeholder="0" />
          <Select label={t('mig.wricef_owner')} options={ownerOpts} value={form.owner_id} onChange={e => set('owner_id', e.target.value)} />
          <Select label={t('mig.wricef_status')} options={statusOpts} value={form.status} onChange={e => set('status', e.target.value)} />
        </div>
        <Textarea label={t('mig.wricef_description')} value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
        <Textarea label={t('mig.wricef_approach')} value={form.remediation_approach} onChange={e => set('remediation_approach', e.target.value)} rows={2} />
        {errMsg && <p className="text-red-600 text-xs mb-3 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errMsg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white">{t('action.cancel')}</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULE 3 — Cutover Planner
// ════════════════════════════════════════════════════════════════

function CutoverTab({ migProject, auth }) {
  const { t } = useT();
  const users = useFetchUsers();
  const [runs, setRuns]             = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [taskFilter, setTaskFilter] = useState('');
  const [showRunModal, setShowRunModal]   = useState(false);
  const [editingRun, setEditingRun]       = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask]     = useState(null);
  const [markingDone, setMarkingDone]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: runData, error: rErr }, { data: taskData, error: tErr }] = await Promise.all([
      supabase.from('cutover_runs').select('*').eq('migration_project_id', migProject.id).order('run_type'),
      supabase.from('cutover_tasks').select('*').eq('migration_project_id', migProject.id).order('seq'),
    ]);
    if (rErr || tErr) setError((rErr ?? tErr).message);
    else { setRuns(runData ?? []); setTasks(taskData ?? []); }
    setLoading(false);
  }, [migProject.id]);

  useEffect(() => { load(); }, [load]);

  async function markTaskDone(task) {
    setMarkingDone(task.id);
    const { error: err } = await supabase
      .from('cutover_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id);
    if (!err) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', completed_at: new Date().toISOString() } : t));
    setMarkingDone(null);
  }

  const filteredTasks = taskFilter ? tasks.filter(t => t.run_type === taskFilter || t.run_type === 'all') : tasks;

  // Progress for a run
  function runProgress(runType) {
    const rt = runType === 'all' ? tasks : tasks.filter(t => t.run_type === runType || t.run_type === 'all');
    if (!rt.length) return 0;
    return Math.round((rt.filter(t => t.status === 'done').length / rt.length) * 100);
  }

  if (loading) return <Spinner />;
  if (error)   return <p className="text-red-600 text-sm">{error}</p>;

  const runOrder = ['dr1', 'dr2', 'go_live'];
  const runMap   = {};
  runs.forEach(r => { runMap[r.run_type] = r; });

  const runTypeFilterOptions = [
    { value: '', label: t('mig.task_all_runs') },
    { value: 'dr1',     label: t('mig.dr1') },
    { value: 'dr2',     label: t('mig.dr2') },
    { value: 'go_live', label: t('mig.go_live_run') },
    { value: 'all',     label: `${t('mig.task_all_runs')} (All)` },
  ];

  const taskRunTypeOptions = [
    { value: 'all',     label: t('mig.task_all_runs') },
    { value: 'dr1',     label: t('mig.dr1') },
    { value: 'dr2',     label: t('mig.dr2') },
    { value: 'go_live', label: t('mig.go_live_run') },
  ];

  return (
    <div>
      {/* Runs section */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">{t('mig.runs_section')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {runOrder.map(runType => {
            const run = runMap[runType];
            const progress = runProgress(runType);
            return (
              <div key={runType} className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${RUN_TYPE_COLORS[runType]}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{t(RUN_TYPE_LABEL_KEYS[runType])}</h3>
                  {run && (
                    <Badge className={RUN_STATUS_CLS[run.status] ?? 'bg-gray-100 text-gray-600'}>
                      {t(`mig.run_${run.status ?? 'planned'}`)}
                    </Badge>
                  )}
                </div>

                {run ? (
                  <>
                    <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300 mb-3">
                      <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-gray-400" /><span>{t('mig.run_scheduled')}: {fmtDt(run.scheduled_date)}</span></div>
                      <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" /><span>{t('mig.run_freeze')}: {fmtDt(run.system_freeze_date)}</span></div>
                      {run.downtime_start && <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" /><span>↓ {fmtDt(run.downtime_start)} → {fmtDt(run.downtime_end)}</span></div>}
                      {run.go_no_go && (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium mt-1 ${run.go_no_go === 'go' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {run.go_no_go === 'go' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {run.go_no_go === 'go' ? t('mig.run_go') : t('mig.run_no_go')}
                        </div>
                      )}
                    </div>
                    {run.status === 'in_progress' && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{t('mig.task_progress')}</span><span>{progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    {run.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 italic">{run.notes}</p>}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('mig.run_not_configured')}</p>
                )}

                {(auth.isAdmin || auth.isManager) && (
                  <button
                    onClick={() => { setEditingRun(run ?? { run_type: runType, migration_project_id: migProject.id }); setShowRunModal(true); }}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    {run ? t('action.edit') : t('action.add')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('mig.tasks_section')}</h2>
          <div className="flex items-center gap-2">
            <select
              value={taskFilter}
              onChange={e => setTaskFilter(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {runTypeFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(auth.isAdmin || auth.isManager) && (
              <button
                onClick={() => { setEditingTask(null); setShowTaskModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('mig.task_add')}
              </button>
            )}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">{t('mig.task_no_tasks')}</div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">{t('mig.task_seq')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('mig.task_title')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">{t('mig.task_team')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">{t('mig.task_duration')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">{t('mig.task_depends_on')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">{t('mig.task_run_type')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('mig.task_status')}</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('action.edit')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredTasks.map(task => (
                    <tr key={task.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${task.status === 'skipped' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-400 text-xs">{task.seq}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{task.title}</div>
                        {task.notes && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-xs">{task.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                        {task.team ?? userName(users, task.owner_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                        {task.duration_hours != null ? `${task.duration_hours}h` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell font-mono text-xs">
                        {task.depends_on ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge className={
                          task.run_type === 'go_live' ? 'bg-green-100 text-green-700' :
                          task.run_type === 'dr2'     ? 'bg-indigo-100 text-indigo-700' :
                          task.run_type === 'dr1'     ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-600'
                        }>
                          {task.run_type === 'all' ? t('mig.task_all_runs') : t(RUN_TYPE_LABEL_KEYS[task.run_type] ?? '')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge className={TASK_STATUS_CLS[task.status] ?? ''}>
                            {task.status === 'done'        ? t('mig.task_done') :
                             task.status === 'in_progress' ? t('mig.phase_in_progress') :
                             task.status === 'skipped'     ? t('mig.task_skipped') :
                                                             t('mig.task_pending')}
                          </Badge>
                          {task.status !== 'done' && task.status !== 'skipped' && (
                            <button
                              onClick={() => markTaskDone(task)}
                              disabled={markingDone === task.id}
                              className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 rounded border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
                            >
                              {markingDone === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('mig.task_mark_done')}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(auth.isAdmin || auth.isManager) && (
                          <button
                            onClick={() => { setEditingTask(task); setShowTaskModal(true); }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {t('action.edit')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Run Modal */}
      {showRunModal && (
        <RunModal
          migProjectId={migProject.id}
          auth={auth}
          run={editingRun}
          t={t}
          onClose={() => { setShowRunModal(false); setEditingRun(null); }}
          onSaved={() => { setShowRunModal(false); setEditingRun(null); load(); }}
        />
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          migProjectId={migProject.id}
          auth={auth}
          users={users}
          task={editingTask}
          tasks={tasks}
          t={t}
          taskRunTypeOptions={taskRunTypeOptions}
          onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
          onSaved={() => { setShowTaskModal(false); setEditingTask(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── RunModal ─────────────────────────────────────────────────────────────────

function RunModal({ migProjectId, auth, run, t, onClose, onSaved }) {
  const isNew = !run?.id;
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [form, setForm] = useState({
    scheduled_date:    run?.scheduled_date    ? run.scheduled_date.slice(0,16)    : '',
    system_freeze_date:run?.system_freeze_date ? run.system_freeze_date.slice(0,16) : '',
    downtime_start:    run?.downtime_start    ? run.downtime_start.slice(0,16)    : '',
    downtime_end:      run?.downtime_end      ? run.downtime_end.slice(0,16)      : '',
    status:            run?.status            ?? 'planned',
    go_no_go:          run?.go_no_go          ?? '',
    notes:             run?.notes             ?? '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrMsg('');
    const payload = {
      ...form,
      scheduled_date:     form.scheduled_date     || null,
      system_freeze_date: form.system_freeze_date || null,
      downtime_start:     form.downtime_start     || null,
      downtime_end:       form.downtime_end       || null,
      go_no_go:           form.go_no_go           || null,
      migration_project_id: migProjectId,
    };
    if (form.go_no_go && (auth.isAdmin || auth.isManager)) {
      payload.go_no_go_by = auth.user?.id;
      payload.go_no_go_at = new Date().toISOString();
    }
    let err;
    if (isNew) {
      payload.run_type = run.run_type;
      ({ error: err } = await supabase.from('cutover_runs').insert(payload));
    } else {
      ({ error: err } = await supabase.from('cutover_runs').update(payload).eq('id', run.id));
    }
    if (err) setErrMsg(err.message);
    else onSaved();
    setSaving(false);
  }

  const statusOpts = [
    { value: 'planned',    label: t('mig.run_planned') },
    { value: 'in_progress',label: t('mig.run_in_progress') },
    { value: 'completed',  label: t('mig.run_completed') },
  ];
  const goNoGoOpts = [
    { value: '',      label: `— ${t('mig.run_go_no_go')} —` },
    { value: 'go',    label: t('mig.run_go') },
    { value: 'no_go', label: t('mig.run_no_go') },
  ];

  return (
    <Modal open onClose={onClose} title={`${t(RUN_TYPE_LABEL_KEYS[run?.run_type] ?? 'mig.dr1')} — ${t('action.edit')}`}>
      <form onSubmit={handleSubmit}>
        <Input label={t('mig.run_scheduled')}    type="datetime-local" value={form.scheduled_date}     onChange={e => set('scheduled_date', e.target.value)} />
        <Input label={t('mig.run_freeze')}        type="datetime-local" value={form.system_freeze_date} onChange={e => set('system_freeze_date', e.target.value)} />
        <Input label={t('mig.run_downtime_start')} type="datetime-local" value={form.downtime_start}    onChange={e => set('downtime_start', e.target.value)} />
        <Input label={t('mig.run_downtime_end')}   type="datetime-local" value={form.downtime_end}      onChange={e => set('downtime_end', e.target.value)} />
        <Select label={t('mig.run_status')} options={statusOpts} value={form.status} onChange={e => set('status', e.target.value)} />
        {(auth.isAdmin || auth.isManager) && (
          <Select label={t('mig.run_go_no_go')} options={goNoGoOpts} value={form.go_no_go} onChange={e => set('go_no_go', e.target.value)} />
        )}
        <Textarea label={t('mig.run_notes')} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        {errMsg && <p className="text-red-600 text-xs mb-3">{errMsg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t('action.cancel')}</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── TaskModal ────────────────────────────────────────────────────────────────

// ─── MODULE 4: Data Migration Tracker ────────────────────────────────────────

const DATA_MAPPING_CLS = {
  not_started: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_progress:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  completed:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const DATA_SEV_CLS = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

function DataTab({ migProject, auth }) {
  const { t } = useT();
  const users = useFetchUsers();
  const [objects, setObjects]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [issues, setIssues]       = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase
      .from('data_migration_objects')
      .select('*')
      .eq('migration_project_id', migProject.id)
      .order('created_at');
    if (err) setError(err.message);
    else setObjects(data ?? []);
    setLoading(false);
  }, [migProject.id]);

  useEffect(() => { load(); }, [load]);

  async function loadIssues(objId) {
    if (issues[objId]) return;
    const { data } = await supabase
      .from('data_quality_issues')
      .select('*')
      .eq('data_object_id', objId)
      .order('created_at');
    setIssues(prev => ({ ...prev, [objId]: data ?? [] }));
  }

  function toggleExpand(objId) {
    if (expanded === objId) { setExpanded(null); }
    else { setExpanded(objId); loadIssues(objId); }
  }

  async function toggleGoNoGo(obj) {
    const nowVal = !obj.go_no_go;
    await supabase.from('data_migration_objects').update({ go_no_go: nowVal }).eq('id', obj.id);
    setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, go_no_go: nowVal } : o));
  }

  const totalObjs  = objects.length;
  const gngApproved = objects.filter(o => o.go_no_go).length;
  const openIssues = objects.reduce((s, o) => s + (o.quality_issues ?? 0), 0);
  const avgGoLive  = objects.length
    ? (objects.reduce((s, o) => s + (o.go_live_pct ?? 0), 0) / objects.length).toFixed(1)
    : '—';

  const canEdit = auth.isAdmin || auth.isManager;

  if (loading) return <Spinner />;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t('data.title')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('data.subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus className="w-4 h-4" />{t('data.add_object')}
          </button>
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: t('data.total_objects'), value: totalObjs,      cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
          { label: t('data.gng_approved'),  value: gngApproved,    cls: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
          { label: t('data.open_issues'),   value: openIssues,     cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
          { label: t('data.avg_golive'),    value: `${avgGoLive}%`, cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.cls}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
              {[t('data.col_name'), t('data.col_sap'), t('data.col_category'), t('data.col_records'),
                t('data.col_mapping'), t('data.col_mock1'), t('data.col_mock2'), t('data.col_golive'),
                t('data.col_issues'), t('data.col_gng')].map(col => (
                <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{col}</th>
              ))}
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {objects.map(obj => (
              <>
                <tr key={obj.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => toggleExpand(obj.id)}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{obj.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{obj.sap_object || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{obj.category || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{obj.record_count_source?.toLocaleString() ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DATA_MAPPING_CLS[obj.mapping_status] ?? DATA_MAPPING_CLS.not_started}`}>
                      {t(`data.mapping_${obj.mapping_status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{obj.mock_run_1_pct != null ? `${obj.mock_run_1_pct}%` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{obj.mock_run_2_pct != null ? `${obj.mock_run_2_pct}%` : '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{obj.go_live_pct != null ? `${obj.go_live_pct}%` : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {(obj.quality_issues ?? 0) > 0
                      ? <span className="inline-flex items-center gap-1 text-orange-600 font-semibold text-xs"><AlertTriangle className="w-3 h-3"/>{obj.quality_issues}</span>
                      : <span className="text-gray-400 text-xs">0</span>}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <button onClick={e => { e.stopPropagation(); toggleGoNoGo(obj); }}
                        className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${obj.go_no_go
                          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
                          : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'}`}>
                        {obj.go_no_go ? '✓ Go' : '— No-Go'}
                      </button>
                    ) : (
                      obj.go_no_go
                        ? <span className="text-green-600 dark:text-green-400 text-xs font-medium">✓ Go</span>
                        : <span className="text-gray-400 text-xs">No-Go</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setEditing(obj); setShowModal(true); }}
                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">{t('action.edit')}</button>
                    </td>
                  )}
                </tr>
                {expanded === obj.id && (
                  <tr key={`${obj.id}-issues`}>
                    <td colSpan={canEdit ? 11 : 10} className="px-4 pb-4 pt-0">
                      <DataIssuesPanel objId={obj.id} issues={issues[obj.id] ?? []} users={users} canEdit={canEdit}
                        t={t} onIssueChange={() => { loadIssues(obj.id); load(); }} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {objects.length === 0 && (
              <tr><td colSpan={canEdit ? 11 : 10} className="px-4 py-10 text-center text-gray-400 text-sm">{t('data.no_objects')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <DataObjectModal migProjectId={migProject.id} users={users} editing={editing}
          t={t} onClose={() => { setShowModal(false); setEditing(null); }} onSaved={load} />
      )}
    </div>
  );
}

function DataIssuesPanel({ objId, issues, users, canEdit, t, onIssueChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ title: '', description: '', severity: 'medium', status: 'open', owner_id: '' });
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const ownerOpts = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.title.trim()) { setErr(t('data.issue_title_required')); return; }
    setSaving(true); setErr('');
    await supabase.from('data_quality_issues').insert({ ...form, data_object_id: objId, owner_id: form.owner_id || null });
    setSaving(false); setShowAdd(false); setForm({ title: '', description: '', severity: 'medium', status: 'open', owner_id: '' });
    onIssueChange();
  }

  async function updateIssueStatus(issueId, status) {
    await supabase.from('data_quality_issues').update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }).eq('id', issueId);
    onIssueChange();
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 mt-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('data.issues_title')}</span>
        {canEdit && <button onClick={() => setShowAdd(v => !v)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t('data.add_issue')}</button>}
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white dark:bg-gray-700 rounded-lg p-3 mb-3 space-y-2 border border-gray-100 dark:border-gray-600">
          <Input label={t('data.issue_title')} value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
          <div className="grid grid-cols-2 gap-2">
            <Select label={t('data.issue_severity')} value={form.severity}
              onChange={e => setForm(p => ({...p, severity: e.target.value}))}
              options={['critical','high','medium','low'].map(s => ({ value: s, label: t(`data.sev_${s}`) }))} />
            <Select label={t('data.issue_owner')} value={form.owner_id}
              onChange={e => setForm(p => ({...p, owner_id: e.target.value}))}
              options={ownerOpts} />
          </div>
          {err && <p className="text-red-600 text-xs">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-gray-500 px-3 py-1">{t('action.cancel')}</button>
            <button type="submit" disabled={saving} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">{saving ? t('action.saving') : t('action.save')}</button>
          </div>
        </form>
      )}
      {issues.length === 0 && !showAdd && <p className="text-xs text-gray-400">{t('data.no_issues')}</p>}
      <div className="space-y-2">
        {issues.map(issue => (
          <div key={issue.id} className="flex items-start gap-2">
            <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${DATA_SEV_CLS[issue.severity] ?? DATA_SEV_CLS.medium}`}>{t(`data.sev_${issue.severity}`)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug">{issue.title}</div>
              {issue.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{issue.description}</div>}
            </div>
            {canEdit && issue.status !== 'resolved' && (
              <button onClick={() => updateIssueStatus(issue.id, 'resolved')}
                className="shrink-0 text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
                {t('action.resolve')}
              </button>
            )}
            {issue.status === 'resolved' && <span className="shrink-0 text-xs text-green-600 dark:text-green-400">{t('data.status_resolved')}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DataObjectModal({ migProjectId, users, editing, t, onClose, onSaved }) {
  const blankForm = { name: '', sap_object: '', category: 'Master Data', record_count_source: '', owner_id: '',
    mapping_status: 'not_started', mock_run_1_pct: '', mock_run_1_errors: '', mock_run_2_pct: '', mock_run_2_errors: '',
    go_live_pct: '', go_live_errors: '', notes: '' };
  const [form, setForm] = useState(editing ? { ...blankForm, ...editing } : blankForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ownerOpts = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr(t('data.name_required')); return; }
    setSaving(true); setErr('');
    const payload = { ...form, migration_project_id: migProjectId,
      record_count_source: form.record_count_source ? parseInt(form.record_count_source) : null,
      mock_run_1_pct: form.mock_run_1_pct !== '' ? parseFloat(form.mock_run_1_pct) : null,
      mock_run_1_errors: form.mock_run_1_errors !== '' ? parseInt(form.mock_run_1_errors) : null,
      mock_run_2_pct: form.mock_run_2_pct !== '' ? parseFloat(form.mock_run_2_pct) : null,
      mock_run_2_errors: form.mock_run_2_errors !== '' ? parseInt(form.mock_run_2_errors) : null,
      go_live_pct: form.go_live_pct !== '' ? parseFloat(form.go_live_pct) : null,
      go_live_errors: form.go_live_errors !== '' ? parseInt(form.go_live_errors) : null,
      owner_id: form.owner_id || null };
    const { error } = editing
      ? await supabase.from('data_migration_objects').update(payload).eq('id', editing.id)
      : await supabase.from('data_migration_objects').insert(payload);
    if (error) { setErr(error.message); setSaving(false); return; }
    setSaving(false); onSaved(); onClose();
  }

  const categoryOpts = ['Master Data','Transactional','Configuration','Basis'].map(c => ({ value: c, label: c }));
  const mappingOpts = ['not_started','in_progress','completed'].map(s => ({ value: s, label: t(`data.mapping_${s}`) }));

  return (
    <Modal open onClose={onClose} title={editing ? t('data.col_name') : t('data.new_object')}>
      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Input label={t('data.name')} value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input label={t('data.sap_object_code')} value={form.sap_object} onChange={e => set('sap_object', e.target.value)} placeholder="e.g. BP, BKPF" />
          <Select label={t('data.category')} options={categoryOpts} value={form.category} onChange={e => set('category', e.target.value)} />
          <Select label={t('mig.wricef_owner')} options={ownerOpts} value={form.owner_id} onChange={e => set('owner_id', e.target.value)} />
          <Input label={t('data.record_count')} type="number" value={form.record_count_source} onChange={e => set('record_count_source', e.target.value)} />
          <Select label={t('data.col_mapping')} options={mappingOpts} value={form.mapping_status} onChange={e => set('mapping_status', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-x-4">
          <Input label={`${t('data.col_mock1')} %`} type="number" step="0.01" value={form.mock_run_1_pct} onChange={e => set('mock_run_1_pct', e.target.value)} />
          <Input label={`${t('data.col_mock2')} %`} type="number" step="0.01" value={form.mock_run_2_pct} onChange={e => set('mock_run_2_pct', e.target.value)} />
          <Input label={`${t('data.col_golive')} %`} type="number" step="0.01" value={form.go_live_pct} onChange={e => set('go_live_pct', e.target.value)} />
        </div>
        <Textarea label={t('data.notes')} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        {err && <p className="text-red-600 text-xs mb-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t('action.cancel')}</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── MODULE 5: Simplification Item Tracker ───────────────────────────────────

const SIMPLIF_IMPACT_CLS = {
  mandatory_change: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  optional:         'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  informational:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const SIMPLIF_STATUS_CLS = {
  not_applicable: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  open:           'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  in_progress:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  resolved:       'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

function SimplifTab({ migProject, auth }) {
  const { t } = useT();
  const users = useFetchUsers();
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filters, setFilters]     = useState({ area: '', impact: '', status: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase
      .from('simplification_items')
      .select('*')
      .eq('migration_project_id', migProject.id)
      .order('created_at');
    if (err) setError(err.message);
    else setItems(data ?? []);
    setLoading(false);
  }, [migProject.id]);

  useEffect(() => { load(); }, [load]);

  const displayed = items.filter(i =>
    (!filters.area   || i.area === filters.area) &&
    (!filters.impact || i.impact === filters.impact) &&
    (!filters.status || i.status === filters.status)
  );

  const totalItems = items.length;
  const openItems  = items.filter(i => i.status === 'open').length;
  const inProgress = items.filter(i => i.status === 'in_progress').length;
  const resolved   = items.filter(i => i.status === 'resolved').length;
  const mandatory  = items.filter(i => i.impact === 'mandatory_change').length;

  const canEdit = auth.isAdmin || auth.isManager;

  const areaOptions = ['FI','MM','SD','PP','HR','Basis','Technical','Other'];
  const impactOptions = ['mandatory_change','optional','informational'];
  const statusOptions = ['not_applicable','open','in_progress','resolved'];

  const filterCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (loading) return <Spinner />;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t('simplif.title')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('simplif.subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus className="w-4 h-4" />{t('simplif.add_item')}
          </button>
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: t('simplif.total'),      value: totalItems, cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
          { label: t('simplif.open'),       value: openItems,  cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
          { label: t('simplif.in_progress'),value: inProgress, cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
          { label: t('simplif.resolved'),   value: resolved,   cls: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
          { label: t('simplif.mandatory'),  value: mandatory,  cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.cls}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.area} onChange={e => setFilters(p => ({...p, area: e.target.value}))} className={filterCls}>
          <option value="">{t('simplif.filter_area')}</option>
          {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filters.impact} onChange={e => setFilters(p => ({...p, impact: e.target.value}))} className={filterCls}>
          <option value="">{t('simplif.filter_impact')}</option>
          {impactOptions.map(imp => <option key={imp} value={imp}>{t(`simplif.impact_${imp.replace('_change','').replace('mandatory_','mandatory')}`)}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(p => ({...p, status: e.target.value}))} className={filterCls}>
          <option value="">{t('simplif.filter_status')}</option>
          {statusOptions.map(s => <option key={s} value={s}>{t(`simplif.status_${s.replace('_','') === 'notapplicable' ? 'not_applicable' : s}`)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                {[t('simplif.col_item_id'), t('simplif.col_title'), t('simplif.col_area'),
                  t('simplif.col_impact'), t('simplif.col_status'), t('simplif.col_owner')].map(col => (
                  <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{col}</th>
                ))}
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {displayed.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.item_id || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                    {item.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.area}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SIMPLIF_IMPACT_CLS[item.impact] ?? SIMPLIF_IMPACT_CLS.informational}`}>
                      {item.impact === 'mandatory_change' ? t('simplif.impact_mandatory') : item.impact === 'optional' ? t('simplif.impact_optional') : t('simplif.impact_informational')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SIMPLIF_STATUS_CLS[item.status] ?? SIMPLIF_STATUS_CLS.open}`}>
                      {t(`simplif.status_${item.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                    {users.find(u => u.id === item.owner_id)?.full_name ?? '—'}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditing(item); setShowModal(true); }}
                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">{t('action.edit')}</button>
                    </td>
                  )}
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-10 text-center text-gray-400 text-sm">{t('simplif.no_items')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <SimplifModal migProjectId={migProject.id} users={users} editing={editing}
          t={t} onClose={() => { setShowModal(false); setEditing(null); }} onSaved={load} />
      )}
    </div>
  );
}

function SimplifModal({ migProjectId, users, editing, t, onClose, onSaved }) {
  const blank = { item_id: '', title: '', area: 'Other', impact: 'informational', description: '',
    affected_objects: '', remediation_notes: '', status: 'open', owner_id: '' };
  const [form, setForm] = useState(editing ? { ...blank, ...editing } : blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ownerOpts = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setErr(t('simplif.title_required')); return; }
    setSaving(true); setErr('');
    const payload = { ...form, migration_project_id: migProjectId, owner_id: form.owner_id || null,
      resolved_at: form.status === 'resolved' && !editing?.resolved_at ? new Date().toISOString() : (editing?.resolved_at ?? null) };
    const { error } = editing
      ? await supabase.from('simplification_items').update(payload).eq('id', editing.id)
      : await supabase.from('simplification_items').insert(payload);
    if (error) { setErr(error.message); setSaving(false); return; }
    setSaving(false); onSaved(); onClose();
  }

  const areaOpts = ['FI','MM','SD','PP','HR','Basis','Technical','Other'].map(a => ({ value: a, label: a }));
  const impactOpts = [
    { value: 'mandatory_change', label: t('simplif.impact_mandatory') },
    { value: 'optional',         label: t('simplif.impact_optional') },
    { value: 'informational',    label: t('simplif.impact_informational') },
  ];
  const statusOpts = [
    { value: 'not_applicable', label: t('simplif.status_not_applicable') },
    { value: 'open',           label: t('simplif.status_open') },
    { value: 'in_progress',    label: t('simplif.status_in_progress') },
    { value: 'resolved',       label: t('simplif.status_resolved') },
  ];

  return (
    <Modal open onClose={onClose} title={editing ? t('simplif.edit_item') : t('simplif.new_item')}>
      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Input label={t('simplif.item_id')} value={form.item_id} onChange={e => set('item_id', e.target.value)} placeholder="e.g. S4TWL-123" />
          <Select label={t('simplif.area')} options={areaOpts} value={form.area} onChange={e => set('area', e.target.value)} />
          <Select label={t('simplif.impact')} options={impactOpts} value={form.impact} onChange={e => set('impact', e.target.value)} />
          <Select label={t('simplif.status')} options={statusOpts} value={form.status} onChange={e => set('status', e.target.value)} />
          <Select label={t('simplif.owner')} options={ownerOpts} value={form.owner_id} onChange={e => set('owner_id', e.target.value)} />
        </div>
        <Input label={t('simplif.title_field')} value={form.title} onChange={e => set('title', e.target.value)} required />
        <Textarea label={t('simplif.description')} value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
        <Input label={t('simplif.affected_objects')} value={form.affected_objects} onChange={e => set('affected_objects', e.target.value)} placeholder="e.g. Z_FI_001, Z_CO_005" />
        <Textarea label={t('simplif.remediation_notes')} value={form.remediation_notes} onChange={e => set('remediation_notes', e.target.value)} rows={2} />
        {err && <p className="text-red-600 text-xs mb-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t('action.cancel')}</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskModal({ migProjectId, auth, users, task, tasks, t, taskRunTypeOptions, onClose, onSaved }) {
  const isEdit = !!task;
  const nextSeq = tasks.length > 0 ? Math.max(...tasks.map(t => t.seq ?? 0)) + 1 : 1;
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [form, setForm] = useState({
    seq:            task?.seq            ?? nextSeq,
    title:          task?.title          ?? '',
    team:           task?.team           ?? '',
    owner_id:       task?.owner_id       ?? '',
    duration_hours: task?.duration_hours ?? '',
    depends_on:     task?.depends_on     ?? '',
    run_type:       task?.run_type       ?? 'all',
    status:         task?.status         ?? 'pending',
    notes:          task?.notes          ?? '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setErrMsg(t('mig.task_title_required')); return; }
    setSaving(true);
    setErrMsg('');
    const payload = {
      ...form,
      seq:            parseInt(form.seq, 10)    || nextSeq,
      duration_hours: form.duration_hours !== '' ? parseFloat(form.duration_hours) : null,
      depends_on:     form.depends_on     !== '' ? parseInt(form.depends_on, 10)   : null,
      owner_id:       form.owner_id       || null,
      migration_project_id: migProjectId,
    };
    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from('cutover_tasks').update(payload).eq('id', task.id));
    } else {
      ({ error: err } = await supabase.from('cutover_tasks').insert(payload));
    }
    if (err) setErrMsg(err.message);
    else onSaved();
    setSaving(false);
  }

  const ownerOpts = [
    { value: '', label: `— ${t('mig.wricef_owner')} —` },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];
  const statusOpts = [
    { value: 'pending',     label: t('mig.task_pending') },
    { value: 'in_progress', label: t('mig.phase_in_progress') },
    { value: 'done',        label: t('mig.task_done') },
    { value: 'skipped',     label: t('mig.task_skipped') },
  ];

  return (
    <Modal open onClose={onClose} title={isEdit ? t('mig.task_edit') : t('mig.task_new')}>
      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Input label={t('mig.task_seq')} type="number" min="1" value={form.seq} onChange={e => set('seq', e.target.value)} />
          <Select label={t('mig.task_run_type')} options={taskRunTypeOptions} value={form.run_type} onChange={e => set('run_type', e.target.value)} />
        </div>
        <Input label={t('mig.task_title')} value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('mig.task_title')} required />
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Input label={t('mig.task_team')} value={form.team} onChange={e => set('team', e.target.value)} placeholder="e.g. Basis Team" />
          <Select label={t('mig.wricef_owner')} options={ownerOpts} value={form.owner_id} onChange={e => set('owner_id', e.target.value)} />
          <Input label={t('mig.task_duration')} type="number" step="0.5" min="0" value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} />
          <Input label={t('mig.task_depends_on')} type="number" min="1" value={form.depends_on} onChange={e => set('depends_on', e.target.value)} placeholder="— seq # —" />
          <Select label={t('mig.task_status')} options={statusOpts} value={form.status} onChange={e => set('status', e.target.value)} />
        </div>
        <Textarea label={t('label.notes')} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        {errMsg && <p className="text-red-600 text-xs mb-3">{errMsg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{t('action.cancel')}</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULE 4 — Data Migration Tracker
// ════════════════════════════════════════════════════════════════

const MAPPING_STATUS_CLS = {
  not_started: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const SEV_CLS = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const ISSUE_STATUS_CLS = {
  open:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function PctPill({ value }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>;
  const n = parseFloat(value);
  const cls = n >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : n >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            :           'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {n.toFixed(0)}%
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// SYNC HUB → CASES
// ════════════════════════════════════════════════════════════════

async function syncHubToCases(migProject, onProgress) {
  const projectId = migProject.project_id;

  // Fetch migration config
  const { data: cfgRow } = await supabase.from('system_settings').select('value').eq('key', 'migration_config').maybeSingle();
  const migConfig = cfgRow?.value ?? DEFAULT_MIGRATION_CONFIG;
  const syncBehavior = {
    phase_deliverables: migConfig.sync?.phase_deliverables ?? 'activity',
    wricef_items:       migConfig.sync?.wricef_items       ?? 'case',
    cutover_tasks:      migConfig.sync?.cutover_tasks      ?? 'activity',
  };
  const configPhases = migConfig.phases ?? DEFAULT_MIGRATION_CONFIG.phases;

  onProgress({ msg: 'Fetching hub data…' });

  const [
    { data: deliverables, error: dErr },
    { data: wricefObjects, error: wErr },
    { data: cutoverTasks, error: cErr },
    { data: gates, error: gErr },
  ] = await Promise.all([
    supabase.from('migration_phase_deliverables').select('*').eq('migration_project_id', migProject.id).order('created_at'),
    supabase.from('wricef_objects').select('*').eq('migration_project_id', migProject.id).order('created_at'),
    supabase.from('cutover_tasks').select('*').eq('migration_project_id', migProject.id).order('seq'),
    supabase.from('migration_phase_gates').select('*').eq('migration_project_id', migProject.id),
  ]);

  if (dErr || wErr || cErr || gErr) throw new Error((dErr ?? wErr ?? cErr ?? gErr).message);

  const gateMap = {};
  (gates ?? []).forEach(g => { gateMap[g.phase] = g; });

  // Load existing migration-generated cases
  const { data: existingCases } = await supabase
    .from('cases')
    .select('id, migration_ref, case_type')
    .eq('project_id', projectId)
    .not('migration_ref', 'is', null);

  const phaseCase = {};
  let wricefRegistryId = null;
  let cutoverId = null;
  const wricefSubById = {};

  for (const c of (existingCases ?? [])) {
    const ref = c.migration_ref;
    if (!ref || ref.migration_project_id !== migProject.id) continue;
    if (ref.type === 'phase')            phaseCase[ref.phase] = c.id;
    if (ref.type === 'wricef_registry')  wricefRegistryId = c.id;
    if (ref.type === 'wricef_object' && ref.wricef_object_id) wricefSubById[ref.wricef_object_id] = c.id;
    if (ref.type === 'cutover')          cutoverId = c.id;
  }

  // ── Phase Cases ───────────────────────────────────────────────
  // Use config phase order but only for phases that have gates in this project; include any extra DB phases after
  const configPhaseKeys = configPhases.map(p => p.key);
  const dbPhaseKeys = Object.keys(gateMap);
  const syncPhaseKeys = [
    ...configPhaseKeys.filter(k => dbPhaseKeys.includes(k)),
    ...dbPhaseKeys.filter(k => !configPhaseKeys.includes(k)),
  ];

  for (const phase of syncPhaseKeys) {
    onProgress({ msg: `Syncing phase: ${cap(phase)}…` });
    const gate = gateMap[phase];
    const phaseDelivs = (deliverables ?? []).filter(d => d.phase === phase);
    const doneCount = phaseDelivs.filter(d => d.completed).length;
    const pct = phaseDelivs.length ? Math.round((doneCount / phaseDelivs.length) * 100) : 0;
    const caseStatus = gate?.status === 'completed' ? 'closed' : gate?.status === 'in_progress' ? 'open' : 'planning';

    let caseId = phaseCase[phase];
    if (!caseId) {
      const { data: nc, error: ncErr } = await supabase.from('cases').insert({
        title: `[SAP Activate] ${cap(phase)} Phase`,
        description: `Auto-generated from Migration Hub.\nApproach: ${migProject.approach} | ${migProject.source_version ?? '?'} → ${migProject.target_version ?? '?'}\nGo-Live: ${migProject.go_live_date ?? '—'}`,
        project_id: projectId,
        case_type: 'migration_phase',
        status: caseStatus,
        priority: ['realize', 'deploy'].includes(phase) ? 'high' : 'medium',
        progress_pct: pct,
        migration_ref: { type: 'phase', migration_project_id: migProject.id, phase },
      }).select('id').single();
      if (ncErr) throw new Error(`Phase case: ${ncErr.message}`);
      caseId = nc.id;
    } else {
      await supabase.from('cases').update({ status: caseStatus, progress_pct: pct }).eq('id', caseId);
    }

    if (syncBehavior.phase_deliverables === 'subcase') {
      // Delete auto-synced deliverable sub-cases and re-create
      await supabase.from('cases').delete()
        .eq('project_id', projectId)
        .contains('migration_ref', { type: 'phase_deliverable', migration_project_id: migProject.id, phase });
      if (phaseDelivs.length > 0) {
        await supabase.from('cases').insert(
          phaseDelivs.map((d, i) => ({
            title: d.title,
            project_id: projectId,
            parent_case_id: caseId,
            case_type: 'migration_phase',
            status: d.completed ? 'closed' : 'open',
            sort_order: i + 1,
            migration_ref: { type: 'phase_deliverable', migration_project_id: migProject.id, phase, deliverable_id: d.id },
          }))
        );
      }
    } else {
      // Default: activities (existing behavior)
      await supabase.from('case_activities').delete().eq('case_id', caseId);
      if (phaseDelivs.length > 0) {
        await supabase.from('case_activities').insert(
          phaseDelivs.map((d, i) => ({
            case_id: caseId,
            task_no: i + 1, sort_order: i + 1,
            title: d.title,
            phase,
            activity_type: 'task',
            status: d.completed ? 'done' : 'pending',
            progress_pct: d.completed ? 100 : 0,
          }))
        );
      }
    }
  }

  // ── WRICEF Registry ───────────────────────────────────────────
  onProgress({ msg: 'Syncing WRICEF registry…' });

  if (!wricefRegistryId) {
    const { data: wc, error: wcErr } = await supabase.from('cases').insert({
      title: '[SAP Migration] WRICEF Registry',
      description: 'Parent case for all WRICEF objects requiring remediation. Sub-cases are auto-generated per object.',
      project_id: projectId,
      case_type: 'wricef_registry',
      status: 'open',
      priority: 'high',
      migration_ref: { type: 'wricef_registry', migration_project_id: migProject.id },
    }).select('id').single();
    if (wcErr) throw new Error(`WRICEF registry: ${wcErr.message}`);
    wricefRegistryId = wc.id;
  }

  if (syncBehavior.wricef_items === 'activity') {
    // Create/replace as activities inside the registry case
    await supabase.from('case_activities').delete().eq('case_id', wricefRegistryId);
    if (wricefObjects?.length > 0) {
      await supabase.from('case_activities').insert(
        (wricefObjects ?? []).map((obj, i) => ({
          case_id: wricefRegistryId,
          task_no: i + 1, sort_order: i + 1,
          title: `[${obj.type}] ${obj.name}`,
          description: obj.description ?? '',
          activity_type: 'task',
          status: obj.status === 'signed_off' ? 'done' : obj.status === 'in_progress' ? 'in_progress' : 'pending',
          progress_pct: obj.status === 'signed_off' ? 100 : obj.status === 'in_progress' ? 50 : 0,
        }))
      );
    }
  } else {
    // Default: sub-cases (existing behavior)
    for (const obj of (wricefObjects ?? [])) {
      if (wricefSubById[obj.id]) {
        await supabase.from('cases').update({
          status: obj.status === 'signed_off' ? 'closed' : 'open',
        }).eq('id', wricefSubById[obj.id]);
        continue;
      }
      const { error: scErr } = await supabase.from('cases').insert({
        title: `[${obj.type}] ${obj.name}`,
        description: [obj.description ?? '', obj.remediation_approach ? `\nRemediation: ${obj.remediation_approach}` : ''].join(''),
        project_id: projectId,
        parent_case_id: wricefRegistryId,
        case_type: 'wricef_object',
        status: obj.status === 'signed_off' ? 'closed' : 'open',
        priority: obj.complexity === 'high' ? 'high' : obj.complexity === 'low' ? 'low' : 'medium',
        estimated_hours: obj.effort_days != null ? obj.effort_days * 8 : null,
        migration_ref: { type: 'wricef_object', migration_project_id: migProject.id, wricef_object_id: obj.id, wricef_type: obj.type },
      });
      if (scErr) throw new Error(`WRICEF sub-case (${obj.name}): ${scErr.message}`);
    }
  }

  // ── Cutover Case ──────────────────────────────────────────────
  onProgress({ msg: 'Syncing cutover plan…' });

  if (!cutoverId) {
    const { data: co, error: coErr } = await supabase.from('cases').insert({
      title: '[SAP Migration] Cutover Plan',
      description: 'Auto-generated cutover plan. Each activity is a go-live cutover task.',
      project_id: projectId,
      case_type: 'cutover_plan',
      status: 'open',
      priority: 'critical',
      migration_ref: { type: 'cutover', migration_project_id: migProject.id },
    }).select('id').single();
    if (coErr) throw new Error(`Cutover case: ${coErr.message}`);
    cutoverId = co.id;
  }

  const goLiveTasks = (cutoverTasks ?? []).filter(tk => tk.run_type === 'go_live' || tk.run_type === 'all');

  if (syncBehavior.cutover_tasks === 'case') {
    // Delete auto-synced cutover sub-cases and re-create
    await supabase.from('cases').delete()
      .eq('project_id', projectId)
      .contains('migration_ref', { type: 'cutover_task', migration_project_id: migProject.id });
    if (goLiveTasks.length > 0) {
      await supabase.from('cases').insert(
        goLiveTasks.map(tk => ({
          title: tk.title,
          description: `Team: ${tk.team ?? '—'} | ${tk.duration_hours ?? '?'}h`,
          project_id: projectId,
          parent_case_id: cutoverId,
          case_type: 'cutover_plan',
          status: tk.status === 'done' ? 'closed' : tk.status === 'in_progress' ? 'open' : 'planning',
          priority: 'high',
          migration_ref: { type: 'cutover_task', migration_project_id: migProject.id, task_id: tk.id },
        }))
      );
    }
  } else {
    // Default: activities (existing behavior)
    await supabase.from('case_activities').delete().eq('case_id', cutoverId);
    if (goLiveTasks.length > 0) {
      await supabase.from('case_activities').insert(
        goLiveTasks.map(tk => ({
          case_id: cutoverId,
          task_no: tk.seq, sort_order: tk.seq,
          title: tk.title,
          description: `Team: ${tk.team ?? '—'} | ${tk.duration_hours ?? '?'}h`,
          activity_type: 'task',
          status: tk.status === 'done' ? 'done' : tk.status === 'in_progress' ? 'in_progress' : 'pending',
          progress_pct: tk.status === 'done' ? 100 : tk.status === 'in_progress' ? 50 : 0,
        }))
      );
    }
  }

  onProgress({ msg: 'Done!' });
  return { phases: syncPhaseKeys.length, wricef: wricefObjects?.length ?? 0, cutoverTasks: goLiveTasks.length };
}

// ── SyncModal ─────────────────────────────────────────────────────

function SyncModal({ migProject, onClose, onDone }) {
  const [log, setLog]       = useState([]);
  const [running, setRunning] = useState(true);
  const [error, setError]   = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await syncHubToCases(migProject, p => {
          if (!cancelled) setLog(l => [...l, p.msg]);
        });
        if (!cancelled) { setResult(res); setRunning(false); }
      } catch (e) {
        if (!cancelled) { setError(e.message); setRunning(false); }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [migProject]);

  return (
    <Modal open onClose={running ? undefined : onClose} title="Sync Hub → Cases">
      <div className="space-y-4 min-w-[340px]">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
          {log.map((msg, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{msg}</span>
            </div>
          ))}
          {running && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 size={11} className="animate-spin flex-shrink-0" />
              <span>Processing…</span>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {result && !error && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-3 text-sm">
            <p className="font-semibold text-green-700 dark:text-green-300 mb-1.5">Sync complete!</p>
            <ul className="text-green-600 dark:text-green-400 space-y-0.5 text-xs">
              <li>✓ {result.phases} phase cases synced</li>
              <li>✓ {result.wricef} WRICEF sub-cases synced</li>
              <li>✓ {result.cutoverTasks} cutover activities synced</li>
            </ul>
          </div>
        )}

        {!running && (
          <div className="flex justify-end gap-2">
            {!error && (
              <button
                onClick={() => { onDone(); onClose(); }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
              >
                View Cases
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── MigCasesTab ───────────────────────────────────────────────────

function MigCasesTab({ migProject }) {
  const { t } = useT();
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('cases')
      .select('id, title, case_type, status, priority, progress_pct, estimated_hours, migration_ref, parent_case_id, created_at')
      .eq('project_id', migProject.project_id)
      .not('migration_ref', 'is', null)
      .order('created_at', { ascending: true });
    if (err) { setError(err.message); setLoading(false); return; }
    const filtered = (data ?? []).filter(c => c.migration_ref?.migration_project_id === migProject.id);
    setCases(filtered);
    setLoading(false);
  }, [migProject.id, migProject.project_id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error)   return <p className="text-red-600 text-sm">{error}</p>;

  if (!cases.length) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
        <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">{t('mig.cases_empty')}</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm">{t('mig.cases_empty_hint')}</p>
      </div>
    );
  }

  const phaseCases     = cases.filter(c => c.migration_ref?.type === 'phase');
  const wricefRegistry = cases.find(c => c.migration_ref?.type === 'wricef_registry');
  const wricefSubs     = cases.filter(c => c.migration_ref?.type === 'wricef_object');
  const cutoverCase    = cases.find(c => c.migration_ref?.type === 'cutover');

  const statusCls = s => ({
    draft:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    open:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    closed:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  }[s] ?? 'bg-gray-100 text-gray-600');

  const CaseRow = ({ c, indent }) => (
    <div className={`flex items-center gap-3 py-2.5 ${indent ? 'pl-8 border-l-2 border-indigo-100 dark:border-indigo-900/40 ml-4' : ''} border-b border-gray-100 dark:border-gray-700/50 last:border-0`}>
      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 font-medium truncate">{c.title}</span>
      {c.estimated_hours && (
        <span className="text-xs text-gray-400 font-mono">{c.estimated_hours}h</span>
      )}
      {c.progress_pct > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.progress_pct}%` }} />
          </div>
          <span className="text-xs text-gray-400">{c.progress_pct}%</span>
        </div>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls(c.status)}`}>
        {c.status}
      </span>
    </div>
  );

  const SectionCard = ({ title, icon: Icon, color, children, count }) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/60">
        <Icon size={15} style={{ color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
        {count != null && (
          <span className="ml-auto text-xs text-gray-400 font-medium">{count} {count === 1 ? 'case' : 'cases'}</span>
        )}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Phase Cases',      val: phaseCases.length,  color: 'text-blue-600 dark:text-blue-400' },
          { label: 'WRICEF Sub-cases', val: wricefSubs.length,  color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Cutover Case',     val: cutoverCase ? '✓' : '—', color: 'text-green-600 dark:text-green-400' },
          { label: 'Total Cases',      val: cases.length,       color: 'text-gray-700 dark:text-gray-200' },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      {phaseCases.length > 0 && (
        <SectionCard title="SAP Activate Phases" icon={Milestone} color="#3b82f6" count={phaseCases.length}>
          {phaseCases.map(c => <CaseRow key={c.id} c={c} />)}
        </SectionCard>
      )}

      {(wricefRegistry || wricefSubs.length > 0) && (
        <SectionCard title="WRICEF Registry" icon={Code2} color="#9333ea" count={wricefSubs.length}>
          {wricefRegistry && <CaseRow c={wricefRegistry} />}
          {wricefSubs.map(c => <CaseRow key={c.id} c={c} indent />)}
        </SectionCard>
      )}

      {cutoverCase && (
        <SectionCard title="Cutover Plan" icon={Rocket} color="#22c55e" count={1}>
          <CaseRow c={cutoverCase} />
        </SectionCard>
      )}
    </div>
  );
}

// ── WricefBlueprintPanel ──────────────────────────────────────────

const WRICEF_TYPE_FULL = {
  W: 'Workflow', R: 'Report', I: 'Interface',
  C: 'Conversion', E: 'Enhancement', F: 'Form',
};

function WricefBlueprintPanel({ obj, onSaved }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError]     = useState(null);
  const [blueprint, setBlueprint] = useState(obj.blueprint ?? null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const raw = await callClaude({
        system: 'You are an SAP S/4HANA migration expert. Always respond with valid JSON only — no markdown fences, no explanation text.',
        messages: [{
          role: 'user',
          content: `Generate a technical implementation blueprint for this SAP WRICEF object:

Type: ${obj.type} — ${WRICEF_TYPE_FULL[obj.type] ?? obj.type}
Object ID: ${obj.object_id ?? 'N/A'}
Name: ${obj.name}
Description: ${obj.description ?? 'N/A'}
Complexity: ${obj.complexity}
Estimated Effort: ${obj.effort_days ?? '?'} days
Remediation Approach: ${obj.remediation_approach ?? 'Not specified'}

Return ONLY a JSON object with this exact structure:
{
  "technical_design": "3-4 sentence technical design summary",
  "target_object": "Specific S/4HANA target: BAdI / CDS View / BAPI / Function Module name",
  "approach_steps": ["step 1","step 2","step 3","step 4"],
  "abap_skeleton": "10-15 line ABAP code skeleton showing structure",
  "test_scenarios": [
    {"id":"TS-01","title":"scenario title","expected":"expected result"},
    {"id":"TS-02","title":"scenario title","expected":"expected result"},
    {"id":"TS-03","title":"scenario title","expected":"expected result"}
  ],
  "sign_off_checklist": ["item 1","item 2","item 3","item 4","item 5"],
  "risk_notes": "Key risks and mitigation in 2 sentences"
}`,
        }],
        max_tokens: 2000,
        model: 'claude-sonnet-4-6',
      });

      const parsed = JSON.parse(raw);
      const withMeta = { ...parsed, generated_at: new Date().toISOString() };

      const { error: saveErr } = await supabase
        .from('wricef_objects')
        .update({ blueprint: withMeta })
        .eq('id', obj.id);
      if (saveErr) throw new Error(saveErr.message);

      setBlueprint(withMeta);
      onSaved?.(withMeta);
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900/60 border-t border-gray-100 dark:border-gray-700/60 px-6 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-purple-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Technical Blueprint</span>
          {blueprint?.generated_at && (
            <span className="text-xs text-gray-400">· generated {fmtDate(blueprint.generated_at)}</span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
        >
          {generating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          {blueprint ? 'Regenerate with AI' : 'Generate with AI'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {!blueprint && !generating && (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          No blueprint yet. Click "Generate with AI" to create a technical design, ABAP skeleton, test scenarios and sign-off checklist.
        </p>
      )}

      {generating && (
        <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
          <Loader2 size={14} className="animate-spin" />
          Generating blueprint with Claude AI…
        </div>
      )}

      {blueprint && !generating && (
        <div className="space-y-5 text-sm">
          {/* Technical design */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Technical Design</h4>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{blueprint.technical_design}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target object */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">S/4HANA Target Object</h4>
              <code className="block text-xs bg-gray-900 dark:bg-black text-purple-300 px-3 py-2 rounded-lg font-mono">
                {blueprint.target_object}
              </code>
            </div>

            {/* Approach steps */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Approach Steps</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-xs">
                {(blueprint.approach_steps ?? []).map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          </div>

          {/* ABAP skeleton */}
          {blueprint.abap_skeleton && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">ABAP Skeleton</h4>
              <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs px-4 py-3 rounded-xl overflow-x-auto font-mono leading-relaxed">
                {blueprint.abap_skeleton}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Test scenarios */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Test Scenarios</h4>
              <div className="space-y-2">
                {(blueprint.test_scenarios ?? []).map(ts => (
                  <div key={ts.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono font-bold text-gray-400 flex-shrink-0">{ts.id}</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{ts.title}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-6">{ts.expected}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sign-off checklist */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Sign-Off Checklist</h4>
              <div className="space-y-1.5">
                {(blueprint.sign_off_checklist ?? []).map((item, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded accent-purple-600" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              {blueprint.risk_notes && (
                <div className="mt-4 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    <strong className="font-semibold">Risks: </strong>{blueprint.risk_notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
