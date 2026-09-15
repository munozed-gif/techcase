import { useState, useEffect } from "react";
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

const EXPRESS_STEP_IDS = [0, 1, 2, 4, 8];

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
    { id: "project",        label: t("cs.step_project"),   Icon: Layers,         desc: "Link to a project" },
    { id: "basics",         label: t("cs.step_basics"),    Icon: FileText,       desc: "Title & description" },
    { id: "scope",          label: t("cs.step_scope"),     Icon: DollarSign,     desc: "Budget, dates & skills" },
    { id: "arrangement",    label: t("cs.step_work"),      Icon: MapPin,         desc: "Remote, on-site or hybrid" },
    { id: "roles",          label: t("cs.step_roles"),     Icon: UsersRound,     desc: "Key user & head hunters" },
    { id: "qualifications", label: t("cs.step_reqs"),      Icon: GraduationCap,  desc: "Certifications & languages" },
    { id: "interview",      label: t("cs.step_interview"), Icon: MessageSquare,  desc: "Evaluation preferences" },
    { id: "milestones",     label: t("cs.step_milestones"),Icon: Flag,           desc: "Key deliverables" },
    { id: "review",         label: t("cs.step_review"),    Icon: CheckCircle2,   desc: "Confirm & create" },
  ];
  const EXPRESS_CASE_STEPS = CREATE_CASE_STEPS.filter((_, i) => EXPRESS_STEP_IDS.includes(i));
  const [mode, setMode]     = useState(isEdit ? "advanced" : null);
  const [step, setSt]       = useState(initialProjectId ? 1 : 0);
  const [creating, setCreating] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [wizardProjects, setWizardProjects]         = useState([]);

  const _visCfg = useVisibilitySettings();
  const [basics, setBasics] = useState({ title: initialData?.title ?? "", description: initialData?.description ?? "", priority: initialData?.priority ?? "medium", area_sap: initialData?.area_sap ?? "", area_industry: initialData?.area_industry ?? "", is_confidential: initialData?.is_confidential ?? false, nda_required: initialData?.nda_required ?? false, min_trust_level: initialData?.min_trust_level ?? null, application_mode: initialData?.application_mode ?? "both" });
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
  const [roles, setRoles] = useState({ key_user_email: initialData?.key_user_email ?? "", is_head_hunter: initialData?.is_head_hunter ?? false, head_hunter_name: initialData?.head_hunter_name ?? "" });
  const [keyUsers, setKeyUsers]     = useState([]);   // { user_id, full_name, email, area }
  const [kuSearch, setKuSearch]     = useState("");
  const [kuResults, setKuResults]   = useState([]);
  const [kuSearching, setKuSearching] = useState(false);

  // Step 5: Qualifications
  const [quals, setQuals] = useState({ certifications_required: initialData?.certifications_required ?? [], min_years_experience: initialData?.min_years_experience ?? "", languages_required: initialData?.languages_required ?? [], security_clearance: initialData?.security_clearance ?? false });

  // Step 6: Interview
  const [interview, setIntv] = useState({ interview_required: initialData?.interview_required ?? false, interview_format: initialData?.interview_format ?? "video", interview_rounds: initialData?.interview_rounds ?? 1, technical_assessment: initialData?.technical_assessment ?? false });
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
    let q = supabase.from("projects").select("id, name, status, area_sap, case_lifecycle, client_id, client:client_id(full_name, client_profiles(company_name))").eq("status", "active").order("name");
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
      setSt(s => s + 1);
    }
  }
  function prevStep() {
    if (mode === "express") {
      if (expressIdx === 0) { onCancel(); return; }
      setSt(EXPRESS_STEP_IDS[expressIdx - 1]);
    } else {
      if (step === 0) { onCancel(); return; }
      setSt(s => s - 1);
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
        ...interview,
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
                  placeholder={t("case.ph_requirements")} />
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Who can apply?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "both",       label: "Everyone",     desc: "Individual or team" },
                      { value: "individual", label: "Individual",   desc: "Single consultants only" },
                      { value: "team",       label: "Teams only",   desc: "Requires a team" },
                    ].map(opt => {
                      const sel = basics.application_mode === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setBasics(p => ({ ...p, application_mode: opt.value }))}
                          className={`flex flex-col p-3 rounded-xl border text-left transition-all ${sel ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50"}`}>
                          <span className={`text-xs font-semibold ${sel ? "text-indigo-700" : "text-gray-700"}`}>{opt.label}</span>
                          <span className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                <div className="border-t border-gray-100 pt-4 mt-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("case.visibility")}</p>
                  <div className="flex gap-2 mb-3">
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
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={basics.nda_required}
                      onChange={e => setBasics(p => ({ ...p, nda_required: e.target.checked }))}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700 font-medium">{t("case.nda")}</span>
                    <span className="text-xs text-gray-400">{t("case.nda_desc")}</span>
                  </label>
                </div>
                {(auth.isAdmin || auth.isManager) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Consultant Level
                    </label>
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
          </>
        )}

        {/* ── Step 2: Scope ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step2_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">
              {mode === "express" ? t("case.step2_desc_express") : t("case.step2_desc_adv")}
            </p>
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

        {/* ── Step 3: Work Arrangement ── */}
        {step === 3 && (
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

        {/* ── Step 4: Roles & People ── */}
        {step === 4 && (
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
                <Input label={t("case.hh_name_label")} value={roles.head_hunter_name}
                  onChange={e => setRoles(p => ({ ...p, head_hunter_name: e.target.value }))}
                  placeholder={t("case.ph_agency_eg")} />
              )}
            </div>
          </>
        )}

        {/* ── Step 5: Qualifications / Requirements ── */}
        {step === 5 && (
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

        {/* ── Step 6: Interview Preferences ── */}
        {step === 6 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("case.step6_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("case.step6_desc")}</p>

            <label className="flex items-center gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={interview.interview_required}
                onChange={e => setIntv(p => ({ ...p, interview_required: e.target.checked }))}
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
                  <div className="flex gap-3">
                    {[1, 2, 3].map(n => (
                      <button key={n} type="button"
                        onClick={() => setIntv(p => ({ ...p, interview_rounds: n }))}
                        className={`w-12 h-12 rounded-xl border-2 font-bold text-sm transition-all ${
                          interview.interview_rounds === n
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
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

        {/* ── Step 7: Milestones ── */}
        {step === 7 && (
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

        {/* ── Step 8: Review ── */}
        {step === 8 && (
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
          {step === 7 && mode !== "express" && (
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
