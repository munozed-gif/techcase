// ============================================================
// FitGapView.jsx — Fit-Gap Register
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  GitCompare, Download, Filter, Plus, X, AlertCircle, Pencil,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";

// ─── Constants ────────────────────────────────────────────────

const GAP_TYPES   = ['fit', 'gap', 'partial_fit'];
const PRIORITIES  = ['high', 'medium', 'low'];
const RESOLUTIONS = ['standard', 'config', 'wricef', 'process_change', 'out_of_scope'];
const STATUSES    = ['open', 'in_progress', 'resolved', 'deferred'];

const GAP_TYPE_COLORS = {
  fit:         'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  gap:         'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  partial_fit: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const PRIORITY_COLORS = {
  high:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_COLORS = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  deferred:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const EMPTY_FORM = {
  migration_project_id: '', item_number: '', process_area: '', description: '',
  gap_type: 'gap', priority: 'medium', resolution: '', wricef_id: '', owner_id: '', status: 'open', notes: '',
};

export function FitGapView({ auth }) {
  const { t } = useT();
  const canEdit = auth.isAdmin || auth.isManager;

  const [items, setItems]         = useState([]);
  const [projects, setProjects]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [wricefs, setWricefs]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState('');

  // Filters
  const [filterProject,  setFilterProject]  = useState('');
  const [filterGapType,  setFilterGapType]  = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');

  // Edit/create modal
  const [editItem, setEditItem]   = useState(null);  // null=closed, {} = create, obj = edit
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [{ data: itemData, error: itemErr }, { data: projData }, { data: userData }, { data: wricefData }] = await Promise.all([
      supabase.from('fitgap_items').select('*').order('created_at', { ascending: false }),
      supabase.from('migration_projects').select('id, name').order('name'),
      supabase.from('users').select('id, full_name').order('full_name'),
      supabase.from('wricef_objects').select('id, name, migration_project_id').order('name'),
    ]);
    if (itemErr) setErr(itemErr.message);
    else setItems(itemData ?? []);
    setProjects(projData ?? []);
    setUsers(userData ?? []);
    setWricefs(wricefData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => {
    if (filterProject  && i.migration_project_id !== filterProject) return false;
    if (filterGapType  && i.gap_type             !== filterGapType)  return false;
    if (filterPriority && i.priority             !== filterPriority) return false;
    if (filterStatus   && i.status               !== filterStatus)   return false;
    return true;
  });

  // Summary tiles
  const total      = items.length;
  const fitCount   = items.filter(i => i.gap_type === 'fit').length;
  const gapCount   = items.filter(i => i.gap_type === 'gap').length;
  const partialCount = items.filter(i => i.gap_type === 'partial_fit').length;
  const openCount  = items.filter(i => i.status === 'open' || i.status === 'in_progress').length;

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormErr('');
    setEditItem({});
  }

  function openEdit(item) {
    setForm({
      migration_project_id: item.migration_project_id ?? '',
      item_number:  item.item_number ?? '',
      process_area: item.process_area ?? '',
      description:  item.description ?? '',
      gap_type:     item.gap_type ?? 'gap',
      priority:     item.priority ?? 'medium',
      resolution:   item.resolution ?? '',
      wricef_id:    item.wricef_id ?? '',
      owner_id:     item.owner_id ?? '',
      status:       item.status ?? 'open',
      notes:        item.notes ?? '',
    });
    setFormErr('');
    setEditItem(item);
  }

  async function save() {
    setFormErr('');
    if (!form.description.trim()) { setFormErr(t('fitgap.description_required')); return; }
    setSaving(true);
    const payload = {
      migration_project_id: form.migration_project_id || null,
      item_number:  form.item_number || null,
      process_area: form.process_area || null,
      description:  form.description.trim(),
      gap_type:     form.gap_type,
      priority:     form.priority,
      resolution:   form.resolution || null,
      wricef_id:    form.wricef_id || null,
      owner_id:     form.owner_id || null,
      status:       form.status,
      notes:        form.notes || null,
    };
    let error;
    if (editItem?.id) {
      ({ error } = await supabase.from('fitgap_items').update(payload).eq('id', editItem.id));
    } else {
      ({ error } = await supabase.from('fitgap_items').insert(payload));
    }
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setEditItem(null);
    load();
  }

  function exportCsv() {
    const rows = [
      ['Item #', 'Process Area', 'Description', 'Gap Type', 'Priority', 'Resolution', 'Status', 'Owner'],
      ...filtered.map(i => [
        i.item_number ?? '',
        i.process_area ?? '',
        i.description,
        i.gap_type,
        i.priority,
        i.resolution ?? '',
        i.status,
        users.find(u => u.id === i.owner_id)?.full_name ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'fitgap_items.csv';
    a.click();
  }

  const projOpts     = [{ value: '', label: t('fitgap.all_projects') }, ...projects.map(p => ({ value: p.id, label: p.name }))];
  const gapTypeOpts  = [{ value: '', label: t('fitgap.all_gap_types') }, ...GAP_TYPES.map(g => ({ value: g, label: t(`fitgap.gap_${g}`) }))];
  const priorityOpts = [{ value: '', label: t('fitgap.all_priorities') }, ...PRIORITIES.map(p => ({ value: p, label: t(`fitgap.priority_${p}`) }))];
  const statusOpts   = [{ value: '', label: t('fitgap.all_statuses') }, ...STATUSES.map(s => ({ value: s, label: t(`fitgap.status_${s}`) }))];
  const userOpts     = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];
  const resOpts      = [{ value: '', label: '—' }, ...RESOLUTIONS.map(r => ({ value: r, label: t(`fitgap.resolution_${r}`) }))];

  // WRICEF options scoped to selected project
  const wricefOpts = [
    { value: '', label: '—' },
    ...wricefs
      .filter(w => !form.migration_project_id || w.migration_project_id === form.migration_project_id)
      .map(w => ({ value: w.id, label: w.name })),
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <GitCompare className="text-blue-500" size={24} />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('fitgap.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('fitgap.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
            <Download size={15} /> {t('action.export_csv')}
          </button>
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={15} /> {t('fitgap.new_item')}
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t('fitgap.total'),    value: total,        color: 'text-blue-600 dark:text-blue-400' },
          { label: t('fitgap.fit'),      value: fitCount,     color: 'text-green-600 dark:text-green-400' },
          { label: t('fitgap.gap'),      value: gapCount,     color: 'text-red-600 dark:text-red-400' },
          { label: t('fitgap.partial'),  value: partialCount, color: 'text-amber-600 dark:text-amber-400' },
          { label: t('fitgap.open'),     value: openCount,    color: 'text-slate-600 dark:text-slate-400' },
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
        <Select value={filterGapType}  onChange={e => setFilterGapType(e.target.value)}  options={gapTypeOpts}  className="text-sm" />
        <Select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} options={priorityOpts} className="text-sm" />
        <Select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}   options={statusOpts}   className="text-sm" />
        {(filterProject || filterGapType || filterPriority || filterStatus) && (
          <button onClick={() => { setFilterProject(''); setFilterGapType(''); setFilterPriority(''); setFilterStatus(''); }} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
            <X size={13} /> {t('action.clear')}
          </button>
        )}
      </div>

      {err && <div className="text-red-500 text-sm flex items-center gap-2"><AlertCircle size={15} />{err}</div>}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('fitgap.no_items')}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">{t('fitgap.item_number')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.process_area')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.description')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.gap_type')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.priority')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.resolution')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.status')}</th>
                <th className="px-4 py-3 text-left">{t('fitgap.owner')}</th>
                {canEdit && <th className="px-4 py-3 text-left"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(item => {
                const ownerName = users.find(u => u.id === item.owner_id)?.full_name ?? '—';
                return (
                  <tr key={item.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{item.item_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.process_area || '—'}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white max-w-xs truncate">{item.description}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${GAP_TYPE_COLORS[item.gap_type] ?? ''}`}>
                        {t(`fitgap.gap_${item.gap_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[item.priority] ?? ''}`}>
                        {t(`fitgap.priority_${item.priority}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{item.resolution ? t(`fitgap.resolution_${item.resolution}`) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
                        {t(`fitgap.status_${item.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ownerName}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                          <Pencil size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Modal */}
      {editItem !== null && (
        <Modal open onClose={() => setEditItem(null)} title={editItem.id ? t('fitgap.edit_item') : t('fitgap.new_item')}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.item_number')}</label>
                <Input value={form.item_number} onChange={e => setForm(f => ({ ...f, item_number: e.target.value }))} placeholder="FG-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.process_area')}</label>
                <Input value={form.process_area} onChange={e => setForm(f => ({ ...f, process_area: e.target.value }))} placeholder="FI-GL" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.description')} *</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.gap_type')}</label>
                <Select value={form.gap_type} onChange={e => setForm(f => ({ ...f, gap_type: e.target.value }))}
                  options={GAP_TYPES.map(g => ({ value: g, label: t(`fitgap.gap_${g}`) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.priority')}</label>
                <Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  options={PRIORITIES.map(p => ({ value: p, label: t(`fitgap.priority_${p}`) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.resolution')}</label>
                <Select value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value, wricef_id: e.target.value !== 'wricef' ? '' : f.wricef_id }))} options={resOpts} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.status')}</label>
                <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  options={STATUSES.map(s => ({ value: s, label: t(`fitgap.status_${s}`) }))} />
              </div>
            </div>
            {form.resolution === 'wricef' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.wricef_object')}</label>
                <Select value={form.wricef_id} onChange={e => setForm(f => ({ ...f, wricef_id: e.target.value }))} options={wricefOpts} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.project')}</label>
              <Select value={form.migration_project_id} onChange={e => setForm(f => ({ ...f, migration_project_id: e.target.value }))} options={projOpts} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.owner')}</label>
              <Select value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))} options={userOpts} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('fitgap.notes')}</label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            {formErr && <p className="text-red-500 text-sm">{formErr}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {t('action.cancel')}
              </button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? t('action.saving') : t('action.save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default FitGapView;
