import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";

const PRIORITY_COLORS = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-yellow-100 text-yellow-700",
  low:      "bg-green-100 text-green-700",
};

function AssignModal({ caseRow, onClose, onAssigned }) {
  const { t } = useT();
  const [leaders, setLeaders]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const { data: areaRows, error: areaErr } = await supabase
          .from("area_leader_areas")
          .select("user_id, users(id, full_name)")
          .eq("area_sap", caseRow.area_sap);

        if (areaErr) throw areaErr;
        if (!areaRows?.length) { setLoading(false); return; }

        const leaderIds = areaRows.map(r => r.user_id);
        const { data: loadRows, error: loadErr } = await supabase
          .from("cases")
          .select("area_leader_id")
          .in("area_leader_id", leaderIds)
          .not("status", "in", '("completed","cancelled")');

        if (loadErr) throw loadErr;

        const loadMap = {};
        (loadRows ?? []).forEach(r => {
          loadMap[r.area_leader_id] = (loadMap[r.area_leader_id] ?? 0) + 1;
        });

        setLeaders(
          areaRows.map(r => ({
            id:        r.users.id,
            full_name: r.users.full_name,
            load:      loadMap[r.users.id] ?? 0,
          })).sort((a, b) => a.load - b.load)
        );
      } catch {
        setError(t("dispatch.error"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [caseRow.area_sap]);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    const { error: saveErr } = await supabase
      .from("cases")
      .update({ area_leader_id: selected })
      .eq("id", caseRow.id);
    setSaving(false);
    if (saveErr) { setSaveError(saveErr.message); }
    else onAssigned();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{t("dispatch.assign_modal_title")}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t("dispatch.assign_modal_case")} <span className="font-medium text-gray-700 dark:text-gray-300">{caseRow.title}</span>
          {caseRow.area_sap && <> · <span className="text-blue-600">{caseRow.area_sap}</span></>}
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">{t("dispatch.assign_loading")}</p>
        ) : error ? (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} />{error}
          </div>
        ) : leaders.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">{t("dispatch.assign_none")}</p>
        ) : (
          <div className="space-y-2 mb-6">
            {leaders.map(l => (
              <label key={l.id}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected === l.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input type="radio" name="leader" value={l.id}
                    checked={selected === l.id}
                    onChange={() => setSelected(l.id)}
                    className="accent-blue-600" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{l.full_name}</span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{l.load} {t("dispatch.active_cases", { count: l.load })}</span>
              </label>
            ))}
          </div>
        )}

        {saveError && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} />{saveError}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            {t("dispatch.assign_cancel")}
          </button>
          <button onClick={handleConfirm} disabled={!selected || saving}
            className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("dispatch.assign_confirming") : t("dispatch.assign_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchView({ auth }) {
  const { t } = useT();
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [modalCase, setModalCase] = useState(null);

  async function fetchCases() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from("cases")
        .select("id, title, area_sap, created_at, priority, status, users!cases_client_id_fkey(full_name)")
        .is("area_leader_id", null)
        .not("status", "in", '("completed","cancelled")')
        .order("created_at", { ascending: false });
      if (fetchErr) throw fetchErr;
      setCases(data ?? []);
    } catch {
      setError(t("dispatch.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCases(); }, []);

  function handleAssigned() {
    setModalCase(null);
    fetchCases();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("dispatch.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("dispatch.desc")}</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">{t("dispatch.loading")}</div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{error}</p>
          <button onClick={fetchCases}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={12} />{t("common.retry")}
          </button>
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-400 text-sm">{t("dispatch.empty")}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">{t("dispatch.col_title")}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("dispatch.col_client")}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("dispatch.col_area")}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("dispatch.col_created")}</th>
                <th className="text-left px-4 py-3 font-semibold">{t("dispatch.col_priority")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.users?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.area_sap ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {c.priority && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setModalCase(c)}
                      className="px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      {t("dispatch.assign_btn")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCase && (
        <AssignModal
          caseRow={modalCase}
          onClose={() => setModalCase(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
