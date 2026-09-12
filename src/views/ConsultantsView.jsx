import { useState } from "react";
import {
  Activity, AlertTriangle, BadgeCheck, Bookmark, BookmarkCheck, Check,
  CheckCircle2, Crosshair, Plane, Sparkles, Star, User, UserCheck, Wand2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { logEvent } from "../lib/utils.js";
import { Badge, Spinner, TrustBadge } from "../components/ProfileComponents.jsx";
import { ConsultantProfileView } from "../components/ConsultantProfileView.jsx";
import { EmptyState, Input, Modal, Textarea } from "../components/ui.jsx";
import { fmtDate, fmt, cap, AVAIL_LABEL_KEYS, EXPERTISE_LABEL_KEYS, WORK_MODE_LABEL_KEYS } from "../lib/uiUtils.jsx";
import { DEFAULT_ACTIVITY_PHASES, INDUSTRY_AREAS, ROLE_COLORS, SAP_AREAS } from "../lib/businessConstants.js";
import { stars } from "../components/FeedComponents.jsx";
import { InviteConsultantDrawer } from "../components/InviteConsultantDrawer.jsx";
import { InvoiceModal } from "../components/InvoiceModal.jsx";
import { useCases, useRatings } from "../hooks/useCaseHooks.js";
import { useLeaderboard } from "../hooks/useNotificationHooks.js";
import { useConsultantProfile } from "../hooks/useProfileHooks.js";
import { ConsultantProfilePanel, useConsultantShortlist } from "./ArenaView.jsx";
import { PersonAvatar } from "./Projects.jsx";

function ConsultantsView({ auth }) {
  const { t } = useT();
  const [search, setSearch]           = useState("");
  const [profileView, setProfileView] = useState(null);
  const [matchCaseId, setMatchCaseId] = useState('');
  const [showShortlist, setShowShortlist] = useState(false);
  const { leaderboard, loading }      = useLeaderboard();
  const { cases: allCases }           = useCases({});
  const { shortlist, toggle: toggleShortlist, isShortlisted } = useConsultantShortlist();

  const openCases = allCases.filter(c => c.status === 'estimated' || c.status === 'open');
  const matchCase = openCases.find(c => c.id === matchCaseId) ?? null;

  function matchScore(c) {
    if (!matchCase) return null;
    const caseSkills = matchCase.skills_required ?? [];
    const consultSkills = c.skills ?? [];
    const skillScore = caseSkills.length
      ? Math.min(consultSkills.filter(s => caseSkills.includes(s)).length / caseSkills.length, 1) * 50
      : 25;
    const minExp = matchCase.min_years_experience ?? 0;
    const expScore = minExp
      ? Math.min((c.years_experience ?? 0) / minExp, 1) * 35
      : 35;
    const ratingScore = c.avgRating ? (c.avgRating / 5) * 15 : 7.5;
    return Math.round(skillScore + expScore + ratingScore);
  }

  let filtered = leaderboard.filter(c =>
    !search || c.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.skills?.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );
  if (showShortlist) filtered = filtered.filter(c => isShortlisted(c.id));
  if (matchCase) filtered = [...filtered].sort((a, b) => (matchScore(b) ?? 0) - (matchScore(a) ?? 0));

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("nav.consultants")}</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} consultant{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowShortlist(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-xl border transition-colors ${
            showShortlist
              ? "bg-amber-500 text-white border-amber-500"
              : "border-gray-300 text-gray-600 hover:border-amber-400 hover:text-amber-500"
          }`}>
          {showShortlist ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          Shortlist {showShortlist && shortlist.size > 0 ? `(${shortlist.size})` : ''}
        </button>
      </div>

      {/* Toolbar: search + match case */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("consultant.search_ph")}
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {openCases.length > 0 && (
          <div className="relative">
            <Crosshair size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select value={matchCaseId} onChange={e => setMatchCaseId(e.target.value)}
              className="pl-8 pr-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[190px]">
              <option value="">Match score: select case…</option>
              {openCases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => {
          const winRate = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
          const score   = matchScore(c);
          const pinned  = isShortlisted(c.id);
          return (
            <div key={c.id} onClick={() => setProfileView(c.id)}
              className={`bg-white rounded-2xl border shadow-sm p-5 cursor-pointer hover:shadow-md transition-all ${
                pinned ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-100 hover:border-blue-200"
              }`}>
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={48} className="rounded-2xl" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{c.user?.full_name}</div>
                  <div className="text-xs text-gray-500 truncate">{c.headline ?? `${c.years_experience ?? 0}y exp`}</div>
                  {c.avgRating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>
                      <span className="text-xs text-gray-500 font-semibold">{c.avgRating}</span>
                      <span className="text-xs text-gray-400">({c.ratingCount})</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); toggleShortlist(c.id); }}
                    className={`transition-colors ${pinned ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}>
                    {pinned ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  </button>
                  {score != null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                      score >= 80 ? "bg-green-100 text-green-700"
                      : score >= 55 ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-500"
                    }`}>{score}% match</span>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1 mb-3">
                {c.expertise_level && (
                  <Badge className="bg-violet-100 text-violet-700">{EXPERTISE_LABEL_KEYS[c.expertise_level] ? t(EXPERTISE_LABEL_KEYS[c.expertise_level]) : cap(c.expertise_level)}</Badge>
                )}
                {c.availability_type && (
                  <Badge className="bg-teal-100 text-teal-700">{AVAIL_LABEL_KEYS[c.availability_type] ? t(AVAIL_LABEL_KEYS[c.availability_type]) : cap(fmt(c.availability_type))}</Badge>
                )}
                {c.hourly_rate != null && (
                  <Badge className="bg-green-100 text-green-700">${c.hourly_rate}/h</Badge>
                )}
              </div>

              {/* Win rate bar */}
              {c.totalApps > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="text-gray-400">Win rate</span>
                    <span className="font-semibold text-gray-700">{winRate}% · {c.acceptedCases} won</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${winRate}%` }} />
                  </div>
                </div>
              )}

              {/* Skills */}
              {c.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.skills.slice(0, 4).map(s => {
                    const matched = matchCase?.skills_required?.includes(s);
                    return (
                      <span key={s} className={`px-2 py-0.5 rounded text-xs ${matched ? "bg-green-100 text-green-700 font-semibold" : "bg-blue-50 text-blue-600"}`}>{s}</span>
                    );
                  })}
                  {c.skills.length > 4 && (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-xs">+{c.skills.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState Icon={UserCheck} title={showShortlist ? "No shortlisted consultants" : t("consultant.none_found")}
              subtitle={showShortlist ? "Bookmark consultants to build your shortlist" : t("consultant.try_search")} />
          </div>
        )}
      </div>

      {/* Consultant profile drawer */}
      {profileView && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setProfileView(null)} />
          <ConsultantProfilePanel
            consultantId={profileView}
            onClose={() => setProfileView(null)}
            auth={auth}
            isShortlisted={isShortlisted(profileView)}
            onToggleShortlist={() => toggleShortlist(profileView)}
            openCases={openCases}
          />
        </div>
      )}
    </div>
  );
}

function ConsultantDetailModal({ consultantId, auth }) {
  const { t } = useT();
  const { profile, availability, loading } = useConsultantProfile(consultantId);
  const { ratings, avgRating }             = useRatings(consultantId);
  const [ratingForm, setRatingForm]        = useState({ score: 5, comment: "" });
  const [ratingModal, setRatingModal]      = useState(false);
  const { submitRating }                   = useRatings(consultantId);

  if (loading) return <Spinner />;

  async function handleRate() {
    try {
      await submitRating({ score: ratingForm.score, comment: ratingForm.comment });
      setRatingModal(false);
    } catch(e) { alert(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
          {profile?.user?.full_name?.[0]}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{profile?.user?.full_name}</h2>
          <p className="text-gray-500 text-sm">{profile?.headline}</p>
          {avgRating && (
            <div className="flex items-center gap-1 mt-1">{stars(avgRating)}
              <span className="text-sm text-gray-600 ml-1">{avgRating} ({ratings.length})</span>
            </div>
          )}
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setRatingModal(true)}
            className="ml-auto px-4 py-2 text-sm bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl hover:bg-yellow-100">
            <Star size={13} className="mr-1 inline" />{t("action.rate")}
          </button>
        )}
      </div>

      {profile?.bio && <p className="text-sm text-gray-600">{profile.bio}</p>}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {profile?.hourly_rate && <div><span className="text-gray-400">{t("label.rate")} </span><strong>${profile.hourly_rate}/hr</strong></div>}
        {profile?.years_experience && <div><span className="text-gray-400">{t("label.experience")} </span><strong>{profile.years_experience}y</strong></div>}
        <div><span className="text-gray-400">{t("label.avail")} </span><strong className={availability > 30 ? "text-green-600" : "text-orange-500"}>{availability}{t("profile.free_pct")}</strong></div>
        {profile?.travel_available && <div className="flex items-center gap-1"><Plane className="w-3 h-3 inline-block mr-0.5" /> {t("label.travel")}</div>}
        {profile?.expertise_level && (
          <div><span className="text-gray-400">{t("label.level")} </span>
            <Badge className="bg-violet-100 text-violet-700 ml-1">{EXPERTISE_LABEL_KEYS[profile.expertise_level] ? t(EXPERTISE_LABEL_KEYS[profile.expertise_level]) : cap(profile.expertise_level)}</Badge>
          </div>
        )}
        {profile?.availability_type && (
          <div><span className="text-gray-400">{t("label.type")}: </span>
            <Badge className="bg-teal-100 text-teal-700 ml-1">{AVAIL_LABEL_KEYS[profile.availability_type] ? t(AVAIL_LABEL_KEYS[profile.availability_type]) : cap(fmt(profile.availability_type))}</Badge>
          </div>
        )}
      </div>

      {profile?.skills?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.skills.map(s => (
            <span key={s} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">{s}</span>
          ))}
        </div>
      )}

      {ratingModal && (
        <div className="border border-yellow-200 rounded-xl p-4 bg-yellow-50">
          <h4 className="font-semibold text-gray-900 mb-3">{t("action.submit_rating")}</h4>
          <div className="flex gap-2 mb-3">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRatingForm(p => ({ ...p, score: n }))}
                className={`text-2xl ${n <= ratingForm.score ? "text-yellow-400" : "text-gray-300"}`}><Star size={22} fill={n <= ratingForm.score ? "currentColor" : "none"} /></button>
            ))}
          </div>
          <Textarea label={t("label.comment")} value={ratingForm.comment}
            onChange={e => setRatingForm(p => ({ ...p, comment: e.target.value }))}
            placeholder={t("feedback.ph_comment")} />
          <div className="flex gap-2">
            <button onClick={handleRate}
              className="px-4 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-xl hover:bg-yellow-600">
              {t("action.submit_rating")}
            </button>
            <button onClick={() => setRatingModal(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">{t("action.cancel")}</button>
          </div>
        </div>
      )}

      {/* Cancellation reason modal */}

    {/* ── Approval Gate Modal ── */}
    {approvalModal && (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !generatingClosure && setApprovalModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-start gap-3 p-6 border-b border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <BadgeCheck size={20} className="text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-base">{t("case.approve_modal_title")}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("case.approve_modal_body")}
              </p>
            </div>
            {!generatingClosure && (
              <button onClick={() => setApprovalModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            )}
          </div>

          {/* Completion check */}
          <div className="p-6 space-y-4">
            {(() => {
              const incomplete = activities.filter(a => actEffectivePct(a) < 100);
              const allDone = incomplete.length === 0;
              const canBypass = auth.isAdmin || auth.isManager;
              return (
                <>
                  {allDone ? (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">{t("cd.approve_all_done").replace("{n}", activities.length)}</p>
                        <p className="text-xs text-emerald-600">{t("cd.approve_ready")}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">{incomplete.length} activit{incomplete.length !== 1 ? 'ies' : 'y'} not at 100%</p>
                          <p className="text-xs text-amber-600">
                            {canBypass ? t("cd.approve_bypass_can") : t("cd.approve_must_complete")}
                          </p>
                        </div>
                      </div>
                      {/* List of incomplete activities */}
                      <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-gray-100 p-3">
                        {incomplete.slice(0, 12).map(a => {
                          const phaseDef = DEFAULT_ACTIVITY_PHASES.find(p => p.key === a.phase);
                          return (
                            <div key={a.id} className="flex items-center gap-2 text-xs">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: phaseDef?.color ?? '#9ca3af' }} />
                              <span className="text-gray-500 flex-shrink-0 font-medium">{phaseDef ? (phaseDef.labelKey ? t(phaseDef.labelKey) : phaseDef.label) : t("phase.unassigned")}</span>
                              <span className="text-gray-700 truncate">{a.title}</span>
                              <span className="ml-auto font-semibold text-amber-600 flex-shrink-0">{actEffectivePct(a)}%</span>
                            </div>
                          );
                        })}
                        {incomplete.length > 12 && <p className="text-xs text-gray-400 text-center">{t("label.and_more").replace("{n}", incomplete.length - 12)}</p>}
                      </div>
                      {/* Bypass — managers/admins only */}
                      {canBypass && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
                            {t("case.bypass_reason")}
                          </label>
                          <textarea value={approvalBypass} onChange={e => setApprovalBypass(e.target.value)}
                            rows={2} placeholder={t("case.bypass_ph")}
                            className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-none" />
                        </div>
                      )}
                      {!canBypass && (
                        <p className="text-xs text-gray-500 text-center">{t("cd.approve_contact_mgr")}</p>
                      )}
                    </div>
                  )}

                  {/* Report sections preview */}
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("case.closure_includes")}</p>
                    {['1. Initial Request','2. Functional Specification','3. Development Scope',
                      '4. Quality Assurance — Test Results','5. Adjustments Made',
                      '6. Final Delivered Scope','7. User Manual (AI-generated)'].map(s => (
                      <div key={s} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between gap-3 border-t border-gray-100 pt-4">
                    <button onClick={() => setApprovalModal(false)} disabled={generatingClosure}
                      className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40">
                      {t("action.cancel")}
                    </button>
                    <button
                      onClick={() => {
                        const bypass = !allDone;
                        if (bypass && !approvalBypass.trim()) return;
                        generateClosureReport(bypass, approvalBypass.trim());
                      }}
                      disabled={generatingClosure || (!allDone && !(auth.isAdmin || auth.isManager)) || (!allDone && (auth.isAdmin || auth.isManager) && !approvalBypass.trim())}
                      className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-40 transition-colors">
                      {generatingClosure
                        ? <><Spinner size={13} /> {t("case.generating_report")}</>
                        : <><BadgeCheck size={14} /> {t("case.approve_report")}</>}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    )}

    {/* ── Adjustment Plan Preview Modal ── */}
    {adjustmentPreview && (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !confirmingAdjustment && setAdjustmentPreview(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-start gap-3 p-6 border-b border-gray-100 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Wand2 size={18} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-base">{adjustmentPreview.adjLabel} {t("cd.plan_review_suffix")}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("cd.adj_plan_hint")}
              </p>
            </div>
            {!confirmingAdjustment && (
              <button onClick={() => setAdjustmentPreview(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {adjustmentPreview.activities.map((act, i) => (
              <label key={i}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors select-none ${
                  act._selected ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50 opacity-60"
                }`}>
                <input type="checkbox" checked={act._selected}
                  onChange={() => setAdjustmentPreview(prev => ({
                    ...prev,
                    activities: prev.activities.map((a, j) => j === i ? { ...a, _selected: !a._selected } : a),
                  }))}
                  className="mt-0.5 accent-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded">#{i + 1}</span>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{act.title}</p>
                  </div>
                  {act.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{act.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-gray-400 font-medium">{act.est_hours}h estimated</span>
                    {i > 0 && <span className="text-[10px] text-amber-400">→ depends on #{i}</span>}
                  </div>
                </div>
                <input type="number" min="0.5" max="40" step="0.5"
                  value={act.est_hours}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setAdjustmentPreview(prev => ({
                    ...prev,
                    activities: prev.activities.map((a, j) => j === i ? { ...a, est_hours: Number(e.target.value) || 1 } : a),
                  }))}
                  className="w-16 text-xs text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-200 flex-shrink-0" />
              </label>
            ))}
            <p className="text-xs text-gray-400 text-center pt-2">
              {t("cd.acts_n_of_m_seq").replace("{n}", adjustmentPreview.activities.filter(a => a._selected).length).replace("{total}", adjustmentPreview.activities.length)}
            </p>
          </div>
          <div className="flex justify-between items-center gap-3 border-t border-gray-100 p-5 flex-shrink-0">
            <button onClick={() => setAdjustmentPreview(null)} disabled={confirmingAdjustment}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40">
              {t("cd.discard_activities")}
            </button>
            <button onClick={confirmAdjustmentActivities}
              disabled={confirmingAdjustment || adjustmentPreview.activities.filter(a => a._selected).length === 0}
              className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-40 transition-colors">
              {confirmingAdjustment
                ? <><Spinner size={13} /> {t("cd.adding_acts_short")}</>
                : <>{(() => { const n = adjustmentPreview.activities.filter(a => a._selected).length; return t(n === 1 ? "cd.add_act_to_case" : "cd.add_acts_to_case").replace("{n}", n); })()}</>}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Dev Plan Preview Modal (Phase Bands) ── */}

    {testPlanPreview && (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !confirmingTestPlan && setTestPlanPreview(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start gap-3 p-6 border-b border-gray-100 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-base">{testPlanPreview.targetLabel} {t("cd.plan_review_suffix")}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("cd.test_plan_hint")}
              </p>
            </div>
            {!confirmingTestPlan && (
              <button onClick={() => setTestPlanPreview(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={18} />
              </button>
            )}
          </div>

          {/* Activity list */}
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {testPlanPreview.activities.map((act, i) => (
              <label key={i}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors select-none ${
                  act._selected ? "border-violet-200 bg-violet-50" : "border-gray-100 bg-gray-50 opacity-60"
                }`}>
                <input type="checkbox" checked={act._selected}
                  onChange={() => setTestPlanPreview(prev => ({
                    ...prev,
                    activities: prev.activities.map((a, j) => j === i ? { ...a, _selected: !a._selected } : a),
                  }))}
                  className="mt-0.5 accent-violet-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded">#{i + 1}</span>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{act.title}</p>
                  </div>
                  {act.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{act.description}</p>}
                  {act.acceptance_criteria && (
                    <p className="text-xs text-emerald-700 mt-1 font-medium"><Check size={10} className="mr-1 inline text-emerald-600" />{act.acceptance_criteria}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-gray-400 font-medium">{act.est_hours}h estimated</span>
                    {i > 0 && <span className="text-[10px] text-violet-400">→ depends on #{i}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <input type="number" min="0.5" max="40" step="0.5"
                    value={act.est_hours}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setTestPlanPreview(prev => ({
                      ...prev,
                      activities: prev.activities.map((a, j) => j === i ? { ...a, est_hours: Number(e.target.value) || 1 } : a),
                    }))}
                    className="w-16 text-xs text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-200" />
                </div>
              </label>
            ))}
            <p className="text-xs text-gray-400 text-center pt-2">
              {t("cd.acts_n_of_m_seq_auto").replace("{n}", testPlanPreview.activities.filter(a => a._selected).length).replace("{total}", testPlanPreview.activities.length)}
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-3 border-t border-gray-100 p-5 flex-shrink-0">
            <button onClick={() => setTestPlanPreview(null)} disabled={confirmingTestPlan}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40">
              {t("cd.discard_activities")}
            </button>
            <button onClick={confirmTestPlanActivities}
              disabled={confirmingTestPlan || testPlanPreview.activities.filter(a => a._selected).length === 0}
              className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl disabled:opacity-40 transition-colors">
              {confirmingTestPlan
                ? <><Spinner size={13} /> {t("cd.adding_acts_short")}</>
                : <>{(() => { const n = testPlanPreview.activities.filter(a => a._selected).length; return t(n === 1 ? "cd.add_act_to_case" : "cd.add_acts_to_case").replace("{n}", n); })()}</>}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Standby Modal ── */}
    {standbyModal && (
      <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && setStandbyModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-yellow-600 font-bold text-lg leading-none">⏸</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{t("cd.standby_title")}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{t("cd.standby_subtitle")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {STANDBY_REASONS.map(r => (
              <label key={r}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors select-none ${
                  standbyReason === r ? "border-yellow-300 bg-yellow-50" : "border-gray-100 hover:bg-gray-50"
                }`}>
                <input type="radio" name="sbReason" value={r}
                  checked={standbyReason === r}
                  onChange={() => setStandbyReason(r)}
                  className="accent-yellow-500 flex-shrink-0" />
                <span className={`text-sm ${standbyReason === r ? "font-semibold text-yellow-800" : "text-gray-700"}`}>{r}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t("cd.standby_detail_label")} {standbyReason === t("cd.cancel_reason_other") && <span className="text-red-400">*</span>}
            </p>
            <textarea value={standbyNotes} onChange={e => setStandbyNotes(e.target.value)}
              rows={3} placeholder={t("case.ph_standby_eg")}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-100 resize-none text-gray-800 placeholder:text-gray-400 bg-white" />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => setStandbyModal(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              {t("action.cancel")}
            </button>
            <button onClick={confirmStandby}
              disabled={!standbyReason || (standbyReason === t("cd.cancel_reason_other") && !standbyNotes.trim())}
              className="px-5 py-2 text-sm font-semibold text-white bg-yellow-500 hover:bg-yellow-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {t("cd.standby_confirm")}
            </button>
          </div>
        </div>
      </div>
    )}

    <InvoiceModal
      isOpen={showInvoiceModal}
      onClose={() => setShowInvoiceModal(false)}
      caseData={caseData}
      auth={auth}
    />

    {showInviteDrawer && (
      <InviteConsultantDrawer
        caseData={caseData}
        auth={auth}
        onClose={() => setShowInviteDrawer(false)}
      />
    )}

    {cancelModal && (
      <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && setCancelModal(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <X size={16} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{t("cd.cancel_title")}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{t("cd.cancel_subtitle")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {CANCEL_REASONS.map(r => (
              <label key={r}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors select-none ${
                  cancelReason === r ? "border-red-300 bg-red-50" : "border-gray-100 hover:bg-gray-50"
                }`}>
                <input type="radio" name="cxReason" value={r}
                  checked={cancelReason === r}
                  onChange={() => setCancelReason(r)}
                  className="accent-red-500 flex-shrink-0" />
                <span className={`text-sm ${cancelReason === r ? "font-semibold text-red-700" : "text-gray-700"}`}>{r}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t("cd.cancel_explanation_label")} <span className="text-red-400">*</span>
            </p>
            <textarea value={cancelNotes} onChange={e => setCancelNotes(e.target.value)}
              rows={3} placeholder={t("case.ph_cancel_reason")}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-100 resize-none text-gray-800 placeholder:text-gray-400 bg-white" />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => setCancelModal(null)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              {t("cd.cancel_keep")}
            </button>
            <button onClick={confirmCancellation} disabled={!cancelReason || !cancelNotes.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {t("cd.cancel_confirm")}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

export { ConsultantsView, ConsultantDetailModal };
