import { useState, useEffect } from "react";
import { Briefcase, Check, CheckCircle2, FileText, PenLine, Users, X } from "lucide-react";
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

  const appMode = caseData.application_mode ?? "both";
  const allowsTeam       = appMode === "team" || appMode === "both";
  const allowsIndividual = appMode === "individual" || appMode === "both";

  const [step, setSt]           = useState(0);
  const [submitting, setSubmit] = useState(false);
  const [pitch, setPitch]       = useState({ cover_letter: "" });
  const [terms, setTerms]       = useState({ proposed_rate: "", time_commitment: 20 });
  const [maxAvailable, setMaxAvailable] = useState(100);
  const [availLoading, setAvailLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(null);

  // Team selection state
  const [applyAs, setApplyAs] = useState(allowsIndividual ? "individual" : "team");
  const [myTeams, setMyTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamMembers, setTeamMembers] = useState([]);
  // role_assignments: { [role_id]: { consultant_id, consultant_name } }
  const [roleAssignments, setRoleAssignments] = useState({});
  // Always fetch fresh required_roles from DB — caseData prop can be stale
  const [freshRequiredRoles, setFreshRequiredRoles] = useState(null);
  const requiredRoles = freshRequiredRoles ?? caseData.required_roles ?? [];

  useEffect(() => {
    if (!caseData.id) return;
    supabase.from("cases")
      .select("required_roles")
      .eq("id", caseData.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setFreshRequiredRoles(data.required_roles ?? []); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData.id]);

  // Derived — must be after all state declarations to avoid TDZ
  const showRoleAssign = allowsTeam && applyAs === "team" && selectedTeamId && requiredRoles.length > 0;
  const APPLY_STEPS = [
    ...(allowsTeam ? [{ id: "team_pick", label: "Team", Icon: Users, desc: "Apply as individual or with a team" }] : []),
    ...(showRoleAssign ? [{ id: "role_assign", label: "Roles", Icon: Users, desc: "Assign team members to required roles" }] : []),
    { id: "brief",  label: t("apply.step0_label"), Icon: FileText,     desc: t("apply.step0_desc") },
    { id: "pitch",  label: t("apply.step1_label"), Icon: PenLine,      desc: t("apply.step1_desc") },
    { id: "terms",  label: t("apply.step2_label"), Icon: Briefcase,    desc: t("apply.step2_desc") },
    { id: "review", label: t("apply.step3_label"), Icon: CheckCircle2, desc: t("apply.step3_desc") },
  ];

  const TERMINAL = ["completed", "cancelled", "terminated", "closed", "approved"];

  // Fetch user's accepted teams for team-apply mode
  useEffect(() => {
    if (!allowsTeam) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberRows } = await supabase
        .from("consultant_team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "accepted");
      const ids = (memberRows ?? []).map(r => r.team_id);
      if (ids.length > 0) {
        const { data: teamData } = await supabase
          .from("consultant_teams")
          .select("id, name")
          .in("id", ids);
        setMyTeams(teamData ?? []);
        if (appMode === "team" && teamData?.length > 0) setSelectedTeamId(teamData[0].id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch accepted team members + their skills when team is selected
  useEffect(() => {
    if (!selectedTeamId) { setTeamMembers([]); return; }
    (async () => {
      const { data: memberRows } = await supabase
        .from("consultant_team_members")
        .select("user_id, email, role")
        .eq("team_id", selectedTeamId)
        .eq("status", "accepted");
      const memberIds = (memberRows ?? []).map(m => m.user_id).filter(Boolean);
      let profileMap = {};
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from("consultant_profiles")
          .select("id, full_name, headline, skills")
          .in("id", memberIds);
        for (const p of (profiles ?? [])) profileMap[p.id] = p;
      }
      const members = (memberRows ?? []).map(m => ({
        user_id: m.user_id,
        email: m.email,
        full_name: profileMap[m.user_id]?.full_name ?? m.email,
        skills: profileMap[m.user_id]?.skills ?? [],
      }));
      setTeamMembers(members);
      // Auto-suggest: for each role, pick the member with the most skill overlaps
      if (requiredRoles.length > 0 && members.length > 0) {
        const suggestions = {};
        for (const role of requiredRoles) {
          const reqSkills = role.required_skills ?? [];
          if (reqSkills.length === 0) continue;
          let best = null, bestScore = -1;
          for (const m of members) {
            const score = (m.skills ?? []).filter(s => reqSkills.includes(s)).length;
            if (score > bestScore) { bestScore = score; best = m; }
          }
          if (best && bestScore >= 0) {
            suggestions[role.id] = { consultant_id: best.user_id, consultant_name: best.full_name };
          }
        }
        setRoleAssignments(suggestions);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

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
      // Duplicate guard — prevent re-applying to the same case
      const { data: existing } = await supabase.from("applications")
        .select("id").eq("case_id", caseData.id).eq("consultant_id", user.id).maybeSingle();
      if (existing) { alert("You have already applied to this case."); setSubmit(false); return; }

      const isTeamApp = applyAs === "team" && selectedTeamId;
      const roleAssignmentsArr = isTeamApp && requiredRoles.length > 0
        ? requiredRoles.map(r => ({
            role_id: r.id,
            role_label: r.label,
            ...(roleAssignments[r.id] ?? { consultant_id: null, consultant_name: null }),
          }))
        : [];
      const { error } = await supabase.from("applications").insert({
        case_id: caseData.id,
        consultant_id: user.id,
        cover_letter: pitch.cover_letter || null,
        proposed_rate: terms.proposed_rate ? Number(terms.proposed_rate) : null,
        time_commitment: Number(terms.time_commitment),
        max_available_at_submission: maxAvailable,
        application_type: isTeamApp ? "team" : "individual",
        team_id: isTeamApp ? selectedTeamId : null,
        role_assignments: roleAssignmentsArr.length > 0 ? roleAssignmentsArr : null,
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

        {/* Step — Team / Individual picker */}
        {APPLY_STEPS[step]?.id === "team_pick" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">How would you like to apply?</h2>
            <p className="text-sm text-gray-500 mb-5">This case accepts team applications. Choose to apply alone or as a team.</p>
            <div className="space-y-3">
              {allowsIndividual && (
                <button onClick={() => setApplyAs("individual")}
                  className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-all ${applyAs === "individual" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-200"}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${applyAs === "individual" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Individual Application</p>
                    <p className="text-xs text-gray-500">Apply on your own</p>
                  </div>
                </button>
              )}
              <button onClick={() => setApplyAs("team")}
                className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-all ${applyAs === "team" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${applyAs === "team" ? "border-indigo-500 bg-indigo-500" : "border-gray-300"}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Team Application</p>
                  <p className="text-xs text-gray-500">Apply with a consultant team you belong to</p>
                </div>
              </button>
              {applyAs === "team" && (
                <div className="mt-3">
                  {myTeams.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                      You don't have any teams yet. Go to your Profile → Teams tab to create or join one first.
                    </div>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Select your team</label>
                      <select value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">— Choose a team —</option>
                        {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Step — Role Assignments */}
        {APPLY_STEPS[step]?.id === "role_assign" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Assign Team Members to Roles</h2>
            <p className="text-sm text-gray-500 mb-5">
              This case requires specific roles to be covered. Assign a team member to each one.
              The same person can cover multiple roles.
              {teamMembers.length > 0 && " 💡 Pre-filled based on skill match."}
            </p>
            <div className="space-y-4">
              {requiredRoles.map(role => {
                const assigned = roleAssignments[role.id];
                return (
                  <div key={role.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                        {role.description && <p className="text-xs text-gray-400 mt-0.5">{role.description}</p>}
                        {role.required_skills?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {role.required_skills.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded text-[10px] font-medium">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {assigned && (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-[10px] font-bold">✓ assigned</span>
                      )}
                    </div>
                    <select
                      value={assigned?.consultant_id ?? ""}
                      onChange={e => {
                        const m = teamMembers.find(m => m.user_id === e.target.value);
                        if (m) setRoleAssignments(r => ({ ...r, [role.id]: { consultant_id: m.user_id, consultant_name: m.full_name } }));
                        else setRoleAssignments(r => { const n = { ...r }; delete n[role.id]; return n; });
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      <option value="">— Assign a team member —</option>
                      {teamMembers.map(m => {
                        const overlap = (m.skills ?? []).filter(s => (role.required_skills ?? []).includes(s)).length;
                        return (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name}{overlap > 0 ? ` ★ ${overlap} matching skill${overlap > 1 ? "s" : ""}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Step — Case Brief */}
        {APPLY_STEPS[step]?.id === "brief" && (
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

        {/* Step — Your Pitch */}
        {APPLY_STEPS[step]?.id === "pitch" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("apply.step1_label")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("apply.pitch_desc")}</p>
            <Textarea label={t("apply.cover_letter")} value={pitch.cover_letter}
              onChange={e => setPitch(p => ({ ...p, cover_letter: e.target.value }))}
              placeholder={t("apply.ph_cover_letter")} />
            <p className="text-xs text-gray-400 mt-1">{t("apply.pitch_tip")}</p>
          </>
        )}

        {/* Step — Terms */}
        {APPLY_STEPS[step]?.id === "terms" && (
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

        {/* Step — Review */}
        {APPLY_STEPS[step]?.id === "review" && (
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
              {allowsTeam && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Application Type</p>
                  {applyAs === "team" && selectedTeamId ? (
                    <>
                      <p className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
                        <Users size={13} /> Team — {myTeams.find(t => t.id === selectedTeamId)?.name}
                      </p>
                      {requiredRoles.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Role assignments</p>
                          {requiredRoles.map(r => {
                            const a = roleAssignments[r.id];
                            return (
                              <div key={r.id} className="flex items-center gap-2 text-xs">
                                <span className="font-medium text-gray-700 min-w-0">{r.label}:</span>
                                <span className={a ? "text-indigo-700 font-semibold" : "text-gray-400 italic"}>
                                  {a ? a.consultant_name : "Unassigned"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-gray-900">Individual</p>
                  )}
                </div>
              )}
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
            disabled={
              (APPLY_STEPS[step]?.id === "terms" && maxAvailable === 0) ||
              (APPLY_STEPS[step]?.id === "team_pick" && applyAs === "team" && !selectedTeamId) ||
              (APPLY_STEPS[step]?.id === "role_assign" && requiredRoles.some(r => !roleAssignments[r.id]))
            }
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
