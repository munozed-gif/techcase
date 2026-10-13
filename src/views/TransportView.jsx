// ============================================================
// TransportView.jsx — Transport Request Manager
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  ArrowRightLeft, ChevronDown, ChevronUp, Download, Filter,
  Plus, RefreshCw, Trash2, X, CheckCircle2, XCircle, ArrowRight,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";

// ─── Constants ────────────────────────────────────────────────

const TR_STATUSES = ['dev', 'released', 'qa', 'prod', 'rejected'];
const TR_CATEGORIES = ['Workbench', 'Customizing', 'Transport of Copies'];

const STATUS_COLORS = {
  dev:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  released: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  qa:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  prod:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_NEXT = { dev: 'released', released: 'qa', qa: 'prod' };

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

// ─── TransportView ────────────────────────────────────────────

export function TransportView({ auth }) {
  const { t } = useT();
  const canEdit = auth.isAdmin || auth.isManager;

  const [trs, setTrs]               = useState([]);
  const [projects, setProjects]     = useState([]);
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState('');

  // Filters
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({ tr_number: '', description: '', category: '', owner_id: '', migration_project_id: '' });
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState('');

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [{ data: trData, error: trErr }, { data: projData }, { data: userData }] = await Promise.all([
      supabase.from('transport_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('migration_projects').select('id, name').order('name'),
      supabase.from('users').select('id, full_name').order('full_name'),
    ]);
    if (trErr) setErr(trErr.message);
    else setTrs(trData ?? []);
    setProjects(projData ?? []);
    setUsers(userData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered list
  const filtered = trs.filter(r => {
    if (filterStatus   && r.status   !== filterStatus)   return false;
    if (filterCategory && r.category !== filterCategory) return false;
    return true;
  });

  // Summary tiles
  const total    = trs.length;
  const inQA     = trs.filter(r => r.status === 'qa').length;
  const inProd   = trs.filter(r => r.status === 'prod').length;
  const rejected = trs.filter(r => r.status === 'rejected').length;

  // Advance status
  async function advance(tr) {
    const next = STATUS_NEXT[tr.status];
    if (!next) return;
    const patch = { status: next };
    if (next === 'released') patch.released_at = new Date().toISOString();
    if (next === 'qa')       patch.qa_imported_at = new Date().toISOString();
    if (next === 'prod')     patch.prod_imported_at = new Date().toISOString();
    await supabase.from('transport_requests').update(patch).eq('id', tr.id);
    load();
  }

  // Reject
  async function doReject() {
    if (!rejectTarget) return;
    await supabase.from('transport_requests').update({ status: 'rejected', rejected_reason: rejectReason }).eq('id', rejectTarget.id);
    setRejectTarget(null);
    setRejectReason('');
    load();
  }

  // Create
  async function create() {
    setFormErr('');
    if (!form.tr_number.trim()) { setFormErr(t('transport.tr_number_required')); return; }
    setSaving(true);
    const { error } = await supabase.from('transport_requests').insert({
      tr_number: form.tr_number.trim(),
      description: form.description || null,
      category: form.category || null,
      owner_id: form.owner_id || null,
      migration_project_id: form.migration_project_id || null,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setShowCreate(false);
    setForm({ tr_number: '', description: '', category: '', owner_id: '', migration_project_id: '' });
    load();
  }

  // Export CSV
  function exportCsv() {
    const rows = [
      ['TR Number', 'Description', 'Category', 'Status', 'Owner', 'Released At', 'QA Imported At', 'Prod Imported At'],
      ...filtered.map(r => [
        r.tr_number,
        r.description ?? '',
        r.category ?? '',
        r.status,
        users.find(u => u.id === r.owner_id)?.full_name ?? '',
        fmtDate(r.released_at),
        fmtDate(r.qa_imported_at),
        fmtDate(r.prod_imported_at),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'transport_requests.csv';
    a.click();
  }

  const userOpts  = [{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.full_name }))];
  const projOpts  = [{ value: '', label: '—' }, ...projects.map(p => ({ value: p.id, label: p.name }))];
  const catOpts   = [{ value: '', label: t('transport.all_categories') }, ...TR_CATEGORIES.map(c => ({ value: c, label: c }))];
  const statOpts  = [{ value: '', label: t('transport.all_statuses') }, ...TR_STATUSES.map(s => ({ value: s, label: t(`transport.status_${s}`) }))];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="text-blue-500" size={24} />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('transport.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('transport.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
            <Download size={15} /> {t('action.export_csv')}
          </button>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={15} /> {t('transport.new_tr')}
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('transport.total'),    value: total,    color: 'text-blue-600 dark:text-blue-400' },
          { label: t('transport.in_qa'),    value: inQA,     color: 'text-amber-600 dark:text-amber-400' },
          { label: t('transport.in_prod'),  value: inProd,   color: 'text-green-600 dark:text-green-400' },
          { label: t('transport.rejected'), value: rejected, color: 'text-red-600 dark:text-red-400' },
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
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} options={statOpts} className="text-sm" />
        <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} options={catOpts} className="text-sm" />
        {(filterStatus || filterCategory) && (
          <button onClick={() => { setFilterStatus(''); setFilterCategory(''); }} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
            <X size={13} /> {t('action.clear')}
          </button>
        )}
      </div>

      {/* Error */}
      {err && <div className="text-red-500 text-sm flex items-center gap-2"><AlertCircle size={15} />{err}</div>}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('transport.no_trs')}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">{t('transport.tr_number')}</th>
                <th className="px-4 py-3 text-left">{t('transport.description')}</th>
                <th className="px-4 py-3 text-left">{t('transport.category')}</th>
                <th className="px-4 py-3 text-left">{t('transport.owner')}</th>
                <th className="px-4 py-3 text-left">{t('transport.status')}</th>
                <th className="px-4 py-3 text-left">{t('transport.released_at')}</th>
                <th className="px-4 py-3 text-left">{t('transport.qa_at')}</th>
                <th className="px-4 py-3 text-left">{t('transport.prod_at')}</th>
                {canEdit && <th className="px-4 py-3 text-left">{t('transport.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(tr => {
                const ownerName = users.find(u => u.id === tr.owner_id)?.full_name ?? '—';
                const next = STATUS_NEXT[tr.status];
                return (
                  <tr key={tr.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">{tr.tr_number}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{tr.description || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{tr.category || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ownerName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[tr.status] ?? ''}`}>
                        {t(`transport.status_${tr.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(tr.released_at)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(tr.qa_imported_at)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(tr.prod_imported_at)}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {next && (
                            <button onClick={() => advance(tr)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                              <ArrowRight size={13} /> {t(`transport.status_${next}`)}
                            </button>
                          )}
                          {tr.status !== 'rejected' && tr.status !== 'prod' && (
                            <button onClick={() => setRejectTarget(tr)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400">
                              <XCircle size={13} /> {t('action.reject')}
                            </button>
                          )}
                        </div>
                        {tr.status === 'rejected' && tr.rejected_reason && (
                          <p className="text-xs text-gray-400 mt-1 max-w-xs truncate">{tr.rejected_reason}</p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal open onClose={() => setShowCreate(false)} title={t('transport.new_tr')}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('transport.tr_number')} *</label>
              <Input value={form.tr_number} onChange={e => setForm(f => ({ ...f, tr_number: e.target.value }))} placeholder="DEV K900123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('transport.description')}</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('transport.category')}</label>
              <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                options={[{ value: '', label: '—' }, ...TR_CATEGORIES.map(c => ({ value: c, label: c }))]} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('transport.owner')}</label>
              <Select value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))} options={userOpts} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('transport.project')}</label>
              <Select value={form.migration_project_id} onChange={e => setForm(f => ({ ...f, migration_project_id: e.target.value }))} options={projOpts} />
            </div>
            {formErr && <p className="text-red-500 text-sm">{formErr}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                {t('action.cancel')}
              </button>
              <button onClick={create} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? t('action.saving') : t('action.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <Modal open onClose={() => { setRejectTarget(null); setRejectReason(''); }} title={t('transport.reject_title')}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('transport.reject_reason_label')}</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {t('action.cancel')}
              </button>
              <button onClick={doReject} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">
                {t('action.reject')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default TransportView;
