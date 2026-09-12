import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useTimeEntries } from "../hooks/useCoreHooks.js";
import { fmtDate } from "../lib/uiUtils.jsx";
import { Spinner } from "./ProfileComponents.jsx";
import { logEvent } from "../lib/utils.js";

function TimeLogPanel({ caseId, caseTitle, auth }) {
  const { t } = useT();
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ log_date: new Date().toISOString().slice(0, 10), hours: 1, description: "" });
  const [saving, setSaving]     = useState(false);
  const [fetchError, setFetchError] = useState(null);

  async function fetchLogs() {
    setFetchError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('case_id', caseId)
        .order('log_date', { ascending: false });
      if (error) throw error;
      setLogs(data ?? []);
    } catch (e) { setFetchError(e?.message ?? 'Failed to load'); }
    setLoading(false);
  }

  useEffect(() => { if (caseId) fetchLogs(); }, [caseId]);

  async function handleAdd() {
    const hrs = parseFloat(form.hours);
    if (!hrs || hrs <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_logs').insert({
        case_id:     caseId,
        user_id:     auth.user.id,
        hours:       hrs,
        description: form.description.trim() || null,
        log_date:    form.log_date,
      });
      if (error) throw error;
      logEvent('time.logged', { entityType: 'case', entityId: caseId, metadata: { hours: hrs, description: form.description } });
      setForm({ log_date: new Date().toISOString().slice(0, 10), hours: 1, description: "" });
      setShowForm(false);
      await fetchLogs();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleDelete(log) {
    if (!window.confirm('Delete this time log entry?')) return;
    try {
      const { error } = await supabase.from('time_logs').delete().eq('id', log.id);
      if (error) throw error;
      await fetchLogs();
    } catch (e) { alert(e.message); }
  }

  const totalHours = logs.reduce((s, l) => s + parseFloat(l.hours ?? 0), 0);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {fetchError && <p className="text-sm text-red-500 p-3">{fetchError}</p>}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">
          {t("time.total_hours")}: <span className="text-blue-600 font-bold">{totalHours.toFixed(1)}h</span>
        </div>
        <button onClick={() => setShowForm(p => !p)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
          {t("time.add_entry")}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("time.date")}</label>
              <input type="date" value={form.log_date}
                onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("time.hours")}</label>
              <input type="number" min="0.5" max="24" step="0.5" value={form.hours}
                onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("time.description")}</label>
            <textarea rows={2} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What did you work on?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              {t("time.cancel")}
            </button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("time.saving") : t("time.log_time")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("time.date")}</th>
              <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("time.hours")}</th>
              <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("time.description")}</th>
              <th className="pb-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("time.logged_by")}</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-600 font-variant-numeric tabular-nums">{log.log_date}</td>
                <td className="py-2 pr-4 font-semibold text-blue-700 font-variant-numeric tabular-nums">{parseFloat(log.hours).toFixed(1)}h</td>
                <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">{log.description || "—"}</td>
                <td className="py-2 pr-4 text-gray-700">{log.users?.full_name ?? "—"}</td>
                <td className="py-2">
                  {(log.user_id === auth.user?.id || auth.isAdmin || auth.isManager) && (
                    <button onClick={() => handleDelete(log)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded border border-red-100 hover:bg-red-50">
                      {t("action.delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {logs.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("time.total_hours")}</td>
                <td className="pt-2 font-bold text-blue-700 font-variant-numeric tabular-nums">{totalHours.toFixed(1)}h</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
        {logs.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <div className="mb-2 flex justify-center"><Clock className="w-8 h-8 text-gray-300" /></div>
            <p className="text-sm">{t("time.no_entries")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export { TimeLogPanel };
