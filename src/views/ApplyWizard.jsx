import { useState, useEffect } from "react";
import { Briefcase, Check, CheckCircle2, FileText, PenLine, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { usePlanConfig } from "../hooks/useSystemSettings.jsx";
import { Badge } from "../components/ProfileComponents.jsx";
import { Input, Textarea } from "../components/ui.jsx";
import { PRIORITY_COLORS } from "../lib/businessConstants.js";
import { PRIORITY_LABEL_KEYS, cap, fmtDate } from "../lib/uiUtils.jsx";
import { OnboardingRoadmap } from "./OnboardingViews.jsx";
import { UpgradeModal } from "./SystemSettingsView.jsx";

function ApplyWizard({ caseData, auth, onComplete, onCancel }) {
  const { t } = useT();
  const planCfg = usePlanConfig();
  const APPLY_STEPS = [
    { id: "brief",  label: t("apply.step0_label"), Icon: FileText,     desc: t("apply.step0_desc") },
    { id: "pitch",  label: t("apply.step1_label"), Icon: PenLine,      desc: t("apply.step1_desc") },
    { id: "terms",  label: t("apply.step2_label"), Icon: Briefcase,    desc: t("apply.step2_desc") },
    { id: "review", label: t("apply.step3_label"), Icon: CheckCircle2, desc: t("apply.step3_desc") },
  ];
  const [step, setSt]           = useState(0);
  const [submitting, setSubmit] = useState(false);
  const [pitch, setPitch]       = useState({ cover_letter: "" });
  const [terms, setTerms]       = useState({ proposed_rate: "", time_commitment: 20 });
  const [maxAvailable, setMaxAvailable] = useState(100);
  const [availLoading, setAvailLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(null);

  const TERMINAL = ["completed", "cancelled", "terminated", "closed", "approved"];

  useEffect(() => {
    (async () => {
      setAvailLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: profile }, { data: assignments }] = await Promise.all([
        supabase.from("consultant_profiles")
          .select("external_occupancy_pct")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("case_assignments")
          .select("time_commitment, case:case_id(status)")
          .eq("consultant_id", user.id),
      ]);
      const externalPct = profile?.external_occupancy_pct ?? 0;
      const activePct = (assignments ?? [])
        .filter(a => !TERMINAL.includes(a.case?.status))
        .reduce((sum, a) => sum + (a.time_commitment ?? 0), 0);
      const free = Math.max(0, 100 - externalPct - activePct);
      setMaxAvailable(free);
      setTerms(p => ({ ...p, time_commitment: Math.min(p.time_commitment, free || 10) }));
      setAvailLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLast = step === APPLY_STEPS.length - 1;

  async function handleSubmit() {
    setSubmit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const consultantId = user.id;
      // Check application limit
      const planLimits = planCfg.getPlanLimits(consultantId, 'consultant');
      if (planLimits.maxApps !== -1) {
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
        const { count } = await supabase.from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('consultant_id', consultantId)
          .gte('created_at', startOfMonth.toISOString());
        if (count >= planLimits.maxApps) {
          setUpgradeModal({ roleType: 'consultant', planKey: 'professional', title: 'Application limit reached', message: `Your plan allows ${planLimits.maxApps} application${planLimits.maxApps === 1 ? '' : 's'} per month. Upgrade to apply to more cases.` });
          setSubmit(false);
          return;
        }
      }
      const { error } = await supabase.from("applications").insert({
        case_id: caseData.id,
        consultant_id: user.id,
        cover_letter: pitch.cover_letter || null,
        proposed_rate: terms.proposed_rate ? Number(terms.proposed_rate) : null,
        time_commitment: Number(terms.time_commitment),
        max_available_at_submission: maxAvailable,
      });
      if (error) throw error;
      onComplete();
    } catch (e) { alert(e.message); }
    setSubmit(false);
  }

  return (
    <>
    {upgradeModal && (
      <UpgradeModal
        title={upgradeModal.title}
        message={upgradeModal.message}
        roleType={upgradeModal.roleType}
        planKey={upgradeModal.planKey}
        auth={auth}
        onClose={() => setUpgradeModal(null)}
      />
    )}
    <div className="max-w-2xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("apply.title")}</h1>
          <p className="text-gray-500 text-sm mt-0.5 truncate max-w-sm">{caseData.title}</p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          <X size={13} className="mr-1 inline" />{t("action.cancel")}
        </button>
      </div>

      <OnboardingRoadmap steps={APPLY_STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">

        {/* Step 0 — Case Brief */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("apply.step0_label")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("apply.brief_desc")}</p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-gray-900 text-base">{caseData.title}</span>
                  <Badge className={PRIORITY_COLORS[caseData.priority]}>{PRIORITY_LABEL_KEYS[caseData.priority] ? t(PRIORITY_LABEL_KEYS[caseData.priority]) : cap(caseData.priority)}</Badge>
                </div>
                {caseData.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{caseData.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {caseData.budget && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">{t("label.budget")}</div>
                    <div className="font-semibold text-gray-800">${Number(caseData.budget).toLocaleString()}</div>
                  </div>
                )}
                {caseData.due_date && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">{t("label.due_date")}</div>
                    <div className="font-semibold text-gray-800">{fmtDate(caseData.due_date)}</div>
                  </div>
                )}
                {caseData.client?.client_profiles?.company_name && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">{t("label.client")}</div>
                    <div className="font-semibold text-gray-800">{caseData.client.client_profiles.company_name}</div>
                  </div>
                )}
              </div>
              {caseData.skills_required?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("label.skills_req")}</div>
                  <div className="flex flex-wrap gap-2">
                    {caseData.skills_required.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 1 — Your Pitch */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("apply.step1_label")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("apply.pitch_desc")}</p>
            <Textarea label={t("apply.cover_letter")} value={pitch.cover_letter}
              onChange={e => setPitch(p => ({ ...p, cover_letter: e.target.value }))}
              placeholder={t("apply.ph_cover_letter")} />
            <p className="text-xs text-gray-400 mt-1">{t("apply.pitch_tip")}</p>
          </>
        )}

        {/* Step 2 — Terms */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("apply.step2_label")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("apply.terms_desc")}</p>
            <Input label={t("apply.rate_label")} type="number" value={terms.proposed_rate}
              onChange={e => setTerms(p => ({ ...p, proposed_rate: e.target.value }))}
              placeholder={t("apply.ph_rate_eg")} />

            {/* Availability cap indicator */}
            <div className={`mt-4 mb-4 rounded-xl p-4 ${maxAvailable === 0 ? "bg-red-50 border border-red-200" : "bg-blue-50 border border-blue-100"}`}>
              {availLoading ? (
                <p className="text-sm text-gray-400">{t("apply.calc_avail")}</p>
              ) : maxAvailable === 0 ? (
                <div>
                  <p className="text-sm font-semibold text-red-700">{t("apply.no_avail")}</p>
                  <p className="text-xs text-red-500 mt-0.5">{t("apply.no_avail_desc")}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-800">{t("apply.avail_title")}</span>
                    <span className="text-xl font-black text-blue-700">{maxAvailable}%</span>
                  </div>
                  <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${maxAvailable}%` }} />
                  </div>
                  <p className="text-xs text-blue-500 mt-1.5">{t("apply.avail_note")}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t("apply.time_label")} — <span className="text-blue-600 font-bold">{terms.time_commitment}%</span>
                <span className="text-gray-400 font-normal"> {t("apply.of_avail").replace("{n}", maxAvailable)}</span>
              </label>
              <input type="range" min="10" max={Math.max(10, maxAvailable)} step="10"
                value={Math.min(terms.time_commitment, maxAvailable)}
                disabled={maxAvailable === 0}
                onChange={e => {
                  const v = Number(e.target.value);
                  setTerms(p => ({ ...p, time_commitment: Math.min(v, maxAvailable) }));
                }}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>10%</span>
                <span>{Math.round(maxAvailable / 2)}%</span>
                <span className="font-semibold text-blue-600">{maxAvailable}% max</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {terms.time_commitment <= 25 && t("apply.commit_part")}
                {terms.time_commitment > 25 && terms.time_commitment <= 60 && t("apply.commit_half")}
                {terms.time_commitment > 60 && terms.time_commitment < maxAvailable && t("apply.commit_most")}
                {terms.time_commitment === maxAvailable && maxAvailable > 0 && t("apply.commit_full")}
              </p>
            </div>
          </>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("apply.review_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("apply.review_desc")}</p>
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("apply.applying_to")}</p>
                <p className="font-semibold text-gray-900">{caseData.title}</p>
                {caseData.client?.client_profiles?.company_name && (
                  <p className="text-sm text-gray-500 mt-0.5">{caseData.client.client_profiles.company_name}</p>
                )}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("apply.step1_label")}</p>
                {pitch.cover_letter
                  ? <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{pitch.cover_letter}</p>
                  : <p className="text-sm text-gray-400 italic">{t("apply.no_cover")}</p>}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("apply.step2_label")}</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">{t("apply.proposed_rate")}</div>
                    <div className="font-semibold text-gray-900">
                      {terms.proposed_rate ? `$${Number(terms.proposed_rate).toLocaleString()}/hr` : <span className="text-gray-400 italic">{t("apply.not_specified")}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">{t("apply.time_label")}</div>
                    <div className="font-semibold text-gray-900">{terms.time_commitment}%</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">{t("apply.avail_capacity")}</div>
                    <div className="font-semibold text-gray-900">{maxAvailable}%</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky nav */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : onCancel()}
          className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
          {step === 0 ? <><X size={13} className="mr-1 inline" />{t("action.cancel")}</> : t("action.back")}
        </button>
        {!isLast ? (
          <button onClick={() => setSt(s => s + 1)}
            disabled={step === 2 && maxAvailable === 0}
            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed">
            {t("action.continue")}
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
            {submitting ? t("state.submitting") : <><Check size={13} className="mr-1 inline" />{t("apply.submit")}</>}
          </button>
        )}
      </div>
    </div>
    </>
  );
}

export { ApplyWizard };
