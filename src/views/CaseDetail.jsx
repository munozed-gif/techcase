import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, AlertTriangle, Archive, BadgeCheck, BarChart2, Briefcase,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Clock, Code2, Crosshair, ExternalLink, Eye, FileImage, FileText,
  Flag, FolderOpen, Globe, Handshake, Inbox, Layers, LayoutTemplate, Link,
  Link2, ListChecks, Lock, MessageSquare, Monitor, Paperclip, PauseCircle, Pencil,
  Play, Receipt, RotateCcw, Search, SlidersHorizontal, Sparkles, Star,
  Target, Trash2, TrendingUp, Upload, User, UserCheck, UserPlus, Users,
  Wand2, X, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import {
  useMilestones, useCaseComments, useSlaConfig, useSubCases,
  useClientTeamMembers, useInvoices, useTimeEntries, useCaseActivities,
  useCaseDocuments, useProjectDbConnections, getStageRules, activityAdherence,
} from "../hooks/useCoreHooks.js";
import { useCases, useApplications, useRatings } from "../hooks/useCaseHooks.js";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { usePlanConfig, useSystemSettings, useVisibilitySettings, usePermissions } from "../hooks/useSystemSettings.jsx";
import { notify, notifyManagers, notifyCaseParticipants, callClaude, logEvent } from "../lib/utils.js";
import { Badge, ROLE_LABELS, Spinner, TrustBadge } from "../components/ProfileComponents.jsx";
import { EmptyState, Modal, Input, Textarea, Select } from "../components/ui.jsx";
import { CaseFeedbackModal, ApplicantRankingSection } from "../components/RankingComponents.jsx";
import {
  ProjectFieldEditor,
  getStageIcon, CaseLifecycleTrack, LifecycleFlowDiagram,
  SpecificationTab, GenerationProfileModal,
  buildContextString, buildSectionConstraint, buildGenSuffix, openHtmlInNewTab, htmlStringToPdfBlob,
} from "../components/CaseSubPanels.jsx";
import { TimeLogPanel } from "../components/TimeLogPanel.jsx";
import { CaseFilesPanel } from "../components/CaseFilesPanel.jsx";
import { InvoiceModal } from "../components/InvoiceModal.jsx";
import { InviteConsultantDrawer } from "../components/InviteConsultantDrawer.jsx";
import {
  fmtDate, fmt, cap,
  STATUS_LABEL_KEYS, PRIORITY_LABEL_KEYS, WORK_MODE_LABEL_KEYS,
  EXPERTISE_LABEL_KEYS, AVAIL_LABEL_KEYS, SLA_TIER_LABEL_KEYS,
  INVOICE_STATUS_COLORS, INV_STATUS_LABEL_KEYS, timeAgo,
} from "../lib/uiUtils.jsx";
import { SAP_ENV_TYPE_META, SapImplementationTab } from "../components/SapPanels.jsx";
import { useCaseSpecification } from "../hooks/useNotificationHooks.js";
import { GENERATION_CONTEXT_DEFAULTS } from "../lib/constants.js";
import { SaveCaseAsTemplateModal } from "./CaseTemplates.jsx";
import { CreateCaseWizard } from "../components/CreateCaseWizard.jsx";
import { PersonAvatar, ProjectAvatar } from "./Projects.jsx";
import { ClientRatingModal, RatingModal } from "./SystemSettingsView.jsx";
import {
  STATUS_COLORS, CASE_CARD_COLORS, PRIORITY_COLORS, STATUS_CARD_ICONS,
  ROLE_COLORS, APP_STATUS_COLORS, PROJECT_TYPES,
  SAP_AREAS, INDUSTRY_AREAS, LIFECYCLE_PRESETS,
  DEFAULT_ACTIVITY_PHASES, getLifecycleStages, GATE_CONDITIONS,
} from "../lib/businessConstants.js";

function CaseDetail({ caseData, auth, onStatusChange, onDelete, onApply, onUpdate, onBack }) {
  const { t } = useT();
  const { settings: cdSettings } = useSystemSettings();
  const visCfg        = useVisibilitySettings();
  const genModel      = cdSettings["ai_model"]       ?? 'claude-haiku-4-5-20251001';
  const analysisModel = cdSettings["analysis_model"] ?? 'claude-haiku-4-5-20251001';
  const { applications, apply, reviewApplication } = useApplications(caseData.id);
  const { milestones, toggleMilestone, addMilestone } = useMilestones(caseData.id);
  const { comments, addComment } = useCaseComments(caseData.id);
  const { subCases, createSubCase, refetch: refetchSubCases } = useSubCases(caseData.id);
  const { documents, addDocument, deleteDocument, refetch: refetchDocuments } = useCaseDocuments(caseData.id);
  const { entries: timeEntries, addTimeEntry, approveEntry } = useTimeEntries(caseData.id);
  const { invoices } = useInvoices(caseData.id);
  const [actRefreshKey, setActRefreshKey] = useState(0);
  const { activities, addActivity, updateActivity, deleteActivity, refetch: refetchActivities } = useCaseActivities(caseData.id, actRefreshKey);

  // Transition gate modal
  const [gateModal, setGateModal] = useState(null); // { toStatus, toLabel, blockers: [...], warnings: [...] }

  const [activeTab, setActiveTab]   = useState("detail");
  const carouselRef = useRef(null);
  const carouselScrolling = useRef(false);
  const pipelineRef = useRef(null);
  const pipelineScrolling = useRef(false);
  const [pipelineActiveIdx, setPipelineActiveIdx] = useState(0);
  const [mountedSlides, setMountedSlides] = useState(() => new Set(["detail"]));
  const [manualCompletions, setManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_mc_${caseData.id}`) ?? "{}"); } catch { return {}; }
  });
  function setManualComplete(tabId, done) {
    setManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_mc_${caseData.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Resolve active SAP environment for display in header
  const ssCtxCD = useSystemSettings();
  const _sapClientData  = (cdSettings['sap_integration'] ?? {})[caseData.client_id] ?? {};
  const _sapEnvs        = _sapClientData.environments ?? (_sapClientData.host ? [_sapClientData] : []);
  const _sapCaseEnvMap  = cdSettings['sap_case_env'] ?? {};
  const _sapCaseEnvId   = _sapCaseEnvMap[caseData.id]
                       ?? (cdSettings['sap_project_env'] ?? {})[caseData.project_id]
                       ?? null;
  const _activeSapEnv   = _sapEnvs.length > 0
    ? (_sapCaseEnvId ? (_sapEnvs.find(e => e.id === _sapCaseEnvId) ?? _sapEnvs[0]) : _sapEnvs[0])
    : null;
  const [showSapEnvPicker, setShowSapEnvPicker] = useState(false);

  async function _saveCaseEnv(envId) {
    await ssCtxCD.setSetting('sap_case_env', { ..._sapCaseEnvMap, [caseData.id]: envId || null });
    setShowSapEnvPicker(false);
  }

  const [newMilestone, setNewMilestone] = useState("");
  const [commentForm, setCommentForm]  = useState({ body: "", hoursLogged: 0, progressUpdate: "", isInternal: false });
  const [sendingComment, setSendingComment] = useState(false);
  const [progressPct, setProgressPct]       = useState(caseData.progress_pct ?? 0);
  const [pendingStageKey, setPendingStageKey] = useState(null); // soft-warning inline confirm
  const [showSubCaseForm, setShowSubCaseForm] = useState(false);
  const [subCaseForm, setSubCaseForm] = useState({ title: "", description: "", priority: "medium", status: "open" });
  const [savingSubCase, setSavingSubCase] = useState(false);
  const [selectedSubCase, setSelectedSubCase] = useState(null);
  // V9 Document state
  const docFileRef = useRef();
  const [docNotes, setDocNotes]         = useState("");
  const [docCategory, setDocCategory]   = useState("requirements");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showDocForm, setShowDocForm]   = useState(false);
  const [pendingDocFile, setPendingDocFile] = useState(null);
  // V9 Time entry state
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm]         = useState({ date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true, activity_id: "" });
  const [savingTime, setSavingTime]     = useState(false);
  const [logTimeActId, setLogTimeActId]       = useState(null);
  const [generatingTestPlan, setGeneratingTestPlan] = useState(false);
  const [testPlanSaved, setTestPlanSaved]     = useState(false);
  const [testPlanTarget, setTestPlanTarget]   = useState(null); // { fromPhase, toPhase } while generating
  const [testPlanPreview, setTestPlanPreview] = useState(null); // { targetPhase, activities: [], markdown } | null
  const [confirmingTestPlan, setConfirmingTestPlan] = useState(false); // creating activities from preview
  const [generatedPlanPhases, setGeneratedPlanPhases] = useState([]); // phase keys already generated this session
  const [generatingAdjustment, setGeneratingAdjustment] = useState(false);
  const [adjustmentTarget, setAdjustmentTarget]         = useState(null); // { testPhase, adjPhase }
  const [adjustmentPreview, setAdjustmentPreview]       = useState(null); // { adjPhase, adjLabel, activities[], markdown }
  const [confirmingAdjustment, setConfirmingAdjustment] = useState(false);
  const [generatedAdjPhases, setGeneratedAdjPhases]     = useState([]); // adj phase keys done this session
  // Activities state
  const [actView, setActView]           = useState("list");  // "list" | "flow"
  const [clientActivityPhases, setClientActivityPhases] = useState(null);
  const [showActForm, setShowActForm]   = useState(false);
  const [actForm, setActForm]           = useState({ title: "", description: "", detail: "", est_hours: 4, start_date_plan: "", end_date_plan: "", phase: "", predecessor_ids: [] });
  const [savingAct, setSavingAct]       = useState(false);
  const [editingActId, setEditingActId] = useState(null);
  const [editActForm, setEditActForm]   = useState({});
  const [expandedActId, setExpandedActId] = useState(null);
  const [selectedActIds, setSelectedActIds] = useState(new Set());
  const [deletingBulkActs, setDeletingBulkActs] = useState(false);
  const [selectedSubIds, setSelectedSubIds] = useState(new Set());
  const [deletingBulkSubs, setDeletingBulkSubs] = useState(false);
  const [actType, setActType]             = useState("task");       // "task" | "sub_case"
  const [subCaseMode, setSubCaseMode]     = useState("create");     // "create" | "link"
  const [caseSearchQuery, setCaseSearchQuery]   = useState("");
  const [caseSearchResults, setCaseSearchResults] = useState([]);
  const [searchingCases, setSearchingCases]       = useState(false);
  const [selectedLinkedCase, setSelectedLinkedCase] = useState(null);
  // Import activities from document
  const [showImportAct, setShowImportAct]         = useState(false);
  const [importDocId, setImportDocId]             = useState(null);
  const [importDocFile, setImportDocFile]         = useState(null);
  const importActFileRef                          = useRef();
  const [extractingActs, setExtractingActs]       = useState(false);
  const [extractedActs, setExtractedActs]         = useState([]);
  const [importingActs, setImportingActs]         = useState(false);
  const [importResult, setImportResult]           = useState(null); // { count } | { error }
  const [importStep, setImportStep]               = useState('select'); // 'select' | 'preview' | 'done'

  const [showEditWizard, setShowEditWizard]     = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [clientLifecycle, setClientLifecycle] = useState(null);
  const [parentCaseLifecycle, setParentCaseLifecycle] = useState(null);
  const [cancelModal, setCancelModal] = useState(null); // { caseId, isSubCase }
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [standbyModal, setStandbyModal] = useState(false);
  const [standbyReason, setStandbyReason] = useState("");
  const [standbyNotes, setStandbyNotes] = useState("");
  const [approvalModal, setApprovalModal]     = useState(false);
  const [approvalBypass, setApprovalBypass]   = useState("");
  const [ratingModal, setRatingModal]         = useState(null); // { caseId, caseTitle, rateeId, rateeName, rateeRole, raterRole }
  const [clientRatingModal, setClientRatingModal] = useState(null); // { caseId, caseTitle, clientId, clientName }
  const [generatingClosure, setGeneratingClosure] = useState(false);
  const [generatingDevPlan, setGeneratingDevPlan] = useState(false);
  const [devPlanPreview, setDevPlanPreview]   = useState(null);
  const [confirmingDevPlan, setConfirmingDevPlan] = useState(false);
  const [devPlanOutputMode, setDevPlanOutputMode] = useState('activities');
  const [devPlanGenerated, setDevPlanGenerated] = useState(false);
  const [showDevPlanModal, setShowDevPlanModal] = useState(false);
  const [pendingDevPlanIsRegen, setPendingDevPlanIsRegen] = useState(false);
  const [projectLifecycle, setProjectLifecycle] = useState(null);
  const [lcMode, setLcMode] = useState(caseData.case_lifecycle?.preset ?? null);
  const [savingLc, setSavingLc] = useState(false);
  const { templates: caseLcTemplates, getTemplateStages: getCaseTmplStages } = useLifecycleTemplates();
  const { spec: caseSpec } = useCaseSpecification(caseData.id, auth.user?.id);
  const [hhProposals, setHhProposals] = useState([]);
  const [hhProposalsSaving, setHhProposalsSaving] = useState(false);

  const [caseFilesForSpec, setCaseFilesForSpec] = useState([]);

  useEffect(() => {
    if (!caseData.is_head_hunter) return;
    supabase.from("hh_proposals")
      .select("*, headhunter:headhunter_id(id, full_name, avatar_url)")
      .eq("case_id", caseData.id)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => setHhProposals(data ?? []));
  }, [caseData.id, caseData.is_head_hunter]);

  useEffect(() => {
    if (!caseData.id) return;
    supabase.from("case_files").select("id, file_name, name").eq("case_id", caseData.id)
      .then(({ data }) => setCaseFilesForSpec(data ?? []));
  }, [caseData.id]);

  async function reviewHhProposal(proposalId, newStatus) {
    setHhProposalsSaving(true);
    const updates = { status: newStatus, reviewed_at: new Date().toISOString(), reviewed_by: auth.user?.id };
    await supabase.from("hh_proposals").update(updates).eq("id", proposalId);
    if (newStatus === "accepted") {
      const proposal = hhProposals.find(p => p.id === proposalId);
      if (proposal) {
        await supabase.from("cases").update({ head_hunter_id: proposal.headhunter_id }).eq("id", caseData.id);
        await supabase.from("hh_proposals").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: auth.user?.id })
          .eq("case_id", caseData.id).neq("id", proposalId).eq("status", "pending");
        onUpdate?.({ ...caseData, head_hunter_id: proposal.headhunter_id });
        notify(proposal.headhunter_id, "Proposal accepted", `Your proposal to manage "${caseData.title}" has been accepted.`);
      }
    }
    if (newStatus === "rejected") {
      const proposal = hhProposals.find(p => p.id === proposalId);
      if (proposal) {
        notify(proposal.headhunter_id, "Proposal not selected", `Your proposal for "${caseData.title}" was not selected.`);
      }
    }
    const { data } = await supabase.from("hh_proposals")
      .select("*, headhunter:headhunter_id(id, full_name, avatar_url)")
      .eq("case_id", caseData.id).order("submitted_at", { ascending: false });
    setHhProposals(data ?? []);
    setHhProposalsSaving(false);
  }

  useEffect(() => {
    if (!caseData.client_id) return;
    supabase.from("client_profiles")
      .select("case_lifecycle, activity_phases")
      .eq("id", caseData.client_id)
      .single()
      .then(({ data }) => {
        setClientLifecycle(data?.case_lifecycle ?? null);
        setClientActivityPhases(data?.activity_phases ?? null);
      });
  }, [caseData.client_id]);

  useEffect(() => {
    if (!caseData.project_id) return;
    supabase.from("projects")
      .select("case_lifecycle")
      .eq("id", caseData.project_id)
      .single()
      .then(({ data }) => setProjectLifecycle(data?.case_lifecycle ?? null));
  }, [caseData.project_id]);

  // Fetch parent case lifecycle for subcases
  useEffect(() => {
    if (!caseData.parent_case_id) return;
    supabase.from("cases")
      .select("case_lifecycle")
      .eq("id", caseData.parent_case_id)
      .maybeSingle()
      .then(({ data }) => setParentCaseLifecycle(data?.case_lifecycle ?? null));
  }, [caseData.parent_case_id]);

  // Sync lcMode once inherited lifecycle resolves.
  // Chain: parent case → project → client → standard
  useEffect(() => {
    if (!caseData.case_lifecycle) {
      const effectivePreset = parentCaseLifecycle?.preset ?? projectLifecycle?.preset ?? clientLifecycle?.preset ?? "standard";
      setLcMode(effectivePreset);
    }
  }, [parentCaseLifecycle, projectLifecycle, clientLifecycle]);

  const effectiveLifecycle = caseData.case_lifecycle ?? parentCaseLifecycle ?? projectLifecycle ?? clientLifecycle;
  const lifecycleStages = getLifecycleStages(effectiveLifecycle, caseLcTemplates);
  const subCaseInitialStatus = (lifecycleStages.find(s => s.is_initial) ?? lifecycleStages.find(s => !s.is_terminal))?.key ?? "open";

  // Scroll pipeline carousel to current status whenever status or stages change
  useEffect(() => {
    const allDisplay = lifecycleStages.filter(s => s.trigger !== "auto");
    const idx = allDisplay.findIndex(s => s.key === caseData.status);
    if (idx < 0) return;
    setPipelineActiveIdx(idx);
    const timer = setTimeout(() => {
      const el = pipelineRef.current;
      if (!el) return;
      const child = el.children[idx];
      if (child) child.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
    }, 80);
    return () => clearTimeout(timer);
  }, [caseData.status, lifecycleStages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the lifecycle key used to look up gates
  const lifecycleKey = effectiveLifecycle?.preset ?? effectiveLifecycle?.key ?? "standard";

  // Gate runtime data bundle (same shape as GATE_CONDITIONS checks)
  const gateData = { milestones, timeEntries, documents, invoices, activities, applications, spec: caseSpec, hhProposals };

  // Returns { blockers: [...], warnings: [...] } for a given target status
  function checkTransitionGates(toStatus) {
    const allGates = cdSettings["transition_gates"] ?? {};
    const lcGates = allGates[lifecycleKey] ?? {};
    const gate = lcGates[toStatus];
    if (!gate?.enabled) return { blockers: [], warnings: [] };

    // Check if user's role is exempt
    const exemptRoles = gate.exempt_roles ?? ["admin"];
    if (exemptRoles.includes(auth.role)) return { blockers: [], warnings: [] };

    const activeConditions = (gate.conditions ?? []).filter(c => c.enabled);
    const blockers = [];
    const warnings = [];

    for (const cond of activeConditions) {
      const def = GATE_CONDITIONS.find(d => d.key === cond.key);
      if (!def) continue;
      const passed = def.check(caseData, gateData);
      if (!passed) {
        const item = { key: cond.key, label: def.label, fixHint: def.fixHint };
        if (cond.mode === "block") blockers.push(item);
        else warnings.push(item);
      }
    }
    return { blockers, warnings };
  }

  // Intercept status change: check gates, show modal if needed, else proceed
  function handleStatusChangeWithGates(caseId, toStatus, extra) {
    if (!onStatusChange) return;
    const toStage = lifecycleStages.find(s => s.key === toStatus);
    const { blockers, warnings } = checkTransitionGates(toStatus);
    if (blockers.length > 0 || warnings.length > 0) {
      setGateModal({ caseId, toStatus, toLabel: toStage?.label ?? toStatus, toColor: toStage?.color, blockers, warnings, extra });
      return;
    }
    onStatusChange(caseId, toStatus, extra);
  }

  async function handleReviewApplication(appId, appStatus, notes) {
    await reviewApplication(appId, appStatus, notes);
    if (appStatus === "accepted" && onStatusChange) {
      if (caseData.status === "assigned") return; // already in target status
      const curStage = lifecycleStages.find(s => s.key === caseData.status);
      const isTerminal = curStage?.is_terminal ?? ["completed","cancelled"].includes(caseData.status);
      if (isTerminal) return;
      const allowedNextKeys = curStage?.allowed_next?.length
        ? curStage.allowed_next
        : lifecycleStages.map(s => s.key).filter(k => k !== caseData.status);
      const autoStage = lifecycleStages.find(s =>
        allowedNextKeys.includes(s.key) &&
        (s.trigger === "auto" || s.trigger === "both")
      );
      // Use auto-trigger stage from lifecycle config, or fall back to "assigned"
      await onStatusChange(caseData.id, autoStage?.key ?? "assigned");
    }
  }
  useEffect(() => {
    setSubCaseForm(p => ({ ...p, status: subCaseInitialStatus }));
  }, [subCaseInitialStatus]);
  const isTerminalStatus = lifecycleStages.find(s => s.key === caseData.status)?.is_terminal
    ?? ["completed","cancelled"].includes(caseData.status);
  const currentStage = lifecycleStages.find(s => s.key === caseData.status);
  const stageRules   = getStageRules(currentStage, auth);
  const perms        = usePermissions(auth);
  const canEditPhase        = perms.can('edit_activity_phase');
  const canEditPredecessors = perms.can('edit_activity_predecessors');
  const canBulkDeleteActs   = perms.can('bulk_delete_activities');
  const canBulkDeleteSubs   = perms.can('bulk_delete_subcases');
  const canEditCase  = onUpdate && !isTerminalStatus && stageRules.editable
    && (auth.isAdmin || auth.isManager || (auth.isClient && caseData.client_id === auth.user?.id));

  async function handleSaveCaseLc() {
    if (!lcMode) return;
    setSavingLc(true);
    try {
      await onUpdate(caseData.id, { case_lifecycle: { preset: lcMode } });
    } catch (e) { console.error("Save lifecycle failed:", e.message); }
    setSavingLc(false);
  }

  const CANCEL_REASONS = [
    t("cd.cancel_reason_withdrew"),
    t("cd.cancel_reason_budget"),
    t("cd.cancel_reason_timeline"),
    t("cd.cancel_reason_requirements"),
    t("cd.cancel_reason_duplicate"),
    t("cd.cancel_reason_no_candidate"),
    t("cd.cancel_reason_proj_changed"),
    t("cd.cancel_reason_other"),
  ];

  const STANDBY_REASONS = [
    t("cd.standby_reason_client"),
    t("cd.standby_reason_budget"),
    t("cd.standby_reason_resources"),
    t("cd.standby_reason_external"),
    t("cd.standby_reason_pause"),
    t("cd.standby_reason_deliverable"),
    t("cd.cancel_reason_other"),
  ];

  function initCancelModal(caseId, isSubCase = false) {
    setCancelReason("");
    setCancelNotes("");
    setCancelModal({ caseId, isSubCase });
  }

  async function confirmCancellation() {
    if (!cancelReason || !cancelNotes.trim()) return;
    if (cancelModal.isSubCase) {
      await supabase.from("cases")
        .update({ status: "cancelled", cancellation_reason: cancelReason, cancellation_notes: cancelNotes || null })
        .eq("id", cancelModal.caseId);
      logEvent('case.cancelled', { entityType: 'case', entityId: cancelModal?.caseId, entityName: selectedSubCase?.title, newValue: { status: 'cancelled' }, metadata: { reason: cancelReason } });
      setSelectedSubCase(prev => ({ ...prev, status: "cancelled" }));
    } else {
      await onStatusChange(cancelModal.caseId, "cancelled", {
        cancellation_reason: cancelReason,
        cancellation_notes: cancelNotes || null,
      });
    }
    setCancelModal(null);
  }

  async function confirmStandby() {
    if (!standbyReason) return;
    const detail = standbyNotes.trim() ? ` — ${standbyNotes.trim()}` : "";
    await onStatusChange(caseData.id, "standby", {
      standby_reason: standbyReason,
      standby_notes: standbyNotes || null,
    });
    await addComment({
      body: `Case placed on standby.\nReason: ${standbyReason}${detail}`,
      isInternal: false,
    });
    await notifyCaseParticipants(caseData.id, auth.user?.id,
      "Case on standby",
      `"${caseData.title}" has been placed on standby. Reason: ${standbyReason}${detail}`,
      { case_id: caseData.id, event_type: "status_change" }
    );
    setStandbyModal(false);
    setStandbyReason("");
    setStandbyNotes("");
  }

  const myApp = applications.find(a => a.consultant_id === auth.user?.id);
  const doneMilestones = milestones.filter(m => m.is_done).length;
  const milestonePct = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;
  const canAddSubCase = (auth.isAdmin || auth.isManager || auth.isClient)
    && !["completed", "cancelled"].includes(caseData.status)
    && stageRules.editable;

  const canDelete =
    caseData.status === "open" &&
    (auth.isAdmin || auth.isManager || (auth.isClient && caseData.client_id === auth.user?.id));

  async function handleAddMilestone() {
    if (!newMilestone.trim()) return;
    await addMilestone(newMilestone.trim());
    setNewMilestone("");
  }

  async function handleComment() {
    if (!commentForm.body.trim()) return;
    setSendingComment(true);
    try {
      await addComment({
        body: commentForm.body,
        hoursLogged: Number(commentForm.hoursLogged) || 0,
        progressUpdate: commentForm.progressUpdate !== "" ? Number(commentForm.progressUpdate) : null,
        isInternal: commentForm.isInternal,
      });
      if (commentForm.progressUpdate !== "") setProgressPct(Number(commentForm.progressUpdate));
      setCommentForm({ body: "", hoursLogged: 0, progressUpdate: "", isInternal: false });
    } catch (e) { alert(e.message); }
    setSendingComment(false);
  }

  async function handleBulkDeleteActs() {
    if (!selectedActIds.size) return;
    if (!window.confirm(`Delete ${selectedActIds.size} activit${selectedActIds.size === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    setDeletingBulkActs(true);
    try {
      const ids = [...selectedActIds];
      const { error } = await supabase.from('case_activities').delete().in('id', ids);
      if (error) throw error;
      setSelectedActIds(new Set());
      setActRefreshKey(k => k + 1);
    } catch (e) { alert('Failed to delete: ' + e.message); }
    setDeletingBulkActs(false);
  }

  async function handleBulkDeleteSubs() {
    if (!selectedSubIds.size) return;
    if (!window.confirm(`Delete ${selectedSubIds.size} sub-case${selectedSubIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setDeletingBulkSubs(true);
    try {
      const ids = [...selectedSubIds];
      // Delete sub-cases + any linked activity rows in parent case
      await supabase.from('case_activities').delete().in('linked_case_id', ids);
      const { error } = await supabase.from('cases').delete().in('id', ids);
      if (error) throw error;
      setSelectedSubIds(new Set());
      await refetchSubCases();
      setActRefreshKey(k => k + 1);
    } catch (e) { alert('Failed to delete sub-cases: ' + e.message); }
    setDeletingBulkSubs(false);
  }

  async function handleCreateSubCase() {
    if (!subCaseForm.title.trim()) return;
    setSavingSubCase(true);
    try {
      await createSubCase({
        ...subCaseForm,
        client_id: caseData.client_id,
        manager_id: caseData.manager_id,
      });
      setSubCaseForm({ title: "", description: "", priority: "medium", status: subCaseInitialStatus });
      setShowSubCaseForm(false);
    } catch (e) { alert(e.message); }
    setSavingSubCase(false);
  }

  const totalTimeHours = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);

  async function openDocInNewTab(doc) {
    // HTML files stored in Supabase get wrong Content-Type → fetch and re-open as blob
    if (doc.file_name?.endsWith('.html') || doc.file_type?.includes('html')) {
      try {
        const resp = await fetch(doc.file_url);
        const html = await resp.text();
        openHtmlInNewTab(html);
      } catch (_) {
        window.open(doc.file_url, '_blank');
      }
    } else {
      // PDFs and other files open directly (Supabase serves them correctly)
      window.open(doc.file_url, '_blank');
    }
  }

  async function handleDocUpload() {
    if (!pendingDocFile) return;
    setUploadingDoc(true);
    try {
      const catLabels = { requirements: "Requirements", deliverable: "Deliverable", reference: "Reference", other: "Other" };
      const tag = catLabels[docCategory] ?? "Other";
      const fullNotes = docNotes.trim() ? `[${tag}] ${docNotes.trim()}` : `[${tag}]`;
      await addDocument(pendingDocFile, fullNotes);
      setPendingDocFile(null); setDocNotes(""); setDocCategory("requirements"); setShowDocForm(false);
    } catch (e) { alert(e.message); }
    setUploadingDoc(false);
  }

  async function handleTimeLog() {
    if (!timeForm.hours || !timeForm.description.trim()) return;
    setSavingTime(true);
    try {
      const entryData = { ...timeForm, case_id: caseData.id, hours: Number(timeForm.hours) };
      if (!entryData.activity_id) delete entryData.activity_id;
      await addTimeEntry(entryData);
      // Auto-transition: if activity was pending, move it to in_progress
      if (timeForm.activity_id) {
        const act = activities.find(a => a.id === timeForm.activity_id);
        if (act?.status === "pending") await updateActivity(timeForm.activity_id, { status: "in_progress" });
      }
      // Auto-transition: if case is "assigned" and this is the first time entry, move to in_progress
      if (caseData.status === "assigned" && timeEntries.length === 0 && onStatusChange) {
        await onStatusChange(caseData.id, "in_progress");
      }
      setTimeForm({ date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true, activity_id: "" });
      setShowTimeForm(false);
    } catch (e) { alert(e.message); }
    setSavingTime(false);
  }

  async function handleDelete() {
    const blockers = [];
    if (applications.length > 0) blockers.push(`${applications.length} application(s)`);
    if (timeEntries.length > 0)  blockers.push(`${timeEntries.length} time entr${timeEntries.length === 1 ? "y" : "ies"}`);
    if (documents.length > 0)    blockers.push(`${documents.length} document(s)`);
    if (subCases.length > 0)     blockers.push(`${subCases.length} sub-case(s)`);
    if (blockers.length > 0) {
      alert(t("cd.alert_cannot_delete").replace("{blockers}", blockers.join(", ")));
      return;
    }
    if (!window.confirm(t("cd.confirm_delete_case").replace("{n}", caseData.title))) return;
    try { await onDelete(); } catch (e) { alert(e.message); }
  }

  // ── Import activities from document ─────────────────────────
  async function extractActivitiesFromDoc() {
    setExtractingActs(true);
    setExtractedActs([]);
    try {
      let block;
      if (importDocFile) {
        const reader = new FileReader();
        const b64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(importDocFile);
        });
        const isPdf = importDocFile.type === 'application/pdf' || importDocFile.name.endsWith('.pdf');
        if (isPdf) {
          block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
        } else {
          const text = await importDocFile.text();
          block = { type: 'text', text: `[Document: ${importDocFile.name}]\n${text.slice(0, 12000)}` };
        }
      } else if (importDocId) {
        const doc = documents.find(d => d.id === importDocId);
        if (!doc) throw new Error(t("error.doc_not_found"));
        const resp = await fetch(doc.file_url);
        const isPdf = (doc.file_name ?? '').toLowerCase().endsWith('.pdf') || (doc.file_type ?? '').includes('pdf');
        if (isPdf) {
          const blob = await resp.blob();
          const reader = new FileReader();
          const b64 = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result.split(',')[1]);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
          block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
        } else {
          const text = await resp.text();
          block = { type: 'text', text: `[Document: ${doc.file_name}]\n${text.slice(0, 12000)}` };
        }
      } else {
        throw new Error(t("error.select_doc_or_file"));
      }
      const prompt = `Extract a list of activities, tasks, or work items from the document above.

For each activity found, return a JSON object with:
- title: short task name (required)
- description: one-sentence summary (optional)
- detail: acceptance criteria or details (optional)
- est_hours: estimated hours as a number (default 4 if not found)
- start_date_plan: ISO date YYYY-MM-DD if mentioned (null if not)
- end_date_plan: ISO date YYYY-MM-DD if mentioned (null if not)

Respond ONLY with a valid JSON array, no markdown fences:
[{"title":"...","description":"...","detail":"...","est_hours":4,"start_date_plan":null,"end_date_plan":null}]

Extract every discrete task, activity, deliverable, or work item. If you find none, return [].`;

      const raw = await callClaude({
        model: analysisModel,
        system: 'You are a project analyst. Extract structured activity lists from documents. Return only valid JSON arrays.',
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
        max_tokens: 4096,
      });
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\[[\s\S]*\]/);
        try { parsed = m ? JSON.parse(m[0]) : []; } catch (_2) { parsed = []; }
      }
      setExtractedActs((parsed ?? []).map((a, i) => ({ ...a, _id: i, _selected: true })));
      setImportStep('preview');
    } catch (e) {
      alert(t("alert.extract_failed") + e.message);
    }
    setExtractingActs(false);
  }

  function toIsoDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;   // already ISO
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  async function importSelectedActivities() {
    const toImport = extractedActs.filter(a => a._selected);
    if (!toImport.length) return;
    setImportingActs(true);
    setImportResult(null);
    try {
      const maxNo = activities.length ? Math.max(...activities.map(a => a.task_no)) : 0;
      const rows = toImport.map((a, i) => ({
        case_id: caseData.id,
        task_no: maxNo + i + 1,
        sort_order: maxNo + i + 1,
        title: String(a.title ?? '').slice(0, 500) || 'Untitled',
        description: String(a.description ?? ''),
        detail: String(a.detail ?? ''),
        est_hours: Math.max(0, Number(a.est_hours) || 0) || null,
        start_date_plan: toIsoDate(a.start_date_plan),
        end_date_plan: toIsoDate(a.end_date_plan),
        activity_type: 'task',
        status: 'pending',
        progress_pct: 0,
      }));
      const { error } = await supabase.from('case_activities').insert(rows);
      if (error) throw error;
      // Incrementing actRefreshKey changes the useCallback dependency in
      // useCaseActivities, which triggers the useEffect to re-run fetchActivities.
      // This is the reliable React pattern — no timing hacks needed.
      setImportResult({ count: rows.length });
      setImportStep('done');
      setActRefreshKey(k => k + 1);
    } catch (e) {
      setImportResult({ error: e.message || JSON.stringify(e) });
    } finally {
      setImportingActs(false);
    }
  }

  // Phase-to-next-test-phase mapping
  const PHASE_TEST_TRIGGERS = [
    { fromPhase: "development",           toPhase: "technical_test",  label: t("cd.phase_technical_test") },
    { fromPhase: "technical_test",        toPhase: "functional_test", label: t("cd.phase_functional_test") },
    { fromPhase: "technical_adjustment",  toPhase: "functional_test", label: t("cd.phase_functional_test") },
    { fromPhase: "functional_test",       toPhase: "user_test",       label: t("cd.phase_user_test") },
    { fromPhase: "functional_adjustment", toPhase: "user_test",       label: t("cd.phase_user_test") },
  ];

  const PHASE_ADJ_TRIGGERS = [
    { testPhase: "technical_test",  adjPhase: "technical_adjustment",  adjLabel: t("cd.phase_technical_adj") },
    { testPhase: "functional_test", adjPhase: "functional_adjustment", adjLabel: t("cd.phase_functional_adj") },
    { testPhase: "user_test",       adjPhase: "user_adjustment",       adjLabel: t("cd.phase_user_adj") },
  ];

  async function generateTestPlan(toPhaseKey, fromPhaseActivities) {
    const trigger = PHASE_TEST_TRIGGERS.find(t => t.toPhase === toPhaseKey);
    const targetLabel = trigger?.label ?? toPhaseKey.replace(/_/g, ' ');
    const sourceActivities = fromPhaseActivities ?? activities;
    const actList = sourceActivities.map((a, i) =>
      `${i + 1}. ${a.title}${a.description ? ': ' + a.description : ''}`
    ).join('\n');

    const stageInstructions = {
      technical_test:  'Focus on technical validation: code correctness (no syntax/runtime errors), edge cases, error handling, performance benchmarks, and data integrity at the DB level.',
      functional_test: 'Focus on functional validation: each feature behaves per the functional specification, business rules are enforced, reports match expected output, and all integration points work correctly.',
      user_test:       'Focus on user acceptance: real end-to-end business scenarios, usability from the end-user perspective, data entry validation, and confirmation that all business requirements are met for sign-off.',
    };

    const prompt = `Generate a detailed ${targetLabel} Plan for this SAP consulting case.

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? 'N/A'}
Industry: ${caseData.area_industry ?? 'N/A'}

Completed activities being tested:
${actList || '(no activities defined)'}

${stageInstructions[toPhaseKey] ?? ''}

IMPORTANT: After the markdown test plan, output a JSON block with the test activities to create.
Format exactly like this (all fields required):

\`\`\`json
{
  "activities": [
    {
      "title": "Test scenario title (concise, max 100 chars)",
      "description": "What is being tested and why",
      "acceptance_criteria": "Specific pass/fail criteria",
      "est_hours": 2
    }
  ]
}
\`\`\`

Generate 4–10 test activities covering the most critical scenarios. Each activity maps to one or more of the completed activities above.

Then provide the full test plan in markdown:

## 1. Scope & Objectives
## 2. Test Scenarios
For each activity: Scenario name, Test Steps (numbered), Expected Result, Test Data required, Pass/Fail Criteria.
## 3. Execution Log
Table: # | Scenario | Tester | Date | Result (Pass/Fail/Blocked) | Observations
## 4. Sign-off
Tester signature, Approver signature, Date.`;

    setGeneratingTestPlan(true);
    setTestPlanTarget({ fromPhase: trigger?.fromPhase, toPhase: toPhaseKey });
    setTestPlanSaved(false);
    try {
      const raw = await callClaude({
        model: analysisModel,
        system: 'You are an SAP testing specialist. Generate clear, professional test plans. Follow the output format exactly — JSON block first, then the markdown plan.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 6000,
      });

      // Extract JSON activities block
      let parsedActivities = [];
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          parsedActivities = (parsed.activities ?? []).map(a => ({
            title: String(a.title ?? '').slice(0, 200),
            description: String(a.description ?? ''),
            acceptance_criteria: String(a.acceptance_criteria ?? ''),
            est_hours: Math.max(0.5, Math.min(40, Number(a.est_hours) || 2)),
            _selected: true,
          }));
        } catch (_) {
          // JSON parse failed — PDF saved, activities skipped
        }
      }

      // Strip JSON block from markdown
      const markdown = raw.replace(/```json[\s\S]*?```/, '').trim();

      // Save PDF document
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, L = 12, R = 198;
      const headerColor = [26, 75, 140];
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      doc.setFillColor(...headerColor);
      doc.rect(0, 0, W, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('SAP CONSULTING — TEST PLAN', L, 10);
      doc.setFontSize(14);
      doc.text(targetLabel.toUpperCase(), L, 20);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(caseData.title ?? '', L, 29);
      doc.text(date, R, 29, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      let y = 45;
      autoTable(doc, {
        startY: y,
        head: [['Case', 'SAP Module', 'Industry', 'Test Type', 'Date']],
        body: [[caseData.title ?? '', caseData.area_sap ?? '', caseData.area_industry ?? '', targetLabel, date]],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
        margin: { left: L, right: W - R },
      });
      y = doc.lastAutoTable.finalY + 8;

      const lines = markdown.split('\n');
      doc.setFont('helvetica', 'normal');
      for (const raw2 of lines) {
        const line = raw2.trimEnd();
        if (y > 275) { doc.addPage(); y = 15; }
        if (line.startsWith('## ')) {
          y += 3;
          doc.setFillColor(...headerColor);
          doc.rect(L, y - 4, R - L, 7, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
          doc.text(line.replace(/^## /, ''), L + 2, y);
          doc.setTextColor(0, 0, 0); y += 6;
        } else if (line.startsWith('### ')) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 75, 140);
          doc.text(line.replace(/^### /, ''), L, y); doc.setTextColor(0, 0, 0); y += 5;
        } else if (line.startsWith('**') && line.endsWith('**')) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
          doc.text(line.replace(/\*\*/g, ''), L + 2, y); y += 5;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize('• ' + line.slice(2), R - L - 4);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 4, y); y += 4.5; });
        } else if (/^\d+\. /.test(line)) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize(line, R - L - 4);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 4, y); y += 4.5; });
        } else if (line.trim()) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize(line, R - L);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L, y); y += 4.5; });
        } else {
          y += 2;
        }
      }

      const pdfBlob = doc.output('blob');
      const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
      const fileName = `TestPlan_${toPhaseKey}_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await addDocument(file, `${targetLabel} Plan — auto-generated`);
      if (refetchDocuments) await refetchDocuments();
      setTestPlanSaved(true);

      // Show preview modal if we parsed activities
      if (parsedActivities.length > 0) {
        setTestPlanPreview({ targetPhase: toPhaseKey, targetLabel, activities: parsedActivities, markdown });
      } else {
        setGeneratedPlanPhases(prev => [...prev, toPhaseKey]);
      }
    } catch (e) {
      alert(t("alert.testplan_failed") + e.message);
    } finally {
      setGeneratingTestPlan(false);
      setTestPlanTarget(null);
    }
  }

  async function confirmTestPlanActivities() {
    if (!testPlanPreview) return;
    setConfirmingTestPlan(true);
    try {
      const { targetPhase, activities: previewActs } = testPlanPreview;
      const selected = previewActs.filter(a => a._selected);
      if (!selected.length) { setTestPlanPreview(null); return; }

      // Get current max task_no
      const maxNo = activities.reduce((m, a) => Math.max(m, a.task_no ?? 0), 0);

      // Insert activities sequentially; each gets the previous one as predecessor
      const insertedIds = [];
      for (let i = 0; i < selected.length; i++) {
        const a = selected[i];
        const row = {
          case_id: caseData.id,
          task_no: maxNo + i + 1,
          sort_order: maxNo + i + 1,
          title: a.title,
          description: `${a.description}${a.acceptance_criteria ? '\n\nAcceptance criteria: ' + a.acceptance_criteria : ''}`,
          detail: '',
          est_hours: a.est_hours,
          activity_type: 'task',
          status: 'pending',
          progress_pct: 0,
          phase: targetPhase,
          predecessor_ids: insertedIds.length > 0 ? [insertedIds[insertedIds.length - 1]] : null,
        };
        const { data, error } = await supabase.from('case_activities').insert(row).select('id').single();
        if (error) throw error;
        insertedIds.push(data.id);
      }

      setActRefreshKey(k => k + 1);
      setGeneratedPlanPhases(prev => [...prev, targetPhase]);
      setTestPlanPreview(null);
      await addComment({
        body: `${testPlanPreview.targetLabel} Plan generated: ${selected.length} test activities added with sequential dependencies.`,
        isInternal: true,
      });
    } catch (e) {
      alert(t("alert.create_acts_failed") + e.message);
    } finally {
      setConfirmingTestPlan(false);
    }
  }

  async function generateAdjustmentPlan(testPhaseKey, failedActivities) {
    const trigger = PHASE_ADJ_TRIGGERS.find(t => t.testPhase === testPhaseKey);
    const adjLabel = trigger?.adjLabel ?? t("cd.phase_adjustment");
    const adjPhase = trigger?.adjPhase ?? "adjustment";

    // Build context from failed test activities with their feedback
    const failedList = failedActivities.map((a, i) =>
      `${i + 1}. ${a.title}` +
      (a.adjustment_notes ? `\n   Issue: ${a.adjustment_notes}` : '') +
      (a.coverage_pct != null ? `\n   Requirement coverage: ${a.coverage_pct}%` : '')
    ).join('\n\n');

    const prompt = `Generate a detailed ${adjLabel} Plan for this SAP consulting case.

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? 'N/A'}
Industry: ${caseData.area_industry ?? 'N/A'}

Failed / needs-adjustment test activities and their issues:
${failedList || '(no specific issues recorded)'}

Generate specific corrective activities to address every issue found. Each adjustment activity should:
- Directly address one or more specific issues identified in the test
- Have a clear, actionable title
- Include what change/fix needs to be made and how to verify it is resolved

IMPORTANT: After the markdown plan, output a JSON block with the adjustment activities to create.
Format exactly like this (all fields required):

\`\`\`json
{
  "activities": [
    {
      "title": "Corrective action title (concise, max 100 chars)",
      "description": "What needs to be fixed and why",
      "fix_approach": "Specific approach to resolve the issue",
      "est_hours": 3
    }
  ]
}
\`\`\`

Generate 3–8 targeted adjustment activities. Then provide the full adjustment plan in markdown:

## 1. Issues Summary
## 2. Corrective Actions
For each issue: Root Cause, Corrective Action, Verification Steps, Responsible.
## 3. Re-test Plan
After adjustments, which test scenarios need to be re-executed and in what order.
## 4. Sign-off
Approver signature, Date.`;

    setGeneratingAdjustment(true);
    setAdjustmentTarget({ testPhase: testPhaseKey, adjPhase });
    try {
      const raw = await callClaude({
        model: analysisModel,
        system: 'You are an SAP quality specialist. Generate clear, targeted adjustment plans. Follow the output format exactly — JSON block first, then the markdown plan.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 6000,
      });

      // Parse activities JSON
      let parsedActivities = [];
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          parsedActivities = (parsed.activities ?? []).map(a => ({
            title: String(a.title ?? '').slice(0, 200),
            description: String(a.description ?? '') + (a.fix_approach ? '\n\nFix approach: ' + a.fix_approach : ''),
            est_hours: Math.max(0.5, Math.min(40, Number(a.est_hours) || 3)),
            _selected: true,
          }));
        } catch (_) {
          // JSON parse failed — PDF saved, activities skipped
        }
      }
      const markdown = raw.replace(/```json[\s\S]*?```/, '').trim();

      // Save PDF
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, L = 12, R = 198;
      const headerColor = [14, 116, 144]; // teal
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      doc.setFillColor(...headerColor);
      doc.rect(0, 0, W, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('SAP CONSULTING — ADJUSTMENT PLAN', L, 10);
      doc.setFontSize(14);
      doc.text(adjLabel.toUpperCase(), L, 20);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(caseData.title ?? '', L, 29);
      doc.text(date, R, 29, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      let y = 45;
      autoTable(doc, {
        startY: y,
        head: [['Case', 'SAP Module', 'Issues Found', 'Adjustment Type', 'Date']],
        body: [[caseData.title ?? '', caseData.area_sap ?? '', String(failedActivities.length), adjLabel, date]],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
        margin: { left: L, right: W - R },
      });
      y = doc.lastAutoTable.finalY + 8;

      const lines = markdown.split('\n');
      doc.setFont('helvetica', 'normal');
      for (const raw2 of lines) {
        const line = raw2.trimEnd();
        if (y > 275) { doc.addPage(); y = 15; }
        if (line.startsWith('## ')) {
          y += 3;
          doc.setFillColor(...headerColor);
          doc.rect(L, y - 4, R - L, 7, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
          doc.text(line.replace(/^## /, ''), L + 2, y);
          doc.setTextColor(0, 0, 0); y += 6;
        } else if (line.startsWith('### ')) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(14, 116, 144);
          doc.text(line.replace(/^### /, ''), L, y); doc.setTextColor(0, 0, 0); y += 5;
        } else if (line.startsWith('**') && line.endsWith('**')) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
          doc.text(line.replace(/\*\*/g, ''), L + 2, y); y += 5;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize('• ' + line.slice(2), R - L - 4);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 4, y); y += 4.5; });
        } else if (/^\d+\. /.test(line)) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize(line, R - L - 4);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 4, y); y += 4.5; });
        } else if (line.trim()) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const wrapped = doc.splitTextToSize(line, R - L);
          wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L, y); y += 4.5; });
        } else {
          y += 2;
        }
      }

      const pdfBlob = doc.output('blob');
      const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
      const fileName = `AdjPlan_${adjPhase}_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await addDocument(file, `${adjLabel} Plan — auto-generated from test results`);
      if (refetchDocuments) await refetchDocuments();

      if (parsedActivities.length > 0) {
        setAdjustmentPreview({ adjPhase, adjLabel, activities: parsedActivities, markdown });
      } else {
        setGeneratedAdjPhases(prev => [...prev, adjPhase]);
      }
    } catch (e) {
      alert(t("alert.adjplan_failed") + e.message);
    } finally {
      setGeneratingAdjustment(false);
      setAdjustmentTarget(null);
    }
  }

  async function confirmAdjustmentActivities() {
    if (!adjustmentPreview) return;
    setConfirmingAdjustment(true);
    try {
      const { adjPhase, adjLabel, activities: previewActs } = adjustmentPreview;
      const selected = previewActs.filter(a => a._selected);
      if (!selected.length) { setAdjustmentPreview(null); return; }

      const maxNo = activities.reduce((m, a) => Math.max(m, a.task_no ?? 0), 0);
      const insertedIds = [];
      for (let i = 0; i < selected.length; i++) {
        const a = selected[i];
        const row = {
          case_id: caseData.id,
          task_no: maxNo + i + 1,
          sort_order: maxNo + i + 1,
          title: a.title,
          description: a.description,
          detail: '',
          est_hours: a.est_hours,
          activity_type: 'task',
          status: 'pending',
          progress_pct: 0,
          phase: adjPhase,
          predecessor_ids: insertedIds.length > 0 ? [insertedIds[insertedIds.length - 1]] : null,
        };
        const { data, error } = await supabase.from('case_activities').insert(row).select('id').single();
        if (error) throw error;
        insertedIds.push(data.id);
      }

      setActRefreshKey(k => k + 1);
      setGeneratedAdjPhases(prev => [...prev, adjPhase]);
      setAdjustmentPreview(null);
      await addComment({
        body: `${adjLabel} Plan generated: ${selected.length} corrective activities added with sequential dependencies.`,
        isInternal: true,
      });
    } catch (e) {
      alert(t("alert.create_adj_acts_failed") + e.message);
    } finally {
      setConfirmingAdjustment(false);
    }
  }

  function buildDevPlanHtml(cd, acts, mdNarrative) {
    const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const designActs = acts.filter(a => a.phase === 'design');
    const devActs    = acts.filter(a => a.phase === 'development');
    const totalHrs   = acts.reduce((s, a) => s + (a.est_hours || 0), 0);
    const designHrs  = designActs.reduce((s, a) => s + (a.est_hours || 0), 0);
    const devHrs     = devActs.reduce((s, a) => s + (a.est_hours || 0), 0);

    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const actCard = (a, phase) => `
      <div class="activity ${phase}">
        <div class="rail"></div>
        <div class="activity-inner">
          <div class="act-head">
            <h3>${esc(a.title)}</h3>
            <span class="act-hours">${a.est_hours}h</span>
          </div>
          ${a.description ? `<p class="act-desc">${esc(a.description)}</p>` : ''}
          ${a.acceptance_criteria ? `<div class="act-crit"><span class="crit-icon">✓</span>${esc(a.acceptance_criteria)}</div>` : ''}
        </div>
      </div>`;

    const mdToHtml = md => {
      if (!md) return '';
      return md.split('\n').map(line => {
        if (line.startsWith('## '))  return `<h2 class="md-h2">${esc(line.slice(3))}</h2>`;
        if (line.startsWith('### ')) return `<h3 class="md-h3">${esc(line.slice(4))}</h3>`;
        if (line.startsWith('- ') || line.startsWith('* ')) return `<li>${esc(line.slice(2))}</li>`;
        if (/^\d+\.\s/.test(line)) return `<li class="ol">${esc(line.replace(/^\d+\.\s/,''))}</li>`;
        const t = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return line.trim() ? `<p>${t}</p>` : '<br>';
      }).join('\n');
    };

    // Gantt data: spread activities across weeks proportionally
    const TOTAL_WEEKS = 8;
    const ganttItems = [
      ...designActs.map((a, i) => ({
        label: a.title.length > 32 ? a.title.slice(0, 30) + '…' : a.title,
        phase: 'design',
        ws: 1 + (i / Math.max(designActs.length, 1)) * 2,
        we: 1 + ((i + 1) / Math.max(designActs.length, 1)) * 2.8,
      })),
      ...devActs.map((a, i) => ({
        label: a.title.length > 32 ? a.title.slice(0, 30) + '…' : a.title,
        phase: 'dev',
        ws: 4 + (i / Math.max(devActs.length, 1)) * 3,
        we: 4 + ((i + 1) / Math.max(devActs.length, 1)) * 3.8,
      })),
    ];

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plan D&D — ${esc(cd.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#F6F7FB;color:#1A2A4A;font-size:0.9rem;line-height:1.65}
.doc-header{background:#1A2A4A;color:#fff;padding:2.5rem 3rem 2rem}
.doc-header .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:0.5rem}
.doc-header h1{font-family:'DM Serif Display',Georgia,serif;font-size:clamp(1.5rem,3vw,2.3rem);font-weight:400;line-height:1.15;color:#fff;margin-bottom:0.3rem}
.doc-header h1 em{font-style:italic;color:rgba(255,255,255,0.65)}
.meta-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1.2rem;padding-top:1.1rem;border-top:1px solid rgba(255,255,255,0.1)}
.meta-item{display:flex;flex-direction:column;gap:0.15rem}
.meta-item .lbl{font-family:'IBM Plex Mono',monospace;font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.35)}
.meta-item .val{font-size:0.8rem;color:rgba(255,255,255,0.8);font-weight:500}
.doc-body{max-width:860px;margin:0 auto;padding:0 1.5rem 4rem}
.kpi-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#DDE1EE;border:1px solid #DDE1EE;border-radius:10px;overflow:hidden;margin:2rem 0}
.kpi{background:#fff;padding:0.9rem 1.1rem}
.kpi .num{font-family:'DM Serif Display',serif;font-size:1.8rem;line-height:1;color:#0056A0;font-variant-numeric:tabular-nums}
.kpi .desc{font-size:0.72rem;color:#4A5878;line-height:1.3}
.section-band{display:flex;align-items:center;gap:0.7rem;padding:0.6rem 1rem;border-radius:6px;margin:2rem 0 1rem}
.section-band.design{background:#E6EFF8}.section-band.dev{background:#e8f5ee}.section-band.charts{background:#1A2A4A}
.section-band h2{font-family:'IBM Plex Sans',sans-serif;font-size:0.74rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#1A2A4A}
.section-band.charts h2{color:#fff}
.num-badge{font-family:'IBM Plex Mono',monospace;font-size:0.62rem;font-weight:500;padding:0.18rem 0.45rem;border-radius:4px;flex-shrink:0;color:#fff}
.section-band.design .num-badge{background:#1254A0}.section-band.dev .num-badge{background:#1C6B3A}.section-band.charts .num-badge{background:rgba(255,255,255,0.2);color:#fff}
.activity{display:grid;grid-template-columns:3px 1fr;background:#fff;border:1px solid #DDE1EE;border-radius:8px;overflow:hidden;margin-bottom:0.9rem}
.activity .rail{background:#1254A0}.activity.dev .rail{background:#1C6B3A}
.activity-inner{padding:0.9rem 1rem}
.act-head{display:flex;align-items:flex-start;justify-content:space-between;gap:0.7rem;margin-bottom:0.5rem}
.act-head h3{font-size:0.85rem;font-weight:600;color:#1A2A4A;line-height:1.35}
.act-hours{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;font-weight:500;background:#F6F7FB;color:#4A5878;padding:0.18rem 0.5rem;border-radius:20px;white-space:nowrap;flex-shrink:0}
.act-desc{font-size:0.78rem;color:#4A5878;margin-bottom:0.4rem}
.act-crit{display:flex;gap:0.4rem;font-size:0.75rem;color:#1C6B3A;font-weight:500;margin-top:0.35rem}
.crit-icon{flex-shrink:0;font-size:0.7rem}
.narrative{background:#fff;border:1px solid #DDE1EE;border-radius:8px;padding:1.2rem 1.4rem;margin-bottom:1rem}
.narrative p{font-size:0.82rem;color:#4A5878;margin-bottom:0.6rem}
.narrative li{font-size:0.82rem;color:#4A5878;margin-left:1.2rem;margin-bottom:0.3rem}
.md-h2{font-family:'IBM Plex Sans',sans-serif;font-size:0.76rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1254A0;margin:1.1rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:1px solid #DDE1EE}
.md-h3{font-size:0.82rem;font-weight:600;color:#1A2A4A;margin:0.8rem 0 0.3rem}
.chart-section{background:#1A2A4A;margin:2.5rem -1.5rem 0;padding:2rem 1.5rem 2.5rem}
.chart-section .inner{max-width:860px;margin:0 auto}
.chart-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:0.6rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.3rem}
.chart-title{font-family:'DM Serif Display',serif;font-size:1.4rem;font-weight:400;color:#fff;margin-bottom:1.5rem}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}
.chart-card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1.1rem}
.chart-card.full{grid-column:1/-1}
.chart-lbl{font-family:'IBM Plex Mono',monospace;font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.38);margin-bottom:0.7rem}
canvas{display:block;width:100%}
.print-btn{position:fixed;bottom:1.5rem;right:1.5rem;background:#0056A0;color:#fff;border:none;border-radius:8px;padding:0.7rem 1.3rem;font-family:'IBM Plex Sans',sans-serif;font-size:0.82rem;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,86,160,0.4)}
.print-btn:hover{background:#004080}
@media print{.print-btn{display:none}body{background:#fff}.chart-section{margin:2rem 0;border-radius:8px}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ Guardar como PDF</button>

<header class="doc-header">
  <div class="eyebrow">SAP Consulting · Plan de Proyecto</div>
  <h1>Plan de Diseño &amp; Desarrollo<br><em>${esc(cd.title)}</em></h1>
  <div class="meta-row">
    <div class="meta-item"><span class="lbl">Módulo SAP</span><span class="val">${esc(cd.area_sap || 'N/A')}</span></div>
    <div class="meta-item"><span class="lbl">Industria</span><span class="val">${esc(cd.area_industry || 'N/A')}</span></div>
    <div class="meta-item"><span class="lbl">Tipo de Plan</span><span class="val">Diseño &amp; Desarrollo</span></div>
    <div class="meta-item"><span class="lbl">Fecha</span><span class="val">${date}</span></div>
  </div>
</header>

<div class="doc-body">
  <div class="kpi-strip">
    <div class="kpi"><div class="num">${totalHrs}</div><div class="desc">Horas totales estimadas</div></div>
    <div class="kpi"><div class="num">${acts.length}</div><div class="desc">Actividades planificadas</div></div>
    <div class="kpi"><div class="num">${designActs.length}</div><div class="desc">Actividades de diseño</div></div>
    <div class="kpi"><div class="num">${devActs.length}</div><div class="desc">Actividades de desarrollo</div></div>
  </div>

  ${designActs.length > 0 ? `
  <div class="section-band design">
    <span class="num-badge">D</span>
    <h2>Fase de Diseño — ${designHrs}h</h2>
  </div>
  ${designActs.map(a => actCard(a, 'design')).join('')}` : ''}

  ${devActs.length > 0 ? `
  <div class="section-band dev">
    <span class="num-badge">V</span>
    <h2>Fase de Desarrollo — ${devHrs}h</h2>
  </div>
  ${devActs.map(a => actCard(a, 'dev')).join('')}` : ''}

  ${mdNarrative ? `
  <div class="section-band design" style="margin-top:2rem">
    <span class="num-badge">≡</span>
    <h2>Narrativa del Plan</h2>
  </div>
  <div class="narrative">${mdToHtml(mdNarrative)}</div>` : ''}
</div>

<div class="chart-section">
  <div class="inner">
    <div class="chart-eyebrow">Visualización</div>
    <div class="chart-title">Distribución de Tareas y Tiempos</div>
    <div class="charts-grid">
      <div class="chart-card full"><div class="chart-lbl">Cronograma — Gantt</div><canvas id="ganttC" height="220"></canvas></div>
      <div class="chart-card full"><div class="chart-lbl">Horas por Actividad</div><canvas id="hoursC" height="${Math.max(160, acts.length * 24)}"></canvas></div>
      <div class="chart-card"><div class="chart-lbl">Distribución por Fase</div><canvas id="donutC" height="200"></canvas></div>
      <div class="chart-card"><div class="chart-lbl">Diseño vs Desarrollo</div><canvas id="barC" height="200"></canvas></div>
    </div>
  </div>
</div>

<script>
(function(){
  const DC='#4A9FE8', VC='#4CB87A';
  const ganttItems=${JSON.stringify(ganttItems)};
  const hoursData=${JSON.stringify(acts.map(a => ({ label: a.title.length > 30 ? a.title.slice(0,28)+'…' : a.title, h: a.est_hours, phase: a.phase })))};
  const totalHrs=${totalHrs}, designHrs=${designHrs}, devHrs=${devHrs};

  function drawGantt(){
    const cv=document.getElementById('ganttC');
    const gc=cv.getContext('2d');
    const W=cv.offsetWidth, H=220;
    cv.width=W*devicePixelRatio; cv.height=H*devicePixelRatio;
    gc.scale(devicePixelRatio,devicePixelRatio);
    const labelW=180, pad=10, chartW=W-labelW-pad*2, rowH=18, weeks=8;
    gc.clearRect(0,0,W,H);
    for(let w=1;w<=weeks;w++){
      const x=labelW+(w-1)/weeks*chartW;
      gc.fillStyle='rgba(255,255,255,0.12)'; gc.fillRect(x,18,1,H-18);
      gc.font='500 9px IBM Plex Mono,monospace'; gc.fillStyle='rgba(255,255,255,0.3)';
      gc.fillText('S'+w,x+2,13);
    }
    ganttItems.forEach((a,i)=>{
      const y=22+i*(rowH+3), color=a.phase==='design'?DC:VC;
      gc.font='400 9.5px IBM Plex Sans,sans-serif'; gc.fillStyle='rgba(255,255,255,0.6)';
      gc.fillText(a.label,pad,y+rowH/2+3);
      gc.fillStyle='rgba(255,255,255,0.05)'; gc.beginPath(); gc.roundRect(labelW,y,chartW,rowH,3); gc.fill();
      const bx=labelW+(a.ws-1)/weeks*chartW, bw=(a.we-a.ws)/weeks*chartW;
      gc.fillStyle=color; gc.globalAlpha=0.85; gc.beginPath(); gc.roundRect(bx,y,bw,rowH,3); gc.fill(); gc.globalAlpha=1;
    });
  }

  function drawHours(){
    const cv=document.getElementById('hoursC');
    const hc=cv.getContext('2d');
    const W=cv.offsetWidth, H=Math.max(160,hoursData.length*26);
    cv.width=W*devicePixelRatio; cv.height=H*devicePixelRatio;
    hc.scale(devicePixelRatio,devicePixelRatio);
    const labelW=140, pad=10, chartW=W-labelW-pad*2-30;
    const maxH=Math.max(...hoursData.map(d=>d.h));
    const rowH=18, gap=4;
    hc.clearRect(0,0,W,H);
    hoursData.forEach((d,i)=>{
      const y=pad+i*(rowH+gap), color=d.phase==='design'?DC:VC;
      const bw=(d.h/maxH)*chartW;
      hc.font='400 9px IBM Plex Sans,sans-serif'; hc.fillStyle='rgba(255,255,255,0.55)';
      hc.fillText(d.label,pad,y+rowH-4);
      hc.fillStyle='rgba(255,255,255,0.05)'; hc.beginPath(); hc.roundRect(labelW,y,chartW,rowH,3); hc.fill();
      hc.fillStyle=color; hc.globalAlpha=0.85; hc.beginPath(); hc.roundRect(labelW,y,bw,rowH,3); hc.fill(); hc.globalAlpha=1;
      hc.font='500 9px IBM Plex Mono,monospace'; hc.fillStyle='rgba(255,255,255,0.45)';
      hc.fillText(d.h+'h',labelW+bw+5,y+rowH-4);
    });
  }

  function drawDonut(){
    const cv=document.getElementById('donutC');
    const dc=cv.getContext('2d');
    const W=cv.offsetWidth, H=200;
    cv.width=W*devicePixelRatio; cv.height=H*devicePixelRatio;
    dc.scale(devicePixelRatio,devicePixelRatio);
    const cx=W*0.4, cy=H/2, r=Math.min(cx,cy)*0.72, ri=r*0.58;
    const slices=[{v:designHrs,label:'Diseño',color:DC},{v:devHrs,label:'Desarrollo',color:VC}];
    let angle=-Math.PI/2;
    slices.forEach(s=>{
      const sweep=(s.v/totalHrs)*Math.PI*2;
      dc.beginPath(); dc.moveTo(cx,cy); dc.arc(cx,cy,r,angle,angle+sweep); dc.closePath();
      dc.fillStyle=s.color; dc.globalAlpha=0.9; dc.fill(); dc.globalAlpha=1;
      dc.beginPath(); dc.arc(cx,cy,ri,0,Math.PI*2); dc.fillStyle='#1A2A4A'; dc.fill();
      angle+=sweep;
    });
    dc.font="bold 20px 'DM Serif Display',serif"; dc.fillStyle='rgba(255,255,255,0.9)';
    dc.textAlign='center'; dc.fillText(totalHrs+'h',cx,cy+4);
    dc.font="400 9px 'IBM Plex Mono',monospace"; dc.fillStyle='rgba(255,255,255,0.35)';
    dc.fillText('total',cx,cy+17); dc.textAlign='left';
    const lx=W*0.85;
    slices.forEach((s,i)=>{
      const ly=cy-14+i*26;
      dc.fillStyle=s.color; dc.globalAlpha=0.9; dc.beginPath(); dc.roundRect(lx-46,ly,9,9,2); dc.fill(); dc.globalAlpha=1;
      dc.font="400 9px 'IBM Plex Sans',sans-serif"; dc.fillStyle='rgba(255,255,255,0.6)'; dc.fillText(s.label,lx-33,ly+8);
      dc.font="500 9px 'IBM Plex Mono',monospace"; dc.fillStyle='rgba(255,255,255,0.4)'; dc.fillText(s.v+'h',lx-33,ly+19);
    });
  }

  function drawBar(){
    const cv=document.getElementById('barC');
    const bc=cv.getContext('2d');
    const W=cv.offsetWidth, H=200;
    cv.width=W*devicePixelRatio; cv.height=H*devicePixelRatio;
    bc.scale(devicePixelRatio,devicePixelRatio);
    const data=[{label:'Diseño',h:designHrs,color:DC},{label:'Desarrollo',h:devHrs,color:VC}];
    const pad=24, bw=(W-pad*2)/data.length*0.5, maxH=Math.max(designHrs,devHrs);
    const chartH=H-50;
    data.forEach((d,i)=>{
      const x=pad+i*(W-pad*2)/data.length+(W-pad*2)/data.length*0.25;
      const barH=(d.h/maxH)*chartH;
      const y=H-30-barH;
      bc.fillStyle=d.color; bc.globalAlpha=0.85;
      bc.beginPath(); bc.roundRect(x,y,bw,barH,4); bc.fill(); bc.globalAlpha=1;
      bc.font="500 11px 'DM Serif Display',serif"; bc.fillStyle='rgba(255,255,255,0.85)';
      bc.textAlign='center'; bc.fillText(d.h+'h',x+bw/2,y-6);
      bc.font="400 9px 'IBM Plex Sans',sans-serif"; bc.fillStyle='rgba(255,255,255,0.45)';
      bc.fillText(d.label,x+bw/2,H-14); bc.textAlign='left';
    });
  }

  function drawAll(){drawGantt();drawHours();drawDonut();drawBar();}
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(drawAll);}else{setTimeout(drawAll,300);}
  let raf; window.addEventListener('resize',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(drawAll);});
})();
</script>
</body>
</html>`;
  }

  async function buildDevPlanContext() {
    const genCtx = { ...GENERATION_CONTEXT_DEFAULTS, ...(cdSettings["generation_context"] ?? {}) };
    const extra = {};
    const fetches = [];

    if (genCtx.include_sap_profile && caseData.client_id) {
      fetches.push(
        supabase.from("db_connections")
          .select("*")
          .eq("client_id", caseData.client_id)
          .is("project_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => { if (data) extra.connection = data; })
      );
    }

    if (genCtx.include_project_ctx && caseData.project_id) {
      fetches.push(
        supabase.from("projects")
          .select("name, description, goals, deliverables")
          .eq("id", caseData.project_id)
          .maybeSingle()
          .then(({ data }) => { if (data) extra.project = data; })
      );
    }

    if (genCtx.include_related_cases && caseData.client_id && caseData.area_sap) {
      const n = genCtx.related_cases_count ?? 3;
      fetches.push(
        supabase.from("cases")
          .select("title, status, area_sap")
          .eq("client_id", caseData.client_id)
          .eq("area_sap", caseData.area_sap)
          .neq("id", caseData.id)
          .order("created_at", { ascending: false })
          .limit(n)
          .then(({ data }) => { if (data?.length) extra.relatedCases = data; })
      );
    }

    await Promise.all(fetches);

    if (genCtx.sap_live_check && caseData.client_id) {
      try {
        const [{ data: sapCfgRow }, { data: sapProjEnvRow }, { data: sapCaseEnvRow }] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'sap_integration').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'sap_project_env').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'sap_case_env').maybeSingle(),
        ]);
        const clientSapData = (sapCfgRow?.value ?? {})[caseData.client_id] ?? {};
        const sapEnvs = clientSapData.environments ?? (clientSapData.host ? [clientSapData] : []);
        const selectedEnvId = (sapCaseEnvRow?.value ?? {})[caseData.id]
          ?? (sapProjEnvRow?.value ?? {})[caseData.project_id]
          ?? null;
        const sapCfg = selectedEnvId
          ? (sapEnvs.find(e => e.id === selectedEnvId) ?? sapEnvs[0] ?? null)
          : (sapEnvs[0] ?? null);
        if (sapCfg?.host && sapCfg?.username) {
          const liveData = await sapLiveCheck(sapCfg);
          if (liveData) extra.sapLiveData = liveData;
        }
      } catch (_) {}
    }

    return buildContextString(caseData, genCtx, extra);
  }

  async function generateDevelopmentPlan(genProfile = null, outputMode = 'activities') {
    if (!genProfile) {
      setPendingDevPlanIsRegen(false);
      setShowDevPlanModal(true);
      return;
    }
    setGeneratingDevPlan(true);
    try {
      const specContent = caseSpec?.content ?? '';
      const contextStr = await buildDevPlanContext();
      const ctx = `Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? 'N/A'}
Industry: ${caseData.area_industry ?? 'N/A'}${contextStr}

Approved Functional Specification:
${specContent ? specContent.slice(0, 4000) : '(Spec content not available — use the case description to infer scope)'}`;

      // ── Call 1: JSON activities only ──────────────────────────────
      const jsonRaw = await callClaude({
        model: genModel,
        system: 'You are an SAP project delivery expert. Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation — just the JSON object.',
        messages: [{
          role: 'user',
          content: `${ctx}

Generate 3–5 Design phase activities and 4–8 Development phase activities for this SAP case.

Return ONLY this JSON object (no other text):
{
  "activities": [
    { "title": "short title", "description": "what this activity entails", "acceptance_criteria": "done criteria", "est_hours": 4, "phase": "design" },
    { "title": "short title", "description": "what this activity entails", "acceptance_criteria": "done criteria", "est_hours": 8, "phase": "development" }
  ]
}

Rules: phase must be exactly "design" or "development". Return ONLY the JSON, nothing else.`,
        }],
        max_tokens: 3000,
      });

      const mapActivity = a => ({
        title: String(a.title ?? '').slice(0, 200),
        description: String(a.description ?? ''),
        acceptance_criteria: String(a.acceptance_criteria ?? ''),
        est_hours: Math.max(0.5, Math.min(40, Number(a.est_hours) || 4)),
        phase: ['design', 'development'].includes(a.phase) ? a.phase : 'development',
        _selected: true,
        _type: outputMode === 'subcases' ? 'subcase' : 'activity',
      });
      const tryParse = str => {
        try {
          const p = JSON.parse(str.trim());
          return Array.isArray(p) ? p.map(mapActivity)
               : Array.isArray(p.activities) ? p.activities.map(mapActivity)
               : null;
        } catch (_) { return null; }
      };

      // Attempt parse: direct → strip accidental fences → brute-force object extraction
      const stripped = jsonRaw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      const objMatch = (jsonRaw.match(/\{[\s\S]*\}/) ?? [])[0] ?? '{}';
      const parsedActivities = tryParse(jsonRaw) ?? tryParse(stripped) ?? tryParse(objMatch) ?? [];

      console.log('[DevPlan] raw length:', jsonRaw.length, '| parsedActivities:', parsedActivities.length);
      if (!parsedActivities.length) {
        console.warn('[DevPlan] JSON raw (first 600):', jsonRaw.slice(0, 600));
        throw new Error(t("error.extract_acts_failed"));
      }

      // ── Call 2: Markdown narrative for PDF ────────────────────────
      const actSummary = parsedActivities.map((a, i) =>
        `${i + 1}. [${a.phase.toUpperCase()}] ${a.title} (${a.est_hours}h)`).join('\n');
      const markdown = await callClaude({
        model: genModel,
        system: 'You are an SAP project delivery expert. Write clear, concise project documentation.',
        messages: [{
          role: 'user',
          content: `${ctx}

The following activities have been planned:
${actSummary}

Write a brief project plan document in markdown covering:
## 1. Project Scope Summary
## 2. Design Phase
For each design activity: objectives and deliverables.
## 3. Development Phase
For each development activity: technical approach and deliverables.
## 4. Dependencies & Risks
## 5. Estimated Timeline

Keep each section concise.${buildSectionConstraint('dev_plan', genProfile)}${buildGenSuffix(genProfile)}`,
        }],
        max_tokens: 3000,
      });

      // Build HTML plan preview (PDF will be generated at confirm time)
      const planHtml = buildDevPlanHtml(caseData, parsedActivities, markdown);

      // Show preview step — user can edit, reorder type, deselect before confirming
      setDevPlanPreview({ items: parsedActivities, defaultMode: outputMode, markdown, planHtml });
    } catch (e) {
      alert(t("alert.devplan_failed") + e.message);
    } finally {
      setGeneratingDevPlan(false);
    }
  }

  async function confirmDevPlan() {
    if (!devPlanPreview) return;
    setConfirmingDevPlan(true);
    try {
      const { items, markdown, planHtml } = devPlanPreview;
      const selected = items.filter(a => a._selected);
      if (!selected.length) { alert('No items selected.'); return; }

      const actItems = selected.filter(a => a._type === 'activity');
      const subItems = selected.filter(a => a._type === 'subcase');

      // Upload PDF document
      const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      const pdfBlob = await htmlStringToPdfBlob(planHtml);
      const fileName = `DevPlan_${safeName}_${dateStr}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await addDocument(pdfFile, 'Design & Development Plan — auto-generated from approved spec');
      if (refetchDocuments) await refetchDocuments();
      openHtmlInNewTab(planHtml);

      // Insert activities
      const maxNo = activities.reduce((m, a) => Math.max(m, a.task_no ?? 0), 0);
      const insertedIds = [];
      for (let i = 0; i < actItems.length; i++) {
        const a = actItems[i];
        const row = {
          case_id: caseData.id,
          task_no: maxNo + i + 1,
          sort_order: maxNo + i + 1,
          title: a.title,
          description: `${a.description}${a.acceptance_criteria ? '\n\nAcceptance criteria: ' + a.acceptance_criteria : ''}`,
          detail: '',
          est_hours: a.est_hours,
          activity_type: 'task',
          status: 'pending',
          progress_pct: 0,
          phase: a.phase,
          predecessor_ids: insertedIds.length > 0 ? [insertedIds[insertedIds.length - 1]] : null,
        };
        const { data, error } = await supabase.from('case_activities').insert(row).select('id').single();
        if (error) throw error;
        insertedIds.push(data.id);
      }

      // Insert sub-cases + linked activity rows so they appear in the list and count toward progress
      const subTaskNoBase = maxNo + actItems.length;
      for (let i = 0; i < subItems.length; i++) {
        const a = subItems[i];
        const desc = `${a.description}${a.acceptance_criteria ? '\n\nAcceptance criteria: ' + a.acceptance_criteria : ''}`;
        const newSubCase = await createSubCase({
          title: a.title,
          description: desc,
          priority: 'medium',
          status: 'open',
          area_sap: caseData.area_sap ?? null,
          area_industry: caseData.area_industry ?? null,
          client_id: caseData.client_id ?? null,
          manager_id: caseData.manager_id ?? null,
          project_id: caseData.project_id ?? null,
        });
        // Create the linked activity so it appears in the activities list and contributes to progress
        const { error: actErr } = await supabase.from('case_activities').insert({
          case_id: caseData.id,
          task_no: subTaskNoBase + i + 1,
          sort_order: subTaskNoBase + i + 1,
          title: a.title,
          description: desc,
          activity_type: 'sub_case',
          linked_case_id: newSubCase.id,
          est_hours: a.est_hours,
          status: 'pending',
          progress_pct: 0,
          phase: a.phase,
        });
        if (actErr) throw actErr;
      }

      logEvent('devplan.confirmed', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { activities: actItems.length, subcases: subItems.length } });
      setActRefreshKey(k => k + 1);
      setDevPlanGenerated(true);
      setDevPlanPreview(null);

      const parts = [];
      if (actItems.length) parts.push(`${actItems.length} activit${actItems.length === 1 ? 'y' : 'ies'}`);
      if (subItems.length) parts.push(`${subItems.length} sub-case${subItems.length === 1 ? '' : 's'}`);
      await addComment({
        body: `Design & Development Plan confirmed: ${parts.join(' and ')} created from approved spec.`,
        isInternal: true,
      });
    } catch (e) {
      alert('Failed to confirm plan: ' + e.message);
    } finally {
      setConfirmingDevPlan(false);
    }
  }

  async function generateClosureReport(bypass, bypassReason) {
    setGeneratingClosure(true);
    try {
      // Fetch spec from DB
      const { data: specData } = await supabase
        .from("case_specifications")
        .select("*")
        .eq("case_id", caseData.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const specContent = specData?.content ?? null;
      const specMode    = specData?.mode ?? null;

      // Build activity context by phase
      const phaseOrder = ['design','development','technical_test','technical_adjustment',
                          'functional_test','functional_adjustment','user_test','user_adjustment'];
      const allPhaseActs = phaseOrder.map(pk => {
        const phaseDef = DEFAULT_ACTIVITY_PHASES.find(p => p.key === pk);
        const acts = activities.filter(a => a.phase === pk);
        return { phase: phaseDef ?? { key: pk, label: pk.replace(/_/g, ' '), color: '#6b7280' }, acts };
      }).filter(g => g.acts.length > 0);

      const unassignedActs = activities.filter(a => !a.phase || !phaseOrder.includes(a.phase));

      // Build dev summary
      const devActs = activities.filter(a => a.phase === 'development');
      const devSummary = devActs.map(a =>
        `- ${a.title}${a.description ? ': ' + a.description : ''} (${a.est_hours ?? 0}h est.)`
      ).join('\n') || '(no development activities)';

      // Build test summary
      const testPhases = ['technical_test','functional_test','user_test'];
      const testSummary = testPhases.map(pk => {
        const label = DEFAULT_ACTIVITY_PHASES.find(p => p.key === pk)?.label ?? pk;
        const acts = activities.filter(a => a.phase === pk);
        if (!acts.length) return null;
        const passed = acts.filter(a => a.test_outcome === 'passed').length;
        const failed = acts.filter(a => a.test_outcome === 'needs_adjustment').length;
        const pending = acts.filter(a => !a.test_outcome).length;
        const rows = acts.map(a =>
          `  • ${a.title}: ${a.test_outcome === 'passed' ? '✓ Passed' : a.test_outcome === 'needs_adjustment' ? '⚠ Needs Adj.' : 'Pending'}` +
          (a.adjustment_notes ? ` — ${a.adjustment_notes}` : '') +
          (a.coverage_pct != null ? ` (coverage: ${a.coverage_pct}%)` : '')
        ).join('\n');
        return `${label}: ${passed} passed, ${failed} adjusted, ${pending} pending\n${rows}`;
      }).filter(Boolean).join('\n\n') || '(no test activities)';

      // Build adjustment summary
      const adjPhases = ['technical_adjustment','functional_adjustment','user_adjustment'];
      const adjSummary = adjPhases.map(pk => {
        const label = DEFAULT_ACTIVITY_PHASES.find(p => p.key === pk)?.label ?? pk;
        const acts = activities.filter(a => a.phase === pk);
        if (!acts.length) return null;
        const rows = acts.map(a => `  • ${a.title}${a.description ? ': ' + a.description.slice(0,120) : ''}`).join('\n');
        return `${label}:\n${rows}`;
      }).filter(Boolean).join('\n\n') || '(no adjustments required)';

      // AI prompt for User Manual section
      const userManualPrompt = `Write a concise user manual for the following SAP consulting delivery.

Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? 'N/A'}
Industry: ${caseData.area_industry ?? 'N/A'}
Description: ${caseData.description ?? '(none)'}

What was developed:
${devSummary}

${specContent ? `Functional specification (summary):\n${specContent.slice(0, 2000)}` : ''}

Write a practical user manual in markdown. Include:
## How to Access and Navigate
## Key Features and How to Use Them
(one subsection per main feature/activity developed)
## Common Scenarios and Step-by-Step Guides
## Troubleshooting and Support

Be practical, concise, and written from the end-user perspective. Avoid technical jargon.`;

      const userManual = await callClaude({
        model: analysisModel,
        system: 'You are a technical writer specializing in SAP end-user documentation. Write clear, practical user manuals.',
        messages: [{ role: 'user', content: userManualPrompt }],
        max_tokens: 4000,
      });

      // Build the PDF
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, L = 12, R = 198, PW = R - L;
      const headerColor = [26, 75, 140];
      const accentColor = [16, 185, 129];
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      function addPage() { doc.addPage(); return 20; }

      function sectionHeader(y, title, color) {
        if (y > 260) y = addPage();
        doc.setFillColor(...(color ?? headerColor));
        doc.rect(L, y, PW, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
        doc.text(title, L + 3, y + 5.5);
        doc.setTextColor(0, 0, 0);
        return y + 12;
      }

      function paragraph(y, text, indent) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
        const x = L + (indent ?? 0);
        const wrapped = doc.splitTextToSize(text, PW - (indent ?? 0));
        wrapped.forEach(l => {
          if (y > 275) { doc.addPage(); y = 15; }
          doc.text(l, x, y); y += 4.5;
        });
        doc.setTextColor(0, 0, 0);
        return y + 2;
      }

      function renderMarkdownSection(y, md) {
        const lines = md.split('\n');
        for (const raw of lines) {
          const line = raw.trimEnd();
          if (y > 275) { doc.addPage(); y = 15; }
          if (line.startsWith('## ')) {
            y += 2;
            doc.setFillColor(230, 237, 250);
            doc.rect(L, y - 4, PW, 7, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 75, 140);
            doc.text(line.replace(/^## /, ''), L + 2, y);
            doc.setTextColor(0, 0, 0); y += 6;
          } else if (line.startsWith('### ')) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(26, 75, 140);
            doc.text(line.replace(/^### /, ''), L + 2, y); doc.setTextColor(0, 0, 0); y += 5;
          } else if (line.startsWith('**') && line.endsWith('**')) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.text(line.replace(/\*\*/g, ''), L + 2, y); y += 5;
          } else if (line.startsWith('- ') || line.startsWith('* ')) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            const wrapped = doc.splitTextToSize('• ' + line.slice(2), PW - 6);
            wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 5, y); y += 4.5; });
          } else if (/^\d+\. /.test(line)) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            const wrapped = doc.splitTextToSize(line, PW - 6);
            wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L + 5, y); y += 4.5; });
          } else if (line.trim()) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            const wrapped = doc.splitTextToSize(line, PW);
            wrapped.forEach(l => { if (y > 275) { doc.addPage(); y = 15; } doc.text(l, L, y); y += 4.5; });
          } else {
            y += 2;
          }
        }
        return y + 3;
      }

      // ── PAGE 1: Cover ──────────────────────────────────────────
      doc.setFillColor(...headerColor);
      doc.rect(0, 0, W, 60, 'F');
      doc.setFillColor(...accentColor);
      doc.rect(0, 60, W, 3, 'F');

      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(180, 200, 230);
      doc.text('SAP CONSULTING — CASE CLOSURE REPORT', L, 14);
      doc.setFontSize(20); doc.setTextColor(255, 255, 255);
      const titleLines = doc.splitTextToSize(caseData.title ?? 'Case Closure Report', PW - 10);
      titleLines.forEach((l, i) => doc.text(l, L, 26 + i * 9));
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(dateStr, L, 56);

      let y = 80;
      autoTable(doc, {
        startY: y,
        body: [
          ['Case Reference', caseData.case_ref ?? '—'],
          ['Client', caseData.client_name ?? '—'],
          ['SAP Module', caseData.area_sap ?? '—'],
          ['Industry', caseData.area_industry ?? '—'],
          ['Priority', caseData.priority ?? '—'],
          ['Approved', dateStr],
          [bypass ? 'Approval Note' : 'Approval', bypass ? `Bypassed — ${bypassReason}` : 'All activities at 100%'],
        ],
        styles: { fontSize: 9, cellPadding: 3.5 },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 247, 250], cellWidth: 50 } },
        margin: { left: L, right: W - R },
      });
      y = doc.lastAutoTable.finalY + 12;

      // Summary stats
      const totalHrs = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
      autoTable(doc, {
        startY: y,
        head: [['Total Activities', 'Hours Logged', 'Test Phases', 'Adjustments']],
        body: [[
          String(activities.length),
          totalHrs.toFixed(1) + 'h',
          String(testPhases.filter(pk => activities.some(a => a.phase === pk)).length),
          String(adjPhases.filter(pk => activities.some(a => a.phase === pk)).length),
        ]],
        styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
        margin: { left: L, right: W - R },
      });

      // ── SECTION 1: Initial Request ─────────────────────────────
      doc.addPage(); y = 15;
      y = sectionHeader(y, '1. INITIAL REQUEST', headerColor);
      y = paragraph(y, caseData.description ?? '(No description provided.)');

      if (specData?.notes) {
        try {
          const notes = JSON.parse(specData.notes);
          if (notes.analysisCustomerContent) {
            y += 3;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(26, 75, 140);
            doc.text('Customer Input:', L, y); doc.setTextColor(0, 0, 0); y += 6;
            y = paragraph(y, notes.analysisCustomerContent.slice(0, 1500));
          }
        } catch (_) {}
      }

      // ── SECTION 2: Functional Specification ───────────────────
      if (y > 220) { doc.addPage(); y = 15; }
      y = sectionHeader(y, '2. FUNCTIONAL SPECIFICATION', headerColor);
      if (specContent) {
        y = renderMarkdownSection(y, specContent.slice(0, 4000));
      } else {
        y = paragraph(y, '(No functional specification was recorded for this case.)');
      }

      // ── SECTION 3: Development Scope ──────────────────────────
      doc.addPage(); y = 15;
      y = sectionHeader(y, '3. DEVELOPMENT SCOPE', headerColor);
      if (devActs.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['#', 'Activity', 'Description', 'Est. Hours', 'Progress']],
          body: devActs.map((a, i) => [
            String(i + 1),
            a.title,
            (a.description ?? '').slice(0, 80),
            String(a.est_hours ?? '—'),
            actEffectivePct(a) + '%',
          ]),
          styles: { fontSize: 7.5, cellPadding: 2.5 },
          headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 18 }, 4: { cellWidth: 16 } },
          margin: { left: L, right: W - R },
        });
        y = doc.lastAutoTable.finalY + 8;
      } else {
        y = paragraph(y, '(No development activities recorded.)');
      }

      // ── SECTION 4: Quality Assurance / Test Results ───────────
      if (y > 220) { doc.addPage(); y = 15; }
      y = sectionHeader(y, '4. QUALITY ASSURANCE — TEST RESULTS', headerColor);
      const testPhasesDone = testPhases.filter(pk => activities.some(a => a.phase === pk));
      if (testPhasesDone.length > 0) {
        for (const pk of testPhasesDone) {
          const label = DEFAULT_ACTIVITY_PHASES.find(p => p.key === pk)?.label ?? pk;
          const phActs = activities.filter(a => a.phase === pk);
          const passed = phActs.filter(a => a.test_outcome === 'passed').length;
          const failed = phActs.filter(a => a.test_outcome === 'needs_adjustment').length;
          if (y > 240) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 75, 140);
          doc.text(`${label} — ${passed}/${phActs.length} passed`, L, y); doc.setTextColor(0, 0, 0); y += 6;
          autoTable(doc, {
            startY: y,
            head: [['Activity', 'Outcome', 'Coverage', 'Issue / Notes']],
            body: phActs.map(a => [
              a.title,
              a.test_outcome === 'passed' ? '✓ Passed' : a.test_outcome === 'needs_adjustment' ? '⚠ Adjustment' : 'Pending',
              a.coverage_pct != null ? a.coverage_pct + '%' : '—',
              (a.adjustment_notes ?? '').slice(0, 100),
            ]),
            styles: { fontSize: 7.5, cellPadding: 2.5 },
            headStyles: { fillColor: [240, 245, 255], textColor: headerColor, fontStyle: 'bold' },
            columnStyles: { 1: { cellWidth: 22 }, 2: { cellWidth: 18 } },
            didParseCell: (data) => {
              if (data.column.index === 1) {
                if (data.cell.raw === '✓ Passed') data.cell.styles.textColor = [5, 150, 105];
                if (data.cell.raw === '⚠ Adjustment') data.cell.styles.textColor = [180, 83, 9];
              }
            },
            margin: { left: L, right: W - R },
          });
          y = doc.lastAutoTable.finalY + 8;
          if (failed > 0) y += 2;
        }
      } else {
        y = paragraph(y, '(No test activities recorded.)');
      }

      // ── SECTION 5: Adjustments Made ──────────────────────────
      if (y > 220) { doc.addPage(); y = 15; }
      y = sectionHeader(y, '5. ADJUSTMENTS MADE', headerColor);
      const adjPhasesDone = adjPhases.filter(pk => activities.some(a => a.phase === pk));
      if (adjPhasesDone.length > 0) {
        for (const pk of adjPhasesDone) {
          const label = DEFAULT_ACTIVITY_PHASES.find(p => p.key === pk)?.label ?? pk;
          const phActs = activities.filter(a => a.phase === pk);
          if (y > 240) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 75, 140);
          doc.text(label, L, y); doc.setTextColor(0, 0, 0); y += 6;
          autoTable(doc, {
            startY: y,
            head: [['#', 'Corrective Activity', 'Description', 'Est. Hours']],
            body: phActs.map((a, i) => [
              String(i + 1),
              a.title,
              (a.description ?? '').slice(0, 100),
              String(a.est_hours ?? '—'),
            ]),
            styles: { fontSize: 7.5, cellPadding: 2.5 },
            headStyles: { fillColor: [240, 245, 255], textColor: headerColor, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 18 } },
            margin: { left: L, right: W - R },
          });
          y = doc.lastAutoTable.finalY + 8;
        }
      } else {
        y = paragraph(y, '(No adjustments were required.)');
      }

      // ── SECTION 6: Final Delivered Scope ─────────────────────
      if (y > 220) { doc.addPage(); y = 15; }
      y = sectionHeader(y, '6. FINAL DELIVERED SCOPE', headerColor);
      // All activities that are 100% done
      const deliveredActs = activities.filter(a => actEffectivePct(a) === 100 && a.activity_type !== 'sub_case');
      if (deliveredActs.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Phase', 'Delivered Item', 'Hours Logged']],
          body: deliveredActs.map(a => {
            const phaseDef = DEFAULT_ACTIVITY_PHASES.find(p => p.key === a.phase);
            const logged = timeEntries.filter(e => e.activity_id === a.id).reduce((s, e) => s + (e.hours ?? 0), 0);
            return [phaseDef?.label ?? 'Unassigned', a.title, logged.toFixed(1) + 'h'];
          }),
          styles: { fontSize: 7.5, cellPadding: 2.5 },
          headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
          columnStyles: { 2: { cellWidth: 22 } },
          margin: { left: L, right: W - R },
        });
        y = doc.lastAutoTable.finalY + 8;
      } else {
        y = paragraph(y, '(No completed activities recorded.)');
      }

      // ── SECTION 7: User Manual ────────────────────────────────
      doc.addPage(); y = 15;
      y = sectionHeader(y, '7. USER MANUAL', [16, 185, 129]);
      y = renderMarkdownSection(y, userManual);

      // ── Sign-off page ─────────────────────────────────────────
      if (y > 220) { doc.addPage(); y = 15; }
      y = sectionHeader(y, 'SIGN-OFF', headerColor);
      autoTable(doc, {
        startY: y,
        head: [['Role', 'Name', 'Signature', 'Date']],
        body: [
          ['Project Manager', '', '', ''],
          ['Lead Consultant', '', '', ''],
          ['Client Representative', '', '', ''],
          ['Quality Approver', '', '', ''],
        ],
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
        margin: { left: L, right: W - R },
      });

      // Save
      const pdfBlob = doc.output('blob');
      const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
      const fileName = `ClosureReport_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await addDocument(file, 'Case Closure Report — auto-generated on approval');
      if (refetchDocuments) await refetchDocuments();

      // Change status to approved
      await onStatusChange(caseData.id, 'approved');
      await addComment({
        body: `Case approved${bypass ? ` (bypassed by ${auth.user?.email ?? 'manager'}: ${bypassReason})` : ''}. Case Closure Report saved to Docs.`,
        isInternal: false,
      });
      setApprovalModal(false);
    } catch (e) {
      alert(t("alert.closure_failed") + e.message);
    } finally {
      setGeneratingClosure(false);
    }
  }

  // Activities-derived progress — time-logged hours blend in when est_hours is set.
  // effectivePct = max(manual progress_pct, time-derived pct from logged/est_hours).
  const totalEstHours = activities.reduce((s, a) => s + (a.est_hours || 0), 0);
  function actEffectivePct(act) {
    if (act.activity_type === "sub_case") return act.sub_progress ?? 0;
    const logged = timeEntries.filter(e => e.activity_id === act.id).reduce((s, e) => s + (e.hours ?? 0), 0);
    const timePct = act.est_hours > 0 ? Math.min(100, Math.round((logged / act.est_hours) * 100)) : 0;
    return Math.max(act.progress_pct ?? 0, timePct);
  }
  const caseProgress  = activities.length === 0 ? (caseData.progress_pct ?? 0) :
    Math.round(
      activities.reduce((s, a) => s + actEffectivePct(a) * (a.est_hours || 1), 0) /
      activities.reduce((s, a) => s + (a.est_hours || 1), 0)
    );
  const allActivitiesDone = activities.length > 0 && activities.every(a => actEffectivePct(a) === 100);

  // Notify when all activities first reach 100%
  const prevAllDoneRef = useRef(false);
  useEffect(() => {
    if (allActivitiesDone && !prevAllDoneRef.current) {
      notifyCaseParticipants(caseData.id, null, "All activities complete", `All activities for "${caseData.title}" are done — ready to move to the test phase.`, { case_id: caseData.id, event_type: "milestone" });
      notifyManagers("Case ready for testing", `"${caseData.title}" has all activities at 100% and is ready for Technical Test.`);
    }
    prevAllDoneRef.current = allActivitiesDone;
  }, [allActivitiesDone]);

  const allTabs = [
    { id: "detail",     label: t("case.tab_details"),    icon: ClipboardList, count: null },
    { id: "activities", label: t("case.tab_activities"), icon: ListChecks,    count: activities.length || null },
    { id: "milestones", label: t("case.tab_milestones"), icon: Flag,          count: `${doneMilestones}/${milestones.length}` },
    { id: "comments",   label: t("case.tab_comments"),   icon: MessageSquare, count: comments.length },
    { id: "subcases",   label: t("case.tab_subcases"),   icon: Layers,        count: subCases.length },
    { id: "documents",  label: t("case.tab_docs"),       icon: Paperclip,     count: (documents.length + caseFilesForSpec.length) || null },
    { id: "time",       label: t("case.tab_time"),       icon: Clock,         count: `${totalTimeHours.toFixed(1)}h` },
    ...(auth.isAdmin || auth.isManager || auth.isClient ? [{ id: "applications", label: t("case.tab_applicants"), icon: Users, count: applications.length }] : []),
    ...(caseData.is_head_hunter && (auth.isAdmin || auth.isManager || auth.isClient || auth.isHeadhunter) ? [{ id: "hh_proposals", label: "HH Proposals", icon: Crosshair, count: auth.isHeadhunter ? null : (hhProposals.filter(p => p.status === "pending").length || null) }] : []),
    ...(auth.isAdmin || auth.isManager || auth.isClient ? [{ id: "lifecycle", label: t("case.tab_lifecycle"), icon: TrendingUp, count: null }] : []),
    { id: "spec",           label: t("case.tab_spec"),         icon: FileText, count: null },
    ...((auth.isAdmin || auth.isManager || auth.isConsultant) && caseData.status === 'in_progress'
      ? [{ id: "implementation", label: t("sap.impl_tab_title"), icon: Code2, count: null }]
      : []),
  ];
  const tabs = (() => {
    const filtered = stageRules.visible_tabs
      ? allTabs.filter(t => stageRules.visible_tabs.includes(t.id))
      : allTabs;
    const order = stageRules.tab_order;
    if (!order?.length) return filtered;
    return [...filtered].sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
  })();

  // Auto-detect completion per tab; manual overrides take precedence
  const tabStatus = (() => {
    const r = {};
    for (const tab of tabs) {
      if (manualCompletions[tab.id] !== undefined) {
        r[tab.id] = manualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      switch (tab.id) {
        case "detail":         r[tab.id] = "in_progress"; break;
        case "documents":      r[tab.id] = documents.length > 0 ? "complete" : "none"; break;
        case "milestones":     r[tab.id] = milestones.length === 0 ? "none" : doneMilestones === milestones.length ? "complete" : "in_progress"; break;
        case "comments":       r[tab.id] = comments.length > 0 ? "in_progress" : "none"; break;
        case "activities":     r[tab.id] = activities.length === 0 ? "none" : allActivitiesDone ? "complete" : "in_progress"; break;
        case "time":           r[tab.id] = totalTimeHours > 0 ? "in_progress" : "none"; break;
        case "applications":   r[tab.id] = applications.length > 0 ? "complete" : "none"; break;
        case "hh_proposals":   r[tab.id] = hhProposals.some(p => p.status === "accepted") ? "complete" : hhProposals.length > 0 ? "in_progress" : "none"; break;
        case "subcases":       r[tab.id] = subCases.length > 0 ? "in_progress" : "none"; break;
        case "spec": {
          const inDocs  = documents.some(d => d.category === "spec" || d.doc_type === "spec" || (d.name ?? "").toLowerCase().includes("spec") || (d.file_name ?? "").toLowerCase().includes("spec"));
          const inFiles = caseFilesForSpec.some(f => (f.file_name ?? f.name ?? "").toLowerCase().includes("spec"));
          r[tab.id] = (inDocs || inFiles) ? "complete" : "none"; break;
        }
        case "implementation": r[tab.id] = caseData.implementation_status === "complete" ? "complete" : caseData.implementation_status ? "in_progress" : "none"; break;
        default:               r[tab.id] = "none";
      }
    }
    return r;
  })();

  // If the active tab was hidden by stage rules, fall back to first visible tab
  useEffect(() => {
    if (!stageRules.visible_tabs) return;
    if (!stageRules.visible_tabs.includes(activeTab)) {
      const fallback = stageRules.visible_tabs[0];
      if (fallback && fallback !== activeTab) setActiveTab(fallback);
    }
  }, [stageRules.visible_tabs, activeTab]);

  useEffect(() => {
    setMountedSlides(prev => { const s = new Set(prev); s.add(activeTab); return s; });
    const el = carouselRef.current;
    if (!el) return;
    const idx = tabs.findIndex(t => t.id === activeTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    carouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { carouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [activeTab]);

  return (
    <div className="space-y-4">

      {/* Full-page header — only when rendered outside a modal */}
      {onBack && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <button onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
            {t("case.back")}
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <ProjectAvatar
                project={caseData.project ?? { name: caseData.client?.client_profiles?.company_name || caseData.client?.full_name || caseData.title, client: caseData.client }}
                size={52}
                className="flex-shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{caseData.title}</h1>
                {caseData.project?.name && (
                  <p className="text-sm text-gray-500 font-medium mt-0.5">{caseData.project.name}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(() => {
                    const stage = lifecycleStages.find(s => s.key === caseData.status);
                    return stage
                      ? <span className="px-2 py-0.5 text-xs font-semibold rounded-lg" style={{ backgroundColor: stage.color + "22", color: stage.color }}>{stage.label}</span>
                      : <Badge className={STATUS_COLORS[caseData.status] ?? "bg-gray-100 text-gray-600"}>{STATUS_LABEL_KEYS[caseData.status] ? t(STATUS_LABEL_KEYS[caseData.status]) : cap(fmt(caseData.status))}</Badge>;
                  })()}
                  <Badge className={PRIORITY_COLORS[caseData.priority]}>{PRIORITY_LABEL_KEYS[caseData.priority] ? t(PRIORITY_LABEL_KEYS[caseData.priority]) : cap(caseData.priority)}</Badge>
                  {caseData.is_confidential && <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">{t("case.badge_private")}</span>}
                  {caseData.nda_required && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">{t("case.badge_nda")}</span>}
                  {caseData.application_mode === "team"       && <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold"><Users size={9}/> Teams only</span>}
                  {caseData.application_mode === "individual" && <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold"><User size={9}/> Individual only</span>}
                  {(caseData.application_mode === "both" || !caseData.application_mode) && <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold"><Users size={9}/> Teams & Individual</span>}
                  {(() => {
                    const v = visCfg.getCaseVisibility(caseData.id, caseData.client_id);
                    if (v === 'private')      return <span className="px-2 py-0.5 bg-gray-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"><Lock size={9}/>{t('case.vis_private')}</span>;
                    if (v === 'invite-only')  return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1"><UserPlus size={9}/>{t('case.vis_invite')}</span>;
                    return null;
                  })()}
                  {_activeSapEnv && (auth.isAdmin || auth.isManager || auth.isConsultant) && (() => {
                    const meta = SAP_ENV_TYPE_META[_activeSapEnv.envType] ?? SAP_ENV_TYPE_META.dev;
                    const canSwitch = _sapEnvs.length > 1 && (auth.isAdmin || auth.isManager);
                    return (
                      <div className="relative">
                        <button
                          onClick={() => canSwitch && setShowSapEnvPicker(p => !p)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${meta.color} ${canSwitch ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                          title={`SAP: ${_activeSapEnv.host || _activeSapEnv.name}${canSwitch ? ' — click to change' : ''}`}>
                          <Code2 size={9} />{_activeSapEnv.name}
                          {canSwitch && <ChevronDown size={9} />}
                        </button>
                        {showSapEnvPicker && canSwitch && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowSapEnvPicker(false)} />
                            <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[180px]">
                              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1">SAP Environment</div>
                              {_sapEnvs.map(env => {
                                const em = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
                                const isActive = env.id === (_sapCaseEnvMap[caseData.id] ?? _sapEnvs[0]?.id);
                                return (
                                  <button key={env.id}
                                    onClick={() => _saveCaseEnv(env.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${isActive ? 'font-semibold' : ''}`}>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${em.color}`}>{em.label.split(' ')[0]}</span>
                                    <span className="flex-1 text-left truncate">{env.name}</span>
                                    {isActive && <CheckCircle2 size={12} className="text-blue-500 flex-shrink-0" />}
                                  </button>
                                );
                              })}
                              {_sapCaseEnvMap[caseData.id] && (
                                <>
                                  <div className="border-t border-gray-100 mt-1 pt-1">
                                    <button onClick={() => _saveCaseEnv(null)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors">
                                      Reset to project default
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {caseData.status === "standby" && caseData.standby_reason && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-lg text-xs font-semibold flex items-center gap-1">
                      ⏸ {caseData.standby_reason}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEditCase && (
                <button onClick={() => setShowEditWizard(true)}
                  className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5">
                  {t("action.edit")}
                </button>
              )}
            </div>
          </div>
          {caseData.description && (
            <p className="text-sm text-gray-600 leading-relaxed mt-3">{caseData.description}</p>
          )}
        </div>
      )}

      {/* Lifecycle Track */}
      <CaseLifecycleTrack stages={lifecycleStages} currentStatus={caseData.status} />

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t("case.overall_progress")}</span>
          <span className="font-semibold text-gray-800">{caseProgress}%</span>
        </div>
        <div className="h-2.5 bg-blue-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${caseProgress}%` }} />
        </div>
        {milestones.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">{t("case.milestones_progress")} {milestonePct}% complete</div>
        )}
      </div>

      {/* Ready-to-test banner */}
      {allActivitiesDone && activities.length > 0 && !['technical_test','functional_test','user_test','completed','terminated','cancelled','closed','approved'].includes(caseData.status) && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">{t("cd.ready_for_testing")}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{t("cd.ready_for_testing_sub")}</p>
          </div>
        </div>
      )}

      {/* Lifecycle Pipeline — same carousel style as section cards */}
      {onStatusChange && (() => {
        const curStage = lifecycleStages.find(s => s.key === caseData.status);
        const allowedNext  = curStage?.allowed_next?.length  ? curStage.allowed_next  : null;
        const allowedRoles = curStage?.allowed_roles?.length ? curStage.allowed_roles : null;
        const canChange = auth.isAdmin || !allowedRoles || allowedRoles.includes(auth.role);
        if (!canChange && !curStage) return null;
        const statusInLifecycle = lifecycleStages.some(s => s.key === caseData.status);
        const curIdx = lifecycleStages.findIndex(s => s.key === caseData.status);
        const validNextKeys = new Set(
          allowedNext
            ? lifecycleStages.filter(s => allowedNext.includes(s.key) && s.trigger !== "auto").map(s => s.key)
            : lifecycleStages.filter(s => (s.key !== caseData.status || !statusInLifecycle) && s.trigger !== "auto").map(s => s.key)
        );

        const TEST_STAGES = ['technical_test', 'functional_test', 'user_test'];

        function stageGateItems(stageKey) {
          const allGates = cdSettings["transition_gates"] ?? {};
          const lcGates = allGates[lifecycleKey] ?? {};
          const gate = lcGates[stageKey];
          if (!gate?.enabled) return [];
          return (gate.conditions ?? []).filter(c => c.enabled).map(c => {
            const def = GATE_CONDITIONS.find(d => d.key === c.key);
            return { key: c.key, label: def?.label ?? c.key, mode: c.mode, passed: def ? def.check(caseData, gateData) : false };
          });
        }

        function stageState(s, idx) {
          if (s.key === caseData.status) return "current";
          if (idx < curIdx) return "past";
          if (canChange && !curStage?.is_terminal && validNextKeys.has(s.key)) return "reachable";
          return "future";
        }

        // All non-auto stages in original lifecycle order; carousel starts at current
        const allDisplayStages = lifecycleStages.filter(s => s.trigger !== "auto");
        if (!allDisplayStages.length) return null;
        const displayStages = allDisplayStages;

        const clampedActive = Math.max(0, Math.min(pipelineActiveIdx, displayStages.length - 1));

        function pipelineScrollTo(idx) {
          const clamped = Math.max(0, Math.min(idx, displayStages.length - 1));
          setPipelineActiveIdx(clamped);
          pipelineScrolling.current = true;
          const el = pipelineRef.current;
          if (el) {
            const child = el.children[clamped];
            if (child) child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          }
          setTimeout(() => { pipelineScrolling.current = false; }, 600);
        }

        function onPipelineScroll() {
          if (pipelineScrolling.current) return;
          const el = pipelineRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          if (closest !== pipelineActiveIdx) setPipelineActiveIdx(closest);
        }

        return (
          <div style={{ position: "relative" }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.next_steps")}</p>

            {/* Left arrow */}
            {clampedActive > 0 && (
              <button onClick={() => pipelineScrollTo(clampedActive - 1)}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 32, height: 32, borderRadius: "50%", border: "1.5px solid var(--t-arrow-border)", background: "var(--t-arrow-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)", marginTop: 10 }}>
                <ChevronLeft size={16} style={{ color: "var(--t-text2)" }} />
              </button>
            )}
            {/* Right arrow */}
            {clampedActive < displayStages.length - 1 && (
              <button onClick={() => pipelineScrollTo(clampedActive + 1)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 32, height: 32, borderRadius: "50%", border: "1.5px solid var(--t-arrow-border)", background: "var(--t-arrow-bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)", marginTop: 10 }}>
                <ChevronRight size={16} style={{ color: "var(--t-text2)" }} />
              </button>
            )}

            {/* Carousel track */}
            <div ref={pipelineRef} onScroll={onPipelineScroll}
              style={{ display: "flex", overflowX: "scroll", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", gap: 10, padding: "0 20px" }}>
              {displayStages.map((s, displayIdx) => {
                const origIdx = allDisplayStages.findIndex(st => st.key === s.key);
                const state = stageState(s, origIdx);
                const isActive = displayIdx === clampedActive;
                const isCancelled = s.key === "cancelled";
                const color = isCancelled ? "#EF4444" : (s.color ?? "#6B7280");
                const gateItems = stageGateItems(s.key);
                const isTestStage = TEST_STAGES.includes(s.key);
                const needsConfirm = isTestStage && caseProgress < 100 && activities.length > 0;
                const isPending = pendingStageKey === s.key;
                const hasBlockers = gateItems.some(c => !c.passed && c.mode === "block");
                const hasWarnings = gateItems.some(c => !c.passed && c.mode === "warn");

                const borderColor = state === "past" ? "rgba(100,160,220,0.2)"
                  : state === "current" ? color
                  : state === "reachable" ? color + "88"
                  : "rgba(100,160,220,0.15)";
                const bgColor = state === "past" ? "var(--t-pill-inactive-bg)"
                  : state === "current" ? color + "18"
                  : "var(--t-card-bg)";
                const WIcon = getStageIcon(s.key);

                return (
                  <div key={s.key}
                    style={{ flex: "0 0 calc(33.333% - 8px)", width: "calc(33.333% - 8px)", maxWidth: "calc(33.333% - 8px)", minWidth: 0, overflow: "hidden", scrollSnapAlign: "center", scrollSnapStop: "always", opacity: isActive ? 1 : 0.5, transform: isActive ? "scale(1)" : "scale(0.97)", transition: "opacity .25s, transform .25s" }}>
                    <div style={{ borderRadius: 12, border: `1px solid ${isActive ? borderColor : "#E2E8F0"}`, background: bgColor, overflow: "hidden", width: "100%", boxSizing: "border-box", height: 320, display: "flex", flexDirection: "column", boxShadow: isActive ? "0 4px 20px rgba(0,0,0,.08)" : "none", transition: "box-shadow .25s", cursor: isActive ? "default" : "pointer", position: "relative" }}
                      onClick={() => !isActive && pipelineScrollTo(displayIdx)}>

                      {/* Watermark icon */}
                      <WIcon size={120} style={{ position: "absolute", bottom: 12, right: 12, opacity: 0.30, color: state === "current" ? color : "#94A3B8", pointerEvents: "none", zIndex: 0, flexShrink: 0 }} />

                      {/* Card header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--t-tab-border)", background: isActive ? (state === "current" ? color + "22" : "var(--t-tab-active)") : "var(--t-tab-inactive)", flexShrink: 0, position: "relative", zIndex: 1 }}>
                        {/* State dot */}
                        {state === "past"
                          ? <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={9} color="white" strokeWidth={3} /></div>
                          : state === "current"
                            ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginRight: 2 }} />
                            : <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(100,160,220,0.3)", flexShrink: 0, marginRight: 2 }} />
                        }
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: isActive ? (state === "current" ? color : "var(--t-text)") : "var(--t-text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.label}
                        </span>
                        {/* State badge */}
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: isActive ? (state === "current" ? color + "33" : state === "reachable" ? color + "33" : "var(--t-badge-inact-bg)") : "var(--t-badge-inact-bg)", color: isActive ? (state === "current" ? color : state === "reachable" ? color : "var(--t-text2)") : "var(--t-text2)", flexShrink: 0 }}>
                          {state === "past" ? "Done" : state === "current" ? "Current" : state === "reachable" ? (hasBlockers ? "⚠ Blocked" : hasWarnings ? "⚡ Warn" : "→ Next") : "Upcoming"}
                        </span>
                      </div>

                      {/* Card body */}
                      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
                        {/* Gate checklist */}
                        {gateItems.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {gateItems.map(cond => (
                              <div key={cond.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                {cond.passed
                                  ? <CheckCircle2 size={13} style={{ color: "#22C55E", flexShrink: 0, marginTop: 1 }} />
                                  : cond.mode === "block"
                                    ? <XCircle size={13} style={{ color: "#F87171", flexShrink: 0, marginTop: 1 }} />
                                    : <AlertTriangle size={13} style={{ color: "#FB923C", flexShrink: 0, marginTop: 1 }} />
                                }
                                <span style={{ fontSize: 12, lineHeight: 1.4, color: cond.passed ? "var(--t-text2)" : cond.mode === "block" ? "#F87171" : "#FB923C", opacity: !isActive ? 0.6 : 1 }}>
                                  {cond.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, color: "var(--t-text2)", margin: 0 }}>
                            {state === "past" ? "Completed" : state === "current" ? "No gate conditions configured" : "No requirements set"}
                          </p>
                        )}

                        {/* Action button — reachable stages only */}
                        {state === "reachable" && canChange && !curStage?.is_terminal && isActive && (
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              if (isCancelled) { initCancelModal(caseData.id); return; }
                              if (s.key === "standby") { setStandbyReason(""); setStandbyNotes(""); setStandbyModal(true); return; }
                              if (s.key === "approved") { setApprovalBypass(""); setApprovalModal(true); return; }
                              if (needsConfirm && !isPending) { setPendingStageKey(s.key); return; }
                              setPendingStageKey(null);
                              const { blockers: gb, warnings: gw } = checkTransitionGates(s.key);
                              if (gb.length > 0 || gw.length > 0) {
                                setGateModal({ caseId: caseData.id, toStatus: s.key, toLabel: s.label, toColor: color, blockers: gb, warnings: gw });
                                return;
                              }
                              await onStatusChange(caseData.id, s.key);
                              if (s.key === "completed") {
                                if (auth.isConsultant) {
                                  if (caseData.client?.id) setClientRatingModal({ caseId: caseData.id, caseTitle: caseData.title, clientId: caseData.client.id, clientName: caseData.client.full_name ?? 'Client' });
                                } else {
                                  const ratee = { id: caseData.case_assignments?.[0]?.users?.id, name: caseData.case_assignments?.[0]?.users?.full_name, role: "consultant" };
                                  if (ratee.id) setRatingModal({ caseId: caseData.id, caseTitle: caseData.title, rateeId: ratee.id, rateeName: ratee.name, rateeRole: ratee.role, raterRole: auth.role });
                                }
                              }
                            }}
                            style={{ width: "100%", padding: "9px 0", fontSize: 12, fontWeight: 700, borderRadius: 10, color: "white", background: isCancelled ? "#EF4444" : color, border: "none", cursor: "pointer", transition: "opacity .15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                            {isPending ? "Confirm?" : isCancelled ? "Cancel case" : `Move to ${s.label} →`}
                          </button>
                        )}
                        {isPending && isActive && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#B45309" }}>{caseProgress}% done</span>
                            <button onClick={e => { e.stopPropagation(); setPendingStageKey(null); }}
                              style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Cancel</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dot indicators */}
            {displayStages.length > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 10 }}>
                {displayStages.map((_, i) => (
                  <button key={i} onClick={() => pipelineScrollTo(i)}
                    style={{ width: i === clampedActive ? 18 : 6, height: 6, borderRadius: 99, background: i === clampedActive ? "#1A4B8C" : "#CBD5E1", border: "none", cursor: "pointer", padding: 0, transition: "all .2s" }} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Test Plan generator — visible only during test stages */}
      {['technical_test','functional_test','user_test'].includes(caseData.status) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Code2 size={16} className="text-indigo-600" />
            <p className="text-sm font-semibold text-indigo-800">
              {lifecycleStages.find(s => s.key === caseData.status)?.label ?? 'Test'} Plan
            </p>
          </div>
          <p className="text-xs text-indigo-600">
            {t("cd.test_plan_desc")}
          </p>
          <button
            onClick={() => generateTestPlan(caseData.status)}
            disabled={generatingTestPlan || testPlanSaved}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {generatingTestPlan ? <><Spinner size={12} /> {t("case.generating")}</> : testPlanSaved ? <><Check size={12} className="mr-1 inline" />{t("case.test_plan_saved")}</> : <><Sparkles size={12} /> {t("case.gen_test_plan")}</>}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {(() => {
        const done = tabs.filter(t => tabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/tabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{tabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, tabs.findIndex(t => t.id === activeTab));
        
        function scrollTo(idx) {
          // Only update state; useEffect handles the actual scroll + flag
          setActiveTab(tabs[Math.max(0, Math.min(idx, tabs.length - 1))]?.id ?? activeTab);
        }

        function onScroll() {
          if (carouselScrolling.current) return;
          const el = carouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const tab = tabs[closest];
          if (tab && tab.id !== activeTab) setActiveTab(tab.id);
        }
        
        return (
          <div style={{ position:'relative' }}>
            {/* Left arrow */}
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'var(--t-text2)'}}/>
              </button>
            )}
            {/* Right arrow */}
            {carouselIdx < tabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.15)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'var(--t-text2)'}}/>
              </button>
            )}
            
            {/* Scroll track */}
            <div ref={carouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              
              {tabs.map((tab, i) => {
                const isActive = tab.id === activeTab;
                const Icon = tab.icon;
                return (
                  <div key={tab.id}
                    style={{ flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity: isActive ? 1 : 0.5, transform: isActive ? 'scale(1)' : 'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'var(--t-border-active)':'var(--t-border)'}`, background:'var(--t-card-bg)', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow: isActive ? '0 4px 20px rgba(0,0,0,.12)' : 'none', transition:'box-shadow .25s' }}>
                      {/* Card header */}
                      {(() => {
                        const st = tabStatus[tab.id];
                        return (
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--t-tab-border)', background: isActive ? 'var(--t-tab-active)' : 'var(--t-tab-inactive)', flexShrink:0, cursor: isActive ? 'default' : 'pointer' }}
                            onClick={() => !isActive && scrollTo(i)}>
                            {/* Status dot */}
                            {st === "complete"
                              ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                              : st === "in_progress"
                                ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                                : <div style={{width:8,height:8,borderRadius:'50%',background:'var(--t-badge-inact-bg)',flexShrink:0,marginRight:2}}/>
                            }
                            <Icon size={13} style={{color: isActive ? 'var(--t-text-accent)' : 'var(--t-text2)', flexShrink:0}}/>
                            <span style={{flex:1, fontSize:12, fontWeight:700, color: isActive ? 'var(--t-text)' : 'var(--t-text2)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tab.label}</span>
                            {tab.count !== null && <span style={{fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:99, background: isActive ? 'var(--t-badge-act-bg)' : 'var(--t-badge-inact-bg)', color: isActive ? 'var(--t-badge-act-color)' : 'var(--t-badge-inact-color)', flexShrink:0}}>{tab.count}</span>}
                            {/* Mark done toggle — active cards only, not lifecycle */}
                            {isActive && tab.id !== "lifecycle" && (
                              <button
                                onClick={e => { e.stopPropagation(); setManualComplete(tab.id, st !== "complete"); }}
                                title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                                style={{ flexShrink:0, display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, border:`1px solid ${st === "complete" ? 'var(--t-done-border)' : 'var(--t-pill-inactive-bdr)'}`, background: st === "complete" ? 'var(--t-done-bg)' : 'var(--t-tab-inactive)', color: st === "complete" ? 'var(--t-done-color)' : 'var(--t-text2)', cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap' }}>
                                <Check size={9} strokeWidth={3}/>
                                {st === "complete" ? "Done" : "Mark done"}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {/* Content */}
                      {mountedSlides.has(tab.id) ? (
                        <div className="space-y-4" style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>
                          {/* Stage lock banner (shown only on active tab) */}
                          {isActive && currentStage?.rules && (() => {
                            const locked = [
                              !stageRules.editable && t("cd.lock_editing"),
                              !stageRules.can_log_time && t("cd.lock_time"),
                              !stageRules.can_add_activities && t("cd.lock_activities"),
                              !stageRules.can_comment && t("cd.lock_comments"),
                              !stageRules.can_upload_docs && t("cd.lock_doc_uploads"),
                            ].filter(Boolean);
                            if (!locked.length) return null;
                            return (
                              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2.5">
                                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  <span className="font-semibold">{currentStage.label} {t("cd.stage_restricted")} </span>
                                  {locked.join(", ")} {t("cd.stage_restricted_msg")}
                                </p>
                              </div>
                            );
                          })()}


                    {/* Detail Tab */}
                    {tab.id === "detail" && (
        <div className="space-y-4">
          {/* Start-date countdown banner */}
          {caseData.status === "assigned" && caseData.start_date && (() => {
            const d = Math.ceil((new Date(caseData.start_date + "T00:00:00") - Date.now()) / 86400000);
            if (d > 7) return null;
            const late = d < 0;
            const urgent = d <= 1;
            const bannerCls = late
              ? "bg-red-50 border-red-200 text-red-800"
              : urgent ? "bg-orange-50 border-orange-200 text-orange-800"
              : "bg-amber-50 border-amber-200 text-amber-800";
            const msg = late
              ? t(Math.abs(d) === 1 ? "cd.banner_start_late_one" : "cd.banner_start_late_many").replace("{n}", Math.abs(d)).replace("{date}", caseData.start_date)
              : d === 0 ? t("cd.banner_start_today").replace("{date}", caseData.start_date)
              : d === 1 ? t("cd.banner_start_tomorrow").replace("{date}", caseData.start_date)
              : t("cd.banner_starts_in").replace("{n}", d).replace("{date}", caseData.start_date);
            return (
              <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${bannerCls}`}>
                <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{msg}</span>
              </div>
            );
          })()}

          {/* Badges row with optional Edit button */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {showEditWizard && (() => {
                const stage = lifecycleStages.find(s => s.key === caseData.status);
                return stage
                  ? <span className="px-2 py-0.5 text-xs font-semibold rounded-lg" style={{ backgroundColor: stage.color + "22", color: stage.color }}>{stage.label}</span>
                  : <Badge className={STATUS_COLORS[caseData.status] ?? "bg-gray-100 text-gray-600"}>{STATUS_LABEL_KEYS[caseData.status] ? t(STATUS_LABEL_KEYS[caseData.status]) : cap(fmt(caseData.status))}</Badge>;
              })()}
              {showEditWizard && <Badge className={PRIORITY_COLORS[caseData.priority]}>{PRIORITY_LABEL_KEYS[caseData.priority] ? t(PRIORITY_LABEL_KEYS[caseData.priority]) : cap(caseData.priority)}</Badge>}
              {caseData.parent_case_id && (
                <Badge className="bg-violet-100 text-blue-700">{t("case.badge_subcase")}</Badge>
              )}
              {caseData.is_confidential && (
                <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">{t("case.badge_private")}</span>
              )}
              {caseData.nda_required && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">{t("case.badge_nda")}</span>
              )}
              {caseData.application_mode === 'team'       && <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold"><Users size={9}/> Teams only</span>}
              {caseData.application_mode === 'individual' && <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold"><User size={9}/> Individual only</span>}
              {(caseData.application_mode === 'both' || !caseData.application_mode) && <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold"><Users size={9}/> Teams & Individual</span>}
              {(() => {
                const v = visCfg.getCaseVisibility(caseData.id, caseData.client_id);
                if (v === 'private')     return <span className="px-2 py-0.5 bg-gray-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"><Lock size={9}/>{t('case.vis_private')}</span>;
                if (v === 'invite-only') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1"><UserPlus size={9}/>{t('case.vis_invite')}</span>;
                return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold flex items-center gap-1"><Globe size={9}/>{t('case.vis_public')}</span>;
              })()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(auth.isAdmin || auth.isManager) && (
                <button onClick={() => setShowInvoiceModal(true)}
                  className="text-sm border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0 transition-colors">
                  <Receipt className="w-3.5 h-3.5" />{t("invoice.generate")}
                </button>
              )}
              {canEditCase && (
                <button onClick={() => setShowEditWizard(true)}
                  className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5 flex-shrink-0">
                  {t("action.edit")}
                </button>
              )}
            </div>
          </div>

          {showEditWizard && (
            <p className="text-gray-700 text-sm leading-relaxed">{caseData.description || t("cd.no_description")}</p>
          )}

          {/* Overview card */}
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("cd.overview")}</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              {caseData.budget && <div><span className="text-gray-400">{t("label.budget")}: </span><span className="font-medium">${Number(caseData.budget).toLocaleString()}</span></div>}
              {caseData.due_date && <div><span className="text-gray-400">{t("label.due")}</span><span className="font-medium">{fmtDate(caseData.due_date)}</span></div>}
              {caseData.start_date && <div><span className="text-gray-400">{t("label.starts")}</span><span className="font-medium">{fmtDate(caseData.start_date)}</span></div>}
              {caseData.client?.full_name && <div><span className="text-gray-400">{t("label.client")}: </span><span className="font-medium">{caseData.client.full_name}</span></div>}
              {caseData.manager?.full_name && <div><span className="text-gray-400">{t("case.manager")}</span><span className="font-medium">{caseData.manager.full_name}</span></div>}
              {caseData.area_sap && <div><span className="text-gray-400">{t("case.sap_area")}</span><span className="font-medium">{caseData.area_sap}</span></div>}
              {caseData.area_industry && <div><span className="text-gray-400">{t("label.industry")}: </span><span className="font-medium">{caseData.area_industry}</span></div>}
              <div><span className="text-gray-400">Applications: </span><span className="font-medium">
                {caseData.application_mode === "team" ? "Teams only" : caseData.application_mode === "individual" ? "Individual only" : "Teams & Individual"}
              </span></div>
            </div>
            {activities.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <ListChecks size={12} className="text-blue-400" /> {t("case.plan_progress")}
                  </span>
                  <span className="text-sm font-bold text-blue-700">{caseProgress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${caseProgress === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${caseProgress}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{activities.filter(a => a.status === "completed").length}/{activities.length} activities</span>
                  <span>{totalEstHours}h estimated</span>
                </div>
              </div>
            )}
            <div className="mt-3">
              <ProjectFieldEditor caseData={caseData} auth={auth} />
            </div>
          </div>

          {/* Skills */}
          {caseData.skills_required?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("label.skills")}</div>
              <div className="flex flex-wrap gap-2">
                {caseData.skills_required.map(s => (
                  <span key={s} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Visibility Control card */}
          {(() => {
            const caseVis = visCfg.getCaseVisibility(caseData.id, caseData.client_id);
            const canChange = auth.isAdmin || auth.isManager || (auth.isClient && auth.user?.id === caseData.client_id);
            const VIS_OPTIONS = [
              { id: 'public',      label: t('case.vis_public'),  desc: t('case.vis_pub_desc'),  cls: 'border-green-400 bg-green-50 text-green-700',  inact: 'border-gray-200 text-gray-500 hover:border-green-200' },
              { id: 'private',     label: t('case.vis_private'), desc: t('case.vis_priv_desc'), cls: 'border-gray-600 bg-gray-700 text-white',         inact: 'border-gray-200 text-gray-500 hover:border-gray-400' },
              { id: 'invite-only', label: t('case.vis_invite'),  desc: t('case.vis_inv_desc'),  cls: 'border-blue-400 bg-blue-50 text-blue-700',       inact: 'border-gray-200 text-gray-500 hover:border-blue-200' },
            ];
            return (
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Eye size={12} className="text-blue-400" />{t('case.vis_label')}
                  </p>
                  {(caseVis === 'private' || caseVis === 'invite-only') && (auth.isAdmin || auth.isManager || auth.isClient) && (
                    <button onClick={() => setShowInviteDrawer(true)}
                      className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-1 transition-colors">
                      <UserPlus size={11} />{t('case.invite_btn')}
                    </button>
                  )}
                </div>
                {canChange ? (
                  <div className="flex gap-2">
                    {VIS_OPTIONS.map(opt => (
                      <button key={opt.id}
                        onClick={async () => {
                          setSavingVisibility(true);
                          await visCfg.setCaseVisibility(caseData.id, opt.id);
                          setSavingVisibility(false);
                        }}
                        disabled={savingVisibility}
                        className={`flex-1 px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all text-left disabled:opacity-50 ${caseVis === opt.id ? opt.cls : opt.inact}`}>
                        <div className="font-bold mb-0.5">{opt.label}</div>
                        <div className={`font-normal text-[10px] leading-tight ${caseVis === opt.id ? 'opacity-80' : 'text-gray-400'}`}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">
                    {VIS_OPTIONS.find(o => o.id === caseVis)?.label ?? caseVis}
                    <span className="text-xs text-gray-400 ml-2">{VIS_OPTIONS.find(o => o.id === caseVis)?.desc}</span>
                  </div>
                )}
                {visCfg.getCaseInvitations(caseData.id).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium mb-1">Invited: {visCfg.getCaseInvitations(caseData.id).map(i => i.consultantName).join(', ')}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Work Arrangement card */}
          {caseData.work_mode && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.work_arrangement")}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">{caseData.work_mode}</span>
                {caseData.work_location && <span className="text-sm text-gray-600">{caseData.work_location}</span>}
                {caseData.travel_required && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold">{t("case.travel_required")}</span>
                )}
              </div>
            </div>
          )}

          {/* Case Team card */}
          {(() => {
            const consultant = caseData.case_assignments?.[0];
            const teamMembers = caseData.case_key_users ?? [];
            const hasTeam = consultant || teamMembers.length > 0 || caseData.key_user_email || caseData.is_head_hunter;
            if (!hasTeam) return null;
            const ROLE_BADGE = {
              consultant:          "bg-green-100 text-green-700",
              key_user:            "bg-amber-100 text-amber-700",
              final_user:          "bg-teal-100 text-teal-700",
              internal_consultant: "bg-indigo-100 text-indigo-700",
              project_manager:     "bg-rose-100 text-rose-700",
            };
            const ROLE_NAME = {
              consultant:          ROLE_LABELS.consultant,
              key_user:            ROLE_LABELS.key_user,
              final_user:          ROLE_LABELS.final_user,
              internal_consultant: ROLE_LABELS.internal_consultant,
              project_manager:     ROLE_LABELS.project_manager,
            };
            return (
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Case Team</p>
                <div className="space-y-1.5">
                  {consultant && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-2.5 py-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 text-xs truncate">{consultant.users?.full_name ?? "—"}</div>
                        <div className="text-[10px] text-gray-400 truncate">{consultant.users?.email}</div>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-green-100 text-green-700 rounded flex-shrink-0">Consultant</span>
                    </div>
                  )}
                  {teamMembers.map(ku => {
                    const role = ku.users?.role ?? "key_user";
                    const badge = ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600";
                    const roleName = ROLE_NAME[role] ?? role;
                    return (
                      <div key={ku.user_id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 text-xs truncate">{ku.users?.full_name ?? "—"}</div>
                          <div className="text-[10px] text-gray-400 truncate">{ku.users?.email}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {ku.area && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded">{ku.area}</span>}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge}`}>{roleName}</span>
                        </div>
                      </div>
                    );
                  })}
                  {caseData.key_user_email && !teamMembers.length && (
                    <div className="text-xs text-gray-500 px-1">{t("case.key_user_invited")}: {caseData.key_user_email}</div>
                  )}
                  {caseData.is_head_hunter && (
                    <div className="flex items-center gap-2 bg-pink-50 border border-pink-100 rounded-lg px-2.5 py-1.5">
                      <Handshake className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 text-xs truncate">{caseData.head_hunter_name || t("case.head_hunter_yes")}</div>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded flex-shrink-0">Headhunter</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Qualifications card */}
          {(caseData.certifications_required?.length > 0 || caseData.languages_required?.length > 0 ||
            caseData.min_years_experience || caseData.security_clearance) && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.requirements")}</p>
              <div className="space-y-2 text-sm">
                {caseData.min_years_experience && (
                  <div className="text-gray-700">{caseData.min_years_experience} years minimum experience</div>
                )}
                {caseData.security_clearance && (
                  <span className="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">{t("case.security_clearance")}</span>
                )}
                {caseData.certifications_required?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {caseData.certifications_required.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{c}</span>
                    ))}
                  </div>
                )}
                {caseData.languages_required?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {caseData.languages_required.map((l, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs">{l}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interview card */}
          {caseData.interview_required && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("case.interview")}</p>
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">
                  {caseData.interview_format?.replace("_", " ")}
                </span>
                <span className="text-gray-600">{caseData.interview_rounds} round{caseData.interview_rounds > 1 ? "s" : ""}</span>
                {caseData.technical_assessment && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">{t("case.technical_assessment")}</span>
                )}
              </div>
            </div>
          )}

          {/* Rate Client button — assigned consultant, case already completed */}
          {auth.isConsultant && caseData.status === "completed" &&
            caseData.case_assignments?.some(a => a.consultant_id === auth.user?.id) &&
            caseData.client?.id && (
            <div className="border-t border-gray-100 pt-4">
              <button
                onClick={() => setClientRatingModal({ caseId: caseData.id, caseTitle: caseData.title, clientId: caseData.client.id, clientName: caseData.client.full_name ?? 'Client' })}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm">
                {t('rating.rate_client')}
              </button>
            </div>
          )}

          {/* Consultant apply section */}
          {auth.isConsultant && caseData.status === "open" && (
            <div className="border-t border-gray-100 pt-4">
              {myApp ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t("case.your_application")}</span>
                  <Badge className={APP_STATUS_COLORS[myApp.status]}>{STATUS_LABEL_KEYS[myApp.status] ? t(STATUS_LABEL_KEYS[myApp.status]) : cap(myApp.status)}</Badge>
                </div>
              ) : onApply ? (
                <button onClick={onApply}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm">
                  {t("case.apply")}
                </button>
              ) : null}
            </div>
          )}

          {/* Status transition buttons — role + allowed_next aware */}
          {onStatusChange && (() => {
            const curStage = lifecycleStages.find(s => s.key === caseData.status);
            const allowedNext  = curStage?.allowed_next?.length  ? curStage.allowed_next  : null;
            const allowedRoles = curStage?.allowed_roles?.length ? curStage.allowed_roles : null;
            const canChange = auth.isAdmin || !allowedRoles || allowedRoles.includes(auth.role);
            if (!canChange) return null;
            const statusInLifecycle2 = lifecycleStages.some(s => s.key === caseData.status);
            const validNext = curStage?.is_terminal ? []
              : allowedNext
                // explicit allowed_next configured — use exactly that (exclude auto-only stages)
                ? lifecycleStages.filter(s => allowedNext.includes(s.key) && s.trigger !== "auto")
                // no allowed_next: show all other stages in this lifecycle (exclude auto-only)
                : lifecycleStages.filter(s => (s.key !== caseData.status || !statusInLifecycle2) && s.trigger !== "auto");
            if (!validNext.length) return null;
            return (
              <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2">
                {validNext.map(s => (
                  <button key={s.key}
                    onClick={() => {
                      if (s.key === "cancelled") { initCancelModal(caseData.id); return; }
                      if (s.key === "standby") { setStandbyReason(""); setStandbyNotes(""); setStandbyModal(true); return; }
                      const { blockers: gb, warnings: gw } = checkTransitionGates(s.key);
                      if (gb.length > 0 || gw.length > 0) {
                        setGateModal({ caseId: caseData.id, toStatus: s.key, toLabel: s.label, toColor: s.color, blockers: gb, warnings: gw });
                        return;
                      }
                      onStatusChange(caseData.id, s.key);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors hover:opacity-90"
                    style={{ borderColor: s.color + "55", color: s.color, backgroundColor: s.color + "12" }}>
                    → {s.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Delete — visible to creator (client) or admin/manager when case is Open with no dependencies */}
          {canDelete && (
            <div className="border-t border-red-50 pt-4 mt-2">
              <button onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4 mr-1" /> {t("cd.delete_case")}
              </button>
              <p className="text-xs text-gray-400 mt-1.5">
                {t("cd.delete_note")}
              </p>
            </div>
          )}
          {(auth.isAdmin || auth.isManager) && (
            <div className="border-t border-gray-100 pt-4 mt-2">
              <button onClick={() => setShowSaveAsTemplate(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                <LayoutTemplate className="w-4 h-4" /> {t("template.save_as")}
              </button>
            </div>
          )}
        </div>
      )}

                    {/* Milestones Tab */}
                    {tab.id === "milestones" && (
        <div className="space-y-3">
          {milestones.length > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${milestonePct}%` }} />
            </div>
          )}
          {milestones.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer"
              onClick={() => toggleMilestone(m.id, m.is_done)}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                m.is_done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                {m.is_done && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={`text-sm flex-1 ${m.is_done ? "line-through text-gray-400" : "text-gray-800"}`}>
                {m.title}
              </span>
              {m.is_done && m.done_at && (
                <span className="text-xs text-gray-300">{fmtDate(m.done_at)}</span>
              )}
            </div>
          ))}
          {milestones.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t("case.no_milestones")}</p>
          )}
          {(auth.isAdmin || auth.isManager || auth.isConsultant) && stageRules.editable && (
            <div className="flex gap-2 mt-4">
              <input value={newMilestone} onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddMilestone()}
                placeholder={t("cs.ph_milestone")}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleAddMilestone}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                {t("action.add")}
              </button>
            </div>
          )}
        </div>
      )}

                    {/* Activity / Comments Tab */}
                    {tab.id === "comments" && (
        <div className="space-y-4">
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {comments.map(c => (
              <div key={c.id} className={`rounded-xl p-4 text-sm border ${c.is_internal ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={c.author?.full_name} avatarUrl={c.author?.avatar_url} size={24} />
                    <span className="font-medium text-gray-900">{c.author?.full_name ?? t("reports.unknown")}</span>
                    {c.is_internal && <Badge className="bg-amber-200 text-amber-800">{t("case.badge_internal")}</Badge>}
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{c.body}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  {c.hours_logged > 0 && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3 inline-block" /> {t("cd.hrs_logged").replace("{n}", c.hours_logged)}</span>}
                  {c.progress_update !== null && <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 inline-block" /> {t("cd.progress_to").replace("{n}", c.progress_update)}</span>}
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">{t("case.no_activity")}</p>
            )}
          </div>

          {/* Add comment */}
          {!stageRules.can_comment && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <AlertTriangle size={13} className="flex-shrink-0" /> {t("cd.comments_locked").replace("{n}", currentStage?.label ?? "")}
            </div>
          )}
          {stageRules.can_comment && <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <Textarea label={t("case.comment_label")} value={commentForm.body}
              onChange={e => setCommentForm(p => ({ ...p, body: e.target.value }))}
              placeholder={t("case.comment_ph")} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("label.hours")}</label>
                <input type="number" min="0" value={commentForm.hoursLogged}
                  onChange={e => setCommentForm(p => ({ ...p, hoursLogged: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("case.update_progress")}</label>
                <input type="number" min="0" max="100" value={commentForm.progressUpdate}
                  onChange={e => setCommentForm(p => ({ ...p, progressUpdate: e.target.value }))}
                  placeholder={t("case.ph_progress_eg")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {(auth.isAdmin || auth.isManager) && (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={commentForm.isInternal}
                  onChange={e => setCommentForm(p => ({ ...p, isInternal: e.target.checked }))}
                  className="rounded accent-blue-600" />
                {t("case.internal_note")}
              </label>
            )}
            <button onClick={handleComment} disabled={sendingComment}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
              {sendingComment ? t("case.posting") : t("case.post_comment")}
            </button>
          </div>}
        </div>
      )}

                    {/* Sub-cases Tab */}
                    {tab.id === "subcases" && (
        <div className="space-y-3">
          {/* Header row with add + bulk-delete */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {subCases.length === 0
                ? t("case.no_subcases")
                : `${subCases.length} ${subCases.length !== 1 ? t("cd.subcase_plural") : t("cd.subcase_single")}`}
            </p>
            <div className="flex items-center gap-2">
              {canBulkDeleteSubs && subCases.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedSubIds(prev => prev.size === subCases.length ? new Set() : new Set(subCases.map(s => s.id)))}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedSubIds.size === subCases.length && subCases.length > 0 ? 'bg-red-500 border-red-500' : selectedSubIds.size > 0 ? 'bg-red-300 border-red-300' : 'border-gray-400'}`}>
                      {selectedSubIds.size > 0 && <Check size={8} className="text-white" />}
                    </div>
                    {selectedSubIds.size > 0 ? `${selectedSubIds.size} selected` : 'Select'}
                  </button>
                  {selectedSubIds.size > 0 && (
                    <button onClick={handleBulkDeleteSubs} disabled={deletingBulkSubs}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors">
                      {deletingBulkSubs ? <><Spinner size={10} /> Deleting…</> : <><Trash2 size={12} /> Delete {selectedSubIds.size}</>}
                    </button>
                  )}
                  {selectedSubIds.size > 0 && (
                    <button onClick={() => setSelectedSubIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                  )}
                </div>
              )}
              {canAddSubCase && !showSubCaseForm && (
                <button onClick={() => setShowSubCaseForm(true)}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                  {t("case.new_subcase")}
                </button>
              )}
            </div>
          </div>

          {/* Create sub-case form */}
          {showSubCaseForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-gray-900 text-sm">{t("case.new_subcase")}</h4>
              <Input label={t("label.title")} value={subCaseForm.title}
                onChange={e => setSubCaseForm(p => ({ ...p, title: e.target.value }))}
                placeholder={t("cs.ph_subcase_title")} />
              <Textarea label={t("label.description")} value={subCaseForm.description}
                onChange={e => setSubCaseForm(p => ({ ...p, description: e.target.value }))}
                placeholder={t("cs.ph_subcase_desc")} />
              <div className="grid grid-cols-2 gap-3">
                <Select label={t("label.priority")} value={subCaseForm.priority}
                  onChange={e => setSubCaseForm(p => ({ ...p, priority: e.target.value }))}
                  options={["low","medium","high","critical"].map(s => ({ value: s, label: PRIORITY_LABEL_KEYS[s] ? t(PRIORITY_LABEL_KEYS[s]) : cap(s) }))} />
                <Select label={t("label.status")} value={subCaseForm.status}
                  onChange={e => setSubCaseForm(p => ({ ...p, status: e.target.value }))}
                  options={["open","in_progress"].map(s => ({ value: s, label: STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : cap(fmt(s)) }))} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSubCaseForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{t("action.cancel")}</button>
                <button onClick={handleCreateSubCase} disabled={savingSubCase}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingSubCase ? t("case.creating_subcase") : t("case.create_subcase")}
                </button>
              </div>
            </div>
          )}

          {/* Sub-case list */}
          <div className="space-y-2">
            {subCases.map(sc => (
              <div key={sc.id}
                className={`border rounded-xl p-4 hover:bg-gray-50 transition-colors ${selectedSubIds.has(sc.id) ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3">
                  {canBulkDeleteSubs && (
                    <button onClick={e => { e.stopPropagation(); setSelectedSubIds(prev => { const n = new Set(prev); n.has(sc.id) ? n.delete(sc.id) : n.add(sc.id); return n; }); }}
                      className={`flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedSubIds.has(sc.id) ? 'bg-red-500 border-red-500' : 'border-gray-300 hover:border-red-400'}`}>
                      {selectedSubIds.has(sc.id) && <Check size={8} className="text-white" />}
                    </button>
                  )}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedSubCase(sc)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{sc.title}</span>
                      <Badge className={STATUS_COLORS[sc.status]}>{STATUS_LABEL_KEYS[sc.status] ? t(STATUS_LABEL_KEYS[sc.status]) : cap(fmt(sc.status))}</Badge>
                      <Badge className={PRIORITY_COLORS[sc.priority]}>{PRIORITY_LABEL_KEYS[sc.priority] ? t(PRIORITY_LABEL_KEYS[sc.priority]) : cap(sc.priority)}</Badge>
                    </div>
                    {sc.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{sc.description}</p>
                    )}
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                      {sc.due_date && <span>{t("label.due_date")}: {fmtDate(sc.due_date)}</span>}
                      {sc.progress_pct > 0 && <span>{t("label.progress")}: {sc.progress_pct}%</span>}
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm flex-shrink-0">›</span>
                </div>
                {sc.progress_pct > 0 && (
                  <div className="h-1 bg-gray-100 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${sc.progress_pct}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Inline sub-case detail */}
          {selectedSubCase && (
            <div className="border-2 border-blue-200 rounded-2xl p-5 mt-3">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-gray-900">{selectedSubCase.title}</h4>
                <button onClick={() => setSelectedSubCase(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <CaseDetail
                caseData={selectedSubCase}
                auth={auth}
                onStatusChange={(id, status) => {
                  if (status === "cancelled") { initCancelModal(id, true); return; }
                  supabase.from("cases").update({ status }).eq("id", id)
                    .then(() => setSelectedSubCase(prev => ({ ...prev, status })));
                }}
                onDelete={async () => {
                  await supabase.from("cases").delete().eq("id", selectedSubCase.id);
                  setSelectedSubCase(null);
                }}
                onUpdate={async (id, updates) => {
                  await updateCase(id, updates);
                  setSelectedSubCase(prev => ({ ...prev, ...updates }));
                }}
              />
            </div>
          )}
        </div>
      )}

                    {/* Applications Tab */}
                    {tab.id === "applications" && (auth.isAdmin || auth.isManager || auth.isClient) && (
        <ApplicantRankingSection
          caseData={caseData}
          auth={auth}
          applications={applications}
          reviewApplication={handleReviewApplication}
        />
      )}

                    {/* HH Proposals Tab */}
                    {tab.id === "hh_proposals" && caseData.is_head_hunter && (auth.isAdmin || auth.isManager || auth.isClient || auth.isHeadhunter) && (() => {
                    if (auth.isHeadhunter) {
                      const myProposal = hhProposals[0];
                      const statusMeta = { pending: { bg:"bg-amber-50", border:"border-amber-200", text:"text-amber-800", label:"Pending review" }, accepted: { bg:"bg-green-50", border:"border-green-200", text:"text-green-800", label:"Accepted — you are assigned" }, rejected: { bg:"bg-red-50", border:"border-red-200", text:"text-red-800", label:"Not selected" }, withdrawn: { bg:"bg-gray-50", border:"border-gray-200", text:"text-gray-600", label:"Withdrawn" } };
                      const sm = statusMeta[myProposal?.status] ?? statusMeta.pending;
                      if (!myProposal) return <div className="text-center py-12 text-gray-400 text-sm"><Crosshair size={28} className="mx-auto mb-3 text-gray-300" /><p>You have not submitted a proposal for this case yet.</p></div>;
                      return (
                        <div className="space-y-3">
                          <div className={`rounded-xl px-4 py-3 border ${sm.bg} ${sm.border} flex items-center gap-2`}>
                            <Crosshair size={15} className={sm.text} />
                            <span className={`text-sm font-semibold ${sm.text}`}>{sm.label}</span>
                          </div>
                          {myProposal.message && <p className="text-sm text-gray-600 leading-relaxed">{myProposal.message}</p>}
                          <div className="flex gap-4 text-xs text-gray-500">
                            {myProposal.candidate_count_estimate && <span>Estimated candidates: <strong>{myProposal.candidate_count_estimate}</strong></span>}
                            {myProposal.proposed_commission_pct && <span>Commission: <strong>{myProposal.proposed_commission_pct}%</strong></span>}
                            <span>Submitted: <strong>{new Date(myProposal.submitted_at).toLocaleDateString()}</strong></span>
                          </div>
                        </div>
                      );
                    }
                    return (() => {
        const accepted = hhProposals.find(p => p.status === "accepted");
        const pending  = hhProposals.filter(p => p.status === "pending");
        const others   = hhProposals.filter(p => !["pending","accepted"].includes(p.status));
        return (
          <div className="space-y-4">
            {/* Assigned HH banner */}
            {caseData.head_hunter_id ? (
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Crosshair size={16} className="text-violet-600 flex-shrink-0" />
                <div>
                  <span className="text-sm font-bold text-violet-800">Headhunter assigned</span>
                  {accepted && <span className="text-sm text-violet-700 ml-2">{accepted.headhunter?.full_name}</span>}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-800">No headhunter assigned yet. Accept a proposal below to assign one.</span>
              </div>
            )}

            {/* Empty state */}
            {hhProposals.length === 0 && (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Crosshair size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500">No proposals yet</p>
                <p className="text-xs text-gray-400 mt-1">Headhunters can apply to manage this case from the Arena.</p>
              </div>
            )}

            {/* Pending proposals */}
            {pending.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Pending ({pending.length})</div>
                <div className="space-y-3">
                  {pending.map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-xl p-4 bg-white space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(p.headhunter?.full_name ?? "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{p.headhunter?.full_name ?? "Unknown"}</div>
                            <div className="text-xs text-gray-400">{new Date(p.submitted_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={hhProposalsSaving || !!caseData.head_hunter_id}
                            onClick={() => reviewHhProposal(p.id, "rejected")}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            Reject
                          </button>
                          <button disabled={hhProposalsSaving || !!caseData.head_hunter_id}
                            onClick={() => reviewHhProposal(p.id, "accepted")}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            Accept
                          </button>
                        </div>
                      </div>
                      {p.message && <p className="text-sm text-gray-600 leading-relaxed">{p.message}</p>}
                      <div className="flex gap-4 text-xs text-gray-500">
                        {p.candidate_count_estimate && <span>Estimated candidates: <strong className="text-gray-800">{p.candidate_count_estimate}</strong></span>}
                        {p.proposed_commission_pct  && <span>Commission: <strong className="text-gray-800">{p.proposed_commission_pct}%</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accepted */}
            {accepted && (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Accepted</div>
                <div className="border border-green-200 rounded-xl p-4 bg-green-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(accepted.headhunter?.full_name ?? "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{accepted.headhunter?.full_name}</div>
                      <div className="text-xs text-gray-500">Accepted {accepted.reviewed_at ? new Date(accepted.reviewed_at).toLocaleDateString() : ""}</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-green-200 text-green-800">Assigned</span>
                  </div>
                  {accepted.message && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{accepted.message}</p>}
                  <div className="flex gap-4 text-xs text-gray-500 mt-2">
                    {accepted.candidate_count_estimate && <span>Estimated candidates: <strong className="text-gray-800">{accepted.candidate_count_estimate}</strong></span>}
                    {accepted.proposed_commission_pct  && <span>Commission: <strong className="text-gray-800">{accepted.proposed_commission_pct}%</strong></span>}
                  </div>
                </div>
              </div>
            )}

            {/* Other (rejected/withdrawn) */}
            {others.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Other</div>
                <div className="space-y-2">
                  {others.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                        {(p.headhunter?.full_name ?? "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-600 flex-1">{p.headhunter?.full_name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === "rejected" ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-500"}`}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hhProposals.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <Crosshair size={28} className="mx-auto mb-2 text-gray-300" />
                <div className="text-sm">No headhunter proposals yet</div>
                <div className="text-xs mt-1">Headhunters will submit proposals from the Arena.</div>
              </div>
            )}
          </div>
        );
      })(); })()}

                    {/* V9 Documents Tab */}
                    {tab.id === "documents" && (() => {
        const AI_NAME_PREFIXES = ['SpecA_', 'SpecB_', 'SpecC_', 'FuncSpec_'];
        const isPrototype = d =>
          d.notes?.includes('[Prototype]') || d.file_name?.startsWith('Prototype_');
        const isAiDoc = d =>
          !isPrototype(d) && (
            d.notes?.toLowerCase().includes('auto-generated') ||
            AI_NAME_PREFIXES.some(p => d.file_name?.startsWith(p))
          );
        const protoDocs = documents.filter(d => isPrototype(d));
        const aiDocs    = documents.filter(d => isAiDoc(d));
        const caseDocs  = documents.filter(d => !isPrototype(d) && !isAiDoc(d));
        const DOC_ICON = doc => doc.file_type?.includes("pdf")
          ? <FileText className="w-4 h-4 text-red-400" />
          : doc.file_type?.includes("image")
          ? <FileImage className="w-4 h-4 text-blue-400" />
          : <Paperclip className="w-4 h-4 text-gray-400" />;
        const DocRow = ({ doc }) => (
          <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
            <div className="flex-shrink-0">{DOC_ICON(doc)}</div>
            <div className="flex-1 min-w-0">
              <button onClick={() => openDocInNewTab(doc)}
                className="font-medium text-sm text-blue-600 hover:underline truncate block text-left w-full">{doc.file_name}</button>
              <div className="text-xs text-gray-400 mt-0.5">
                {doc.file_size_kb ? `${doc.file_size_kb} KB · ` : ""}
                {doc.uploader?.full_name ?? t("reports.unknown")} · {fmtDate(doc.created_at)}
              </div>
              {doc.notes && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {doc.notes.replace(/^\[[^\]]+\]\s*/, '')}
                </p>
              )}
            </div>
            {(auth.isAdmin || auth.isManager) && (
              <button onClick={() => deleteDocument(doc.id, doc.file_url)}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-50 flex-shrink-0">
                {t("action.remove")}
              </button>
            )}
          </div>
        );
        const SectionHeader = ({ Icon, iconClass, label, count, accent, children }) => (
          <div className="space-y-2">
            <div className={`flex items-center gap-2 pb-1 border-b ${accent ?? 'border-gray-100'}`}>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass ?? 'text-gray-400'}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
              {count != null && <span className="ml-auto text-xs text-gray-400">{count}</span>}
            </div>
            {children}
          </div>
        );
        return (
          <div className="space-y-6">
            {/* ── Interactive Prototypes ── */}
            {protoDocs.length > 0 && (
              <SectionHeader Icon={Monitor} iconClass="text-indigo-500" label="Interactive Prototypes" count={protoDocs.length} accent="border-indigo-100">
                <div className="space-y-2">
                  {protoDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 border border-indigo-100 rounded-xl bg-indigo-50/40 hover:bg-indigo-50">
                      <Monitor className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-800 truncate">{doc.file_name}</p>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {doc.file_size_kb ? `${doc.file_size_kb} KB · ` : ""}
                          {fmtDate(doc.created_at)}
                        </div>
                      </div>
                      <button onClick={() => openDocInNewTab(doc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 flex-shrink-0">
                        <ExternalLink className="w-3 h-3" /> Open Prototype
                      </button>
                      {(auth.isAdmin || auth.isManager) && (
                        <button onClick={() => deleteDocument(doc.id, doc.file_url)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-50 flex-shrink-0">
                          {t("action.remove")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </SectionHeader>
            )}

            {/* ── AI Generated ── */}
            <SectionHeader Icon={Sparkles} iconClass="text-violet-400" label="AI Generated" count={aiDocs.length} accent="border-violet-100">
              {aiDocs.length === 0
                ? <p className="text-xs text-gray-400 py-2 pl-1">No AI-generated documents yet — run the Spec tab to generate them.</p>
                : <div className="space-y-2">{aiDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}</div>
              }
            </SectionHeader>

            {/* ── Case Documents ── */}
            <SectionHeader Icon={FolderOpen} iconClass="text-blue-400" label="Case Documents" count={caseDocs.length} accent="border-blue-100">
              {stageRules.can_upload_docs && (
                <div className="flex justify-end mb-1">
                  <button onClick={() => setShowDocForm(p => !p)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                    + {t("action.upload")}
                  </button>
                </div>
              )}
              {showDocForm && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                      <select value={docCategory} onChange={e => setDocCategory(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                        <option value="requirements">Requirements</option>
                        <option value="deliverable">Deliverable</option>
                        <option value="reference">Reference</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t("case.file_label")}</label>
                      <input ref={docFileRef} type="file"
                        onChange={e => setPendingDocFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-gray-500 file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    </div>
                  </div>
                  <Textarea label={t("case.notes_optional")} value={docNotes}
                    onChange={e => setDocNotes(e.target.value)} placeholder={t("case.notes_doc_ph")} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowDocForm(false); setPendingDocFile(null); setDocNotes(""); setDocCategory("requirements"); }}
                      className="px-3 py-1.5 text-sm text-gray-500">{t("action.cancel")}</button>
                    <button onClick={handleDocUpload} disabled={!pendingDocFile || uploadingDoc}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {uploadingDoc ? t("state.saving") : t("action.upload")}
                    </button>
                  </div>
                </div>
              )}
              {caseDocs.length === 0
                ? <p className="text-xs text-gray-400 py-2 pl-1">{t("case.no_docs")}</p>
                : (
                  <div className="space-y-2">
                    {['requirements','deliverable','reference','other'].map(cat => {
                      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                      const catDocs = caseDocs.filter(d =>
                        cat === 'other'
                          ? !['requirements','deliverable','reference'].some(c => d.notes?.startsWith(`[${c.charAt(0).toUpperCase()+c.slice(1)}]`))
                          : d.notes?.startsWith(`[${label}]`)
                      );
                      if (!catDocs.length) return null;
                      return (
                        <div key={cat}>
                          <div className="text-xs text-gray-400 font-medium mb-1 pl-1">{label}</div>
                          <div className="space-y-1.5">{catDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}</div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </SectionHeader>

            {/* ── Work Files ── */}
            <SectionHeader Icon={Paperclip} iconClass="text-amber-400" label="Work Files" accent="border-amber-100">
              <CaseFilesPanel caseId={caseData.id} auth={auth} embedded />
            </SectionHeader>
          </div>
        );
      })()}

                    {/* ── Activities Tab ── */}
                    {tab.id === "activities" && (() => {
        const canManage = (auth.isAdmin || auth.isManager || auth.isConsultant) && stageRules.can_add_activities;
        const totalActualHoursAll = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);

        function statusColor(s) {
          return s === "completed" ? "bg-emerald-100 text-emerald-700"
            : s === "in_progress" ? "bg-blue-100 text-blue-700"
            : s === "blocked"     ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-500";
        }
        function statusLabel(s) {
          return s === "in_progress" ? t("act.in_progress") : s === "completed" ? t("act.completed")
            : s === "blocked" ? t("act.blocked") : t("act.pending");
        }

        const ADHERENCE = {
          complete:  { label: t("act.complete"),  cls: "bg-emerald-100 text-emerald-700" },
          on_track:  { label: t("act.on_track"),  cls: "bg-blue-100 text-blue-700" },
          at_risk:   { label: t("act.at_risk"),   cls: "bg-amber-100 text-amber-700" },
          behind:    { label: t("act.behind"),    cls: "bg-orange-100 text-orange-700" },
          overdue:   { label: t("act.overdue"),   cls: "bg-red-100 text-red-700" },
        };

        async function searchCasesToLink(q) {
          if (!q || q.length < 2) { setCaseSearchResults([]); return; }
          setSearchingCases(true);
          const { data } = await supabase.from("cases")
            .select("id, title, case_ref, status")
            .eq("client_id", caseData.client_id)
            .neq("id", caseData.id)
            .is("parent_case_id", null)
            .ilike("title", `%${q}%`)
            .limit(6);
          setCaseSearchResults(data ?? []);
          setSearchingCases(false);
        }

        function resetActForm() {
          setActForm({ title: "", description: "", detail: "", est_hours: 4, start_date_plan: "", end_date_plan: "", phase: "", predecessor_ids: [] });
          setActType("task");
          setSubCaseMode("create");
          setCaseSearchQuery("");
          setCaseSearchResults([]);
          setSelectedLinkedCase(null);
          setShowActForm(false);
        }

        async function handleAddActivity() {
          setSavingAct(true);
          try {
            if (actType === "task") {
              if (!actForm.title.trim()) { setSavingAct(false); return; }
              await addActivity({ ...actForm, activity_type: "task", est_hours: Number(actForm.est_hours) || 0, phase: actForm.phase || null, predecessor_ids: actForm.predecessor_ids?.length ? actForm.predecessor_ids : null });
            } else {
              // sub_case type
              if (subCaseMode === "link") {
                if (!selectedLinkedCase) { setSavingAct(false); return; }
                // Set parent_case_id on the linked case to formalise the hierarchy
                await supabase.from("cases").update({ parent_case_id: caseData.id }).eq("id", selectedLinkedCase.id);
                await addActivity({
                  title: selectedLinkedCase.title,
                  activity_type: "sub_case",
                  linked_case_id: selectedLinkedCase.id,
                  est_hours: Number(actForm.est_hours) || 0,
                  start_date_plan: actForm.start_date_plan,
                  end_date_plan: actForm.end_date_plan,
                });
              } else {
                // create mode — spin up a new sub-case then link it
                if (!actForm.title.trim()) { setSavingAct(false); return; }
                const newSubCase = await createSubCase({
                  title: actForm.title,
                  description: actForm.description,
                  priority: "medium",
                  status: subCaseInitialStatus,
                  client_id: caseData.client_id,
                  manager_id: caseData.manager_id,
                });
                await addActivity({
                  title: actForm.title,
                  description: actForm.description,
                  activity_type: "sub_case",
                  linked_case_id: newSubCase.id,
                  est_hours: Number(actForm.est_hours) || 0,
                  start_date_plan: actForm.start_date_plan,
                  end_date_plan: actForm.end_date_plan,
                });
              }
            }
            resetActForm();
          } catch (e) { alert(e.message); }
          setSavingAct(false);
        }

        async function handleSaveEdit(id) {
          setSavingAct(true);
          try {
            await updateActivity(id, {
              ...editActForm,
              est_hours: Number(editActForm.est_hours) || 0,
              test_outcome: editActForm.test_outcome ?? null,
              adjustment_notes: editActForm.adjustment_notes ?? null,
              coverage_pct: editActForm.coverage_pct != null ? Number(editActForm.coverage_pct) : null,
            });
            setEditingActId(null);
          } catch (e) { alert(e.message); }
          setSavingAct(false);
        }

        // Resolve phases for this case (customer override → default)
        const resolvedPhases = clientActivityPhases?.length ? clientActivityPhases : DEFAULT_ACTIVITY_PHASES;

        // Per-phase progress
        const phaseStats = resolvedPhases.map(phase => {
          const phaseActs = activities.filter(a => a.phase === phase.key);
          if (!phaseActs.length) return { ...phase, count: 0, pct: 0, done: 0, hours: 0, estHours: 0 };
          const done = phaseActs.filter(a => actEffectivePct(a) === 100).length;
          const pct  = Math.round(phaseActs.reduce((s, a) => s + actEffectivePct(a) * (a.est_hours || 1), 0) / phaseActs.reduce((s, a) => s + (a.est_hours || 1), 0));
          const hours = timeEntries.filter(e => phaseActs.some(a => a.id === e.activity_id)).reduce((s, e) => s + (e.hours ?? 0), 0);
          const estHours = phaseActs.reduce((s, a) => s + (a.est_hours || 0), 0);
          const isLocked = phase.required_status && caseData.status !== phase.required_status;
          return { ...phase, count: phaseActs.length, pct, done, hours, estHours, isLocked };
        });
        const hasPhaseActivities = phaseStats.some(p => p.count > 0);

        // Group activities for list view
        const phaseKeys = resolvedPhases.map(p => p.key);
        const groupedActs = [...resolvedPhases.map(p => ({
          phase: p,
          acts: activities.filter(a => a.phase === p.key),
        })), {
          phase: { key: "__none__", label: t("phase.unassigned"), color: "#9ca3af", required_status: null },
          acts: activities.filter(a => !a.phase || !phaseKeys.includes(a.phase)),
        }].filter(g => g.acts.length > 0 || !hasPhaseActivities);

        // Activity id → node map for flowchart + predecessor lookup
        const actById = new Map(activities.map(a => [a.id, a]));

        return (
          <div className="space-y-5">
            {/* Progress summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              {/* Overall */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700">{t("case.overall_progress")}</span>
                  <div className="flex items-center gap-3">
                    {canManage && caseSpec?.status === 'approved' &&
                      activities.some(a => a.phase === 'design' || a.phase === 'development') && (
                      <button
                        onClick={() => { setPendingDevPlanIsRegen(true); setShowDevPlanModal(true); }}
                        disabled={generatingDevPlan}
                        className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 hover:text-blue-700 disabled:opacity-50 transition-colors"
                        title={t("spec.regen_tooltip")}>
                        {generatingDevPlan ? <><Spinner size={9} /> {t("case.generating")}</> : <><RotateCcw size={10} /> {t("case.regenerate_plan")}</>}
                      </button>
                    )}
                    <span className="text-lg font-bold text-blue-700">{caseProgress}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${caseProgress}%` }} />
                </div>
                <div className="text-xs text-gray-400 mt-1 flex gap-4">
                  <span>{activities.filter(a => actEffectivePct(a) === 100).length} of {activities.length} activities complete</span>
                  {totalEstHours > 0 && <span>{totalActualHoursAll.toFixed(1)}h of {totalEstHours}h</span>}
                </div>
              </div>

              {/* Per-phase mini bars */}
              {hasPhaseActivities && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-gray-200">
                  {phaseStats.filter(p => p.count > 0).map(p => (
                    <div key={p.key} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                          <span className="font-semibold text-gray-600">{p.label}</span>
                          {p.isLocked && (
                            <span className="text-amber-500 text-[9px] font-bold px-1 py-0.5 bg-amber-50 rounded">
                              Locked · needs {p.required_status?.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <span className="font-bold" style={{ color: p.color }}>{p.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: p.color }} />
                      </div>
                      <div className="text-[9px] text-gray-400">{p.done}/{p.count} done{p.estHours > 0 ? ` · ${p.hours.toFixed(1)}h/${p.estHours}h` : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All-complete banner */}
            {allActivitiesDone && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">{t("cd.all_acts_complete")}</p>
                  <p className="text-xs text-emerald-600">{t("cd.all_acts_complete_sub")}</p>
                </div>
              </div>
            )}

            {/* Spec approved → generate Design & Development plan */}
            {canManage && caseSpec?.status === 'approved' &&
              !devPlanGenerated &&
              !devPlanPreview &&
              !activities.some(a => a.phase === 'design' || a.phase === 'development') && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-900">{t("cd.spec_approved_banner")}</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {t("cd.spec_approved_desc")}
                    </p>
                    <button
                      onClick={() => { setPendingDevPlanIsRegen(false); setShowDevPlanModal(true); }}
                      disabled={generatingDevPlan}
                      className="mt-2.5 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {generatingDevPlan
                        ? <><Spinner size={12} /> {t("case.generating")}</>
                        : <><Sparkles size={12} /> {t("case.gen_dev_plan")}</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dev plan preview — shown after generation, before confirm */}
            {devPlanPreview && (
              <div className="border border-blue-200 rounded-xl overflow-hidden">
                <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-white" />
                    <span className="text-sm font-bold text-white">Review Generated Plan</span>
                    <span className="text-xs text-blue-200 ml-1">· {devPlanPreview.items.filter(a => a._selected).length} of {devPlanPreview.items.length} items selected</span>
                  </div>
                  <button onClick={() => setDevPlanPreview(null)} className="text-blue-200 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="bg-white divide-y divide-gray-100">
                  {devPlanPreview.items.map((item, idx) => (
                    <div key={idx} className={`flex items-start gap-3 px-4 py-3 transition-colors ${item._selected ? '' : 'opacity-50 bg-gray-50'}`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => setDevPlanPreview(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, _selected: !it._selected } : it) }))}
                        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${item._selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {item._selected && <Check size={10} className="text-white" />}
                      </button>
                      {/* Type toggle pill */}
                      <div className="flex-shrink-0 flex rounded-lg border border-gray-200 overflow-hidden text-[10px] font-bold mt-0.5">
                        <button
                          onClick={() => setDevPlanPreview(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, _type: 'activity' } : it) }))}
                          className={`px-2 py-1 transition-colors ${item._type === 'activity' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                          Activity
                        </button>
                        <button
                          onClick={() => setDevPlanPreview(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, _type: 'subcase' } : it) }))}
                          className={`px-2 py-1 transition-colors ${item._type === 'subcase' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                          Sub-case
                        </button>
                      </div>
                      {/* Phase badge */}
                      <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${item.phase === 'design' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.phase}
                      </span>
                      {/* Editable title */}
                      <input
                        value={item.title}
                        onChange={e => setDevPlanPreview(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, title: e.target.value } : it) }))}
                        className="flex-1 min-w-0 text-sm text-gray-800 font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none py-0.5 transition-colors"
                      />
                      {/* Editable hours */}
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <input
                          type="number" min="0.5" max="40" step="0.5"
                          value={item.est_hours}
                          onChange={e => setDevPlanPreview(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, est_hours: Math.max(0.5, Math.min(40, Number(e.target.value) || 0.5)) } : it) }))}
                          className="w-14 text-xs text-gray-600 text-right bg-gray-100 hover:bg-gray-200 focus:bg-white border border-transparent focus:border-blue-400 rounded px-1.5 py-1 focus:outline-none transition-colors"
                        />
                        <span className="text-[10px] text-gray-400">h</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    {devPlanPreview.items.filter(a => a._selected && a._type === 'activity').length} activities ·{' '}
                    {devPlanPreview.items.filter(a => a._selected && a._type === 'subcase').length} sub-cases ·{' '}
                    {devPlanPreview.items.filter(a => a._selected).reduce((s, a) => s + a.est_hours, 0).toFixed(1)}h total
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setDevPlanPreview(null)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                      Discard
                    </button>
                    <button onClick={confirmDevPlan} disabled={confirmingDevPlan || !devPlanPreview.items.some(a => a._selected)}
                      className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                      {confirmingDevPlan ? <><Spinner size={10} /> Creating…</> : <><Check size={12} /> Confirm & Create</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Phase-completion → generate test plan (all passed) OR adjustment plan (any failed) */}
            {hasPhaseActivities && canManage && (() => {
              const TEST_PHASES = ['technical_test', 'functional_test', 'user_test'];

              // Adjustment needed banners: test phase is 100% done but some need adjustment
              const adjBanners = PHASE_ADJ_TRIGGERS.map(trigger => {
                const testStat = phaseStats.find(p => p.key === trigger.testPhase);
                const adjStat  = phaseStats.find(p => p.key === trigger.adjPhase);
                if (!testStat || testStat.count === 0 || testStat.pct < 100) return null;
                const testActs = activities.filter(a => a.phase === trigger.testPhase);
                const failedActs = testActs.filter(a => a.test_outcome === 'needs_adjustment');
                if (failedActs.length === 0) return null; // all passed — handled below
                if (adjStat && adjStat.count > 0) return null; // adjustment already created
                if (generatedAdjPhases.includes(trigger.adjPhase)) return null;
                if (adjustmentPreview?.adjPhase === trigger.adjPhase) return null; // preview already open
                const isGenerating = generatingAdjustment && adjustmentTarget?.adjPhase === trigger.adjPhase;
                return (
                  <div key={trigger.adjPhase} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={16} className="text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-900">
                          {t(failedActs.length !== 1 ? "cd.test_issues_many" : "cd.test_issues_one").replace("{label}", testStat.label).replace("{n}", failedActs.length)}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          {t("cd.test_adj_needed").replace("{n}", failedActs.length).replace("{total}", testStat.count)}
                        </p>
                        <div className="mt-2 space-y-1">
                          {failedActs.slice(0, 3).map(a => (
                            <p key={a.id} className="text-[10px] text-amber-800 flex items-start gap-1.5">
                              <AlertTriangle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
                              <span><span className="font-semibold">{a.title}</span>{a.adjustment_notes ? ': ' + a.adjustment_notes : ''}</span>
                            </p>
                          ))}
                          {failedActs.length > 3 && <p className="text-[10px] text-amber-600">{t("label.and_more").replace("{n}", failedActs.length - 3)}</p>}
                        </div>
                        <button
                          onClick={() => generateAdjustmentPlan(trigger.testPhase, failedActs)}
                          disabled={generatingAdjustment || generatingTestPlan}
                          className="mt-2.5 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
                          {isGenerating
                            ? <><Spinner size={12} /> {t("cd.genning_plan").replace("{n}", trigger.adjLabel)}</>
                            : <><Wand2 size={12} /> {t("cd.gen_plan").replace("{n}", trigger.adjLabel)}</>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }).filter(Boolean);

              // Next-test-plan banners: test phase is 100% done AND all passed (no needs_adjustment)
              const testBanners = PHASE_TEST_TRIGGERS.map(trigger => {
                const fromStat = phaseStats.find(p => p.key === trigger.fromPhase);
                const toStat   = phaseStats.find(p => p.key === trigger.toPhase);
                if (!fromStat || fromStat.count === 0 || fromStat.pct < 100) return null;
                if (toStat && toStat.count > 0) return null;
                if (generatedPlanPhases.includes(trigger.toPhase)) return null;
                if (testPlanPreview?.targetPhase === trigger.toPhase) return null; // preview already open
                // If source is a test phase and any activities need adjustment,
                // only suppress if the corresponding adjustment phase isn't done yet
                if (TEST_PHASES.includes(trigger.fromPhase)) {
                  const fromActs = activities.filter(a => a.phase === trigger.fromPhase);
                  const hasFailures = fromActs.some(a => a.test_outcome === 'needs_adjustment');
                  if (hasFailures) {
                    const adjTrigger = PHASE_ADJ_TRIGGERS.find(t => t.testPhase === trigger.fromPhase);
                    const adjStat = adjTrigger && phaseStats.find(p => p.key === adjTrigger.adjPhase);
                    const adjDone = adjStat && adjStat.count > 0 && adjStat.pct === 100;
                    if (!adjDone) return null; // show adj banner instead; come back after adj completes
                  }
                }
                const isGenerating = generatingTestPlan && testPlanTarget?.toPhase === trigger.toPhase;
                const fromPhaseActs = activities.filter(a => a.phase === trigger.fromPhase);
                return (
                  <div key={trigger.toPhase} className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={16} className="text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-violet-900">
                          {t("cd.phase_complete_banner").replace("{phase}", fromStat.label).replace("{plan}", trigger.label)}
                        </p>
                        <p className="text-xs text-violet-600 mt-0.5">
                          {t("cd.phase_passed_banner").replace("{n}", fromStat.count).replace("{phase}", fromStat.label).replace("{plan}", trigger.label)}
                        </p>
                        <button
                          onClick={() => generateTestPlan(trigger.toPhase, fromPhaseActs)}
                          disabled={generatingTestPlan || generatingAdjustment}
                          className="mt-2.5 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                          {isGenerating
                            ? <><Spinner size={12} /> {t("cd.genning_plan").replace("{n}", trigger.label)}</>
                            : <><Sparkles size={12} /> {t("cd.gen_plan").replace("{n}", trigger.label)}</>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }).filter(Boolean);

              if (!adjBanners.length && !testBanners.length) return null;
              return <>{adjBanners}{testBanners}</>;
            })()}

            {/* View toggle (only when activities exist) */}
            {activities.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{activities.length} activit{activities.length !== 1 ? "ies" : "y"}</span>
                <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-xl">
                  {[["list", t("act.view_list")], ["flow", t("act.view_flow")]].map(([v, l]) => (
                    <button key={v} onClick={() => setActView(v)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${actView === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add activity form */}
            {canManage && showActForm && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                {/* Type toggle — only show Sub-case option if this case is not itself a sub-case */}
                {!caseData.parent_case_id && (
                  <div className="flex items-center gap-1 p-0.5 bg-white border border-blue-200 rounded-xl w-fit">
                    <button onClick={() => setActType("task")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${actType === "task" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"}`}>
                      {t("act.task")}
                    </button>
                    <button onClick={() => setActType("sub_case")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${actType === "sub_case" ? "bg-violet-600 text-white" : "text-gray-500 hover:text-gray-700"}`}>
                      <Link2 size={11} /> {t("act.subcase")}
                    </button>
                  </div>
                )}

                {actType === "task" ? (
                  <>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t("act.new_task")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Input label={t("case.milestone_title")} value={actForm.title}
                          onChange={e => setActForm(p => ({ ...p, title: e.target.value }))}
                          placeholder={t("cd.ph_milestone_eg")} />
                      </div>
                      <Input label={t("case.milestone_hours")} type="number" min="0" step="0.5" value={actForm.est_hours}
                        onChange={e => setActForm(p => ({ ...p, est_hours: e.target.value }))} />
                      <div />
                      <Input label={t("case.milestone_start")} type="date" value={actForm.start_date_plan}
                        onChange={e => setActForm(p => ({ ...p, start_date_plan: e.target.value }))} />
                      <Input label={t("case.milestone_end")} type="date" value={actForm.end_date_plan}
                        onChange={e => setActForm(p => ({ ...p, end_date_plan: e.target.value }))} />
                      <div className="col-span-2">
                        <Textarea label={t("label.description")} value={actForm.description}
                          onChange={e => setActForm(p => ({ ...p, description: e.target.value }))}
                          placeholder={t("cd.ph_task_summary")} />
                      </div>
                      <div className="col-span-2">
                        <Textarea label={t("case.milestone_criteria")} value={actForm.detail}
                          onChange={e => setActForm(p => ({ ...p, detail: e.target.value }))}
                          placeholder={t("cd.ph_task_detail")} />
                      </div>
                      {/* Phase */}
                      {canEditPhase && stageRules.can_edit_activity_phase && (
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("case.phase_label")}</label>
                          <select value={actForm.phase}
                            onChange={e => setActForm(p => ({ ...p, phase: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">{t("case.no_phase")}</option>
                            {resolvedPhases.map(ph => (
                              <option key={ph.key} value={ph.key}>{ph.label}{ph.required_status ? ` (needs ${ph.required_status.replace(/_/g, " ")})` : ""}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Predecessors */}
                      {canEditPredecessors && stageRules.can_edit_activity_predecessors && activities.length > 0 && (
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("case.predecessors")}</label>
                          <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-white">
                            {activities.filter(a => a.activity_type !== "sub_case").map(a => (
                              <label key={a.id} className="flex items-center gap-2 cursor-pointer text-xs">
                                <input type="checkbox"
                                  checked={(actForm.predecessor_ids ?? []).includes(a.id)}
                                  onChange={e => setActForm(p => ({
                                    ...p,
                                    predecessor_ids: e.target.checked
                                      ? [...(p.predecessor_ids ?? []), a.id]
                                      : (p.predecessor_ids ?? []).filter(id => id !== a.id),
                                  }))}
                                  className="accent-blue-600" />
                                <span className="text-gray-500">#{a.task_no}</span>
                                <span className="text-gray-800 truncate">{a.title}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">{t("act.new_subcase_activity")}</p>
                    {/* Create / Link toggle */}
                    <div className="flex gap-2">
                      <button onClick={() => { setSubCaseMode("create"); setSelectedLinkedCase(null); setCaseSearchQuery(""); setCaseSearchResults([]); }}
                        className={`px-3 py-1 text-xs rounded-lg border ${subCaseMode === "create" ? "border-violet-500 bg-violet-50 text-violet-700 font-semibold" : "border-gray-200 text-gray-500"}`}>
                        {t("act.create_subcase")}
                      </button>
                      <button onClick={() => setSubCaseMode("link")}
                        className={`px-3 py-1 text-xs rounded-lg border ${subCaseMode === "link" ? "border-violet-500 bg-violet-50 text-violet-700 font-semibold" : "border-gray-200 text-gray-500"}`}>
                        {t("act.link_case")}
                      </button>
                    </div>

                    {subCaseMode === "create" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Input label={t("case.subcase_title")} value={actForm.title}
                            onChange={e => setActForm(p => ({ ...p, title: e.target.value }))}
                            placeholder={t("spec.ph_obj_title_eg")} />
                        </div>
                        <Input label={t("case.milestone_hours")} type="number" min="0" step="0.5" value={actForm.est_hours}
                          onChange={e => setActForm(p => ({ ...p, est_hours: e.target.value }))} />
                        <div />
                        <Input label={t("case.milestone_start")} type="date" value={actForm.start_date_plan}
                          onChange={e => setActForm(p => ({ ...p, start_date_plan: e.target.value }))} />
                        <Input label={t("case.milestone_end")} type="date" value={actForm.end_date_plan}
                          onChange={e => setActForm(p => ({ ...p, end_date_plan: e.target.value }))} />
                        <div className="col-span-2">
                          <Textarea label={t("label.description")} value={actForm.description}
                            onChange={e => setActForm(p => ({ ...p, description: e.target.value }))}
                            placeholder={t("cs.ph_subcase_desc")} />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Search */}
                        <div className="relative">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("case.search_cases")}</label>
                          <input
                            value={caseSearchQuery}
                            onChange={e => { setCaseSearchQuery(e.target.value); searchCasesToLink(e.target.value); }}
                            placeholder={t("case.search_cases_ph")}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                          {searchingCases && <span className="absolute right-3 top-8 text-xs text-gray-400">{t("state.searching")}</span>}
                          {caseSearchResults.length > 0 && !selectedLinkedCase && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                              {caseSearchResults.map(c => (
                                <button key={c.id}
                                  onClick={() => { setSelectedLinkedCase(c); setCaseSearchQuery(c.title); setCaseSearchResults([]); }}
                                  className="w-full text-left px-4 py-2.5 hover:bg-violet-50 border-b border-gray-100 last:border-0">
                                  <span className="text-sm font-medium text-gray-800">{c.title}</span>
                                  {c.case_ref && <span className="text-xs text-gray-400 ml-2">#{c.case_ref}</span>}
                                  <span className="text-xs text-gray-400 ml-2">{STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedLinkedCase && (
                          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                            <Link2 size={13} className="text-violet-500 flex-shrink-0" />
                            <span className="text-sm font-medium text-violet-800 flex-1">{selectedLinkedCase.title}</span>
                            <button onClick={() => { setSelectedLinkedCase(null); setCaseSearchQuery(""); }}
                              className="text-violet-400 hover:text-violet-600"><X size={14} /></button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <Input label={t("case.milestone_hours")} type="number" min="0" step="0.5" value={actForm.est_hours}
                            onChange={e => setActForm(p => ({ ...p, est_hours: e.target.value }))} />
                          <div />
                          <Input label={t("case.milestone_start")} type="date" value={actForm.start_date_plan}
                            onChange={e => setActForm(p => ({ ...p, start_date_plan: e.target.value }))} />
                          <Input label={t("case.milestone_end")} type="date" value={actForm.end_date_plan}
                            onChange={e => setActForm(p => ({ ...p, end_date_plan: e.target.value }))} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2 pt-1 border-t border-blue-100">
                  <button onClick={resetActForm} className="text-sm text-gray-500 px-3 py-1.5">{t("action.cancel")}</button>
                  <button onClick={handleAddActivity} disabled={
                    savingAct ||
                    (actType === "task" && !actForm.title.trim()) ||
                    (actType === "sub_case" && subCaseMode === "create" && !actForm.title.trim()) ||
                    (actType === "sub_case" && subCaseMode === "link" && !selectedLinkedCase)
                  }
                    className={`px-4 py-1.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${actType === "sub_case" ? "bg-violet-600 hover:bg-violet-700" : "bg-[#1A4B8C] hover:bg-blue-900"}`}>
                    {savingAct ? t("state.saving") : actType === "sub_case" ? (subCaseMode === "create" ? t("case.create_subcase") : t("act.link_case")) : t("case.add_activity")}
                  </button>
                </div>
              </div>
            )}

            {/* ── Flowchart View ── */}
            {actView === "flow" && activities.length > 0 && (() => {
              const NODE_W = 200, NODE_H = 64, COL_GAP = 56, NODE_GAP = 12, TOP_PAD = 40, LEFT_PAD = 12, BOTTOM_PAD = 20;
              const allPhaseKeys = [...resolvedPhases.map(p => p.key), "__none__"];
              const activePhaseKeys = allPhaseKeys.filter(pk =>
                activities.some(a => pk === "__none__" ? (!a.phase || !phaseKeys.includes(a.phase)) : a.phase === pk)
              );
              const getPhaseActs = pk => pk === "__none__"
                ? activities.filter(a => !a.phase || !phaseKeys.includes(a.phase))
                : activities.filter(a => a.phase === pk);
              const posMap = new Map();
              activePhaseKeys.forEach((pk, ci) => {
                getPhaseActs(pk).forEach((a, ri) => {
                  const x = LEFT_PAD + ci * (NODE_W + COL_GAP);
                  const y = TOP_PAD + ri * (NODE_H + NODE_GAP);
                  posMap.set(a.id, { x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2 });
                });
              });
              const svgW = LEFT_PAD + activePhaseKeys.length * (NODE_W + COL_GAP) + LEFT_PAD;
              const maxRows = Math.max(...activePhaseKeys.map(pk => getPhaseActs(pk).length));
              const svgH = TOP_PAD + maxRows * (NODE_H + NODE_GAP) + BOTTOM_PAD;

              function nodeColors(a) {
                const pct = actEffectivePct(a);
                if (pct === 100 || a.status === "completed") return { fill: "#d1fae5", stroke: "#059669", text: "#065f46", bar: "#059669" };
                if (a.status === "in_progress") return { fill: "#dbeafe", stroke: "#2563eb", text: "#1e40af", bar: "#2563eb" };
                if (a.status === "blocked") return { fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b", bar: "#dc2626" };
                return { fill: "#f3f4f6", stroke: "#9ca3af", text: "#6b7280", bar: "#9ca3af" };
              }

              return (
                <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <svg width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <marker id="ah" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
                        <path d="M0,0 L7,3.5 L0,7 Z" fill="#93c5fd" />
                      </marker>
                      <marker id="ah-done" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
                        <path d="M0,0 L7,3.5 L0,7 Z" fill="#6ee7b7" />
                      </marker>
                    </defs>

                    {/* Phase column backgrounds + labels */}
                    {activePhaseKeys.map((pk, ci) => {
                      const phaseDef = resolvedPhases.find(p => p.key === pk) ?? { label: t("phase.unassigned"), color: "#9ca3af" };
                      const x = LEFT_PAD + ci * (NODE_W + COL_GAP);
                      const colH = getPhaseActs(pk).length * (NODE_H + NODE_GAP) - NODE_GAP;
                      return (
                        <g key={pk}>
                          <rect x={x - 4} y={TOP_PAD - 4} width={NODE_W + 8} height={colH + 16} rx="10"
                            fill={phaseDef.color + "10"} stroke={phaseDef.color + "30"} strokeWidth="1" />
                          <text x={x + NODE_W / 2} y={22} textAnchor="middle" fontSize="10" fontWeight="800"
                            fill={phaseDef.color} letterSpacing="0.07em" style={{ textTransform: "uppercase" }}>
                            {phaseDef.labelKey ? t(phaseDef.labelKey) : phaseDef.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Predecessor arrows */}
                    {activities.flatMap(a => {
                      const preds = a.predecessor_ids ?? [];
                      return preds.map(predId => {
                        const src = posMap.get(predId);
                        const tgt = posMap.get(a.id);
                        if (!src || !tgt) return null;
                        const predDone = actEffectivePct(actById.get(predId) ?? {}) === 100;
                        const sx = src.x + NODE_W, sy = src.cy;
                        const tx = tgt.x, ty = tgt.cy;
                        const mx = (sx + tx) / 2;
                        return (
                          <path key={`${predId}→${a.id}`}
                            d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                            fill="none" stroke={predDone ? "#6ee7b7" : "#93c5fd"} strokeWidth="1.5"
                            markerEnd={predDone ? "url(#ah-done)" : "url(#ah)"} />
                        );
                      }).filter(Boolean);
                    })}

                    {/* Activity nodes */}
                    {activities.map(a => {
                      const pos = posMap.get(a.id);
                      if (!pos) return null;
                      const c = nodeColors(a);
                      const pct = actEffectivePct(a);
                      const phaseDef = resolvedPhases.find(p => p.key === a.phase);
                      const isLocked = phaseDef?.required_status && caseData.status !== phaseDef.required_status;
                      const title = a.title.length > 24 ? a.title.slice(0, 22) + "…" : a.title;
                      const predIds = a.predecessor_ids ?? [];
                      const blockedByIncomplete = predIds.some(pid => actEffectivePct(actById.get(pid) ?? {}) < 100);
                      return (
                        <g key={a.id} onClick={() => { setActView("list"); setExpandedActId(a.id); }}
                          style={{ cursor: "pointer" }}>
                          <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx="8"
                            fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
                          {(isLocked || blockedByIncomplete) && (
                            <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx="8"
                              fill="black" fillOpacity="0.06" />
                          )}
                          <text x={pos.x + 8} y={pos.y + 16} fontSize="10" fontWeight="700" fill={c.text}>
                            #{a.task_no} {isLocked ? <Lock size={9} className="inline ml-0.5" /> : blockedByIncomplete ? <Clock size={9} className="inline ml-0.5" /> : ""}
                          </text>
                          <text x={pos.x + 8} y={pos.y + 30} fontSize="11" fontWeight="600" fill={c.text}>{title}</text>
                          {/* mini progress bar */}
                          <rect x={pos.x + 8} y={pos.y + 42} width={NODE_W - 16} height={4} rx="2" fill={c.stroke + "33"} />
                          <rect x={pos.x + 8} y={pos.y + 42} width={Math.max(0, (NODE_W - 16) * pct / 100)} height={4} rx="2" fill={c.bar} />
                          <text x={pos.x + NODE_W - 8} y={pos.y + 57} fontSize="9" textAnchor="end" fill={c.text}>{pct}%</text>
                        </g>
                      );
                    })}
                  </svg>
                  <p className="text-[10px] text-gray-400 text-center pb-2">{t("cd.flow_hint")}</p>
                </div>
              );
            })()}

            {/* ── List View ── */}
            {actView === "list" && (
            <>
            {/* Activity list */}
            {activities.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ListChecks className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">{t("cd.no_activities")}</p>
                <p className="text-xs mt-1">{t("cd.no_activities_sub")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bulk-select toolbar */}
                {canBulkDeleteActs && activities.length > 0 && (
                  <div className="flex items-center gap-3 py-2 px-1">
                    <button
                      onClick={() => {
                        const allIds = activities.map(a => a.id);
                        setSelectedActIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
                      }}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                      <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedActIds.size === activities.length && activities.length > 0 ? 'bg-red-500 border-red-500' : selectedActIds.size > 0 ? 'bg-red-300 border-red-300' : 'border-gray-400'}`}>
                        {selectedActIds.size > 0 && <Check size={8} className="text-white" />}
                      </div>
                      {selectedActIds.size > 0 ? `${selectedActIds.size} selected` : 'Select all'}
                    </button>
                    {selectedActIds.size > 0 && (
                      <button onClick={handleBulkDeleteActs} disabled={deletingBulkActs}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors">
                        {deletingBulkActs ? <><Spinner size={10} /> Deleting…</> : <><Trash2 size={12} /> Delete {selectedActIds.size}</>}
                      </button>
                    )}
                    {selectedActIds.size > 0 && (
                      <button onClick={() => setSelectedActIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600 ml-auto transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {groupedActs.map(({ phase, acts }) => {
                  if (acts.length === 0) return null;
                  const isLockedPhase = phase.required_status && caseData.status !== phase.required_status;
                  const phasePct = acts.reduce((s, a) => s + actEffectivePct(a) * (a.est_hours || 1), 0) /
                                   acts.reduce((s, a) => s + (a.est_hours || 1), 0);
                  const roundedPhasePct = Math.round(phasePct || 0);
                  return (
                    <div key={phase.key}>
                      {/* Phase header */}
                      {hasPhaseActivities && (
                        <div className="flex items-center gap-3 mb-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: phase.color }} />
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: phase.color }}>{phase.labelKey ? t(phase.labelKey) : phase.label}</span>
                          {isLockedPhase && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Lock size={11} className="inline mr-1" />{t("cd.progress_locked").replace("{n}", phase.required_status?.replace(/_/g, " ") ?? "")}
                            </span>
                          )}
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs font-semibold text-gray-500">{acts.filter(a => actEffectivePct(a) === 100).length}/{acts.length}</span>
                          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${roundedPhasePct}%`, background: phase.color }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: phase.color }}>{roundedPhasePct}%</span>
                        </div>
                      )}
                      <div className="space-y-2">
                      {acts.map(act => {
                  const isEditing  = editingActId === act.id;
                  const isExpanded = expandedActId === act.id;
                  const actEntries = timeEntries.filter(e => e.activity_id === act.id);
                  const actHours   = actEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
                  const dispPct    = act.activity_type !== "sub_case"
                    ? Math.max(act.progress_pct ?? 0, act.est_hours > 0 ? Math.min(100, Math.round((actHours / act.est_hours) * 100)) : 0)
                    : (act.sub_progress ?? 0);
                  const adh        = activityAdherence({ ...act, progress_pct: dispPct });
                  const adhInfo    = adh ? ADHERENCE[adh] : null;

                  if (isEditing) return (
                    <div key={act.id} className={`border rounded-xl p-4 space-y-3 ${act.activity_type === "sub_case" ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"}`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${act.activity_type === "sub_case" ? "text-violet-700" : "text-blue-700"}`}>
                        {t(act.activity_type === "sub_case" ? "cd.edit_subcase_title" : "cd.edit_act_title").replace("{n}", act.task_no)}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {act.activity_type !== "sub_case" && (
                          <div className="col-span-2">
                            <Input label={t("case.milestone_title")} value={editActForm.title ?? ""}
                              onChange={e => setEditActForm(p => ({ ...p, title: e.target.value }))} />
                          </div>
                        )}
                        <Input label={t("case.milestone_hours")} type="number" min="0" step="0.5"
                          value={editActForm.est_hours ?? ""}
                          onChange={e => setEditActForm(p => ({ ...p, est_hours: e.target.value }))} />
                        {act.activity_type !== "sub_case" && (
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.status")}</label>
                            <select value={editActForm.status ?? "pending"}
                              onChange={e => setEditActForm(p => ({ ...p, status: e.target.value }))}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="pending">{t("act.pending")}</option>
                              <option value="in_progress">{t("act.in_progress")}</option>
                              <option value="completed">{t("act.completed")}</option>
                              <option value="blocked">{t("act.blocked")}</option>
                            </select>
                          </div>
                        )}
                        <Input label={t("case.milestone_start")} type="date" value={editActForm.start_date_plan ?? ""}
                          onChange={e => setEditActForm(p => ({ ...p, start_date_plan: e.target.value }))} />
                        <Input label={t("case.milestone_end")} type="date" value={editActForm.end_date_plan ?? ""}
                          onChange={e => setEditActForm(p => ({ ...p, end_date_plan: e.target.value }))} />
                        {act.activity_type !== "sub_case" && (
                          <>
                            <div className="col-span-2">
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.progress")} — {editActForm.progress_pct ?? 0}%</label>
                              <input type="range" min="0" max="100" step="5"
                                value={editActForm.progress_pct ?? 0}
                                onChange={e => setEditActForm(p => ({ ...p, progress_pct: Number(e.target.value) }))}
                                className="w-full accent-blue-600" />
                            </div>
                            <div className="col-span-2">
                              <Textarea label={t("label.description")} value={editActForm.description ?? ""}
                                onChange={e => setEditActForm(p => ({ ...p, description: e.target.value }))} />
                            </div>
                            <div className="col-span-2">
                              <Textarea label={t("case.milestone_criteria")} value={editActForm.detail ?? ""}
                                onChange={e => setEditActForm(p => ({ ...p, detail: e.target.value }))} />
                            </div>
                            {/* Phase */}
                            {canEditPhase && (
                            <div>
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("case.phase_label")}</label>
                              <select value={editActForm.phase ?? ""}
                                onChange={e => setEditActForm(p => ({ ...p, phase: e.target.value || null }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">{t("case.no_phase")}</option>
                                {resolvedPhases.map(ph => (
                                  <option key={ph.key} value={ph.key}>{ph.label}{ph.required_status ? ` (needs ${ph.required_status.replace(/_/g, " ")})` : ""}</option>
                                ))}
                              </select>
                            </div>
                            )}
                            {/* Predecessors */}
                            {canEditPredecessors && activities.filter(a => a.id !== act.id && a.activity_type !== "sub_case").length > 0 && (
                              <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("case.predecessors")}</label>
                                <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-white">
                                  {activities.filter(a => a.id !== act.id && a.activity_type !== "sub_case").map(a => (
                                    <label key={a.id} className="flex items-center gap-2 cursor-pointer text-xs">
                                      <input type="checkbox"
                                        checked={(editActForm.predecessor_ids ?? []).includes(a.id)}
                                        onChange={e => setEditActForm(p => ({
                                          ...p,
                                          predecessor_ids: e.target.checked
                                            ? [...(p.predecessor_ids ?? []), a.id]
                                            : (p.predecessor_ids ?? []).filter(id => id !== a.id),
                                        }))}
                                        className="accent-blue-600" />
                                      <span className="text-gray-500">#{a.task_no}</span>
                                      <span className="text-gray-800 truncate">{a.title}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Test Result — only for test-phase activities */}
                            {['technical_test','functional_test','user_test'].includes(editActForm.phase) && (
                              <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-3">
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t("cd.test_result")}</p>
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t("cd.outcome")}</label>
                                  <div className="flex gap-2">
                                    {[
                                      { value: null,                label: t("act.pending"),          cls: "border-gray-200 text-gray-500" },
                                      { value: "passed",            label: <><Check size={11} className="mr-1 inline" />{t("cd.passed")}</>,         cls: "border-emerald-300 text-emerald-700 bg-emerald-50" },
                                      { value: "needs_adjustment",  label: <><AlertTriangle size={11} className="mr-1 inline" />{t("cd.needs_adjustment")}</>, cls: "border-amber-300 text-amber-700 bg-amber-50" },
                                    ].map(opt => (
                                      <button key={String(opt.value)} type="button"
                                        onClick={() => setEditActForm(p => ({ ...p, test_outcome: opt.value, adjustment_notes: opt.value !== 'needs_adjustment' ? '' : p.adjustment_notes }))}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                          editActForm.test_outcome === opt.value ? opt.cls + ' ring-2 ring-offset-1 ring-current' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                                        }`}>
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {editActForm.test_outcome === 'needs_adjustment' && (
                                  <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("cd.issue_label")} <span className="text-red-400">*</span></label>
                                    <textarea value={editActForm.adjustment_notes ?? ''} rows={3}
                                      onChange={e => setEditActForm(p => ({ ...p, adjustment_notes: e.target.value }))}
                                      placeholder={t("cd.ph_correction")}
                                      className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none bg-white" />
                                  </div>
                                )}
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                                    {t("cd.req_coverage")} — {editActForm.coverage_pct ?? 100}%
                                  </label>
                                  <input type="range" min="0" max="100" step="5"
                                    value={editActForm.coverage_pct ?? 100}
                                    onChange={e => setEditActForm(p => ({ ...p, coverage_pct: Number(e.target.value) }))}
                                    className="w-full accent-blue-600" />
                                  <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                                    <span>{t("cd.not_covered")}</span>
                                    <span>{t("cd.fully_covered")}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-blue-100">
                        <button onClick={() => { if(window.confirm(act.activity_type === "sub_case" ? t("cd.confirm_remove_subcase") : t("cd.confirm_delete_act"))) deleteActivity(act.id); }}
                          className="text-xs text-red-400 hover:text-red-600">
                          {act.activity_type === "sub_case" ? t("cd.remove_link") : t("cd.delete_act")}
                        </button>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingActId(null)} className="text-sm text-gray-500 px-3 py-1.5">{t("action.cancel")}</button>
                          <button onClick={() => handleSaveEdit(act.id)} disabled={savingAct}
                            className={`px-4 py-1.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${act.activity_type === "sub_case" ? "bg-violet-600 hover:bg-violet-700" : "bg-[#1A4B8C] hover:bg-blue-900"}`}>
                            {savingAct ? t("state.saving") : t("action.save")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );

                  // ── Sub-case activity row ────────────────────────────
                  if (act.activity_type === "sub_case") {
                    const subPct   = act.sub_progress ?? 0;
                    const subHours = act.sub_hours_used ?? 0;
                    const scAdh    = activityAdherence({ ...act, progress_pct: subPct });
                    const scAdhInfo = scAdh ? ADHERENCE[scAdh] : null;
                    return (
                      <div key={act.id} className={`border rounded-xl overflow-hidden transition-colors ${selectedActIds.has(act.id) ? 'border-red-300 bg-red-50' : 'border-violet-200'}`}>
                        <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-violet-50">
                          {canBulkDeleteActs && (
                            <button onClick={e => { e.stopPropagation(); setSelectedActIds(prev => { const n = new Set(prev); n.has(act.id) ? n.delete(act.id) : n.add(act.id); return n; }); }}
                              className={`flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedActIds.has(act.id) ? 'bg-red-500 border-red-500' : 'border-gray-300 hover:border-red-400'}`}>
                              {selectedActIds.has(act.id) && <Check size={8} className="text-white" />}
                            </button>
                          )}
                          <span className="text-xs font-bold text-gray-400 w-6 flex-shrink-0 text-center">#{act.task_no}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-violet-100 text-violet-700 flex items-center gap-1">
                            <Link2 size={9} /> {t("case.badge_subcase")}
                          </span>
                          {/* Title — click to open sub-case */}
                          <div className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => { if (act.linked_case) { setSelectedSubCase(act.linked_case); setActiveTab("subcases"); } }}>
                            <div className="flex items-center gap-1">
                              <p className="text-sm font-semibold text-gray-800 truncate">{act.title}</p>
                              <ExternalLink size={11} className="text-violet-400 flex-shrink-0" />
                            </div>
                            {act.linked_case?.status && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {STATUS_LABEL_KEYS[act.linked_case.status] ? t(STATUS_LABEL_KEYS[act.linked_case.status]) : cap(fmt(act.linked_case.status))}
                              </p>
                            )}
                          </div>
                          {/* Progress (derived from linked case) */}
                          <div className="w-28 flex-shrink-0">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-violet-600 font-semibold">{subPct}%</span>
                              <span className="text-gray-400 font-mono">{subHours.toFixed(1)}h / {act.est_hours ?? 0}h</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${subPct === 100 ? "bg-emerald-500" : "bg-violet-500"}`}
                                style={{ width: `${subPct}%` }} />
                            </div>
                          </div>
                          {act.end_date_plan && (
                            <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                              {act.start_date_plan ? `${act.start_date_plan} → ` : "→ "}{act.end_date_plan}
                            </span>
                          )}
                          {scAdhInfo && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${scAdhInfo.cls}`}>
                              {scAdhInfo.label}
                            </span>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {canManage && (
                              <button
                                onClick={() => { setEditingActId(act.id); setEditActForm({ est_hours: act.est_hours, start_date_plan: act.start_date_plan ?? "", end_date_plan: act.end_date_plan ?? "" }); }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                                title={t("cd.edit_dates_tooltip")}>
                                <Pencil size={13} />
                              </button>
                            )}
                            <button onClick={() => setExpandedActId(expandedActId === act.id ? null : act.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </div>
                        </div>
                        {/* Expanded: sub-case summary */}
                        {isExpanded && (
                          <div className="border-t border-violet-100 bg-violet-50 px-4 py-3 space-y-2">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{t("label.logged_subcase")} <strong className="text-gray-700">{subHours.toFixed(1)}h</strong></span>
                              <span>{t("label.progress_colon")} <strong className="text-violet-700">{subPct}%</strong></span>
                              {act.linked_case?.status && (
                                <span>{t("label.status_colon")} <strong className="text-gray-700">{STATUS_LABEL_KEYS[act.linked_case.status] ? t(STATUS_LABEL_KEYS[act.linked_case.status]) : cap(fmt(act.linked_case.status))}</strong></span>
                              )}
                            </div>
                            <p className="text-[10px] text-violet-600">
                              {t("cd.subcase_readonly")}
                            </p>
                            {canManage && (
                              <button
                                onClick={() => { if(window.confirm(t("cd.confirm_remove_subcase"))) deleteActivity(act.id); }}
                                className="text-xs text-red-400 hover:text-red-600 mt-1">
                                {t("cd.remove_link")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── Regular task row ─────────────────────────────────
                  return (
                    <div key={act.id} className={`border rounded-xl overflow-hidden transition-colors ${selectedActIds.has(act.id) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                      {/* Main row */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50">
                        {/* Bulk-select checkbox */}
                        {canManage && (
                          <button onClick={e => { e.stopPropagation(); setSelectedActIds(prev => { const n = new Set(prev); n.has(act.id) ? n.delete(act.id) : n.add(act.id); return n; }); }}
                            className={`flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedActIds.has(act.id) ? 'bg-red-500 border-red-500' : 'border-gray-300 hover:border-red-400'}`}>
                            {selectedActIds.has(act.id) && <Check size={8} className="text-white" />}
                          </button>
                        )}
                        {/* Task # */}
                        <span className="text-xs font-bold text-gray-400 w-6 flex-shrink-0 text-center">#{act.task_no}</span>
                        {/* Status chip */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(act.status)}`}>
                          {statusLabel(act.status)}
                        </span>
                        {/* Title */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-gray-800 truncate">{act.title}</p>
                            {/* Predecessor waiting indicator */}
                            {(act.predecessor_ids ?? []).length > 0 && (() => {
                              const blocked = (act.predecessor_ids ?? []).some(pid => actEffectivePct(actById.get(pid) ?? {}) < 100);
                              return blocked ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">⏳ {t("cd.pred_waiting")}</span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0"><Check size={9} className="mr-0.5 inline" />{t("cd.pred_ready")}</span>
                              );
                            })()}
                            {/* Phase lock */}
                            {(() => {
                              const phaseDef = resolvedPhases.find(p => p.key === act.phase);
                              return phaseDef?.required_status && caseData.status !== phaseDef.required_status ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0"><Lock size={9} className="mr-0.5 inline" />{phaseDef.labelKey ? t(phaseDef.labelKey) : phaseDef.label}</span>
                              ) : null;
                            })()}
                            {/* Test outcome badge */}
                            {act.test_outcome === 'passed' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0"><Check size={9} className="mr-0.5 inline" />{t("cd.passed")}</span>
                            )}
                            {act.test_outcome === 'needs_adjustment' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0"><AlertTriangle size={9} className="mr-0.5 inline" />{t("cd.needs_adj_short")}</span>
                            )}
                          </div>
                          {act.description && <p className="text-xs text-gray-400 truncate mt-0.5">{act.description}</p>}
                          {/* Predecessor chips */}
                          {(act.predecessor_ids ?? []).length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-0.5">
                              {(act.predecessor_ids ?? []).map(pid => {
                                const pred = actById.get(pid);
                                if (!pred) return null;
                                const done = actEffectivePct(pred) === 100;
                                return (
                                  <span key={pid} className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${done ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                                    ← #{pred.task_no}
                                  </span>
                                );
                              }).filter(Boolean)}
                            </div>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="w-28 flex-shrink-0">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">{dispPct}%</span>
                            <span className="text-gray-400 font-mono">{actHours.toFixed(1)}h / {act.est_hours ?? 0}h</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${dispPct === 100 ? "bg-emerald-500" : act.status === "blocked" ? "bg-red-400" : "bg-blue-500"}`}
                              style={{ width: `${dispPct}%` }} />
                          </div>
                        </div>
                        {/* Dates */}
                        {act.end_date_plan && (
                          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                            {act.start_date_plan ? `${act.start_date_plan} → ` : "→ "}{act.end_date_plan}
                          </span>
                        )}
                        {/* Adherence badge */}
                        {adhInfo && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${adhInfo.cls}`}>
                            {adhInfo.label}
                          </span>
                        )}
                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canManage && (
                            <button onClick={() => { setEditingActId(act.id); setEditActForm({ test_outcome: null, adjustment_notes: null, coverage_pct: null, ...act }); }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                              <Pencil size={13} />
                            </button>
                          )}
                          <button onClick={() => setExpandedActId(expandedActId === act.id ? null : act.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </div>
                      {/* Expanded: time ledger + detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                          {act.detail && (
                            <p className="text-xs text-gray-600 whitespace-pre-line">{act.detail}</p>
                          )}
                          {/* Test result detail (if test phase) */}
                          {act.test_outcome && (
                            <div className={`rounded-xl p-3 space-y-1.5 text-xs ${act.test_outcome === 'passed' ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                              <p className={`font-semibold ${act.test_outcome === 'passed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {act.test_outcome === 'passed' ? <><Check size={11} className="inline mr-1" />{t("cd.test_passed")}</> : <><AlertTriangle size={11} className="inline mr-1" />{t("cd.needs_adj")}</>}
                              </p>
                              {act.adjustment_notes && <p className="text-amber-800">{act.adjustment_notes}</p>}
                              {act.coverage_pct != null && (
                                <p className="text-gray-500">{t("cd.req_coverage")}: <span className="font-semibold text-gray-700">{act.coverage_pct}%</span></p>
                              )}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                Time Logged ({actHours.toFixed(1)}h{act.est_hours ? ` / ${act.est_hours}h est.` : ''})
                              </p>
                              {stageRules.can_log_time && auth.isConsultant && logTimeActId !== act.id && (() => {
                                const phaseDef = resolvedPhases.find(p => p.key === act.phase);
                                const phaseIsLocked = phaseDef?.required_status && caseData.status !== phaseDef.required_status;
                                return phaseIsLocked ? (
                                  <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                    <Lock size={11} className="inline mr-1" />{t("cd.phase_locked").replace("{n}", phaseDef.required_status.replace(/_/g, " "))}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { setLogTimeActId(act.id); setTimeForm({ date: new Date().toISOString().slice(0,10), hours: 1, description: '', is_billable: true, activity_id: act.id }); }}
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                                    <Clock size={10} /> {t("time.log")}
                                  </button>
                                );
                              })()}
                            </div>

                            {/* Inline time-log form */}
                            {logTimeActId === act.id && (
                              <div className="bg-white border border-blue-200 rounded-xl p-3 space-y-2 mb-2">
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.date")}</label>
                                    <input type="date" value={timeForm.date}
                                      onChange={e => setTimeForm(p => ({ ...p, date: e.target.value }))}
                                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                  <div className="w-20">
                                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.hours")}</label>
                                    <input type="number" min="0.25" step="0.25" value={timeForm.hours}
                                      onChange={e => setTimeForm(p => ({ ...p, hours: e.target.value }))}
                                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.description")} *</label>
                                  <input type="text" value={timeForm.description} placeholder={t("cd.ph_work_done")}
                                    onChange={e => setTimeForm(p => ({ ...p, description: e.target.value }))}
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                </div>
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={timeForm.is_billable}
                                      onChange={e => setTimeForm(p => ({ ...p, is_billable: e.target.checked }))}
                                      className="accent-blue-600" />
                                    {t("label.billable")}
                                  </label>
                                  <div className="flex gap-2">
                                    <button onClick={() => setLogTimeActId(null)}
                                      className="px-2.5 py-1 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                                      {t("action.cancel")}
                                    </button>
                                    <button
                                      disabled={savingTime || !timeForm.hours || !timeForm.description.trim()}
                                      onClick={async () => {
                                        setSavingTime(true);
                                        try {
                                          await addTimeEntry({ ...timeForm, case_id: caseData.id, hours: Number(timeForm.hours) });
                                          if (act.status === 'pending') await updateActivity(act.id, { status: 'in_progress' });
                                          setLogTimeActId(null);
                                        } catch (e) { alert(e.message); }
                                        setSavingTime(false);
                                      }}
                                      className="px-2.5 py-1 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                                      {savingTime ? t("state.saving") : t("action.save")}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {actEntries.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">{t("cd.no_act_time")}</p>
                            ) : (
                              <div className="space-y-1">
                                {actEntries.map(e => (
                                  <div key={e.id} className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-400 w-20 flex-shrink-0">{fmtDate(e.date)}</span>
                                    <span className="font-medium text-gray-700">{e.consultant?.full_name ?? "—"}</span>
                                    <span className="text-blue-700 font-semibold">{e.hours}h</span>
                                    {e.is_billable && <span className="text-green-600 text-[10px] font-bold">{t("label.billable")}</span>}
                                    <span className="text-gray-500 truncate flex-1">{e.description}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
              );
            })}
              </div>
            )}
            </>
            )}

            {/* Add / Import buttons */}
            {canManage && !showActForm && !showImportAct && (
              <div className="flex gap-2">
                <button onClick={() => setShowActForm(true)}
                  className="flex-1 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
                  <ListChecks size={14} /> {t("case.add_activity")}
                </button>
                <button onClick={() => { setShowImportAct(true); setExtractedActs([]); setImportDocId(null); setImportDocFile(null); }}
                  className="flex-1 py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-400 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center gap-2">
                  <Upload size={14} /> {t("case.import_from_doc")}
                </button>
              </div>
            )}

            {/* Import from document panel */}
            {canManage && showImportAct && (() => {
              const resetImport = () => { setShowImportAct(false); setExtractedActs([]); setImportDocId(null); setImportDocFile(null); setImportResult(null); setImportStep('select'); };
              return (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">{t("case.import_title")}</p>
                    <button onClick={resetImport} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                  </div>

                  {/* Step: select document */}
                  {importStep === 'select' && !extractingActs && (
                    <div className="space-y-3">
                      {documents.length > 0 && (
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t("case.select_doc")}</label>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {documents.map(doc => (
                              <label key={doc.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${importDocId === doc.id ? 'border-violet-400 bg-violet-100' : 'border-gray-200 bg-white hover:border-violet-200'}`}>
                                <input type="radio" name="importDoc" className="accent-violet-600"
                                  checked={importDocId === doc.id}
                                  onChange={() => { setImportDocId(doc.id); setImportDocFile(null); }} />
                                <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 truncate">{doc.file_name}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">{doc.file_size_kb}kb</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {documents.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <div className="flex-1 border-t border-gray-200" />{t("case.upload_new")}<div className="flex-1 border-t border-gray-200" />
                        </div>
                      )}
                      <div>
                        {!importDocFile ? (
                          <button onClick={() => importActFileRef.current?.click()}
                            className="w-full py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-500 hover:border-violet-400 hover:bg-violet-50 transition-colors flex items-center justify-center gap-2">
                            <Upload size={14} /> {t("case.upload_types")}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-violet-300 rounded-xl">
                            <Paperclip size={13} className="text-violet-500 flex-shrink-0" />
                            <span className="text-sm text-gray-700 truncate flex-1">{importDocFile.name}</span>
                            <button onClick={() => setImportDocFile(null)} className="text-gray-400 hover:text-red-500 text-xs"><X size={13} /></button>
                          </div>
                        )}
                        <input type="file" ref={importActFileRef} className="hidden"
                          accept=".pdf,.txt,.md,.csv"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { setImportDocFile(f); setImportDocId(null); } e.target.value = ''; }} />
                      </div>
                      <button onClick={extractActivitiesFromDoc}
                        disabled={!importDocId && !importDocFile}
                        className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-2">
                        <Sparkles size={14} /> {t("case.extract_ai")}
                      </button>
                    </div>
                  )}

                  {/* Step: extracting */}
                  {extractingActs && (
                    <div className="flex items-center justify-center py-8 gap-2 text-violet-500">
                      <Spinner /><span className="text-sm">{t("case.extracting")}</span>
                    </div>
                  )}

                  {/* Step: preview extracted list */}
                  {importStep === 'preview' && extractedActs.length > 0 && !extractingActs && !importingActs && !importResult && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-700">
                          {t(extractedActs.length === 1 ? "case.found_act_one" : "case.found_acts_many").replace("{n}", extractedActs.length).replace("{selected}", extractedActs.filter(a => a._selected).length)}
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setExtractedActs(p => p.map(a => ({ ...a, _selected: true })))} className="text-xs text-violet-600 underline">{t("case.import_all")}</button>
                          <button onClick={() => setExtractedActs(p => p.map(a => ({ ...a, _selected: false })))} className="text-xs text-gray-400 underline">{t("case.import_none")}</button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {extractedActs.map((a, i) => (
                          <label key={a._id} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${a._selected ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white opacity-60'}`}>
                            <input type="checkbox" className="accent-violet-600 mt-0.5 flex-shrink-0"
                              checked={a._selected}
                              onChange={e => setExtractedActs(p => p.map((x, j) => j === i ? { ...x, _selected: e.target.checked } : x))} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{a.title}</p>
                              {a.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{a.description}</p>}
                              <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                                {a.est_hours ? <span>{a.est_hours}h</span> : null}
                                {a.start_date_plan && <span>{t("label.from_date")} {a.start_date_plan}</span>}
                                {a.end_date_plan && <span>{t("label.to")} {a.end_date_plan}</span>}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setExtractedActs([]); setImportStep('select'); }}
                          className="px-4 py-2 text-sm border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50">
                          {t("action.back")}
                        </button>
                        <button onClick={importSelectedActivities}
                          disabled={extractedActs.filter(a => a._selected).length === 0}
                          className="flex-1 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-2">
                          {(n => t(n === 1 ? "action.import_one" : "action.import_many").replace("{n}", n))(extractedActs.filter(a => a._selected).length)}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Importing spinner */}
                  {importingActs && (
                    <div className="flex items-center justify-center py-8 gap-2 text-violet-500">
                      <Spinner /><span className="text-sm">{t("case.adding_activities")}</span>
                    </div>
                  )}

                  {/* Step: result */}
                  {importStep === 'done' && importResult && !importingActs && (
                    <div className="space-y-3">
                      {importResult.error ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-sm font-semibold text-red-700 mb-1">{t("case.import_failed")}</p>
                          <p className="text-xs text-red-600 font-mono break-all">{importResult.error}</p>
                        </div>
                      ) : (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                          <p className="text-sm font-semibold text-green-700">
                            <><Check size={13} className="mr-1 inline" />{t(importResult.count === 1 ? "case.import_act_added" : "case.import_acts_added").replace("{n}", importResult.count)}</>
                          </p>
                          <p className="text-xs text-green-600 mt-1">{t("case.import_scroll_hint")}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {importResult?.error && (
                          <button onClick={() => { setImportResult(null); setImportStep('preview'); }}
                            className="flex-1 py-2 text-sm border border-violet-200 text-violet-600 rounded-xl hover:bg-violet-50">
                            {t("case.try_again")}
                          </button>
                        )}
                        <button onClick={resetImport}
                          className="flex-1 py-2 text-sm bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200">
                          {importResult?.error ? t("action.cancel") : t("action.close")}
                        </button>
                        {!importResult?.error && (
                          <button onClick={() => { setImportResult(null); setExtractedActs([]); setImportStep('select'); setImportDocId(null); setImportDocFile(null); }}
                            className="flex-1 py-2 text-sm bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700">
                            {t("case.import_more")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

                    {/* Time Log Tab — uses time_logs table via TimeLogPanel */}
                    {tab.id === "time" && (
        <TimeLogPanel caseId={caseData.id} caseTitle={caseData.title} auth={auth} />
      )}

                    {/* Lifecycle Tab */}
                    {/* Spec Tab */}
                    {tab.id === "spec" && (
        <SpecificationTab caseData={caseData} auth={auth} documents={documents} addDocument={addDocument} deleteDocument={deleteDocument} refetchDocuments={refetchDocuments} onUpdate={onUpdate} />
      )}

                    {tab.id === "implementation" && (auth.isAdmin || auth.isManager || auth.isConsultant) && (
        <SapImplementationTab caseData={caseData} auth={auth} activities={activities} updateActivity={updateActivity} />
      )}

                    {tab.id === "lifecycle" && (auth.isAdmin || auth.isManager || auth.isClient) && (() => {
        if (lcMode === null) return <div className="flex justify-center py-10"><Spinner /></div>;
        const caseOverrideAllowed = clientLifecycle?.allow_case_override ?? true;
        const tmplList = caseLcTemplates.length ? caseLcTemplates : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }));
        const inheritedPreset = caseData.case_lifecycle?.preset ?? parentCaseLifecycle?.preset ?? projectLifecycle?.preset ?? clientLifecycle?.preset ?? "standard";
        const previewStages = getCaseTmplStages(lcMode);
        const previewActive = previewStages.filter(s => !s.is_terminal);
        const previewTerminal = previewStages.filter(s => s.is_terminal);
        const inheritedStages = getCaseTmplStages(inheritedPreset);
        return (
          <div className="space-y-5">
            <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{t("case.lifecycle_source")}</span>
              {caseData.case_lifecycle
                ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">{t("case.lc_this_case")}</span>
                : parentCaseLifecycle
                ? <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full font-semibold">{t("case.lc_parent")}</span>
                : projectLifecycle
                ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">{t("case.lc_project")}</span>
                : clientLifecycle
                ? <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold">{t("case.lc_company")}</span>
                : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold">{t("case.lc_default")}</span>}
              {!caseOverrideAllowed && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold"><Lock size={10} className="mr-0.5 inline" />{t("case.override_locked")}</span>
              )}
            </div>

            {!caseOverrideAllowed ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                {t("case.lifecycle_lock_msg")}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {tmplList.map(tmpl => {
                    const isSelected = lcMode === tmpl.key;
                    const active = tmpl.stages.filter(s => !s.is_terminal);
                    const isBuiltin = ["short","standard","full"].includes(tmpl.key);
                    return (
                      <button key={tmpl.key} onClick={() => setLcMode(tmpl.key)}
                        className={`text-left p-3 rounded-xl border-2 transition-all ${
                          isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-gray-900">{isBuiltin ? t(`lc.preset_${tmpl.key}_name`) : tmpl.name}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{isBuiltin ? t(`lc.preset_${tmpl.key}_subtitle`) : (tmpl.subtitle ?? "")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {active.map((s, i) => (
                            <span key={s.key} className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: s.color + "22", color: s.color }}>{s.label}</span>
                              {i < active.length - 1 && <span className="text-gray-300 text-[10px]">›</span>}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {lcMode !== (caseData.case_lifecycle?.preset ?? parentCaseLifecycle?.preset ?? projectLifecycle?.preset ?? clientLifecycle?.preset ?? "standard") && (
                  <LifecycleFlowDiagram stages={previewStages} currentStatus={null} />
                )}

                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <button onClick={handleSaveCaseLc} disabled={savingLc}
                    className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                    {savingLc ? t("state.saving") : t("case.save_lifecycle")}
                  </button>
                </div>
              </>
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
              {tabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;
                const st = tabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'var(--t-pill-act-border)': st==="complete"?'var(--t-done-border)':'var(--t-pill-inactive-bdr)'}`, background:isActive?'var(--t-pill-act-bg)': st==="complete"?'var(--t-done-bg)':'var(--t-pill-inactive-bg)', color:isActive?'var(--t-pill-act-color)': st==="complete"?'var(--t-done-color)':'var(--t-text2)', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>
                    }
                    <span>{tab.label}</span>
                    {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)': st==="complete"?'var(--t-done-bg)':'var(--t-badge-inact-bg)',color:isActive?'rgba(255,255,255,.7)': st==="complete"?'var(--t-done-color)':'var(--t-badge-inact-color)'}}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {showEditWizard && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateCaseWizard
            auth={auth}
            initialData={caseData}
            onSave={async (payload) => { await onUpdate(caseData.id, payload); }}
            onComplete={() => setShowEditWizard(false)}
            onCancel={() => setShowEditWizard(false)}
          />
        </div>
      )}
      {showDevPlanModal && (
        <GenerationProfileModal
          title={t("gen.modal_title")}
          outputMode={devPlanOutputMode}
          onOutputModeChange={setDevPlanOutputMode}
          onConfirm={(profileKey, resolvedProfile, om) => { setShowDevPlanModal(false); generateDevelopmentPlan(resolvedProfile, om ?? devPlanOutputMode); }}
          onClose={() => setShowDevPlanModal(false)}
        />
      )}
      {ratingModal && (
        <RatingModal
          caseId={ratingModal.caseId}
          caseTitle={ratingModal.caseTitle}
          rateeId={ratingModal.rateeId}
          rateeName={ratingModal.rateeName}
          rateeRole={ratingModal.rateeRole}
          raterRole={ratingModal.raterRole}
          onClose={() => setRatingModal(null)}
          onSubmitted={() => setRatingModal(null)}
        />
      )}
      {clientRatingModal && (
        <ClientRatingModal
          isOpen={true}
          caseId={clientRatingModal.caseId}
          caseTitle={clientRatingModal.caseTitle}
          clientId={clientRatingModal.clientId}
          clientName={clientRatingModal.clientName}
          onClose={() => setClientRatingModal(null)}
        />
      )}

      {/* Transition Gate Modal */}
      {gateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: (gateModal.toColor ?? "#6366f1") + "20" }}>
                <Lock size={16} style={{ color: gateModal.toColor ?? "#6366f1" }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Moving to <span style={{ color: gateModal.toColor ?? "#6366f1" }}>{gateModal.toLabel}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {gateModal.blockers.length > 0
                    ? "Some requirements must be completed before this transition."
                    : "Some items are recommended before this transition."}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-80 overflow-y-auto">
              {/* Blockers */}
              {gateModal.blockers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-2">
                    Required — must complete before proceeding
                  </p>
                  <div className="space-y-2">
                    {gateModal.blockers.map(b => (
                      <div key={b.key} className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl">
                        <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-red-800">{b.label}</p>
                          <p className="text-[10px] text-red-600 mt-0.5">{b.fixHint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {gateModal.warnings.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide mb-2">
                    Recommended — you can still proceed
                  </p>
                  <div className="space-y-2">
                    {gateModal.warnings.map(w => (
                      <div key={w.key} className="flex items-start gap-2.5 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                        <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-orange-800">{w.label}</p>
                          <p className="text-[10px] text-orange-600 mt-0.5">{w.fixHint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setGateModal(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              {gateModal.blockers.length === 0 && (
                <button
                  onClick={() => {
                    const { caseId, toStatus, extra } = gateModal;
                    setGateModal(null);
                    onStatusChange(caseId, toStatus, extra);
                  }}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors"
                  style={{ backgroundColor: gateModal.toColor ?? "#6366f1" }}>
                  Proceed anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showSaveAsTemplate && (
        <SaveCaseAsTemplateModal caseData={caseData} onClose={() => setShowSaveAsTemplate(false)} />
      )}
    </div>
  );
}

export { CaseDetail };
