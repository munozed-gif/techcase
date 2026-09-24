import { useState, useEffect, useRef } from "react";
import {
  Check, CheckCircle2, DollarSign, FileText, Flag, GraduationCap, Layers,
  LayoutTemplate, Link, Lock, MapPin, MessageSquare, Search, Settings,
  UserCheck, Users, UsersRound, X, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { usePlanConfig, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Select, Textarea } from "../components/ui.jsx";
import { PRIORITY_LABEL_KEYS, SLA_DEFAULT_TYPES, SLA_PRIORITIES, SLA_UNIT_LABELS, SlaMatrixEditor, cap, fmtDate } from "../lib/uiUtils.jsx";
import { logEvent } from "../lib/utils.js";
import { CaseTemplatePickerModal } from "../views/CaseTemplates.jsx";
import { OnboardingRoadmap } from "../views/OnboardingViews.jsx";
import { UpgradeModal } from "../views/SystemSettingsView.jsx";
import {
  LIFECYCLE_PRESETS, PROJECT_TYPES, SAP_AREAS, INDUSTRY_AREAS,
  DEFAULT_ACTIVITY_PHASES, ROLE_COLORS,
  PRIORITY_COLORS, STATUS_COLORS, getLifecycleStages,
} from "../lib/businessConstants.js";

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const SLA_PRESETS = [
  { value: "standard", labelKey: "sla.preset_standard", days: 30 },
  { value: "express",  labelKey: "sla.preset_express",  days: 14 },
  { value: "critical", labelKey: "sla.preset_critical", days: 7 },
  { value: "custom",   labelKey: "sla.preset_custom",   days: null },
];

// CREATE_CASE_STEPS and EXPRESS_CASE_STEPS moved inside CreateCaseWizard to allow t() calls

// PROJECT_STEPS moved inside CreateProjectWizard to allow t() calls

const EXPRESS_STEP_IDS = [0, 1, 2, 3, 9];

function CatalogMultiSelect({ options = [], selected = [], onChange, color = "blue", placeholder = "Search…" }) {
  const [filter, setFilter] = useState("");
  const visible = filter.trim()
    ? options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
    : options;
  function toggle(val) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  }
  const colorMap = {
    blue:   { chip: "bg-blue-50 text-blue-700 border border-blue-200",   btn: "hover:bg-blue-100 text-blue-400 hover:text-blue-700" },
    green:  { chip: "bg-green-50 text-green-700 border border-green-200", btn: "hover:bg-green-100 text-green-400 hover:text-green-700" },
    violet: { chip: "bg-violet-50 text-violet-700 border border-violet-200", btn: "hover:bg-violet-100 text-violet-400 hover:text-violet-700" },
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(v => (
            <span key={v} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${c.chip}`}>
              {v}
              <button type="button" onClick={() => toggle(v)} className={`ml-0.5 ${c.btn} rounded`}>×</button>
            </span>
          ))}
        </div>
      )}
      {options.length > 8 && (
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
      )}
      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
        {visible.map(opt => {
          const sel = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
                sel ? c.chip : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
              }`}>
              {opt}
            </button>
          );
        })}
        {visible.length === 0 && <p className="text-xs text-gray-400 py-1">No matches</p>}
      </div>
    </div>
  );
}

const SENIORITY_OPTS = ["Any", "Junior", "Mid", "Senior", "Expert"];

function RequiredRolesBuilder({ roles, onChange, catalogSkills, applicationMode }) {
  const [expandedRow, setExpandedRow] = useState(null); // role id with skill picker open
  const [teamMatch, setTeamMatch] = useState(null); // { total, full, partial, teams[] }
  const [matchLoading, setMatchLoading] = useState(false);
  const debounceRef = useRef(null);

  function addRole() {
    onChange(prev => [...prev, {
      id: crypto.randomUUID(),
      label: "",
      description: "",
      required_skills: [],
      seniority: "Any",
      time_pct: 50,
    }]);
  }
  function removeRole(id) { onChange(prev => prev.filter(r => r.id !== id)); }
  function updateRole(id, field, value) {
    onChange(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  // Live team match — debounced 600ms after any role change
  useEffect(() => {
    const filled = roles.filter(r => r.label.trim());
    if (filled.length === 0) { setTeamMatch(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setMatchLoading(true);
      try {
        const TERMINAL = ["completed", "cancelled", "terminated", "closed", "approved"];
        // Fetch all accepted teams with their members' skills + availability
        const { data: memberRows } = await supabase
          .from("consultant_team_members")
          .select("team_id, user_id, consultant_teams(id, name)")
          .eq("status", "accepted");
        if (!memberRows?.length) { setTeamMatch({ total: 0, full: 0, partial: 0, teams: [] }); setMatchLoading(false); return; }

        const allMemberIds = [...new Set(memberRows.map(m => m.user_id).filter(Boolean))];
        const [{ data: profiles }, { data: activeAssignments }] = await Promise.all([
          supabase.from("consultant_profiles")
            .select("id, skills, external_occupancy_pct")
            .in("id", allMemberIds),
          supabase.from("case_assignments")
            .select("consultant_id, time_commitment, case:case_id(status)")
            .in("consultant_id", allMemberIds),
        ]);
        const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
        const availMap = {};
        for (const id of allMemberIds) {
          const ext = profileMap[id]?.external_occupancy_pct ?? 0;
          const act = (activeAssignments ?? [])
            .filter(a => a.consultant_id === id && !TERMINAL.includes(a.case?.status))
            .reduce((s, a) => s + (a.time_commitment ?? 0), 0);
          availMap[id] = Math.max(0, 100 - ext - act);
        }

        // Group members by team
        const teamMap = {};
        for (const m of memberRows) {
          const tid = m.team_id;
          if (!teamMap[tid]) teamMap[tid] = { id: tid, name: m.consultant_teams?.name ?? tid, members: [] };
          if (m.user_id) teamMap[tid].members.push({ user_id: m.user_id, skills: profileMap[m.user_id]?.skills ?? [], avail: availMap[m.user_id] ?? 0 });
        }

        // Score each team against filled roles
        const results = [];
        for (const team of Object.values(teamMap)) {
          let rolesMatched = 0;
          for (const role of filled) {
            const reqSkills = role.required_skills ?? [];
            const timePct = role.time_pct ?? 50;
            // Find best member for this role
            const candidate = team.members.find(m =>
              m.avail >= timePct &&
              (reqSkills.length === 0 || reqSkills.some(s => m.skills.includes(s)))
            );
            if (candidate) rolesMatched++;
          }
          const matchPct = filled.length > 0 ? Math.round((rolesMatched / filled.length) * 100) : 0;
          if (matchPct > 0) results.push({ id: team.id, name: team.name, matchPct, rolesMatched, total: filled.length });
        }
        results.sort((a, b) => b.matchPct - a.matchPct);
        setTeamMatch({
          total: results.length,
          full: results.filter(t => t.matchPct === 100).length,
          partial: results.filter(t => t.matchPct > 0 && t.matchPct < 100).length,
          teams: results.slice(0, 5),
        });
      } catch (_) { setTeamMatch(null); }
      setMatchLoading(false);
    }, 600);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(roles)]);

  const showPanel = applicationMode === "team" || applicationMode === "both";
  if (!showPanel) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Required Roles</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Each role will be assigned to a team member during the application. Leave empty for open-team apply.</p>
        </div>
        <button type="button" onClick={addRole}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap">
          <span className="text-base leading-none">+</span> Add Role
        </button>
      </div>

      <div className="flex gap-4 items-start">
        {/* ── Role Table ── */}
        <div className="flex-1 min-w-0">
          {roles.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center">
              <p className="text-xs text-gray-400 italic">No roles defined — team applies freely</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1.8rem_1fr_6rem_5rem_3rem] gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">#</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Role</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Seniority</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Time %</span>
                <span />
              </div>

              {/* Rows */}
              {roles.map((role, idx) => (
                <div key={role.id}
                  className={`border-b border-gray-100 last:border-0 ${expandedRow === role.id ? "bg-indigo-50/30" : "hover:bg-gray-50/60"} transition-colors`}>
                  {/* Main row */}
                  <div className="grid grid-cols-[1.8rem_1fr_6rem_5rem_3rem] gap-2 items-center px-3 py-2">
                    <span className="text-xs font-bold text-indigo-400 tabular-nums">#{idx + 1}</span>
                    <div className="min-w-0">
                      <input
                        value={role.label}
                        onChange={e => updateRole(role.id, "label", e.target.value)}
                        placeholder="e.g. ABAP Lead"
                        className="w-full text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none py-0.5 placeholder-gray-300"
                      />
                      {/* Skills chips summary — click to expand */}
                      <button type="button" onClick={() => setExpandedRow(expandedRow === role.id ? null : role.id)}
                        className="mt-1 flex flex-wrap gap-1 items-center group">
                        {role.required_skills.length > 0
                          ? role.required_skills.slice(0, 3).map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded text-[10px] font-medium">{s}</span>
                          ))
                          : <span className="text-[10px] text-gray-400 italic group-hover:text-indigo-400">+ add skills</span>
                        }
                        {role.required_skills.length > 3 && (
                          <span className="text-[10px] text-gray-400">+{role.required_skills.length - 3}</span>
                        )}
                      </button>
                    </div>
                    <select
                      value={role.seniority ?? "Any"}
                      onChange={e => updateRole(role.id, "seniority", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      {SENIORITY_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="5" max="100" step="5"
                        value={role.time_pct ?? 50}
                        onChange={e => updateRole(role.id, "time_pct", Math.min(100, Math.max(5, Number(e.target.value))))}
                        className="w-12 text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 text-center bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 tabular-nums"
                      />
                      <span className="text-[10px] text-gray-400">%</span>
                    </div>
                    <button type="button" onClick={() => removeRole(role.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors justify-self-center">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Expanded skill picker */}
                  {expandedRow === role.id && (
                    <div className="px-3 pb-3 border-t border-indigo-100 bg-white">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1.5">Skills required for this role</p>
                      <input
                        value={role.description}
                        onChange={e => updateRole(role.id, "description", e.target.value)}
                        placeholder="Brief description (optional)"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                      />
                      <CatalogMultiSelect
                        options={catalogSkills}
                        selected={role.required_skills}
                        onChange={val => updateRole(role.id, "required_skills", val)}
                        color="violet"
                        placeholder="Filter skills…"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Live Team Match Panel ── */}
        <div className="w-48 flex-shrink-0">
          <div className={`rounded-xl border p-3 transition-colors ${
            matchLoading ? "border-gray-200 bg-gray-50" :
            !teamMatch ? "border-gray-200 bg-gray-50" :
            teamMatch.full > 0 ? "border-green-200 bg-green-50" :
            teamMatch.partial > 0 ? "border-amber-200 bg-amber-50" :
            "border-red-200 bg-red-50"
          }`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Team Availability</p>

            {roles.filter(r => r.label.trim()).length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Add roles to see matches</p>
            ) : matchLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] text-gray-400">Checking…</span>
              </div>
            ) : !teamMatch ? (
              <p className="text-[11px] text-gray-400">—</p>
            ) : (
              <div className="space-y-2">
                {/* Summary counts */}
                <div className="flex gap-2">
                  <div className="text-center">
                    <p className={`text-xl font-bold tabular-nums leading-none ${teamMatch.full > 0 ? "text-green-600" : "text-gray-400"}`}>{teamMatch.full}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">Full match</p>
                  </div>
                  <div className="w-px bg-gray-200" />
                  <div className="text-center">
                    <p className={`text-xl font-bold tabular-nums leading-none ${teamMatch.partial > 0 ? "text-amber-500" : "text-gray-400"}`}>{teamMatch.partial}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">Partial</p>
                  </div>
                </div>

                {/* Top teams list */}
                {teamMatch.teams.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-gray-200">
                    {teamMatch.teams.map(team => (
                      <div key={team.id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-medium text-gray-700 truncate">{team.name}</span>
                          <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${
                            team.matchPct === 100 ? "text-green-600" : team.matchPct >= 50 ? "text-amber-500" : "text-red-500"
                          }`}>{team.matchPct}%</span>
                        </div>
                        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            team.matchPct === 100 ? "bg-green-500" : team.matchPct >= 50 ? "bg-amber-400" : "bg-red-400"
                          }`} style={{ width: `${team.matchPct}%` }} />
                        </div>
                      </div>
                    ))}
                    {teamMatch.total > 5 && (
                      <p className="text-[9px] text-gray-400 text-center pt-0.5">+{teamMatch.total - 5} more teams</p>
                    )}
                  </div>
                )}

                {teamMatch.total === 0 && (
                  <p className="text-[11px] text-red-500 font-medium">No teams available for these requirements</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateCaseWizard({ auth, createCase, onComplete, onSave, onCancel, initialData = null, initialProjectId = null, presetData = null }) {
  const { t } = useT();
  const { settings: catalogSettings } = useSystemSettings();
  const planCfg = usePlanConfig();
  const SKILL_DEFAULTS = ["ABAP Development", "SAP Basis Administration", "SAP FICO Configuration", "SAP MM Configuration", "SAP SD Configuration", "SAP HCM", "SAP Fiori / UI5", "SAP BW / Analytics", "SAP Integration (CPI/PI)", "S/4HANA Migration", "SAP GRC", "SAP PM / QM", "HANA DB Administration", "SAP Security / Roles", "SAP PS (Project Systems)"];
  const CERT_DEFAULTS  = ["SAP Certified Associate - ABAP with SAP NetWeaver", "SAP Certified Application Associate - SAP S/4HANA Finance", "SAP Certified Application Associate - SAP S/4HANA Sourcing and Procurement", "SAP Certified Application Associate - SAP SuccessFactors", "SAP Certified Technology Associate - SAP HANA", "SAP Certified Technology Associate - SAP Basis", "SAP Certified Application Associate - SAP MM", "SAP Certified Application Associate - SAP SD", "SAP Certified Application Associate - SAP HCM"];
  const LANG_DEFAULTS  = ["English", "Spanish", "German", "French", "Portuguese", "Italian", "Dutch", "Polish", "Mandarin", "Japanese", "Arabic", "Russian", "Hindi"];
  const catalogSkills = catalogSettings["catalog_skills"] ?? SKILL_DEFAULTS;
  const catalogCerts  = catalogSettings["catalog_certifications"] ?? CERT_DEFAULTS;
  const catalogLangs  = catalogSettings["catalog_languages"] ?? LANG_DEFAULTS;
  const isEdit = !!initialData;
  const CREATE_CASE_STEPS = [
    { id: "project",        label: t("cs.step_project"),    Icon: Layers,         desc: "Link to a project" },
    { id: "basics",         label: t("cs.step_basics"),     Icon: FileText,       desc: "Title & description" },
    { id: "visibility",     label: t("cs.step_visibility"), Icon: Lock,           desc: "Access & application settings" },
    { id: "scope",          label: t("cs.step_scope"),      Icon: DollarSign,     desc: "Budget, dates & skills" },
    { id: "arrangement",    label: t("cs.step_work"),       Icon: MapPin,         desc: "Remote, on-site or hybrid" },
    { id: "roles",          label: t("cs.step_roles"),      Icon: UsersRound,     desc: "Key user & head hunters" },
    { id: "qualifications", label: t("cs.step_reqs"),       Icon: GraduationCap,  desc: "Certifications & languages" },
    { id: "interview",      label: t("cs.step_interview"),  Icon: MessageSquare,  desc: "Evaluation preferences" },
    { id: "milestones",     label: t("cs.step_milestones"), Icon: Flag,           desc: "Key deliverables" },
    { id: "review",         label: t("cs.step_review"),    Icon: CheckCircle2,   desc: "Confirm & create" },
  ];
  const EXPRESS_CASE_STEPS = CREATE_CASE_STEPS.filter((_, i) => EXPRESS_STEP_IDS.includes(i));
  const [mode, setMode]     = useState(isEdit ? "advanced" : null);
  const [step, setSt]       = useState(initialProjectId || auth.isHeadhunter ? 1 : 0);
  const [creating, setCreating] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);

  const [selectedProjectId, setSelectedProjectId] = useState(initialData?.project_id ?? initialProjectId);
  const [wizardProjects, setWizardProjects]         = useState([]);

  // Reset case_type when project changes and the selected type is no longer valid
  useEffect(() => {
    const proj = wizardProjects.find(p => p.id === selectedProjectId);
    if (basics.case_type === "ticket" && proj?.project_type !== "help_desk") {
      setBasics(prev => ({ ...prev, case_type: "case" }));
    }
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const _visCfg = useVisibilitySettings();
  const [basics, setBasics] = useState({ title: initialData?.title ?? "", description: initialData?.description ?? "", priority: initialData?.priority ?? "medium", area_sap: initialData?.area_sap ?? "", area_industry: initialData?.area_industry ?? "", is_confidential: initialData?.is_confidential ?? false, nda_required: initialData?.nda_required ?? false, min_trust_level: initialData?.min_trust_level ?? null, application_mode: initialData?.application_mode ?? "both", case_type: initialData?.case_type ?? (auth.isHeadhunter ? "resource_need" : "case") });
  const [requiredRoles, setRequiredRoles] = useState(
    (initialData?.required_roles ?? []).map(r => ({
      seniority: "Any", time_pct: 50, ...r,
    }))
  );
  const [caseVisMode, setCaseVisMode] = useState(() => {
    if (initialData?.id) return _visCfg.getCaseVisibility(initialData.id, null);
    const clientId = auth.isClient ? auth.user?.id : null;
    if (clientId && _visCfg.getCompanyVisibility(clientId) === 'internal') return 'private';
    return 'public';
  });
  const [scope, setScope]   = useState({ budget: initialData?.budget ?? "", start_date: initialData?.start_date ?? "", due_date: initialData?.due_date ?? daysFromNow(30), sla: "standard", _skills: initialData?.skills_required ?? [], client_id: auth.isClient ? auth.user?.id : (initialData?.client_id ?? "") });

  // Step 3: Work Arrangement
  const [arrangement, setArr] = useState({ work_mode: initialData?.work_mode ?? "remote", work_location: initialData?.work_location ?? "", travel_required: initialData?.travel_required ?? false });

  // Step 4: Roles & People
  const [roles, setRoles] = useState({ key_user_email: initialData?.key_user_email ?? "", is_head_hunter: initialData?.is_head_hunter ?? false, head_hunter_name: initialData?.head_hunter_name ?? "", head_hunter_id: initialData?.head_hunter_id ?? null });
  const [keyUsers, setKeyUsers]     = useState([]);   // { user_id, full_name, email, area }
  const [kuSearch, setKuSearch]     = useState("");
  const [kuResults, setKuResults]   = useState([]);
  const [kuSearching, setKuSearching] = useState(false);
  const [hhSearch, setHhSearch]     = useState(initialData?.head_hunter_name ?? "");
  const [hhResults, setHhResults]   = useState([]);
  const [hhSearching, setHhSearching] = useState(false);

  // Consultant client lookup (email search to assign client at creation)
  const [consultantClientEmail, setConsultantClientEmail] = useState("");
  const [consultantClientLookup, setConsultantClientLookup] = useState(null); // null | { found: bool, user?: {id,full_name} }
  const consultantClientDebounce = useRef(null);
  useEffect(() => {
    if (!auth.isConsultant) return;
    clearTimeout(consultantClientDebounce.current);
    if (!consultantClientEmail.trim() || consultantClientEmail.length < 3) {
      setConsultantClientLookup(null);
      setScope(p => ({ ...p, client_id: "" }));
      return;
    }
    consultantClientDebounce.current = setTimeout(async () => {
      const { data } = await supabase.from("users").select("id, full_name, role")
        .eq("email", consultantClientEmail.trim().toLowerCase()).maybeSingle();
      if (data) {
        setConsultantClientLookup({ found: true, user: data });
        setScope(p => ({ ...p, client_id: data.id }));
      } else {
        setConsultantClientLookup({ found: false });
        setScope(p => ({ ...p, client_id: "" }));
      }
    }, 400);
    return () => clearTimeout(consultantClientDebounce.current);
  }, [consultantClientEmail, auth.isConsultant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 5: Qualifications
  const [quals, setQuals] = useState({ certifications_required: initialData?.certifications_required ?? [], min_years_experience: initialData?.min_years_experience ?? "", languages_required: initialData?.languages_required ?? [], security_clearance: initialData?.security_clearance ?? false });

  // Step 6: Interview
  const [interview, setIntv] = useState({ interview_required: initialData?.interview_required ?? false, interview_format: initialData?.interview_format ?? "video", interview_rounds: initialData?.interview_rounds ?? 1, technical_assessment: initialData?.technical_assessment ?? false, rounds_config: initialData?.interview_rounds_config ?? [] });
  const [milestones, setMs] = useState([]);
  const [mlForm, setMlForm] = useState({ title: "", due_date: "", description: "" });
  const [clients, setClients] = useState([]);
  const [startConfirmed, setStartConfirmed] = useState(false);
  const [keyUserClientId, setKeyUserClientId] = useState(null);
  // Template state
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [canConfirmOnCreate, setCanConfirmOnCreate] = useState(false);

  useEffect(() => {
    if (auth.isAdmin || auth.isManager) {
      supabase.from("users")
        .select("id, full_name, client_profiles(company_name)")
        .eq("role", "client")
        .then(({ data }) => setClients(data ?? []));
    }
  }, []);

  const { templates: lcTemplates } = useLifecycleTemplates();

  useEffect(() => {
    let q = supabase.from("projects").select("id, name, status, area_sap, case_lifecycle, project_type, client_id, client:client_id(full_name, client_profiles(company_name))").eq("status", "active").order("name");
    if (auth.isClient) q = q.eq("client_id", auth.user?.id);
    q.then(({ data }) => setWizardProjects(data ?? []));
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.isKeyUser || !auth.user?.id) return;
    supabase.from("case_key_users").select("case:case_id(client_id)").eq("user_id", auth.user.id).limit(1)
      .then(({ data }) => { if (data?.[0]?.case?.client_id) setKeyUserClientId(data[0].case.client_id); });
  }, [auth.isKeyUser, auth.user?.id]);

  useEffect(() => {
    if (!isEdit || !initialData?.id) return;
    supabase.from("case_key_users")
      .select("user_id, area, users:user_id(full_name, email)")
      .eq("case_id", initialData.id)
      .then(({ data }) => {
        if (data) setKeyUsers(data.map(r => ({
          user_id: r.user_id,
          full_name: r.users?.full_name ?? "",
          email: r.users?.email ?? "",
          area: r.area ?? "",
        })));
      });
  }, [isEdit, initialData?.id]);

  useEffect(() => {
    if (isEdit || !auth.role) return;
    if (auth.isAdmin) { setCanConfirmOnCreate(true); return; }
    supabase.from("lifecycle_templates").select("stages")
      .then(({ data }) => {
        const can = (data ?? []).some(t =>
          t.stages?.some(s =>
            s.key === "confirmed" &&
            (!s.allowed_roles?.length || s.allowed_roles.includes(auth.role))
          )
        );
        setCanConfirmOnCreate(can);
      });
  }, [auth.role, auth.isAdmin, isEdit]);

  // Apply template preset data on mount (when creating from template)
  useEffect(() => {
    if (!presetData) return;
    setBasics(p => ({
      ...p,
      title:           presetData.title           ?? p.title,
      description:     presetData.description     ?? p.description,
      priority:        presetData.priority        ?? p.priority,
      area_sap:        presetData.area_sap        ?? p.area_sap,
      area_industry:   presetData.area_industry   ?? p.area_industry,
      min_trust_level: presetData.min_trust_level ?? p.min_trust_level,
    }));
    setScope(p => ({
      ...p,
      budget:   presetData.budget ?? p.budget,
      _skills:  presetData.skills_required ?? p._skills,
    }));
    if (presetData.work_mode) setArr(p => ({ ...p, work_mode: presetData.work_mode }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expressIdx = EXPRESS_STEP_IDS.indexOf(step);
  const isLast = mode === "express"
    ? step === EXPRESS_STEP_IDS[EXPRESS_STEP_IDS.length - 1]
    : step === CREATE_CASE_STEPS.length - 1;

  function nextStep() {
    if (mode === "express") {
      const next = EXPRESS_STEP_IDS[expressIdx + 1];
      if (next !== undefined) setSt(next);
    } else {
      // Skip interview step (7) for resource_need cases
      const next = step + 1;
      if (next === 7 && basics.case_type === "resource_need") setSt(8);
      else setSt(next);
    }
  }
  function prevStep() {
    if (mode === "express") {
      if (expressIdx === 0) { onCancel(); return; }
      setSt(EXPRESS_STEP_IDS[expressIdx - 1]);
    } else {
      if (step === 0) { onCancel(); return; }
      if (step === 1 && auth.isHeadhunter) { onCancel(); return; }
      // Skip interview step (7) going backwards for resource_need cases
      const prev = step - 1;
      if (prev === 7 && basics.case_type === "resource_need") setSt(6);
      else setSt(prev);
    }
  }

  function applyDefaults(d) {
    if (!d) return;
    setBasics(p => ({
      ...p,
      priority:        d.priority        ?? p.priority,
      area_sap:        d.area_sap        ?? p.area_sap,
      area_industry:   d.area_industry   ?? p.area_industry,
      is_confidential: d.is_confidential ?? p.is_confidential,
      nda_required:    d.nda_required    ?? p.nda_required,
      description:     d.description     ?? p.description,
    }));
    setScope(p => ({
      ...p,
      sla:     d.sla     ?? p.sla,
      budget:  d.budget  ?? p.budget,
      _skills: d.skills  ?? p._skills,
      due_date: d.sla ? daysFromNow(SLA_PRESETS.find(s => s.value === d.sla)?.days ?? 30) : p.due_date,
    }));
    setArr(p => ({
      ...p,
      work_mode:       d.work_mode       ?? p.work_mode,
      travel_required: d.travel_required ?? p.travel_required,
      work_location:   d.work_location   ?? p.work_location,
    }));
    setQuals(p => ({
      ...p,
      min_years_experience: d.min_years_experience  ?? p.min_years_experience,
      languages_required:   d.languages_required    ?? p.languages_required,
      security_clearance:   d.security_clearance    ?? p.security_clearance,
    }));
    setIntv(p => ({
      ...p,
      interview_required:   d.interview_required   ?? p.interview_required,
      interview_format:     d.interview_format     ?? p.interview_format,
      interview_rounds:     d.interview_rounds     ?? p.interview_rounds,
      technical_assessment: d.technical_assessment ?? p.technical_assessment,
    }));
  }

  async function selectMode(m) {
    setMode(m);
    if (m === "express" && auth.isClient && auth.user?.id) {
      const { data } = await supabase.from("client_profiles")
        .select("case_defaults").eq("id", auth.user.id).single();
      applyDefaults(data?.case_defaults);
    }
  }

  async function searchKeyUsers(q) {
    setKuSearch(q);
    if (!q.trim()) { setKuResults([]); return; }
    setKuSearching(true);

    // Determine the client this case belongs to
    const clientId = auth.isClient ? auth.user?.id
      : auth.isKeyUser ? keyUserClientId
      : scope.client_id || null;

    let eligibleIds = null; // null = no restriction (no client selected)

    if (clientId) {
      // Only show key users already linked to one of this client's cases
      const { data: cCases } = await supabase.from("cases").select("id").eq("client_id", clientId);
      const cIds = (cCases ?? []).map(c => c.id);
      if (!cIds.length) {
        setKuResults([]);
        setKuSearching(false);
        return;
      }
      const { data: kuData } = await supabase.from("case_key_users").select("user_id").in("case_id", cIds);
      eligibleIds = [...new Set((kuData ?? []).map(r => r.user_id))];
      if (!eligibleIds.length) {
        setKuResults([]);
        setKuSearching(false);
        return;
      }
    }

    let query = supabase.from("users")
      .select("id, full_name, email")
      .eq("role", "key_user")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);

    if (eligibleIds) query = query.in("id", eligibleIds);

    const { data } = await query;
    setKuResults((data ?? []).filter(u => !keyUsers.some(ku => ku.user_id === u.id)));
    setKuSearching(false);
  }
  function addKeyUser(u) {
    setKeyUsers(p => [...p, { user_id: u.id, full_name: u.full_name, email: u.email, area: "" }]);
    setKuSearch(""); setKuResults([]);
  }
  function removeKeyUser(uid) { setKeyUsers(p => p.filter(ku => ku.user_id !== uid)); }
  function updateKuArea(uid, area) { setKeyUsers(p => p.map(ku => ku.user_id === uid ? { ...ku, area } : ku)); }

  async function searchHeadhunters(q) {
    setHhSearch(q);
    setRoles(p => ({ ...p, head_hunter_id: null, head_hunter_name: q }));
    if (!q.trim()) { setHhResults([]); return; }
    setHhSearching(true);
    const { data } = await supabase.from("users")
      .select("id, full_name, email")
      .eq("role", "headhunter")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(6);
    setHhResults(data ?? []);
    setHhSearching(false);
  }
  function selectHeadhunter(u) {
    setRoles(p => ({ ...p, head_hunter_id: u.id, head_hunter_name: u.full_name }));
    setHhSearch(u.full_name);
    setHhResults([]);
  }

  function syncRoundsConfig(count, isHh, existingConfig) {
    return Array.from({ length: count }, (_, i) =>
      existingConfig[i] ?? { round: i + 1, conducted_by: isHh ? "headhunter" : "client_team", interviewer_name: "" }
    );
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const { _skills, client_id, sla, ...rest } = scope;
      const payload = {
        ...basics,
        status: startConfirmed ? "confirmed" : (() => {
          const selProject = wizardProjects.find(p => p.id === selectedProjectId);
          const stages = getLifecycleStages(selProject?.case_lifecycle ?? null, lcTemplates);
          return (stages.find(s => s.is_initial) ?? stages.find(s => !s.is_terminal))?.key ?? "open";
        })(),
        area_sap:      basics.area_sap || null,
        area_industry: basics.area_industry || null,
        is_confidential: basics.is_confidential,
        nda_required: basics.nda_required,
        min_trust_level: basics.min_trust_level ?? null,
        ...rest,
        start_date: rest.start_date || null,
        due_date: rest.due_date || null,
        budget: scope.budget ? Number(scope.budget) : null,
        skills_required: _skills,
        client_id:  auth.isClient  ? auth.user?.id : auth.isKeyUser ? keyUserClientId : client_id || null,
        manager_id: auth.isManager ? auth.user?.id : null,
        project_id: selectedProjectId || null,
        ...arrangement,
        ...roles,
        certifications_required: quals.certifications_required.length ? quals.certifications_required : null,
        min_years_experience: quals.min_years_experience ? parseInt(quals.min_years_experience, 10) : null,
        languages_required: quals.languages_required.length ? quals.languages_required : null,
        security_clearance: quals.security_clearance,
        interview_required: interview.interview_required,
        interview_format: interview.interview_format,
        interview_rounds: interview.interview_rounds,
        technical_assessment: interview.technical_assessment,
        interview_rounds_config: interview.rounds_config,
        required_roles: requiredRoles.filter(r => r.label.trim()),
      };
      if (isEdit) {
        await onSave(payload);
        if (initialData?.id) {
          await supabase.from("case_key_users").delete().eq("case_id", initialData.id);
          if (keyUsers.length > 0) {
            await supabase.from("case_key_users").insert(
              keyUsers.map(ku => ({ case_id: initialData.id, user_id: ku.user_id, area: ku.area || null }))
            );
          }
        }
        onComplete();
      } else {
        // Check case creation limit for client role
        if (auth.isClient && auth.user?.id) {
          const planLimits = planCfg.getPlanLimits(auth.user.id, 'client');
          if (planLimits.maxCases !== -1) {
            const { count } = await supabase.from('cases')
              .select('id', { count: 'exact', head: true })
              .eq('client_id', auth.user.id)
              .neq('status', 'closed').neq('status', 'completed').neq('status', 'cancelled');
            if (count >= planLimits.maxCases) {
              setUpgradeModal({ roleType: 'client', planKey: 'professional', title: 'Case limit reached', message: `Your plan allows ${planLimits.maxCases} active case${planLimits.maxCases === 1 ? '' : 's'}. Upgrade to post more.` });
              setCreating(false);
              return;
            }
          }
        }
        const newCase = await createCase(payload);
        if (newCase?.id) {
          if (caseVisMode !== 'public') {
            await _visCfg.setCaseVisibility(newCase.id, caseVisMode);
          }
          const kuRows = [...keyUsers];
          if (auth.isKeyUser && !kuRows.some(ku => ku.user_id === auth.user?.id)) {
            kuRows.push({ user_id: auth.user?.id, area: null });
          }
          if (kuRows.length > 0) {
            await supabase.from("case_key_users").insert(
              kuRows.map(ku => ({ case_id: newCase.id, user_id: ku.user_id, area: ku.area || null }))
            ).onConflict("case_id,user_id").ignore();
          }
          if (milestones.length > 0) {
            await supabase.from("case_milestones").insert(
              milestones.map(m => ({ ...m, due_date: m.due_date || null, case_id: newCase.id }))
            );
          }
          // Consultant created case with a new client email → auto-send invite
          if (auth.isConsultant && consultantClientEmail.trim() && consultantClientLookup?.found === false) {
            await supabase.from("case_invitations").insert({
              case_id:       newCase.id,
              invited_email: consultantClientEmail.trim().toLowerCase(),
              invited_by:    auth.user?.id,
            });
          }
          // Auto-assign the creating consultant
          if (auth.isConsultant && auth.user?.id) {
            await supabase.from("case_assignments").insert({
              case_id:         newCase.id,
              consultant_id:   auth.user.id,
              time_commitment: null,
            }).onConflict("case_id,consultant_id").ignore();
          }
        }
        if (saveAsTemplate && templateName.trim()) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const { _skills, client_id: _ci, sla: _sla, ...scopeRest } = scope;
            const tplData = {
              ...basics,
              ...scopeRest,
              ...arrangement,
              ...quals,
              ...interview,
              skills_required: _skills,
            };
            const { error: tplErr } = await supabase.from("case_templates").insert({
              name: templateName.trim(),
              description: basics.description || null,
              template_data: tplData,
              created_by: user?.id ?? null,
              is_global: true,
            });
            if (tplErr) { console.error("Template save error:", tplErr.message, tplErr.code); alert("Template could not be saved: " + tplErr.message); }
            else logEvent('template.created', { entityType: 'case_template', metadata: { name: templateName.trim() } });
          } catch (e) { console.error("Template save failed:", e.message); alert("Template save failed: " + e.message); }
        }
        onComplete(newCase?.id);
      }
    } catch (e) { alert(e.message); }
    setCreating(false);
  }

  function addMilestone() {
    if (!mlForm.title.trim()) return;
    setMs(p => [...p, mlForm]);
    setMlForm({ title: "", due_date: "", description: "" });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? t("case.edit_title") : t("case.new_title")}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {mode === null ? t("case.mode_null_sub") : mode === "express" ? t("case.mode_express_sub") : t("case.mode_adv_sub")}
          </p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          <X size={13} className="mr-1 inline" />{t("action.cancel")}
        </button>
      </div>

      {/* ── Mode selection ── */}
      {mode === null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t("case.choose_mode")}</h2>
          <p className="text-sm text-gray-400 text-center mb-8">{t("case.edit_after")}</p>
          <div className="grid grid-cols-2 gap-5">
            <button onClick={() => selectMode("express")}
              className="group text-left border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mb-4 transition-colors">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">{t("cs.mode_express")}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{t("case.mode_express_sub")} <span className="font-medium text-blue-600">3 steps.</span></div>
            </button>
            <button onClick={() => selectMode("advanced")}
              className="group text-left border-2 border-gray-200 hover:border-[#1A4B8C] hover:bg-blue-50/50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-[#1A4B8C]/10 flex items-center justify-center mb-4 transition-colors">
                <Settings className="w-6 h-6 text-gray-600 group-hover:text-[#1A4B8C]" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">{t("cs.mode_advanced")}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{t("case.mode_adv_sub")} <span className="font-medium text-gray-700">9 steps.</span></div>
            </button>
          </div>
        </div>
      )}

      {mode !== null && <>
      <OnboardingRoadmap
        steps={mode === "express" ? EXPRESS_CASE_STEPS : CREATE_CASE_STEPS}
        current={mode === "express" ? expressIdx : step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Project ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step0_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step0_desc")}</p>
            {wizardProjects.length === 0 ? (
              <div className="text-sm text-gray-400 italic bg-gray-50 rounded-xl p-4">
                {t("case.no_projects")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {wizardProjects.map(p => (
                  <button key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      if (p.client_id) setScope(prev => ({ ...prev, client_id: p.client_id }));
                      else setScope(prev => ({ ...prev, client_id: auth.isClient ? auth.user?.id : "" }));
                    }}
                    className={`text-left border-2 rounded-xl p-4 transition-colors ${
                      selectedProjectId === p.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                    }`}>
                    <div className="font-semibold text-gray-900 text-sm">{p.name}</div>
                    {p.area_sap && (
                      <span className="mt-1 inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{p.area_sap}</span>
                    )}
                    {p.client && (
                      <div className="text-xs text-gray-400 mt-1">
                        {p.client.client_profiles?.company_name || p.client.full_name}
                      </div>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedProjectId(null); setScope(prev => ({ ...prev, client_id: auth.isClient ? auth.user?.id : "" })); }}
                  className={`text-left border-2 rounded-xl p-4 transition-colors ${
                    selectedProjectId === null
                      ? "border-gray-400 bg-gray-100"
                      : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}>
                  <div className="font-semibold text-gray-500 text-sm">{t("case.standalone")}</div>
                  <div className="text-xs text-gray-400 mt-1">{t("case.standalone_desc")}</div>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Case Info ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step1_h2")}</h2>
            <p className="text-sm text-gray-500 mb-3">{t("case.step1_desc")}</p>
            {!isEdit && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm border-2 border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 rounded-xl transition-all font-medium">
                  <LayoutTemplate className="w-4 h-4" />
                  {t("template.start_from")}
                </button>
              </div>
            )}
            {/* Case Type */}
            {(() => {
              const selectedProject = wizardProjects.find(p => p.id === selectedProjectId);
              const isHelpDesk = selectedProject?.project_type === "help_desk";
              const caseTypeOptions = [
                {
                  value: "case",
                  label: t("cs.type_case"),
                  desc: t("cs.type_case_desc"),
                  disabled: false,
                  disabledReason: null,
                },
                {
                  value: "ticket",
                  label: t("cs.type_ticket"),
                  desc: t("cs.type_ticket_desc"),
                  disabled: !isHelpDesk,
                  disabledReason: t("cs.type_ticket_dis"),
                },
                {
                  value: "resource_need",
                  label: t("cs.type_resource"),
                  desc: t("cs.type_resource_desc"),
                  disabled: !auth.isHeadhunter,
                  disabledReason: t("cs.type_resource_dis"),
                },
              ];
              return (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t("cs.case_type_label")}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {caseTypeOptions.map(opt => {
                      const isActive = basics.case_type === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          disabled={opt.disabled}
                          onClick={() => !opt.disabled && setBasics(p => ({ ...p, case_type: opt.value }))}
                          title={opt.disabled ? opt.disabledReason : undefined}
                          className={`text-left p-3 border-2 rounded-xl transition-all relative ${
                            opt.disabled
                              ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                              : isActive
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"}`}>
                          <div className={`font-semibold text-sm ${opt.disabled ? "text-gray-400" : "text-gray-900"}`}>{opt.label}</div>
                          <div className="text-xs text-gray-400 mt-0.5 leading-tight">
                            {opt.disabled ? opt.disabledReason : opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <Input label={`${t("label.title")} *`} value={basics.title}
              onChange={e => setBasics(p => ({ ...p, title: e.target.value }))}
              placeholder={t("case.ph_title_eg")} />
            {mode === "express" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Select label={t("label.priority")} value={basics.priority}
                    onChange={e => setBasics(p => ({ ...p, priority: e.target.value }))}
                    options={["low","medium","high","critical"].map(s => ({ value: s, label: PRIORITY_LABEL_KEYS[s] ? t(PRIORITY_LABEL_KEYS[s]) : cap(s) }))} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.sap_area")}</label>
                    <select value={basics.area_sap}
                      onChange={e => setBasics(p => ({ ...p, area_sap: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">{t("case.sap_area_none")}</option>
                      {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{t("case.express_note")}</span>
                </div>
              </>
            ) : (
              <>
                <Textarea label={t("label.description")} value={basics.description}
                  onChange={e => setBasics(p => ({ ...p, description: e.target.value }))}
                  placeholder={t("case.ph_requirements")} rows={8} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label={t("label.priority")} value={basics.priority}
                    onChange={e => setBasics(p => ({ ...p, priority: e.target.value }))}
                    options={["low","medium","high","critical"].map(s => ({ value: s, label: PRIORITY_LABEL_KEYS[s] ? t(PRIORITY_LABEL_KEYS[s]) : cap(s) }))} />
                  <div className="flex items-end pb-1">
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-full">
                      {t("label.status")}: <span className="font-semibold text-blue-600">{t("status.open")}</span> {t("case.status_auto")}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer mt-1">
                  <input type="checkbox" checked={basics.nda_required}
                    onChange={e => setBasics(p => ({ ...p, nda_required: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700 font-medium">{t("case.nda")}</span>
                  <span className="text-xs text-gray-400">{t("case.nda_desc")}</span>
                </label>
              </>
            )}
          </>
        )}

        {/* ── Step 2: Visibility ── */}
        {step === 2 && mode !== "express" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Visibility & Access</h2>
            <p className="text-sm text-gray-500 mb-5">Control who can see and apply to this case.</p>

            {/* Case visibility */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">{t("case.visibility")}</p>
              <div className="flex gap-2">
                {[
                  { id: 'public',      label: t('case.vis_public'),  desc: t('case.vis_pub_desc'),  active: 'border-green-500 bg-green-50 text-green-800' },
                  { id: 'private',     label: t('case.vis_private'), desc: t('case.vis_priv_desc'), active: 'border-gray-600 bg-gray-700 text-white' },
                  { id: 'invite-only', label: t('case.vis_invite'),  desc: t('case.vis_inv_desc'),  active: 'border-blue-500 bg-blue-50 text-blue-800' },
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => setCaseVisMode(opt.id)}
                    className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${caseVisMode === opt.id ? opt.active : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <div className="text-xs font-bold mb-0.5">{opt.label}</div>
                    <div className={`text-[10px] leading-tight ${caseVisMode === opt.id ? 'opacity-80' : 'text-gray-400'}`}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Confidential + NDA */}
            <div className="border border-gray-100 rounded-xl p-4 mb-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidentiality</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={basics.is_confidential}
                  onChange={e => setBasics(p => ({ ...p, is_confidential: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <div>
                  <span className="text-sm text-gray-700 font-medium">Confidential case</span>
                  <p className="text-xs text-gray-400">Hides client name and sensitive details from consultants until accepted.</p>
                </div>
              </label>
            </div>

            {/* Who can apply */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">{t("cs.who_can_apply")}</p>
              <p className="text-xs text-gray-400 mb-3">{t("cs.who_can_apply_hint")}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "both",       label: t("cs.app_everyone"),   desc: t("cs.app_everyone_desc") },
                  { value: "individual", label: t("cs.app_individual"), desc: t("cs.app_individual_desc") },
                  { value: "team",       label: t("cs.app_teams"),      desc: t("cs.app_teams_desc") },
                ].map(opt => {
                  const sel = basics.application_mode === opt.value;
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => setBasics(p => ({ ...p, application_mode: opt.value }))}
                      className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${sel ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50"}`}>
                      <span className={`text-xs font-semibold ${sel ? "text-indigo-700" : "text-gray-700"}`}>{opt.label}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Required Roles (team match builder) */}
            <RequiredRolesBuilder
              roles={requiredRoles}
              onChange={setRequiredRoles}
              catalogSkills={catalogSkills}
              applicationMode={basics.application_mode}
            />

            {/* Classification */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.sap_area")}</label>
                <select value={basics.area_sap}
                  onChange={e => setBasics(p => ({ ...p, area_sap: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("case.sap_area_none")}</option>
                  {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.industry")}</label>
                <select value={basics.area_industry}
                  onChange={e => setBasics(p => ({ ...p, area_industry: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("proj.select_industry")}</option>
                  {(catalogSettings?.["catalog_industries"] ?? INDUSTRY_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Minimum trust level — admin/manager only */}
            {(auth.isAdmin || auth.isManager) && (
              <div className="mt-4 border border-gray-100 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Consultant Level</label>
                <p className="text-xs text-gray-400 mb-2">Restrict which consultants can see this case based on their trust tier.</p>
                <select
                  value={basics.min_trust_level ?? ''}
                  onChange={e => setBasics(p => ({ ...p, min_trust_level: e.target.value || null }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                  <option value="">Any level (default)</option>
                  <option value="silver">Silver and above</option>
                  <option value="gold">Gold and above</option>
                  <option value="platinum">Platinum only</option>
                </select>
              </div>
            )}
          </>
        )}
        {step === 2 && mode === "express" && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Visibility & Access</h2>
            <p className="text-sm text-gray-500 mb-5">Control who can see and apply to this case.</p>
            <div className="flex gap-2 mb-4">
              {[
                { id: 'public',      label: t('case.vis_public'),  desc: t('case.vis_pub_desc'),  active: 'border-green-500 bg-green-50 text-green-800' },
                { id: 'private',     label: t('case.vis_private'), desc: t('case.vis_priv_desc'), active: 'border-gray-600 bg-gray-700 text-white' },
                { id: 'invite-only', label: t('case.vis_invite'),  desc: t('case.vis_inv_desc'),  active: 'border-blue-500 bg-blue-50 text-blue-800' },
              ].map(opt => (
                <button key={opt.id} type="button" onClick={() => setCaseVisMode(opt.id)}
                  className={`flex-1 p-2.5 rounded-xl border-2 text-left transition-all ${caseVisMode === opt.id ? opt.active : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  <div className="text-xs font-bold mb-0.5">{opt.label}</div>
                  <div className={`text-[10px] leading-tight ${caseVisMode === opt.id ? 'opacity-80' : 'text-gray-400'}`}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { value: "both",       label: t("cs.app_everyone"),   desc: t("cs.app_everyone_desc") },
                { value: "individual", label: t("cs.app_individual"), desc: t("cs.app_individual_desc") },
                { value: "team",       label: t("cs.app_teams"),      desc: t("cs.app_teams_desc") },
              ].map(opt => {
                const sel = basics.application_mode === opt.value;
                return (
                  <button key={opt.value} type="button"
                    onClick={() => setBasics(p => ({ ...p, application_mode: opt.value }))}
                    className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${sel ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"}`}>
                    <span className={`text-xs font-semibold ${sel ? "text-indigo-700" : "text-gray-700"}`}>{opt.label}</span>
                    <span className="text-[10px] text-gray-400">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t("case.express_note")}</span>
            </div>
          </>
        )}

        {/* ── Step 3: Scope ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step2_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">
              {mode === "express" ? t("case.step2_desc_express") : t("case.step2_desc_adv")}
            </p>
            {auth.isConsultant && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client email <span className="text-gray-400 font-normal">(optional)</span></label>
                <p className="text-xs text-gray-400 mb-2">Enter the client's email to link them to this case. If they're not on the platform yet, an invitation will be sent after creation.</p>
                <input
                  type="email"
                  value={consultantClientEmail}
                  onChange={e => setConsultantClientEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {consultantClientLookup?.found && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 size={12} /> Found: <span className="font-medium">{consultantClientLookup.user.full_name}</span> — will be linked to this case
                  </div>
                )}
                {consultantClientLookup?.found === false && consultantClientEmail.length > 3 && (
                  <div className="mt-1.5 text-xs text-blue-600">New client — an invitation link will be sent after creation.</div>
                )}
              </div>
            )}
            {(auth.isAdmin || auth.isManager) && (() => {
              const selectedProject = wizardProjects.find(p => p.id === selectedProjectId);
              const projectLockedClient = selectedProject?.client_id
                ? (selectedProject.client?.client_profiles?.company_name || selectedProject.client?.full_name)
                : null;
              return projectLockedClient ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.client")}</label>
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700">
                    <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-medium">{projectLockedClient}</span>
                    <span className="text-xs text-gray-400 ml-1">— inherited from project</span>
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.client")}</label>
                  <select value={scope.client_id}
                    onChange={e => setScope(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t("label.select_client")}</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.client_profiles?.company_name || c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
            {mode === "express" ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t("case.skills_label")}</label>
                  <CatalogMultiSelect
                    options={catalogSkills}
                    selected={scope._skills}
                    onChange={val => setScope(p => ({ ...p, _skills: val }))}
                    color="blue"
                    placeholder="Search skills…"
                  />
                </div>
                <div className="mt-2 mb-1">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t("proj.work_mode")}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "remote", label: t("cs.work_remote"), desc: t("cs.work_remote_desc_exp") },
                      { value: "onsite", label: t("cs.work_onsite"), desc: t("cs.work_onsite_desc") },
                      { value: "hybrid", label: t("cs.work_hybrid"), desc: t("cs.work_hybrid_desc_exp") },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setArr(p => ({ ...p, work_mode: opt.value }))}
                        className={`text-left p-3 border-2 rounded-xl transition-all ${
                          arrangement.work_mode === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {(arrangement.work_mode === "onsite" || arrangement.work_mode === "hybrid") && (
                  <Input label={t("case.location_label")} value={arrangement.work_location}
                    onChange={e => setArr(p => ({ ...p, work_location: e.target.value }))}
                    placeholder={t("case.ph_location_eg")} />
                )}
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{t("case.express_scope_note")}</span>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t("proj.budget_label")} type="number" value={scope.budget}
                    onChange={e => setScope(p => ({ ...p, budget: e.target.value }))}
                    placeholder={t("case.ph_budget_num")} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("case.sla_label")}</label>
                    <select value={scope.sla}
                      onChange={e => {
                        const preset = SLA_PRESETS.find(p => p.value === e.target.value);
                        setScope(p => ({ ...p, sla: e.target.value, due_date: preset?.days ? daysFromNow(preset.days) : p.due_date }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {SLA_PRESETS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                    </select>
                  </div>
                </div>
                {scope.sla === "custom" ? (
                  <Input label={t("cs.custom_due_date")} type="date" value={scope.due_date}
                    onChange={e => setScope(p => ({ ...p, due_date: e.target.value }))} />
                ) : (
                  <p className="text-xs text-gray-400 -mt-1 mb-2">
                    {t("cs.calc_due_date")} <span className="font-semibold text-gray-700">{fmtDate(scope.due_date)}</span>
                  </p>
                )}
                <Input label={t("case.start_date_label")} type="date" value={scope.start_date}
                  onChange={e => setScope(p => ({ ...p, start_date: e.target.value }))} />
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t("case.skills_label")}</label>
                  <CatalogMultiSelect
                    options={catalogSkills}
                    selected={scope._skills}
                    onChange={val => setScope(p => ({ ...p, _skills: val }))}
                    color="blue"
                    placeholder="Search skills…"
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 4: Work Arrangement ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step3_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step3_desc")}</p>

            {/* Work mode — 3 option cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("case.work_mode_req")}</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "remote",  label: t("cs.work_remote"), desc: t("cs.work_remote_desc") },
                  { value: "onsite",  label: t("cs.work_onsite"), desc: t("cs.work_onsite_desc") },
                  { value: "hybrid",  label: t("cs.work_hybrid"), desc: t("cs.work_hybrid_desc") },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setArr(p => ({ ...p, work_mode: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      arrangement.work_mode === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Location — shown for onsite/hybrid */}
            {(arrangement.work_mode === "onsite" || arrangement.work_mode === "hybrid") && (
              <Input label={t("case.location_label")} value={arrangement.work_location}
                onChange={e => setArr(p => ({ ...p, work_location: e.target.value }))}
                placeholder={t("case.ph_location_eg")} />
            )}

            {/* Travel */}
            <label className="flex items-center gap-3 cursor-pointer mt-2">
              <input type="checkbox" checked={arrangement.travel_required}
                onChange={e => setArr(p => ({ ...p, travel_required: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">{t("case.travel")}</span>
              <span className="text-xs text-gray-400">{t("case.travel_desc")}</span>
            </label>
          </>
        )}

        {/* ── Step 5: Roles & People ── */}
        {step === 5 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step4_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step4_desc")}</p>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("case.key_users")}</p>
            <p className="text-xs text-gray-400 mb-3">{t("case.key_users_desc")}</p>

            {/* Added key users */}
            {keyUsers.length > 0 && (
              <div className="space-y-2 mb-3">
                {keyUsers.map(ku => (
                  <div key={ku.user_id} className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                    <UserCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{ku.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">{ku.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input value={ku.area} onChange={e => updateKuArea(ku.user_id, e.target.value)}
                        placeholder={t("label.ph_area")}
                        className="text-xs border border-violet-200 rounded-lg px-2 py-1 bg-white w-28 focus:outline-none focus:ring-1 focus:ring-violet-400" />
                      <button type="button" onClick={() => updateKuArea(ku.user_id, "All Areas")}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border transition-colors flex-shrink-0 ${ku.area === "All Areas" ? "bg-violet-600 text-white border-violet-600" : "text-violet-500 border-violet-300 hover:bg-violet-50"}`}>
                        {t("action.all")}
                      </button>
                      <button type="button" onClick={() => removeKeyUser(ku.user_id)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none ml-1">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search registered key users */}
            <div className="relative mb-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input value={kuSearch} onChange={e => searchKeyUsers(e.target.value)}
                  placeholder={t("case.ku_search_ph")}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none min-w-0" />
                {kuSearching && <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
              </div>
              {kuResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {kuResults.map(u => (
                    <button key={u.id} type="button" onClick={() => addKeyUser(u)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 text-left transition-colors border-b border-gray-50 last:border-0">
                      <UserCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{u.full_name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {kuSearch.trim() && !kuSearching && kuResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 px-4 py-3 text-sm text-gray-400">
                  No Key Users registered for this customer match "{kuSearch}"
                </div>
              )}
            </div>

            {/* Invitation email — pre-registers an email so they can sign up as key_user */}
            <Input label={t("case.invite_label")} value={roles.key_user_email}
              onChange={e => setRoles(p => ({ ...p, key_user_email: e.target.value }))}
              placeholder={t("auth.ph_key_user_email")} />

            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("case.head_hunter")}</p>
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input type="checkbox" checked={roles.is_head_hunter}
                  onChange={e => setRoles(p => ({ ...p, is_head_hunter: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm text-gray-700 font-medium">{t("case.hh_managed")}</span>
              </label>
              {roles.is_head_hunter && (
                <div className="relative mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("case.hh_name_label")}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={hhSearch}
                      onChange={e => searchHeadhunters(e.target.value)}
                      placeholder="Search by headhunter name…"
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {roles.head_hunter_id && (
                      <button type="button"
                        onClick={() => { setRoles(p => ({ ...p, head_hunter_id: null, head_hunter_name: "" })); setHhSearch(""); setHhResults([]); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {roles.head_hunter_id && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Linked to platform account
                    </p>
                  )}
                  {hhSearching && <p className="text-xs text-gray-400 mt-1">Searching…</p>}
                  {hhResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {hhResults.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => selectHeadhunter(u)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                            {u.full_name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{u.full_name}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 6: Qualifications / Requirements ── */}
        {step === 6 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step5_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step5_desc")}</p>

            {/* Min years experience */}
            <Input label={t("case.min_exp")} type="number" value={quals.min_years_experience}
              onChange={e => setQuals(p => ({ ...p, min_years_experience: e.target.value }))}
              placeholder={t("case.ph_min_exp_eg")} />

            {/* Certifications */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("case.cert_label")}</label>
              <CatalogMultiSelect
                options={catalogCerts}
                selected={quals.certifications_required}
                onChange={val => setQuals(p => ({ ...p, certifications_required: val }))}
                color="blue"
                placeholder="Search certifications…"
              />
            </div>

            {/* Languages */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("case.lang_label")}</label>
              <CatalogMultiSelect
                options={catalogLangs}
                selected={quals.languages_required}
                onChange={val => setQuals(p => ({ ...p, languages_required: val }))}
                color="green"
                placeholder="Search languages…"
              />
            </div>

            {/* Security clearance */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={quals.security_clearance}
                onChange={e => setQuals(p => ({ ...p, security_clearance: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">{t("case.security_clear")}</span>
            </label>
          </>
        )}

        {/* ── Step 7: Interview Preferences ── */}
        {step === 7 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step6_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step6_desc")}</p>

            <label className="flex items-center gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={interview.interview_required}
                onChange={e => {
                  const on = e.target.checked;
                  setIntv(p => ({
                    ...p,
                    interview_required: on,
                    rounds_config: on && !p.rounds_config.length
                      ? syncRoundsConfig(p.interview_rounds, roles.is_head_hunter, [])
                      : p.rounds_config,
                  }));
                }}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">{t("case.intv_required")}</span>
            </label>

            {interview.interview_required && (
              <>
                {/* Format */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t("case.intv_format")}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "phone",     label: t("cs.intv_phone"),    desc: t("cs.intv_phone_desc") },
                      { value: "video",     label: t("cs.intv_video"),    desc: t("cs.intv_video_desc") },
                      { value: "in_person", label: t("cs.intv_inperson"), desc: t("cs.intv_inperson_desc") },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setIntv(p => ({ ...p, interview_format: opt.value }))}
                        className={`text-left p-4 border-2 rounded-xl transition-all ${
                          interview.interview_format === opt.value
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rounds */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t("case.intv_rounds")}</p>
                  <div className="flex gap-3 mb-4">
                    {[1, 2, 3].map(n => (
                      <button key={n} type="button"
                        onClick={() => setIntv(p => ({
                          ...p,
                          interview_rounds: n,
                          rounds_config: syncRoundsConfig(n, roles.is_head_hunter, p.rounds_config),
                        }))}
                        className={`w-12 h-12 rounded-xl border-2 font-bold text-sm transition-all ${
                          interview.interview_rounds === n
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                        {n}
                      </button>
                    ))}
                  </div>

                  {/* Per-round ownership */}
                  {(() => {
                    const cfg = interview.rounds_config.length
                      ? interview.rounds_config
                      : syncRoundsConfig(interview.interview_rounds, roles.is_head_hunter, []);
                    return (
                      <div className="space-y-3">
                        {cfg.map((r, i) => (
                          <div key={i} className="border border-gray-100 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Round {r.round}</span>
                              <div className="flex gap-2">
                                <button type="button"
                                  onClick={() => setIntv(p => ({
                                    ...p,
                                    rounds_config: p.rounds_config.map((rc, ri) =>
                                      ri === i ? { ...rc, conducted_by: "headhunter", interviewer_name: "" } : rc
                                    ),
                                  }))}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                    r.conducted_by === "headhunter"
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                                  Headhunter
                                </button>
                                <button type="button"
                                  onClick={() => setIntv(p => ({
                                    ...p,
                                    rounds_config: p.rounds_config.map((rc, ri) =>
                                      ri === i ? { ...rc, conducted_by: "client_team" } : rc
                                    ),
                                  }))}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                    r.conducted_by === "client_team"
                                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                      : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                                  Client Team
                                </button>
                              </div>
                            </div>
                            {r.conducted_by === "client_team" && (
                              <input
                                type="text"
                                value={r.interviewer_name ?? ""}
                                onChange={e => setIntv(p => ({
                                  ...p,
                                  rounds_config: p.rounds_config.map((rc, ri) =>
                                    ri === i ? { ...rc, interviewer_name: e.target.value } : rc
                                  ),
                                }))}
                                placeholder="Interviewer name (optional)"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Technical assessment */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={interview.technical_assessment}
                    onChange={e => setIntv(p => ({ ...p, technical_assessment: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700 font-medium">{t("case.intv_tech")}</span>
                  <span className="text-xs text-gray-400">{t("case.intv_tech_desc")}</span>
                </label>
              </>
            )}
          </>
        )}

        {/* ── Step 8: Milestones ── */}
        {step === 8 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step7_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step7_desc")}</p>
            {milestones.length > 0 && (
              <div className="space-y-2 mb-5">
                {milestones.map((m, i) => (
                  <div key={i} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{m.title}</div>
                      {m.due_date && <div className="text-xs text-gray-400 mt-0.5">{fmtDate(m.due_date)}</div>}
                      {m.description && <div className="text-xs text-gray-400">{m.description}</div>}
                    </div>
                    <button onClick={() => setMs(p => p.filter((_, j) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-600 ml-4">{t("action.remove")}</button>
                  </div>
                ))}
              </div>
            )}
            <div className={milestones.length > 0 ? "border-t border-gray-100 pt-5" : ""}>
              {milestones.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("case.add_another")}</p>
              )}
              <Input label={t("case.ms_title")} value={mlForm.title}
                onChange={e => setMlForm(p => ({ ...p, title: e.target.value }))}
                placeholder={t("case.ph_ms_title_eg")} />
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("label.due_date")} type="date" value={mlForm.due_date}
                  onChange={e => setMlForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <Textarea label={t("case.ms_notes")} value={mlForm.description}
                onChange={e => setMlForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={addMilestone} disabled={!mlForm.title.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {t("case.add_ms")}
              </button>
            </div>
          </>
        )}

        {/* ── Step 9: Review ── */}
        {step === 9 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step8_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step8_desc")}</p>
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.rev_case_info")}</p>
                <p className="font-semibold text-gray-900 text-base">{basics.title}</p>
                {basics.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{basics.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className={PRIORITY_COLORS[basics.priority]}>{PRIORITY_LABEL_KEYS[basics.priority] ? t(PRIORITY_LABEL_KEYS[basics.priority]) : cap(basics.priority)}</Badge>
                  <Badge className={STATUS_COLORS[startConfirmed ? "confirmed" : "open"]}>{startConfirmed ? t("state.confirmed") : t("state.open")}</Badge>
                  {basics.area_sap && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{basics.area_sap}</span>}
                  {basics.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs">{basics.area_industry}</span>}
                </div>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.rev_scope")}</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {scope.start_date && (
                    <div><span className="text-gray-400">{t("label.start_date")}:</span> <span className="font-medium ml-1">{fmtDate(scope.start_date)}</span></div>
                  )}
                  {scope.budget && (
                    <div><span className="text-gray-400">{t("proj.budget_label")}:</span> <span className="font-medium ml-1">${Number(scope.budget).toLocaleString()}</span></div>
                  )}
                  {scope.due_date && (
                    <div>
                      <span className="text-gray-400">{t("label.due_colon")}</span>
                      <span className="font-medium ml-1">{fmtDate(scope.due_date)}</span>
                      {scope.sla !== "custom" && (
                        <span className="ml-1 text-xs text-blue-500">({t(SLA_PRESETS.find(p => p.value === scope.sla)?.labelKey ?? '')})</span>
                      )}
                    </div>
                  )}
                </div>
                {scope._skills && scope._skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {scope._skills.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{s}</span>
                    ))}
                  </div>
                )}
                {!scope.budget && !scope.due_date && !scope._skills && (
                  <p className="text-sm text-gray-400 italic">{t("case.no_scope_rev")}</p>
                )}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {t("case.rev_milestones")} {milestones.length > 0 ? `(${milestones.length})` : ""}
                </p>
                {milestones.length === 0
                  ? <p className="text-sm text-gray-400 italic">{t("case.no_milestones")}</p>
                  : <ul className="space-y-1.5">
                      {milestones.map((m, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />
                          <span className="font-medium">{m.title}</span>
                          {m.due_date && <span className="text-gray-400 text-xs">— {fmtDate(m.due_date)}</span>}
                        </li>
                      ))}
                    </ul>}
              </div>

              {/* Work & Requirements summary */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.rev_work_req")}</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div><span className="text-gray-400">{t("cs.rev_work_mode_lbl")}</span> <span className="font-medium ml-1 capitalize">{arrangement.work_mode}</span></div>
                  {arrangement.work_location && <div><span className="text-gray-400">{t("cs.rev_location_lbl")}</span> <span className="font-medium ml-1">{arrangement.work_location}</span></div>}
                  {arrangement.travel_required && <div className="col-span-2 text-xs text-amber-600 font-semibold">{t("cs.rev_travel")}</div>}
                  {quals.min_years_experience && <div><span className="text-gray-400">{t("cs.rev_min_exp_lbl")}</span> <span className="font-medium ml-1">{quals.min_years_experience} yrs</span></div>}
                  {quals.security_clearance && <div className="col-span-2 text-xs text-red-600 font-semibold">{t("cs.rev_clearance")}</div>}
                </div>
                {quals.certifications_required.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {quals.certifications_required.map((c, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{c}</span>)}
                  </div>
                )}
                {quals.languages_required.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {quals.languages_required.map((l, i) => <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs">{l}</span>)}
                  </div>
                )}
              </div>

              {/* Interview summary */}
              {interview.interview_required && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("case.rev_interview")}</p>
                  <div className="text-sm flex flex-wrap gap-3">
                    <span className="capitalize">{interview.interview_format?.replace("_", " ")}</span>
                    <span>· {interview.interview_rounds} {interview.interview_rounds > 1 ? t("cs.rev_rounds_pl") : t("cs.rev_rounds")}</span>
                    {interview.technical_assessment && <span>· {t("cs.rev_tech_assess")}</span>}
                  </div>
                </div>
              )}

              {/* Visibility & access summary */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Visibility & Access</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {caseVisMode === "public"      && <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold">🌐 Public</span>}
                  {caseVisMode === "private"     && <span className="px-2.5 py-1 bg-gray-700 text-white rounded-lg text-xs font-semibold">🔒 Private</span>}
                  {caseVisMode === "invite-only" && <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold">✉️ Invite only</span>}
                  {basics.application_mode === "team"       && <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold">🤝 Teams only</span>}
                  {basics.application_mode === "individual" && <span className="px-2.5 py-1 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs font-semibold">🧑 Individual only</span>}
                  {(basics.application_mode === "both" || !basics.application_mode) && <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold">👥 Teams & Individual</span>}
                  {basics.is_confidential && <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">🔐 Confidential</span>}
                  {basics.nda_required   && <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">📋 NDA required</span>}
                  {basics.min_trust_level && <span className="px-2.5 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-semibold capitalize">⭐ {basics.min_trust_level}+</span>}
                </div>
                {requiredRoles.filter(r => r.label.trim()).length > 0 && (
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Required roles ({requiredRoles.filter(r => r.label.trim()).length})</p>
                    {requiredRoles.filter(r => r.label.trim()).map((role, i) => (
                      <div key={role.id} className="flex items-start gap-2 text-sm">
                        <span className="text-xs font-bold text-indigo-400 w-5 flex-shrink-0 mt-0.5">#{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900">{role.label}</span>
                          {role.seniority && role.seniority !== "Any" && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">{role.seniority}</span>}
                          {role.time_pct && <span className="ml-1 text-xs text-gray-400">{role.time_pct}%</span>}
                          {role.required_skills?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {role.required_skills.map(s => (
                                <span key={s} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded text-[10px] font-medium">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
            {/* Create as Confirmed — shown to any role with confirmed-stage permission */}
            {canConfirmOnCreate && !isEdit && (
              <label className="flex items-center gap-3 cursor-pointer p-4 border-2 border-blue-100 bg-blue-50 rounded-xl mt-4">
                <input type="checkbox" checked={startConfirmed} onChange={e => setStartConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <div>
                  <span className="text-sm font-semibold text-blue-800">{t("case.confirm_title")}</span>
                  <p className="text-xs text-blue-600 mt-0.5">{t("case.confirm_desc")}</p>
                </div>
              </label>
            )}
            {/* Save as Template */}
            {!isEdit && (
              <div className="mt-4 border-2 border-gray-100 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={saveAsTemplate}
                    onChange={e => { setSaveAsTemplate(e.target.checked); if (e.target.checked && !templateName) setTemplateName(basics.title); }}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-800">{t("template.save_as")}</span>
                  </div>
                </label>
                {saveAsTemplate && (
                  <div className="mt-3 ml-7">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("template.name")} *</label>
                    <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={t("template.name")} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 flex items-center justify-between mt-4">
        <button onClick={prevStep}
          className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
          {step === 0 ? <><X size={13} className="mr-1 inline" />{t("action.cancel")}</> : `← ${t("action.back")}`}
        </button>
        <div className="flex items-center gap-3">
          {step === 8 && mode !== "express" && (
            <button onClick={nextStep} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">
              {t("action.skip")}
            </button>
          )}
          {!isLast ? (
            <button onClick={nextStep}
              disabled={step === 1 && !basics.title.trim()}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
              {t("action.continue")}
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating}
              className={`px-7 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md ${startConfirmed ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}>
              {creating
                ? (isEdit ? t("state.saving") : t("state.creating"))
                : isEdit ? <><Check size={13} className="mr-1 inline" />{t("action.save_changes")}</>
                : startConfirmed ? <><Check size={13} className="mr-1 inline" />{t("case.create_confirmed")}</>
                : <><Check size={13} className="mr-1 inline" />{t("case.create_case")}</>}
            </button>
          )}
        </div>
      </div>
      </>}
    </div>
    {showTemplatePicker && (
      <CaseTemplatePickerModal
        onClose={() => setShowTemplatePicker(false)}
        onSelect={tpl => {
          const td = tpl.template_data ?? {};
          if (td.title) setBasics(p => ({ ...p, title: td.title, description: td.description ?? p.description, priority: td.priority ?? p.priority, area_sap: td.area_sap ?? p.area_sap, area_industry: td.area_industry ?? p.area_industry, min_trust_level: td.min_trust_level ?? p.min_trust_level }));
          if (td.budget || td.start_date || td.due_date || td.skills_required) setScope(p => ({ ...p, budget: td.budget ?? p.budget, start_date: td.start_date ?? p.start_date, due_date: td.due_date ?? p.due_date, _skills: td.skills_required ? td.skills_required.join(", ") : p._skills }));
          if (td.work_mode) setArr(p => ({ ...p, work_mode: td.work_mode, work_location: td.work_location ?? p.work_location }));
          supabase.from("case_templates").update({ use_count: (tpl.use_count ?? 0) + 1 }).eq("id", tpl.id).then(() => {});
          setShowTemplatePicker(false);
        }}
      />
    )}
    </>
  );
}

export { daysFromNow, SLA_PRESETS, EXPRESS_STEP_IDS, CatalogMultiSelect, CreateCaseWizard };
