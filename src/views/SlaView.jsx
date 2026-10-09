// ============================================================
// SlaView.jsx — SLA Profiles & Tracking
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle, CheckCircle2, Clock, Loader2,
  Plus, ShieldCheck, X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";

// ─── Default seed profiles ────────────────────────────────────

const DEFAULT_PROFILES = [
  { name: 'P1 Critical', priority_level: 1, first_response_hours: 4,  resolution_hours: 8,   color: '#ef4444', description: 'Business-critical system down' },
  { name: 'P2 High',     priority_level: 2, first_response_hours: 8,  resolution_hours: 24,  color: '#f97316', description: 'Major functionality impaired' },
  { name: 'P3 Medium',   priority_level: 3, first_response_hours: 24, resolution_hours: 72,  color: '#eab308', description: 'Non-critical issue with workaround' },
  { name: 'P4 Low',      priority_level: 4, first_response_hours: 48, resolution_hours: 168, color: '#6366f1', description: 'Question or minor request' },
];

// ─── Utilities ────────────────────────────────────────────────

const fmtDt  = d => d ? new Date(d).toLocaleString()    : '—';
const fmtHrs = h => h != null ? `${h}h` : '—';

function PBadge({ level, color }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color ?? '#6366f1' }}
    >
      P{level}
    </span>
  );
}

// ─── SlaView (exported) ───────────────────────────────────────

export function SlaView({ auth }) {
  const { t } = useT();
  const [profiles, setProfiles]     = useState([]);
  const [tracking, setTracking]     = useState([]);
  const [loadingP, setLoadingP]     = useState(true);
  const [loadingT, setLoadingT]     = useState(true);
  const [error, setError]           = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState(null);

  const loadProfiles = useCallback(async () => {
    setLoadingP(true);
    const { data, error: err } = await supabase
      .from('sla_profiles')
      .select('*')
      .order('priority_level', { ascending: true });
    if (err) setError(err.message);
    else setProfiles(data ?? []);
    setLoadingP(false);
  }, []);

  const loadTracking = useCallback(async () => {
    setLoadingT(true);
    const { data, error: err } = await supabase
      .from('sla_tracking')
      .select(`
        *,
        case:case_id(id, title),
        profile:profile_id(id, name, color, priority_level, first_response_hours, resolution_hours)
      `)
      .order('assigned_at', { ascending: false })
      .limit(50);
    if (err) { /* silently skip — table may not exist yet */ }
    else setTracking(data ?? []);
    setLoadingT(false);
  }, []);

  useEffect(() => {
    loadProfiles();
    loadTracking();
  }, [loadProfiles, loadTracking]);

  async function seedDefaults() {
    const { error: err } = await supabase.from('sla_profiles').insert(DEFAULT_PROFILES);
    if (!err) loadProfiles();
  }

  async function toggleActive(profile) {
    const { error: err } = await supabase
      .from('sla_profiles')
      .update({ is_active: !profile.is_active })
      .eq('id', profile.id);
    if (!err) setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, is_active: !p.is_active } : p));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-500" />
          {t('sla.profiles_title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('sla.profiles_subtitle')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg mb-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── SLA Profiles section ─────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('sla.profiles_title')}</h2>
          {auth.isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('sla.add_profile')}
            </button>
          )}
        </div>

        {loadingP ? (
          <Spinner />
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <ShieldCheck className="w-9 h-9 text-gray-300 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{t('sla.no_profiles')}</p>
            {auth.isAdmin && (
              <button
                onClick={seedDefaults}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Load default profiles (P1–P4)
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {profiles.map(profile => (
              <SlaProfileCard
                key={profile.id}
                profile={profile}
                auth={auth}
                onEdit={() => setEditing(profile)}
                onToggle={() => toggleActive(profile)}
                t={t}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── SLA Tracking section ─────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('sla.tracking_title')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('sla.tracking_subtitle')}</p>
        </div>

        {loadingT ? (
          <Spinner />
        ) : tracking.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <Clock className="w-9 h-9 text-gray-300 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('sla.no_tracking')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  {[t('sla.col_case'), t('sla.col_profile'), t('sla.col_assigned'),
                    t('sla.col_first_response'), t('sla.col_resolved'), t('sla.col_breach')].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {tracking.map(row => {
                  const breached = row.first_response_breached || row.resolution_breached;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-gray-900 dark:text-white">{row.case?.title ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {row.profile ? (
                          <div className="flex items-center gap-1.5">
                            <PBadge level={row.profile.priority_level} color={row.profile.color} />
                            <span className="text-gray-700 dark:text-gray-300 text-xs">{row.profile.name}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{fmtDt(row.assigned_at)}</td>
                      <td className="px-3 py-2.5">
                        <SlaTimeCell
                          actual={row.first_response_at}
                          targetHrs={row.profile?.first_response_hours}
                          assignedAt={row.assigned_at}
                          breached={row.first_response_breached}
                          t={t}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <SlaTimeCell
                          actual={row.resolved_at}
                          targetHrs={row.profile?.resolution_hours}
                          assignedAt={row.assigned_at}
                          breached={row.resolution_breached}
                          t={t}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {breached ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">{t('sla.breached')}</Badge>
                        ) : row.resolved_at ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t('sla.on_time')}</Badge>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAdd && (
        <SlaProfileModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadProfiles(); }}
        />
      )}
      {editing && (
        <SlaProfileModal
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadProfiles(); }}
        />
      )}
    </div>
  );
}

// ─── SlaTimeCell ──────────────────────────────────────────────

function SlaTimeCell({ actual, targetHrs, assignedAt, breached, t }) {
  if (!actual) {
    return (
      <span className="text-gray-400 text-xs">
        {targetHrs != null ? `${t('sla.target')}: ${fmtHrs(targetHrs)}` : '—'}
      </span>
    );
  }
  const cls = breached
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400';
  return (
    <span className={`text-xs ${cls}`}>
      {fmtDt(actual)}
    </span>
  );
}

// ─── SlaProfileCard ───────────────────────────────────────────

function SlaProfileCard({ profile, auth, onEdit, onToggle, t }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3 transition-opacity ${!profile.is_active ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <PBadge level={profile.priority_level} color={profile.color} />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">{profile.name}</div>
            {!profile.is_active && (
              <span className="text-xs text-gray-400">Inactive</span>
            )}
          </div>
        </div>
        {/* Color swatch */}
        <span
          className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: profile.color ?? '#6366f1' }}
        />
      </div>

      {profile.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{profile.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-gray-500 dark:text-gray-400 mb-0.5">{t('sla.col_first_response')}</div>
          <div className="font-bold text-gray-900 dark:text-white">{fmtHrs(profile.first_response_hours)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-gray-500 dark:text-gray-400 mb-0.5">{t('sla.resolution_hrs')}</div>
          <div className="font-bold text-gray-900 dark:text-white">{fmtHrs(profile.resolution_hours)}</div>
        </div>
      </div>

      {auth.isAdmin && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onEdit}
            className="flex-1 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('action.edit')}
          </button>
          <button
            onClick={onToggle}
            className="flex-1 py-1 text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
            {profile.is_active ? t('sla.deactivate') : t('sla.activate')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SlaProfileModal ──────────────────────────────────────────

function SlaProfileModal({ profile, onClose, onSaved }) {
  const { t } = useT();
  const isEdit = !!profile;
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [form, setForm] = useState({
    name:                 profile?.name                 ?? '',
    priority_level:       profile?.priority_level       ?? 1,
    description:          profile?.description          ?? '',
    first_response_hours: profile?.first_response_hours ?? '',
    resolution_hours:     profile?.resolution_hours     ?? '',
    color:                profile?.color                ?? '#6366f1',
    is_active:            profile?.is_active            ?? true,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErrMsg(t('sla.name_required')); return; }
    setSaving(true);
    const payload = {
      name:                 form.name.trim(),
      priority_level:       parseInt(form.priority_level, 10),
      description:          form.description || null,
      first_response_hours: parseFloat(form.first_response_hours),
      resolution_hours:     parseFloat(form.resolution_hours),
      color:                form.color,
      is_active:            form.is_active,
    };
    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from('sla_profiles').update(payload).eq('id', profile.id));
    } else {
      ({ error: err } = await supabase.from('sla_profiles').insert(payload));
    }
    if (err) { setErrMsg(err.message); setSaving(false); return; }
    onSaved();
  }

  const pLevelOpts = [1,2,3,4].map(n => ({ value: n, label: `P${n}` }));

  return (
    <Modal open onClose={onClose} title={isEdit ? t('sla.edit_profile') : t('sla.new_profile')}>
      <form onSubmit={handleSubmit}>
        <Input label={t('sla.profile_name')} value={form.name} onChange={e => set('name', e.target.value)} required />
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Select
            label={t('sla.priority_level')}
            options={pLevelOpts}
            value={form.priority_level}
            onChange={e => set('priority_level', e.target.value)}
          />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('sla.color')}</label>
            <input
              type="color"
              value={form.color}
              onChange={e => set('color', e.target.value)}
              className="h-9 w-16 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
          </div>
          <Input
            label={t('sla.first_response_hrs')}
            type="number"
            min="0"
            step="0.5"
            value={form.first_response_hours}
            onChange={e => set('first_response_hours', e.target.value)}
            required
          />
          <Input
            label={t('sla.resolution_hrs')}
            type="number"
            min="0"
            step="0.5"
            value={form.resolution_hours}
            onChange={e => set('resolution_hours', e.target.value)}
            required
          />
        </div>
        <Textarea
          label={t('sla.profile_description')}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
        />
        {errMsg && <p className="text-red-600 text-xs mb-3">{errMsg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
            {t('action.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
