import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Activity, AlertCircle, AlertTriangle, Archive, BarChart2, Building2,
  Calendar, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Code2, Copy,
  Database, DollarSign, Download, FileEdit, FileText, FolderOpen, Layers, Link2,
  LayoutTemplate, Loader2, Lock, Pause, PauseCircle, Play, Plus, Search,
  Shield, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, Truck, Upload,
  UserCheck, Users, X, XCircle, Zap,
  ArrowRightLeft, BarChart, BookOpen, Briefcase, Bug, ClipboardList,
  Cpu, FlaskConical, GitBranch, Globe, GraduationCap, KeyRound,
  MonitorCheck, Network, Settings, ShieldCheck, Wrench,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useProjects, useProjectDbConnections, useProjectTemplates } from "../hooks/useCoreHooks.js";
import { useCases } from "../hooks/useCaseHooks.js";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { usePlanConfig, useSystemSettings, usePermissions, useWizardMode } from "../hooks/useSystemSettings.jsx";
import { callClaude, logEvent } from "../lib/utils.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { EmptyState, Input, Textarea } from "../components/ui.jsx";
import { CatalogMultiSelect } from "../components/CreateCaseWizard.jsx";
import { OnboardingRoadmap } from "./OnboardingViews.jsx";
import { CaseDetail } from "./CaseDetail.jsx";
import { getStageIcon } from "../components/CaseSubPanels.jsx";
import { SapProfileBadges, SapProfileFields, VpnProfileFields, VpnProfileBadges } from "./OperationsViews.jsx";
import { ProjectSapEnvPanel, ProjectOwnSapPanel } from "../components/SapPanels.jsx";
import { TransportTab } from "../components/TransportTab.jsx";
import { ApplyTemplateModal, SaveTemplateModal, BUILT_IN_PROJECT_TEMPLATES } from "./CaseTemplates.jsx";
import {
  LIFECYCLE_PRESETS, SAP_AREAS, INDUSTRY_AREAS, ROLE_COLORS, PROJECT_TYPES,
  PRIORITY_COLORS, STATUS_COLORS, GATE_CONDITIONS,
} from "../lib/businessConstants.js";
import { STATUS_LABEL_KEYS, PRIORITY_LABEL_KEYS, WORK_MODE_LABEL_KEYS, fmt, cap, fmtDate } from "../lib/uiUtils.jsx";

const SKILL_ICON_MAP = {
  "ABAP Development":          { Icon: Code2,         color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-900/30",    border: "border-blue-100 dark:border-blue-800" },
  "SAP Basis Administration":  { Icon: Cpu,           color: "text-slate-600 dark:text-slate-300",  bg: "bg-slate-50 dark:bg-slate-800/60",  border: "border-slate-200 dark:border-slate-700" },
  "SAP FICO Configuration":    { Icon: DollarSign,    color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-900/30",  border: "border-green-100 dark:border-green-800" },
  "SAP MM Configuration":      { Icon: Truck,         color: "text-orange-600 dark:text-orange-400",bg: "bg-orange-50 dark:bg-orange-900/30",border: "border-orange-100 dark:border-orange-800" },
  "SAP SD Configuration":      { Icon: Briefcase,     color: "text-violet-600 dark:text-violet-400",bg: "bg-violet-50 dark:bg-violet-900/30",border: "border-violet-100 dark:border-violet-800" },
  "SAP HCM":                   { Icon: Users,         color: "text-pink-600 dark:text-pink-400",    bg: "bg-pink-50 dark:bg-pink-900/30",    border: "border-pink-100 dark:border-pink-800" },
  "SAP Fiori / UI5":           { Icon: MonitorCheck,  color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-50 dark:bg-cyan-900/30",    border: "border-cyan-100 dark:border-cyan-800" },
  "SAP BW / Analytics":        { Icon: BarChart,      color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-900/30",  border: "border-amber-100 dark:border-amber-800" },
  "SAP Integration (CPI/PI)":  { Icon: Network,       color: "text-indigo-600 dark:text-indigo-400",bg: "bg-indigo-50 dark:bg-indigo-900/30",border: "border-indigo-100 dark:border-indigo-800" },
  "S/4HANA Migration":         { Icon: ArrowRightLeft,color: "text-teal-600 dark:text-teal-400",    bg: "bg-teal-50 dark:bg-teal-900/30",    border: "border-teal-100 dark:border-teal-800" },
  "SAP GRC":                   { Icon: ShieldCheck,   color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-900/30",      border: "border-red-100 dark:border-red-800" },
  "SAP PM / QM":               { Icon: Wrench,        color: "text-yellow-600 dark:text-yellow-400",bg: "bg-yellow-50 dark:bg-yellow-900/30",border: "border-yellow-100 dark:border-yellow-800" },
  "HANA DB Administration":    { Icon: Database,      color: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-50 dark:bg-blue-900/30",    border: "border-blue-100 dark:border-blue-800" },
  "SAP Security / Roles":      { Icon: KeyRound,      color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-50 dark:bg-rose-900/30",    border: "border-rose-100 dark:border-rose-800" },
  "SAP PS (Project Systems)":  { Icon: ClipboardList, color: "text-purple-600 dark:text-purple-400",bg: "bg-purple-50 dark:bg-purple-900/30",border: "border-purple-100 dark:border-purple-800" },
};

const PROJECT_STATUS_COLORS = {
  draft:     "bg-gray-100 text-gray-600",
  active:    "bg-green-100 text-green-700",
  on_hold:   "bg-yellow-100 text-yellow-700",
  completed: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
};

const PROJECT_LIFECYCLE_STAGES = [
  { key: "draft",     labelKey: "status.draft",     label: "Draft",     color: "#6B7280", is_terminal: false },
  { key: "active",    labelKey: "status.active",    label: "Active",    color: "#2563EB", is_terminal: false },
  { key: "on_hold",   labelKey: "status.on_hold",   label: "On Hold",   color: "#D97706", is_terminal: false },
  { key: "completed", labelKey: "status.completed", label: "Completed", color: "#059669", is_terminal: true  },
  { key: "cancelled", labelKey: "status.cancelled", label: "Cancelled", color: "#DC2626", is_terminal: true  },
];

const PROJECT_NEXT_META = {
  draft:     { Icon: FileText,    desc: "Move back to draft for rework" },
  active:    { Icon: Play,        desc: "Activate and begin work on this project" },
  on_hold:   { Icon: PauseCircle, desc: "Pause the project temporarily" },
  completed: { Icon: Archive,     desc: "Mark this project as successfully completed" },
  cancelled: { Icon: X,          desc: "Cancel and close this project" },
};

const EXPRESS_PROJECT_STEP_IDS = [1, 2, 7]; // basics, scope, review

function CreateProjectWizard({ auth, createProject, onSave, onComplete, onCancel, clients = [], initialData = null, defaultMode = null }) {
  const { t } = useT();
  const { settings: catalogSettings } = useSystemSettings();
  const planCfg = usePlanConfig();
  const clientLimits = planCfg.getPlanLimits(auth.billingUserId, 'client', auth.profile?.role);
  const SKILL_DEFAULTS = ["ABAP Development", "SAP Basis Administration", "SAP FICO Configuration", "SAP MM Configuration", "SAP SD Configuration", "SAP HCM", "SAP Fiori / UI5", "SAP BW / Analytics", "SAP Integration (CPI/PI)", "S/4HANA Migration", "SAP GRC", "SAP PM / QM", "HANA DB Administration", "SAP Security / Roles", "SAP PS (Project Systems)"];
  const DELIVERABLE_DEFAULTS = ["Business Blueprint", "Functional Specification", "Technical Specification", "Configuration Document", "Data Migration Plan", "Test Scripts", "UAT Report", "Training Material", "Go-Live Checklist", "Cutover Plan", "Gap Analysis", "Integration Test Report", "Migration Report", "Process Flow Diagram", "Project Charter", "System Documentation", "Change Management Plan", "Hypercare Plan", "Project Status Report", "SLA Agreement"];
  const catalogSkills        = catalogSettings["catalog_skills"]        ?? SKILL_DEFAULTS;
  const catalogDeliverables  = catalogSettings["catalog_deliverables"]  ?? DELIVERABLE_DEFAULTS;
  const catalogProjectTypes  = catalogSettings["catalog_project_types"] ?? PROJECT_TYPES.map(p => p.value);
  const activeProjectTypes   = PROJECT_TYPES.filter(p => catalogProjectTypes.includes(p.value));
  const isEdit = !!initialData;
  const { templates: customTemplates } = useProjectTemplates();
  const ALL_TEMPLATES = [...BUILT_IN_PROJECT_TEMPLATES, ...customTemplates];
  const ALL_PROJECT_STEPS = [
    { id: "template",     label: "Template",                 Icon: LayoutTemplate,    desc: "Start from a pre-built template or skip" },
    { id: "basics",       label: t("proj.rev_basics"),      Icon: FileText,          desc: t("proj.step_basics_desc") },
    { id: "scope",        label: t("proj.rev_scope"),        Icon: DollarSign,        desc: t("proj.step_scope_desc") },
    { id: "objectives",   label: t("proj.rev_objectives"),   Icon: Target,            desc: t("proj.step_objectives_desc") },
    { id: "team",         label: t("proj.rev_team"),         Icon: Users,             desc: t("proj.step_team_desc") },
    { id: "requirements", label: t("proj.rev_requirements"), Icon: SlidersHorizontal, desc: t("proj.step_reqs_desc") },
    { id: "import_plan",  label: "Import Plan",              Icon: Upload,            desc: "Auto-create cases from a document" },
    { id: "review",       label: t("apply.step3_label"),     Icon: CheckCircle2,      desc: t("proj.step_review_desc") },
  ];
  const PROJECT_STEPS = isEdit ? ALL_PROJECT_STEPS.filter(s => s.id !== 'import_plan' && s.id !== 'template') : ALL_PROJECT_STEPS;
  const EXPRESS_PROJECT_STEPS = ALL_PROJECT_STEPS.filter((_, i) => EXPRESS_PROJECT_STEP_IDS.includes(i));
  const [mode, setMode] = useState(isEdit ? "advanced" : (defaultMode ?? null));
  const [step, setSt] = useState(() => {
    if (isEdit) return 0;
    if ((defaultMode ?? null) === "express") return EXPRESS_PROJECT_STEP_IDS[0];
    return 0;
  });
  const [creating, setCreating] = useState(false);

  function selectMode(m) {
    setMode(m);
    setSt(m === "express" ? EXPRESS_PROJECT_STEP_IDS[0] : 0);
  }

  // Step 0: Basics
  const [basics, setBasics] = useState({ name: initialData?.name ?? "", description: initialData?.description ?? "", status: initialData?.status ?? "draft", project_type: initialData?.project_type ?? "consulting" });
  // Step 1: Scope
  const [scopeData, setScopeData] = useState({ total_budget: initialData?.total_budget ?? "", start_date: initialData?.start_date ?? "", end_date: initialData?.end_date ?? "", area_sap: initialData?.area_sap ?? "", industry: initialData?.industry ?? "", client_id: auth.isClient ? auth.user?.id : (initialData?.client_id ?? "") });
  // Step 2: Objectives
  const [objectives, setObj] = useState({ objectives: initialData?.objectives ?? "", deliverables: initialData?.deliverables ?? [], success_criteria: initialData?.success_criteria ?? "", out_of_scope: initialData?.out_of_scope ?? "" });
  // Step 3: Team
  const [team, setTeam] = useState({ stakeholder_name: initialData?.stakeholder_name ?? "", stakeholder_email: initialData?.stakeholder_email ?? "", billing_contact_name: initialData?.billing_contact_name ?? "", billing_contact_email: initialData?.billing_contact_email ?? "", expected_consultants: initialData?.expected_consultants ?? "" });
  // Step 4: Requirements
  const [reqs, setReqs] = useState({ skills_required: initialData?.skills_required ?? [], work_mode: initialData?.work_mode ?? "remote", compliance_notes: initialData?.compliance_notes ?? "", priority: initialData?.priority ?? "medium" });
  // Step: Template
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateCases, setTemplateCases]       = useState([]);
  const [tplCat, setTplCat]                     = useState('All');
  // Step 5: Import Plan (now step 6)
  const [planFile, setPlanFile]             = useState(null);
  const [extracting, setExtracting]         = useState(false);
  const [extractedCases, setExtractedCases] = useState(null);
  const [extractError, setExtractError]     = useState(null);
  const [caseMode, setCaseMode]             = useState("express");

  const expressIdx = EXPRESS_PROJECT_STEP_IDS.indexOf(step);
  const isLast = mode === "express"
    ? step === EXPRESS_PROJECT_STEP_IDS[EXPRESS_PROJECT_STEP_IDS.length - 1]
    : step === PROJECT_STEPS.length - 1;
  const stepId = ALL_PROJECT_STEPS[step]?.id ?? '';
  const [stepError, setStepError]   = useState(null);
  const [skipPending, setSkipPending] = useState(false);
  const [createError, setCreateError] = useState(null);
  useEffect(() => { setStepError(null); setSkipPending(false); setCreateError(null); }, [step]);

  function validateStep() {
    if (stepId === 'basics' && !basics.name.trim())
      return "Project name is required — please enter a name before continuing.";
    if (stepId === 'scope' && (auth.isAdmin || auth.isManager) && !scopeData.client_id)
      return "Please select a client before continuing.";
    return null;
  }
  function handleContinue() {
    const err = validateStep();
    if (err) { setStepError(err); return; }
    setStepError(null);
    if (mode === "express") {
      const next = EXPRESS_PROJECT_STEP_IDS[expressIdx + 1];
      if (next !== undefined) setSt(next);
    } else {
      setSt(s => s + 1);
    }
  }
  function handleBack() {
    if (mode === "express") {
      if (expressIdx === 0) { onCancel(); return; }
      setSt(EXPRESS_PROJECT_STEP_IDS[expressIdx - 1]);
    } else {
      if (step === 0) { onCancel(); return; }
      setSt(s => s - 1);
    }
  }
  function handleSkip() {
    if (!skipPending) {
      setSkipPending(true);
      setStepError(
        stepId === 'template'   ? "Starting from a blank project — you can apply a template later from the project detail." :
        stepId === 'objectives' ? "You're skipping Objectives — goals, deliverables, and success criteria can be added later from the project detail." :
        stepId === 'team'       ? "You're skipping Team Contacts — stakeholder and billing info can be completed later." :
                                  "You're skipping this step — it can be filled in later from the project detail."
      );
      return;
    }
    setStepError(null);
    setSkipPending(false);
    setSt(s => s + 1);
  }

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      const payload = {
        ...basics,
        ...scopeData,
        client_id: auth.isClient ? auth.user?.id : (scopeData.client_id || null),
        total_budget: scopeData.total_budget ? Number(scopeData.total_budget) : null,
        start_date: scopeData.start_date || null,
        end_date: scopeData.end_date || null,
        area_sap: scopeData.area_sap || null,
        industry: scopeData.industry || null,
        objectives: objectives.objectives || null,
        deliverables: objectives.deliverables.length ? objectives.deliverables : null,
        success_criteria: objectives.success_criteria || null,
        out_of_scope: objectives.out_of_scope || null,
        ...team,
        expected_consultants: team.expected_consultants ? parseInt(team.expected_consultants, 10) : null,
        ...reqs,
        skills_required: reqs.skills_required.length ? reqs.skills_required : null,
      };
      if (isEdit) {
        await onSave(payload);
        onComplete(null, 0);
      } else {
        const newProject = await createProject({ ...payload, created_by: auth.user?.id });
        if (!newProject?.id) throw new Error("Project was saved but its ID could not be confirmed — cases were not imported. Open the project and add cases manually.");
        const clientId = auth.isClient ? auth.user?.id : (scopeData.client_id || null);
        const allCases = [
          ...templateCases.map(item => ({
            title:           item.title,
            description:     item.description || null,
            priority:        ['low','medium','high','critical','urgent'].includes(item.priority) ? (item.priority === 'critical' ? 'high' : item.priority) : 'medium',
            area_sap:        item.area_sap || null,
            estimated_hours: item.est_hours ? Number(item.est_hours) : null,
            project_id:      newProject.id,
            client_id:       clientId,
            status:          'open',
            created_by:      auth.user?.id,
          })),
          ...(extractedCases ?? []).map(c => ({
            title:           String(c.title ?? 'Untitled case'),
            description:     c.description || null,
            priority:        ['low','medium','high','urgent'].includes(c.priority) ? c.priority : 'medium',
            area_sap:        c.area_sap || null,
            skills_required: c.skills?.length ? c.skills : null,
            estimated_hours: c.est_hours ? Number(c.est_hours) : null,
            project_id:      newProject.id,
            client_id:       clientId,
            status:          'open',
            created_by:      auth.user?.id,
          })),
        ];
        if (allCases.length > 0) {
          const { data: inserted, error: casesError } = await supabase
            .from('cases')
            .insert(allCases)
            .select('id');
          if (casesError) throw new Error(`Project created, but cases failed: ${casesError.message}`);
          if (!inserted?.length) throw new Error(`Project created, but 0 cases were linked — try adding cases manually from the project.`);

          // Insert case_activities for template cases that carry activities
          const activitiesToInsert = [];
          templateCases.forEach((item, idx) => {
            if (!item.activities?.length) return;
            const caseId = inserted[idx]?.id;
            if (!caseId) return;
            item.activities.forEach(act => {
              activitiesToInsert.push({
                case_id:       caseId,
                title:         act.title,
                description:   act.description || null,
                est_hours:     act.est_hours ? Number(act.est_hours) : null,
                sort_order:    act.sort_order ?? 1,
                task_no:       act.sort_order ?? 1,
                phase:         act.phase || null,
                activity_type: 'task',
                status:        'pending',
                progress_pct:  0,
              });
            });
          });
          if (activitiesToInsert.length > 0) {
            const { error: actErr } = await supabase.from('case_activities').insert(activitiesToInsert);
            if (actErr) console.warn('Activities insert warning:', actErr.message);
          }

          onComplete(newProject, inserted.length);
        } else {
          onComplete(newProject, 0);
        }
      }
    } catch (e) { setCreateError(e.message || "Failed to create project. Please try again."); }
    setCreating(false);
  }

  async function handleExtract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const isPdf = planFile.name.toLowerCase().endsWith('.pdf');
      const systemPrompt = `You are an expert SAP project analyst. Extract all tasks or cases from the provided project plan document.
Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Use this structure for each item:
{"title":"...","description":"...","priority":"medium","area_sap":"","skills":[],"est_hours":null}
Priority must be one of: low, medium, high, urgent. est_hours is a number or null. If no tasks found, return [].`;
      let messages;
      if (isPdf) {
        const buf = await planFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        messages = [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
            { type: "text", text: "Extract all tasks/cases from this project plan. Return JSON array only." }
          ]
        }];
      } else {
        const text = await planFile.text();
        messages = [{ role: "user", content: `Project plan document:\n\n${text.slice(0, 30000)}\n\nExtract all tasks/cases. Return JSON array only.` }];
      }
      const raw = await callClaude({ system: systemPrompt, messages, max_tokens: 4096 });
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No structured data found. Try a text or PDF file with a clear task list.");
      const cases = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(cases) || cases.length === 0) throw new Error("No cases found in the document.");
      setExtractedCases(cases.map(c => ({
        title:       String(c.title ?? "Untitled case"),
        description: String(c.description ?? ""),
        priority:    ['low','medium','high','urgent'].includes(c.priority) ? c.priority : 'medium',
        area_sap:    c.area_sap ?? "",
        skills:      Array.isArray(c.skills) ? c.skills : [],
        est_hours:   c.est_hours ? Number(c.est_hours) : null,
      })));
    } catch (e) {
      setExtractError(e.message);
    }
    setExtracting(false);
  }

  function updateExtractedCase(idx, field, value) {
    setExtractedCases(p => p.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? t("proj.edit_title") : t("proj.new_title")}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {!isEdit && mode === null ? t("case.mode_null_sub") : isEdit ? t("proj.edit_subtitle") : mode === "express" ? t("proj.mode_express_sub") : t("proj.new_subtitle")}
          </p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          <X size={13} className="mr-1 inline" />{t("action.cancel")}
        </button>
      </div>

      {/* ── Mode selection ── */}
      {mode === null && !isEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t("proj.choose_mode")}</h2>
          <p className="text-sm text-gray-400 text-center mb-8">{t("case.edit_after")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button onClick={() => selectMode("express")}
              className="group text-left border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mb-4 transition-colors">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">{t("cs.mode_express")}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{t("proj.mode_express_sub")} <span className="font-medium text-blue-600">3 {t("proj.steps")}.</span></div>
            </button>
            <button onClick={() => selectMode("advanced")}
              className="group text-left border-2 border-gray-200 hover:border-[#1A4B8C] hover:bg-blue-50/50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-[#1A4B8C]/10 flex items-center justify-center mb-4 transition-colors">
                <SlidersHorizontal className="w-6 h-6 text-gray-600 group-hover:text-[#1A4B8C]" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">{t("cs.mode_advanced")}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{t("proj.mode_adv_sub")} <span className="font-medium text-gray-700">8 {t("proj.steps")}.</span></div>
            </button>
          </div>
        </div>
      )}

      {(mode !== null || isEdit) && <>
      <OnboardingRoadmap steps={mode === "express" ? EXPRESS_PROJECT_STEPS : PROJECT_STEPS} current={mode === "express" ? expressIdx : (isEdit ? step : step)} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step: Template ── */}
        {stepId === 'template' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Start from a Template</h2>
            <p className="text-sm text-gray-500 mb-4">Pick a template to pre-populate cases, or skip to start blank.</p>
            {/* Category chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['All', ...Array.from(new Set(ALL_TEMPLATES.map(tmpl => tmpl.category).filter(Boolean)))].map(cat => (
                <button key={cat} type="button"
                  onClick={() => setTplCat(cat)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                    tplCat === cat
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                  }`}>{cat}</button>
              ))}
            </div>
            {/* Template grid */}
            <div className="grid gap-3">
              {ALL_TEMPLATES.filter(tmpl => tplCat === 'All' || tmpl.category === tplCat).map(tmpl => {
                const isSelected = selectedTemplate?.id === tmpl.id;
                return (
                  <button key={tmpl.id} type="button"
                    onClick={() => {
                      if (isSelected) { setSelectedTemplate(null); setTemplateCases([]); }
                      else            { setSelectedTemplate(tmpl); setTemplateCases(tmpl.items ?? []); }
                    }}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-gray-900">{tmpl.name}</span>
                          {tmpl.category && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 rounded-full shrink-0">{tmpl.category}</span>
                          )}
                        </div>
                        {tmpl.description && (
                          <p className="text-xs text-gray-500 leading-snug line-clamp-2">{tmpl.description}</p>
                        )}
                        {tmpl.items?.length > 0 && (
                          <p className="text-xs text-blue-500 mt-1.5 font-medium">
                            {tmpl.items.length} phase{tmpl.items.length !== 1 ? 's' : ''}
                            {tmpl.items.some(i => i.activities?.length) && (
                              <span className="text-gray-400 ml-1">
                                · {tmpl.items.reduce((s, i) => s + (i.activities?.length ?? 0), 0)} activities
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-blue-500 shrink-0 mt-0.5" />}
                    </div>
                    {isSelected && tmpl.items?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-100 space-y-1">
                        {tmpl.items.slice(0, 4).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-blue-800">
                            <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center font-bold text-[9px] shrink-0">{idx + 1}</span>
                            <span className="truncate">{item.title}</span>
                            {item.activities?.length > 0 && (
                              <span className="text-blue-300 shrink-0">{item.activities.length} act.</span>
                            )}
                            {item.est_hours && <span className="ml-auto text-blue-400 shrink-0">{item.est_hours}h</span>}
                          </div>
                        ))}
                        {tmpl.items.length > 4 && (
                          <p className="text-[10px] text-blue-400 pl-6">+ {tmpl.items.length - 4} more…</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedTemplate && (
              <button type="button"
                onClick={() => { setSelectedTemplate(null); setTemplateCases([]); }}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline">
                Clear selection
              </button>
            )}
          </>
        )}

        {/* ── Step: Basics ── */}
        {stepId === 'basics' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step0_h2") || "Project Basics"}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step0_desc")}</p>
            <Input label={t("proj.name_label")} value={basics.name}
              onChange={e => setBasics(p => ({ ...p, name: e.target.value }))}
              placeholder={t("proj.ph_title_eg")} />
            <Textarea label={t("label.description")} value={basics.description}
              onChange={e => setBasics(p => ({ ...p, description: e.target.value }))}
              placeholder={t("proj.ph_objectives")} />

            {/* Status cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("label.status")}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "draft",  label: t("proj.status_draft"),  desc: t("proj.status_draft_desc") },
                  { value: "active", label: t("proj.status_active"), desc: t("proj.status_active_desc") },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setBasics(p => ({ ...p, status: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      basics.status === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("label.priority")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "low",      label: t("priority.low"),      cls: "border-slate-300 bg-slate-50 text-slate-700",    sel: "border-slate-500 bg-slate-100 text-slate-800" },
                  { value: "medium",   label: t("priority.medium"),   cls: "border-yellow-300 bg-yellow-50 text-yellow-700", sel: "border-yellow-500 bg-yellow-100 text-yellow-800" },
                  { value: "high",     label: t("priority.high"),     cls: "border-orange-300 bg-orange-50 text-orange-700", sel: "border-orange-500 bg-orange-100 text-orange-800" },
                  { value: "critical", label: t("priority.critical"), cls: "border-red-300 bg-red-50 text-red-700",          sel: "border-red-500 bg-red-100 text-red-800" },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setReqs(p => ({ ...p, priority: opt.value }))}
                    className={`p-3 border-2 rounded-xl text-xs font-semibold transition-all ${
                      reqs.priority === opt.value ? opt.sel : opt.cls}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project type */}
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-700 mb-1">Project Type</p>
              <p className="text-xs text-gray-400 mb-3">Determines which features and workflows are available for this project.</p>
              <div className="grid grid-cols-2 gap-2">
                {activeProjectTypes.map(({ value, Icon: PtIcon, label, desc }) => {
                  const active = basics.project_type === value;
                  const locked = value === 'help_desk' && !clientLimits.helpDesk;
                  return (
                    <button key={value} type="button" disabled={locked}
                      onClick={() => !locked && setBasics(p => ({ ...p, project_type: value }))}
                      className={`text-left p-3 border-2 rounded-xl transition-all relative ${
                        locked  ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed" :
                        active  ? "border-blue-500 bg-blue-50" :
                                  "border-gray-200 hover:border-gray-300"}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <PtIcon size={14} className={locked ? "text-gray-300" : active ? "text-blue-600" : "text-gray-400"} />
                        <span className={`font-semibold text-xs ${locked ? "text-gray-400" : active ? "text-blue-700" : "text-gray-900"}`}>{label}</span>
                        {locked && <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200 whitespace-nowrap">Pro+</span>}
                      </div>
                      <div className="text-xs text-gray-400 leading-snug pl-[22px]">{locked ? "Upgrade to Professional to unlock" : desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Step: Scope ── */}
        {stepId === 'scope' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step1_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step1_desc")}</p>
            {(auth.isAdmin || auth.isManager) && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.client")}</label>
                <select value={scopeData.client_id}
                  onChange={e => setScopeData(p => ({ ...p, client_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("proj.select_client")}</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.client_profiles?.company_name || c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Input label={t("proj.budget_label")} type="number" value={scopeData.total_budget}
              onChange={e => setScopeData(p => ({ ...p, total_budget: e.target.value }))}
              placeholder={t("proj.ph_budget_large_eg")} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("label.start_date")} type="date" value={scopeData.start_date}
                onChange={e => setScopeData(p => ({ ...p, start_date: e.target.value }))} />
              <Input label={t("label.end_date")} type="date" value={scopeData.end_date}
                onChange={e => setScopeData(p => ({ ...p, end_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.sap_area")}</label>
                <select value={scopeData.area_sap}
                  onChange={e => setScopeData(p => ({ ...p, area_sap: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("proj.none_opt")}</option>
                  {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.industry")}</label>
                <select value={scopeData.industry}
                  onChange={e => setScopeData(p => ({ ...p, industry: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("proj.select_industry")}</option>
                  {(catalogSettings?.["catalog_industries"] ?? INDUSTRY_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Step: Objectives ── */}
        {stepId === 'objectives' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step2_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step2_desc")}</p>
            <Textarea label={t("proj.objectives_label")} value={objectives.objectives}
              onChange={e => setObj(p => ({ ...p, objectives: e.target.value }))}
              placeholder={t("proj.ph_goals")} />

            {/* Deliverables multi-select */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("proj.deliverables")}</label>
              <CatalogMultiSelect
                options={catalogDeliverables}
                selected={objectives.deliverables}
                onChange={val => setObj(p => ({ ...p, deliverables: val }))}
                color="violet"
                placeholder="Search deliverables…"
              />
            </div>

            <Textarea label={t("proj.success_label")} value={objectives.success_criteria}
              onChange={e => setObj(p => ({ ...p, success_criteria: e.target.value }))}
              placeholder={t("proj.ph_kpi")} />
            <Textarea label={t("proj.out_of_scope")} value={objectives.out_of_scope}
              onChange={e => setObj(p => ({ ...p, out_of_scope: e.target.value }))}
              placeholder={t("proj.ph_exclusions")} />
          </>
        )}

        {/* ── Step: Team ── */}
        {stepId === 'team' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step3_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step3_desc")}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("proj.stakeholder")}</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Input label={t("proj.stakeholder_name")} value={team.stakeholder_name}
                onChange={e => setTeam(p => ({ ...p, stakeholder_name: e.target.value }))}
                placeholder={t("proj.ph_stakeholder_name")} />
              <Input label={t("proj.stakeholder_email")} value={team.stakeholder_email}
                onChange={e => setTeam(p => ({ ...p, stakeholder_email: e.target.value }))}
                placeholder={t("proj.ph_stakeholder_email")} />
            </div>
            <div className="border-t border-gray-100 pt-5 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("proj.billing_contact")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("proj.billing_name")} value={team.billing_contact_name}
                  onChange={e => setTeam(p => ({ ...p, billing_contact_name: e.target.value }))}
                  placeholder={t("proj.ph_billing_name")} />
                <Input label={t("proj.billing_email")} value={team.billing_contact_email}
                  onChange={e => setTeam(p => ({ ...p, billing_contact_email: e.target.value }))}
                  placeholder={t("proj.ph_billing_email")} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-5">
              <Input label={t("proj.consultants_label")} type="number" value={team.expected_consultants}
                onChange={e => setTeam(p => ({ ...p, expected_consultants: e.target.value }))}
                placeholder={t("proj.ph_n_eg")} />
            </div>
          </>
        )}

        {/* ── Step: Requirements ── */}
        {stepId === 'requirements' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step4_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step4_desc")}</p>

            {/* Skills multi-select */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("label.skills")}</label>
              <CatalogMultiSelect
                options={catalogSkills}
                selected={reqs.skills_required}
                onChange={val => setReqs(p => ({ ...p, skills_required: val }))}
                color="blue"
                placeholder="Search skills…"
              />
            </div>

            {/* Work Mode cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("proj.work_mode")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { value: "remote",  label: t("cs.work_remote"), desc: t("cs.work_remote_desc_exp") },
                  { value: "onsite",  label: t("cs.work_onsite"), desc: t("cs.work_onsite_desc") },
                  { value: "hybrid",  label: t("cs.work_hybrid"), desc: t("cs.work_hybrid_desc_exp") },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setReqs(p => ({ ...p, work_mode: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      reqs.work_mode === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Textarea label={t("proj.compliance_label")} value={reqs.compliance_notes}
              onChange={e => setReqs(p => ({ ...p, compliance_notes: e.target.value }))}
              placeholder={t("proj.ph_compliance")} />
          </>
        )}

        {/* ── Step 5: Import Plan ── */}
        {stepId === 'import_plan' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Import Project Plan</h2>
            <p className="text-sm text-gray-500 mb-5">Upload a document with your project plan. AI will extract the cases and create them automatically when the project is saved.</p>

            {!extractedCases && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Plan document</label>
                <input type="file" accept=".txt,.md,.csv,.json,.pdf"
                  onChange={e => { setPlanFile(e.target.files[0] ?? null); setExtractError(null); }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 cursor-pointer" />
                {planFile && (
                  <p className="mt-2 text-xs text-gray-500">{planFile.name} ({Math.round(planFile.size / 1024)} KB)</p>
                )}
                {extractError && (
                  <p className="mt-2 text-xs text-red-600">{extractError}</p>
                )}
                {planFile && (
                  <button onClick={handleExtract} disabled={extracting}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors">
                    {extracting ? (
                      <><Loader2 size={14} className="animate-spin" />Extracting cases…</>
                    ) : (
                      <><Sparkles size={14} />Extract with AI</>
                    )}
                  </button>
                )}
                <p className="mt-3 text-xs text-gray-400">Supported formats: .txt, .md, .csv, .json, .pdf — You can skip this step if you don't have a plan yet.</p>
              </div>
            )}

            {extractedCases && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">{extractedCases.length} case{extractedCases.length !== 1 ? 's' : ''} found</p>
                  <button onClick={() => { setExtractedCases(null); setPlanFile(null); setExtractError(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">Clear &amp; re-upload</button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-100 mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">Title</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-28">Priority</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-24">Est. Hours</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-32">SAP Area</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {extractedCases.map((c, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">
                            <input value={c.title}
                              onChange={e => updateExtractedCase(idx, 'title', e.target.value)}
                              className="w-full border-0 bg-transparent text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={c.priority}
                              onChange={e => updateExtractedCase(idx, 'priority', e.target.value)}
                              className="border border-gray-200 bg-white text-gray-700 text-xs rounded-lg px-1.5 py-1 focus:outline-none">
                              {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" value={c.est_hours ?? ''}
                              onChange={e => updateExtractedCase(idx, 'est_hours', e.target.value ? Number(e.target.value) : null)}
                              className="w-20 border border-gray-200 bg-white text-gray-700 text-sm rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input value={c.area_sap ?? ''}
                              onChange={e => updateExtractedCase(idx, 'area_sap', e.target.value)}
                              className="w-full border border-gray-200 bg-white text-gray-700 text-xs rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <button onClick={() => setExtractedCases(p => p.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500 transition-colors">
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-3">Case settings</p>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-700 font-medium">Case type:</label>
                    <select value={caseMode} onChange={e => setCaseMode(e.target.value)}
                      className="text-sm border border-violet-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none">
                      <option value="express">Express (recommended — fast flow)</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Cases will be created as "open" and linked to this project automatically.</p>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 6: Review ── */}
        {stepId === 'review' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("proj.step5_h2")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("proj.step5_desc")}</p>
            <div className="space-y-4">
              {/* Basics card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("proj.rev_basics")}</p>
                <p className="font-semibold text-gray-900 text-base">{basics.name || <span className="italic text-gray-400">{t("proj.untitled")}</span>}</p>
                {basics.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{basics.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className={PRIORITY_COLORS[reqs.priority]}>{PRIORITY_LABEL_KEYS[reqs.priority] ? t(PRIORITY_LABEL_KEYS[reqs.priority]) : cap(reqs.priority)}</Badge>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[basics.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL_KEYS[basics.status] ? t(STATUS_LABEL_KEYS[basics.status]) : cap(basics.status)}</span>
                </div>
              </div>

              {/* Scope card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("proj.rev_scope")}</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {scopeData.total_budget && (
                    <div><span className="text-gray-400">{t("label.budget")}:</span> <span className="font-medium ml-1">${Number(scopeData.total_budget).toLocaleString()}</span></div>
                  )}
                  {scopeData.start_date && (
                    <div><span className="text-gray-400">{t("label.start_date")}:</span> <span className="font-medium ml-1">{fmtDate(scopeData.start_date)}</span></div>
                  )}
                  {scopeData.end_date && (
                    <div><span className="text-gray-400">{t("label.end_date")}:</span> <span className="font-medium ml-1">{fmtDate(scopeData.end_date)}</span></div>
                  )}
                  {scopeData.area_sap && (
                    <div><span className="text-gray-400">{t("label.sap_area")}:</span> <span className="font-medium ml-1">{scopeData.area_sap}</span></div>
                  )}
                  {scopeData.industry && (
                    <div><span className="text-gray-400">{t("label.industry")}:</span> <span className="font-medium ml-1">{scopeData.industry}</span></div>
                  )}
                </div>
                {!scopeData.total_budget && !scopeData.start_date && !scopeData.end_date && (
                  <p className="text-sm text-gray-400 italic">{t("proj.no_scope")}</p>
                )}
              </div>

              {/* Objectives card — only if any filled */}
              {(objectives.objectives || objectives.deliverables.length > 0 || objectives.success_criteria) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("proj.rev_objectives")}</p>
                  {objectives.objectives && <p className="text-sm text-gray-700 mb-3 leading-relaxed">{objectives.objectives}</p>}
                  {objectives.deliverables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {objectives.deliverables.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{d}</span>
                      ))}
                    </div>
                  )}
                  {objectives.success_criteria && <p className="text-xs text-gray-500 mt-1">{objectives.success_criteria}</p>}
                </div>
              )}

              {/* Team card — only if any filled */}
              {(team.stakeholder_name || team.billing_contact_name || team.expected_consultants) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("proj.rev_team")}</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {team.stakeholder_name && (
                      <div><span className="text-gray-400">{t("label.stakeholder")}:</span> <span className="font-medium ml-1">{team.stakeholder_name}</span></div>
                    )}
                    {team.stakeholder_email && (
                      <div><span className="text-gray-400">{t("label.email")}:</span> <span className="font-medium ml-1">{team.stakeholder_email}</span></div>
                    )}
                    {team.billing_contact_name && (
                      <div><span className="text-gray-400">{t("label.billing")}:</span> <span className="font-medium ml-1">{team.billing_contact_name}</span></div>
                    )}
                    {team.expected_consultants && (
                      <div><span className="text-gray-400">{t("label.consultants")}:</span> <span className="font-medium ml-1">{team.expected_consultants}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Requirements card — only if any skills */}
              {(reqs.skills_required.length > 0 || reqs.compliance_notes) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("proj.rev_requirements")}</p>
                  <div className="text-sm mb-2">
                    <span className="text-gray-400">{t("proj.work_mode")}:</span> <span className="font-medium ml-1 capitalize">{reqs.work_mode}</span>
                  </div>
                  {reqs.skills_required.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {reqs.skills_required.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{s}</span>
                      ))}
                    </div>
                  )}
                  {reqs.compliance_notes && <p className="text-xs text-gray-500">{reqs.compliance_notes}</p>}
                </div>
              )}

              {/* Template card */}
              {selectedTemplate && (
                <div className="border border-blue-100 rounded-xl p-4 bg-blue-50">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                    <LayoutTemplate size={12} className="inline mr-1.5" />Template — {templateCases.length} case{templateCases.length !== 1 ? 's' : ''} will be created
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{selectedTemplate.name}</p>
                  {selectedTemplate.category && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-600 rounded-full">{selectedTemplate.category}</span>
                  )}
                </div>
              )}

              {/* Imported cases card */}
              {extractedCases && extractedCases.length > 0 && (
                <div className="border border-violet-100 rounded-xl p-4 bg-violet-50">
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-3">
                    <Upload size={12} className="inline mr-1.5" />Imported cases — {extractedCases.length} will be created
                  </p>
                  <div className="space-y-1">
                    {extractedCases.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${
                          c.priority === 'high' || c.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>{c.priority}</span>
                        <span className="text-gray-800 truncate">{c.title}</span>
                        {c.est_hours && <span className="text-gray-400 text-xs ml-auto shrink-0">{c.est_hours}h</span>}
                      </div>
                    ))}
                    {extractedCases.length > 5 && (
                      <p className="text-xs text-gray-400 mt-1">+ {extractedCases.length - 5} more cases…</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Type: <strong>{caseMode}</strong></p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 mt-4 space-y-3">
        {(stepError || createError) && (
          <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-xs border ${
            createError
              ? "bg-red-50 border-red-300 text-red-700"
              : skipPending
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <AlertTriangle size={13} className={`flex-shrink-0 mt-0.5 ${createError || !skipPending ? "text-red-500" : "text-amber-500"}`} />
            <span>{createError ?? stepError}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={handleBack}
            className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
            {(mode === "express" ? expressIdx === 0 : step === 0) ? <><X size={13} className="mr-1 inline" />{t("action.cancel")}</> : `← ${t("action.back")}`}
          </button>
          <div className="flex items-center gap-3">
            {(stepId === 'template' || stepId === 'objectives' || stepId === 'team' || stepId === 'import_plan') && (
              <button onClick={handleSkip}
                className={`px-4 py-2.5 text-sm border rounded-xl transition-colors ${
                  skipPending
                    ? "border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold"
                    : "border-gray-200 text-gray-400 hover:text-gray-600"
                }`}>
                {skipPending
                  ? "Skip anyway →"
                  : stepId === 'import_plan' ? "Skip for now"
                  : stepId === 'template'    ? "Start blank"
                  : t("action.skip")}
              </button>
            )}
            {!isLast ? (
              <button onClick={handleContinue}
                className={`px-7 py-2.5 text-white text-sm font-bold rounded-xl transition-colors shadow-md ${
                  stepError && !skipPending
                    ? "bg-red-500 hover:bg-red-600 ring-2 ring-red-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}>
                {stepId === 'template' && selectedTemplate
                  ? `Use "${selectedTemplate.name}" →`
                  : stepId === 'import_plan' && extractedCases?.length
                    ? `Continue with ${extractedCases.length} case${extractedCases.length !== 1 ? 's' : ''}`
                    : t("action.continue")
                }
              </button>
            ) : (
              <button onClick={handleCreate} disabled={creating}
                className={`px-7 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md ${
                  createError
                    ? "bg-red-500 hover:bg-red-600 ring-2 ring-red-300"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}>
                {creating
                  ? (isEdit ? t("state.saving") : (() => {
                      const total = (templateCases?.length ?? 0) + (extractedCases?.length ?? 0);
                      return total > 0 ? `Creating project + ${total} case${total !== 1 ? 's' : ''}…` : t("state.creating");
                    })())
                  : createError
                    ? <><AlertTriangle size={13} className="mr-1 inline" />Try again</>
                    : (isEdit ? <><Check size={13} className="mr-1 inline" />{t("action.save_changes")}</> : <><Check size={13} className="mr-1 inline" />{t("proj.create")}</>)
                }
              </button>
            )}
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

const AVATAR_PALETTE = [
  { bg:'#dbeafe', fg:'#1e40af' }, { bg:'#ccfbf1', fg:'#0f766e' },
  { bg:'#ede9fe', fg:'#6d28d9' }, { bg:'#fce7f3', fg:'#9d174d' },
  { bg:'#fef3c7', fg:'#92400e' }, { bg:'#d1fae5', fg:'#065f46' },
  { bg:'#e0f2fe', fg:'#075985' }, { bg:'#fee2e2', fg:'#991b1b' },
];
function UserAvatar({ name, size = 36, title: tooltipTitle }) {
  const c = AVATAR_PALETTE[Math.abs((name || '?').charCodeAt(0)) % AVATAR_PALETTE.length];
  const initials = (name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div title={tooltipTitle ?? name}
      style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 700, flexShrink: 0, letterSpacing: '-0.02em' }}>
      {initials}
    </div>
  );
}
function PersonAvatar({ name, avatarUrl, photoUrl, size = 36, title: tooltipTitle, className = "" }) {
  const src = photoUrl || avatarUrl || null;
  const displayName = name || '?';
  if (src) {
    return (
      <img src={src} alt={displayName} title={tooltipTitle ?? displayName}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 ${className}`} />
    );
  }
  const c = AVATAR_PALETTE[Math.abs(displayName.charCodeAt(0)) % AVATAR_PALETTE.length];
  const initials = displayName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div title={tooltipTitle ?? displayName}
      style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 700, flexShrink: 0, letterSpacing: '-0.02em' }}
      className={className}>
      {initials}
    </div>
  );
}

function ProjectAvatar({ project, size = 44, className = "" }) {
  const src = project?.avatar_url || project?.client?.avatar_url || null;
  const name = project?.name || '?';
  if (src) {
    return (
      <img src={src} alt={name}
        style={{ width: size, height: size }}
        className={`rounded-xl object-cover flex-shrink-0 ${className}`} />
    );
  }
  const c = AVATAR_PALETTE[Math.abs(name.charCodeAt(0)) % AVATAR_PALETTE.length];
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div title={name}
      style={{ width: size, height: size, background: c.bg, color: c.fg, borderRadius: 12, fontSize: Math.round(size * 0.36), fontWeight: 700, flexShrink: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className={className}>
      {initials}
    </div>
  );
}

// ─── Document type color palette (rotates by index in catalog) ───────────────
const DOC_TYPE_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
];

const DEFAULT_DOC_TYPES = [
  "Functional Spec", "Technical Spec", "ABAP Standards", "Blueprint",
  "Test Script", "Go-Live Checklist", "Data Migration", "Contract / SOW",
  "Change Request", "Status Report", "Meeting Minutes", "User Manual",
  "Training Material", "Other",
];

function ProjectDocsTab({ projectId, auth }) {
  const ssCtx = useSystemSettings();
  const docTypes = ssCtx.settings["catalog_doc_types"] ?? DEFAULT_DOC_TYPES;

  const allDocs   = ssCtx.settings["project_docs"] ?? {};
  const docs      = allDocs[projectId] ?? [];

  const canEdit = auth.isAdmin || auth.isManager;

  const [showUpload,   setShowUpload]   = useState(false);
  const [uploadType,   setUploadType]   = useState("");
  const [uploadLabel,  setUploadLabel]  = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [filter,       setFilter]       = useState("");
  const fileRef = useRef(null);

  function typeColor(typeName) {
    const idx = docTypes.indexOf(typeName);
    return DOC_TYPE_COLORS[(idx >= 0 ? idx : docTypes.length - 1) % DOC_TYPE_COLORS.length];
  }

  async function saveDocs(list) {
    const latest = ssCtx.settings["project_docs"] ?? {};
    await ssCtx.setSetting("project_docs", { ...latest, [projectId]: list });
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `project-docs/${projectId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("case-documents").upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from("case-documents").getPublicUrl(path);
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          url: publicUrl,
          type: uploadType || "Other",
          label: uploadLabel.trim(),
          size_kb: Math.round(file.size / 1024),
          uploaded_at: new Date().toISOString(),
        });
      } catch (err) { alert(`${file.name}: ${err.message}`); }
    }
    if (added.length) {
      const current = (ssCtx.settings["project_docs"] ?? {})[projectId] ?? [];
      await saveDocs([...current, ...added]);
    }
    setUploading(false);
    setUploadLabel("");
    setShowUpload(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(docId) {
    const current = (ssCtx.settings["project_docs"] ?? {})[projectId] ?? [];
    await saveDocs(current.filter(d => d.id !== docId));
  }

  const filtered    = filter ? docs.filter(d => d.type === filter) : docs;
  const typesInUse  = [...new Set(docs.map(d => d.type))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Project Documents</h2>
          <p className="text-sm text-gray-400">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            <Upload size={15} /> Upload
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Upload document(s)</p>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Document type <span className="text-red-400">*</span></label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select type —</option>
                {docTypes.map(ty => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Label <span className="text-gray-300">(optional)</span></label>
              <input value={uploadLabel} onChange={e => setUploadLabel(e.target.value)}
                placeholder="e.g. MM-PO Flow v2"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => fileRef.current?.click()} disabled={!uploadType || uploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading…" : "Select files"}
            </button>
            <button onClick={() => { setShowUpload(false); setUploadType(""); setUploadLabel(""); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
          </div>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
        </div>
      )}

      {/* Type filter chips */}
      {docs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !filter ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}>
            All ({docs.length})
          </button>
          {typesInUse.map(type => (
            <button key={type} onClick={() => setFilter(f => f === type ? "" : type)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === type ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900"
                                : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}>
              {type} ({docs.filter(d => d.type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={32} className="text-gray-200 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400">
            {docs.length ? "No documents match this filter." : "No documents uploaded yet."}
          </p>
          {canEdit && !docs.length && (
            <button onClick={() => setShowUpload(true)} className="mt-3 text-sm text-blue-600 hover:underline">
              Upload the first document
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          {filtered.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <FileText size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${typeColor(doc.type)}`}>{doc.type}</span>
                  {doc.label && <span className="text-xs text-gray-500 dark:text-gray-400 italic">{doc.label}</span>}
                </div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate mt-0.5">{doc.name}</p>
                <p className="text-xs text-gray-400">
                  {doc.size_kb} KB · {new Date(doc.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              <a href={doc.url} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex-shrink-0">
                View
              </a>
              {canEdit && (
                <button onClick={() => handleDelete(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectConnectionsTab({ projectId, clientId, auth }) {
  const { t } = useT();
  const { projectConns, clientConns, addConnection, updateConnection, deleteConnection } = useProjectDbConnections(projectId, clientId);
  const [showAdd, setShowAdd] = useState(false);
  const defaultForm = { db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "", meta: {} };
  const [form, setForm]       = useState(defaultForm);
  const [saving, setSaving]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState(defaultForm);

  const isSapType = ty => ["sap_gui","sap_hana","sap_rfc","sap_odata"].includes(ty);
  const isVpnType = ty => ty === "vpn";
  const CONN_TYPE_LABELS = {
    postgresql:"PostgreSQL", mysql:"MySQL", mssql:"MSSQL", oracle:"Oracle",
    mongodb:"MongoDB", sap_gui:"SAP GUI", sap_hana:"SAP HANA",
    sap_rfc:"SAP RFC", sap_odata:"SAP OData", vpn:"VPN", other:"Other",
  };
  const CONN_TYPE_COLORS = {
    postgresql:"bg-blue-100 text-blue-700", mysql:"bg-orange-100 text-orange-700",
    mssql:"bg-red-100 text-red-700", oracle:"bg-red-100 text-red-700",
    mongodb:"bg-green-100 text-green-700", sap_gui:"bg-indigo-100 text-indigo-700",
    sap_hana:"bg-cyan-100 text-cyan-700", sap_rfc:"bg-purple-100 text-purple-700",
    sap_odata:"bg-teal-100 text-teal-700", vpn:"bg-slate-100 text-slate-700",
    other:"bg-gray-100 text-gray-700",
  };
  const CONN_TYPE_BLOCK = {
    postgresql:"bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
    mysql:     "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
    mssql:     "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
    oracle:    "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
    mongodb:   "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300",
    sap_gui:   "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300",
    sap_hana:  "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300",
    sap_rfc:   "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300",
    sap_odata: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300",
    vpn:       "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-sky-300",
    other:     "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  const CONN_TYPE_ICON = {
    postgresql: Database, mysql: Database, mssql: Database, oracle: Database, mongodb: Database,
    sap_gui: Code2, sap_hana: Code2, sap_rfc: Code2, sap_odata: Code2,
    vpn: Shield, other: Database,
  };
  const CONN_TYPE_ABBR = {
    postgresql:"PG", mysql:"MySQL", mssql:"SQL", oracle:"ORA", mongodb:"Mongo",
    sap_gui:"GUI", sap_hana:"HANA", sap_rfc:"RFC", sap_odata:"OData",
    vpn:"VPN", other:"—",
  };
  const DEFAULT_PORTS = { postgresql:5432, mysql:3306, mssql:1433, oracle:1521, mongodb:27017, sap_hana:39015, sap_gui:3200, sap_rfc:3300, sap_odata:443, vpn:1194 };

  function handleTypeChange(ty) {
    setForm(p => ({ ...p, db_type: ty, port: DEFAULT_PORTS[ty] ?? p.port, meta: {} }));
  }

  async function handleAdd() {
    if (!form.host || (!isVpnType(form.db_type) && !form.db_name)) return;
    setSaving(true);
    try {
      await addConnection(form);
      setForm(defaultForm);
      setShowAdd(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  function startEdit(conn) {
    setEditingId(conn.id);
    setEditForm({ db_type: conn.db_type, host: conn.host, port: conn.port ?? "", db_name: conn.db_name ?? "", username: conn.username ?? "", notes: conn.notes ?? "", meta: conn.meta ?? {} });
    setShowAdd(false);
  }

  function cancelEdit() { setEditingId(null); setEditForm(defaultForm); }

  function handleTypeChangeEdit(ty) {
    setEditForm(p => ({ ...p, db_type: ty, port: DEFAULT_PORTS[ty] ?? p.port, meta: {} }));
  }

  async function handleUpdate() {
    if (!editForm.host || (!isVpnType(editForm.db_type) && !editForm.db_name)) return;
    setSaving(true);
    try {
      await updateConnection(editingId, editForm);
      cancelEdit();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const canEdit = auth.isAdmin || auth.isManager;

  const ConnForm = ({ f, setF, onTypeChange, onSave, onCancel, isEdit }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("conn.type_short")}</label>
          <select value={f.db_type} onChange={e => onTypeChange(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400">
            {Object.entries(CONN_TYPE_LABELS).map(([ty, l]) => <option key={ty} value={ty}>{l}</option>)}
          </select>
        </div>
        <Input label={t("conn.host_ip")} value={f.host}
          onChange={e => setF(p => ({ ...p, host: e.target.value }))} placeholder={t("conn.ph_host")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t("label.port")} type="number" value={f.port}
          onChange={e => setF(p => ({ ...p, port: +e.target.value }))} />
        {!isVpnType(f.db_type) && (
          <Input label={t("conn.db_sid")} value={f.db_name}
            onChange={e => setF(p => ({ ...p, db_name: e.target.value }))} placeholder={t("conn.ph_db_name")} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t("label.username")} value={f.username}
          onChange={e => setF(p => ({ ...p, username: e.target.value }))} placeholder={t("conn.ph_username")} />
        <Input label={t("label.notes")} value={f.notes}
          onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder={t("conn.ph_notes_eg")} />
      </div>
      {isSapType(f.db_type) && (
        <SapProfileFields meta={f.meta} dbType={f.db_type} onChange={meta => setF(p => ({ ...p, meta }))} />
      )}
      {isVpnType(f.db_type) && (
        <VpnProfileFields meta={f.meta} onChange={meta => setF(p => ({ ...p, meta }))} />
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">{t("action.cancel")}</button>
        <button onClick={onSave}
          disabled={saving || !f.host || (!isVpnType(f.db_type) && !f.db_name)}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
          {saving ? t("state.saving") : isEdit ? t("action.save") : t("conn.add_action")}
        </button>
      </div>
    </div>
  );

  const ConnCard = ({ conn, readOnly }) => {
    if (editingId === conn.id) return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-300 dark:border-blue-700 p-4 shadow-sm">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-3">Edit connection</p>
        <ConnForm f={editForm} setF={setEditForm} onTypeChange={handleTypeChangeEdit}
          onSave={handleUpdate} onCancel={cancelEdit} isEdit />
      </div>
    );

    const TypeIcon = CONN_TYPE_ICON[conn.db_type] ?? Database;
    const blockCls = CONN_TYPE_BLOCK[conn.db_type] ?? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    const abbr = CONN_TYPE_ABBR[conn.db_type] ?? conn.db_type.toUpperCase().slice(0, 5);

    // Subtitle shown under the type name
    const subtitle = isVpnType(conn.db_type)
      ? conn.meta?.conn_name ?? null
      : isSapType(conn.db_type)
        ? conn.meta?.system_id ?? null
        : conn.db_name ?? null;

    // Key-value grid entries (max 4 to keep 2×2)
    const grid = [];
    if (isVpnType(conn.db_type) && conn.meta) {
      if (conn.meta.protocol)       grid.push({ k: "Protocol",  v: conn.meta.protocol.toUpperCase() });
      if (conn.meta.vpn_client)     grid.push({ k: "Client",    v: conn.meta.vpn_client });
      if (conn.meta.remote_gateway) grid.push({ k: "Gateway",   v: conn.meta.remote_gateway });
      if (conn.meta.auth_mode)      grid.push({ k: "Auth",      v: conn.meta.auth_mode });
      if (conn.username && grid.length < 4) grid.push({ k: "Username", v: conn.username });
    } else if (isSapType(conn.db_type) && conn.meta) {
      if (conn.meta.sap_system) grid.push({ k: "System",   v: conn.meta.sap_system });
      if (conn.meta.client)     grid.push({ k: "Client",   v: conn.meta.client });
      if (conn.meta.system_id)  grid.push({ k: "SID",      v: conn.meta.system_id });
      if (conn.username)        grid.push({ k: "Username", v: conn.username });
    } else {
      if (conn.db_name)  grid.push({ k: "Database", v: conn.db_name });
      if (conn.username) grid.push({ k: "Username", v: conn.username });
      if (conn.notes)    grid.push({ k: "Notes",    v: conn.notes });
    }

    const kCls = "text-[9.5px] font-semibold uppercase tracking-[0.5px] text-gray-400 dark:text-gray-500";
    const vCls = "text-[12px] font-medium text-gray-700 dark:text-gray-200 truncate";

    return (
      <div className={`flex overflow-hidden rounded-xl border transition-colors ${
        readOnly ? "opacity-60 border-dashed border-gray-200 dark:border-gray-700"
                 : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
      }`}>
        {/* Colored icon block (Option C) */}
        <div className={`w-[54px] flex-shrink-0 flex flex-col items-center justify-center gap-1 ${blockCls}`}>
          <TypeIcon size={18} />
          <span className="text-[8px] font-black tracking-wide uppercase opacity-75">{abbr}</span>
        </div>

        {/* Content (Option B) */}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 px-3 py-3 flex flex-col gap-2.5">
          {/* Header: type label + subtitle + actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {CONN_TYPE_LABELS[conn.db_type] ?? conn.db_type}
              </p>
              {subtitle && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">{subtitle}</p>
              )}
              {readOnly && <span className="text-[10px] text-gray-400 italic">{t("conn.from_client")}</span>}
            </div>
            {!readOnly && canEdit && (
              <div className="flex gap-0.5 flex-shrink-0">
                <button onClick={() => startEdit(conn)}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                  <FileEdit size={12} />
                </button>
                <button onClick={() => deleteConnection(conn.id)}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Host:port code box */}
          <div className="font-mono text-[12px] font-medium text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/60 border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5 flex items-center gap-2 min-w-0">
            <Activity size={10} className="text-gray-400 flex-shrink-0" />
            <span className="truncate flex-1">{conn.host}</span>
            {conn.port && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">:{conn.port}</span>}
          </div>

          {/* 2-col key-value grid */}
          {grid.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {grid.slice(0, 4).map(({ k, v }) => (
                <div key={k} className="flex flex-col gap-0.5 min-w-0">
                  <span className={kCls}>{k}</span>
                  <span className={vCls}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{t("conn.project_desc")}</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            <Plus size={14} /> {t("conn.add_action")}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-blue-50/60 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{t("conn.new_project")}</p>
          <ConnForm f={form} setF={setForm} onTypeChange={handleTypeChange}
            onSave={handleAdd} onCancel={() => { setShowAdd(false); setForm(defaultForm); }} />
        </div>
      )}

      {projectConns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center bg-white dark:bg-gray-800/40">
          <Database size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">{t("conn.no_project")}</p>
          {canEdit && <p className="text-xs text-gray-300 mt-1">{t("conn.add_hint")}</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          {projectConns.map(c => <ConnCard key={c.id} conn={c} readOnly={false} />)}
        </div>
      )}

      {clientConns.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("conn.inherited")}</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
          <div className="grid gap-3">
            {clientConns.map(c => <ConnCard key={c.id} conn={c} readOnly={true} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project, auth, onBack, onUpdate, onClose, clients = [], importedCasesCount = 0 }) {
  const { t } = useT();
  const wizardMode = useWizardMode(auth);
  const { createCase, updateCase, deleteCase } = useCases({});
  const [projCases, setProjCases] = useState([]);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [showEditWizard, setShowEditWizard] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [unassignedCases, setUnassignedCases] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const projCarouselRef = useRef(null);
  const projCarouselScrolling = useRef(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  const [projMountedSlides, setProjMountedSlides] = useState(() => new Set(["overview"]));
  const [projManualCompletions, setProjManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_pmc_${project.id}`) ?? "{}"); } catch { return {}; }
  });
  function setProjManualComplete(tabId, done) {
    setProjManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_pmc_${project.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [projLcMode, setProjLcMode] = useState(project.case_lifecycle?.preset ?? "standard");
  const [savingProjLc, setSavingProjLc] = useState(false);
  const [clientLcConfig, setClientLcConfig] = useState(null);
  const [expandedCase, setExpandedCase] = useState(null);
  const [expandedConsultant, setExpandedConsultant] = useState(null);
  const [projSelectedCase, setProjSelectedCase] = useState(null);
  const { templates: lcTemplates2, getTemplateStages: getProjTmplStages } = useLifecycleTemplates();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  // Import cases from document
  const { settings: _importSS } = useSystemSettings();
  const importGenModel = _importSS["ai_model"] ?? 'claude-haiku-4-5-20251001';
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [extractingImport, setExtractingImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const importFileRef = useRef(null);
  // Project templates
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSaveTmplModal, setShowSaveTmplModal] = useState(false);
  // Share link
  const [shareCopied, setShareCopied] = useState(false);
  const [shareToken, setShareToken] = useState(project.share_token ?? null);
  // Project report
  const [generatingReport, setGeneratingReport] = useState(false);

  async function handleShareLink() {
    let token = shareToken;
    if (!token) {
      const { data } = await supabase
        .from("projects")
        .update({ share_token: crypto.randomUUID() })
        .eq("id", project.id)
        .select("share_token")
        .single();
      token = data?.share_token;
      if (token) setShareToken(token);
    }
    if (!token) return;
    const url = `${window.location.origin}/share/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt("Copy this link:", url); return; }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  }

  async function generateProjectReport() {
    setGeneratingReport(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, L = 12, R = 198;
      const sapBlue = [26, 75, 140];
      const sapGray = [243, 246, 249];
      const now = new Date();

      // ── Cover header ──────────────────────────────────────
      doc.setFillColor(...sapBlue);
      doc.rect(0, 0, W, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Project Completion Report', L, 16);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(project.title ?? 'Untitled Project', L, 25);
      doc.setFontSize(8);
      doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, L, 33);
      doc.setTextColor(0, 0, 0);

      let y = 46;

      // ── Project summary ───────────────────────────────────
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Project Summary', L, y); y += 6;
      const TERMINAL = ['completed', 'cancelled', 'terminated', 'closed', 'approved'];
      const totalCases = projCases.length;
      const doneCases  = projCases.filter(c => TERMINAL.includes(c.status)).length;
      const progress   = totalCases ? Math.round(doneCases / totalCases * 100) : 0;
      autoTable(doc, {
        startY: y,
        margin: { left: L, right: L },
        theme: 'grid',
        headStyles: { fillColor: sapBlue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: sapGray },
        head: [['Field','Value']],
        body: [
          ['Project Status',  project.status ?? '—'],
          ['Total Cases',     String(totalCases)],
          ['Completed Cases', `${doneCases} (${progress}%)`],
          ['Client',          project.client_name ?? '—'],
          ['Start Date',      project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'],
          ['Description',     project.description ?? '—'],
        ],
      });
      y = doc.lastAutoTable.finalY + 10;

      // ── Cases table ───────────────────────────────────────
      if (projCases.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Cases', L, y); y += 6;

        // Fetch transport requests for all cases
        const caseIds = projCases.map(c => c.id);
        const { data: allTR } = await supabase
          .from('transport_requests')
          .select('case_id, request_number, status')
          .eq('project_id', project.id);
        const trByCaseId = {};
        (allTR ?? []).forEach(r => { (trByCaseId[r.case_id] = trByCaseId[r.case_id] ?? []).push(r); });

        autoTable(doc, {
          startY: y,
          margin: { left: L, right: L },
          theme: 'grid',
          headStyles: { fillColor: sapBlue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: sapGray },
          columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22 }, 4: { cellWidth: 30 }, 5: { cellWidth: 28 } },
          head: [['Title','Status','Priority','SAP Area','Transport Requests','Assignee']],
          body: projCases.map(c => {
            const trs = (trByCaseId[c.id] ?? []).map(r => r.request_number).join(', ') || '—';
            const assignee = (c.case_assignments ?? [])[0]?.users?.full_name ?? '—';
            return [c.title ?? '—', c.status ?? '—', c.priority ?? '—', c.area_sap ?? '—', trs, assignee];
          }),
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      // Blueprint objects are stored in system_settings (client-side), so we skip them here
      // and summarize case statuses instead.

      // ── Approval summary ──────────────────────────────────
      const { data: approvals } = await supabase
        .from('approval_requests')
        .select('case_id, status, created_at, cases(title)')
        .in('case_id', projCases.map(c => c.id));
      if (approvals?.length > 0) {
        if (y > 240) { doc.addPage(); y = 16; }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Approval Records', L, y); y += 6;
        autoTable(doc, {
          startY: y,
          margin: { left: L, right: L },
          theme: 'grid',
          headStyles: { fillColor: sapBlue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: sapGray },
          head: [['Case','Approval Status','Date']],
          body: approvals.map(a => [
            a.cases?.title ?? a.case_id,
            a.status ?? '—',
            a.created_at ? new Date(a.created_at).toLocaleDateString() : '—',
          ]),
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      // ── Footer ────────────────────────────────────────────
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(`TechCase SAP · ${project.title ?? ''}`, L, 290);
        doc.text(`Page ${i} / ${pageCount}`, R - 10, 290, { align: 'right' });
        doc.setTextColor(0, 0, 0);
      }

      const slug = (project.title ?? 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      doc.save(`${slug}_report_${now.toISOString().slice(0,10)}.pdf`);
    } catch (e) {
      alert('Report generation failed: ' + e.message);
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleImportExtract() {
    if (!importFile) return;
    setExtractingImport(true);
    setImportError(null);
    try {
      const systemPrompt = `You are an expert SAP project analyst. Extract all tasks or cases from the provided project plan document.
Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Use this structure for each item:
{"title":"...","description":"...","priority":"medium","area_sap":"","skills":[],"est_hours":null}
Priority must be one of: low, medium, high, urgent. est_hours is a number or null. If no tasks found, return [].`;
      let messages;
      const isPdf = importFile.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const buf = await importFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = ''; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        messages = [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: 'Extract all tasks/cases from this project plan. Return JSON array only.' }
        ]}];
      } else {
        const text = await importFile.text();
        messages = [{ role: 'user', content: `Project plan document:\n\n${text.slice(0, 30000)}\n\nExtract all tasks/cases. Return JSON array only.` }];
      }
      const raw = await callClaude({ model: importGenModel, system: systemPrompt, messages, max_tokens: 4096 });
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No structured data found. Try a text or PDF file with a clear task list.');
      const extracted = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(extracted) || extracted.length === 0) throw new Error('No cases found in the document.');
      setImportPreview(extracted.map(c => ({
        _selected: true,
        title:       String(c.title ?? 'Untitled case'),
        description: String(c.description ?? ''),
        priority:    ['low','medium','high','urgent'].includes(c.priority) ? c.priority : 'medium',
        area_sap:    c.area_sap ?? '',
        skills:      Array.isArray(c.skills) ? c.skills : [],
        est_hours:   c.est_hours ? Number(c.est_hours) : null,
      })));
    } catch (e) { setImportError(e.message); }
    setExtractingImport(false);
  }

  async function handleImportConfirm() {
    if (!importPreview) return;
    const selected = importPreview.filter(c => c._selected);
    if (!selected.length) { setImportError('No cases selected.'); return; }
    setConfirmingImport(true);
    setImportError(null);
    try {
      const caseRows = selected.map(c => ({
        title:           String(c.title ?? 'Untitled case'),
        description:     c.description || null,
        priority:        ['low','medium','high','urgent'].includes(c.priority) ? c.priority : 'medium',
        area_sap:        c.area_sap || null,
        skills_required: c.skills?.length ? c.skills : null,
        estimated_hours: c.est_hours ? Number(c.est_hours) : null,
        project_id:      project.id,
        client_id:       project.client_id ?? null,
        status:          'open',
        created_by:      auth.user?.id,
      }));
      const { error: casesError } = await supabase.from('cases').insert(caseRows).select('id');
      if (casesError) throw new Error(casesError.message);
      await loadProjCases();
      setImportPreview(null);
      setImportFile(null);
      setShowImportPanel(false);
    } catch (e) { setImportError(e.message); }
    setConfirmingImport(false);
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `project-avatars/${project.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('project-avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('project-avatars').getPublicUrl(path);
      await onUpdate(project.id, { avatar_url: publicUrl });
    } catch (err) { alert(`Avatar upload failed: ${err.message}`); }
    setUploadingAvatar(false);
    e.target.value = '';
  }

  const loadProjCases = useCallback(async () => {
    if (!project?.id) return;
    const { data } = await supabase.from("cases")
      .select("*, manager:manager_id(id, full_name, email, avatar_url), case_assignments(consultant_id, time_commitment, users:consultant_id(id, full_name, email, avatar_url))")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    setProjCases(data ?? []);
  }, [project?.id]);

  useEffect(() => { loadProjCases(); }, [loadProjCases]);

  useEffect(() => {
    if (!project?.client_id) return;
    supabase.from("client_profiles")
      .select("case_lifecycle")
      .eq("id", project.client_id)
      .single()
      .then(({ data }) => setClientLcConfig(data?.case_lifecycle ?? null));
  }, [project?.client_id]);

  async function handleStatusChange(newStatus) {
    const terminal = ["completed", "cancelled"];
    if (terminal.includes(newStatus)) {
      const openCount = project.cases?.filter(c => !terminal.includes(c.status)).length ?? 0;
      if (openCount > 0) {
        const confirmKey = newStatus === "completed" ? "proj.confirm_complete_cases" : "proj.confirm_cancel_cases";
        const ok = window.confirm(t(confirmKey).replace("{n}", openCount));
        if (!ok) return;
      }
      await onClose(project.id, newStatus);
    } else {
      await onUpdate(project.id, { status: newStatus });
    }
  }

  async function handleAssignCase(caseId) {
    await supabase.from("cases").update({ project_id: project.id }).eq("id", caseId);
    await loadProjCases();
    setShowAssign(false);
  }

  async function handleRemoveCase(caseId) {
    await supabase.from("cases").update({ project_id: null }).eq("id", caseId);
    setProjCases(prev => prev.filter(c => c.id !== caseId));
  }

  async function openAssignModal() {
    let q = supabase.from("cases").select("id, title, status")
      .is("project_id", null)
      .order("created_at", { ascending: false });
    if (project.client_id) q = q.eq("client_id", project.client_id);
    const { data } = await q;
    setUnassignedCases(data ?? []);
    setShowAssign(true);
  }

  const canEdit = auth.isAdmin || auth.isManager || auth.isClient || auth.isKeyUser || project.created_by === auth.user?.id;
  const canEditLifecycle = auth.isAdmin || auth.isManager || auth.profile?.role === "project_manager";
  const TERMINAL = ["completed", "cancelled", "terminated", "closed", "approved"];
  const projProgress = projCases.length === 0 ? 0 : Math.round(projCases.filter(c => TERMINAL.includes(c.status)).length / projCases.length * 100);

  // Derived consultants list: all unique consultants across cases
  const consultantMap = new Map();
  projCases.forEach(c => {
    (c.case_assignments ?? []).forEach(a => {
      const uid = a.consultant_id;
      if (!uid) return;
      if (!consultantMap.has(uid)) consultantMap.set(uid, { id: uid, name: a.users?.full_name ?? "Unknown", avatarUrl: a.users?.avatar_url ?? null, cases: [] });
      consultantMap.get(uid).cases.push({ ...c, time_commitment: a.time_commitment });
    });
  });
  const consultants = [...consultantMap.values()];

  async function handleSaveProjLc() {
    setSavingProjLc(true);
    try {
      await onUpdate(project.id, { case_lifecycle: { preset: projLcMode } });
    } catch (e) { alert(e.message); }
    setSavingProjLc(false);
  }

  const projectTabs = [
    { id: "overview",     label: t("project.tab_overview"),      icon: BarChart2,         count: null },
    { id: "objectives",   label: t("project.tab_objectives"),    icon: Target,            count: null },
    { id: "team",         label: t("project.tab_team"),          icon: Users,             count: null },
    { id: "consultants",  label: t("project.tab_consultants"),   icon: UserCheck,         count: consultants.length },
    { id: "requirements", label: t("project.tab_requirements"),  icon: SlidersHorizontal, count: null },
    { id: "cases",        label: t("project.tab_cases"),         icon: FolderOpen,        count: projCases.length },
    { id: "documents",    label: t("project.tab_documents"),     icon: FileText,          count: null },
    { id: "connections",  label: t("project.tab_connections"),   icon: Database,          count: null },
    ...(canEdit ? [{ id: "lifecycle", label: t("project.tab_lifecycle"), icon: TrendingUp, count: null }] : []),
    ...((auth.isAdmin || auth.isManager || auth.isClient || auth.isKeyUser || project.created_by === auth.user?.id || consultants.some(c => c.user_id === auth.user?.id)) ? [{ id: "sap", label: t("project.tab_sap"), icon: Code2, count: null }] : []),
    ...((auth.isAdmin || auth.isManager || auth.isConsultant || auth.isKeyUser) ? [{ id: "transport", label: "Transports", icon: Truck, count: null }] : []),
  ];

  const projTabStatus = (() => {
    const r = {};
    for (const tab of projectTabs) {
      if (projManualCompletions[tab.id] !== undefined) {
        r[tab.id] = projManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      switch (tab.id) {
        case "overview":      r[tab.id] = "in_progress"; break;
        case "objectives":    r[tab.id] = (project.objectives || project.deliverables?.length || project.success_criteria) ? "in_progress" : "none"; break;
        case "team":          r[tab.id] = (project.client || project.stakeholder_name) ? "in_progress" : "none"; break;
        case "consultants":   r[tab.id] = consultants.length > 0 ? "complete" : "none"; break;
        case "requirements":  r[tab.id] = (project.skills_required?.length || project.compliance_notes) ? "in_progress" : "none"; break;
        case "cases":         r[tab.id] = projCases.length > 0 ? "in_progress" : "none"; break;
        default:              r[tab.id] = "none";
      }
    }
    return r;
  })();

  useEffect(() => {
    setProjMountedSlides(prev => { const s = new Set(prev); s.add(activeTab); return s; });
    const el = projCarouselRef.current;
    if (!el) return;
    const idx = projectTabs.findIndex(t => t.id === activeTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    projCarouselScrolling.current = true;
    if (window.innerWidth < 640) {
      el.scrollTo({ top: slide.offsetTop, behavior: 'smooth' });
    } else {
      const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
    const tid = setTimeout(() => { projCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [activeTab]);

  if (projSelectedCase) {
    return (
      <CaseDetail
        caseData={projSelectedCase}
        auth={auth}
        onBack={() => setProjSelectedCase(null)}
        onStatusChange={async (cid, status) => { await updateCase(cid, { status }); setProjSelectedCase(p => ({ ...p, status })); await loadProjCases(); }}
        onDelete={async () => { await deleteCase(projSelectedCase.id); setProjSelectedCase(null); await loadProjCases(); }}
        onUpdate={async (payload) => { await updateCase(projSelectedCase.id, payload); setProjSelectedCase(p => ({ ...p, ...payload })); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Import success banner */}
      {importedCasesCount > 0 && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3.5">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Project created with {importedCasesCount} imported case{importedCasesCount !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">Cases are linked to this project and ready to review below.</p>
          </div>
        </div>
      )}
      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          {t("project.back")}
        </button>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
              <ProjectAvatar project={project} size={44} />
              {canEdit && (
                <>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    title="Change project photo"
                    className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    {uploadingAvatar
                      ? <Loader2 size={16} className="text-white animate-spin" />
                      : <Camera size={16} className="text-white" />}
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{project.name}</h1>
              {(auth.isAdmin || auth.isManager) && project.client?.client_profiles?.company_name && (
                <p className="text-sm text-gray-500 mt-0.5">{project.client.client_profiles.company_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABEL_KEYS[project.status] ? t(STATUS_LABEL_KEYS[project.status]) : cap(fmt(project.status))}
            </span>
            <button onClick={generateProjectReport} disabled={generatingReport}
              className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5 transition-colors disabled:opacity-50">
              {generatingReport ? <><Loader2 size={13} className="animate-spin" />Generating…</> : <><Download size={13} />Report PDF</>}
            </button>
            <button onClick={handleShareLink}
              className={`flex items-center gap-1.5 text-sm border rounded-xl px-3 py-1.5 transition-colors ${shareCopied ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {shareCopied ? <><Check size={13} />Copied!</> : <><Link2 size={13} />Share</>}
            </button>
            {canEdit && (
              <button onClick={() => setShowEditWizard(true)}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5">
                {t("action.edit")}
              </button>
            )}
          </div>
        </div>
        {project.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-3">{project.description}</p>
        )}
        {/* Progress bar */}
        {projCases.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{t("project.progress")}</span>
              <span className="font-semibold text-gray-700">{projProgress}% · {projCases.filter(c => TERMINAL.includes(c.status)).length}/{projCases.length} {t("project.cases_done")}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${projProgress}%` }} />
            </div>
          </div>
        )}

        {/* Project status carousel */}
        {(() => {
          const curIdx = PROJECT_LIFECYCLE_STAGES.findIndex(s => s.key === project.status);
          return (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("project.next_steps")}</p>
              <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {PROJECT_LIFECYCLE_STAGES.map((s, i) => {
                  const isCurrent = s.key === project.status;
                  const isPast    = curIdx >= 0 && i < curIdx;
                  const { Icon } = PROJECT_NEXT_META[s.key] ?? { Icon: Zap };
                  const desc = t({ draft: "proj.meta_draft", active: "proj.meta_active", on_hold: "proj.meta_on_hold", completed: "proj.meta_completed", cancelled: "proj.meta_cancelled" }[s.key] ?? "proj.meta_default");
                  return (
                    <button key={s.key} disabled={isCurrent || !canEdit}
                      onClick={() => !isCurrent && canEdit && handleStatusChange(s.key)}
                      className="flex-shrink-0 w-40 rounded-2xl overflow-hidden text-left relative transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-default"
                      style={{ border: `1.5px solid ${isCurrent ? s.color : isPast ? s.color + "60" : s.color + "30"}`, background: isCurrent ? s.color + "18" : isPast ? s.color + "0a" : "var(--t-card-bg, transparent)", opacity: s.is_terminal && !isCurrent && !isPast ? 0.65 : 1 }}>
                      <Icon size={72} style={{ position: "absolute", bottom: 6, right: 6, opacity: isCurrent ? 0.18 : 0.08, color: s.color, pointerEvents: "none" }} />
                      <div className="px-3 pt-3 pb-2 flex items-center gap-2 relative z-10">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: s.color + (isCurrent ? "30" : "20") }}>
                          {isPast ? <Check size={13} style={{ color: s.color }} /> : <Icon size={13} style={{ color: s.color }} />}
                        </div>
                        <span className="text-xs font-bold" style={{ color: isCurrent ? s.color : isPast ? s.color + "cc" : s.color + "88" }}>
                          {s.labelKey ? t(s.labelKey) : s.label}
                        </span>
                        {isCurrent && (
                          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: s.color, color: "#fff" }}>NOW</span>
                        )}
                      </div>
                      <div className="px-3 pb-3 relative z-10">
                        <p className="text-[10px] leading-snug" style={{ color: isCurrent ? s.color + "cc" : "#6B7280" }}>{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Progress bar */}
      {(() => {
        const done = projectTabs.filter(t => projTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'var(--t-progress-track)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/projectTabs.length)*100}%`, background:'linear-gradient(90deg,var(--t-text-accent),#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--t-text-accent)', whiteSpace:'nowrap' }}>{done}/{projectTabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, projectTabs.findIndex(t => t.id === activeTab));
        function scrollTo(idx) {
          setActiveTab(projectTabs[Math.max(0, Math.min(idx, projectTabs.length - 1))]?.id ?? activeTab);
        }
        function onScroll() {
          if (projCarouselScrolling.current) return;
          const el = projCarouselRef.current;
          if (!el) return;
          let closest = 0, minDist = Infinity;
          if (window.innerWidth < 640) {
            const center = el.scrollTop + el.offsetHeight / 2;
            Array.from(el.children).forEach((child, i) => {
              const dist = Math.abs((child.offsetTop + child.offsetHeight / 2) - center);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
          } else {
            const center = el.scrollLeft + el.offsetWidth / 2;
            Array.from(el.children).forEach((child, i) => {
              const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
          }
          const tab = projectTabs[closest];
          if (tab && tab.id !== activeTab) setActiveTab(tab.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {isMobile ? (
              <>
                {carouselIdx > 0 && (
                  <button onClick={() => scrollTo(carouselIdx - 1)}
                    style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)' }}>
                    <ChevronUp size={16} style={{color:'var(--t-text2)'}}/>
                  </button>
                )}
                {carouselIdx < projectTabs.length - 1 && (
                  <button onClick={() => scrollTo(carouselIdx + 1)}
                    style={{ position:'absolute', bottom:8, left:'50%', transform:'translateX(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)' }}>
                    <ChevronDown size={16} style={{color:'var(--t-text2)'}}/>
                  </button>
                )}
              </>
            ) : (
              <>
                {carouselIdx > 0 && (
                  <button onClick={() => scrollTo(carouselIdx - 1)}
                    style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)', marginTop:-20 }}>
                    <ChevronLeft size={16} style={{color:'var(--t-text2)'}}/>
                  </button>
                )}
                {carouselIdx < projectTabs.length - 1 && (
                  <button onClick={() => scrollTo(carouselIdx + 1)}
                    style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)', marginTop:-20 }}>
                    <ChevronRight size={16} style={{color:'var(--t-text2)'}}/>
                  </button>
                )}
              </>
            )}
            <div ref={projCarouselRef} onScroll={onScroll}
              style={isMobile
                ? { display:'flex', flexDirection:'column', overflowY:'scroll', overflowX:'hidden', scrollSnapType:'y mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:12, padding:'44px 0', maxHeight:'80vh' }
                : { display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {projectTabs.map((tab, i) => {
                const isActive = tab.id === activeTab;
                const Icon = tab.icon;
                const st = projTabStatus[tab.id];
                return (
                  <div key={tab.id}
                    style={isMobile
                      ? { flex:'0 0 auto', width:'100%', maxWidth:'100%', minWidth:0, overflow:'hidden', scrollSnapAlign:'start', scrollSnapStop:'always', opacity:isActive?1:0.85, transition:'opacity .25s' }
                      : { flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'var(--t-border-active)':'var(--t-border)'}`, background:'var(--t-card-bg)', overflow:'hidden', width:'100%', boxSizing:'border-box', height:isMobile?undefined:700, minHeight:isMobile?400:undefined, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.12)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--t-tab-border)', background:isActive?'var(--t-tab-active)':'var(--t-tab-inactive)', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'var(--t-badge-inact-bg)',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'var(--t-text-accent)':'var(--t-text2)',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'var(--t-text)':'var(--t-text2)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'var(--t-badge-act-bg)':'var(--t-badge-inact-bg)',color:isActive?'var(--t-badge-act-color)':'var(--t-badge-inact-color)',flexShrink:0}}>{tab.count}</span>}
                        {isActive && tab.id !== "lifecycle" && (
                          <button onClick={e => { e.stopPropagation(); setProjManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'var(--t-done-border)':'var(--t-pill-inactive-bdr)'}`,background:st==="complete"?'var(--t-done-bg)':'var(--t-tab-inactive)',color:st==="complete"?'var(--t-done-color)':'var(--t-text2)',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {projMountedSlides.has(tab.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

        {/* Overview */}
        {tab.id === "overview" && (() => {
          const ptMeta = PROJECT_TYPES.find(pt => pt.value === project.project_type);
          const PtIcon = ptMeta?.Icon;
          const today = new Date();
          let pctDone = 0;
          let durationDays = null;
          if (project.start_date && project.end_date) {
            const sd = new Date(project.start_date), ed = new Date(project.end_date);
            const total = ed - sd;
            durationDays = Math.round(total / 86400000);
            pctDone = total > 0 ? Math.round((Math.min(Math.max(today - sd, 0), total) / total) * 100) : 0;
          }
          const oc = "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4";
          const CardHdr = ({ icon, label, color }) => (
            <div className="flex items-center gap-2 mb-3">
              <span style={{ color }}>{icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
            </div>
          );
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* 1 — Timeline */}
              {(project.start_date || project.end_date) && (
                <div className={`${oc} sm:col-span-2`}>
                  <CardHdr icon={<Calendar size={13} />} label={t("label.timeline")} color="#6366f1" />
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[80px]">
                      <div className="text-[10px] text-gray-400 mb-0.5">{t("label.start_date")}</div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{project.start_date ? fmtDate(project.start_date) : "—"}</div>
                    </div>
                    <div className="flex-1">
                      <div className="relative h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="absolute left-0 top-0 h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pctDone}%` }} />
                      </div>
                      {durationDays !== null && (
                        <div className="text-[10px] text-center text-gray-400 mt-1">{durationDays} {t("label.days")} · {pctDone}% {t("label.elapsed")}</div>
                      )}
                    </div>
                    <div className="text-center min-w-[80px]">
                      <div className="text-[10px] text-gray-400 mb-0.5">{t("label.end_date")}</div>
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{project.end_date ? fmtDate(project.end_date) : "—"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2 — Budget */}
              {project.total_budget && (
                <div className={oc}>
                  <CardHdr icon={<DollarSign size={13} />} label={t("label.budget")} color="#10b981" />
                  <div className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">${Number(project.total_budget).toLocaleString()}</div>
                  {project.expected_consultants && (
                    <div className="text-xs text-gray-400 mt-1">{project.expected_consultants} {t("project.consultants_needed")}</div>
                  )}
                </div>
              )}

              {/* 3 — Classification */}
              {(project.priority || project.work_mode || project.project_type || project.industry || project.area_sap) && (
                <div className={oc}>
                  <CardHdr icon={<Layers size={13} />} label={t("label.classification")} color="#8b5cf6" />
                  <div className="space-y-2">
                    {project.priority && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">{t("label.priority")}</span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PRIORITY_COLORS[project.priority] ?? "bg-gray-100 text-gray-600"}`}>{PRIORITY_LABEL_KEYS[project.priority] ? t(PRIORITY_LABEL_KEYS[project.priority]) : cap(project.priority)}</span>
                      </div>
                    )}
                    {project.work_mode && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">{t("project.work_mode")}</span>
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">{WORK_MODE_LABEL_KEYS[project.work_mode] ? t(WORK_MODE_LABEL_KEYS[project.work_mode]) : cap(project.work_mode)}</span>
                      </div>
                    )}
                    {project.project_type && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">{t("proj.rev_basics")}</span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {PtIcon && <PtIcon size={12} className="text-violet-500" />}
                          {ptMeta?.label ?? project.project_type}
                        </span>
                      </div>
                    )}
                    {project.industry && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">{t("label.industry")}</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">{project.industry}</span>
                      </div>
                    )}
                    {project.area_sap && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 flex-shrink-0">{t("project.sap_area")}</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">{project.area_sap}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4 — People */}
              {(project.stakeholder_name || project.billing_contact_name) && (
                <div className={oc}>
                  <CardHdr icon={<Users size={13} />} label={t("label.people")} color="#0ea5e9" />
                  <div className="space-y-3">
                    {project.stakeholder_name && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 flex-shrink-0 select-none">
                          {project.stakeholder_name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{project.stakeholder_name}</div>
                          <div className="text-[10px] text-gray-400">{t("project.key_stakeholder")}{project.stakeholder_email ? ` · ${project.stakeholder_email}` : ""}</div>
                        </div>
                      </div>
                    )}
                    {project.billing_contact_name && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300 flex-shrink-0 select-none">
                          {project.billing_contact_name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{project.billing_contact_name}</div>
                          <div className="text-[10px] text-gray-400">{t("project.billing_contact")}{project.billing_contact_email ? ` · ${project.billing_contact_email}` : ""}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5 — Description */}
              {project.description && (
                <div className={`${oc} sm:col-span-2`}>
                  <CardHdr icon={<FileText size={13} />} label={t("label.description")} color="#64748b" />
                  <div className="flex gap-3">
                    <div className="w-1 flex-shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-600 self-stretch" />
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{project.description}</p>
                  </div>
                </div>
              )}

              {/* 6 — Skills */}
              {project.skills_required?.length > 0 && (
                <div className={oc}>
                  <CardHdr icon={<Zap size={13} />} label={t("label.skills")} color="#3b82f6" />
                  <div className="flex flex-wrap gap-1.5">
                    {project.skills_required.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 7 — Deliverables */}
              {project.deliverables?.length > 0 && (
                <div className={oc}>
                  <CardHdr icon={<Target size={13} />} label={t("project.deliverables")} color="#8b5cf6" />
                  <div className="flex flex-wrap gap-1.5">
                    {project.deliverables.map((d, i) => (
                      <span key={i} className="px-2 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold rounded-lg">{d}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 8 — Compliance */}
              {project.compliance_notes && (
                <div className={`${oc} sm:col-span-2 !border-amber-200 dark:!border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10`}>
                  <CardHdr icon={<Shield size={13} />} label={t("project.compliance")} color="#f59e0b" />
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{project.compliance_notes}</p>
                </div>
              )}

            </div>
          );
        })()}

        {/* Objectives */}
        {tab.id === "objectives" && (
          <div className="space-y-4">
            {project.objectives && (
              <div>
                <p className="text-xs text-gray-400 mb-1">{t("project.goals")}</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.objectives}</p>
              </div>
            )}
            {project.deliverables?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">{t("project.deliverables")}</p>
                <div className="flex flex-wrap gap-2">
                  {project.deliverables.map((d, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg">{d}</span>
                  ))}
                </div>
              </div>
            )}
            {project.success_criteria && (
              <div>
                <p className="text-xs text-gray-400 mb-1">{t("project.success_criteria")}</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.success_criteria}</p>
              </div>
            )}
            {project.out_of_scope && (
              <div>
                <p className="text-xs text-gray-400 mb-1">{t("project.out_of_scope")}</p>
                <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap italic">{project.out_of_scope}</p>
              </div>
            )}
            {!project.objectives && !project.deliverables?.length && !project.success_criteria && !project.out_of_scope && (
              <p className="text-sm text-gray-400">{t("project.no_objectives")}</p>
            )}
          </div>
        )}

        {/* Team & Contacts */}
        {tab.id === "team" && (() => {
          const clientName = project.client?.client_profiles?.company_name ?? project.client?.full_name;
          const uniqueManagers = [...new Map(projCases.filter(c => c.manager?.id).map(c => [c.manager.id, c.manager])).values()];

          function TeamCard({ avatar, name, role, email, extra, children }) {
            return (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                <div className="flex items-center gap-4 px-4 py-4">
                  <div className="flex-shrink-0">{avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {role && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{role}</span>}
                      {email && <span className="text-xs text-gray-400 truncate">{email}</span>}
                    </div>
                    {extra && <div className="mt-1.5">{extra}</div>}
                  </div>
                </div>
                {children}
              </div>
            );
          }

          return (
            <div className="space-y-5 text-sm">
              {/* Client */}
              {project.client && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("label.client")}</p>
                  <TeamCard
                    avatar={project.client?.avatar_url
                      ? <img src={project.client.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                      : <UserAvatar name={clientName} size={48} />}
                    name={clientName}
                    role={t("label.client")}
                    email={project.client.full_name && project.client.client_profiles?.company_name ? project.client.full_name : project.client.email}
                  />
                </div>
              )}

              {/* Managers */}
              {uniqueManagers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("project.managers")}</p>
                  <div className="space-y-3">
                    {uniqueManagers.map(m => {
                      const mCases = projCases.filter(c => c.manager?.id === m.id);
                      return (
                        <TeamCard key={m.id}
                          avatar={<UserAvatar name={m.full_name} size={48} />}
                          name={m.full_name}
                          role={t("project.managers")}
                          email={m.email}
                          extra={mCases.length > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {t(mCases.length !== 1 ? "count.case_many" : "count.case_one").replace("{n}", mCases.length)} assigned
                            </span>
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Consultants */}
              {consultants.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("project.tab_consultants")} ({consultants.length})</p>
                  <div className="space-y-3">
                    {consultants.map(con => {
                      const activeCases = con.cases.filter(c => !TERMINAL.includes(c.status));
                      const doneCases   = con.cases.filter(c => TERMINAL.includes(c.status));
                      const avgCommit   = con.cases.length
                        ? Math.round(con.cases.reduce((s, c) => s + (c.time_commitment ?? 0), 0) / con.cases.length)
                        : 0;
                      return (
                        <div key={con.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                          {/* Consultant header */}
                          <div className="flex items-center gap-4 px-4 py-4">
                            <PersonAvatar name={con.name} avatarUrl={con.avatarUrl} size={48} />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{con.name}</p>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                                {t("project.tab_consultants").replace(/s$/i, "")}
                              </span>
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-4 flex-shrink-0">
                              {activeCases.length > 0 && (
                                <div className="text-center">
                                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{activeCases.length}</p>
                                  <p className="text-[10px] text-gray-400">{t("label.active_count")}</p>
                                </div>
                              )}
                              {doneCases.length > 0 && (
                                <div className="text-center">
                                  <p className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">{doneCases.length}</p>
                                  <p className="text-[10px] text-gray-400">{t("label.done_count")}</p>
                                </div>
                              )}
                              {avgCommit > 0 && (
                                <div className="text-center">
                                  <p className="text-xl font-bold text-gray-600 dark:text-gray-300 tabular-nums">{avgCommit}%</p>
                                  <p className="text-[10px] text-gray-400">{t("label.commitment")}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Cases */}
                          {con.cases.length > 0 && (
                            <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3 space-y-2">
                              {con.cases.map(c => {
                                const conStage = getProjTmplStages(projLcMode).find(s => s.key === c.status);
                                const conColor = conStage?.color ?? "#6B7280";
                                const ConIcon  = getStageIcon(c.status);
                                return (
                                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                                    style={{ background: conColor + "14", border: `1px solid ${conColor}30` }}>
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                      style={{ background: conColor + "28" }}>
                                      <ConIcon size={13} style={{ color: conColor }} />
                                    </div>
                                    <span className="font-medium text-gray-800 dark:text-gray-100 text-sm truncate flex-1">{c.title}</span>
                                    <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                                      {STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}
                                    </span>
                                    {c.time_commitment != null && (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full flex-shrink-0">{c.time_commitment}%</span>
                                    )}
                                    <button onClick={() => setProjSelectedCase(c)}
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors"
                                      style={{ background: conColor + "20", color: conColor }}>
                                      {t("project.open")} →
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contacts */}
              {(project.stakeholder_name || project.stakeholder_email || project.billing_contact_name || project.billing_contact_email) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("project.contacts")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(project.stakeholder_name || project.stakeholder_email) && (
                      <TeamCard
                        avatar={<UserAvatar name={project.stakeholder_name ?? 'S'} size={48} />}
                        name={project.stakeholder_name ?? "—"}
                        role={t("project.key_stakeholder")}
                        email={project.stakeholder_email}
                      />
                    )}
                    {(project.billing_contact_name || project.billing_contact_email) && (
                      <TeamCard
                        avatar={<UserAvatar name={project.billing_contact_name ?? 'B'} size={48} />}
                        name={project.billing_contact_name ?? "—"}
                        role={t("project.billing_contact")}
                        email={project.billing_contact_email}
                      />
                    )}
                  </div>
                </div>
              )}

              {!project.client && uniqueManagers.length === 0 && consultants.length === 0 &&
               !project.stakeholder_name && !project.billing_contact_name && (
                <p className="text-sm text-gray-400">{t("project.no_team")}</p>
              )}
            </div>
          );
        })()}

        {/* Requirements */}
        {tab.id === "requirements" && (
          <div className="space-y-6">
            {project.skills_required?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">{t("label.skills")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {project.skills_required.map((s, i) => {
                    const meta = SKILL_ICON_MAP[s] ?? { Icon: Settings, color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800", border: "border-gray-200 dark:border-gray-700" };
                    const { Icon, color, bg, border } = meta;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-4 rounded-xl border ${bg} ${border}`}>
                        <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {project.compliance_notes && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{t("project.compliance")}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{project.compliance_notes}</p>
              </div>
            )}
            {!project.skills_required?.length && !project.compliance_notes && (
              <p className="text-sm text-gray-400">{t("project.no_requirements")}</p>
            )}
          </div>
        )}

        {/* Cases */}
        {tab.id === "cases" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-900">
                {t(projCases.length !== 1 ? "proj.cases_in_many" : "proj.cases_in_one").replace("{n}", projCases.length)}
              </span>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button onClick={openAssignModal}
                    className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-4 py-2">
                    {t("project.assign_existing")}
                  </button>
                  <button onClick={() => { setShowImportPanel(p => !p); setImportPreview(null); setImportFile(null); setImportError(null); }}
                    className={`text-sm border font-semibold rounded-xl px-4 py-2 flex items-center gap-1.5 transition-colors ${showImportPanel ? 'border-violet-400 text-violet-700 bg-violet-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <Upload size={13} /> Import from doc
                  </button>
                  <button onClick={() => setShowTemplateModal(true)}
                    className="text-sm border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold rounded-xl px-4 py-2 flex items-center gap-1.5 transition-colors">
                    <LayoutTemplate size={13} /> Apply Template
                  </button>
                  {(auth.isAdmin || auth.isManager) && projCases.length > 0 && (
                    <button onClick={() => setShowSaveTmplModal(true)}
                      className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-4 py-2 flex items-center gap-1.5 transition-colors">
                      <Copy size={13} /> Save as Template
                    </button>
                  )}
                  <button onClick={() => setShowCreateCase(true)}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2">
                    + New Case
                  </button>
                </div>
              )}
            </div>

            {/* Import from document panel */}
            {showImportPanel && canEdit && (
              <div className="mb-5 border border-violet-200 rounded-xl overflow-hidden">
                <div className="bg-violet-600 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload size={14} className="text-white" />
                    <span className="text-sm font-bold text-white">Import Cases from Document</span>
                  </div>
                  <button onClick={() => setShowImportPanel(false)} className="text-violet-200 hover:text-white"><X size={15} /></button>
                </div>
                {!importPreview ? (
                  <div className="bg-white p-5">
                    <p className="text-xs text-gray-500 mb-3">Upload a project plan (PDF, DOCX, TXT, CSV). The AI will extract cases and show them for review before creating anything.</p>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors"
                      onClick={() => importFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setImportFile(f); }}>
                      <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                      {importFile
                        ? <p className="text-sm font-semibold text-violet-700">{importFile.name}</p>
                        : <><p className="text-sm font-medium text-gray-600">Drop a file or click to browse</p><p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, CSV — max 10 MB</p></>}
                      <input ref={importFileRef} type="file" accept=".pdf,.docx,.txt,.csv,.md" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f); e.target.value = ''; }} />
                    </div>
                    {importError && <p className="mt-3 text-xs text-red-600">{importError}</p>}
                    <button onClick={handleImportExtract} disabled={!importFile || extractingImport}
                      className="mt-4 w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                      {extractingImport ? <><Spinner size={13} /> Extracting cases…</> : <><Sparkles size={13} /> Extract Cases</>}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="bg-white divide-y divide-gray-100">
                      <div className="px-4 py-2 flex items-center gap-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs font-semibold text-gray-500">{importPreview.filter(c => c._selected).length} of {importPreview.length} cases selected</span>
                        <button onClick={() => setImportPreview(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">← change file</button>
                      </div>
                      {importPreview.map((c, idx) => (
                        <div key={idx} className={`flex items-start gap-3 px-4 py-3 transition-colors ${c._selected ? '' : 'opacity-50 bg-gray-50'}`}>
                          <button
                            onClick={() => setImportPreview(p => p.map((it, i) => i === idx ? { ...it, _selected: !it._selected } : it))}
                            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${c._selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
                            {c._selected && <Check size={10} className="text-white" />}
                          </button>
                          <select value={c.priority}
                            onChange={e => setImportPreview(p => p.map((it, i) => i === idx ? { ...it, priority: e.target.value } : it))}
                            className="flex-shrink-0 text-[10px] font-bold rounded border border-gray-200 bg-transparent py-0.5 px-1 mt-0.5">
                            {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <input value={c.title}
                            onChange={e => setImportPreview(p => p.map((it, i) => i === idx ? { ...it, title: e.target.value } : it))}
                            className="flex-1 min-w-0 text-sm text-gray-800 font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-violet-400 focus:outline-none py-0.5 transition-colors" />
                          {c.area_sap && <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 mt-0.5">{c.area_sap}</span>}
                          {c.est_hours && <span className="flex-shrink-0 text-[10px] text-gray-500 mt-0.5">{c.est_hours}h</span>}
                        </div>
                      ))}
                    </div>
                    {importError && <div className="px-4 py-2 bg-red-50"><p className="text-xs text-red-600">{importError}</p></div>}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
                      <span className="text-xs text-gray-500">{importPreview.filter(c => c._selected).length} cases will be created in this project</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setImportPreview(null); setImportFile(null); }}
                          className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                          Discard
                        </button>
                        <button onClick={handleImportConfirm} disabled={confirmingImport || !importPreview.some(c => c._selected)}
                          className="px-4 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                          {confirmingImport ? <><Spinner size={10} /> Creating…</> : <><Check size={12} /> Create {importPreview.filter(c => c._selected).length} Cases</>}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {showTemplateModal && (
              <ApplyTemplateModal
                projectId={project.id}
                clientId={project.client_id ?? null}
                userId={auth.user?.id}
                onClose={() => setShowTemplateModal(false)}
                onDone={async () => { await loadProjCases(); setShowTemplateModal(false); }}
              />
            )}
            {showSaveTmplModal && (
              <SaveTemplateModal
                cases={projCases}
                auth={auth}
                onClose={() => setShowSaveTmplModal(false)}
                onSaved={() => { setShowSaveTmplModal(false); }}
              />
            )}
            {projCases.length === 0 ? (
              <EmptyState Icon={FolderOpen} title={t("project.no_proj_cases")} subtitle={t("project.no_proj_cases_hint")} />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {projCases.map(c => {
                  const assignees = c.case_assignments ?? [];
                  const progress = c.progress_pct ?? 0;
                  const isDone = TERMINAL.includes(c.status);
                  const StageIcon = getStageIcon(c.status);
                  const lcStages = getProjTmplStages(projLcMode);
                  const stage = lcStages.find(s => s.key === c.status);
                  const stageColor = stage?.color ?? "#6B7280";
                  return (
                    <div key={c.id} className="rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm"
                      style={{ border: `1px solid ${stageColor}40` }}>

                      {/* Card header */}
                      <div className="flex items-center gap-3 px-4 py-3"
                        style={{ background: stageColor + "12", borderBottom: `1px solid ${stageColor}25` }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: stageColor + "28" }}>
                          <StageIcon size={17} style={{ color: stageColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug">{c.title}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}
                        </span>
                        {c.priority && (
                          <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-lg ${PRIORITY_COLORS[c.priority] ?? ""}`}>
                            {PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}
                          </span>
                        )}
                      </div>

                      {/* Card body */}
                      <div className="px-4 py-3 space-y-3">
                        {/* Progress */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t("label.progress")}</span>
                            <span className="text-[10px] font-bold tabular-nums" style={{ color: isDone ? "#22C55E" : stageColor }}>{progress}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${progress}%`, background: isDone ? "#22C55E" : stageColor }} />
                          </div>
                        </div>

                        {/* Meta row */}
                        {(c.due_date || c.budget || c.sap_area) && (
                          <div className="flex gap-4 flex-wrap">
                            {c.due_date && (
                              <div className="flex items-center gap-1.5">
                                <Calendar size={11} className="text-gray-400 flex-shrink-0" />
                                <span className="text-[11px] text-gray-500">{fmtDate(c.due_date)}</span>
                              </div>
                            )}
                            {c.budget && (
                              <div className="flex items-center gap-1.5">
                                <DollarSign size={11} className="text-gray-400 flex-shrink-0" />
                                <span className="text-[11px] text-gray-500">{c.budget}</span>
                              </div>
                            )}
                            {c.sap_area && (
                              <div className="flex items-center gap-1.5">
                                <Layers size={11} className="text-gray-400 flex-shrink-0" />
                                <span className="text-[11px] text-gray-500">{c.sap_area}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Assignees */}
                        {assignees.length > 0 && (
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5 flex-shrink-0">{t("project.assigned_consultants")}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {assignees.slice(0, 4).map(a => (
                                <div key={a.consultant_id} className="flex items-center gap-1.5">
                                  <PersonAvatar name={a.users?.full_name ?? '?'} avatarUrl={a.users?.avatar_url} size={22} title={a.users?.full_name} />
                                  <span className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">{a.users?.full_name?.split(' ')[0] ?? '?'}</span>
                                  {a.time_commitment && (
                                    <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{a.time_commitment}%</span>
                                  )}
                                </div>
                              ))}
                              {assignees.length > 4 && (
                                <span className="text-[11px] text-gray-400">+{assignees.length - 4}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Footer: manager + actions */}
                        <div className="flex items-center justify-between pt-1 border-t dark:border-gray-700" style={{ borderColor: stageColor + "20" }}>
                          <div className="flex items-center gap-2">
                            {c.manager && (
                              <div className="flex items-center gap-1.5">
                                <PersonAvatar name={c.manager.full_name} avatarUrl={c.manager.avatar_url} size={20} title={`Manager: ${c.manager.full_name}`} />
                                <span className="text-[11px] text-gray-500">{c.manager.full_name}</span>
                                <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{t("project.manager")}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <button onClick={e => { e.stopPropagation(); handleRemoveCase(c.id); }}
                                className="text-[11px] text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                {t("action.remove")}
                              </button>
                            )}
                            <button onClick={() => setProjSelectedCase(c)}
                              className="text-[11px] font-bold px-3 py-1.5 rounded-xl transition-colors"
                              style={{ background: stageColor + "20", color: stageColor }}>
                              {t("project.open_case")} →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Consultants */}
        {tab.id === "consultants" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-900">
                {t(consultants.length !== 1 ? "proj.consultants_on_many" : "proj.consultants_on_one").replace("{n}", consultants.length)}
              </span>
            </div>
            {consultants.length === 0 ? (
              <EmptyState Icon={UserCheck} title={t("project.no_consultants")} subtitle={t("project.no_consultants_hint")} />
            ) : (
              <div className="space-y-3">
                {consultants.map(con => {
                  const isExpanded = expandedConsultant === con.id;
                  const activeCases = con.cases.filter(c => !TERMINAL.includes(c.status));
                  const doneCases = con.cases.filter(c => TERMINAL.includes(c.status));
                  return (
                    <div key={con.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? "border-blue-200 dark:border-blue-800 shadow-sm" : "border-gray-200 dark:border-gray-700"} bg-white dark:bg-gray-800`}>
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        onClick={() => setExpandedConsultant(isExpanded ? null : con.id)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <PersonAvatar name={con.name} avatarUrl={con.avatarUrl} size={36} />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{con.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {con.cases.length} {con.cases.length !== 1 ? t("dashboard.case_plural") : t("dashboard.case_single")}
                              {activeCases.length > 0 && ` · ${activeCases.length} ${t("label.active_count")}`}
                              {doneCases.length > 0 && ` · ${doneCases.length} ${t("label.completed_count")}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {activeCases.length > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-blue-700">{activeCases.length} {t("label.active_count")}</span>
                          )}
                          {doneCases.length > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-50 text-green-700">{doneCases.length} {t("label.done_count")}</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 space-y-2">
                          {con.cases.map(c => {
                            const conStage = getProjTmplStages(projLcMode).find(s => s.key === c.status);
                            const conColor = conStage?.color ?? "#6B7280";
                            const ConIcon = getStageIcon(c.status);
                            return (
                              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                                style={{ background: conColor + "14", border: `1px solid ${conColor}30` }}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: conColor + "28" }}>
                                  <ConIcon size={13} style={{ color: conColor }} />
                                </div>
                                <span className="font-medium text-gray-800 dark:text-gray-100 text-sm truncate flex-1">{c.title}</span>
                                <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}
                                </span>
                                {c.time_commitment != null && (
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full flex-shrink-0">{c.time_commitment}%</span>
                                )}
                                <button onClick={() => setProjSelectedCase(c)}
                                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors"
                                  style={{ background: conColor + "20", color: conColor }}>
                                  {t("project.open")} →
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Documents */}
        {tab.id === "documents" && (
          <ProjectDocsTab projectId={project.id} auth={auth} />
        )}

        {/* Connections */}
        {tab.id === "connections" && (
          <ProjectConnectionsTab projectId={project.id} clientId={project.client_id} auth={auth} />
        )}

        {/* SAP Setup */}
        {tab.id === "sap" && (
          project.client_id
            ? <ProjectSapEnvPanel projectId={project.id} clientId={project.client_id} auth={auth} />
            : <ProjectOwnSapPanel projectId={project.id} auth={auth} />
        )}

        {/* Transports */}
        {tab.id === "transport" && (auth.isAdmin || auth.isManager || auth.isConsultant || auth.isKeyUser) && (
          <TransportTab projectData={project} projectCases={projCases} auth={auth} />
        )}

        {/* Lifecycle */}
        {tab.id === "lifecycle" && canEdit && (() => {
          const sysLcDefault = _importSS?.["default_lifecycle_config"];
          const projOverrideAllowed = clientLcConfig?.allow_project_override ?? sysLcDefault?.project?.allow_override ?? true;
          const tmplList = lcTemplates2.length ? lcTemplates2 : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }));
          const previewStages = getProjTmplStages(projLcMode);
          const previewActive = previewStages.filter(s => !s.is_terminal);
          const previewTerminal = previewStages.filter(s => s.is_terminal);
          return (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{t("project.lifecycle_source")}</span>
                {project.case_lifecycle
                  ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">{t("project.this_project")}</span>
                  : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold">{t("project.company_inherited")}</span>}
                {canEditLifecycle && !projOverrideAllowed && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-1">
                    <Lock size={13} className="inline mr-1" />{t("project.override_locked")}
                  </span>
                )}
              </div>

              {canEditLifecycle && !projOverrideAllowed && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                  {t("project.lifecycle_lock_msg")}
                </div>
              )}

              {canEditLifecycle && projOverrideAllowed && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {tmplList.map(tmpl => {
                      const isSelected = projLcMode === tmpl.key;
                      const active = tmpl.stages.filter(s => !s.is_terminal);
                      const isBuiltin = ["short","standard","full"].includes(tmpl.key);
                      return (
                        <button key={tmpl.key} onClick={() => setProjLcMode(tmpl.key)}
                          className={`text-left p-3 rounded-xl border-2 transition-all ${
                            isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-sm text-gray-900">{isBuiltin ? t(`lc.preset_${tmpl.key}_name`) : tmpl.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{isBuiltin ? t(`lc.preset_${tmpl.key}_subtitle`) : (tmpl.subtitle ?? "")}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {(() => {
                const lcGates = (_importSS?.["transition_gates"] ?? {})[projLcMode] ?? {};
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("project.flow_preview")}</p>
                    <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                      {previewActive.map((s, i) => {
                        const gate = lcGates[s.key];
                        const gateOn = gate?.enabled;
                        const enabledConds = gateOn
                          ? (gate.conditions ?? []).filter(c => c.enabled)
                          : [];
                        const WIcon = getStageIcon(s.key);
                        return (
                          <div key={s.key} className="flex-shrink-0 flex items-stretch gap-0">
                            <div className="w-44 rounded-xl overflow-hidden shadow-sm relative"
                              style={{ border: `1px solid ${s.color}40`, background: s.color + "18" }}>
                              {/* Watermark icon */}
                              <WIcon size={90} style={{ position: "absolute", bottom: 8, right: 8, opacity: 0.18, color: s.color, pointerEvents: "none", zIndex: 0 }} />
                              {/* Card header */}
                              <div className="px-3 py-2 flex items-center gap-2 relative z-10"
                                style={{ borderBottom: `1px solid ${s.color}30`, background: s.color + "28" }}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                <span className="text-xs font-bold truncate flex-1" style={{ color: s.color }}>{s.label}</span>
                                <span className="text-[10px] flex-shrink-0 tabular-nums font-semibold" style={{ color: s.color + "99" }}>{i + 1}/{previewActive.length}</span>
                              </div>
                              {/* Gate conditions */}
                              <div className="px-3 py-2.5 min-h-[72px] relative z-10">
                                {enabledConds.length > 0 ? (
                                  <div className="space-y-1.5">
                                    <p className="text-[9px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: s.color + "bb" }}>
                                      <Lock size={8} /> Entry gates ({enabledConds.length})
                                    </p>
                                    {enabledConds.map(c => {
                                      const def = GATE_CONDITIONS.find(g => g.key === c.key);
                                      const isBlock = c.mode !== "warn";
                                      return (
                                        <div key={c.key} className="flex items-start gap-1.5">
                                          <div className="mt-[3px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ background: isBlock ? "#ef4444" : "#f59e0b" }} />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[10px] leading-tight" style={{ color: s.color + "cc" }}>{def?.label ?? c.key}</p>
                                            <span className={`text-[9px] font-bold uppercase tracking-wide ${isBlock ? "text-red-500" : "text-amber-500"}`}>
                                              {isBlock ? "block" : "warn"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] italic mt-1" style={{ color: s.color + "66" }}>No entry gates</p>
                                )}
                              </div>
                            </div>
                            {i < previewActive.length - 1 && (
                              <div className="flex items-center px-1 flex-shrink-0">
                                <span className="text-gray-300 dark:text-gray-600 text-sm">→</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {previewTerminal.length > 0 && (
                        <>
                          <div className="flex items-center px-1 flex-shrink-0">
                            <span className="text-gray-300 dark:text-gray-600 text-sm">→</span>
                          </div>
                          {previewTerminal.map(s => {
                            const WIcon = getStageIcon(s.key);
                            return (
                            <div key={s.key} className="flex-shrink-0 w-36 rounded-xl overflow-hidden opacity-60 relative"
                              style={{ border: `1px solid ${s.color}40`, background: s.color + "18" }}>
                              <WIcon size={70} style={{ position: "absolute", bottom: 6, right: 6, opacity: 0.18, color: s.color, pointerEvents: "none" }} />
                              <div className="px-3 py-2 flex items-center gap-2 relative z-10"
                                style={{ borderBottom: `1px solid ${s.color}30`, background: s.color + "28" }}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                <span className="text-xs font-bold truncate" style={{ color: s.color }}>{s.label}</span>
                              </div>
                              <div className="px-3 py-2.5 relative z-10">
                                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: s.color + "99" }}>Terminal</span>
                              </div>
                            </div>
                          ); })}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {canEditLifecycle && projOverrideAllowed && (
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <button onClick={handleSaveProjLc} disabled={savingProjLc}
                    className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                    {savingProjLc ? t("state.saving") : t("project.save_lifecycle")}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
                        </div>
                      ) : (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Spinner />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer pill bar */}
            <div style={{ marginTop:10, background:'var(--t-pill-bar)', borderRadius:12, border:'1px solid var(--t-border)', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {projectTabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;
                const st = projTabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'var(--t-pill-act-border)':st==="complete"?'var(--t-done-border)':'var(--t-pill-inactive-bdr)'}`, background:isActive?'var(--t-pill-act-bg)':st==="complete"?'var(--t-done-bg)':'var(--t-pill-inactive-bg)', color:isActive?'var(--t-pill-act-color)':st==="complete"?'var(--t-done-color)':'var(--t-text2)', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>}
                    <span>{tab.label}</span>
                    {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'var(--t-done-bg)':'var(--t-badge-inact-bg)',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'var(--t-done-color)':'var(--t-badge-inact-color)'}}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Edit project wizard */}
      {showEditWizard && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateProjectWizard
            auth={auth}
            initialData={project}
            clients={clients}
            onSave={async (payload) => {
              const updated = await onUpdate(project.id, payload);
              return updated;
            }}
            onComplete={() => setShowEditWizard(false)}
            onCancel={() => setShowEditWizard(false)}
          />
        </div>
      )}

      {/* Create case wizard (pre-linked to this project) */}
      {showCreateCase && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateCaseWizard
            auth={auth}
            createCase={createCase}
            initialProjectId={project.id}
            defaultMode={wizardMode.getMode("case")}
            onComplete={async () => {
              setShowCreateCase(false);
              const { data } = await supabase.from("cases")
                .select("*, case_assignments(consultant_id)")
                .eq("project_id", project.id)
                .order("created_at", { ascending: false });
              setProjCases(data ?? []);
            }}
            onCancel={() => setShowCreateCase(false)}
          />
        </div>
      )}

      {/* Assign case modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{t("project.assign_modal_title")}</h2>
              <button onClick={() => setShowAssign(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-2">
              {unassignedCases.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{t("project.no_unassigned")}</p>
              ) : unassignedCases.map(c => (
                <button key={c.id} onClick={() => handleAssignCase(c.id)}
                  className="w-full text-left border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                  <div className="font-medium text-gray-900 text-sm">{c.title}</div>
                  <span className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectsView({ auth, initialProjectId }) {
  const { t } = useT();
  const perms = usePermissions(auth);
  const wizardMode = useWizardMode(auth);
  const clientFetchFilter = auth.isClient ? { client_id: auth.user?.id } : {};
  const { projects, loading, createProject, updateProject, closeProject } = useProjects(clientFetchFilter);
  const { templates: lcTemplates } = useLifecycleTemplates();
  const [statusFilter, setStatusFilter]       = useState("");
  const [clientChipFilter, setClientChipFilter] = useState("");
  const [showCreate, setShowCreate]           = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [importBanner, setImportBanner]       = useState(null);
  const [clients, setClients]                 = useState([]);

  useEffect(() => {
    if (auth.isAdmin || auth.isManager) {
      supabase.from("users")
        .select("id, full_name, client_profiles(company_name)")
        .eq("role", "client")
        .then(({ data }) => setClients(data ?? []));
    }
  }, []);

  // Client chips (admin/manager only)
  const clientChips = useMemo(() => {
    if (!auth.isAdmin && !auth.isManager) return [];
    const map = new Map();
    projects.forEach(p => {
      if (!p.client_id) return;
      const name = p.client?.client_profiles?.company_name || p.client?.full_name || p.client_id;
      const ts = p.updated_at || p.created_at || '';
      if (!map.has(p.client_id) || ts > map.get(p.client_id).latest) {
        map.set(p.client_id, { id: p.client_id, name, latest: ts, count: 0 });
      }
      map.get(p.client_id).count += 1;
    });
    return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [projects, auth.isAdmin, auth.isManager]);

  const clientFiltered = clientChipFilter ? projects.filter(p => p.client_id === clientChipFilter) : projects;
  const TERM_ALL = ["completed","cancelled","terminated","closed","approved"];
  const displayed = statusFilter === "__overdue__"
    ? clientFiltered.filter(p => !TERM_ALL.includes(p.status) && p.end_date && new Date(p.end_date) < new Date())
    : statusFilter
    ? clientFiltered.filter(p => p.status === statusFilter)
    : clientFiltered;

  // Open a specific project when navigated from GlobalSearch
  const [initialProjectOpened, setInitialProjectOpened] = useState(false);
  useEffect(() => {
    if (!initialProjectId || initialProjectOpened || loading) return;
    const match = projects.find(p => p.id === initialProjectId);
    if (match) { setSelectedProject(match); setInitialProjectOpened(true); return; }
    if (projects.length > 0) {
      supabase.from('projects').select('*').eq('id', initialProjectId).single()
        .then(({ data }) => { if (data) { setSelectedProject(data); setInitialProjectOpened(true); } });
    }
  }, [initialProjectId, initialProjectOpened, loading, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        auth={auth}
        clients={clients}
        importedCasesCount={importBanner?.projectId === selectedProject?.id ? importBanner.count : 0}
        onBack={() => { setSelectedProject(null); setImportBanner(null); }}
        onUpdate={async (id, updates) => {
          const updated = await updateProject(id, updates);
          setSelectedProject(updated);
          return updated;
        }}
        onClose={async (id, newStatus) => {
          const updated = await closeProject(id, newStatus);
          setSelectedProject(updated);
        }}
      />
    );
  }

  if (showCreate) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <CreateProjectWizard
          auth={auth}
          createProject={createProject}
          clients={clients}
          defaultMode={wizardMode.getMode("project")}
          onComplete={(newProj, caseCount) => {
            setShowCreate(false);
            if (newProj?.id) {
              setSelectedProject(newProj);
              if (caseCount > 0) setImportBanner({ projectId: newProj.id, count: caseCount });
            }
          }}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("projects.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t(displayed.length !== 1 ? "count.project_many" : "count.project_one").replace("{n}", displayed.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient || perms.can("create_projects")) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm transition-colors">
            {t("projects.new")}
          </button>
        )}
      </div>

      {/* Client chip row (admin/manager only) */}
      {(auth.isAdmin || auth.isManager) && clientChips.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setClientChipFilter("")}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                !clientChipFilter ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              <Building2 size={11} /> All clients
              <span className={`ml-1 text-[10px] ${!clientChipFilter ? "opacity-70" : "text-gray-400"}`}>{projects.length}</span>
            </button>
            {clientChips.map(cl => (
              <button key={cl.id}
                onClick={() => setClientChipFilter(f => f === cl.id ? "" : cl.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  clientChipFilter === cl.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700"
                }`}>
                <Building2 size={11} className="flex-shrink-0" />
                <span className="truncate max-w-[120px]">{cl.name}</span>
                <span className={`text-[10px] ${clientChipFilter === cl.id ? "opacity-70" : "text-gray-400"}`}>{cl.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status stat tiles */}
      {(() => {
        const TERM_ALL = ["completed","cancelled","terminated","closed","approved"];
        const overdueProjects = projects.filter(p => !TERM_ALL.includes(p.status) && p.end_date && new Date(p.end_date) < new Date());
        const statTiles = [
          { val: "",          label: t("projects.all"),         Icon: Layers,       color: "gray",   count: projects.length },
          { val: "draft",     label: t("projects.draft"),       Icon: FileEdit,     color: "gray",   count: projects.filter(p => p.status === "draft").length },
          { val: "active",    label: t("label.active"),         Icon: Activity,     color: "green",  count: projects.filter(p => p.status === "active").length  },
          { val: "on_hold",   label: t("projects.on_hold"),     Icon: PauseCircle,  color: "yellow", count: projects.filter(p => p.status === "on_hold").length },
          { val: "completed", label: t("dashboard.completed"),  Icon: CheckCircle2, color: "teal",   count: projects.filter(p => p.status === "completed").length },
          { val: "cancelled", label: t("projects.cancelled"),   Icon: XCircle,      color: "red",    count: projects.filter(p => p.status === "cancelled").length },
          ...(overdueProjects.length > 0 ? [{ val: "__overdue__", label: "Overdue", Icon: AlertCircle, color: "red", count: overdueProjects.length }] : []),
        ].filter(s => s.val === "" || s.count > 0);
        const colorMap = {
          blue:   { iconBg: 'rgba(37,99,235,0.15)',   iconClr: '#60A5FA', activeBg: 'rgba(37,99,235,0.20)',   activeBdr: 'rgba(96,165,250,0.7)',   numClr: '#60A5FA' },
          green:  { iconBg: 'rgba(16,185,129,0.15)',  iconClr: '#4ADE80', activeBg: 'rgba(16,185,129,0.20)',  activeBdr: 'rgba(74,222,128,0.7)',   numClr: '#4ADE80' },
          teal:   { iconBg: 'rgba(20,184,166,0.15)',  iconClr: '#2DD4BF', activeBg: 'rgba(20,184,166,0.20)',  activeBdr: 'rgba(45,212,191,0.7)',   numClr: '#2DD4BF' },
          yellow: { iconBg: 'rgba(245,158,11,0.15)',  iconClr: '#FCD34D', activeBg: 'rgba(245,158,11,0.20)',  activeBdr: 'rgba(253,224,71,0.7)',   numClr: '#FCD34D' },
          red:    { iconBg: 'rgba(239,68,68,0.15)',   iconClr: '#F87171', activeBg: 'rgba(239,68,68,0.20)',   activeBdr: 'rgba(248,113,113,0.7)',  numClr: '#F87171' },
          gray:   { iconBg: 'rgba(100,116,139,0.18)', iconClr: '#94A3B8', activeBg: 'rgba(100,116,139,0.22)', activeBdr: 'rgba(156,163,175,0.55)', numClr: '#94A3B8' },
        };
        return (
          <div className="flex gap-3 mb-6 overflow-x-auto px-1 py-1 -mx-1 -mt-1" style={{ scrollbarWidth: "none" }}>
            {statTiles.map(s => {
              const isActive = statusFilter === s.val;
              const cm = colorMap[s.color];
              return (
                <button key={s.val}
                  onClick={() => setStatusFilter(f => f === s.val ? "" : s.val)}
                  className="text-left rounded-xl px-4 py-3 border-2 transition-all flex items-center gap-3 flex-shrink-0"
                  style={isActive
                    ? { background: cm.activeBg, borderColor: cm.activeBdr }
                    : { background: 'var(--t-tab-inactive)', borderColor: 'var(--t-border)' }}>
                  <div style={{ background: cm.iconBg, color: cm.iconClr, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <s.Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div style={{ color: isActive ? cm.numClr : 'var(--t-text)' }} className="text-xl font-bold leading-none">{s.count}</div>
                    <div className="text-xs mt-0.5 whitespace-nowrap" style={{ color: 'var(--t-text2)' }}>{s.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Project list */}
      {displayed.length === 0 ? (
        <EmptyState
          Icon={Layers}
          title={t("projects.no_projects")}
          subtitle={t("projects.no_proj_hint")}
          action={
            (auth.isAdmin || auth.isManager || auth.isClient || perms.can("create_projects")) && (
              <button onClick={() => setShowCreate(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm mt-2">
                {t("projects.create_first")}
              </button>
            )
          }
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          {displayed.map(p => {
            const TERM_S = ["completed","cancelled","terminated","closed","approved"];
            const totalCases     = p.cases?.length ?? 0;
            const doneCases      = p.cases?.filter(c => TERM_S.includes(c.status)).length ?? 0;
            const activeCases    = p.cases?.filter(c => c.status === "in_progress").length ?? 0;
            const progress       = totalCases === 0 ? 0 : Math.round(doneCases / totalCases * 100);
            const company        = p.client?.client_profiles?.company_name ?? p.client?.full_name;
            const isTerminated   = TERM_S.includes(p.status);
            const isOverdue      = !isTerminated && p.end_date && new Date(p.end_date) < new Date();
            const PRIORITY_STYLES = { critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-yellow-100 text-yellow-700", low: "bg-gray-100 text-gray-500" };
            const PROJ_CARD_COLORS = { draft: { border: "rgba(156,163,175,0.35)", bg: "rgba(100,116,139,0.08)" }, active: { border: "rgba(134,239,172,0.42)", bg: "rgba(16,185,129,0.09)" }, on_hold: { border: "rgba(252,211,77,0.42)", bg: "rgba(245,158,11,0.09)" }, completed: { border: "rgba(94,234,212,0.42)", bg: "rgba(20,184,166,0.09)" }, cancelled: { border: "rgba(252,165,165,0.42)", bg: "rgba(239,68,68,0.09)" } };
            const cardColors = isOverdue ? { border: "rgba(252,165,165,0.42)", bg: "rgba(239,68,68,0.09)" } : (PROJ_CARD_COLORS[p.status] ?? { border: "rgba(100,160,220,0.22)", bg: "rgba(12,21,34,0.4)" });
            return (
              <div key={p.id}
                className="rounded-2xl cursor-pointer transition-all hover:shadow-md p-5"
                style={{ border: `1.5px solid ${cardColors.border}`, backgroundColor: cardColors.bg }}
                onClick={() => setSelectedProject(p)}>
                <div className="flex items-start gap-4">
                  {/* Project avatar (falls back to client avatar → initials) */}
                  <div className="flex-shrink-0 mt-0.5">
                    <ProjectAvatar project={p} size={44} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 text-base leading-snug">{p.name}</h3>
                        {(auth.isAdmin || auth.isManager) && company && (
                          <p className="text-xs text-gray-500 mt-0.5">{company}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isOverdue && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700">Overdue</span>
                        )}
                        {p.priority && p.priority !== "medium" && (
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg capitalize ${PRIORITY_STYLES[p.priority] ?? "bg-gray-100 text-gray-600"}`}>{p.priority}</span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL_KEYS[p.status] ? t(STATUS_LABEL_KEYS[p.status]) : cap(fmt(p.status))}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {p.description && (
                      <p className="text-sm text-gray-500 leading-snug mb-2 line-clamp-2">{p.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mb-3">
                      {totalCases > 0 && (
                        <span>
                          <span className="font-semibold text-gray-700">{totalCases}</span>{" "}{totalCases !== 1 ? t("count.case_suffix_many") : t("count.case_suffix_one")}
                          {activeCases > 0 && <span className="ml-1 text-blue-500 font-semibold">{t("label.n_active").replace("{n}", activeCases)}</span>}
                        </span>
                      )}
                      {p.total_budget && (
                        <span>{t("label.budget")}: <span className="font-semibold text-gray-700">${Number(p.total_budget).toLocaleString()}</span></span>
                      )}
                      {p.project_type && p.project_type !== 'consulting' && (() => {
                        const ptMeta = PROJECT_TYPES.find(pt => pt.value === p.project_type);
                        const PtIcon = ptMeta?.Icon;
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 rounded-lg font-medium border border-violet-100">
                            {PtIcon && <PtIcon size={11} />}
                            {ptMeta?.label ?? p.project_type}
                          </span>
                        );
                      })()}
                      {p.area_sap && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg font-medium">{p.area_sap}</span>}
                      {p.industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg font-medium">{p.industry}</span>}
                      {p.case_lifecycle?.preset && p.case_lifecycle.preset !== "standard" && (() => {
                        const preset = p.case_lifecycle.preset;
                        const tmpl = lcTemplates.find(t => t.key === preset);
                        const label = tmpl?.name ?? LIFECYCLE_PRESETS[preset]?.name ?? preset.replace(/_/g, " ");
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-lg font-medium border border-purple-100">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M5 3v2l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            {label}
                          </span>
                        );
                      })()}
                      {(p.start_date || p.end_date) && (
                        <span>
                          {p.start_date ? fmtDate(p.start_date) : "?"} → {p.end_date ? fmtDate(p.end_date) : "?"}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {totalCases > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                          <span>{t("cd.progress_bar")}</span>
                          <span className="font-semibold text-gray-600">{progress}% · {doneCases}/{totalCases} {t("dashboard.done")}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
                            style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

export { PROJECT_STATUS_COLORS, PROJECT_LIFECYCLE_STAGES, PROJECT_NEXT_META, AVATAR_PALETTE, UserAvatar, PersonAvatar, ProjectAvatar, CreateProjectWizard, ProjectConnectionsTab, ProjectDetail, ProjectsView };
