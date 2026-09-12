import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Check, RotateCcw, Star, Trophy, Wand2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { computeApplicantScore, useApplicantRanking } from "../hooks/useRankingHooks.js";
import { Badge, Spinner } from "./ProfileComponents.jsx";
import { APP_STATUS_COLORS } from "../lib/businessConstants.js";
import { STATUS_LABEL_KEYS, cap } from "../lib/uiUtils.jsx";
import { PersonAvatar } from "../views/Projects.jsx";

// CaseFeedbackModal, RANKING_CRITERIA, ApplicantRankingSection

function CaseFeedbackModal({ caseData, onClose }) {
  const { t } = useT();
  const consultants = caseData.case_assignments ?? [];
  const [ratings, setRatings] = useState(
    Object.fromEntries(consultants.map(a => [a.consultant_id, { score: 0, comment: "" }]))
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const a of consultants) {
        const r = ratings[a.consultant_id];
        if (r?.score > 0) {
          await supabase.from("case_ratings").upsert({
            case_id:    caseData.id,
            rater_id:   user.id,
            ratee_id:   a.consultant_id,
            rater_role: "client",
            ratee_role: "consultant",
            scores:     { overall: r.score },
            comment:    r.comment || null,
          }, { onConflict: "case_id,ratee_id" });
        }
      }
      onClose();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (!consultants.length) return null;
  const hasAnyRating = Object.values(ratings).some(r => r.score > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="font-bold text-lg text-gray-900">{t("feedback.title")}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{t("feedback.subtitle").replace("{title}", caseData.title)}</p>
        </div>
        {consultants.map(a => {
          const r = ratings[a.consultant_id] ?? { score: 0, comment: "" };
          const name = a.users?.full_name ?? t("fallback.consultant");
          return (
            <div key={a.consultant_id} className="border border-gray-100 rounded-xl p-4 space-y-2">
              <div className="font-medium text-sm text-gray-900">{name}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRatings(p => ({ ...p, [a.consultant_id]: { ...p[a.consultant_id], score: n } }))}
                    className={`text-2xl transition-transform hover:scale-110 ${n <= r.score ? "text-yellow-400" : "text-gray-200"}`}><Star size={18} fill={n <= r.score ? "currentColor" : "none"} /></button>
                ))}
              </div>
              {r.score > 0 && (
                <textarea value={r.comment}
                  onChange={e => setRatings(p => ({ ...p, [a.consultant_id]: { ...p[a.consultant_id], comment: e.target.value } }))}
                  placeholder={t("feedback.comment_ph")} rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>
          );
        })}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">{t("feedback.skip")}</button>
          <button onClick={handleSubmit} disabled={saving || !hasAnyRating}
            className="flex-1 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("state.saving") : t("feedback.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

const RANKING_CRITERIA = ["skills", "rating", "clientFamiliarity", "clientRating", "experience", "rate", "commitment"];

function ApplicantRankingSection({ caseData, auth, applications, reviewApplication }) {
  const { t } = useT();
  const { ranking, loading, clientSettings } = useApplicantRanking(caseData, applications);
  const overcommitTolerance = clientSettings?.max_overcommitment_tolerance ?? 0;
  const [liveAvailability, setLiveAvailability] = useState({});
  const [recalculating, setRecalculating]       = useState(false);
  const [lastRecalculated, setLastRecalculated] = useState(null);

  const TERMINAL_S = ["completed", "cancelled", "terminated", "closed", "approved"];

  const recalculate = useCallback(async () => {
    if (!applications.length) return;
    setRecalculating(true);
    const ids = [...new Set(applications.map(a => a.consultant_id))];
    const [{ data: profiles }, { data: assignments }] = await Promise.all([
      supabase.from("consultant_profiles")
        .select("id, external_occupancy_pct")
        .in("id", ids),
      supabase.from("case_assignments")
        .select("consultant_id, time_commitment, case:case_id(status)")
        .in("consultant_id", ids)
        .neq("case_id", caseData.id),
    ]);
    const extMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.external_occupancy_pct ?? 0]));
    const liveMap = {};
    for (const id of ids) {
      const active = (assignments ?? [])
        .filter(a => a.consultant_id === id && !TERMINAL_S.includes(a.case?.status))
        .reduce((sum, a) => sum + (a.time_commitment ?? 0), 0);
      liveMap[id] = Math.max(0, 100 - (extMap[id] ?? 0) - active);
    }
    setLiveAvailability(liveMap);
    setLastRecalculated(new Date());
    setRecalculating(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData.id, applications.length]);

  useEffect(() => { recalculate(); }, [recalculate]);

  // Re-score ranking using live availability if available
  const hasLive = Object.keys(liveAvailability).length > 0;
  const displayRanking = hasLive
    ? ranking.map(app => {
        const live = liveAvailability[app.consultant_id] ?? (app.max_available_at_submission ?? 100);
        const ratio = live > 0 ? (app.time_commitment ?? 0) / live : 0;
        const commitPts = !app.time_commitment ? 0
          : ratio >= 0.8 ? 5 : ratio >= 0.6 ? 4 : ratio >= 0.4 ? 3 : ratio >= 0.2 ? 2 : 1;
        const oldCommit = app.breakdown.commitment.pts;
        return {
          ...app,
          liveAvailability: live,
          overcommitted: (app.time_commitment ?? 0) > live + overcommitTolerance,
          totalScore: app.totalScore - oldCommit + commitPts,
          breakdown: {
            ...app.breakdown,
            commitment: {
              ...app.breakdown.commitment,
              pts: commitPts,
              detail: `${app.time_commitment ?? 0}% of ${live}% now (${Math.round(ratio * 100)}%)`,
            },
          },
        };
      }).sort((a, b) => b.totalScore - a.totalScore)
    : ranking;

  const [autoAssigning, setAutoAssigning] = useState(false);

  async function runAutoAssign() {
    const candidate = displayRanking.find(a => !a.overcommitted && a.status === "pending");
    if (!candidate) return;
    setAutoAssigning(true);
    try { await reviewApplication(candidate.id, "accepted", "Auto-assigned by system"); }
    catch (e) { alert(e.message); }
    setAutoAssigning(false);
  }

  const windowDays = clientSettings?.application_window_days ?? 7;
  const windowClosed = caseData.created_at
    ? (Date.now() - new Date(caseData.created_at).getTime()) / 86400000 >= windowDays
    : false;
  const minApplicants = clientSettings?.min_applicants ?? 1;
  const pendingCount = applications.filter(a => a.status === "pending").length;
  const canAutoAssign = clientSettings?.auto_assign_enabled
    && (auth.isAdmin || auth.isManager)
    && windowClosed
    && pendingCount >= minApplicants;
  const autoAssignBlocked = clientSettings?.auto_assign_enabled
    && (auth.isAdmin || auth.isManager)
    && (!windowClosed || pendingCount < minApplicants);

  if (!applications.length) return <p className="text-sm text-gray-400 py-4">{t("rank.no_apps")}</p>;
  if (loading) return <Spinner />;
  const best = displayRanking[0];

  const fmtTime = d => {
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.round(diff / 60)}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Recommended consultant */}
      {best && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("rank.recommended")}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {lastRecalculated && (
                <span className="text-[10px] text-gray-400">{fmtTime(lastRecalculated)}</span>
              )}
              <button onClick={recalculate} disabled={recalculating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors shadow-sm">
                <RotateCcw className={`w-3 h-3 ${recalculating ? "animate-spin" : ""}`} />
                {recalculating ? t("rank.recalculating") : t("rank.recalculate")}
              </button>
              {canAutoAssign && (
                <button onClick={runAutoAssign} disabled={autoAssigning}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-50 transition-colors shadow-sm">
                  <Wand2 className="w-3 h-3" />
                  {autoAssigning ? t("rank.assigning") : t("rank.auto_assign")}
                </button>
              )}
              {autoAssignBlocked && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  {!windowClosed
                    ? t("assign.window_closes").replace("{n}", Math.max(0, Math.ceil(windowDays - (Date.now() - new Date(caseData.created_at).getTime()) / 86400000)))
                    : (() => { const need = minApplicants - pendingCount; return t(need === 1 ? "assign.need_more_one" : "assign.need_more_many").replace("{n}", need); })()}
                </span>
              )}
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5">
            <div className="flex items-center gap-4 mb-4">
              <PersonAvatar name={best.consultant?.full_name} avatarUrl={best.consultant?.avatar_url} size={48} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900">{best.consultant?.full_name}</div>
                <div className="text-xs text-gray-500">
                  {(Array.isArray(best.consultant?.consultant_profiles)
                    ? best.consultant.consultant_profiles[0]
                    : best.consultant?.consultant_profiles)?.headline ?? ""}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-black text-blue-700">{best.totalScore}</div>
                <div className="text-xs text-gray-400">{t("rank.pts")}</div>
              </div>
            </div>
            {/* Live availability row for best */}
            {hasLive && (
              <div className={`flex items-center gap-3 mb-4 px-3 py-2 rounded-xl text-xs font-medium ${
                best.overcommitted
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-white/70 text-gray-600"
              }`}>
                {best.overcommitted
                  ? <><AlertTriangle size={13} className="inline mr-1 flex-shrink-0" /><span>{t("assign.avail_conflict").replace("{pct}", best.time_commitment).replace("{free}", best.liveAvailability)}</span></>
                  : <><Check size={13} className="inline mr-1 flex-shrink-0" /><span>{t("assign.avail_current").replace("{free}", best.liveAvailability).replace("{pct}", best.time_commitment)}</span></>
                }
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {RANKING_CRITERIA.map(key => {
                const c = best.breakdown[key];
                const pct = Math.round((c.pts / c.max) * 100);
                return (
                  <div key={key} className="bg-white/80 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{t(c.labelKey)}</span>
                      <span className="text-xs font-bold text-blue-700 ml-1 flex-shrink-0">{c.pts}/{c.max}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full mb-1">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#22c55e" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444" }} />
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">{c.detailKey ? t(c.detailKey) : c.detail}</div>
                  </div>
                );
              })}
            </div>
            {(auth.isAdmin || auth.isManager) && best.status === "pending" && (
              <button onClick={() => reviewApplication(best.id, "accepted")}
                className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                {t("rank.accept_top")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* All applicants ranked */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("rank.all_ranked")}</p>
        <div className="space-y-3">
          {displayRanking.map((app, i) => {
            const profile = Array.isArray(app.consultant?.consultant_profiles)
              ? app.consultant.consultant_profiles[0]
              : app.consultant?.consultant_profiles;
            const medal = i === 0 ? <Trophy size={14} className="text-yellow-500" /> : i === 1 ? <span className="text-[11px] font-bold text-slate-400">2</span> : i === 2 ? <span className="text-[11px] font-bold text-amber-600">3</span> : `#${i + 1}`;
            const conflict = hasLive && app.overcommitted;
            return (
              <div key={app.id} className={`border rounded-xl p-4 ${
                conflict ? "border-red-200 bg-red-50/30"
                : i === 0 ? "border-blue-200 bg-blue-50/30"
                : "border-gray-100 bg-white"
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm flex-shrink-0">{medal}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{app.consultant?.full_name}</span>
                      {conflict && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded"><AlertTriangle size={9} className="inline mr-0.5" />{t("rank.overcommitted")}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{profile?.headline ?? (profile?.years_experience ? `${profile.years_experience}y exp` : "")}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-gray-900 text-lg">{app.totalScore}<span className="text-xs font-normal text-gray-400">/100</span></div>
                    <Badge className={APP_STATUS_COLORS[app.status]}>{STATUS_LABEL_KEYS[app.status] ? t(STATUS_LABEL_KEYS[app.status]) : cap(app.status)}</Badge>
                  </div>
                </div>
                {/* Live availability bar */}
                {hasLive && (
                  <div className="flex items-center gap-2 mb-3 text-xs">
                    <span className="text-gray-400 flex-shrink-0">{t("rank.avail_now")}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${app.liveAvailability}%`, backgroundColor: app.liveAvailability === 0 ? "#ef4444" : app.liveAvailability < (app.time_commitment ?? 0) ? "#f59e0b" : "#22c55e" }} />
                    </div>
                    <span className={`font-semibold flex-shrink-0 ${conflict ? "text-red-600" : "text-gray-700"}`}>{app.liveAvailability}%</span>
                    <span className="text-gray-400 flex-shrink-0">· committed {app.time_commitment ?? 0}%</span>
                  </div>
                )}
                {/* Score bars */}
                <div className="flex gap-1 mb-3" title={t("rank.score_tooltip")}>
                  {RANKING_CRITERIA.map(key => {
                    const c = app.breakdown[key];
                    const pct = Math.round((c.pts / c.max) * 100);
                    const clabel = t(c.labelKey);
                    const cdetail = c.detailKey ? t(c.detailKey) : c.detail;
                    return (
                      <div key={key} className="flex-1" title={`${clabel}: ${c.pts}/${c.max} — ${cdetail}`}>
                        <div className="h-8 bg-gray-100 rounded relative overflow-hidden">
                          <div className="absolute bottom-0 w-full rounded transition-all"
                            style={{ height: `${pct}%`, backgroundColor: pct >= 80 ? "#22c55e" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <div className="text-[8px] text-gray-400 text-center mt-0.5 truncate">{clabel.split(" ")[0]}</div>
                      </div>
                    );
                  })}
                </div>
                {app.cover_letter && <p className="text-xs text-gray-500 mb-2 line-clamp-1 italic">"{app.cover_letter}"</p>}
                {(auth.isAdmin || auth.isManager) && app.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => reviewApplication(app.id, "accepted")} className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">{t("action.accept")}</button>
                    <button onClick={() => reviewApplication(app.id, "rejected")} className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200">{t("action.reject")}</button>
                    <button onClick={() => reviewApplication(app.id, "under_review")} className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200">{t("action.review")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { CaseFeedbackModal, RANKING_CRITERIA, ApplicantRankingSection };
