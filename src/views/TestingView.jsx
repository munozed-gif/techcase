// ============================================================
// TestingView.jsx — Testing Cockpit
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, ChevronDown, ChevronUp, Download, Filter,
  Plus, X, AlertCircle, Play, CheckCircle2, XCircle, Clock,
  Bug, Pencil,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";

// ─── Constants ────────────────────────────────────────────────

const TEST_TYPES   = ['unit', 'integration', 'uat', 'regression', 'performance'];
const PRIORITIES   = ['high', 'medium', 'low'];
const SCRIPT_STATUSES = ['not_started', 'in_progress', 'passed', 'failed', 'blocked'];
const DEFECT_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEFECT_STATUSES   = ['open', 'in_progress', 'resolved', 'closed'];

const SCRIPT_STATUS_COLORS = {
  not_started: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  passed:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  blocked:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const SEVERITY_COLORS = {
  critical: 'bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const DEFECT_STATUS_COLORS = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  closed:      'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const EMPTY_SCRIPT_FORM = {
  migration_project_id: '', script_id: '', title: '', process_area: '',
  test_type: 'integration', assigned_to: '', status: 'not_started', priority: 'medium', notes: '',
};

const EMPTY_DEFECT_FORM = {
  defect_id: '', title: '', severity: 'medium', status: 'open', assigned_to: '', resolution_notes: '',
};

// ─── DefectsPanel ─────────────────────────────────────────────

function DefectsPanel({ scriptId, users, canEdit, t, onDefectChange }) {
  const [defects, setDefects]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState(EMPTY_DEFECT_FORM);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const loadDefects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('test_defects').select('*').eq('test_script_id', scriptId).order('created_at');
    setDefects(data ?? []);
    setLoading(false);
  }, [scriptId]);

  useEffect(() => { loadDefects(); }, [loadDefects]);

  async function addDefect() {
    setErr('');
    if (!form.title.trim()) { setErr(t('testing.defect_title_required')); return; }
    setSaving(true);
    const { error } = await supabase.from('test_defects').insert({
      test_script_id: scriptId,
      defect_id:        form.defect_id || null,
      title:            form.title.trim(),
      severity:         form.severity,
      status:           form.status,
      assigned_to:      form.assigned_to || null,
      resolution_notes: form.resolution_notes || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setShowAdd(false);
    setForm(EMPTY_DEFECT_FORM);
    loadDefects();
    onDefectChange();
  }

  const userOpts = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];

  return (
    <div className="mt-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Bug size={14} className="text-red-500" />
          {t('testing.defects')}
        </h4>
        {canEdit && (
          <button onClick={() => { setShowAdd(v => !v); setForm(EMPTY_DEFECT_FORM); setErr(''); }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <Plus size={12} /> {t('testing.add_defect')}
          </button>
        )}
      </div>
      {loading ? <Spinner /> : (
        defects.length === 0 && !showAdd ? (
          <p className="text-xs text-gray-400">{t('testing.no_defects')}</p>
        ) : (
          <div className="space-y-2">
            {defects.map(d => {
              const assignee = users.find(u => u.id === d.assigned_to)?.full_name ?? '—';
              return (
                <div key={d.id} className="flex items-start gap-3 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                  <span className={`mt-0.5 inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${SEVERITY_COLORS[d.severity] ?? ''}`}>
                    {t(`testing.severity_${d.severity}`)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{d.defect_id ? `[${d.defect_id}] ` : ''}{d.title}</p>
                    {d.resolution_notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d.resolution_notes}</p>}
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${DEFECT_STATUS_COLORS[d.status] ?? ''}`}>
                    {t(`testing.defect_status_${d.status}`)}
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{assignee}</span>
                </div>
              );
            })}
          </div>
        )
      )}
      {showAdd && (
        <div className="mt-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.defect_id')}</label>
              <Input value={form.defect_id} onChange={e => setForm(f => ({ ...f, defect_id: e.target.value }))} placeholder="DEF-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.severity')}</label>
              <Select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                options={DEFECT_SEVERITIES.map(s => ({ value: s, label: t(`testing.severity_${s}`) }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.defect_title')} *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.defect_status')}</label>
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                options={DEFECT_STATUSES.map(s => ({ value: s, label: t(`testing.defect_status_${s}`) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.assigned_to')}</label>
              <Select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} options={userOpts} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.resolution_notes')}</label>
            <Textarea value={form.resolution_notes} onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))} rows={2} />
          </div>
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('action.cancel')}
            </button>
            <button onClick={addDefect} disabled={saving} className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
              {saving ? t('action.saving') : t('testing.add_defect')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TestingView ───────────────────────────────────────────────

export function TestingView({ auth }) {
  const { t } = useT();
  const canEdit = auth.isAdmin || auth.isManager;

  const [scripts, setScripts]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [expanded, setExpanded] = useState(null);

  // Filters
  const [filterProject,  setFilterProject]  = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState(EMPTY_SCRIPT_FORM);
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [{ data: scriptData, error: scriptErr }, { data: projData }, { data: userData }] = await Promise.all([
      supabase.from('test_scripts').select('*').order('created_at', { ascending: false }),
      supabase.from('migration_projects').select('id, name').order('name'),
      supabase.from('users').select('id, full_name').order('full_name'),
    ]);
    if (scriptErr) setErr(scriptErr.message);
    else setScripts(scriptData ?? []);
    setProjects(projData ?? []);
    setUsers(userData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = scripts.filter(s => {
    if (filterProject  && s.migration_project_id !== filterProject) return false;
    if (filterType     && s.test_type             !== filterType)    return false;
    if (filterStatus   && s.status                !== filterStatus)  return false;
    if (filterPriority && s.priority              !== filterPriority) return false;
    return true;
  });

  // Summary tiles
  const total       = scripts.length;
  const passed      = scripts.filter(s => s.status === 'passed').length;
  const failed      = scripts.filter(s => s.status === 'failed').length;
  const blocked     = scripts.filter(s => s.status === 'blocked').length;
  const openDefects = scripts.reduce((acc, s) => acc + (s.defects ?? 0), 0);

  async function updateStatus(script, newStatus) {
    const patch = { status: newStatus };
    if (newStatus !== 'not_started') patch.executed_at = new Date().toISOString();
    await supabase.from('test_scripts').update(patch).eq('id', script.id);
    load();
  }

  async function createScript() {
    setFormErr('');
    if (!form.title.trim()) { setFormErr(t('testing.title_required')); return; }
    setSaving(true);
    const { error } = await supabase.from('test_scripts').insert({
      migration_project_id: form.migration_project_id || null,
      script_id:   form.script_id || null,
      title:       form.title.trim(),
      process_area: form.process_area || null,
      test_type:   form.test_type,
      assigned_to: form.assigned_to || null,
      status:      form.status,
      priority:    form.priority,
      notes:       form.notes || null,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setShowCreate(false);
    setForm(EMPTY_SCRIPT_FORM);
    load();
  }

  function exportCsv() {
    const rows = [
      ['Script ID', 'Title', 'Process Area', 'Type', 'Assigned To', 'Status', 'Priority', 'Defects'],
      ...filtered.map(s => [
        s.script_id ?? '',
        s.title,
        s.process_area ?? '',
        s.test_type,
        users.find(u => u.id === s.assigned_to)?.full_name ?? '',
        s.status,
        s.priority,
        s.defects ?? 0,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'test_scripts.csv';
    a.click();
  }

  const projOpts     = [{ value: '', label: t('testing.all_projects') }, ...projects.map(p => ({ value: p.id, label: p.name }))];
  const typeOpts     = [{ value: '', label: t('testing.all_types') }, ...TEST_TYPES.map(tt => ({ value: tt, label: t(`testing.type_${tt}`) }))];
  const statusOpts   = [{ value: '', label: t('testing.all_statuses') }, ...SCRIPT_STATUSES.map(s => ({ value: s, label: t(`testing.status_${s}`) }))];
  const priorityOpts = [{ value: '', label: t('testing.all_priorities') }, ...PRIORITIES.map(p => ({ value: p, label: t(`testing.priority_${p}`) }))];
  const userOpts     = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FlaskConical className="text-blue-500" size={24} />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('testing.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('testing.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
            <Download size={15} /> {t('action.export_csv')}
          </button>
          {canEdit && (
            <button onClick={() => { setForm(EMPTY_SCRIPT_FORM); setFormErr(''); setShowCreate(true); }} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={15} /> {t('testing.new_script')}
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t('testing.total'),        value: total,       color: 'text-blue-600 dark:text-blue-400' },
          { label: t('testing.passed'),        value: passed,      color: 'text-green-600 dark:text-green-400' },
          { label: t('testing.failed'),        value: failed,      color: 'text-red-600 dark:text-red-400' },
          { label: t('testing.blocked'),       value: blocked,     color: 'text-amber-600 dark:text-amber-400' },
          { label: t('testing.open_defects'),  value: openDefects, color: 'text-red-700 dark:text-red-400' },
        ].map(tile => (
          <div key={tile.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{tile.label}</p>
            <p className={`text-2xl font-bold mt-1 ${tile.color}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter size={15} className="text-gray-400" />
        <Select value={filterProject}  onChange={e => setFilterProject(e.target.value)}  options={projOpts}     className="text-sm" />
        <Select value={filterType}     onChange={e => setFilterType(e.target.value)}      options={typeOpts}     className="text-sm" />
        <Select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}   options={statusOpts}   className="text-sm" />
        <Select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} options={priorityOpts} className="text-sm" />
        {(filterProject || filterType || filterStatus || filterPriority) && (
          <button onClick={() => { setFilterProject(''); setFilterType(''); setFilterStatus(''); setFilterPriority(''); }} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
            <X size={13} /> {t('action.clear')}
          </button>
        )}
      </div>

      {err && <div className="text-red-500 text-sm flex items-center gap-2"><AlertCircle size={15} />{err}</div>}

      {/* Scripts table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('testing.no_scripts')}</div>
      ) : (
        <div className="space-y-0 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {filtered.map((script, idx) => {
            const assigneeName = users.find(u => u.id === script.assigned_to)?.full_name ?? '—';
            const isExpanded = expanded === script.id;
            return (
              <div key={script.id} className={idx > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}>
                <div className={`flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 ${isExpanded ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} transition-colors`}>
                  {/* Toggle */}
                  <button onClick={() => setExpanded(isExpanded ? null : script.id)} className="text-gray-400 hover:text-blue-500 flex-shrink-0">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {/* Script ID */}
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{script.script_id || '—'}</span>
                  {/* Title */}
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white min-w-0 truncate">{script.title}</span>
                  {/* Process area */}
                  <span className="hidden md:block text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0 truncate">{script.process_area || '—'}</span>
                  {/* Type badge */}
                  <span className="hidden md:inline-flex text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap">
                    {t(`testing.type_${script.test_type}`)}
                  </span>
                  {/* Assignee */}
                  <span className="hidden lg:block text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0 truncate">{assigneeName}</span>
                  {/* Status badge */}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${SCRIPT_STATUS_COLORS[script.status] ?? ''}`}>
                    {t(`testing.status_${script.status}`)}
                  </span>
                  {/* Defects */}
                  {(script.defects ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                      <Bug size={12} /> {script.defects}
                    </span>
                  )}
                  {/* Execute actions */}
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {script.status === 'not_started' && (
                        <button onClick={() => updateStatus(script, 'in_progress')} title={t('testing.start')} className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                          <Play size={14} />
                        </button>
                      )}
                      {script.status === 'in_progress' && (
                        <>
                          <button onClick={() => updateStatus(script, 'passed')} title={t('testing.mark_passed')} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400">
                            <CheckCircle2 size={14} />
                          </button>
                          <button onClick={() => updateStatus(script, 'failed')} title={t('testing.mark_failed')} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400">
                            <XCircle size={14} />
                          </button>
                          <button onClick={() => updateStatus(script, 'blocked')} title={t('testing.mark_blocked')} className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                            <Clock size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 bg-white dark:bg-gray-900">
                    {script.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{script.notes}</p>
                    )}
                    <DefectsPanel
                      scriptId={script.id}
                      users={users}
                      canEdit={canEdit}
                      t={t}
                      onDefectChange={load}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal open onClose={() => setShowCreate(false)} title={t('testing.new_script')}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.script_id')}</label>
                <Input value={form.script_id} onChange={e => setForm(f => ({ ...f, script_id: e.target.value }))} placeholder="TS-FI-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.process_area')}</label>
                <Input value={form.process_area} onChange={e => setForm(f => ({ ...f, process_area: e.target.value }))} placeholder="FI-GL" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.title')} *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.test_type')}</label>
                <Select value={form.test_type} onChange={e => setForm(f => ({ ...f, test_type: e.target.value }))}
                  options={TEST_TYPES.map(tt => ({ value: tt, label: t(`testing.type_${tt}`) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.priority')}</label>
                <Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  options={PRIORITIES.map(p => ({ value: p, label: t(`testing.priority_${p}`) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.assigned_to')}</label>
                <Select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} options={userOpts} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.project')}</label>
                <Select value={form.migration_project_id} onChange={e => setForm(f => ({ ...f, migration_project_id: e.target.value }))} options={projOpts} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('testing.notes')}</label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            {formErr && <p className="text-red-500 text-sm">{formErr}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {t('action.cancel')}
              </button>
              <button onClick={createScript} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? t('action.saving') : t('action.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default TestingView;
