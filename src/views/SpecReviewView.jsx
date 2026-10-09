import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";

const STATUS_COLORS = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  review:      "bg-purple-100 text-purple-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-gray-100 text-gray-500",
};

export default function SpecReviewView({ auth, onNavigate }) {
  const { t } = useT();
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const uid = auth.user?.id;
      if (!uid) return;

      // Cases assigned to this area leader that are in review status or have pending specs
      const { data, error: fetchErr } = await supabase
        .from("cases")
        .select("id, title, area_sap, status, priority, updated_at, users!cases_client_id_fkey(full_name)")
        .eq("area_leader_id", uid)
        .in("status", ["review", "in_progress"])
        .order("updated_at", { ascending: false });

      if (fetchErr) throw fetchErr;
      setCases(data ?? []);
    } catch {
      setError(t("spec_review.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [auth.user?.id]);

  const reviewCases  = cases.filter(c => c.status === "review");
  const activeCases  = cases.filter(c => c.status === "in_progress");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("spec_review.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("spec_review.desc")}</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">{t("spec_review.loading")}</div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{error}</p>
          <button onClick={load}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={12} />{t("common.retry")}
          </button>
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center space-y-3">
          <CheckCircle2 size={32} className="mx-auto text-green-400" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">{t("spec_review.empty_title")}</p>
          <p className="text-gray-400 text-sm">{t("spec_review.empty_desc")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {reviewCases.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t("spec_review.section_review")} ({reviewCases.length})
                </h2>
              </div>
              <CaseTable cases={reviewCases} onNavigate={onNavigate} t={t} />
            </section>
          )}

          {activeCases.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t("spec_review.section_in_progress")} ({activeCases.length})
                </h2>
              </div>
              <CaseTable cases={activeCases} onNavigate={onNavigate} t={t} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CaseTable({ cases, onNavigate, t }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-semibold">{t("leader.col_title")}</th>
            <th className="text-left px-4 py-3 font-semibold">{t("leader.col_client")}</th>
            <th className="text-left px-4 py-3 font-semibold">{t("leader.col_area")}</th>
            <th className="text-left px-4 py-3 font-semibold">{t("leader.col_status")}</th>
            <th className="text-left px-4 py-3 font-semibold">{t("spec_review.col_updated")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
          {cases.map(c => (
            <tr key={c.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
              onClick={() => onNavigate?.({ view: "cases", caseId: c.id })}
            >
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.title}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.users?.full_name ?? "—"}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.area_sap ?? "—"}</td>
              <td className="px-4 py-3">
                {c.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {c.status.replace("_", " ")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1">
                <Clock size={11} />{new Date(c.updated_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
