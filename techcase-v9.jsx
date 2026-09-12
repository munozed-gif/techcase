// ============================================================
// TECHCASE v9 — Invoices, Kanban, Documents & Time Tracking
// ============================================================
// New in v9 (over v8):
//   - Invoice & Billing Management
//   - Case Document Attachments (Supabase Storage bucket: case-documents)
//   - Time Entries with manager approval workflow
//   - Kanban Board View (visual case pipeline)
//   - Enhanced Reports (hours, revenue, conversion)
//
// New DB tables needed:
//   invoices (id, case_id, client_id, consultant_id, invoice_number,
//             amount, status[draft/sent/paid/overdue], issue_date,
//             due_date, notes, created_at)
//   time_entries (id, case_id, consultant_id, date, hours,
//                 description, is_billable, is_approved,
//                 approved_by, created_at)
//   case_documents (id, case_id, uploaded_by, file_name, file_url,
//                   file_type, file_size_kb, notes, created_at)
// ============================================================


import { useState, useEffect, useCallback, useRef, useMemo, Fragment, createContext, useContext, Component } from "react";
import DOMPurify from "dompurify";
import {
  LayoutDashboard, FolderOpen, LayoutGrid, Target, Receipt, Clock,
  Users, UserCheck, UserCog, Settings, Database, Handshake, BarChart2, User,
  Building2, Bell, FileText, DollarSign, Flag, CheckCircle2, PenLine,
  Briefcase, Globe, Rocket, Zap, Phone, SlidersHorizontal, Check,
  Activity, Inbox, ClipboardList,
  Mail, TrendingUp, Link, Plane, Heart, Star, Trash2, Paperclip,
  FileImage, Trophy, Layers,
  MapPin, UsersRound, GraduationCap, MessageSquare, X,
  Play, Pause, PauseCircle, RotateCcw, Archive, Search,
  BadgeCheck, XCircle,
  Wand2, Download, Sparkles, Loader2,
  ListChecks, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle, CircleSlash,
  GripVertical, Pencil, Timer, Link2, ExternalLink, Upload, Code2, Lock, Camera,
  Plus, Tag, RefreshCw, Shield,
  LayoutTemplate, Copy,
  Bookmark, BookmarkCheck, Send, Crosshair,
  FileEdit, AlertCircle,
  Calendar, CalendarDays, CalendarRange, FolderKanban,
  CreditCard, Eye, UserPlus, FileCode2, Palette,
} from "lucide-react";
import { supabase } from "./src/lib/supabase.js";
import { ROLE_PERMISSIONS_DEFAULTS, GENERATION_CONTEXT_DEFAULTS, GENERATION_PROFILE_DEFAULTS, GEN_DOCS } from "./src/lib/constants.js";
import { TRANSLATIONS } from "./src/i18n/translations.js";
import { LanguageContext, LanguageProvider, useT } from "./src/i18n/index.jsx";

// ============================================================
// HOOKS
// ============================================================

import {
  useMilestones, useCaseComments, useSlaConfig, useDbConnections,
  useProjectDbConnections, useSubCases, useClientTeamMembers, useInvoices,
  useProjects, useTimeEntries, useCaseActivities, useProjectTemplates, useCaseDocuments,
} from "./src/hooks/useCoreHooks.js";


import { useAuth } from "./src/hooks/useAuth.jsx";


import { useCases, useApplications, useRatings } from "./src/hooks/useCaseHooks.js";

// ============================================================
// APPLICANT RANKING ENGINE
// ============================================================
import { computeApplicantScore, useApplicantRanking } from "./src/hooks/useRankingHooks.js";


import { CaseFeedbackModal, RANKING_CRITERIA, ApplicantRankingSection } from "./src/components/RankingComponents.jsx";


import { useFavorites, useFollowedClients, useConsultantProfile } from "./src/hooks/useProfileHooks.js";


import { notify, notifyManagers, notifyCaseParticipants, callClaude, logEvent } from "./src/lib/utils.js";


// ─────────────────────────────────────────────────────────────

// ── Case Specification hook ──────────────────────────────────
import { useCaseSpecification, useUnreadCount, useNotifications, useLeaderboard } from "./src/hooks/useNotificationHooks.js";


import {
  ROLE_COLORS, DEFAULT_PLAN_CONFIG, PLAN_BADGE, ROLE_TO_PLAN_TYPE,
  PROJECT_TYPES, SAP_AREAS, INDUSTRY_AREAS, STATUS_COLORS,
  CASE_CARD_COLORS, PRIORITY_COLORS, STATUS_CARD_ICONS,
  DEFAULT_ACTIVITY_PHASES, TECHCASE_LOGO_URI, APP_STATUS_COLORS,
  LIFECYCLE_PRESETS, getLifecycleStages, DEFAULT_PLAN_PRICES,
} from "./src/lib/businessConstants.js";


import { useLifecycleTemplates, runStartDateMonitor, useStartDateMonitor, runDueDateMonitor } from "./src/hooks/useLifecycleHooks.js";

import { SLA_PRIORITIES, SLA_DEFAULT_TYPES, makeDefaultMatrix, SLA_UNIT_LABELS, SlaMatrixEditor, INVOICE_STATUS_COLORS, fmt, cap, STATUS_LABEL_KEYS, AVAIL_LABEL_KEYS, PRIORITY_LABEL_KEYS, INV_STATUS_LABEL_KEYS, WORK_MODE_LABEL_KEYS, EXPERTISE_LABEL_KEYS, ROLE_LABEL_KEYS, SLA_TIER_LABEL_KEYS, fmtDate, timeAgo } from "./src/lib/uiUtils.jsx";


import { useActivityFeed, useFeedPrefs, useGlobalActivity } from "./src/hooks/useActivityHooks.js";


import { FEED_TYPE_STYLES, FeedCard, FeedPreferencesModal, stars } from "./src/components/FeedComponents.jsx";


// ============================================================
// UI PRIMITIVES
// ============================================================
import {
  Badge, Spinner, PendingApprovalScreen, ConsultantProjectsHierarchy,
  RESUME_SECTIONS, ResumeImporter, ProfileOnboardingScreen,
  ROLE_LABELS, ProfileCompleteWizard,
  TrustBadge, TierProgressBar, VouchingPanel, PlanUsageCard,
} from "./src/components/ProfileComponents.jsx";


import { ConsultantProfileView } from "./src/components/ConsultantProfileView.jsx";


import { NotificationBell } from "./src/components/NotificationBell.jsx";


import { EmptyState, Modal, Input, Textarea, Select } from "./src/components/ui.jsx";


// ============================================================
// AUTH SCREEN
// ============================================================
import { AuthScreen } from "./src/views/AuthScreen.jsx";


// ============================================================
// SIDEBAR NAV
// ============================================================
import { Sidebar } from "./src/components/Sidebar.jsx";


// ============================================================
// DASHBOARD
// ============================================================
import { Dashboard } from "./src/views/Dashboard.jsx";


import {
  BUILT_IN_PROJECT_TEMPLATES, SAP_TEMPLATES,
  CaseTemplatePickerModal, SaveCaseAsTemplateModal,
  CaseTemplatesView, ProjectTemplatesSection,
  ApplyTemplateModal, SaveTemplateModal,
} from "./src/views/CaseTemplates.jsx";


// ============================================================
// CREATE CASE WIZARD
// ============================================================

import { daysFromNow, SLA_PRESETS, EXPRESS_STEP_IDS, CatalogMultiSelect, CreateCaseWizard } from "./src/components/CreateCaseWizard.jsx";


// ============================================================
// APPLY WIZARD
// ============================================================

import { ApplyWizard } from "./src/views/ApplyWizard.jsx";


// ============================================================
// PROJECTS FEATURE
// ============================================================

import {
  PROJECT_STATUS_COLORS, PROJECT_LIFECYCLE_STAGES, PROJECT_NEXT_META,
  AVATAR_PALETTE, UserAvatar, PersonAvatar, ProjectAvatar,
  CreateProjectWizard, ProjectConnectionsTab, ProjectDetail, ProjectsView,
} from "./src/views/Projects.jsx";


// ============================================================
// CASES VIEW
// ============================================================
import { CasesView } from "./src/views/CasesView.jsx";


import {
  ProjectFieldEditor,
  STAGE_ICON_MAP, getStageIcon,
  CaseLifecycleTrack, LifecycleFlowDiagram,
  renderMarkdown, buildContextString,
  buildSectionConstraint, buildGenSuffix,
  GenerationProfileModal, openHtmlInNewTab,
  SpecificationTab,
} from "./src/components/CaseSubPanels.jsx";


// ============================================================
// TIME LOG PANEL  (time_logs table — simple per-case log)
// ============================================================
import { TimeLogPanel } from "./src/components/TimeLogPanel.jsx";


// ============================================================
// CASE FILES PANEL  (case_files table + case-files storage bucket)
// ============================================================
import { CF_ALLOWED_EXTS, CF_MAX_BYTES, cfFileIcon, cfFmtSize, CaseFilesPanel } from "./src/components/CaseFilesPanel.jsx";


// ============================================================
// INVOICE MODAL — print-to-PDF invoice generation
// ============================================================
import { InvoiceModal } from "./src/components/InvoiceModal.jsx";


import { InviteConsultantDrawer } from "./src/components/InviteConsultantDrawer.jsx";


import { CaseDetail } from "./src/views/CaseDetail.jsx";


// ============================================================
// SHORTLIST HOOK (localStorage-persisted)
// ============================================================
function useConsultantShortlist() {
  const [shortlist, setShortlist] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('consultant_shortlist') || '[]')); }
    catch { return new Set(); }
  });

  function toggle(id) {
    setShortlist(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem('consultant_shortlist', JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  return { shortlist, toggle, isShortlisted: id => shortlist.has(id) };
}

// ============================================================
// CONSULTANT PROFILE PANEL (drawer used inside Arena)
// ============================================================
function ConsultantProfilePanel({ consultantId, initialRole, onClose, onAddToCompare, inCompare, auth, isShortlisted, onToggleShortlist, openCases, onOpenClientProfile }) {
  const { t } = useT();
  const { profile, availability, loading } = useConsultantProfile(consultantId);
  const { ratings, avgRating } = useRatings(consultantId);
  const [userName, setUserName]         = useState('');
  const [avatarUrl, setAvatarUrl]       = useState(null);
  const [userEmail, setUserEmail]       = useState('');
  const [userRole, setUserRole]         = useState(initialRole ?? '');
  const [userStatus, setUserStatus]     = useState('');
  const [panelView, setPanelView]       = useState('card'); // 'card' | 'profile'
  const [resetSent, setResetSent]       = useState(false);
  const [resetting, setResetting]       = useState(false);

  useEffect(() => {
    if (!consultantId) return;
    setPanelView('card');
    supabase.from('users').select('full_name, avatar_url, email, role, verification_status').eq('id', consultantId).maybeSingle()
      .then(({ data }) => {
        setUserName(data?.full_name ?? '');
        setAvatarUrl(data?.avatar_url ?? null);
        setUserEmail(data?.email ?? '');
        setUserRole(data?.role ?? '');
        setUserStatus(data?.verification_status ?? '');
      });
  }, [consultantId]);

  const winRate = ratings.length > 0
    ? Math.round((ratings.filter(r => r.score >= 4).length / ratings.length) * 100)
    : null;

  const [assignCaseId, setAssignCaseId] = useState('');
  const [assigning, setAssigning]       = useState(false);
  const [assignDone, setAssignDone]     = useState(false);
  const [panelTab, setPanelTab]         = useState('profile');
  const panelCarouselRef = useRef(null);
  const panelCarouselScrolling = useRef(false);
  const [panelMountedSlides, setPanelMountedSlides] = useState(() => new Set(["profile"]));
  const [panelManualCompletions, setPanelManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_panelmc_panel`) ?? "{}"); } catch { return {}; }
  });
  function setPanelManualComplete(tabId, done) {
    setPanelManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_panelmc_panel`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const canAssign = auth && (auth.isAdmin || auth.isManager || auth.isHeadhunter);
  const canAdmin  = auth && (auth.isAdmin || auth.isManager);
  const planCfg = usePlanConfig();
  const panelVisCfg = useVisibilitySettings();
  const roleType = ROLE_TO_PLAN_TYPE[userRole] ?? null;
  const userPlan = roleType ? planCfg.getUserPlan(consultantId) : null;
  const [changingPlan, setChangingPlan] = useState(false);
  const CLIENT_ROLES = ['client', 'key_user', 'final_user', 'internal_consultant', 'project_manager'];
  const isConsultantRole = userRole === 'consultant';
  const isHeadhunterRole = userRole === 'headhunter';
  const isClientRole     = CLIENT_ROLES.includes(userRole);
  const hasProfile       = isConsultantRole || isHeadhunterRole || isClientRole;

  const [clientProfile, setClientProfile] = useState(null);
  const [clientCaseStats, setClientCaseStats] = useState(null);
  const [clientTeamMembers, setClientTeamMembers] = useState([]);

  useEffect(() => {
    if (!isClientRole || !consultantId) {
      setClientProfile(null); setClientCaseStats(null); setClientTeamMembers([]);
      return;
    }
    setClientProfile(null); setClientCaseStats(null); setClientTeamMembers([]);
    (async () => {
      let companyId = null;
      if (userRole === 'client') {
        const { data } = await supabase.from('client_profiles')
          .select('id, company_name, industry, website, description, created_at')
          .eq('id', consultantId).maybeSingle();
        setClientProfile(data ? { type: 'client', company: data } : null);
        companyId = consultantId;
      } else if (userEmail) {
        const { data: tm } = await supabase.from('client_team_members')
          .select('role_title, system_role, phone, client_id, is_primary, full_name')
          .eq('email', userEmail).maybeSingle();
        if (tm?.client_id) {
          const { data: co } = await supabase.from('client_profiles')
            .select('id, company_name, industry, website, description, created_at').eq('id', tm.client_id).maybeSingle();
          setClientProfile({ type: 'team', member: tm, company: co });
          companyId = tm.client_id;
        }
      }
      if (companyId) {
        const [{ data: cases }, { data: members }] = await Promise.all([
          supabase.from('cases').select('id, status').eq('client_id', companyId),
          supabase.from('client_team_members').select('full_name, email, role_title, system_role, phone, is_primary').eq('client_id', companyId),
        ]);
        if (cases) {
          const total = cases.length;
          const open  = cases.filter(c => !['closed','completed','cancelled'].includes(c.status)).length;
          const closed = total - open;
          setClientCaseStats({ total, open, closed });
        }
        setClientTeamMembers(members ?? []);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientRole, userRole, consultantId, userEmail]);

  const PANEL_ROLE_COLORS = {
    consultant:          'bg-blue-100 text-blue-700',
    client:              'bg-green-100 text-green-700',
    headhunter:          'bg-purple-100 text-purple-700',
    manager:             'bg-orange-100 text-orange-700',
    key_user:            'bg-amber-100 text-amber-700',
    final_user:          'bg-teal-100 text-teal-700',
    internal_consultant: 'bg-indigo-100 text-indigo-700',
    project_manager:     'bg-rose-100 text-rose-700',
  };

  const STATUS_BADGE = {
    approved: 'bg-green-100 text-green-700',
    pending:  'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
  };

  async function handleResetPassword() {
    if (!userEmail) return;
    setResetting(true);
    await supabase.auth.resetPasswordForEmail(userEmail);
    setResetting(false);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  }

  async function handleAssign() {
    if (!assignCaseId || !consultantId) return;
    setAssigning(true);
    try {
      await supabase.from('case_assignments').upsert({
        case_id: assignCaseId, consultant_id: consultantId, time_commitment: 100,
      }, { onConflict: 'case_id,consultant_id' });
      setAssignDone(true);
      setTimeout(() => setAssignDone(false), 3000);
    } catch(e) { alert(e.message); }
    finally { setAssigning(false); }
  }

  const panelTabs = [
    { id: 'profile', label: 'Profile', icon: User,  count: null },
    { id: 'ratings', label: 'Ratings', icon: Star,  count: ratings.length > 0 ? ratings.length : null },
  ];

  const panelTabStatus = (() => {
    const r = {};
    for (const tab of panelTabs) {
      if (panelManualCompletions[tab.id] !== undefined) {
        r[tab.id] = panelManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  useEffect(() => {
    setPanelMountedSlides(prev => { const s = new Set(prev); s.add(panelTab); return s; });
    const el = panelCarouselRef.current;
    if (!el) return;
    const idx = panelTabs.findIndex(t => t.id === panelTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    panelCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { panelCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [panelTab]);

  return (
    <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          {panelView === 'profile' && (
            <button onClick={() => setPanelView('card')} className="text-gray-400 hover:text-gray-700 transition-colors mr-1">
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-bold text-gray-900 text-base">
            {panelView === 'card' ? 'User' : 'Profile'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onToggleShortlist && (
            <button onClick={onToggleShortlist}
              title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className={`transition-colors ${isShortlisted ? "text-amber-500 hover:text-amber-600" : "text-gray-400 hover:text-amber-400"}`}>
              {isShortlisted ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
          )}
          {panelView === 'profile' && onAddToCompare && (
            <button onClick={onAddToCompare}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                inCompare ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"}`}>
              {inCompare ? "✓ In Compare" : "+ Compare"}
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── CARD VIEW ── */}
      {panelView === 'card' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <PersonAvatar name={userName} avatarUrl={avatarUrl} size={64} />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-lg leading-tight">{userName || '—'}</h3>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {userRole && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PANEL_ROLE_COLORS[userRole] ?? 'bg-gray-100 text-gray-500'}`}>
                    {userRole.replace(/_/g, ' ')}
                  </span>
                )}
                {userStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[userStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                    {userStatus}
                  </span>
                )}
              </div>
              {userEmail && <p className="text-xs text-gray-400 mt-1">{userEmail}</p>}
            </div>
          </div>

          {canAdmin && userPlan && roleType && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 font-medium">Plan:</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${PLAN_BADGE[userPlan] ?? PLAN_BADGE.free}`}>{(planCfg.config[roleType]?.[userPlan] ?? DEFAULT_PLAN_CONFIG[roleType]?.[userPlan])?.label ?? userPlan}</span>
              <select value={userPlan}
                onChange={async e => {
                  setChangingPlan(true);
                  await planCfg.setUserPlan(consultantId, e.target.value, roleType);
                  setChangingPlan(false);
                }}
                disabled={changingPlan}
                className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {Object.keys(planCfg.config[roleType] ?? DEFAULT_PLAN_CONFIG[roleType] ?? {}).map(pk => (
                  <option key={pk} value={pk}>{(planCfg.config[roleType]?.[pk] ?? DEFAULT_PLAN_CONFIG[roleType]?.[pk])?.label ?? pk}</option>
                ))}
              </select>
            </div>
          )}

          {/* Stats mini row */}
          {(profile?.years_experience != null || avgRating != null) && (
            <div className="flex gap-3">
              {profile?.years_experience != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900">{profile.years_experience}<span className="text-xs font-normal text-gray-400">y</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">Experience</div>
                </div>
              )}
              {avgRating != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900">{avgRating} <span className="text-yellow-400 text-sm">★</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">{ratings.length} rating{ratings.length !== 1 ? 's' : ''}</div>
                </div>
              )}
              {profile?.hourly_rate != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900 text-sm">${profile.hourly_rate}<span className="text-[10px] font-normal text-gray-400">/h</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">Rate</div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {hasProfile && (
              <button onClick={() => setPanelView('profile')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                <User size={14} /> View Profile
              </button>
            )}
            {canAdmin && userEmail && (
              <button onClick={handleResetPassword} disabled={resetting || resetSent}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                  resetSent
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
                {resetSent ? <><CheckCircle2 size={14} /> Reset email sent</> : resetting ? <>Sending…</> : <><Lock size={14} /> Reset Password</>}
              </button>
            )}
            {hasProfile && canAssign && openCases?.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Send size={12} />Assign to Case
                </p>
                <select value={assignCaseId} onChange={e => setAssignCaseId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select a case…</option>
                  {openCases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <button disabled={!assignCaseId || assigning} onClick={handleAssign}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors">
                  {assigning ? "Assigning…" : assignDone ? "✓ Assigned!" : "Assign Consultant"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE VIEW ── */}
      {panelView === 'profile' && isClientRole && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {clientProfile?.company ? (
            <>
              {/* Person avatar */}
              <div className="flex items-center gap-3">
                <PersonAvatar name={userName} avatarUrl={avatarUrl} size={56} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-base leading-tight">{userName}</h3>
                  {userEmail && <p className="text-xs text-gray-400 truncate">{userEmail}</p>}
                </div>
              </div>

              {/* Company header */}
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-gray-800 text-sm leading-tight">{clientProfile.company.company_name || clientProfile.company.name}</h4>
                  {clientProfile.company.industry && (
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{clientProfile.company.industry}</p>
                  )}
                  {clientProfile.company.created_at && (
                    <p className="text-xs text-gray-400 mt-0.5">Member since {new Date(clientProfile.company.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                  )}
                </div>
              </div>

              {/* This user's role in the company (team members only) */}
              {clientProfile.type === 'team' && clientProfile.member && (
                <div className="flex items-center gap-2 flex-wrap">
                  {clientProfile.member.role_title && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">{clientProfile.member.role_title}</span>
                  )}
                  {clientProfile.member.system_role && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium capitalize">{clientProfile.member.system_role.replace(/_/g,' ')}</span>
                  )}
                  {clientProfile.member.is_primary && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Primary contact</span>
                  )}
                </div>
              )}

              {/* Description */}
              {clientProfile.company.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{clientProfile.company.description}</p>
              )}

              {/* Contact info */}
              <div className="space-y-2">
                {clientProfile.type === 'team' && clientProfile.member?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={13} className="text-gray-400 flex-shrink-0" />{clientProfile.member.phone}
                  </div>
                )}
                {clientProfile.company.website && (
                  <a href={clientProfile.company.website} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <ExternalLink size={13} />{clientProfile.company.website}
                  </a>
                )}
              </div>

              {/* Case stats */}
              {clientCaseStats && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cases</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total',  value: clientCaseStats.total,  color: 'bg-gray-50 border-gray-200 text-gray-700' },
                      { label: 'Open',   value: clientCaseStats.open,   color: 'bg-blue-50 border-blue-100 text-blue-700' },
                      { label: 'Closed', value: clientCaseStats.closed, color: 'bg-green-50 border-green-100 text-green-700' },
                    ].map(s => (
                      <div key={s.label} className={`border rounded-xl p-3 text-center ${s.color}`}>
                        <p className="text-xl font-bold leading-none">{s.value}</p>
                        <p className="text-xs mt-1 opacity-70">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team members */}
              {clientTeamMembers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Team ({clientTeamMembers.length})</p>
                  <div className="space-y-2">
                    {clientTeamMembers.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <PersonAvatar name={m.full_name || m.email} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{m.full_name || m.email}</p>
                          <p className="text-xs text-gray-400 truncate">{m.role_title || (m.system_role ? m.system_role.replace(/_/g,' ') : m.email)}</p>
                        </div>
                        {m.is_primary && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium flex-shrink-0">Primary</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin: open full profile button */}
              {canAdmin && (() => {
                const companyId = clientProfile.type === 'client' ? consultantId : clientProfile.member?.client_id;
                if (!companyId || !onOpenClientProfile) return null;
                return (
                  <div className="border-t border-gray-100 pt-4">
                    <button
                      onClick={() => { onClose?.(); onOpenClientProfile(companyId); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                      <ExternalLink size={14} /> Open Full Company Profile
                    </button>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-10">
              <Building2 size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No company profile found</p>
            </div>
          )}
        </div>
      )}

      {panelView === 'profile' && isHeadhunterRole && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <PersonAvatar name={userName} avatarUrl={avatarUrl} size={56} />
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base leading-tight">{userName}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Headhunter</span>
            </div>
          </div>
          {profile?.headline && (
            <p className="text-sm text-gray-600 italic leading-relaxed">"{profile.headline}"</p>
          )}
          {profile?.bio && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</p>
              <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
            </div>
          )}
          {userEmail && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={13} className="text-gray-400 flex-shrink-0" />{userEmail}
            </div>
          )}
          {profile?.linkedin_url && (
            <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <ExternalLink size={13} />LinkedIn Profile
            </a>
          )}
          {!profile?.headline && !profile?.bio && !profile?.linkedin_url && (
            <div className="text-center py-8">
              <Crosshair size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No profile details on record</p>
            </div>
          )}
        </div>
      )}

      {panelView === 'profile' && isConsultantRole && (
        <div className="flex-1 overflow-y-auto p-3">
          {/* Progress bar */}
          {(() => {
            const done = panelTabs.filter(t => panelTabStatus[t.id] === "complete").length;
            if (done === 0) return null;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(done/panelTabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{panelTabs.length} done</span>
              </div>
            );
          })()}

          {/* Section Carousel */}
          {(() => {
            const carouselIdx = Math.max(0, panelTabs.findIndex(t => t.id === panelTab));
            function scrollTo(idx) {
              setPanelTab(panelTabs[Math.max(0, Math.min(idx, panelTabs.length - 1))]?.id ?? panelTab);
            }
            function onScroll() {
              if (panelCarouselScrolling.current) return;
              const el = panelCarouselRef.current;
              if (!el) return;
              const center = el.scrollLeft + el.offsetWidth / 2;
              let closest = 0, minDist = Infinity;
              Array.from(el.children).forEach((child, i) => {
                const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
                if (dist < minDist) { minDist = dist; closest = i; }
              });
              const t2 = panelTabs[closest];
              if (t2 && t2.id !== panelTab) setPanelTab(t2.id);
            }
            return (
              <div style={{ position:'relative' }}>
                {carouselIdx > 0 && (
                  <button onClick={() => scrollTo(carouselIdx - 1)}
                    style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-16 }}>
                    <ChevronLeft size={14} style={{color:'#64748B'}}/>
                  </button>
                )}
                {carouselIdx < panelTabs.length - 1 && (
                  <button onClick={() => scrollTo(carouselIdx + 1)}
                    style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-16 }}>
                    <ChevronRight size={14} style={{color:'#64748B'}}/>
                  </button>
                )}
                <div ref={panelCarouselRef} onScroll={onScroll}
                  style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:8, padding:'0 44px' }}>
                  {panelTabs.map((tab, i) => {
                    const isActive = tab.id === panelTab;
                    const Icon = tab.icon;
                    const st = panelTabStatus[tab.id];
                    return (
                      <div key={tab.id}
                        style={{ flex:'0 0 calc(100% - 88px)', width:'calc(100% - 88px)', maxWidth:'calc(100% - 88px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                        <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', minHeight:540, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                            onClick={() => !isActive && scrollTo(i)}>
                            {st === "complete"
                              ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                              : st === "in_progress"
                                ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                                : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                            <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                            <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                            {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tab.count}</span>}
                            {isActive && (
                              <button onClick={e => { e.stopPropagation(); setPanelManualComplete(tab.id, st !== "complete"); }}
                                title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                                style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                                <Check size={9} strokeWidth={3}/>
                                {st === "complete" ? "Done" : "Mark done"}
                              </button>
                            )}
                          </div>
                          {panelMountedSlides.has(tab.id) ? (
                            <div style={{ flex:1, overflowY:'auto', padding:'16px' }} className="space-y-4">

              {/* Profile tab */}
              {tab.id === 'profile' && (loading ? <Spinner /> : (
                <>
                  {/* Avatar + identity */}
                  <div className="flex items-center gap-4">
                    <PersonAvatar name={userName} avatarUrl={avatarUrl} size={64} />
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{userName}</h3>
                      {profile?.headline && <p className="text-sm text-gray-500 mt-0.5">{profile.headline}</p>}
                      {avgRating != null && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-yellow-400 text-xs">{stars(avgRating)}</span>
                          <span className="text-sm font-semibold text-gray-700">{avgRating}</span>
                          <span className="text-xs text-gray-400">({ratings.length} rating{ratings.length !== 1 ? 's' : ''})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {profile?.years_experience != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="font-bold text-gray-900 text-lg">{profile.years_experience}<span className="text-xs font-normal text-gray-400">y</span></div>
                        <div className="text-xs text-gray-400 mt-0.5">Experience</div>
                      </div>
                    )}
                    {profile?.hourly_rate != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="font-bold text-gray-900 text-base">${profile.hourly_rate}<span className="text-[10px] font-normal text-gray-400">/h</span></div>
                        <div className="text-xs text-gray-400 mt-0.5">Rate</div>
                      </div>
                    )}
                    {availability?.available_percentage != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className={`font-bold text-lg ${availability.available_percentage >= 50 ? "text-green-600" : "text-orange-500"}`}>
                          {availability.available_percentage}<span className="text-xs font-normal text-gray-400">%</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">Available</div>
                      </div>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-2">
                    {profile?.expertise_level && (
                      <span className="px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold capitalize">{profile.expertise_level}</span>
                    )}
                    {profile?.availability_type && (
                      <span className="px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">{profile.availability_type.replace(/_/g, ' ')}</span>
                    )}
                    {profile?.travel_available && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold">Travel OK</span>
                    )}
                  </div>

                  {/* Top Skills — featured first, else first 5 */}
                  {(() => {
                    const featured = profile?.featured_skills ?? [];
                    const topSkills = featured.length > 0
                      ? featured.slice(0, 6)
                      : (profile?.skills ?? []).slice(0, 5);
                    return topSkills.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          Top Skills {featured.length > 0 && <span className="normal-case text-gray-300 font-normal">· featured</span>}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {topSkills.map(s => (
                            <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                              {featured.includes(s) && <Star size={9} className="text-amber-400 fill-amber-400" />}
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Top Experience — top 3 clients + top 3 projects */}
                  {(profile?.consultant_customers?.length > 0 || profile?.consultant_projects?.length > 0) && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top Experience</p>
                      {profile?.consultant_customers?.slice(0, 3).map((cu, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <UserAvatar name={cu.company_name ?? '?'} size={30} />
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">{cu.company_name}</div>
                            <div className="text-xs text-gray-400">{cu.role}{cu.start_year ? ` · ${cu.start_year}` : ''}</div>
                          </div>
                        </div>
                      ))}
                      {profile?.consultant_projects?.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Briefcase size={12} className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">{p.project_name ?? p.name ?? "SAP Project"}</div>
                            {p.module && <div className="text-xs text-gray-400">{p.module}{p.year ? ` · ${p.year}` : ''}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LinkedIn */}
                  {profile?.linkedin_url && (
                    <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <ExternalLink size={14} />View LinkedIn Profile
                    </a>
                  )}
                </>
              ))}

              {/* Ratings tab */}
              {tab.id === 'ratings' && (
                ratings.length === 0 ? (
                  <div className="text-center py-10">
                    <Star size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No ratings yet</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                      <div className="text-3xl font-bold text-gray-900">{avgRating}</div>
                      <div>
                        <div className="text-yellow-400 text-lg">{stars(avgRating)}</div>
                        <p className="text-xs text-gray-500 mt-0.5">{ratings.length} rating{ratings.length !== 1 ? 's' : ''}</p>
                      </div>
                      {winRate != null && (
                        <div className="ml-auto text-right">
                          <div className="text-lg font-bold text-green-600">{winRate}%</div>
                          <p className="text-xs text-gray-400">win rate</p>
                        </div>
                      )}
                    </div>
                    {/* Individual ratings */}
                    <div className="space-y-3">
                      {ratings.map((r, i) => (
                        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-white">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-400 text-sm">{stars(r.score)}</span>
                              <span className="text-sm font-bold text-gray-800">{r.score}/5</span>
                            </div>
                            <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                          </div>
                          {r.case?.title && <p className="text-xs text-blue-600 font-medium mb-1">{r.case.title}</p>}
                          {r.comment && <p className="text-sm text-gray-600 italic">"{r.comment}"</p>}
                        </div>
                      ))}
                    </div>
                  </>
                )
              )}

                            </div>
                          ) : (
                            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
                              <Spinner />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Footer pill bar */}
                <div style={{ marginTop:8, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'8px 12px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
                  {panelTabs.map((tab, i) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === panelTab;
                    const st = panelTabStatus[tab.id];
                    return (
                      <button key={tab.id} onClick={() => scrollTo(i)}
                        style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                        {st === "complete" && !isActive
                          ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                          : <Icon size={11}/>}
                        <span>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tab.count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ARENA (COMPETITIVE BIDDING)
// ============================================================
let _arenaCaseIdx = 0; // persists carousel position across ArenaView remounts
function ArenaView({ auth }) {
  const { t } = useT();
  const visCfg = useVisibilitySettings();
  const [arenaTab, setArenaTab]             = useState("cases");
  const arenaCarouselRef = useRef(null);
  const arenaCarouselScrolling = useRef(false);
  const caseCarouselRef = useRef(null);
  const caseCarouselScrolling = useRef(false);
  const [arenaMountedSlides, setArenaMountedSlides] = useState(() => new Set(["cases"]));
  const [arenaManualCompletions, setArenaManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_arenamc_arena`) ?? "{}"); } catch { return {}; }
  });
  function setArenaManualComplete(tabId, done) {
    setArenaManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_arenamc_arena`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [applyingToCase, setApplying]       = useState(null);
  const [arenaSelectedCase, setArenaSelected] = useState(null);
  const [profileView, setProfileView]       = useState(null);  // consultant id for drawer
  const [compareSet, setCompareSet]         = useState([]);    // ids selected for compare
  const { leaderboard, loading: lbLoading } = useLeaderboard();
  const { cases, loading: casesLoading, updateCase } = useCases();
  const { shortlist, toggle: toggleShortlist, isShortlisted } = useConsultantShortlist();
  const { applications, reviewApplication, refetch: refetchApps } = useApplications();
  const { templates: arenaLcTemplates } = useLifecycleTemplates();
  const [caseSort, setCaseSort] = useState('match');
  const [caseCarouselIdx, setCaseCarouselIdx] = useState(_arenaCaseIdx);

  function toggleCompare(id) {
    setCompareSet(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleArenaReviewApplication(appId, appStatus, notes) {
    await reviewApplication(appId, appStatus, notes);
    if (appStatus === "accepted" && arenaSelectedCase) {
      const c = arenaSelectedCase;
      if (c.status === "assigned") return;
      const stages = getLifecycleStages(c.case_lifecycle, arenaLcTemplates);
      const curStage = stages.find(s => s.key === c.status);
      const isTerminal = curStage?.is_terminal ?? ["completed","cancelled"].includes(c.status);
      if (isTerminal) return;
      const allowedNextKeys = curStage?.allowed_next?.length
        ? curStage.allowed_next
        : stages.map(s => s.key).filter(k => k !== c.status);
      const autoStage = stages.find(s =>
        allowedNextKeys.includes(s.key) &&
        (s.trigger === "auto" || s.trigger === "both")
      );
      await updateCase(c.id, { status: autoStage?.key ?? "assigned" });
    }
  }

  const openCases       = cases.filter(c => {
    if (c.status !== "estimated" || (c.case_assignments && c.case_assignments.length > 0)) return false;
    const vis = visCfg.getCaseVisibility(c.id, c.client_id);
    if (vis === 'private') return false;
    if (vis === 'invite-only') {
      // Only show to invited consultants
      if (auth.isConsultant || auth.isHeadhunter) {
        const invites = visCfg.getCaseInvitations(c.id);
        return invites.some(i => i.consultantId === auth.user?.id);
      }
      return auth.isAdmin || auth.isManager;
    }
    return true;
  });
  const myApplications  = applications.filter(a => a.consultant_id === auth.user?.id);
  const appliedCaseIds  = new Set(myApplications.map(a => a.case_id));
  const canViewRanking  = auth.isAdmin || auth.isManager || auth.isClient;

  const renderCases = () => {
    if (casesLoading) return <Spinner />;

    const cpObj = Array.isArray(auth.profile?.consultant_profiles)
      ? auth.profile.consultant_profiles[0]
      : auth.profile?.consultant_profiles;
    const mySkills = new Set((cpObj?.skills ?? []).map(s => String(s).toLowerCase()));

    function matchScore(cs) {
      if (!auth.isConsultant) return null;
      const req = cs.skills_required ?? [];
      if (req.length === 0) return 50;
      const hits = req.filter(s => mySkills.has(String(s).toLowerCase())).length;
      return Math.round(Math.max(5, Math.min(100, (hits / req.length) * 70 + 30)));
    }

    const orbColors = ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0EA5E9','#F97316'];

    if (openCases.length === 0) return (
      <div className="bg-blue-50 rounded-2xl p-12 text-center text-blue-400 text-sm border border-blue-100">
        {t("arena.no_cases")}
      </div>
    );

    const sorted = [...openCases].sort((a, b) => {
      if (caseSort === 'match')    return (matchScore(b) ?? 0) - (matchScore(a) ?? 0);
      if (caseSort === 'deadline') {
        const da = a.due_date ? new Date(a.due_date) : new Date(9e15);
        const db = b.due_date ? new Date(b.due_date) : new Date(9e15);
        return da - db;
      }
      if (caseSort === 'budget')   return (Number(b.budget) || 0) - (Number(a.budget) || 0);
      return 0;
    });

    const safeIdx = Math.max(0, Math.min(caseCarouselIdx, sorted.length - 1));

    function scrollToCase(idx) {
      const el = caseCarouselRef.current;
      if (!el) { setCaseCarouselIdx(idx); return; }
      caseCarouselScrolling.current = true;
      const slide = el.children[Math.max(0, Math.min(idx, sorted.length - 1))];
      if (slide) {
        const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
        el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
      setCaseCarouselIdx(idx);
      setTimeout(() => { caseCarouselScrolling.current = false; }, 600);
    }

    function renderCard(c) {
      const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
      const alreadyApplied = appliedCaseIds.has(c.id);
      const appCount = c.applications?.length ?? 0;
      const appsSorted = [...(c.applications ?? [])].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
      const score = matchScore(c);
      const now = Date.now();
      const dueMs = c.due_date ? new Date(c.due_date).getTime() : null;
      const startMs = c.start_date ? new Date(c.start_date).getTime() : null;
      const daysLeft = dueMs ? Math.max(0, Math.ceil((dueMs - now) / 86400000)) : null;
      const totalDays = (dueMs && startMs) ? Math.max(1, Math.ceil((dueMs - startMs) / 86400000)) : 14;
      const timePct = daysLeft != null ? Math.max(0, Math.min(1, daysLeft / totalDays)) : null;
      const mc = score == null ? '#2563EB' : score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
      const mcDim = score == null ? 'rgba(37,99,235,0.25)' : score >= 75 ? 'rgba(16,185,129,0.25)' : score >= 50 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';
      const tc = timePct == null ? '#3B82F6' : timePct <= 0.15 ? '#EF4444' : timePct <= 0.4 ? '#F59E0B' : '#10B981';
      const svgR = 43, svgCx = 48, svgCy = 48;
      const circ = 2 * Math.PI * svgR;
      const filled = score != null ? circ * (score / 100) : 0;
      const dayChipColor = timePct == null ? '#3B82F6' : timePct <= 0.15 ? '#DC2626' : timePct <= 0.4 ? '#D97706' : '#3B82F6';
      const dayChipBorder = timePct == null ? 'rgba(59,130,246,0.3)' : timePct <= 0.15 ? 'rgba(220,38,38,0.35)' : timePct <= 0.4 ? 'rgba(217,119,6,0.35)' : 'rgba(59,130,246,0.3)';
      const dayChipBg = timePct == null ? 'rgba(59,130,246,0.07)' : timePct <= 0.15 ? 'rgba(220,38,38,0.07)' : timePct <= 0.4 ? 'rgba(217,119,6,0.07)' : 'rgba(59,130,246,0.07)';
      const chip = (color, border, bg, label) => (
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', padding:'3px 9px', borderRadius:99, border:`1px solid ${border}`, color, background:bg }}>{label}</span>
      );

      // Leaderboard (solar) data for this card
      const lbSys = 150;
      const lbInnerR = lbSys * 0.24, lbOuterR = lbSys * 0.36, lbTimeR = lbSys * 0.46;
      const lbCirc = 2 * Math.PI * lbTimeR;
      const lbFilled = timePct != null ? lbCirc * timePct : 0;
      const otherCount = Math.max(0, appCount - (alreadyApplied ? 1 : 0));
      const innerSlots = Math.min(2, otherCount);
      const outerSlots = Math.min(5, Math.max(0, otherCount - innerSlots));

      function OrbiterNode({ label, color, r, slotIdx, total, dur, isYou }) {
        const startDeg = (slotIdx / Math.max(total, 1)) * 360 + (r === lbInnerR ? 0 : 40);
        return (
          <div style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0,
            animation:`arena-solar-orbit ${dur}s linear infinite`,
            '--start':`${startDeg}deg`, '--r':`${r}px` }}>
            <div style={{ position:'absolute', width:26, height:26, margin:-13, borderRadius:'50%', background:color,
              border: isYou ? '2px solid #2563EB' : '2px solid rgba(255,255,255,0.5)',
              boxShadow: isYou ? '0 0 7px rgba(37,99,235,0.35)' : '0 1px 3px rgba(0,0,0,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Barlow Condensed',sans-serif", fontSize:8, fontWeight:700, color:'#fff' }}>
              {label}
            </div>
          </div>
        );
      }

      return (
        <div style={{ background:'#EEF5FF', borderRadius:22, border:'1px solid #BFDBFE', overflow:'hidden', position:'relative', boxShadow:'0 4px 20px rgba(37,99,235,0.08)', height:'100%', display:'flex', flexDirection:'column' }}>
          <div style={{ position:'absolute', left:0, top:'20%', bottom:'20%', width:3, borderRadius:'0 3px 3px 0', background:mc, boxShadow:`0 0 10px ${mcDim}` }} />
          <div style={{ height:4, background:'rgba(26,75,140,0.07)', position:'relative', overflow:'hidden' }}>
            {timePct != null && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${timePct*100}%`, background:tc, opacity:0.8 }} />}
          </div>
          <div style={{ padding:'18px 22px 16px', display:'flex', flexDirection:'column', gap:12, flex:1 }}>
            {/* Ring + score */}
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ position:'relative', width:84, height:84, flexShrink:0 }}>
                <svg viewBox="0 0 96 96" fill="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
                  <circle cx={svgCx} cy={svgCy} r={svgR} stroke="rgba(26,75,140,0.12)" strokeWidth="6"/>
                  {score != null && (
                    <circle cx={svgCx} cy={svgCy} r={svgR} stroke={mc} strokeWidth="6"
                      strokeDasharray={`${circ.toFixed(1)}`} strokeDashoffset={`${(circ-filled).toFixed(1)}`}
                      strokeLinecap="round" transform={`rotate(-90 ${svgCx} ${svgCy})`}
                      style={{ filter:`drop-shadow(0 0 5px ${mcDim})` }} />
                  )}
                </svg>
                <div style={{ position:'absolute', inset:12, borderRadius:'50%', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
                  <ProjectAvatar project={c.project ?? { name: companyName || c.title, client: c.client }} size={60} />
                </div>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                {score != null ? (
                  <>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:46, fontWeight:800, lineHeight:1, color:mc, letterSpacing:'-0.01em' }}>
                      {score}<span style={{ fontSize:22, opacity:0.5 }}>%</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:'#6B8AB8', marginTop:2 }}>Match score</div>
                    {(c.skills_required?.length ?? 0) > 0 && (
                      <div style={{ fontSize:11, color:'#4A6B9A', marginTop:3, lineHeight:1.4 }}>
                        {c.skills_required.filter(s => mySkills.has(String(s).toLowerCase())).length} of {c.skills_required.length} skills matched
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize:14, color:'#1A4B8C', fontWeight:600 }}>{companyName || c.title}</div>
                )}
              </div>
            </div>
            {/* Title */}
            <div>
              <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:22, fontWeight:700, letterSpacing:'0.02em', color:'#0F172A', lineHeight:1.2 }}>{c.title}</div>
              {c.description && <div style={{ fontSize:12, color:'#4A6B9A', lineHeight:1.5, marginTop:4 }}>{c.description}</div>}
            </div>
            {/* Chips */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {c.area_sap      && chip('#0066CC','rgba(0,102,204,0.3)','rgba(0,102,204,0.07)', c.area_sap)}
              {c.area_industry && chip('#0369A1','rgba(3,105,161,0.3)','rgba(3,105,161,0.07)', c.area_industry)}
              {c.budget        && chip('#059669','rgba(5,150,105,0.3)','rgba(5,150,105,0.07)', `$${Number(c.budget).toLocaleString()}`)}
              {daysLeft != null && chip(dayChipColor, dayChipBorder, dayChipBg, daysLeft === 1 ? '1 day left' : `${daysLeft} days left`)}
              {companyName     && chip('#1A4B8C','rgba(26,75,140,0.25)','rgba(26,75,140,0.06)', companyName)}
            </div>
            <div style={{ height:1, background:'rgba(26,75,140,0.1)' }} />

            {/* Solar leaderboard inside the card */}
            <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap', background:'rgba(26,75,140,0.04)', borderRadius:14, padding:'10px 12px', border:'1px solid rgba(26,75,140,0.09)' }}>
              {/* Solar system */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <div style={{ position:'relative', width:lbSys, height:lbSys }}>
                  {[lbInnerR, lbOuterR].map(r => (
                    <div key={r} style={{ position:'absolute', borderRadius:'50%', border:'1px solid rgba(26,75,140,0.1)', top:'50%', left:'50%', width:r*2, height:r*2, transform:'translate(-50%,-50%)' }} />
                  ))}
                  <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible' }} viewBox={`0 0 ${lbSys} ${lbSys}`}>
                    <circle cx={lbSys/2} cy={lbSys/2} r={lbTimeR} fill="none" stroke="rgba(26,75,140,0.07)" strokeWidth="3.5"/>
                    {timePct != null && (
                      <circle cx={lbSys/2} cy={lbSys/2} r={lbTimeR} fill="none" stroke={tc} strokeWidth="3.5"
                        strokeDasharray={`${lbFilled.toFixed(1)} ${(lbCirc-lbFilled).toFixed(1)}`}
                        strokeLinecap="round" transform={`rotate(-90 ${lbSys/2} ${lbSys/2})`}
                        style={{ filter:`drop-shadow(0 0 4px ${tc}88)` }}/>
                    )}
                  </svg>
                  <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:46, height:46, borderRadius:'50%', background:'#fff', border:'2px solid rgba(37,99,235,0.22)', boxShadow:'0 2px 8px rgba(37,99,235,0.12)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', zIndex:10 }}>
                    <ProjectAvatar project={c.project ?? { name: companyName || c.title, client: c.client }} size={34} />
                  </div>
                  {[...Array(innerSlots)].map((_, i) => <OrbiterNode key={`in${i}`} label={`#${i+1}`} color={orbColors[i%orbColors.length]} r={lbInnerR} slotIdx={i} total={innerSlots+(alreadyApplied?1:0)} dur={10} isYou={false} />)}
                  {alreadyApplied && <OrbiterNode label="You" color="#3B82F6" r={lbInnerR} slotIdx={innerSlots} total={innerSlots+1} dur={10} isYou={true} />}
                  {[...Array(outerSlots)].map((_, i) => <OrbiterNode key={`out${i}`} label={`#${innerSlots+i+1}`} color={orbColors[(innerSlots+i)%orbColors.length]} r={lbOuterR} slotIdx={i} total={Math.max(outerSlots,1)} dur={17} isYou={false} />)}
                  {daysLeft != null && (
                    <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', fontSize:7, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:tc, whiteSpace:'nowrap' }}>
                      {daysLeft === 1 ? '1 day' : `${daysLeft} days`} left
                    </div>
                  )}
                </div>
              </div>
              {/* Ranked list */}
              <div style={{ flex:1, minWidth:140 }}>
                {auth.isConsultant && score != null && (
                  <div style={{ marginBottom:6 }}>
                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:800, lineHeight:1, color:mc }}>{score}%</span>
                    <span style={{ fontSize:8, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#6B8AB8', marginLeft:5 }}>match</span>
                  </div>
                )}
                <p style={{ fontSize:9, fontWeight:700, color:'#4A6B9A', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>{appCount} applied</p>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {appsSorted.slice(0, 4).map((app, i) => {
                    const name = app.consultant?.full_name ?? 'Consultant';
                    const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                    const avatarUrl = app.consultant?.avatar_url;
                    return (
                      <div key={app.consultant_id} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(26,75,140,0.05)', borderRadius:7, padding:'4px 8px', border:'1px solid rgba(26,75,140,0.1)' }}>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color: i===0?'#D97706':i===1?'#6B8AB8':i===2?'#B45309':'#93AECF' }}>{i+1}</span>
                        <div style={{ width:18, height:18, borderRadius:'50%', background: avatarUrl ? 'transparent' : orbColors[i%orbColors.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#fff', overflow:'hidden', flexShrink:0 }}>
                          {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
                        </div>
                        <span style={{ flex:1, fontSize:10, color:'#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                      </div>
                    );
                  })}
                  {!alreadyApplied && auth.isConsultant && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(59,130,246,0.06)', borderRadius:7, padding:'4px 8px', border:'1px dashed rgba(59,130,246,0.3)' }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color:'#2563EB' }}>?</span>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'rgba(59,130,246,0.1)', border:'1.5px dashed #3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#3B82F6' }}>Me</div>
                      <span style={{ flex:1, fontSize:10, color:'#2563EB' }}>Your spot</span>
                      {score != null && <span style={{ fontSize:9, fontWeight:700, color:mc }}>{score}%</span>}
                    </div>
                  )}
                  {alreadyApplied && auth.isConsultant && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(59,130,246,0.08)', borderRadius:7, padding:'4px 8px', border:'1px solid rgba(59,130,246,0.3)' }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color:'#2563EB' }}>✓</span>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#fff' }}>Me</div>
                      <span style={{ flex:1, fontSize:10, color:'#1D4ED8', fontWeight:600 }}>Applied{score != null ? ` · ${score}%` : ''}</span>
                    </div>
                  )}
                </div>
                {canViewRanking && (
                  <button onClick={() => setArenaSelected(c)}
                    style={{ marginTop:6, background:'transparent', border:'1px solid rgba(26,75,140,0.22)', borderRadius:8, color:'#1A4B8C', fontSize:10, fontWeight:600, padding:'4px 10px', cursor:'pointer', whiteSpace:'nowrap' }}>
                    View ranking ›
                  </button>
                )}
              </div>
            </div>

            {/* Apply CTA */}
            {auth.isConsultant && (
              alreadyApplied ? (
                <button disabled style={{ width:'100%', background:'rgba(5,150,105,0.1)', border:'1px solid rgba(5,150,105,0.3)', borderRadius:12, color:'#059669', fontSize:14, fontWeight:600, padding:'11px', cursor:'default', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <Check size={13} />{t('arena.applied')}
                </button>
              ) : (
                <button onClick={() => setApplying(c)}
                  style={{ width:'100%', background:'linear-gradient(135deg,#1A4B8C,#2563EB)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:600, padding:'11px', cursor:'pointer', boxShadow:'0 4px 16px rgba(37,99,235,0.3)' }}>
                  {t('arena.apply')}
                </button>
              )
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap');
          @keyframes arena-solar-orbit {
            from { transform: rotate(var(--start)) translateX(var(--r)) rotate(calc(-1 * var(--start))); }
            to   { transform: rotate(calc(var(--start) + 360deg)) translateX(var(--r)) rotate(calc(-1 * (var(--start) + 360deg))); }
          }
        `}</style>

        {/* Sort bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <span style={{ fontSize:12, color:'#6B8AB8', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>
            {sorted.length === 1 ? t('arena.open_count_one') : t('arena.open_count_many').replace('{n}', sorted.length)}
          </span>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'#6B8AB8', textTransform:'uppercase', letterSpacing:'0.1em', marginRight:2 }}>Sort</span>
            {['match','deadline','budget'].map(key => (
              <button key={key} onClick={() => { setCaseSort(key); scrollToCase(0); }}
                style={{ background: caseSort===key ? '#1A4B8C' : 'rgba(26,75,140,0.07)', border:`1px solid ${caseSort===key ? '#2563EB' : 'rgba(26,75,140,0.2)'}`, borderRadius:99, color: caseSort===key ? '#fff' : '#1A4B8C', fontSize:11, fontWeight:600, letterSpacing:'0.06em', padding:'4px 12px', cursor:'pointer', textTransform:'uppercase', transition:'all .15s' }}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Case cards – peek scroll-snap carousel, same style as outer */}
        <div style={{ position:'relative' }}>
          {safeIdx > 0 && (
            <button onClick={() => scrollToCase(safeIdx - 1)}
              style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', background:'rgba(26,75,140,0.08)', border:'1px solid rgba(26,75,140,0.18)', color:'#1A4B8C', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', transition:'all .15s' }}>
              ‹
            </button>
          )}
          <div ref={caseCarouselRef}
            style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollBehavior:'smooth', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 40px', alignItems:'stretch' }}
            onScroll={() => {
              if (caseCarouselScrolling.current) return;
              const el = caseCarouselRef.current;
              if (!el) return;
              const center = el.scrollLeft + el.offsetWidth / 2;
              let closest = 0, minDist = Infinity;
              Array.from(el.children).forEach((child, i) => {
                const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
                if (dist < minDist) { minDist = dist; closest = i; }
              });
              if (closest !== caseCarouselIdx) setCaseCarouselIdx(closest);
            }}>
            {sorted.map((cs, i) => {
              const isActive = i === safeIdx;
              return (
                <div key={cs.id} style={{ flex:`0 0 calc(100% - 88px)`, width:'calc(100% - 88px)', maxWidth:'calc(100% - 88px)', minWidth:0, scrollSnapAlign:'center', scrollSnapStop:'always', opacity: isActive ? 1 : 0.55, transform: isActive ? 'scale(1)' : 'scale(0.95)', transition:'opacity .25s, transform .25s', display:'flex', flexDirection:'column' }}>
                  <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
                    {renderCard(cs)}
                  </div>
                </div>
              );
            })}
          </div>
          {safeIdx < sorted.length - 1 && (
            <button onClick={() => scrollToCase(safeIdx + 1)}
              style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', background:'rgba(26,75,140,0.08)', border:'1px solid rgba(26,75,140,0.18)', color:'#1A4B8C', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', transition:'all .15s' }}>
              ›
            </button>
          )}
        </div>

        {/* Dots + counter */}
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ display:'flex', gap:5 }}>
            {sorted.map((_, i) => (
              <button key={i} onClick={() => scrollToCase(i)}
                style={{ width: i===safeIdx ? 18 : 6, height:6, borderRadius:4, background: i===safeIdx ? '#2563EB' : 'rgba(26,75,140,0.2)', border:'none', cursor:'pointer', transition:'all .2s', padding:0 }} />
            ))}
          </div>
          <span style={{ fontSize:11, color:'#6B8AB8', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {safeIdx + 1} of {sorted.length}
          </span>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    if (lbLoading) return <Spinner />;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_rank")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_consultant")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_rating")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_won")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_apps")}</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leaderboard.map((c, i) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setProfileView(c.id)}>
                <td className="px-5 py-4">
                  {i === 0 ? <span className="font-bold text-yellow-500">#1</span>
                    : i === 1 ? <span className="font-bold text-gray-400">#2</span>
                    : i === 2 ? <span className="font-bold text-amber-600">#3</span>
                    : <span className="font-bold text-gray-300">{`#${i + 1}`}</span>}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={36} />
                    <div>
                      <div className="font-medium text-gray-900">{c.user?.full_name}</div>
                      <div className="text-xs text-gray-400">{c.headline ?? t("arena.years_exp").replace("{n}", c.years_experience ?? 0)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900">{c.avgRating > 0 ? c.avgRating : "—"}</span>
                    {c.avgRating > 0 && <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>}
                    <span className="text-xs text-gray-400 ml-1">({c.ratingCount})</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-gray-900">{c.acceptedCases}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-gray-600">{c.totalApps}</span>
                </td>
                <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleCompare(c.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors font-semibold ${
                      compareSet.includes(c.id)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600"
                    }`}>
                    {compareSet.includes(c.id) ? "✓" : "+"}
                  </button>
                </td>
              </tr>
            ))}
            {leaderboard.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">{t("arena.no_consultants")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {leaderboard.map((c, i) => {
        const inCompare = compareSet.includes(c.id);
        const winRate = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
        return (
          <div key={c.id}
            className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all cursor-pointer ${
              inCompare ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-100"
            }`}
            onClick={() => setProfileView(c.id)}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={48} className="rounded-2xl flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{c.user?.full_name}</div>
                <div className="text-xs text-gray-500 truncate">{c.headline ?? t("arena.default_headline")}</div>
                {c.avgRating > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>
                    <span className="text-xs text-gray-500 font-semibold">{c.avgRating}</span>
                    <span className="text-xs text-gray-400">({c.ratingCount})</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {i < 3 && (
                  <span className={`font-bold text-sm ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : "text-amber-600"}`}>
                    #{i + 1}
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); toggleCompare(c.id); }}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors font-semibold ${
                    inCompare
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600"
                  }`}>
                  {inCompare ? "✓" : "+ Compare"}
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1 mb-3">
              {c.expertise_level && (
                <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-semibold capitalize">{c.expertise_level}</span>
              )}
              {c.availability_type && (
                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded text-xs font-semibold capitalize">{c.availability_type.replace(/_/g, ' ')}</span>
              )}
              {c.hourly_rate != null && (
                <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs font-semibold">${c.hourly_rate}/h</span>
              )}
            </div>

            {/* Win rate bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="text-gray-400">Win rate</span>
                <span className="font-semibold text-gray-700">{winRate}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${winRate}%` }} />
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-3 text-xs text-gray-500 mb-3">
              <span><strong className="text-gray-800">{c.acceptedCases}</strong> {t("arena.stat_won")}</span>
              <span><strong className="text-gray-800">{c.totalApps}</strong> {t("arena.stat_apps")}</span>
              <span><strong className="text-gray-800">{c.years_experience ?? 0}y</strong> exp</span>
            </div>

            {/* Skills */}
            {c.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.skills.slice(0, 4).map(s => (
                  <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
                ))}
                {c.skills.length > 4 && (
                  <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-xs">+{c.skills.length - 4}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderCompare = () => {
    const selected = compareSet.length >= 2
      ? leaderboard.filter(c => compareSet.includes(c.id))
      : leaderboard.slice(0, Math.min(3, leaderboard.length));

    if (selected.length < 2) return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-gray-400 text-sm mb-3">Select at least 2 consultants from Cards or Leaderboard to compare.</p>
        <button onClick={() => setArenaTab("cards")}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
          Go to Cards →
        </button>
      </div>
    );

    // Compute "best" values per metric for highlighting
    const bestRating  = Math.max(...selected.map(c => c.avgRating  ?? 0));
    const bestWon     = Math.max(...selected.map(c => c.acceptedCases ?? 0));
    const bestWinRate = Math.max(...selected.map(c => c.totalApps > 0 ? c.acceptedCases / c.totalApps : 0));
    const bestExp     = Math.max(...selected.map(c => c.years_experience ?? 0));
    const bestRate    = Math.max(...selected.map(c => c.hourly_rate ?? 0));

    const colCount = selected.length;
    const gridCols = colCount === 2 ? "md:grid-cols-2" : colCount === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

    return (
      <div>
        {/* Selection info bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Comparing <strong>{selected.length}</strong> consultants
            {compareSet.length < 2 && <span className="text-gray-400"> (showing top {selected.length} by default)</span>}
          </p>
          {compareSet.length >= 2 && (
            <button onClick={() => setCompareSet([])}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Clear selection</button>
          )}
        </div>

        <div className={`grid grid-cols-1 ${gridCols} gap-4`}>
          {selected.map((c) => {
            const winRate   = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
            const isBestRating  = c.avgRating   > 0 && c.avgRating   === bestRating;
            const isBestWon     = c.acceptedCases > 0 && c.acceptedCases === bestWon;
            const isBestWinRate = c.totalApps > 0 && (c.acceptedCases / c.totalApps) === bestWinRate;
            const isBestExp     = (c.years_experience ?? 0) > 0 && (c.years_experience ?? 0) === bestExp;
            const isCheapest    = (c.hourly_rate ?? 0) > 0 && (c.hourly_rate ?? 0) < bestRate;

            const rank = leaderboard.findIndex(l => l.id === c.id);
            const rankColor = rank === 0 ? "border-yellow-300" : rank === 1 ? "border-gray-300" : rank === 2 ? "border-orange-300" : "border-gray-100";

            return (
              <div key={c.id} className={`bg-white rounded-2xl border-2 shadow-sm p-5 ${rankColor}`}>
                {/* Header */}
                <div className="text-center mb-4">
                  <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={56} className="mx-auto mb-2 rounded-2xl" />
                  <div className="font-bold text-gray-900">{c.user?.full_name}</div>
                  {c.headline && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.headline}</div>}
                  {rank < 3 && (
                    <div className={`text-sm font-bold mt-1 ${rank === 0 ? "text-yellow-500" : rank === 1 ? "text-gray-400" : "text-amber-600"}`}>
                      #{rank + 1} Ranked
                    </div>
                  )}
                  <button onClick={() => setProfileView(c.id)}
                    className="mt-2 text-xs text-blue-600 hover:underline">View full profile →</button>
                </div>

                {/* Rating */}
                <div className={`rounded-xl p-3 mb-3 ${isBestRating ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</span>
                    {isBestRating && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">BEST</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-gray-900">{c.avgRating > 0 ? c.avgRating : "—"}</span>
                    {c.avgRating > 0 && <span className="text-yellow-400 text-sm">{stars(c.avgRating)}</span>}
                  </div>
                  <span className="text-xs text-gray-400">{c.ratingCount} rating{c.ratingCount !== 1 ? 's' : ''}</span>
                  {c.avgRating > 0 && (
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(c.avgRating / 5) * 100}%`, backgroundColor: isBestRating ? "#22c55e" : "#3b82f6" }} />
                    </div>
                  )}
                </div>

                {/* Win rate */}
                <div className={`rounded-xl p-3 mb-3 ${isBestWinRate ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Win Rate</span>
                    {isBestWinRate && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">BEST</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-gray-900">{winRate}%</span>
                    <span className="text-xs text-gray-400">{c.acceptedCases}/{c.totalApps} apps</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${winRate}%`, backgroundColor: isBestWinRate ? "#22c55e" : "#3b82f6" }} />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`rounded-xl p-2.5 ${isBestWon ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Won</span>
                      {isBestWon && <span className="text-[10px] font-bold text-green-600">BEST</span>}
                    </div>
                    <div className="font-black text-gray-900 text-lg">{c.acceptedCases}</div>
                    <div className="text-[10px] text-gray-400">cases</div>
                  </div>
                  <div className={`rounded-xl p-2.5 ${isBestExp ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Exp</span>
                      {isBestExp && <span className="text-[10px] font-bold text-green-600">BEST</span>}
                    </div>
                    <div className="font-black text-gray-900 text-lg">{c.years_experience ?? 0}<span className="text-xs font-normal">y</span></div>
                    <div className="text-[10px] text-gray-400">experience</div>
                  </div>
                  {c.hourly_rate != null && (
                    <div className={`rounded-xl p-2.5 ${isCheapest ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase">Rate</span>
                        {isCheapest && <span className="text-[10px] font-bold text-green-600">LOWEST</span>}
                      </div>
                      <div className="font-black text-gray-900 text-base">${c.hourly_rate}<span className="text-xs font-normal text-gray-400">/h</span></div>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Level</div>
                    <div className="font-semibold text-gray-900 text-sm capitalize">{c.expertise_level ?? "—"}</div>
                  </div>
                </div>

                {/* Availability */}
                {c.availability_type && (
                  <div className="mb-3">
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">
                      {c.availability_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                {/* Top Skills */}
                {(() => {
                  const topSkills = c.featured_skills?.length ? c.featured_skills : (c.skills ?? []).slice(0, 5);
                  return topSkills.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Top Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {topSkills.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const arenaTabs = [
    { id: "cases",       label: t("arena.open_cases"),  icon: Briefcase,  count: openCases.length > 0 ? openCases.length : null },
    { id: "leaderboard", label: t("arena.leaderboard"), icon: Trophy,     count: null },
    { id: "cards",       label: t("arena.cards"),       icon: LayoutGrid, count: null },
    { id: "compare",     label: t("arena.compare"),     icon: BarChart2,  count: compareSet.length >= 2 ? compareSet.length : null },
  ];

  const arenaTabStatus = (() => {
    const r = {};
    for (const tab of arenaTabs) {
      if (arenaManualCompletions[tab.id] !== undefined) {
        r[tab.id] = arenaManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  useEffect(() => {
    setArenaMountedSlides(prev => { const s = new Set(prev); s.add(arenaTab); return s; });
    const el = arenaCarouselRef.current;
    if (!el) return;
    const idx = arenaTabs.findIndex(t => t.id === arenaTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    arenaCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { arenaCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [arenaTab]);

  // Sync case carousel index to module-level var so it survives remounts
  useEffect(() => { _arenaCaseIdx = caseCarouselIdx; }, [caseCarouselIdx]);

  // When returning from ranking detail, scroll case carousel back to remembered position
  useEffect(() => {
    if (arenaSelectedCase) return;
    if (_arenaCaseIdx === 0) return;
    const tid = setTimeout(() => {
      const el = caseCarouselRef.current;
      if (!el) return;
      const slide = el.children[_arenaCaseIdx];
      if (!slide) return;
      caseCarouselScrolling.current = true;
      const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'instant' });
      setTimeout(() => { caseCarouselScrolling.current = false; }, 100);
    }, 50);
    return () => clearTimeout(tid);
  }, [arenaSelectedCase]);

  if (applyingToCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <ApplyWizard
          caseData={applyingToCase}
          auth={auth}
          onComplete={() => { setApplying(null); refetchApps(); }}
          onCancel={() => setApplying(null)}
        />
      </div>
    );
  }

  if (arenaSelectedCase && canViewRanking) {
    const c = arenaSelectedCase;
    const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
    const caseApps = applications.filter(a => a.case_id === c.id);
    const appCount = caseApps.length;
    return (
      <div className="space-y-5">
        <button onClick={() => setArenaSelected(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          {t("arena.back")}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{c.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={PRIORITY_COLORS[c.priority]}>{PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}</Badge>
                {c.area_sap      && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{c.area_sap}</span>}
                {c.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium">{c.area_industry}</span>}
                {c.is_confidential && <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">{t("arena.private")}</span>}
                {c.nda_required  && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">{t("arena.nda")}</span>}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-2xl font-black text-gray-900">{appCount}</div>
              <div className="text-xs text-gray-400">{appCount !== 1 ? t("arena.applicant_pl") : t("arena.applicant_sg")}</div>
            </div>
          </div>
          {companyName && <p className="text-sm text-blue-600 font-semibold mb-2">{companyName}</p>}
          {c.description && <p className="text-sm text-gray-600 leading-relaxed mb-4">{c.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
            {c.start_date && <span><span className="font-medium text-gray-700">{t("arena.label_start")}</span> {fmtDate(c.start_date)}</span>}
            {c.due_date   && <span><span className="font-medium text-gray-700">{t("arena.label_due_short")}</span> {fmtDate(c.due_date)}</span>}
            {c.budget     && <span><span className="font-medium text-gray-700">{t("arena.label_budget_short")}</span> ${Number(c.budget).toLocaleString()}</span>}
            {c.min_years_experience > 0 && <span><span className="font-medium text-gray-700">{t("arena.label_experience")}</span> {c.min_years_experience}{t("arena.yrs_suffix")}</span>}
          </div>
          {c.skills_required?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.skills_required.map(s => (
                <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("arena.applicant_ranking")}</p>
          <ApplicantRankingSection
            caseData={c}
            auth={auth}
            applications={caseApps}
            reviewApplication={handleArenaReviewApplication}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("arena.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("arena.subtitle")}</p>
        </div>
        {openCases.length > 0 && (
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-xl">
            {openCases.length === 1 ? t("arena.open_count_one") : t("arena.open_count_many").replace("{n}", openCases.length)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(() => {
        const done = arenaTabs.filter(t => arenaTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/arenaTabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{arenaTabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, arenaTabs.findIndex(t => t.id === arenaTab));
        function scrollTo(idx) {
          setArenaTab(arenaTabs[Math.max(0, Math.min(idx, arenaTabs.length - 1))]?.id ?? arenaTab);
        }
        function onScroll() {
          if (arenaCarouselScrolling.current) return;
          const el = arenaCarouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const t2 = arenaTabs[closest];
          if (t2 && t2.id !== arenaTab) setArenaTab(t2.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            {carouselIdx < arenaTabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            <div ref={arenaCarouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {arenaTabs.map((tab, i) => {
                const isActive = tab.id === arenaTab;
                const Icon = tab.icon;
                const st = arenaTabStatus[tab.id];
                return (
                  <div key={tab.id}
                    style={{ flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tab.count}</span>}
                        {isActive && (
                          <button onClick={e => { e.stopPropagation(); setArenaManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {arenaMountedSlides.has(tab.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

          {tab.id === "cases"       && renderCases()}
          {tab.id === "leaderboard" && renderLeaderboard()}
          {tab.id === "cards"       && renderCards()}
          {tab.id === "compare"     && renderCompare()}

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
            <div style={{ marginTop:10, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {arenaTabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === arenaTab;
                const st = arenaTabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>}
                    <span>{tab.label}</span>
                    {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}


      {/* Floating compare bar */}
      {compareSet.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <span className="text-sm font-semibold">{compareSet.length} consultants selected</span>
          <button onClick={() => { setArenaTab("compare"); }}
            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors">
            Compare →
          </button>
          <button onClick={() => setCompareSet([])}
            className="text-gray-400 hover:text-white transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Consultant profile drawer */}
      {profileView && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setProfileView(null)} />
          <ConsultantProfilePanel
            consultantId={profileView}
            onClose={() => setProfileView(null)}
            onAddToCompare={() => toggleCompare(profileView)}
            inCompare={compareSet.includes(profileView)}
            auth={auth}
            isShortlisted={isShortlisted(profileView)}
            onToggleShortlist={() => toggleShortlist(profileView)}
            openCases={cases.filter(c => c.status === 'estimated' || c.status === 'open')}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONSULTANT PROFILE VIEW
// ============================================================
function ProfileView({ auth, compact = false }) {
  const { t, lang, setLang } = useT();
  // Extract the real consultant_profiles id from auth (useAuth already fetched it via FK join)
  const cpRaw = auth.profile?.consultant_profiles;
  const realProfileId = Array.isArray(cpRaw) ? cpRaw[0]?.id : cpRaw?.id;
  const { profile, availability, loading, profileError, updateProfile, uploadPhoto, addCustomer, updateCustomer, deleteCustomer, addProject, updateProject, deleteProject, addWorkAuth } =
    useConsultantProfile(auth.user?.id, realProfileId);
  const { ratings, avgRating } = useRatings(auth.user?.id);
  const [profileTab, setProfileTab] = useState("experience");
  const pvCarouselRef = useRef(null);
  const pvCarouselScrolling = useRef(false);
  const [pvMountedSlides, setPvMountedSlides] = useState(() => new Set(["experience"]));
  const [pvManualCompletions, setPvManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_pvmc_${auth.user?.id ?? 'me'}`) ?? "{}"); } catch { return {}; }
  });
  function setPvManualComplete(tabId, done) {
    setPvManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_pvmc_${auth.user?.id ?? 'me'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (!editing) setForm({
      headline: profile?.headline ?? "",
      bio: profile?.bio ?? "",
      linkedin_url: profile?.linkedin_url ?? "",
      hourly_rate: profile?.hourly_rate ?? "",
      years_experience: profile?.years_experience ?? 0,
      external_occupancy_pct: profile?.external_occupancy_pct ?? 0,
      travel_available: profile?.travel_available ?? false,
      expertise_level: profile?.expertise_level ?? "mid",
      availability_type: profile?.availability_type ?? "project_based",
      _skills: profile?.skills?.join(", ") ?? "",
      preferred_lang: lang,
    });
  }, [profile, editing, lang]);

  async function handleSave() {
    setSaving(true);
    try {
      const { _skills, preferred_lang, ...profileData } = form;
      await updateProfile({
        ...profileData,
        skills: _skills?.split(",").map(s => s.trim()).filter(Boolean) ?? [],
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        years_experience: Number(form.years_experience) || 0,
        external_occupancy_pct: Number(form.external_occupancy_pct) || 0,
      });
      if (preferred_lang && preferred_lang !== lang) setLang(preferred_lang);
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try { await uploadPhoto(file); } catch (err) { alert(err.message); }
    setUploadingPhoto(false);
    e.target.value = '';
  }

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [custForm, setCustForm]     = useState({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" });
  const [editingCust, setEditingCust] = useState(null); // { id, company_name, role_held, start_date, end_date, description }
  const [editingProj, setEditingProj] = useState(null); // { id, title, consulting_company, client_name, role, description, tech_stack, url, _tech }
  const [projForm, setProjForm] = useState({ title: "", consulting_company: "", client_name: "", role: "", url: "", description: "", _tech: "" });
  const [authForm, setAuthForm] = useState({ country_name: "", country_code: "", auth_type: "citizen" });
  const [savingExp, setSavingExp] = useState(false);

  const tabs = [
    { id: "experience", label: t("profile.tab_experience"), icon: Briefcase,     count: null },
    { id: "skills",     label: t("profile.tab_skills"),     icon: GraduationCap, count: profile?.skills?.length > 0 ? profile.skills.length : null },
  ];

  const pvTabStatus = (() => {
    const r = {};
    for (const tab of tabs) {
      if (pvManualCompletions[tab.id] !== undefined) {
        r[tab.id] = pvManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  // Scroll-sync effect must be declared before any early return (Rules of Hooks)
  useEffect(() => {
    setPvMountedSlides(prev => { const s = new Set(prev); s.add(profileTab); return s; });
    const el = pvCarouselRef.current;
    if (!el) return;
    const idx = tabs.findIndex(t => t.id === profileTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    pvCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { pvCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [profileTab]);

  if (loading) return <Spinner />;

  // Availability breakdown
  const activeCaseCommitment = 0; // case_assignments removed from join; RPC provides totals
  const extOccupancy = profile?.external_occupancy_pct ?? 0;
  const totalUsed = Math.min(100, activeCaseCommitment + extOccupancy);
  const freeAvail = Math.max(0, 100 - totalUsed);

  async function handleAddCustomer() {
    setSavingExp(true);
    try { await addCustomer(custForm); setCustForm({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" }); }
    catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleAddProject() {
    setSavingExp(true);
    try {
      const { _tech, ...rest } = projForm;
      await addProject({ ...rest, tech_stack: _tech.split(",").map(s => s.trim()).filter(Boolean) });
      setProjForm({ title: "", consulting_company: "", client_name: "", role: "", url: "", description: "", _tech: "" });
    } catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleSaveCust() {
    if (!editingCust) return;
    setSavingExp(true);
    try {
      const { id, ...data } = editingCust;
      await updateCustomer(id, data);
      setEditingCust(null);
    } catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleSaveProj() {
    if (!editingProj) return;
    setSavingExp(true);
    try {
      const { id, _tech, ...data } = editingProj;
      await updateProject(id, { ...data, tech_stack: _tech.split(",").map(s => s.trim()).filter(Boolean) });
      setEditingProj(null);
    } catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleAddWorkAuth() {
    setSavingExp(true);
    try { await addWorkAuth(authForm); setAuthForm({ country_name: "", country_code: "", auth_type: "citizen" }); }
    catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  return (
    <div>
      {/* Profile Header — hidden when embedded inside ConsultantProfileView */}
      {!compact && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="relative group cursor-pointer" onClick={() => !uploadingPhoto && fileRef.current?.click()}>
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold overflow-hidden">
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="avatar" className="w-full h-full object-cover" />
                : auth.profile?.full_name?.[0]}
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingPhoto
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-5 h-5 text-white" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{auth.profile?.full_name}</h1>
            <p className="text-gray-500 text-sm">{profile?.headline || t("profile.headline_ph")}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-500">
              {avgRating && (
                <span className="flex items-center gap-1">
                  {stars(avgRating)} <strong className="text-gray-900">{avgRating}</strong>
                  <span className="text-gray-400">{t("profile.ratings_count").replace("{n}", ratings.length)}</span>
                </span>
              )}
              {profile?.hourly_rate && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{t("profile.rate_hr").replace("{n}", profile.hourly_rate)}</span>}
              {profile?.travel_available && <span className="flex items-center gap-1"><Plane className="w-3 h-3" />{t("label.travel")}</span>}
              {profile?.expertise_level && (
                <Badge className="bg-violet-100 text-violet-700">{EXPERTISE_LABEL_KEYS[profile.expertise_level] ? t(EXPERTISE_LABEL_KEYS[profile.expertise_level]) : cap(profile.expertise_level)}</Badge>
              )}
              {profile?.availability_type && (
                <Badge className="bg-teal-100 text-teal-700">{AVAIL_LABEL_KEYS[profile.availability_type] ? t(AVAIL_LABEL_KEYS[profile.availability_type]) : cap(fmt(profile.availability_type))}</Badge>
              )}
            </div>
          </div>
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
            {editing ? t("profile.cancel") : t("profile.edit")}
          </button>
        </div>

        {/* Availability bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{t("profile.availability")}</span>
            <span className="font-semibold text-gray-800">{freeAvail}{t("profile.free_pct")}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {activeCaseCommitment > 0 && (
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${activeCaseCommitment}%` }}
                title={t("chart.case_commit_title").replace("{n}", activeCaseCommitment)} />
            )}
            {extOccupancy > 0 && (
              <div className="h-full bg-orange-300 transition-all" style={{ width: `${extOccupancy}%` }}
                title={t("chart.external_title").replace("{n}", extOccupancy)} />
            )}
            <div className="h-full bg-emerald-200 transition-all" style={{ width: `${freeAvail}%` }}
              title={t("chart.available_title").replace("{n}", freeAvail)} />
          </div>
          <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full inline-block"/>{t("chart.cases_pct").replace("{n}", activeCaseCommitment)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-300 rounded-full inline-block"/>{t("chart.external_pct").replace("{n}", extOccupancy)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-200 rounded-full inline-block"/>{t("chart.free_pct").replace("{n}", freeAvail)}</span>
          </div>
        </div>
      </div>
      )} {/* end !compact header */}

      {/* Compact mode: show edit toggle button in a slim bar */}
      {compact && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
            {editing ? t("profile.cancel") : t("profile.edit")}
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("profile.edit")}</h3>
          <ResumeImporter onExtracted={async data => {
            setForm(p => ({
              ...p,
              ...(data.headline         ? { headline: data.headline } : {}),
              ...(data.bio              ? { bio: data.bio } : {}),
              ...(data.linkedin_url     ? { linkedin_url: data.linkedin_url } : {}),
              ...(data.hourly_rate      ? { hourly_rate: String(data.hourly_rate) } : {}),
              ...(data.years_experience ? { years_experience: String(data.years_experience) } : {}),
              ...(data.skills?.length   ? { _skills: data.skills.join(", ") } : {}),
            }));
            for (const exp of (data.work_experience ?? [])) {
              try { await addCustomer({ company_name: exp.company_name || "", role_held: exp.role_held || null, start_date: exp.start_date || null, end_date: exp.end_date || null, description: exp.description || null }); } catch (_) {}
            }
            // Auto-create consultant_customers for any consulting_company not already present
            const existingCoNames = new Set((profile?.consultant_customers ?? []).map(c => c.company_name.toLowerCase()));
            const seenCo = new Set();
            for (const proj of (data.projects ?? [])) {
              const co = proj.consulting_company?.trim();
              if (co && !existingCoNames.has(co.toLowerCase()) && !seenCo.has(co.toLowerCase())) {
                seenCo.add(co.toLowerCase());
                try { await addCustomer({ company_name: co }); } catch (_) {}
              }
            }
            for (const proj of (data.projects ?? [])) {
              try { await addProject({ title: proj.title || "", consulting_company: proj.consulting_company || null, client_name: proj.client_name || null, role: proj.role || null, description: proj.description || null, tech_stack: proj.tech_stack || [], url: proj.url || null }); } catch (_) {}
            }
          }} />
          <Input label={t("label.headline")} value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))}
            placeholder={t("profile.ph_headline_eg")} />
          <Textarea label={t("profile.bio_label")} value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
            placeholder={t("profile.ph_bio")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("label.hourly_rate")} type="number" value={form.hourly_rate}
              onChange={e => setForm(p => ({ ...p, hourly_rate: e.target.value }))} />
            <Input label={t("label.years_exp")} type="number" value={form.years_experience}
              onChange={e => setForm(p => ({ ...p, years_experience: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("label.expertise")} value={form.expertise_level ?? "mid"}
              onChange={e => setForm(p => ({ ...p, expertise_level: e.target.value }))}
              options={[
                { value: "junior",  label: t("level.junior") },
                { value: "mid",     label: t("level.mid") },
                { value: "senior",  label: t("level.senior") },
                { value: "expert",  label: t("level.expert") },
              ]} />
            <Select label={t("label.availability")} value={form.availability_type ?? "project_based"}
              onChange={e => setForm(p => ({ ...p, availability_type: e.target.value }))}
              options={[
                { value: "full_time",     label: t("avail.full_time") },
                { value: "part_time",     label: t("avail.part_time") },
                { value: "contract",      label: t("avail.contract") },
                { value: "project_based", label: t("avail.project") },
              ]} />
          </div>
          <Select label={t("label.language")} value={form.preferred_lang ?? "en"}
            onChange={e => setForm(p => ({ ...p, preferred_lang: e.target.value }))}
            options={[
              { value: "en", label: t("lang.en") },
              { value: "es", label: t("lang.es") },
            ]} />
          <Input label={t("label.linkedin")} value={form.linkedin_url}
            onChange={e => setForm(p => ({ ...p, linkedin_url: e.target.value }))}
            placeholder={t("profile.ph_linkedin")} />
          <Input label={t("profile.skills_label")} value={form._skills}
            onChange={e => setForm(p => ({ ...p, _skills: e.target.value }))}
            placeholder={t("profile.ph_skills_eg")} />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("profile.ext_occupancy")} {form.external_occupancy_pct}%
            </label>
            <input type="range" min="0" max="100" value={form.external_occupancy_pct}
              onChange={e => setForm(p => ({ ...p, external_occupancy_pct: Number(e.target.value) }))}
              className="w-full accent-blue-600" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
            <input type="checkbox" checked={form.travel_available}
              onChange={e => setForm(p => ({ ...p, travel_available: e.target.checked }))}
              className="rounded accent-blue-600" />
            {t("label.travel")}
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {saving ? t("profile.saving") : t("profile.save_changes")}
            </button>
          </div>
        </div>
      )}

      {/* Past Customers — only visible in edit mode */}
      {editing && (
        <>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("profile.past_customers")}</h3>
          {(profile?.consultant_customers?.length ?? 0) === 0
            ? <p className="text-sm text-gray-400 mb-4">{t("profile.no_customers")}</p>
            : <div className="space-y-3 mb-4">
                {profile.consultant_customers.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                    {editingCust?.id === c.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Input label={t("profile.company_name")} value={editingCust.company_name} onChange={e => setEditingCust(p => ({ ...p, company_name: e.target.value }))} />
                          <Input label={t("profile.role_held")} value={editingCust.role_held ?? ""} onChange={e => setEditingCust(p => ({ ...p, role_held: e.target.value }))} />
                          <Input label={t("label.start_date")} type="date" value={editingCust.start_date ?? ""} onChange={e => setEditingCust(p => ({ ...p, start_date: e.target.value }))} />
                          <Input label={t("label.end_date")} type="date" value={editingCust.end_date ?? ""} onChange={e => setEditingCust(p => ({ ...p, end_date: e.target.value }))} placeholder={t("profile.blank_if_curr")} />
                        </div>
                        <Textarea label={t("label.description")} value={editingCust.description ?? ""} onChange={e => setEditingCust(p => ({ ...p, description: e.target.value }))} />
                        <div className="flex gap-2">
                          <button onClick={handleSaveCust} disabled={savingExp}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                            {savingExp ? t("profile.saving") : t("action.save")}
                          </button>
                          <button onClick={() => setEditingCust(null)}
                            className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                            {t("action.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900">{c.company_name}</div>
                          {c.role_held && <div className="text-sm text-gray-500">{c.role_held}</div>}
                          {(c.start_date || c.end_date) && (
                            <div className="text-xs text-gray-400 mt-1">
                              {fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : t("label.present")}
                            </div>
                          )}
                          {c.description && <p className="text-sm text-gray-600 mt-2">{c.description}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setEditingCust({ ...c })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm(`Delete "${c.company_name}"?`)) deleteCustomer(c.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("profile.add_customer")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("profile.company_name")} value={custForm.company_name} onChange={e => setCustForm(p => ({ ...p, company_name: e.target.value }))} />
              <Input label={t("profile.role_held")} value={custForm.role_held} onChange={e => setCustForm(p => ({ ...p, role_held: e.target.value }))} />
              <Input label={t("label.start_date")} type="date" value={custForm.start_date} onChange={e => setCustForm(p => ({ ...p, start_date: e.target.value }))} />
              <Input label={t("label.end_date")} type="date" value={custForm.end_date} onChange={e => setCustForm(p => ({ ...p, end_date: e.target.value }))} placeholder={t("profile.blank_if_curr")} />
            </div>
            <Textarea label={t("label.description")} value={custForm.description} onChange={e => setCustForm(p => ({ ...p, description: e.target.value }))} />
            <button onClick={handleAddCustomer} disabled={savingExp || !custForm.company_name}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {savingExp ? t("profile.saving") : t("profile.add_customer_btn")}
            </button>
          </div>
        </div>

        {/* Projects management — only visible in edit mode */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("profile.projects")}</h3>
          {editingProj && (
            <div className="border border-blue-200 bg-blue-50 rounded-2xl p-4 mb-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Edit Project</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label={t("label.title")} value={editingProj.title} onChange={e => setEditingProj(p => ({ ...p, title: e.target.value }))} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Consulting Company</label>
                  <select value={editingProj.consulting_company ?? ""}
                    onChange={e => setEditingProj(p => ({ ...p, consulting_company: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— None —</option>
                    {(profile?.consultant_customers ?? []).map(cu => (
                      <option key={cu.id} value={cu.company_name}>{cu.company_name}</option>
                    ))}
                  </select>
                </div>
                <Input label={t("profile.client_name")} value={editingProj.client_name ?? ""} onChange={e => setEditingProj(p => ({ ...p, client_name: e.target.value }))} />
                <Input label="Role" value={editingProj.role ?? ""} onChange={e => setEditingProj(p => ({ ...p, role: e.target.value }))} />
                <Input label={t("profile.url")} value={editingProj.url ?? ""} onChange={e => setEditingProj(p => ({ ...p, url: e.target.value }))} />
                <Input label={t("profile.tech_stack")} value={editingProj._tech} onChange={e => setEditingProj(p => ({ ...p, _tech: e.target.value }))} />
              </div>
              <Textarea label={t("label.description")} value={editingProj.description ?? ""} onChange={e => setEditingProj(p => ({ ...p, description: e.target.value }))} />
              <div className="flex gap-2">
                <button onClick={handleSaveProj} disabled={savingExp}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                  {savingExp ? t("profile.saving") : t("action.save")}
                </button>
                <button onClick={() => setEditingProj(null)}
                  className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                  {t("action.cancel")}
                </button>
              </div>
            </div>
          )}
          {(profile?.consultant_projects?.length ?? 0) === 0
            ? <p className="text-sm text-gray-400 mb-4">{t("profile.no_projects")}</p>
            : <div className="mb-4"><ConsultantProjectsHierarchy projects={profile.consultant_projects}
                onEdit={p => setEditingProj({ ...p, _tech: p.tech_stack?.join(", ") ?? "" })}
                onDelete={id => deleteProject(id)}
                onToggleFeatured={p => updateProject(p.id, { featured: !p.featured })}
              /></div>}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("profile.add_project")}</p>
            {(profile?.consultant_customers?.length ?? 0) === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Add a company in <strong>Work Experience</strong> first — it will appear here as the Consulting Company.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("label.title")} value={projForm.title} onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Consulting Company</label>
                <select value={projForm.consulting_company}
                  onChange={e => setProjForm(p => ({ ...p, consulting_company: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={(profile?.consultant_customers?.length ?? 0) === 0}>
                  <option value="">— Select company —</option>
                  {(profile?.consultant_customers ?? []).map(cu => (
                    <option key={cu.id} value={cu.company_name}>{cu.company_name}</option>
                  ))}
                </select>
              </div>
              <Input label={t("profile.client_name")} value={projForm.client_name} onChange={e => setProjForm(p => ({ ...p, client_name: e.target.value }))} />
              <Input label="Role" value={projForm.role} onChange={e => setProjForm(p => ({ ...p, role: e.target.value }))} />
              <Input label={t("profile.url")} value={projForm.url} onChange={e => setProjForm(p => ({ ...p, url: e.target.value }))} />
              <Input label={t("profile.tech_stack")} value={projForm._tech} onChange={e => setProjForm(p => ({ ...p, _tech: e.target.value }))} />
            </div>
            <Textarea label={t("label.description")} value={projForm.description} onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
            <button onClick={handleAddProject} disabled={savingExp || !projForm.title}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {savingExp ? t("profile.saving") : t("profile.add_project_btn")}
            </button>
          </div>
        </div>
        </>
      )}

      {/* Progress bar */}
      {(() => {
        const done = tabs.filter(t => pvTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/tabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{tabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, tabs.findIndex(t => t.id === profileTab));
        function scrollTo(idx) {
          setProfileTab(tabs[Math.max(0, Math.min(idx, tabs.length - 1))]?.id ?? profileTab);
        }
        function onScroll() {
          if (pvCarouselScrolling.current) return;
          const el = pvCarouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const t2 = tabs[closest];
          if (t2 && t2.id !== profileTab) setProfileTab(t2.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            {carouselIdx < tabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            <div ref={pvCarouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {tabs.map((tab, i) => {
                const isActive = tab.id === profileTab;
                const Icon = tab.icon;
                const st = pvTabStatus[tab.id];
                return (
                  <div key={tab.id}
                    style={{ flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tab.count}</span>}
                        {isActive && (
                          <button onClick={e => { e.stopPropagation(); setPvManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {pvMountedSlides.has(tab.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

          {/* Experience */}
          {tab.id === "experience" && (
            <div className="space-y-6">
              <h3 className="font-semibold text-gray-900 mb-4">{t("profile.projects")}</h3>
              {(profile?.consultant_projects?.length ?? 0) === 0
                ? <p className="text-sm text-gray-400">{t("profile.no_projects")}</p>
                : <ConsultantProjectsHierarchy projects={profile.consultant_projects} />}
            </div>
          )}

          {/* Skills */}
          {tab.id === "skills" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">{t("label.skills")}</h3>
                {(profile?.skills?.length ?? 0) === 0
                  ? <p className="text-sm text-gray-400 mb-4">{t("profile.no_skills")}</p>
                  : <div className="flex flex-wrap gap-2 mb-4">{profile.skills.map(s => {
                      const isFeatured = (profile?.featured_skills ?? []).includes(s);
                      return (
                        <div key={s} className={`flex items-center rounded-xl text-sm font-medium border ${
                          isFeatured ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-100"
                        }`}>
                          <button onClick={async () => {
                            const cur = profile?.featured_skills ?? [];
                            const next = isFeatured ? cur.filter(f => f !== s) : [...cur, s];
                            try { await updateProfile({ featured_skills: next }); } catch (e) { alert(e.message); }
                          }} title={isFeatured ? "Remove from highlights" : "Add to highlights"}
                            className="flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:opacity-80">
                            <Star className="w-3 h-3 flex-shrink-0" fill={isFeatured ? "currentColor" : "none"} />
                            {s}
                          </button>
                          <button onClick={async () => {
                            setSavingExp(true);
                            try {
                              const nextSkills = (profile?.skills ?? []).filter(sk => sk !== s);
                              const nextFeatured = (profile?.featured_skills ?? []).filter(f => f !== s);
                              await updateProfile({ skills: nextSkills, featured_skills: nextFeatured });
                            } catch (e) { alert(e.message); }
                            setSavingExp(false);
                          }} title="Remove skill"
                            className="pr-2 pl-0.5 py-1.5 hover:text-red-500 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}</div>}
                <p className="text-xs text-gray-400 mb-3">Tap a skill to highlight it in your overview.</p>
                <div className="flex gap-2 mt-2">
                  <input id="new-skill-input" placeholder={t("profile.skill_ph")}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button disabled={savingExp} onClick={async () => {
                    const input = document.getElementById("new-skill-input");
                    const val = input?.value?.trim();
                    if (!val) return;
                    setSavingExp(true);
                    try {
                      const current = profile?.skills ?? [];
                      if (!current.includes(val)) await updateProfile({ skills: [...current, val] });
                      input.value = "";
                    } catch (e) { alert(e.message); }
                    setSavingExp(false);
                  }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                    {savingExp ? "…" : t("profile.add_skill")}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t("profile.work_auth")}</h3>
                {(profile?.work_authorizations?.length ?? 0) === 0
                  ? <p className="text-sm text-gray-400 mb-4">{t("profile.no_auth")}</p>
                  : <div className="grid grid-cols-2 gap-3 mb-4">
                      {profile.work_authorizations.map(w => (
                        <div key={w.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                          <div className="text-2xl">{w.country_code === "US" ? "🇺🇸" : w.country_code === "GB" ? "🇬🇧" : <Globe size={18} />}</div>
                          <div>
                            <div className="text-sm font-medium">{w.country_name}</div>
                            <div className="text-xs text-gray-400 capitalize">{fmt(w.auth_type)}</div>
                          </div>
                        </div>
                      ))}
                    </div>}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("profile.add_auth")}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Input label={t("profile.country")} value={authForm.country_name} onChange={e => setAuthForm(p => ({ ...p, country_name: e.target.value }))} />
                    <Input label={t("profile.country_code")} value={authForm.country_code} onChange={e => setAuthForm(p => ({ ...p, country_code: e.target.value.toUpperCase() }))} placeholder="US" />
                    <Select label={t("profile.auth_type")} value={authForm.auth_type} onChange={e => setAuthForm(p => ({ ...p, auth_type: e.target.value }))}
                      options={[{ value: "citizen", label: t("profile.auth_citizen") }, { value: "permanent_resident", label: t("profile.auth_perm_resident") }, { value: "work_visa", label: t("profile.auth_work_visa") }, { value: "other", label: t("profile.auth_other") }]} />
                  </div>
                  <button onClick={handleAddWorkAuth} disabled={savingExp || !authForm.country_name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                    {savingExp ? t("profile.saving") : t("profile.add_auth")}
                  </button>
                </div>
              </div>
            </div>
          )}


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
            <div style={{ marginTop:10, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {tabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === profileTab;
                const st = pvTabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>}
                    <span>{tab.label}</span>
                    {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// CONSULTANTS DIRECTORY (Manager / Client View)
// ============================================================
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

// ============================================================
// NOTIFICATIONS VIEW
// ============================================================
function NotificationsView() {
  const { t } = useT();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState("all");
  const [showPrefs, setShowPrefs] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("notif_hidden_types") ?? "[]"); }
    catch { return []; }
  });

  function toggleHideType(type) {
    setHiddenTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      try { localStorage.setItem("notif_hidden_types", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const NOTIF_TABS = [
    { id: "all",         label: t("feed.all") },
    { id: "comment",     label: t("feed.comments") },
    { id: "progress",    label: t("feed.progress") },
    { id: "status_change", label: t("feed.status") },
    { id: "assignment",  label: t("feed.assignments") },
    { id: "alert",       label: t("feed.alerts") },
  ];

  const NOTIF_PREF_TYPES = [
    { key: "comment",      label: t("feed.pref_comments") },
    { key: "progress",     label: t("feed.pref_progress") },
    { key: "status_change",label: t("feed.pref_status") },
    { key: "assignment",   label: t("feed.pref_assignments") },
    { key: "alert",        label: t("feed.pref_alerts") },
    { key: "time_log",     label: "Time Logs" },
    { key: "milestone",    label: "Milestones" },
  ];

  const filtered = notifications.filter(n => {
    if (hiddenTypes.includes(n.event_type)) return false;
    if (filter !== "all" && n.event_type !== filter) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("notif.title")}</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        {/* Header */}
        <div className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900">{t("notif.title")}</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-lg border border-blue-100 hover:border-blue-300 transition-colors">
                  {t("notif.mark_read")}
                </button>
              )}
              <button onClick={() => setShowPrefs(p => !p)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t("dashboard.preferences")}
              </button>
            </div>
          </div>

          {/* Preferences panel */}
          {showPrefs && (
            <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t("feed.show_in_feed")}</p>
              <div className="grid grid-cols-2 gap-2">
                {NOTIF_PREF_TYPES.map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 cursor-pointer py-1">
                    <span className="text-sm text-gray-700">{label}</span>
                    <button
                      onClick={() => toggleHideType(key)}
                      className={`relative rounded-full transition-colors flex-shrink-0 ${!hiddenTypes.includes(key) ? "bg-blue-600" : "bg-gray-200"}`}
                      style={{ width: 40, height: 22 }}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${!hiddenTypes.includes(key) ? "translate-x-5" : "translate-x-0.5"}`} style={{ transitionProperty: "transform" }} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {NOTIF_TABS.map(tab => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${
                  filter === tab.id ? "text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-700"
                }`}>
                {tab.label}
                {tab.id === "all" && notifications.length > 0 && (
                  <span className="ml-1 text-gray-400 font-normal">{notifications.length}</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-b border-gray-100 -mx-5" />
        </div>

        {/* Items */}
        <div className="p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm">{t("dashboard.loading_feed")}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">{t("notif.none")}</p>
              <p className="text-xs mt-1">{t("notif.none_hint")}</p>
            </div>
          ) : filtered.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors ${
                n.is_read ? "bg-white border-gray-100 hover:bg-gray-50" : "bg-blue-50 border-blue-100 hover:bg-blue-100"}`}>
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.is_read ? "bg-gray-200" : "bg-blue-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">{n.title}</div>
                {n.body && <div className="text-sm text-gray-500 mt-0.5">{n.body}</div>}
                <div className="text-xs text-gray-400 mt-1">{fmtDate(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// USERS ADMIN VIEW
// ============================================================
function UsersView() {
  const { t } = useT();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", role: "manager", password: "" });
  const [adding, setAdding]   = useState(false);
  const [addError, setAddError] = useState("");

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    setUsers(data ?? []);
  }

  useEffect(() => {
    (async () => { await loadUsers(); setLoading(false); })();
  }, []);

  async function toggleActive(userId, isActive) {
    await supabase.from("users").update({ is_active: !isActive }).eq("id", userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
  }

  async function handleCreateUser() {
    setAddError("");
    if (!addForm.full_name || !addForm.email || !addForm.password) {
      setAddError(t("sys.create_user_required")); return;
    }
    setAdding(true);
    try {
      // Use a separate client with no session persistence so the admin stays logged in
      const tmpClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || "",
        import.meta.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { persistSession: false } }
      );
      const { error } = await tmpClient.auth.signUp({
        email: addForm.email,
        password: addForm.password,
        options: { data: { full_name: addForm.full_name, role: addForm.role } },
      });
      await tmpClient.auth.signOut();
      if (error) throw error;
      await loadUsers();
      setShowAdd(false);
      setAddForm({ full_name: "", email: "", role: "manager", password: "" });
    } catch (e) {
      setAddError(e.message || JSON.stringify(e));
    }
    setAdding(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("settings.users")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("users.total").replace("{n}", users.length)}</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(""); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
          {t("users.add_btn")}
        </button>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{t("sys.create_user_title")}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
              {t("sys.create_user_notice")}
            </div>
            <Input label={t("label.full_name")} value={addForm.full_name}
              onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
              placeholder={t("contact.ph_name")} />
            <Input label={t("label.email")} type="email" value={addForm.email}
              onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
              placeholder={t("contact.ph_email")} />
            <Select label={t("label.role")} value={addForm.role}
              onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
              options={[
                { value: "manager",    label: t("auth.role_manager") },
                { value: "admin",      label: t("auth.role_admin") },
                { value: "consultant", label: t("auth.role_consultant") },
                { value: "client",     label: t("auth.role_client") },
              ]} />
            <Input label={t("sys.temp_pwd")} type="password" value={addForm.password}
              onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))}
              placeholder={t("sys.temp_pwd_ph")} />
            {addError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{addError}</div>
            )}
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                {t("action.cancel")}
              </button>
              <button onClick={handleCreateUser} disabled={adding}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {adding ? t("state.creating") : t("action.create_account")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("users.col_user")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("label.role")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("users.col_joined")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("label.status")}</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => {
              const rc = ROLE_COLORS[u.role] ?? ROLE_COLORS.consultant;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <PersonAvatar name={u.full_name} avatarUrl={u.avatar_url} size={36} />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-gray-900">{u.full_name}</span>
                          <TrustBadge level={u.trust_level} size="xs" />
                        </div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${rc.bg} ${rc.text}`}>{ROLE_LABEL_KEYS[u.role] ? t(ROLE_LABEL_KEYS[u.role]) : cap(u.role)}</Badge>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? "text-green-700" : "text-gray-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                      {u.is_active ? t("label.active") : t("label.inactive")}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => toggleActive(u.id, u.is_active)}
                      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50">
                      {u.is_active ? t("action.deactivate") : t("action.activate")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// REPORTS VIEW (Admin)
// ============================================================
function ReportsView() {
  const { t } = useT();
  const { cases } = useCases();
  const { applications } = useApplications();
  const { invoices } = useInvoices();
  const { entries: timeEntries } = useTimeEntries();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const inRange = (dateStr) => {
    if (!dateStr) return true;
    const d = dateStr.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo   && d > dateTo)   return false;
    return true;
  };

  const filtCases   = cases.filter(c => inRange(c.created_at));
  const filtApps    = applications.filter(a => inRange(a.submitted_at));
  const filtInvoices = invoices.filter(i => inRange(i.issue_date ?? i.created_at));
  const filtEntries  = timeEntries.filter(e => inRange(e.date));

  const byStatus = ["open","estimated","assigned","in_progress","on_hold","completed","cancelled"].map(s => ({
    label: STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : cap(fmt(s)),
    count: filtCases.filter(c => c.status === s).length,
    color: s === "open" ? "bg-emerald-400" : s === "estimated" ? "bg-teal-400" :
           s === "assigned" ? "bg-violet-400" : s === "in_progress" ? "bg-blue-400" :
           s === "on_hold" ? "bg-yellow-400" : s === "completed" ? "bg-gray-300" : "bg-red-300",
  }));

  const totalApps = filtApps.length;
  const acceptedApps = filtApps.filter(a => a.status === "accepted").length;
  const conversionRate = totalApps > 0 ? Math.round((acceptedApps / totalApps) * 100) : 0;

  const byAppStatus = ["pending","under_review","accepted","rejected","withdrawn"].map(s => ({
    label: STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : cap(fmt(s)),
    count: filtApps.filter(a => a.status === s).length,
  }));

  const totalInvoiced    = filtInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalPaid        = filtInvoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOutstanding = filtInvoices.filter(i => ["sent","overdue"].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalHours       = filtEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
  const billableHours    = filtEntries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);

  // Per-consultant breakdown
  const consultantHours = Object.values(
    filtEntries.reduce((acc, e) => {
      const id = e.consultant_id;
      const name = e.consultant?.full_name ?? t("reports.unknown");
      if (!acc[id]) acc[id] = { id, name, total: 0, billable: 0 };
      acc[id].total += (e.hours ?? 0);
      acc[id].billable += e.is_billable ? (e.hours ?? 0) : 0;
      return acc;
    }, {})
  ).map(c => ({
    ...c,
    caseCount: filtCases.filter(fc =>
      fc.case_assignments?.some(a => a.consultant_id === c.id)
    ).length,
  })).sort((a, b) => b.total - a.total).slice(0, 8);

  const isFiltered = dateFrom || dateTo;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("reports.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("reports.subtitle")}{isFiltered ? t("reports.filtered") : t("reports.all_time")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500">{t("reports.from")}</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs font-medium text-gray-500">{t("reports.to")}</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {isFiltered && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 border border-gray-200 rounded-xl hover:bg-gray-50">
              {t("action.clear")}
            </button>
          )}
          <button
            onClick={() => {
              const rows = [
                [t("reports.csv_title"),t("reports.csv_status"),t("reports.csv_client"),t("reports.csv_manager"),t("reports.csv_created")],
                ...filtCases.map(c => [
                  `"${(c.title ?? "").replace(/"/g,'""')}"`,
                  c.status ?? "",
                  `"${(c.client?.full_name ?? "").replace(/"/g,'""')}"`,
                  `"${(c.manager?.full_name ?? "").replace(/"/g,'""')}"`,
                  (c.created_at ?? "").slice(0,10),
                ]),
              ];
              const csv = rows.map(r => r.join(",")).join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a.download = `techcase-report-${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
            }}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">
            <Download className="w-3.5 h-3.5" /> {t("action.export_csv")}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: t("reports.total_cases"),  value: filtCases.length,               Icon: FolderOpen },
          { label: t("reports.conversion"),   value: `${conversionRate}%`,          Icon: Target },
          { label: t("reports.hours_logged"), value: `${totalHours.toFixed(0)}h`,   Icon: Clock },
          { label: t("reports.revenue_paid"), value: `$${totalPaid.toLocaleString()}`, Icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="mb-2"><s.Icon className="w-5 h-5 text-gray-400" /></div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cases by status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">{t("reports.cases_by_status")}</h2>
          <div className="space-y-3">
            {byStatus.map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`}
                    style={{ width: filtCases.length ? `${(s.count / filtCases.length) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Applications by status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">{t("reports.apps_by_status")}</h2>
          <div className="space-y-3">
            {byAppStatus.map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: totalApps ? `${(s.count / totalApps) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue overview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">{t("reports.revenue_overview")}</h2>
          <div className="space-y-4">
            {[
              { label: t("reports.total_invoiced"), value: totalInvoiced,    color: "bg-blue-400" },
              { label: t("reports.paid"),            value: totalPaid,        color: "bg-green-400" },
              { label: t("reports.outstanding"),     value: totalOutstanding, color: "bg-orange-400" },
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">${s.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`}
                    style={{ width: totalInvoiced ? `${(s.value / totalInvoiced) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 text-sm text-gray-500">
              {filtInvoices.length === 1 ? t("invoices.count_one") : t("invoices.count_many").replace("{n}", filtInvoices.length)}{" "}
              {t("reports.inv_total")} · {filtInvoices.filter(i => i.status === "overdue").length} {t("reports.overdue_label")}
            </div>
          </div>
        </div>

        {/* Time tracking */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">{t("reports.time_tracking")}</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{totalHours.toFixed(1)}h</div>
              <div className="text-xs text-blue-500 mt-1">{t("reports.total_logged")}</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{billableHours.toFixed(1)}h</div>
              <div className="text-xs text-green-500 mt-1">{t("reports.billable")}</div>
            </div>
          </div>
          <div className="text-sm text-gray-500 mb-4">
            <div className="flex justify-between mb-1">
              <span>{t("reports.approved_entries")}</span>
              <span className="font-medium">{filtEntries.filter(e => e.is_approved).length} / {filtEntries.length}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full"
                style={{ width: filtEntries.length ? `${(filtEntries.filter(e => e.is_approved).length / filtEntries.length) * 100}%` : "0%" }} />
            </div>
          </div>
          {consultantHours.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("reports.hours_by_consultant")}</p>
              <div className="space-y-2">
                {consultantHours.map(c => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium truncate max-w-[50%]">{c.name}</span>
                      <span className="text-gray-500">
                        <span className="text-indigo-600 mr-2">{c.caseCount === 1 ? t("reports.case_count_one") : t("reports.case_count_many").replace("{n}", c.caseCount)}</span>
                        {c.total.toFixed(1)}h <span className="text-green-600">{t("reports.h_billable").replace("{n}", c.billable.toFixed(1))}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full"
                        style={{ width: totalHours ? `${(c.total / totalHours) * 100}%` : "0%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SLA CONFIG VIEW (Admin / Manager)
// ============================================================
function SlaView({ auth }) {
  const { t } = useT();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email, client_profiles(company_name)")
        .eq("role", "client")
        .order("full_name");
      setClients(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("sla.title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("sla.page_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("label.clients")}</div>
          <div className="space-y-1">
            {clients.map(c => (
              <button key={c.id} onClick={() => setSelectedClient(c)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                <div className="text-xs text-gray-400">{c.email}</div>
              </button>
            ))}
            {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t("sla.no_clients")}</p>}
          </div>
        </div>

        {/* SLA Detail */}
        <div className="lg:col-span-2">
          {selectedClient
            ? <SlaClientDetail client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="mb-3 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
                <p>{t("sla.select_client")}</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function SlaClientDetail({ client, auth }) {
  const { t } = useT();
  const { sla, loading, updateSla } = useSlaConfig(client.id);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ tier: "standard", uptime_guarantee_pct: 99, dedicated_consultant: false, priority_support: false, notes: "" });
  const [caseTypes, setCaseTypes] = useState(SLA_DEFAULT_TYPES);
  const [matrix, setMatrix]       = useState(() => makeDefaultMatrix());

  useEffect(() => {
    const m = sla?.sla_matrix;
    setForm({
      tier:                 sla?.tier                 ?? "standard",
      uptime_guarantee_pct: sla?.uptime_guarantee_pct ?? 99,
      dedicated_consultant: sla?.dedicated_consultant ?? false,
      priority_support:     sla?.priority_support     ?? false,
      notes:                sla?.notes                ?? "",
    });
    const cts = m?.case_types ?? SLA_DEFAULT_TYPES;
    setCaseTypes(cts);
    setMatrix(m?.matrix ?? makeDefaultMatrix(cts.map(t => t.key)));
  }, [sla]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSla({ ...form, sla_matrix: { case_types: caseTypes, matrix } });
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  const tierColors = { standard: "bg-gray-100 text-gray-700", premium: "bg-blue-100 text-blue-700", enterprise: "bg-violet-100 text-violet-700" };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{client.email}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
            {editing ? t("action.cancel") : t("sla.edit")}
          </button>
        )}
      </div>

      {/* Header fields */}
      {editing ? (
        <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("sla.tier")} value={form.tier}
              onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}
              options={[{ value:"standard", label:t("sla.tier_standard") },{ value:"premium", label:t("sla.tier_premium") },{ value:"enterprise", label:t("sla.tier_enterprise") }]} />
            <Input label={t("sla.uptime")} type="number" value={form.uptime_guarantee_pct}
              onChange={e => setForm(p => ({ ...p, uptime_guarantee_pct: Number(e.target.value) }))} />
          </div>
          <div className="flex gap-6">
            {[["dedicated_consultant", t("sla.dedicated")],["priority_support", t("sla.priority_support")]].map(([k,lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      ) : sla ? (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Badge className={tierColors[sla.tier] ?? tierColors.standard}>{SLA_TIER_LABEL_KEYS[sla.tier] ? t(SLA_TIER_LABEL_KEYS[sla.tier]) : cap(sla.tier)} {t("sla.tier_suffix")}</Badge>
          {sla.uptime_guarantee_pct && <Badge className="bg-gray-100 text-gray-700">{sla.uptime_guarantee_pct}{t("sla.uptime_badge")}</Badge>}
          {sla.priority_support    && <Badge className="bg-orange-100 text-orange-700">{t("sla.priority_support")}</Badge>}
          {sla.dedicated_consultant && <Badge className="bg-green-100 text-green-700">{t("sla.dedicated")}</Badge>}
          <span className="text-xs text-gray-400 ml-auto">{t("sla.updated_on").replace("{n}", fmtDate(sla.updated_at ?? sla.created_at))}</span>
        </div>
      ) : null}

      {/* Legend */}
      {!editing && sla && (
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <span><span className="text-blue-400 mr-1">↩</span>{t("sla.legend_response")}</span>
          <span><Check size={13} className="text-green-500 mr-1 inline" />{t("sla.resolution")}</span>
        </div>
      )}

      {/* Matrix */}
      {(sla || editing) ? (
        <SlaMatrixEditor caseTypes={caseTypes} matrix={matrix} editing={editing}
          onChangeCaseTypes={setCaseTypes} onChangeMatrix={setMatrix} />
      ) : (
        <div className="text-center py-8 text-gray-400">
          <div className="mb-2 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
          <p className="text-sm">{t("sla.no_sla_client")}</p>
          {(auth.isAdmin || auth.isManager) && (
            <button onClick={() => setEditing(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
              {t("sla.configure")}
            </button>
          )}
        </div>
      )}

      {/* Notes + actions */}
      {editing ? (
        <div className="mt-5 space-y-4">
          <Textarea label={t("sla.notes")} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder={t("sla.extra_terms")} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("state.saving") : t("sla.save")}
            </button>
          </div>
        </div>
      ) : sla?.notes ? (
        <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-gray-700">
          <div className="font-medium text-yellow-800 mb-1">{t("sla.notes")}</div>
          {sla.notes}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// DB CONNECTIONS VIEW (Admin / Manager / Client)
// ============================================================
function DbConnectionsView({ auth }) {
  const { t } = useT();
  const [clients, setClients]         = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      let clientId = auth.isClient ? auth.user?.id : null;
      if (clientId) {
        // Client sees their own
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)").eq("id", clientId).single();
        if (data) { setClients([data]); setSelectedClient(data); }
      } else {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)")
          .eq("role", "client").order("full_name");
        setClients(data ?? []);
      }
      setLoadingClients(false);
    })();
  }, [auth]);

  if (loadingClients) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("conn.title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("conn.page_subtitle")}</p>
      </div>

      <div className={`grid gap-6 ${auth.isClient ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        {!auth.isClient && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("label.clients")}</div>
            <div className="space-y-1">
              {clients.map(c => (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                  <div className="text-xs text-gray-400">{c.email}</div>
                </button>
              ))}
              {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t("sla.no_clients")}</p>}
            </div>
          </div>
        )}

        <div className={auth.isClient ? "" : "lg:col-span-2"}>
          {selectedClient
            ? <DbConnectionsList client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="mb-3 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
                <p>{t("conn.select_client")}</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function SapProfileFields({ meta = {}, onChange, dbType }) {
  const { t } = useT();
  const SAP_COMPONENTS = ["FI","CO","MM","SD","PP","PM","QM","WM","EWM","HCM","PS","RE","FI-AA","TR","GRC","BW","PI/PO","ABAP","BC","SRM","CRM","IS-Retail","IS-Utilities","IS-Oil","LE","CS"];
  const set = (key, val) => onChange({ ...meta, [key]: val });
  const toggleComp = (comp) => {
    const comps = meta.components ?? [];
    set("components", comps.includes(comp) ? comps.filter(c => c !== comp) : [...comps, comp]);
  };
  return (
    <div className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">{t("sap.profile_title")}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("sap.product_label")}</label>
          <select value={meta.sap_product ?? "S/4HANA"} onChange={e => set("sap_product", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {["S/4HANA","ECC 6.0","BW/4HANA","SAP BW","SAP CRM","SAP SRM","SAP GRC","SAP HCM","SAP HANA","SAP PI/PO","Other"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <Input label={t("sap.release_label")} value={meta.sap_release ?? ""}
          onChange={e => set("sap_release", e.target.value)} placeholder={t("sap.ph_release")} />
        <Input label={t("sap.basis_label")} value={meta.basis_release ?? ""}
          onChange={e => set("basis_release", e.target.value)} placeholder="7.58" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("sap.role_label")}</label>
          <select value={meta.system_role ?? "DEV"} onChange={e => set("system_role", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {[["DEV","sap.role_dev"],["QAS","sap.role_qas"],["PRD","sap.role_prd"],["SBX","sap.role_sbx"],["TRN","sap.role_trn"]].map(([v,k]) => <option key={v} value={v}>{t(k)} ({v})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("sap.language_label")}</label>
          <select value={meta.language ?? "EN"} onChange={e => set("language", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {[["EN","English"],["ES","Spanish"],["DE","German"],["FR","French"],["PT","Portuguese"],["IT","Italian"],["NL","Dutch"],["PL","Polish"],["ZH","Chinese"],["JA","Japanese"],["AR","Arabic"]].map(([v,l]) => <option key={v} value={v}>{l} ({v})</option>)}
          </select>
        </div>
        <Input label={t("sap.transport_label")} value={meta.transport_route ?? ""}
          onChange={e => set("transport_route", e.target.value)} placeholder={t("sap.ph_transport")} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">{t("sap.components_label")}</label>
        <div className="flex flex-wrap gap-1.5">
          {SAP_COMPONENTS.map(comp => {
            const active = (meta.components ?? []).includes(comp);
            return (
              <button key={comp} type="button" onClick={() => toggleComp(comp)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"}`}>
                {comp}
              </button>
            );
          })}
        </div>
      </div>
      {(dbType === "sap_gui" || dbType === "sap_rfc") && (
        <div className="grid grid-cols-2 gap-3">
          <Input label={t("sap.logon_group_label")} value={meta.logon_group ?? ""}
            onChange={e => set("logon_group", e.target.value)} placeholder="PUBLIC" />
          <Input label={t("sap.message_server_label")} value={meta.message_server ?? ""}
            onChange={e => set("message_server", e.target.value)} placeholder={t("sap.ph_message_server")} />
        </div>
      )}
      {dbType === "sap_rfc" && (
        <Input label={t("sap.rfc_dest_label")} value={meta.rfc_destination ?? ""}
          onChange={e => set("rfc_destination", e.target.value)} placeholder="TECHCASE_RFC" />
      )}
    </div>
  );
}

function SapProfileBadges({ meta = {} }) {
  const { t } = useT();
  if (!meta.system_role && !meta.sap_product && !meta.components?.length) return null;
  const roleColors = {
    DEV: "bg-blue-100 text-blue-700", QAS: "bg-amber-100 text-amber-700",
    PRD: "bg-red-100 text-red-700", SBX: "bg-gray-100 text-gray-600", TRN: "bg-purple-100 text-purple-700",
  };
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5 items-center">
        {meta.system_role && <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${roleColors[meta.system_role] ?? "bg-gray-100 text-gray-600"}`}>{meta.system_role}</span>}
        {meta.sap_product && <span className="text-xs text-gray-600">{meta.sap_product}{meta.sap_release ? ` ${meta.sap_release}` : ""}</span>}
        {meta.basis_release && <span className="text-xs text-gray-400">{t("sap.basis_prefix").replace("{n}", meta.basis_release)}</span>}
        {meta.language && meta.language !== "EN" && <span className="text-xs text-gray-400">{meta.language}</span>}
      </div>
      {meta.components?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.components.map(c => <span key={c} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{c}</span>)}
        </div>
      )}
      {meta.transport_route && <p className="text-xs text-gray-400 font-mono">{t("sap.route_prefix").replace("{n}", meta.transport_route)}</p>}
      {meta.logon_group && <p className="text-xs text-gray-400">{t("sap.logon_group").replace("{n}", meta.logon_group)}</p>}
    </div>
  );
}

function DbConnectionsList({ client, auth }) {
  const { t } = useT();
  const { connections, addConnection, deleteConnection } = useDbConnections(client.id);
  const [showAdd, setShowAdd] = useState(false);
  const defaultForm = { db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "", meta: {} };
  const [form, setForm]       = useState(defaultForm);
  const [saving, setSaving]   = useState(false);

  const isSapType = ty => ["sap_gui","sap_hana","sap_rfc","sap_odata"].includes(ty);
  const isVpnType = ty => ty === "vpn";

  function handleTypeChange(ty) {
    const defaultPorts = { postgresql: 5432, mysql: 3306, mssql: 1433, oracle: 1521, mongodb: 27017, sap_hana: 39015, sap_gui: 3200, sap_rfc: 3300, sap_odata: 443, vpn: 1194 };
    setForm(p => ({ ...p, db_type: ty, port: defaultPorts[ty] ?? p.port, meta: {} }));
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

  const CONN_COLORS = {
    postgresql: "bg-blue-100 text-blue-700", mysql: "bg-orange-100 text-orange-700",
    mssql: "bg-red-100 text-red-700", oracle: "bg-red-100 text-red-700",
    mongodb: "bg-green-100 text-green-700",
    sap_gui: "bg-indigo-100 text-indigo-700", sap_hana: "bg-cyan-100 text-cyan-700",
    sap_rfc: "bg-purple-100 text-purple-700", sap_odata: "bg-teal-100 text-teal-700",
    vpn: "bg-slate-100 text-slate-700", other: "bg-gray-100 text-gray-700",
  };
  const CONN_LABELS = {
    postgresql: "PostgreSQL", mysql: "MySQL", mssql: "MSSQL", oracle: "Oracle",
    mongodb: "MongoDB", sap_gui: "SAP GUI", sap_hana: "SAP HANA",
    sap_rfc: "SAP RFC", sap_odata: "SAP OData", vpn: "VPN", other: "Other",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{connections.length === 1 ? t("conn.count_one") : t("conn.count_many").replace("{n}", connections.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setShowAdd(p => !p)}
            className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
            {t("conn.add_btn")}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("conn.type_label")}</label>
              <select value={form.db_type} onChange={e => handleTypeChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <optgroup label={t("conn.group_databases")}>
                  {["postgresql","mysql","mssql","oracle","mongodb","other"].map(ty => (
                    <option key={ty} value={ty}>{CONN_LABELS[ty]}</option>
                  ))}
                </optgroup>
                <optgroup label="SAP">
                  {["sap_gui","sap_hana","sap_rfc","sap_odata"].map(ty => (
                    <option key={ty} value={ty}>{CONN_LABELS[ty]}</option>
                  ))}
                </optgroup>
                <optgroup label={t("conn.group_network")}>
                  <option value="vpn">VPN</option>
                </optgroup>
              </select>
            </div>
            <Input label={isSapType(form.db_type) ? t("conn.app_server") : isVpnType(form.db_type) ? t("conn.vpn_host") : t("conn.host_server")}
              value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
              placeholder={isSapType(form.db_type) ? "saphost.example.com" : "host.example.com"} />
          </div>

          {/* Standard DB fields */}
          {!isSapType(form.db_type) && !isVpnType(form.db_type) && (
            <div className="grid grid-cols-3 gap-3">
              <Input label={t("label.port")} type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} />
              <Input label={t("conn.db_name_label")} value={form.db_name} onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} />
              <Input label={t("label.username")} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
          )}

          {/* SAP GUI / RFC fields */}
          {(form.db_type === "sap_gui" || form.db_type === "sap_rfc") && (
            <div className="grid grid-cols-4 gap-3">
              <Input label={t("conn.sys_number")} type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="00" />
              <Input label={t("conn.sys_id")} value={form.db_name} onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} placeholder="PRD" />
              <Input label={t("conn.sap_client")} value={form.meta?.sap_client ?? ""} onChange={e => setForm(p => ({ ...p, meta: { ...p.meta, sap_client: e.target.value } }))} placeholder="100" />
              <Input label={t("label.username")} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
          )}

          {/* SAP HANA fields */}
          {form.db_type === "sap_hana" && (
            <div className="grid grid-cols-3 gap-3">
              <Input label={t("label.port")} type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="39015" />
              <Input label={t("conn.db_schema")} value={form.db_name} onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} />
              <Input label={t("label.username")} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
          )}

          {/* SAP OData fields */}
          {form.db_type === "sap_odata" && (
            <div className="grid grid-cols-3 gap-3">
              <Input label={t("label.port")} type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="443" />
              <Input label={t("conn.service_path")} value={form.db_name} onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} placeholder="/sap/opu/odata/sap/..." />
              <Input label={t("conn.username_oauth")} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
          )}

          {/* SAP system profile */}
          {isSapType(form.db_type) && (
            <SapProfileFields meta={form.meta} onChange={meta => setForm(p => ({ ...p, meta }))} dbType={form.db_type} />
          )}

          {/* VPN fields */}
          {isVpnType(form.db_type) && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("conn.vpn_protocol")}</label>
                <select value={form.meta?.vpn_protocol ?? "OpenVPN"}
                  onChange={e => setForm(p => ({ ...p, meta: { ...p.meta, vpn_protocol: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {["OpenVPN","IPSec/IKEv2","WireGuard","SSL/TLS","PPTP","L2TP"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <Input label={t("label.port")} type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="1194" />
              <Input label={t("conn.profile_label")} value={form.db_name} onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} placeholder={t("conn.ph_vpn_profile")} />
            </div>
          )}

          <Textarea label={t("label.notes")} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder={isSapType(form.db_type) ? t("conn.ph_access_vpn") : isVpnType(form.db_type) ? t("conn.ph_access_pki") : t("conn.ph_access_other")} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("state.adding") : t("conn.add_action")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {connections.map(conn => (
          <div key={conn.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={CONN_COLORS[conn.db_type] ?? CONN_COLORS.other}>{CONN_LABELS[conn.db_type] ?? conn.db_type?.toUpperCase()}</Badge>
                <span className="font-mono text-sm text-gray-800">
                  {isSapType(conn.db_type) ? (conn.db_name || conn.host) : isVpnType(conn.db_type) ? (conn.db_name || conn.host) : conn.db_name}
                </span>
                {conn.meta?.sap_client && <span className="text-xs text-gray-500 font-mono">{t("conn.sap_client_num").replace("{n}", conn.meta.sap_client)}</span>}
                {conn.meta?.vpn_protocol && <span className="text-xs text-indigo-500 font-mono">{conn.meta.vpn_protocol}</span>}
              </div>
              {(auth.isAdmin || auth.isManager) && (
                <button onClick={() => deleteConnection(conn.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-100 hover:bg-red-50">
                  {t("action.remove")}
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 font-mono">
              {conn.username && <span>{conn.username}@</span>}{conn.host}{conn.port ? `:${conn.port}` : ""}
              {isSapType(conn.db_type) && conn.db_name && conn.db_name !== conn.host && <span className="ml-2 text-gray-400">SID: {conn.db_name}</span>}
            </div>
            {isSapType(conn.db_type) && <SapProfileBadges meta={conn.meta ?? {}} />}
            {conn.notes && <p className="text-xs text-gray-400 mt-2">{conn.notes}</p>}
          </div>
        ))}
        {connections.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <div className="mb-2 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
            <p className="text-sm">{t("conn.none")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CLIENT TEAM MEMBERS VIEW
// ============================================================
function ClientTeamView({ auth }) {
  const { t } = useT();
  const [clients, setClients]           = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      let clientId = auth.isClient ? auth.user?.id : null;
      if (clientId) {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)").eq("id", clientId).single();
        if (data) { setClients([data]); setSelectedClient(data); }
      } else {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)")
          .eq("role", "client").order("full_name");
        setClients(data ?? []);
      }
      setLoadingClients(false);
    })();
  }, [auth]);

  if (loadingClients) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("team.page_title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("team.page_subtitle")}</p>
      </div>

      <div className={`grid gap-6 ${auth.isClient ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        {!auth.isClient && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("label.clients")}</div>
            <div className="space-y-1">
              {clients.map(c => (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                  <div className="text-xs text-gray-400">{c.email}</div>
                </button>
              ))}
              {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t("team.no_clients")}</p>}
            </div>
          </div>
        )}

        <div className={auth.isClient ? "" : "lg:col-span-2"}>
          {selectedClient
            ? <ClientTeamList client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="mb-3 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
                <p>{t("team.select_client")}</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function ClientTeamList({ client, auth }) {
  const { t } = useT();
  const { members, addMember, updateMember, removeMember } = useClientTeamMembers(client.id);
  const [showAdd, setShowAdd]      = useState(false);
  const [form, setForm]            = useState({ full_name: "", email: "", role_title: "", phone: "", is_primary: false, system_role: "" });
  const [saving, setSaving]        = useState(false);
  const [editingId, setEditingId]  = useState(null);
  const [editForm, setEditForm]    = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [memberStatusMap, setMemberStatusMap] = useState({});

  useEffect(() => {
    if (!members.length) { setMemberStatusMap({}); return; }
    const emails = members.map(m => m.email).filter(Boolean);
    if (!emails.length) return;
    supabase.from("users").select("email, verification_status").in("email", emails)
      .then(({ data }) => {
        const map = {};
        (data ?? []).forEach(u => { map[u.email.toLowerCase()] = u.verification_status; });
        setMemberStatusMap(map);
      });
  }, [members]);

  async function handleAdd() {
    if (!form.full_name || !form.email) return;
    setSaving(true);
    try {
      await addMember(form);
      setForm({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
      setShowAdd(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditForm({ full_name: m.full_name ?? "", email: m.email ?? "", role_title: m.role_title ?? "", phone: m.phone ?? "", is_primary: m.is_primary ?? false, system_role: m.system_role ?? "" });
    setShowAdd(false);
  }

  async function handleSaveEdit() {
    if (!editForm.full_name || !editForm.email) return;
    setSavingEdit(true);
    try { await updateMember(editingId, editForm); setEditingId(null); }
    catch (e) { alert(e.message); }
    setSavingEdit(false);
  }

  async function handleRemove(id) {
    if (!confirm("Remove this team member?")) return;
    try { await removeMember(id); } catch (e) { alert(e.message); }
  }

  function SignupStatusIcon({ email }) {
    if (!email) return null;
    const status = memberStatusMap[email.toLowerCase()];
    if (status === undefined) {
      return (
        <span title="Not signed up yet" className="text-gray-300 flex-shrink-0">
          <Clock size={14} />
        </span>
      );
    }
    if (status === "approved") {
      return (
        <span title="Approved" className="text-green-500 flex-shrink-0">
          <CheckCircle2 size={14} />
        </span>
      );
    }
    if (status === "pending") {
      return (
        <span title="Pending approval" className="text-amber-400 flex-shrink-0">
          <Clock size={14} />
        </span>
      );
    }
    if (status === "rejected") {
      return (
        <span title="Rejected" className="text-red-400 flex-shrink-0">
          <XCircle size={14} />
        </span>
      );
    }
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{members.length === 1 ? t("team.count_one") : t("team.count_many").replace("{n}", members.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setShowAdd(p => !p)}
            className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
            {t("team.add_btn")}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("team.name_label")} value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
            <Input label={t("team.email_label")} type="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Job Title" value={form.role_title}
              onChange={e => setForm(p => ({ ...p, role_title: e.target.value }))} placeholder={t("contact.ph_role_title")} />
            <Input label={t("team.phone_label")} value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder={t("contact.ph_phone")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
            <select value={form.system_role}
              onChange={e => setForm(p => ({ ...p, system_role: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— No system role —</option>
              <option value="key_user">Key User</option>
              <option value="final_user">Final User</option>
              <option value="internal_consultant">Internal Consultant</option>
              <option value="project_manager">Project Manager</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_primary}
              onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))}
              className="rounded accent-blue-600" />
            {t("team.primary_label")}
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("team.adding") : t("team.add_action")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members.map(m => (
          <div key={m.id} className="border border-gray-100 rounded-xl p-4">
            {editingId === m.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input label={t("team.name_label")} value={editForm.full_name}
                    onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
                  <Input label={t("team.email_label")} type="email" value={editForm.email}
                    onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Job Title" value={editForm.role_title}
                    onChange={e => setEditForm(p => ({ ...p, role_title: e.target.value }))} placeholder={t("contact.ph_role_title")} />
                  <Input label={t("team.phone_label")} value={editForm.phone}
                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder={t("contact.ph_phone")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
                  <select value={editForm.system_role ?? ""}
                    onChange={e => setEditForm(p => ({ ...p, system_role: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— No system role —</option>
                    <option value="key_user">Key User</option>
                    <option value="final_user">Final User</option>
                    <option value="internal_consultant">Internal Consultant</option>
                    <option value="project_manager">Project Manager</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editForm.is_primary}
                    onChange={e => setEditForm(p => ({ ...p, is_primary: e.target.checked }))}
                    className="rounded accent-blue-600" />
                  {t("team.primary_label")}
                </label>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">{t("action.cancel")}</button>
                  <button onClick={handleSaveEdit} disabled={savingEdit}
                    className="px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {savingEdit ? t("action.saving") : t("action.save")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {m.full_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">{m.full_name}</span>
                      <SignupStatusIcon email={m.email} />
                      {m.is_primary && <Badge className="bg-blue-100 text-blue-700">{t("team.primary_badge")}</Badge>}
                      {m.system_role === "key_user"            && <Badge className="bg-indigo-100 text-indigo-700">Key User</Badge>}
                      {m.system_role === "final_user"          && <Badge className="bg-teal-100 text-teal-700">Final User</Badge>}
                      {m.system_role === "internal_consultant" && <Badge className="bg-indigo-100 text-indigo-700">Internal Consultant</Badge>}
                      {m.system_role === "project_manager"     && <Badge className="bg-rose-100 text-rose-700">Project Manager</Badge>}
                    </div>
                    {m.role_title && <div className="text-xs text-gray-500">{m.role_title}</div>}
                  </div>
                  {(auth.isAdmin || auth.isManager) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(m)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleRemove(m.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  {m.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{m.email}</div>}
                  {m.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{m.phone}</div>}
                </div>
              </>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">
            <div className="mb-2 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
            <p className="text-sm">{t("team.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ============================================================
// LIFECYCLE SETTINGS VIEW (admin/manager global page)
// ============================================================
function LifecycleSettingsView({ auth }) {
  const { t } = useT();
  const { templates, loadingTmpl, fetchTemplates } = useLifecycleTemplates();
  const [selected, setSelected] = useState(null);
  const [editStages, setEditStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [viewTmpl, setViewTmpl] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [activeStageIdx, setActiveStageIdx] = useState(0);

  function startEdit(tmpl) { setSelected(tmpl); setEditStages(tmpl.stages.map(s => ({ ...s }))); setActiveStageIdx(0); }
  function cancelEdit() { setSelected(null); setEditStages([]); }
  function addStage() {
    setEditStages(p => {
      const next = [...p, { key: `s${Date.now()}`, label: t("lc.new_stage_label"), color: "#6b7280", is_terminal: false, allowed_next: [], allowed_roles: [] }];
      setActiveStageIdx(next.length - 1);
      return next;
    });
  }
  function removeStage(i) {
    setEditStages(p => {
      const next = p.filter((_, j) => j !== i);
      setActiveStageIdx(prev => Math.min(prev, Math.max(0, next.length - 1)));
      return next;
    });
  }
  function moveStage(i, d) {
    setEditStages(p => {
      const n = [...p]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x);
      setActiveStageIdx(i + d);
      return n;
    });
  }
  function updateStage(i, u) { setEditStages(p => p.map((s, j) => j === i ? { ...s, ...u } : s)); }

  function toggleRole(i, role) {
    const cur = editStages[i].allowed_roles ?? [];
    updateStage(i, { allowed_roles: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] });
  }
  function toggleNext(i, key) {
    const cur = editStages[i].allowed_next ?? [];
    updateStage(i, { allowed_next: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
  }
  function setInitialStage(i) {
    setEditStages(p => p.map((s, j) => ({ ...s, is_initial: j === i })));
  }
  function cycleTrigger(i) {
    const cur = editStages[i].trigger ?? "manual";
    const next = cur === "manual" ? "auto" : cur === "auto" ? "both" : "manual";
    updateStage(i, { trigger: next });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase.from("lifecycle_templates")
        .update({ stages: editStages, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (error) throw error;
      await fetchTemplates();
      setSelected(null);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("lifecycle_templates").insert({
        name,
        description: newDesc.trim() || null,
        key: name.toLowerCase().replace(/\s+/g, "_"),
        stages: LIFECYCLE_PRESETS.standard.stages,
        is_active: true,
        sort_order: templates.length + 1,
      });
      if (error) throw error;
      await fetchTemplates();
      setCreating(false); setNewName(""); setNewDesc("");
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleDelete(tmpl) {
    if (!window.confirm(t("cd.confirm_delete_tmpl").replace("{n}", tmpl.name))) return;
    try {
      const { error } = await supabase.from("lifecycle_templates").delete().eq("id", tmpl.id);
      if (error) throw error;
      await fetchTemplates();
      if (viewTmpl?.id === tmpl.id) setViewTmpl(null);
    } catch (e) { alert(e.message); }
  }

  useEffect(() => {
    if (!templates.length) return;
    if (viewTmpl) {
      const fresh = templates.find(t => t.id === viewTmpl.id);
      if (fresh) setViewTmpl(fresh);
    } else {
      setViewTmpl(templates[0]);
    }
  }, [templates]);

  if (loadingTmpl) return <div className="p-8 text-sm text-gray-400">{t("label.loading")}</div>;

  const ROLES = [
    { key: "manager",    label: t("auth.role_manager"),    color: "#1d4ed8", bg: "#dbeafe" },
    { key: "consultant", label: t("auth.role_consultant"), color: "#065f46", bg: "#d1fae5" },
    { key: "client",     label: t("auth.role_client"),     color: "#92400e", bg: "#fef3c7" },
    { key: "key_user",   label: t("auth.role_key_user"),   color: "#5b21b6", bg: "#ede9fe" },
  ];

  const ALL_TABS = [
    { id: "detail",       label: t("lc.tab_detail") },
    { id: "activities",   label: t("lc.tab_activities") },
    { id: "milestones",   label: t("lc.tab_milestones") },
    { id: "comments",     label: t("lc.tab_comments") },
    { id: "subcases",     label: t("lc.tab_subcases") },
    { id: "documents",    label: t("lc.tab_docs") },
    { id: "time",         label: t("lc.tab_time") },
    { id: "applications", label: t("lc.tab_applicants") },
    { id: "lifecycle",    label: t("lc.tab_lifecycle") },
    { id: "spec",         label: t("lc.tab_spec") },
  ];

  const ACTION_RULES = [
    { key: "editable",                       label: t("lc.rule_edit") },
    { key: "can_log_time",                   label: t("lc.rule_time") },
    { key: "can_add_activities",             label: t("lc.rule_activities") },
    { key: "can_comment",                    label: t("lc.rule_comments") },
    { key: "can_upload_docs",                label: t("lc.rule_docs") },
    { key: "can_edit_activity_phase",        label: t("lc.rule_act_phase") },
    { key: "can_edit_activity_predecessors", label: t("lc.rule_act_predecessors") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("lc.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("lc.page_desc")}</p>
        </div>
        {!selected && !creating && (
          <button onClick={() => setCreating(true)}
            className="flex-shrink-0 px-4 py-2 bg-[#1A4B8C] hover:bg-blue-900 text-white text-sm font-semibold rounded-xl">
            {t("lc.new_btn")}
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">{t("lc.create_title")}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.name")}</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={t("lc.ph_template_name")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.description")}</label>
              <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder={t("label.ph_optional_desc")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <p className="text-xs text-gray-400">{t("lc.create_hint")}</p>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="text-sm text-gray-400 hover:text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleCreate} disabled={!newName.trim() || saving}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {saving ? t("state.creating") : t("lc.create_btn")}
            </button>
          </div>
        </div>
      )}

      {selected ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{selected.name}</h3>
              <p className="text-sm text-gray-500">{selected.description}</p>
            </div>
            <button onClick={cancelEdit} className="text-sm text-gray-400 hover:text-gray-600">{t("action.cancel")}</button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("lc.stages_title")}</p>
              <button onClick={addStage}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                {t("lc.add_stage")}
              </button>
            </div>

            {/* Stage tab bar — same tile pattern as case detail */}
            <div className="flex flex-wrap gap-2">
              {editStages.map((s, i) => (
                <button key={i} onClick={() => setActiveStageIdx(i)}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all min-w-[76px] ${
                    activeStageIdx === i
                      ? "border-[#1A4B8C] bg-[#1A4B8C] text-white shadow-md"
                      : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  }`}>
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-white/40"
                    style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-center leading-tight">{s.label || t("lifecycle.stage_lbl")}</span>
                  {(s.is_terminal || s.is_initial) && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeStageIdx === i ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.is_initial ? t("lc.initial") : t("lc.terminal")}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Single stage editor panel */}
            {editStages[activeStageIdx] && (() => {
              const stage = editStages[activeStageIdx];
              const idx   = activeStageIdx;
              return (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
                  {/* Row 1: color, label, type, move, delete */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="color" value={stage.color}
                      onChange={e => updateStage(idx, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg cursor-pointer border border-gray-200 p-0.5 bg-white flex-shrink-0" />
                    <input type="text" value={stage.label}
                      onChange={e => updateStage(idx, { label: e.target.value })}
                      className="flex-1 text-sm font-semibold bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      placeholder={t("lc.stage_name_ph")} />
                    <select value={stage.is_terminal ? "terminal" : "active"}
                      onChange={e => updateStage(idx, { is_terminal: e.target.value === "terminal", ...(e.target.value === "terminal" ? { allowed_next: [], allowed_roles: [], is_initial: false } : {}) })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none flex-shrink-0">
                      <option value="active">{t("lc.stage_active")}</option>
                      <option value="terminal">{t("lc.terminal")}</option>
                    </select>
                    {!stage.is_terminal && (
                      <>
                        <button onClick={() => setInitialStage(idx)}
                          title={t("lc.initial_status_tooltip")}
                          className={`text-xs px-2 py-1.5 rounded-lg border font-semibold transition-colors flex-shrink-0 ${
                            stage.is_initial
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-600"
                          }`}>
                          {t("lc.initial")}
                        </button>
                        <button onClick={() => cycleTrigger(idx)}
                          title={t("lc.entry_tooltip")}
                          className={`text-xs px-2 py-1.5 rounded-lg border font-semibold transition-colors flex-shrink-0 ${
                            (stage.trigger ?? "manual") === "auto"
                              ? "bg-purple-50 text-purple-700 border-purple-300"
                              : (stage.trigger ?? "manual") === "both"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                          }`}>
                          {(stage.trigger ?? "manual") === "auto" ? t("lc.trigger_auto") : (stage.trigger ?? "manual") === "both" ? t("lc.trigger_both") : t("lc.trigger_manual")}
                        </button>
                      </>
                    )}
                    <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-6 text-center flex-shrink-0 font-bold">↑</button>
                    <button onClick={() => moveStage(idx, 1)} disabled={idx === editStages.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-6 text-center flex-shrink-0 font-bold">↓</button>
                    <button onClick={() => removeStage(idx)}
                      className="text-red-300 hover:text-red-500 w-6 text-center flex-shrink-0 text-lg leading-none">×</button>
                  </div>

                  {/* Roles + allowed_next + access rules (only for active stages) */}
                  {!stage.is_terminal && (
                    <div className="space-y-3">
                      {/* Roles */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{t("cs.step_roles")}</span>
                        {ROLES.map(r => {
                          const on = (stage.allowed_roles ?? []).includes(r.key);
                          return (
                            <button key={r.key} onClick={() => toggleRole(idx, r.key)}
                              className="text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors"
                              style={on
                                ? { backgroundColor: r.bg, color: r.color, borderColor: r.bg }
                                : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                              {r.label}
                            </button>
                          );
                        })}
                        {!(stage.allowed_roles ?? []).length && (
                          <span className="text-[10px] text-gray-400 italic">{t("lc.any_role")}</span>
                        )}
                      </div>

                      {/* Next → */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0 pt-0.5">{t("lc.next_arrow")}</span>
                        <div className="flex flex-wrap gap-1">
                          {editStages.filter((_, j) => j !== idx).map(s => {
                            const on = (stage.allowed_next ?? []).includes(s.key);
                            return (
                              <button key={s.key} onClick={() => toggleNext(idx, s.key)}
                                className="text-[11px] px-2 py-0.5 rounded-full font-semibold border transition-colors"
                                style={on
                                  ? { backgroundColor: s.color + "22", color: s.color, borderColor: s.color + "55" }
                                  : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                                {s.label || s.key}
                              </button>
                            );
                          })}
                          {!(stage.allowed_next ?? []).length && (
                            <span className="text-[10px] text-gray-400 italic">{t("lc.any_stage")}</span>
                          )}
                        </div>
                      </div>

                      {/* Access Rules */}
                      <div className="pt-3 border-t border-gray-200 space-y-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block">{t("lc.access_rules")}</span>

                        {/* Action toggles */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0">{t("lc.allow")}</span>
                          {ACTION_RULES.map(({ key, label }) => {
                            const allowed = stage.rules?.[key] ?? true;
                            return (
                              <button key={key}
                                onClick={() => updateStage(idx, { rules: { ...(stage.rules ?? {}), [key]: !allowed } })}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                  allowed
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-red-50 text-red-500 border-red-200"
                                }`}>
                                {allowed ? <Check size={12} className="inline" /> : <X size={12} className="inline" />} {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Tab order + visibility */}
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0 pt-1">{t("lc.tabs")}</span>
                          <div className="flex-1 flex flex-col gap-1.5">
                            {(() => {
                              const visibleIds = stage.rules?.visible_tabs ?? ALL_TABS.map(x => x.id);
                              const savedOrder = stage.rules?.tab_order ?? [];
                              const orderedIds = [
                                ...savedOrder.filter(id => visibleIds.includes(id)),
                                ...visibleIds.filter(id => !savedOrder.includes(id)),
                              ];
                              const hiddenTabs = ALL_TABS.filter(tb => !orderedIds.includes(tb.id));

                              function moveTab(i, dir) {
                                const next = [...orderedIds];
                                const j = i + dir;
                                if (j < 0 || j >= next.length) return;
                                [next[i], next[j]] = [next[j], next[i]];
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }
                              function removeTab(tabId) {
                                const next = orderedIds.filter(id => id !== tabId);
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }
                              function addTab(tabId) {
                                const next = [...orderedIds, tabId];
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }

                              return (
                                <>
                                  {orderedIds.map((tabId, i) => {
                                    const tb = ALL_TABS.find(t => t.id === tabId);
                                    if (!tb) return null;
                                    return (
                                      <div key={tabId} className="flex items-center gap-1">
                                        <span className="text-[9px] font-bold text-gray-300 w-3.5 text-right flex-shrink-0">{i+1}</span>
                                        <span className="flex-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">{tb.label}</span>
                                        <button onClick={() => moveTab(i,-1)} disabled={i===0} className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronUp size={11}/></button>
                                        <button onClick={() => moveTab(i, 1)} disabled={i===orderedIds.length-1} className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronDown size={11}/></button>
                                        <button onClick={() => removeTab(tabId)} className="w-5 h-5 flex items-center justify-center rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={9}/></button>
                                      </div>
                                    );
                                  })}
                                  {hiddenTabs.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-0.5">
                                      {hiddenTabs.map(tb => (
                                        <button key={tb.id} onClick={() => addTab(tb.id)}
                                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                                          + {tb.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Bypass roles */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0">{t("lc.bypass")}</span>
                          {["admin", "manager", "consultant", "client"].map(role => {
                            const bypass = stage.rules?.bypass_roles ?? ["admin", "manager"];
                            const on = bypass.includes(role);
                            return (
                              <button key={role}
                                onClick={() => {
                                  const cur = stage.rules?.bypass_roles ?? ["admin", "manager"];
                                  const next = on ? cur.filter(r => r !== role) : [...cur, role];
                                  updateStage(idx, { rules: { ...(stage.rules ?? {}), bypass_roles: next } });
                                }}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                  on ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-gray-400 border-gray-200"
                                }`}>
                                {ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : cap(role)}
                              </button>
                            );
                          })}
                          <span className="text-[10px] text-gray-400 italic">{t("lc.bypass_hint")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {saving ? t("state.saving") : t("lc.save_template")}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex" style={{ minHeight: 420 }}>
          {/* Left sidebar — template list */}
          <div className="w-48 flex-shrink-0 border-r border-gray-100 flex flex-col py-2">
            {templates.map(tmpl => (
              <div key={tmpl.id}
                className={`group flex items-start gap-1 pr-2 transition-colors ${viewTmpl?.id === tmpl.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <button onClick={() => setViewTmpl(tmpl)} className="flex-1 text-left px-4 py-3 min-w-0">
                  <div className={`font-semibold text-sm ${viewTmpl?.id === tmpl.id ? "text-blue-700" : "text-gray-800"}`}>{tmpl.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-tight">{tmpl.description}</div>
                </button>
                <button onClick={() => handleDelete(tmpl)}
                  title={t("label.delete_template")}
                  className="opacity-0 group-hover:opacity-100 mt-3 text-red-300 hover:text-red-500 text-base leading-none flex-shrink-0 px-1">
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Right panel — vertical flow */}
          {viewTmpl && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-lg">{viewTmpl.name} Lifecycle</h3>
                    {viewTmpl.subtitle && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{viewTmpl.subtitle}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{viewTmpl.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button onClick={() => startEdit(viewTmpl)}
                    className="px-4 py-1.5 bg-[#1A4B8C] hover:bg-blue-900 text-white text-sm font-semibold rounded-xl">
                    <Pencil size={13} className="mr-1 inline" />{t("lc.edit_stages")}
                  </button>
                  <button onClick={() => handleDelete(viewTmpl)}
                    className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold rounded-xl">
                    {t("action.delete")}
                  </button>
                </div>
              </div>

              <div className="max-w-md">
                {viewTmpl.stages.map((s, i) => (
                  <Fragment key={s.key}>
                    {i > 0 && (
                      <div className="ml-[18px] flex flex-col" style={{ gap: 0 }}>
                        <div className="w-px h-4 bg-gray-200 self-start ml-px" />
                        <div className="self-start ml-[-3px]" style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #d1d5db" }} />
                      </div>
                    )}
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold text-gray-900 text-sm flex-1">{s.label}</span>
                      {s.is_terminal ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          {t("lc.terminal")}
                        </span>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          {(s.allowed_roles ?? []).length === 0
                            ? <span className="text-[10px] text-gray-400 italic">{t("lc.any_role")}</span>
                            : (s.allowed_roles ?? []).map(r => {
                                const rm = ROLES.find(x => x.key === r);
                                if (!rm) return null;
                                return (
                                  <span key={r} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: rm.bg, color: rm.color }}>
                                    {rm.label}
                                  </span>
                                );
                              })}
                        </div>
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// CLIENT PROFILE VIEW
// ============================================================
const CASE_DEFAULTS_EMPTY = {
  priority: "medium", area_sap: "", area_industry: "", is_confidential: false, nda_required: false,
  description: "", sla: "standard", budget: "", work_mode: "remote", skills: "",
  travel_required: false, work_location: "", min_years_experience: "",
  languages_required: [], security_clearance: false, interview_required: false,
  interview_format: "video", interview_rounds: 1, technical_assessment: false,
};

function CaseDefaultsPanel({ profile, updateProfile }) {
  const { t } = useT();
  const { settings: catalogSettings } = useSystemSettings();
  const [form, setForm]   = useState(CASE_DEFAULTS_EMPTY);
  const [saving, setSaving] = useState(false);
  const [langInput, setLangInput] = useState("");

  useEffect(() => {
    const d = profile?.case_defaults ?? {};
    setForm({
      priority:             d.priority             ?? "medium",
      area_sap:             d.area_sap             ?? "",
      area_industry:        d.area_industry        ?? "",
      is_confidential:      d.is_confidential      ?? false,
      nda_required:         d.nda_required         ?? false,
      description:          d.description          ?? "",
      sla:                  d.sla                  ?? "standard",
      budget:               d.budget               ?? "",
      work_mode:            d.work_mode            ?? "remote",
      skills:               d.skills               ?? "",
      travel_required:      d.travel_required      ?? false,
      work_location:        d.work_location        ?? "",
      min_years_experience: d.min_years_experience ?? "",
      languages_required:   d.languages_required   ?? [],
      security_clearance:   d.security_clearance   ?? false,
      interview_required:   d.interview_required   ?? false,
      interview_format:     d.interview_format     ?? "video",
      interview_rounds:     d.interview_rounds     ?? 1,
      technical_assessment: d.technical_assessment ?? false,
    });
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try { await updateProfile({ case_defaults: form }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  function addLang(val) {
    const v = val.trim();
    if (!v || form.languages_required.includes(v)) return;
    setForm(p => ({ ...p, languages_required: [...p.languages_required, v] }));
    setLangInput("");
  }

  const sectionHdr = txt => (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{txt}</p>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <h2 className="font-bold text-gray-900">{t("cd.title")}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{t("cd.subtitle")}</p>
      </div>

      {/* Case Info defaults */}
      <div>
        {sectionHdr(t("cd.section_info"))}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("cd.default_priority")} value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              options={["low","medium","high","critical"].map(v => ({ value: v, label: PRIORITY_LABEL_KEYS[v] ? t(PRIORITY_LABEL_KEYS[v]) : cap(v) }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_sap_area")}</label>
              <select value={form.area_sap} onChange={e => setForm(p => ({ ...p, area_sap: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">{t("cd.none")}</option>
                {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_industry")}</label>
            <select value={form.area_industry} onChange={e => setForm(p => ({ ...p, area_industry: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("cd.none")}</option>
              {(catalogSettings?.["catalog_industries"] ?? INDUSTRY_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <Textarea label={t("cd.default_desc_tmpl")} value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder={t("cd.desc_tmpl_ph")} />
          <div className="flex gap-6">
            {[["is_confidential", t("cd.private_default")],["nda_required", t("cd.nda_default")]].map(([k,lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Scope defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_scope"))}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_sla")}</label>
              <select value={form.sla} onChange={e => setForm(p => ({ ...p, sla: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SLA_PRESETS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
              </select>
            </div>
            <Input label={t("cd.default_budget")} type="number" value={form.budget}
              onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder={t("case.ph_budget_num")} />
          </div>
          <Input label={t("cd.default_skills")} value={form.skills}
            onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
            placeholder={t("label.ph_skills")} />
        </div>
      </div>

      {/* Work arrangement defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_work"))}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "remote", label: t("cd.mode_remote"),  desc: t("cd.mode_remote_desc") },
              { value: "onsite", label: t("cd.mode_onsite"),  desc: t("cd.mode_onsite_desc") },
              { value: "hybrid", label: t("cd.mode_hybrid"),  desc: t("cd.mode_hybrid_desc") },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => setForm(p => ({ ...p, work_mode: opt.value }))}
                className={`text-left p-3 border-2 rounded-xl transition-all ${form.work_mode === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {(form.work_mode === "onsite" || form.work_mode === "hybrid") && (
            <Input label={t("cd.default_location")} value={form.work_location}
              onChange={e => setForm(p => ({ ...p, work_location: e.target.value }))} placeholder={t("case.ph_location_eg")} />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.travel_required} onChange={e => setForm(p => ({ ...p, travel_required: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.travel_default")}
          </label>
        </div>
      </div>

      {/* Qualifications defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_qual"))}
        <div className="space-y-3">
          <Input label={t("cd.min_years")} type="number" value={form.min_years_experience}
            onChange={e => setForm(p => ({ ...p, min_years_experience: e.target.value }))} placeholder={t("proj.ph_n_eg")} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_langs")}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.languages_required.map(l => (
                <span key={l} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {l}
                  <button onClick={() => setForm(p => ({ ...p, languages_required: p.languages_required.filter(x => x !== l) }))}
                    className="hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
            </div>
            <input value={langInput} onChange={e => setLangInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLang(langInput); } }}
              placeholder={t("cd.lang_ph")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.security_clearance} onChange={e => setForm(p => ({ ...p, security_clearance: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.security_default")}
          </label>
        </div>
      </div>

      {/* Interview defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_interview"))}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.interview_required} onChange={e => setForm(p => ({ ...p, interview_required: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.interview_default")}
          </label>
          {form.interview_required && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("cd.default_format")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[["phone", t("cd.fmt_phone")],["video", t("cd.fmt_video")],["in_person", t("cd.fmt_in_person")]].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm(p => ({ ...p, interview_format: v }))}
                      className={`py-2 text-xs font-medium border-2 rounded-xl transition-all ${form.interview_format === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("cd.default_rounds")}</p>
                <div className="flex gap-2">
                  {[1,2,3].map(n => (
                    <button key={n} type="button" onClick={() => setForm(p => ({ ...p, interview_rounds: n }))}
                      className={`w-10 h-10 rounded-xl border-2 text-sm font-bold transition-all ${form.interview_rounds === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.technical_assessment} onChange={e => setForm(p => ({ ...p, technical_assessment: e.target.checked }))} className="rounded accent-blue-600" />
                {t("cd.tech_assess_default")}
              </label>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? t("state.saving") : t("cd.save")}
        </button>
      </div>
    </div>
  );
}

const AS_DEFAULTS = {
  auto_assign_enabled: false, application_window_days: 7, min_applicants: 3,
  require_manager_approval: true, prefer_known_consultants: true,
  allow_new_consultants: true, max_hourly_rate: "", preferred_expertise_level: "any",
  max_overcommitment_tolerance: 0, notify_on_new_application: true, notify_on_auto_assign: true,
  weight_skills: 25, weight_rating: 20, weight_client_familiarity: 15,
  weight_client_rating: 15, weight_experience: 10, weight_rate: 10, weight_commitment: 5,
  start_reminders_enabled: true, start_reminder_1_days: 3, start_reminder_2_days: 1,
  start_overdue_action: "auto_start", start_overdue_grace_hours: 24,
};

function AssignmentSettingsPanel({ profile, updateProfile }) {
  const { t } = useT();
  const [form, setForm] = useState(AS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = profile?.assignment_settings ?? {};
    setForm({ ...AS_DEFAULTS, ...s, max_hourly_rate: s.max_hourly_rate ?? "" });
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        assignment_settings: { ...form, max_hourly_rate: form.max_hourly_rate ? Number(form.max_hourly_rate) : null },
      });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const totalWeight = (form.weight_skills ?? 0) + (form.weight_rating ?? 0) +
    (form.weight_client_familiarity ?? 0) + (form.weight_client_rating ?? 0) +
    (form.weight_experience ?? 0) + (form.weight_rate ?? 0) + (form.weight_commitment ?? 0);

  const sHdr = txt => <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{txt}</p>;

  const Toggle = ({ field, label, desc }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <button type="button" onClick={() => setForm(p => ({ ...p, [field]: !p[field] }))}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${form[field] ? "bg-blue-600" : "bg-gray-300"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <h2 className="font-bold text-gray-900">{t("as.title")}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{t("as.subtitle")}</p>
      </div>

      {/* Auto-assignment */}
      <div>
        {sHdr(t("as.section_auto"))}
        <div className="space-y-3">
          <Toggle field="auto_assign_enabled" label={t("as.auto_enabled")}
            desc={t("as.auto_enabled_desc")} />
          {form.auto_assign_enabled && (
            <div className="pl-4 border-l-2 border-blue-100 space-y-3 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.app_window")}</label>
                  <input type="number" min="1" max="90" value={form.application_window_days}
                    onChange={e => setForm(p => ({ ...p, application_window_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.app_window_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.min_applicants")}</label>
                  <input type="number" min="1" max="20" value={form.min_applicants}
                    onChange={e => setForm(p => ({ ...p, min_applicants: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.min_applicants_desc")}</p>
                </div>
              </div>
              <Toggle field="require_manager_approval" label={t("as.mgr_approval")}
                desc={t("as.mgr_approval_desc")} />
            </div>
          )}
        </div>
      </div>

      {/* Selection preferences */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_pref"))}
        <div className="space-y-3">
          <Toggle field="prefer_known_consultants" label={t("as.prefer_known")}
            desc={t("as.prefer_known_desc")} />
          <Toggle field="allow_new_consultants" label={t("as.allow_new")}
            desc={t("as.allow_new_desc")} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.max_rate")}</label>
              <input type="number" min="0" value={form.max_hourly_rate}
                onChange={e => setForm(p => ({ ...p, max_hourly_rate: e.target.value }))}
                placeholder={t("as.no_cap")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">{t("as.max_rate_desc")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.pref_expertise")}</label>
              <select value={form.preferred_expertise_level}
                onChange={e => setForm(p => ({ ...p, preferred_expertise_level: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[["any","exp.any"],["junior","exp.junior"],["mid","exp.mid"],["senior","exp.senior"],["expert","exp.expert"]].map(([v, k]) => (
                  <option key={v} value={v}>{t(k)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("as.overcommit_label")} — <span className="text-blue-600 font-bold">{form.max_overcommitment_tolerance}%</span>
            </label>
            <input type="range" min="0" max="20" step="5" value={form.max_overcommitment_tolerance}
              onChange={e => setForm(p => ({ ...p, max_overcommitment_tolerance: Number(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{t("as.strict")}</span><span>10%</span><span>{t("as.flexible")}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {form.max_overcommitment_tolerance === 0
                ? t("as.overcommit_zero")
                : t("as.overcommit_nonzero").replace("{n}", form.max_overcommitment_tolerance)}
            </p>
          </div>
        </div>
      </div>

      {/* Scoring weights */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_scoring"))}
        <p className="text-xs text-gray-400 mb-4">
          {t("as.scoring_desc")}
          {" "}<span className={`font-bold ${totalWeight === 100 ? "text-green-600" : "text-blue-600"}`}>{t("as.scoring_total").replace("{n}", totalWeight)}</span>
        </p>
        <div className="space-y-4">
          {[
            ["weight_skills",             t("as.w_skills"),      t("as.w_skills_desc")],
            ["weight_rating",             t("as.w_rating"),      t("as.w_rating_desc")],
            ["weight_client_familiarity", t("as.w_client_fam"),  t("as.w_client_fam_desc")],
            ["weight_client_rating",      t("as.w_client_rat"),  t("as.w_client_rat_desc")],
            ["weight_experience",         t("as.w_experience"),  t("as.w_experience_desc")],
            ["weight_rate",               t("as.w_rate"),        t("as.w_rate_desc")],
            ["weight_commitment",         t("as.w_commit"),      t("as.w_commit_desc")],
          ].map(([field, label, desc]) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  <span className="text-xs text-gray-400">{desc}</span>
                </div>
                <span className="text-sm font-bold text-blue-700 w-8 text-right flex-shrink-0">{form[field] ?? 0}</span>
              </div>
              <input type="range" min="0" max="50" step="5" value={form[field] ?? 0}
                onChange={e => setForm(p => ({ ...p, [field]: Number(e.target.value) }))}
                className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <div className="flex-1 bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2">{t("as.weight_dist")}</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {[
                ["weight_skills","#3b82f6"],["weight_rating","#8b5cf6"],
                ["weight_client_familiarity","#06b6d4"],["weight_client_rating","#14b8a6"],
                ["weight_experience","#f59e0b"],["weight_rate","#10b981"],["weight_commitment","#f97316"],
              ].map(([field, color]) => (
                <div key={field} style={{ flex: form[field] ?? 0, backgroundColor: color, minWidth: (form[field] ?? 0) > 0 ? 2 : 0 }} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setForm(p => ({ ...p, ...AS_DEFAULTS }))}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            {t("as.reset")}
          </button>
        </div>
      </div>

      {/* Start Date Reminders */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_reminders"))}
        <div className="space-y-3">
          <Toggle field="start_reminders_enabled" label={t("as.reminders_enabled")}
            desc={t("as.reminders_enabled_desc")} />
          {form.start_reminders_enabled && (
            <div className="pl-4 border-l-2 border-amber-100 space-y-3 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.reminder_1")}</label>
                  <input type="number" min="1" max="30" value={form.start_reminder_1_days}
                    onChange={e => setForm(p => ({ ...p, start_reminder_1_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.reminder_1_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.reminder_2")}</label>
                  <input type="number" min="1" max="14" value={form.start_reminder_2_days}
                    onChange={e => setForm(p => ({ ...p, start_reminder_2_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.reminder_2_desc")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.overdue_action")}</label>
                  <select value={form.start_overdue_action}
                    onChange={e => setForm(p => ({ ...p, start_overdue_action: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="auto_start">{t("as.overdue_auto_start")}</option>
                    <option value="notify_manager">{t("as.overdue_notify_mgr")}</option>
                    <option value="auto_unassign">{t("as.overdue_unassign")}</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t("as.overdue_action_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.grace_period")}</label>
                  <input type="number" min="0" max="72" step="1" value={form.start_overdue_grace_hours}
                    onChange={e => setForm(p => ({ ...p, start_overdue_grace_hours: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.grace_desc")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_notif"))}
        <div className="space-y-3">
          <Toggle field="notify_on_new_application" label={t("as.notif_app")}
            desc={t("as.notif_app_desc")} />
          <Toggle field="notify_on_auto_assign" label={t("as.notif_auto")}
            desc={t("as.notif_auto_desc")} />
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
          {saving ? t("state.saving") : t("as.save")}
        </button>
      </div>
    </div>
  );
}

function useClientProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data: updated, error } = await supabase
      .from("client_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      const { error: ie } = await supabase
        .from("client_profiles")
        .insert({ id: userId, ...updates });
      if (ie) throw new Error(`Profile create failed: ${ie.message}`);
    }
    await fetchProfile();
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}

// ============================================================
// ABAP CODING STANDARDS
// ============================================================

const ABAP_STANDARDS_DEFAULTS = {
  globalPrefix: 'Z',
  namespacePrefix: '',
  objectTypePrefixes: {
    program: 'R_', class: 'CL_', interface: 'IF_',
    function_module: '', table: 'ZT_', enhancement: 'E_', badi: 'BD_', other: '',
  },
  authorId: '',
  headerTemplate:
    `*&---------------------------------------------------------------------*\n` +
    `*& Object  : {object_name}\n` +
    `*& Author  : {author}\n` +
    `*& Date    : {date}\n` +
    `*& TR      : {transport}\n` +
    `*& Desc.   : {description}\n` +
    `*&---------------------------------------------------------------------*`,
  changeLogTemplate: `*& {date} {author} {transport}: {change_description}`,
  changeLogLocation: 'top',
  oldCodeHandling: 'comment_block',
  oldCodeBeginMarker: `*-BEGIN OLD: {transport} {date} {author}`,
  oldCodeEndMarker:   `*-END OLD: {transport}`,
  markNewCode: true,
  newCodeBeginMarker: `*-BEGIN NEW: {transport} {date} {author}`,
  newCodeEndMarker:   `*-END NEW: {transport}`,
  abapVersion: 'modern',
  errorHandling: 'subrc',
  selectStyle: 'into_table',
  localVarNaming: true,
  additionalInstructions: '',
};

function resolveAbapStandards(settings, clientId, projectId, caseId) {
  const clientStd  = (settings['abap_standards_client']  ?? {})[clientId]  ?? {};
  const projectStd = (settings['abap_standards_project'] ?? {})[projectId] ?? {};
  const caseStd    = (settings['abap_standards_case']    ?? {})[caseId]    ?? {};
  return {
    ...ABAP_STANDARDS_DEFAULTS,
    ...clientStd,
    objectTypePrefixes: {
      ...ABAP_STANDARDS_DEFAULTS.objectTypePrefixes,
      ...(clientStd.objectTypePrefixes ?? {}),
      ...(projectStd.objectTypePrefixes ?? {}),
      ...(caseStd.objectTypePrefixes ?? {}),
    },
    ...projectStd,
    ...caseStd,
  };
}

function buildAbapStandardsPrompt(standards, objectType, objectName, act, caseData, transportReq, isModification) {
  const today = new Date().toISOString().slice(0, 10);
  const tr = transportReq || '{TRANSPORT}';
  const author = standards.authorId || '{AUTHOR}';

  const header = standards.headerTemplate
    .replace(/{object_name}/g, objectName)
    .replace(/{author}/g, author)
    .replace(/{date}/g, today)
    .replace(/{transport}/g, tr)
    .replace(/{description}/g, act?.description || act?.title || '');

  const changeLog = standards.changeLogTemplate
    .replace(/{date}/g, today)
    .replace(/{author}/g, author)
    .replace(/{transport}/g, tr)
    .replace(/{change_description}/g, act?.title || 'Implementation');

  const typePfx = (standards.objectTypePrefixes ?? {})[objectType] ?? standards.objectTypePrefixes?.other ?? '';
  const globalPfx = standards.namespacePrefix
    ? `/${standards.namespacePrefix}/`
    : (standards.globalPrefix || 'Z');

  const lines = [
    `== ABAP CODING STANDARDS (MANDATORY — follow exactly) ==`,
    ``,
    `NAMING:`,
    `  Global prefix for new objects: ${globalPfx}`,
    typePfx ? `  Object type prefix for ${objectType}: ${typePfx} (e.g. ${globalPfx}${typePfx}${objectName.replace(/^[A-Z\/]+/, '')})` : '',
    standards.localVarNaming ? `  Local variables: lv_ prefix, local structures: ls_, local tables: lt_, field-symbols: <lv_>/<ls_>/<lt_>` : '',
    ``,
    `PROGRAM HEADER (place at the very top):`,
    header,
    ``,
    isModification ? [
      `CHANGE LOG — add this entry in the ${standards.changeLogLocation === 'bottom' ? 'BOTTOM' : 'TOP'} changelog section:`,
      changeLog,
      ``,
      `OLD CODE HANDLING (${standards.oldCodeHandling}):`,
      standards.oldCodeHandling === 'delete'
        ? `  Remove old code entirely — do NOT leave commented-out blocks.`
        : standards.oldCodeHandling === 'keep'
          ? `  Keep old code as-is — do NOT comment it out.`
          : [
              `  Wrap OLD code with markers:`,
              `  ${standards.oldCodeBeginMarker.replace(/{transport}/g, tr).replace(/{date}/g, today).replace(/{author}/g, author)}`,
              `  ... old code ...`,
              `  ${standards.oldCodeEndMarker.replace(/{transport}/g, tr)}`,
            ].join('\n'),
      standards.markNewCode ? [
        ``,
        `NEW CODE MARKERS — wrap new/changed logic with:`,
        `  ${standards.newCodeBeginMarker.replace(/{transport}/g, tr).replace(/{date}/g, today).replace(/{author}/g, author)}`,
        `  ... new code ...`,
        `  ${standards.newCodeEndMarker.replace(/{transport}/g, tr)}`,
      ].join('\n') : '',
    ].filter(Boolean).join('\n') : '',
    ``,
    `ABAP STYLE:`,
    standards.abapVersion === 'modern'
      ? `  Use modern ABAP syntax (inline declarations, string templates, method chaining).`
      : `  Use classic ABAP syntax compatible with older NetWeaver releases. Avoid inline declarations.`,
    standards.errorHandling === 'exceptions'
      ? `  Error handling: use class-based exceptions (cx_* classes).`
      : `  Error handling: check sy-subrc after every database/function call.`,
    standards.selectStyle === 'for_all_entries'
      ? `  SELECT: prefer FOR ALL ENTRIES pattern for multi-row reads.`
      : `  SELECT: use SELECT ... INTO TABLE @DATA(lt_result) pattern.`,
    ``,
    standards.additionalInstructions ? [`ADDITIONAL PROJECT INSTRUCTIONS:`, standards.additionalInstructions, ``].join('\n') : '',
    `== END ABAP CODING STANDARDS ==`,
  ].filter(s => s !== '').join('\n');

  return lines;
}

// ============================================================
// SAP API UTILITIES
// ============================================================

async function sapApiRequest(config, path, opts = {}) {
  const base = (config.proxyUrl?.trim() || config.host.trim()).replace(/\/$/, '');
  const auth = btoa(`${config.username}:${config.password}`);
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/xml, text/xml, text/plain',
    'sap-client': String(config.client || '100'),
    ...(opts.headers ?? {}),
  };
  const url = `${base}${path}`;
  const res = await fetch(url, { ...opts, headers, credentials: 'omit' });
  return res;
}

async function sapGetCsrfToken(config) {
  const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
    method: 'GET',
    headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
  });
  return res.headers.get('X-CSRF-Token') ?? '';
}

async function sapLiveCheck(config) {
  try {
    const res = await sapApiRequest(config, '/sap/bc/adt/discovery', {
      headers: { Accept: 'application/atomsvc+xml' },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const title = xml.match(/<title[^>]*>([^<]+)/)?.[1]?.trim() ?? '';
    const ver   = xml.match(/release="([^"]+)"/)?.[1] ?? xml.match(/version="([^"]+)"/)?.[1] ?? '';
    const spVer = xml.match(/sp="([^"]+)"/)?.[1] ?? '';
    const systemInfo = [title, ver && `Release ${ver}`, spVer && `SP ${spVer}`].filter(Boolean).join(' | ') || 'Connected';
    return { systemInfo, components: [], raw: xml.slice(0, 300) };
  } catch { return null; }
}

function sapObjectPath(objectType, objectName) {
  const n = (objectName ?? '').toUpperCase();
  switch (objectType) {
    case 'program':     return `/sap/bc/adt/programs/programs/${n}/source/main`;
    case 'class':       return `/sap/bc/adt/oo/classes/${n}/source/main`;
    case 'function_module': {
      const [fg, fm] = n.includes('/') ? n.split('/') : [n, n];
      return `/sap/bc/adt/functions/groups/${fg}/fmodules/${fm}/source/main`;
    }
    case 'table':       return `/sap/bc/adt/ddic/dbtables/${n}/source/main`;
    case 'enhancement': return `/sap/bc/adt/enhancements/${n}/source/main`;
    default:            return `/sap/bc/adt/programs/programs/${n}/source/main`;
  }
}

async function sapFetchSource(config, objectType, objectName) {
  const path = sapObjectPath(objectType, objectName);
  const res = await sapApiRequest(config, path, {
    headers: { Accept: 'text/plain, application/vnd.sap.adt.abapsource+text, */*' },
  });
  if (!res.ok) return null;
  return res.text();
}

async function sapWriteSource(config, objectType, objectName, source, transportRequest) {
  const path = sapObjectPath(objectType, objectName);
  const csrfToken = await sapGetCsrfToken(config);
  const res = await sapApiRequest(config, path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-CSRF-Token': csrfToken,
      Accept: 'application/xml',
      ...(transportRequest ? { corrNbr: transportRequest } : {}),
    },
    body: source,
  });
  return res.ok;
}

// ============================================================
// SAP INTEGRATION PANEL (ClientProfileView tab)
// ============================================================
const SAP_ENV_TYPE_META = {
  dev: { label: 'Development (DEV)', color: 'bg-blue-100 text-blue-700' },
  qas: { label: 'Quality (QAS)',     color: 'bg-amber-100 text-amber-700' },
  prd: { label: 'Production (PRD)', color: 'bg-red-100 text-red-700' },
  snd: { label: 'Sandbox (SND)',    color: 'bg-green-100 text-green-700' },
};

function SapIntegrationPanel({ clientId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const allConfigs = ssCtx.settings['sap_integration'] ?? {};
  const clientRaw = allConfigs[clientId] ?? {};

  // Backward compat: old format was flat { host, client, ... } — migrate to environments array
  const initialEnvs = clientRaw.environments ?? (
    clientRaw.host ? [{ id: 'default', name: 'Default', envType: 'dev', ...clientRaw }] : []
  );

  const [environments, setEnvironments] = useState(initialEnvs);
  const [expandedId, setExpandedId] = useState(null);
  const [testStates, setTestStates] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canEdit = auth.isAdmin || auth.isManager || auth.isClient;

  async function saveEnvironments(envs) {
    setSaving(true);
    await ssCtx.setSetting('sap_integration', { ...allConfigs, [clientId]: { environments: envs } });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function addEnvironment() {
    const newEnv = {
      id: crypto.randomUUID(),
      name: 'New Environment',
      envType: 'dev',
      host: '',
      client: '100',
      username: '',
      password: '',
      proxyUrl: '',
      type: 's4hana',
      liveCheckOnGenerate: false,
      autoImplementEnabled: false,
    };
    const updated = [...environments, newEnv];
    setEnvironments(updated);
    setExpandedId(newEnv.id);
  }

  function updateEnvField(id, field, value) {
    setEnvironments(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    setTestStates(p => ({ ...p, [id]: null }));
  }

  function deleteEnv(id) {
    const updated = environments.filter(e => e.id !== id);
    setEnvironments(updated);
    if (expandedId === id) setExpandedId(null);
    saveEnvironments(updated);
  }

  async function testConnection(env) {
    setTestStates(p => ({ ...p, [env.id]: 'testing' }));
    try {
      const result = await sapLiveCheck(env);
      setTestStates(p => ({ ...p, [env.id]: result ? 'ok' : 'fail' }));
    } catch {
      setTestStates(p => ({ ...p, [env.id]: 'fail' }));
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Code2 size={16} className="text-blue-600" />{t('sap.integration_title')}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('sap.integration_subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={addEnvironment}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
            <Plus size={13} />{t('sap.add_environment')}
          </button>
        )}
      </div>

      {environments.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
          {t('sap.no_environments')}
        </div>
      ) : (
        <div className="space-y-3">
          {environments.map(env => {
            const isExpanded = expandedId === env.id;
            const typeMeta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
            const testStatus = testStates[env.id];
            return (
              <div key={env.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : env.id)}>
                  <ChevronRight size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta.color}`}>{typeMeta.label}</span>
                  <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{env.name || 'Unnamed'}</span>
                  {env.host && <span className="text-xs text-gray-400 truncate hidden sm:block max-w-[180px]">{env.host}</span>}
                  {testStatus === 'ok'   && <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />}
                  {testStatus === 'fail' && <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                  {canEdit && (
                    <button onClick={e => { e.stopPropagation(); deleteEnv(env.id); }}
                      className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-1 px-2 py-1 rounded hover:bg-red-50">
                      {t('sap.delete_env')}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/40 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.env_name')}</label>
                        <input value={env.name} onChange={e => updateEnvField(env.id, 'name', e.target.value)} disabled={!canEdit}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.env_type')}</label>
                        <select value={env.envType} onChange={e => updateEnvField(env.id, 'envType', e.target.value)} disabled={!canEdit}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
                          <option value="dev">Development (DEV)</option>
                          <option value="qas">Quality / Testing (QAS)</option>
                          <option value="prd">Production (PRD)</option>
                          <option value="snd">Sandbox (SND)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Connection</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_host')}</label>
                          <input value={env.host} onChange={e => updateEnvField(env.id, 'host', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white"
                            placeholder={t('sap.conn_ph_host')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_client')}</label>
                          <input value={env.client} onChange={e => updateEnvField(env.id, 'client', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white"
                            placeholder={t('sap.conn_ph_client')} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_username')}</label>
                          <input value={env.username} onChange={e => updateEnvField(env.id, 'username', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white"
                            autoComplete="off" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_password')}</label>
                          <input type="password" value={env.password} onChange={e => updateEnvField(env.id, 'password', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white"
                            autoComplete="new-password" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_type')}</label>
                          <select value={env.type} onChange={e => updateEnvField(env.id, 'type', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
                            <option value="s4hana">SAP S/4HANA</option>
                            <option value="ecc">SAP ECC / NetWeaver</option>
                            <option value="btp">SAP BTP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.conn_proxy')}</label>
                          <input value={env.proxyUrl} onChange={e => updateEnvField(env.id, 'proxyUrl', e.target.value)} disabled={!canEdit}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white"
                            placeholder={t('sap.conn_ph_proxy')} />
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button onClick={() => testConnection(env)} disabled={testStatus === 'testing' || !env.host || !env.username}
                          className="px-4 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl disabled:opacity-50 transition-colors">
                          {testStatus === 'testing' ? t('sap.testing') : t('sap.test_connection')}
                        </button>
                        {testStatus === 'ok'   && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />{t('sap.test_ok')}</span>}
                        {testStatus === 'fail' && <span className="text-sm text-red-500 font-medium flex items-center gap-1"><XCircle size={14} />{t('sap.test_fail')}</span>}
                      </div>
                    )}

                    <div className="space-y-2 border-t border-gray-100 pt-3">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Features</div>
                      {[
                        { key: 'liveCheckOnGenerate', labelKey: 'sap.live_check_label', descKey: 'sap.live_check_desc', color: 'bg-blue-600' },
                        { key: 'autoImplementEnabled', labelKey: 'sap.auto_impl_label', descKey: 'sap.auto_impl_desc', color: 'bg-amber-500' },
                      ].map(({ key, labelKey, descKey, color }) => (
                        <div key={key} className="flex items-start gap-4 p-3 rounded-xl border border-gray-100 bg-white">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{t(labelKey)}</p>
                            <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t(descKey)}</p>
                          </div>
                          <button disabled={!canEdit}
                            onClick={() => updateEnvField(env.id, key, !env[key])}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${env[key] ? color : 'bg-gray-200'}`}
                            role="switch" aria-checked={env[key]}>
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${env[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button onClick={() => saveEnvironments(environments)} disabled={saving}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                          {saving ? '…' : t('sap.save_config')}
                        </button>
                        {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />Saved</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI model in use — read from settings, never hardcoded */}
      {(() => {
        const aiModel = ssCtx.settings["ai_model"];
        const MODEL_LABELS = {
          "claude-haiku-4-5-20251001":  t("model.haiku_label"),
          "claude-sonnet-4-6":          t("model.sonnet_label"),
          "claude-sonnet-5-20251001":   t("model.sonnet_label"),
          "claude-opus-5-20250101":     t("model.opus_label"),
        };
        const displayName = aiModel
          ? (MODEL_LABELS[aiModel] ?? aiModel)
          : t("sys.model_label");
        return (
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={13} className="text-purple-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700">AI for Code Generation</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">Used for ABAP generation &amp; analysis · Configure in Settings → Generation</p>
              </div>
            </div>
            <span className="flex-shrink-0 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1 whitespace-nowrap">
              {aiModel ? displayName : <span className="text-gray-400 font-normal">Not set</span>}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// PROJECT SAP ENVIRONMENT SELECTOR
// ============================================================
function ProjectSapEnvPanel({ projectId, clientId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  const clientSapData = (settings['sap_integration'] ?? {})[clientId] ?? {};
  const rawEnvs = clientSapData.environments ?? (clientSapData.host ? [{ id: 'default', name: 'Default', envType: 'dev', ...clientSapData }] : []);
  const sapProjectEnv = settings['sap_project_env'] ?? {};
  const selectedEnvId = sapProjectEnv[projectId] ?? '';
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedEnv = rawEnvs.find(e => e.id === selectedEnvId) ?? rawEnvs[0] ?? null;

  async function handleSelect(envId) {
    setSaving(true);
    await ssCtx.setSetting('sap_project_env', { ...sapProjectEnv, [projectId]: envId || null });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!rawEnvs.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <Code2 size={36} className="text-gray-200 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">{t('sap.no_environments')}</p>
        <p className="text-xs text-gray-400">{t('sap.integration_subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <Code2 size={16} className="text-blue-600" />{t('sap.project_env_label')}
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.project_env_label')}</label>
          <select value={selectedEnvId} onChange={e => handleSelect(e.target.value)} disabled={saving}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="">{t('sap.project_env_none')}</option>
            {rawEnvs.map(env => {
              const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
              return (
                <option key={env.id} value={env.id}>
                  {env.name} — {env.host || t('sap.conn_ph_host')} ({meta.label})
                </option>
              );
            })}
          </select>
          {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1 mt-2"><CheckCircle2 size={14} />Saved</span>}
        </div>

        {selectedEnv && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(SAP_ENV_TYPE_META[selectedEnv.envType] ?? SAP_ENV_TYPE_META.dev).color}`}>
                {(SAP_ENV_TYPE_META[selectedEnv.envType] ?? SAP_ENV_TYPE_META.dev).label}
              </span>
              <span className="font-semibold text-sm text-gray-800">{selectedEnv.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
              <div><span className="font-medium text-gray-600">Host:</span> {selectedEnv.host || '—'}</div>
              <div><span className="font-medium text-gray-600">Client:</span> {selectedEnv.client || '—'}</div>
              <div><span className="font-medium text-gray-600">User:</span> {selectedEnv.username || '—'}</div>
              <div><span className="font-medium text-gray-600">System:</span> {selectedEnv.type?.toUpperCase() || '—'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('sap.environments')}</h4>
        <div className="space-y-2">
          {rawEnvs.map(env => {
            const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
            const isActive = env.id === (selectedEnvId || rawEnvs[0]?.id);
            return (
              <div key={env.id}
                onClick={() => handleSelect(env.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'border-blue-200 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.color}`}>{meta.label}</span>
                <span className="font-medium text-sm text-gray-800 flex-1">{env.name}</span>
                <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[200px]">{env.host}</span>
                {isActive && <CheckCircle2 size={14} className="text-blue-500 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <AbapStandardsPanel level="project" entityId={projectId} clientId={clientId} auth={auth} />
    </div>
  );
}

// ============================================================
// ABAP STANDARDS PANEL
// ============================================================
function AbapStandardsPanel({ level, entityId, clientId, projectId, auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  // Clients can edit their own company-level standards; admins/managers can edit at any level
  const canEdit = auth.isAdmin || auth.isManager || (level === 'client' && auth.isClient);

  const settingKey = level === 'client'  ? 'abap_standards_client'
                   : level === 'project' ? 'abap_standards_project'
                   :                       'abap_standards_case';

  // Resolve inherited for display purposes
  const resolvedBase = resolveAbapStandards(
    settings,
    level === 'client'  ? entityId : (clientId ?? ''),
    level === 'project' ? entityId : (projectId ?? ''),
    level === 'case'    ? entityId : '',
  );

  const currentMap = settings[settingKey] ?? {};
  const current = currentMap[entityId] ?? {};

  const [form, setForm] = useState(() => ({ ...resolvedBase, ...current }));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function f(key, value) { setForm(p => ({ ...p, [key]: value })); }
  function fPfx(objType, value) {
    setForm(p => ({ ...p, objectTypePrefixes: { ...(p.objectTypePrefixes ?? {}), [objType]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    const toSave = { ...form };
    await ssCtx.setSetting(settingKey, { ...currentMap, [entityId]: toSave });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white font-mono";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";
  const sectionCls = "space-y-4 pt-5 border-t border-gray-100 first:border-t-0 first:pt-0";

  const OBJECT_TYPES_FOR_PREFIX = ['program','class','interface','function_module','table','enhancement','badi','other'];

  if (level === 'case') {
    // Compact version for the case implementation tab
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileCode2 size={14} className="text-amber-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t('abap.tab_title')}</span>
          <span className="text-xs text-amber-500 ml-auto">{t('abap.inherited_hint')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('abap.global_prefix')}</label>
            <input value={form.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={10} />
          </div>
          <div>
            <label className={labelCls}>{t('abap.author_id')}</label>
            <input value={form.authorId} onChange={e => f('authorId', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={40} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('abap.ai_instructions')}</label>
          <textarea value={form.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)}
            disabled={!canEdit} rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white resize-none"
            placeholder={t('abap.ai_instructions_ph')} />
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? '…' : t('abap.save')}
            </button>
            {saved && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} />{t('abap.saved')}</span>}
          </div>
        )}
      </div>
    );
  }

  const templates = ssCtx.settings['abap_standards_templates'] ?? [];
  const [selectedTplId, setSelectedTplId] = useState('');
  const [tplApplied, setTplApplied] = useState(false);

  function applyTemplate() {
    const tpl = templates.find(t => t.id === selectedTplId);
    if (!tpl) return;
    const { id: _id, name: _name, ...fields } = tpl;
    setForm(p => ({
      ...p,
      ...fields,
      objectTypePrefixes: {
        ...(p.objectTypePrefixes ?? {}),
        ...(fields.objectTypePrefixes ?? {}),
      },
    }));
    setSelectedTplId('');
    setTplApplied(true);
    setTimeout(() => setTplApplied(false), 3000);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-0">
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <FileCode2 size={16} className="text-amber-600" />{t('abap.tab_title')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('abap.tab_subtitle')}</p>
            {level !== 'client' && (
              <p className="text-xs text-blue-500 mt-1">{t('abap.inherited_hint')}</p>
            )}
          </div>
          {canEdit && templates.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                <option value="">{t('abap.select_template')}</option>
                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </select>
              <button onClick={applyTemplate} disabled={!selectedTplId}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors">
                {t('abap.apply_template')}
              </button>
            </div>
          )}
        </div>
        {tplApplied && (
          <p className="text-xs text-amber-700 font-medium mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} />{t('abap.template_applied')}
          </p>
        )}
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_naming')}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('abap.global_prefix')}</label>
            <input value={form.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={10} placeholder="Z" />
          </div>
          <div>
            <label className={labelCls}>{t('abap.namespace_prefix')}</label>
            <input value={form.namespacePrefix} onChange={e => f('namespacePrefix', e.target.value)} disabled={!canEdit}
              className={inputCls} maxLength={20} placeholder="MYNAMESPACE" />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('abap.object_type_prefixes')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OBJECT_TYPES_FOR_PREFIX.map(ot => (
              <div key={ot}>
                <label className="block text-[10px] text-gray-500 mb-0.5 capitalize">{ot.replace('_', ' ')}</label>
                <input value={(form.objectTypePrefixes ?? {})[ot] ?? ''} onChange={e => fPfx(ot, e.target.value)}
                  disabled={!canEdit} className={inputCls} maxLength={10} placeholder="—" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={!canEdit} onClick={() => f('localVarNaming', !form.localVarNaming)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${form.localVarNaming ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.localVarNaming}>
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${form.localVarNaming ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700">{t('abap.local_var_naming')}</span>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_header')}</h4>
        <div>
          <label className={labelCls}>{t('abap.author_id')}</label>
          <input value={form.authorId} onChange={e => f('authorId', e.target.value)} disabled={!canEdit}
            className={inputCls} maxLength={40} placeholder="JSMITH" />
        </div>
        <div>
          <label className={labelCls}>{t('abap.header_template')} <span className="text-gray-400 font-normal">({`{object_name} {author} {date} {transport} {description}`})</span></label>
          <textarea value={form.headerTemplate} onChange={e => f('headerTemplate', e.target.value)}
            disabled={!canEdit} rows={7}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white font-mono resize-y" />
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_changelog')}</h4>
        <div>
          <label className={labelCls}>{t('abap.changelog_template')} <span className="text-gray-400 font-normal">({`{date} {author} {transport} {change_description}`})</span></label>
          <input value={form.changeLogTemplate} onChange={e => f('changeLogTemplate', e.target.value)}
            disabled={!canEdit} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('abap.changelog_location')}</label>
          <select value={form.changeLogLocation} onChange={e => f('changeLogLocation', e.target.value)}
            disabled={!canEdit}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
            <option value="top">{t('abap.changelog_top')}</option>
            <option value="bottom">{t('abap.changelog_bottom')}</option>
          </select>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_modifications')}</h4>
        <div>
          <label className={labelCls}>{t('abap.old_code_handling')}</label>
          <select value={form.oldCodeHandling} onChange={e => f('oldCodeHandling', e.target.value)}
            disabled={!canEdit}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
            <option value="comment_block">{t('abap.old_code_comment')}</option>
            <option value="delete">{t('abap.old_code_delete')}</option>
            <option value="keep">{t('abap.old_code_keep')}</option>
          </select>
        </div>
        {form.oldCodeHandling === 'comment_block' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('abap.old_code_begin')}</label>
              <input value={form.oldCodeBeginMarker} onChange={e => f('oldCodeBeginMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('abap.old_code_end')}</label>
              <input value={form.oldCodeEndMarker} onChange={e => f('oldCodeEndMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button disabled={!canEdit} onClick={() => f('markNewCode', !form.markNewCode)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${form.markNewCode ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.markNewCode}>
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${form.markNewCode ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700">{t('abap.mark_new_code')}</span>
        </div>
        {form.markNewCode && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('abap.new_code_begin')}</label>
              <input value={form.newCodeBeginMarker} onChange={e => f('newCodeBeginMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('abap.new_code_end')}</label>
              <input value={form.newCodeEndMarker} onChange={e => f('newCodeEndMarker', e.target.value)}
                disabled={!canEdit} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_style')}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('abap.abap_version')}</label>
            <select value={form.abapVersion} onChange={e => f('abapVersion', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="modern">{t('abap.version_modern')}</option>
              <option value="classic">{t('abap.version_classic')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('abap.error_handling')}</label>
            <select value={form.errorHandling} onChange={e => f('errorHandling', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="subrc">{t('abap.error_subrc')}</option>
              <option value="exceptions">{t('abap.error_exceptions')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('abap.select_style')}</label>
            <select value={form.selectStyle} onChange={e => f('selectStyle', e.target.value)} disabled={!canEdit}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white">
              <option value="into_table">{t('abap.select_into_table')}</option>
              <option value="for_all_entries">{t('abap.select_fae')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className={sectionCls}>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_ai')}</h4>
        <div>
          <label className={labelCls}>{t('abap.ai_instructions')}</label>
          <textarea value={form.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)}
            disabled={!canEdit} rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-white resize-y"
            placeholder={t('abap.ai_instructions_ph')} />
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? '…' : t('abap.save')}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />{t('abap.saved')}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ABAP TEMPLATES (platform-level CRUD)
// ============================================================
function AbapTemplatesSection({ auth }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  const canEdit = auth.isAdmin || auth.isManager;

  const templates = settings['abap_standards_templates'] ?? [];
  const [editingId, setEditingId] = useState(null); // null=list, 'new'=new form, uuid=edit form
  const [editName, setEditName] = useState('');
  const [editForm, setEditForm] = useState({ ...ABAP_STANDARDS_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function startNew() {
    setEditingId('new');
    setEditName('');
    setEditForm({ ...ABAP_STANDARDS_DEFAULTS });
  }

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditForm({ ...ABAP_STANDARDS_DEFAULTS, ...tpl });
  }

  function cancelEdit() { setEditingId(null); setSaved(false); }

  function f(key, value) { setEditForm(p => ({ ...p, [key]: value })); }
  function fPfx(objType, value) {
    setEditForm(p => ({ ...p, objectTypePrefixes: { ...(p.objectTypePrefixes ?? {}), [objType]: value } }));
  }

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    let updated;
    if (editingId === 'new') {
      const newTpl = { id: crypto.randomUUID(), name: editName.trim(), ...editForm };
      updated = [...templates, newTpl];
    } else {
      updated = templates.map(t => t.id === editingId ? { ...t, name: editName.trim(), ...editForm } : t);
    }
    await ssCtx.setSetting('abap_standards_templates', updated);
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); setEditingId(null); }, 1200);
  }

  async function handleDelete(id) {
    if (!window.confirm(t('abap_tpl.confirm_delete'))) return;
    await ssCtx.setSetting('abap_standards_templates', templates.filter(t => t.id !== id));
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";
  const sectionCls = "space-y-4 pt-4 border-t border-gray-100";
  const OBJECT_TYPES_FOR_PREFIX = ['program','class','interface','function_module','table','enhancement','badi','other'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <FileCode2 size={16} className="text-amber-600" />{t('abap_tpl.title')}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('abap_tpl.subtitle')}</p>
        </div>
        {canEdit && editingId === null && (
          <button onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus size={14} />{t('abap_tpl.new')}
          </button>
        )}
      </div>

      {/* Template list */}
      {editingId === null && (
        templates.length === 0
          ? <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center text-sm text-gray-400">{t('abap_tpl.no_templates')}</div>
          : <div className="space-y-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
                  <FileCode2 size={16} className="text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{tpl.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Prefix: {tpl.globalPrefix || 'Z'} · {tpl.abapVersion === 'modern' ? 'Modern ABAP' : 'Classic ABAP'} · {tpl.errorHandling === 'exceptions' ? 'cx_* exceptions' : 'sy-subrc'}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(tpl)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        {t('abap_tpl.edit')}
                      </button>
                      <button onClick={() => handleDelete(tpl.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        {t('abap_tpl.delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
      )}

      {/* Edit / New form */}
      {editingId !== null && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm space-y-0">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('abap_tpl.name')}</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              placeholder={t('abap_tpl.name_ph')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-semibold" />
          </div>

          {/* ── Naming ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_naming')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>{t('abap.global_prefix')}</label>
                <input value={editForm.globalPrefix} onChange={e => f('globalPrefix', e.target.value)} className={inputCls} maxLength={10} placeholder="Z" /></div>
              <div><label className={labelCls}>{t('abap.namespace_prefix')}</label>
                <input value={editForm.namespacePrefix} onChange={e => f('namespacePrefix', e.target.value)} className={inputCls} maxLength={20} /></div>
            </div>
            <div>
              <label className={labelCls}>{t('abap.object_type_prefixes')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {OBJECT_TYPES_FOR_PREFIX.map(ot => (
                  <div key={ot}>
                    <label className="block text-[10px] text-gray-500 mb-0.5 capitalize">{ot.replace('_',' ')}</label>
                    <input value={(editForm.objectTypePrefixes ?? {})[ot] ?? ''} onChange={e => fPfx(ot, e.target.value)} className={inputCls} maxLength={10} placeholder="—" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => f('localVarNaming', !editForm.localVarNaming)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${editForm.localVarNaming ? 'bg-blue-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={editForm.localVarNaming}>
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.localVarNaming ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{t('abap.local_var_naming')}</span>
            </div>
          </div>

          {/* ── Header ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_header')}</h4>
            <div><label className={labelCls}>{t('abap.author_id')}</label>
              <input value={editForm.authorId} onChange={e => f('authorId', e.target.value)} className={inputCls} maxLength={40} placeholder="JSMITH" /></div>
            <div>
              <label className={labelCls}>{t('abap.header_template')}</label>
              <textarea value={editForm.headerTemplate} onChange={e => f('headerTemplate', e.target.value)} rows={7}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono resize-y" />
            </div>
          </div>

          {/* ── Change Log ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_changelog')}</h4>
            <div><label className={labelCls}>{t('abap.changelog_template')}</label>
              <input value={editForm.changeLogTemplate} onChange={e => f('changeLogTemplate', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('abap.changelog_location')}</label>
              <select value={editForm.changeLogLocation} onChange={e => f('changeLogLocation', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="top">{t('abap.changelog_top')}</option>
                <option value="bottom">{t('abap.changelog_bottom')}</option>
              </select>
            </div>
          </div>

          {/* ── Modification rules ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_modifications')}</h4>
            <div><label className={labelCls}>{t('abap.old_code_handling')}</label>
              <select value={editForm.oldCodeHandling} onChange={e => f('oldCodeHandling', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="comment_block">{t('abap.old_code_comment')}</option>
                <option value="delete">{t('abap.old_code_delete')}</option>
                <option value="keep">{t('abap.old_code_keep')}</option>
              </select>
            </div>
            {editForm.oldCodeHandling === 'comment_block' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>{t('abap.old_code_begin')}</label>
                  <input value={editForm.oldCodeBeginMarker} onChange={e => f('oldCodeBeginMarker', e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>{t('abap.old_code_end')}</label>
                  <input value={editForm.oldCodeEndMarker} onChange={e => f('oldCodeEndMarker', e.target.value)} className={inputCls} /></div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => f('markNewCode', !editForm.markNewCode)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${editForm.markNewCode ? 'bg-blue-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={editForm.markNewCode}>
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.markNewCode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">{t('abap.mark_new_code')}</span>
            </div>
            {editForm.markNewCode && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>{t('abap.new_code_begin')}</label>
                  <input value={editForm.newCodeBeginMarker} onChange={e => f('newCodeBeginMarker', e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>{t('abap.new_code_end')}</label>
                  <input value={editForm.newCodeEndMarker} onChange={e => f('newCodeEndMarker', e.target.value)} className={inputCls} /></div>
              </div>
            )}
          </div>

          {/* ── Style ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_style')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className={labelCls}>{t('abap.abap_version')}</label>
                <select value={editForm.abapVersion} onChange={e => f('abapVersion', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="modern">{t('abap.version_modern')}</option>
                  <option value="classic">{t('abap.version_classic')}</option>
                </select>
              </div>
              <div><label className={labelCls}>{t('abap.error_handling')}</label>
                <select value={editForm.errorHandling} onChange={e => f('errorHandling', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="subrc">{t('abap.error_subrc')}</option>
                  <option value="exceptions">{t('abap.error_exceptions')}</option>
                </select>
              </div>
              <div><label className={labelCls}>{t('abap.select_style')}</label>
                <select value={editForm.selectStyle} onChange={e => f('selectStyle', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="into_table">{t('abap.select_into_table')}</option>
                  <option value="for_all_entries">{t('abap.select_fae')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── AI Instructions ── */}
          <div className={sectionCls}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('abap.section_ai')}</h4>
            <div><label className={labelCls}>{t('abap.ai_instructions')}</label>
              <textarea value={editForm.additionalInstructions} onChange={e => f('additionalInstructions', e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-y"
                placeholder={t('abap.ai_instructions_ph')} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving || !editName.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? '…' : t('abap_tpl.save')}
            </button>
            {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={14} />Saved</span>}
            <button onClick={cancelEdit}
              className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 rounded-xl transition-colors ml-auto">
              {t('abap_tpl.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SAP IMPLEMENTATION TAB
// ============================================================
const SAP_OBJECT_TYPES = [
  { value: 'program',         labelKey: 'sap.obj_type_program' },
  { value: 'class',           labelKey: 'sap.obj_type_class' },
  { value: 'function_module', labelKey: 'sap.obj_type_fm' },
  { value: 'table',           labelKey: 'sap.obj_type_table' },
  { value: 'enhancement',     labelKey: 'sap.obj_type_enhancement' },
  { value: 'badi',            labelKey: 'sap.obj_type_badi' },
  { value: 'config',          labelKey: 'sap.obj_type_config' },
  { value: 'other',           labelKey: 'sap.obj_type_other' },
];

function SapImplementationTab({ caseData, auth, activities, updateActivity }) {
  const { t } = useT();
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;

  const allSapConfigs = settings['sap_integration'] ?? {};
  const clientSapData = allSapConfigs[caseData.client_id] ?? {};
  const sapEnvironments = clientSapData.environments ?? (clientSapData.host ? [clientSapData] : []);
  const sapProjectEnvMap = settings['sap_project_env'] ?? {};
  const sapCaseEnvMap   = settings['sap_case_env']    ?? {};
  // Resolution: case env → project env → first client env
  const selectedSapEnvId = sapCaseEnvMap[caseData.id]
    ?? sapProjectEnvMap[caseData.project_id]
    ?? null;
  const sapConfig = selectedSapEnvId
    ? (sapEnvironments.find(e => e.id === selectedSapEnvId) ?? sapEnvironments[0] ?? null)
    : (sapEnvironments[0] ?? null);
  const autoImplEnabled = sapConfig?.autoImplementEnabled ?? false;

  async function saveCaseEnv(envId) {
    await ssCtx.setSetting('sap_case_env', { ...sapCaseEnvMap, [caseData.id]: envId || null });
  }

  // Per-activity SAP object assignments: { [actId]: { objectType, objectName } }
  const savedObjects = settings['sap_activity_objects'] ?? {};
  const [objectMap, setObjectMap] = useState(savedObjects);
  // Per-activity state: { [actId]: { checking, checkResult, generatedCode, applying, applied, expanded } }
  const [actState, setActState] = useState({});

  const [transportReq, setTransportReq] = useState(settings['sap_impl_transport']?.[caseData.id] ?? '');
  const [savingTransport, setSavingTransport] = useState(false);

  const genModel = settings["ai_model"] ?? 'claude-haiku-4-5-20251001';

  // Only show development-phase activities
  const implActivities = activities.filter(a =>
    !['completed'].includes(a.phase) &&
    (a.phase === 'development' || a.phase === 'design' || !a.phase || a.progress_pct < 100)
  );

  function setActField(actId, updates) {
    setActState(p => ({ ...p, [actId]: { ...(p[actId] ?? {}), ...updates } }));
  }

  async function saveObjectMap(newMap) {
    setObjectMap(newMap);
    await ssCtx.setSetting('sap_activity_objects', newMap);
  }

  function setObjectField(actId, field, value) {
    const updated = { ...objectMap, [actId]: { ...(objectMap[actId] ?? {}), [field]: value } };
    saveObjectMap(updated);
  }

  async function saveTransport(val) {
    setSavingTransport(true);
    const cur = settings['sap_impl_transport'] ?? {};
    await ssCtx.setSetting('sap_impl_transport', { ...cur, [caseData.id]: val });
    setSavingTransport(false);
  }

  async function handleCheckSap(actId) {
    if (!sapConfig?.host) return;
    const obj = objectMap[actId];
    if (!obj?.objectName) return;
    setActField(actId, { checking: true, checkResult: null });
    try {
      const src = await sapFetchSource(sapConfig, obj.objectType ?? 'program', obj.objectName);
      setActField(actId, { checking: false, checkResult: src ? { found: true, source: src } : { found: false } });
    } catch (e) {
      setActField(actId, { checking: false, checkResult: { found: false, error: e.message } });
    }
  }

  async function handleGenerateCode(act) {
    const obj = objectMap[act.id];
    if (!obj?.objectName) return;
    setActField(act.id, { generating: true });
    try {
      const existingSource = actState[act.id]?.checkResult?.source ?? '';
      const isModification = !!existingSource;
      const standards = resolveAbapStandards(
        settings,
        caseData.client_id,
        caseData.project_id,
        caseData.id,
      );
      const standardsBlock = buildAbapStandardsPrompt(
        standards,
        obj.objectType ?? 'program',
        obj.objectName,
        act,
        caseData,
        transportReq,
        isModification,
      );
      const prompt = `You are an SAP ABAP developer. ${isModification ? 'MODIFY' : 'CREATE'} ${obj.objectType ?? 'ABAP program'} code for SAP object ${obj.objectName}.

Activity: ${act.title}
Description: ${act.description ?? ''}
Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? 'general'}
${isModification ? `\nExisting source to MODIFY:\n\`\`\`abap\n${existingSource.slice(0, 3000)}\n\`\`\`` : '\nThis is a NEW object — generate complete source.'}

${standardsBlock}

Output ONLY the ABAP source code, no explanations. Follow the coding standards above exactly.`;
      const resp = await callClaude({
        model: genModel,
        system: 'You are an expert SAP ABAP developer. Output only clean, compilable ABAP source code. Follow all coding standards provided in the user message without exception.',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 4000,
      });
      const code = typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '');
      setActField(act.id, { generating: false, generatedCode: code });
    } catch (e) {
      setActField(act.id, { generating: false });
      alert('Code generation failed: ' + e.message);
    }
  }

  async function handleApplyToSap(act) {
    if (!sapConfig?.host || !autoImplEnabled) return;
    const obj = objectMap[act.id];
    const code = actState[act.id]?.generatedCode;
    if (!obj?.objectName || !code) return;
    setActField(act.id, { applying: true });
    try {
      const ok = await sapWriteSource(sapConfig, obj.objectType ?? 'program', obj.objectName, code, transportReq || undefined);
      if (ok) {
        setActField(act.id, { applying: false, applied: true });
        // Update activity progress to 100%
        await updateActivity(act.id, { progress_pct: 100 });
        // Log the implementation
        const cur = settings['sap_impl_log'] ?? {};
        const caseLog = cur[caseData.id] ?? [];
        await ssCtx.setSetting('sap_impl_log', {
          ...cur,
          [caseData.id]: [...caseLog, {
            activityId: act.id,
            activityTitle: act.title,
            objectName: obj.objectName,
            objectType: obj.objectType,
            appliedAt: new Date().toISOString(),
            transport: transportReq,
          }],
        });
      } else {
        setActField(act.id, { applying: false });
        alert('SAP write failed. Check connection and transport request.');
      }
    } catch (e) {
      setActField(act.id, { applying: false });
      alert('Apply failed: ' + e.message);
    }
  }

  async function handleApplyAll() {
    for (const act of implActivities) {
      const obj = objectMap[act.id];
      const code = actState[act.id]?.generatedCode;
      if (obj?.objectName && code && !actState[act.id]?.applied) {
        await handleApplyToSap(act);
      }
    }
  }

  const implLog = (settings['sap_impl_log'] ?? {})[caseData.id] ?? [];
  const appliedCount = implLog.length;
  const totalCount   = implActivities.length;

  if (!sapConfig?.host) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <Code2 size={36} className="text-gray-200 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">{t('sap.impl_no_config')}</p>
        <p className="text-xs text-gray-400">{t('sap.impl_configure')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Code2 size={16} className="text-blue-600" />{t('sap.impl_tab_title')}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('sap.impl_tab_subtitle')}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Environment selector */}
            {sapEnvironments.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium">{t('sap.case_env_label')}:</label>
                <select
                  value={sapCaseEnvMap[caseData.id] ?? ''}
                  onChange={e => saveCaseEnv(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">{t('sap.case_env_inherit')}</option>
                  {sapEnvironments.map(env => {
                    const meta = SAP_ENV_TYPE_META[env.envType] ?? SAP_ENV_TYPE_META.dev;
                    return <option key={env.id} value={env.id}>{env.name} ({meta.label})</option>;
                  })}
                </select>
                {sapConfig && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(SAP_ENV_TYPE_META[sapConfig.envType] ?? SAP_ENV_TYPE_META.dev).color}`}>
                    {sapConfig.name}
                  </span>
                )}
              </div>
            )}
            {/* Transport request */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">{t('sap.transport_req')}:</label>
              <input value={transportReq}
                onChange={e => setTransportReq(e.target.value)}
                onBlur={() => saveTransport(transportReq)}
                placeholder={t('sap.ph_transport_req')}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {autoImplEnabled && (
              <button onClick={handleApplyAll}
                className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors">
                {t('sap.impl_apply_all')}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{t('sap.impl_progress_title')}</span>
            <span>{t('sap.impl_done_count').replace('{n}', appliedCount).replace('{total}', totalCount)}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: totalCount ? `${Math.round(appliedCount / totalCount * 100)}%` : '0%' }} />
          </div>
        </div>
      </div>

      {/* Case-level ABAP Standards override */}
      <AbapStandardsPanel
        level="case"
        entityId={caseData.id}
        clientId={caseData.client_id}
        projectId={caseData.project_id}
        auth={auth}
      />

      {/* Activity cards */}
      {implActivities.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          No implementation activities found.
        </div>
      ) : implActivities.map(act => {
        const obj  = objectMap[act.id] ?? {};
        const as   = actState[act.id] ?? {};
        const isApplied = as.applied || implLog.some(l => l.activityId === act.id);

        return (
          <div key={act.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${isApplied ? 'border-green-200 bg-green-50/40' : 'border-gray-100'}`}>
            {/* Card header */}
            <div className="p-4 flex items-start gap-3 cursor-pointer"
              onClick={() => setActField(act.id, { expanded: !as.expanded })}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isApplied ? 'bg-green-100' : 'bg-blue-100'}`}>
                {isApplied ? <CheckCircle2 size={14} className="text-green-600" /> : <Code2 size={14} className="text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 leading-tight">{act.title}</p>
                {act.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{act.description}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {act.phase && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{act.phase?.replace(/_/g,' ')}</span>}
                  {obj.objectName && <span className="text-xs text-blue-600 font-mono">{obj.objectName}</span>}
                  {isApplied && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 size={10} />{t('sap.impl_applied')}</span>}
                </div>
              </div>
              <ChevronRight size={14} className={`text-gray-400 mt-1 transition-transform flex-shrink-0 ${as.expanded ? 'rotate-90' : ''}`} />
            </div>

            {as.expanded && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {/* Object configuration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.impl_object_type')}</label>
                    <select value={obj.objectType ?? 'program'}
                      onChange={e => setObjectField(act.id, 'objectType', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {SAP_OBJECT_TYPES.map(ot => (
                        <option key={ot.value} value={ot.value}>{t(ot.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('sap.impl_object_name')}</label>
                    <input value={obj.objectName ?? ''}
                      onChange={e => setObjectField(act.id, 'objectName', e.target.value.toUpperCase())}
                      placeholder="ZFIN_PAYMENT_REP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Check in SAP */}
                  <button
                    onClick={() => handleCheckSap(act.id)}
                    disabled={as.checking || !obj.objectName || !sapConfig?.host}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {as.checking ? t('sap.impl_checking') : t('sap.impl_check_sap')}
                  </button>
                  {/* Check result badge */}
                  {as.checkResult && (
                    as.checkResult.found
                      ? <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><CheckCircle2 size={10} />{t('sap.impl_found')}</span>
                      : <span className="text-xs text-gray-400 flex items-center gap-1"><XCircle size={10} />{t('sap.impl_not_found')}</span>
                  )}
                  {/* Generate code */}
                  <button
                    onClick={() => handleGenerateCode(act)}
                    disabled={as.generating || !obj.objectName}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors">
                    {as.generating ? t('sap.impl_generating') : t('sap.impl_gen_code')}
                  </button>
                  {/* Apply to SAP */}
                  {autoImplEnabled && as.generatedCode && (
                    <button
                      onClick={() => handleApplyToSap(act)}
                      disabled={as.applying || isApplied}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors ${isApplied ? 'bg-green-100 text-green-700' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                      {as.applying ? t('sap.impl_applying') : isApplied ? t('sap.impl_applied') : t('sap.impl_apply')}
                    </button>
                  )}
                </div>

                {/* Existing source (from SAP check) */}
                {as.checkResult?.found && as.checkResult.source && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Eye size={10} />{t('sap.live_existing_source')}
                    </p>
                    <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto max-h-48 leading-relaxed">
                      {as.checkResult.source.slice(0, 2000)}
                    </pre>
                  </div>
                )}

                {/* Generated code */}
                {as.generatedCode && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Code2 size={10} />Generated ABAP
                    </p>
                    <textarea
                      value={as.generatedCode}
                      onChange={e => setActField(act.id, { generatedCode: e.target.value })}
                      className="w-full bg-gray-900 text-green-300 text-xs rounded-xl p-4 font-mono leading-relaxed h-64 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Implementation log */}
      {implLog.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h4 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" />Implementation Log
          </h4>
          <div className="space-y-2">
            {implLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-mono text-blue-600 font-medium">{entry.objectName}</span>
                <span className="text-gray-400">·</span>
                <span className="truncate flex-1">{entry.activityTitle}</span>
                {entry.transport && <span className="text-gray-400 font-mono">{entry.transport}</span>}
                <span className="text-gray-300">{new Date(entry.appliedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientProfileView({ auth, clientId: clientIdProp, onBack }) {
  const { t, lang, setLang } = useT();
  const visCfg = useVisibilitySettings();
  // When opened by admin for a specific client, use that clientId; otherwise own profile
  const effectiveClientId = clientIdProp ?? auth.user?.id;
  const isAdminView = !!(clientIdProp && (auth.isAdmin || auth.isManager));
  const { profile, loading, updateProfile } = useClientProfile(effectiveClientId);
  const { sla, updateSla }                  = useSlaConfig(effectiveClientId);
  const { connections, addConnection, deleteConnection } = useDbConnections(effectiveClientId);
  const { members, addMember, updateMember, removeMember } = useClientTeamMembers(effectiveClientId);
  const [memberStatusMap, setMemberStatusMap] = useState({});

  useEffect(() => {
    if (!members.length) { setMemberStatusMap({}); return; }
    const emails = members.map(m => m.email).filter(Boolean);
    if (!emails.length) return;
    supabase.from("users").select("email, verification_status").in("email", emails)
      .then(({ data }) => {
        const map = {};
        (data ?? []).forEach(u => { map[u.email.toLowerCase()] = u.verification_status; });
        setMemberStatusMap(map);
      });
  }, [members]);

  function MemberStatusIcon({ email }) {
    if (!email) return null;
    const status = memberStatusMap[email.toLowerCase()];
    if (status === undefined) return <span title="Not signed up yet" className="text-gray-300 flex-shrink-0"><Clock size={14} /></span>;
    if (status === "approved")  return <span title="Approved"         className="text-green-500 flex-shrink-0"><CheckCircle2 size={14} /></span>;
    if (status === "pending")   return <span title="Pending approval" className="text-amber-400 flex-shrink-0"><Clock size={14} /></span>;
    if (status === "rejected")  return <span title="Rejected"         className="text-red-400 flex-shrink-0"><XCircle size={14} /></span>;
    return null;
  }

  const [tab, setTab]         = useState("overview");
  const cpvCarouselRef = useRef(null);
  const cpvCarouselScrolling = useRef(false);
  const [cpvMountedSlides, setCpvMountedSlides] = useState(() => new Set(["overview"]));
  const [cpvManualCompletions, setCpvManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_cpvmc_${effectiveClientId ?? 'me'}`) ?? "{}"); } catch { return {}; }
  });
  function setCpvManualComplete(tabId, done) {
    setCpvManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_cpvmc_${effectiveClientId ?? 'me'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [clientAvatarUrl, setClientAvatarUrl] = useState(auth.profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `client-avatars/${auth.user?.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('project-avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('project-avatars').getPublicUrl(path);
      const { error: updateErr } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', auth.user?.id);
      if (updateErr) throw updateErr;
      setClientAvatarUrl(publicUrl);
    } catch (err) { alert(`Avatar upload failed: ${err.message}`); }
    setUploadingAvatar(false);
    e.target.value = '';
  }

  // DB connection form
  const [showAddConn, setShowAddConn] = useState(false);
  const defaultConnForm = { db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "", meta: {} };
  const [connForm, setConnForm] = useState(defaultConnForm);
  const [savingConn, setSavingConn] = useState(false);

  // Team member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ full_name: "", email: "", role_title: "", phone: "", is_primary: false, system_role: "" });
  const [savingMember, setSavingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberForm, setEditMemberForm] = useState({});
  const [savingEditMember, setSavingEditMember] = useState(false);

  // SLA edit
  const [slaEditing, setSlaEditing]   = useState(false);
  const [slaForm, setSlaForm]         = useState({ tier: "standard", uptime_guarantee_pct: 99, dedicated_consultant: false, priority_support: false, notes: "" });
  const [slaCaseTypes, setSlaCaseTypes] = useState(SLA_DEFAULT_TYPES);
  const [slaMatrix, setSlaMatrix]     = useState(() => makeDefaultMatrix());
  const [savingSla, setSavingSla]     = useState(false);

  // Lifecycle config
  const { templates: lcTemplates, getTemplateStages } = useLifecycleTemplates();
  const [lifecycleMode, setLifecycleMode]       = useState("standard");
  const [allowProjOverride, setAllowProjOverride] = useState(true);
  const [allowCaseOverride, setAllowCaseOverride] = useState(true);
  const [savingLifecycle, setSavingLifecycle]   = useState(false);

  useEffect(() => {
    if (!editing) setForm({
      company_name:          profile?.company_name ?? "",
      industry:              profile?.industry ?? "",
      company_size:          profile?.company_size ?? "",
      founded_year:          profile?.founded_year ?? "",
      hq_location:           profile?.hq_location ?? "",
      website:               profile?.website ?? "",
      description:           profile?.description ?? "",
      contact_name:          profile?.contact_name ?? "",
      contact_title:         profile?.contact_title ?? "",
      contact_email:         profile?.contact_email ?? "",
      contact_phone:         profile?.contact_phone ?? "",
      linkedin_url:          profile?.linkedin_url ?? "",
      budget:                profile?.budget ?? "",
      _categories:           profile?.preferred_categories?.join(", ") ?? "",
      notes:                 profile?.notes ?? "",
      preferred_lang:        lang,
    });
  }, [profile, editing, lang]);

  useEffect(() => {
    if (sla && !slaEditing) {
      const m = sla.sla_matrix;
      setSlaForm({
        tier:                 sla.tier                 ?? "standard",
        uptime_guarantee_pct: sla.uptime_guarantee_pct ?? 99,
        dedicated_consultant: sla.dedicated_consultant ?? false,
        priority_support:     sla.priority_support     ?? false,
        notes:                sla.notes                ?? "",
      });
      const cts = m?.case_types ?? SLA_DEFAULT_TYPES;
      setSlaCaseTypes(cts);
      setSlaMatrix(m?.matrix ?? makeDefaultMatrix(cts.map(t => t.key)));
    }
  }, [sla, slaEditing]);

  async function handleSave() {
    setSaving(true);
    try {
      const { _categories, preferred_lang, ...profileData } = form;
      await updateProfile({
        ...profileData,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        preferred_categories: _categories
          ? _categories.split(",").map(s => s.trim()).filter(Boolean)
          : [],
      });
      if (preferred_lang && preferred_lang !== lang) setLang(preferred_lang);
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleSaveSla() {
    setSavingSla(true);
    try {
      await updateSla({ ...slaForm, sla_matrix: { case_types: slaCaseTypes, matrix: slaMatrix } });
      setSlaEditing(false);
    } catch (e) { alert(e.message); }
    setSavingSla(false);
  }

  useEffect(() => {
    if (profile?.case_lifecycle) {
      const lc = profile.case_lifecycle;
      setLifecycleMode(lc.preset ?? "standard");
      setAllowProjOverride(lc.allow_project_override ?? true);
      setAllowCaseOverride(lc.allow_case_override ?? true);
    }
  }, [profile]);

  async function handleSaveLifecycle() {
    setSavingLifecycle(true);
    try {
      await updateProfile({ case_lifecycle: {
        preset: lifecycleMode,
        allow_project_override: allowProjOverride,
        allow_case_override: allowCaseOverride,
      }});
    } catch (e) { alert(e.message); }
    setSavingLifecycle(false);
  }

  const isSapConnType = t => ["sap_gui","sap_hana","sap_rfc","sap_odata"].includes(t);
  const isVpnConnType = t => t === "vpn";

  function handleConnTypeChange(t) {
    const defaultPorts = { postgresql: 5432, mysql: 3306, mssql: 1433, oracle: 1521, mongodb: 27017, sap_hana: 39015, sap_gui: 3200, sap_rfc: 3300, sap_odata: 443, vpn: 1194 };
    setConnForm(p => ({ ...p, db_type: t, port: defaultPorts[t] ?? p.port, meta: {} }));
  }

  async function handleAddConn() {
    if (!connForm.host || (!isVpnConnType(connForm.db_type) && !connForm.db_name)) return;
    setSavingConn(true);
    try {
      await addConnection(connForm);
      setConnForm(defaultConnForm);
      setShowAddConn(false);
    } catch (e) { alert(e.message); }
    setSavingConn(false);
  }

  async function handleAddMember() {
    if (!memberForm.full_name || !memberForm.email) return;
    setSavingMember(true);
    try {
      await addMember(memberForm);
      setMemberForm({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
      setShowAddMember(false);
    } catch (e) { alert(e.message); }
    setSavingMember(false);
  }

  function startEditMember(m) {
    setEditingMemberId(m.id);
    setEditMemberForm({ full_name: m.full_name ?? "", email: m.email ?? "", role_title: m.role_title ?? "", phone: m.phone ?? "", is_primary: m.is_primary ?? false, system_role: m.system_role ?? "" });
    setShowAddMember(false);
  }

  async function handleSaveMember() {
    if (!editMemberForm.full_name || !editMemberForm.email) return;
    setSavingEditMember(true);
    try {
      await updateMember(editingMemberId, editMemberForm);
      setEditingMemberId(null);
    } catch (e) { alert(e.message); }
    setSavingEditMember(false);
  }

  async function handleRemoveMember(id) {
    if (!confirm("Remove this team member?")) return;
    try { await removeMember(id); } catch (e) { alert(e.message); }
  }

  // Activity phases config — hooks must be before early returns
  const [editingPhases, setEditingPhases] = useState(false);
  const [phasesForm, setPhasesForm]       = useState(null);
  const [savingPhases, setSavingPhases]   = useState(false);

  useEffect(() => {
    if (profile && !editingPhases) {
      setPhasesForm(profile.activity_phases ?? DEFAULT_ACTIVITY_PHASES.map(p => ({ ...p, enabled: true })));
    }
  }, [profile, editingPhases]);

  async function handleSavePhases() {
    setSavingPhases(true);
    try {
      await updateProfile({ activity_phases: phasesForm });
      setEditingPhases(false);
    } catch (e) { alert(e.message); }
    setSavingPhases(false);
  }

  const tabs = [
    { id: "overview",     label: t("client_tab.overview"),    icon: Building2,         count: null },
    ...(!isAdminView ? [{ id: "plan", label: "My Plan", icon: CreditCard, count: null }] : []),
    { id: "sla",          label: t("client_tab.sla"),         icon: SlidersHorizontal, count: null },
    { id: "connections",  label: t("client_tab.connections"), icon: Database,          count: connections.length },
    { id: "team",         label: t("client_tab.team"),        icon: Users,             count: members.length },
    { id: "lifecycle",    label: t("client_tab.lifecycle"),   icon: TrendingUp,        count: null },
    { id: "phases",       label: t("client_tab.phases"),      icon: Layers,            count: null },
    { id: "defaults",     label: t("client_tab.defaults"),    icon: ClipboardList,     count: null },
    { id: "assignment",   label: t("client_tab.assignment"),  icon: UserCheck,         count: null },
    { id: "sap",          label: t("client_tab.sap"),         icon: Code2,             count: null },
  ];

  const cpvTabStatus = (() => {
    const r = {};
    for (const t of tabs) {
      if (cpvManualCompletions[t.id] !== undefined) {
        r[t.id] = cpvManualCompletions[t.id] ? "complete" : "none"; continue;
      }
      r[t.id] = "none";
    }
    return r;
  })();

  // Scroll-sync effect must be declared before any early return (Rules of Hooks)
  useEffect(() => {
    setCpvMountedSlides(prev => { const s = new Set(prev); s.add(tab); return s; });
    const el = cpvCarouselRef.current;
    if (!el) return;
    const idx = tabs.findIndex(t => t.id === tab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    cpvCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { cpvCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [tab]);

  if (loading) return <Spinner />;

  const tierColors = { standard: "bg-gray-100 text-gray-700", premium: "bg-blue-100 text-blue-700", enterprise: "bg-violet-100 text-blue-700" };
  const dbTypeColors = {
    postgresql: "bg-blue-100 text-blue-700", mysql: "bg-orange-100 text-orange-700",
    mssql: "bg-red-100 text-red-700", oracle: "bg-red-100 text-red-700",
    mongodb: "bg-green-100 text-green-700",
    sap_gui: "bg-indigo-100 text-indigo-700", sap_hana: "bg-cyan-100 text-cyan-700",
    sap_rfc: "bg-purple-100 text-purple-700", sap_odata: "bg-teal-100 text-teal-700",
    vpn: "bg-slate-100 text-slate-700", other: "bg-gray-100 text-gray-700",
  };
  const connTypeLabels = {
    postgresql: "PostgreSQL", mysql: "MySQL", mssql: "MSSQL", oracle: "Oracle",
    mongodb: "MongoDB", sap_gui: "SAP GUI", sap_hana: "SAP HANA",
    sap_rfc: "SAP RFC", sap_odata: "SAP OData", vpn: "VPN", other: "Other",
  };

  return (
    <div>
      {/* Back button for admin view */}
      {isAdminView && onBack && (
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
          <ChevronLeft size={16} />Back to Settings
        </button>
      )}
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="relative flex-shrink-0">
            {clientAvatarUrl
              ? <img src={clientAvatarUrl} alt="" className="w-16 h-16 rounded-2xl object-cover" />
              : <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                  {profile?.company_name?.[0] ?? auth.profile?.full_name?.[0] ?? "C"}
                </div>
            }
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Change avatar"
              className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              {uploadingAvatar
                ? <Loader2 size={20} className="text-white animate-spin" />
                : <Camera size={20} className="text-white" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {profile?.company_name || auth.profile?.full_name || t("company.title")}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {[profile?.industry, profile?.hq_location].filter(Boolean).join(" · ") || t("company.empty_hint_sub")}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {profile?.company_size && <Badge className="bg-gray-100 text-gray-600">{profile.company_size}</Badge>}
              {profile?.founded_year && <Badge className="bg-gray-100 text-gray-600">{t("company.est_year").replace("{n}", profile.founded_year)}</Badge>}
              {profile?.budget && <Badge className="bg-green-100 text-green-700"><DollarSign className="w-3 h-3 inline mr-0.5" />{profile.budget}</Badge>}
              {(() => {
                const mode = visCfg.getCompanyVisibility(auth.user?.id);
                return mode === 'internal'
                  ? <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1"><Lock className="w-3 h-3" />{t('company.vis_internal')}</Badge>
                  : <Badge className="bg-blue-100 text-blue-700 flex items-center gap-1"><Globe className="w-3 h-3" />{t('company.vis_open')}</Badge>;
              })()}
            </div>
          </div>
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 flex-shrink-0">
            {editing ? t("company.cancel") : t("company.edit")}
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-5">{t("company.edit_title")}</h3>

          <div className="grid grid-cols-2 gap-3">
            <Input label={t("company.name")} value={form.company_name}
              onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
            <Input label={t("company.industry")} value={form.industry}
              onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
              placeholder={t("ob.ph_industry")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label={t("company.size")} value={form.company_size}
              onChange={e => setForm(p => ({ ...p, company_size: e.target.value }))}
              placeholder={t("ob.ph_company_size")} />
            <Input label={t("company.founded")} type="number" value={form.founded_year}
              onChange={e => setForm(p => ({ ...p, founded_year: e.target.value }))} />
            <Input label={t("company.hq")} value={form.hq_location}
              onChange={e => setForm(p => ({ ...p, hq_location: e.target.value }))}
              placeholder={t("company.ph_location")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("company.website")} value={form.website}
              onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
              placeholder={t("company.ph_website")} />
            <Input label={t("company.linkedin")} value={form.linkedin_url}
              onChange={e => setForm(p => ({ ...p, linkedin_url: e.target.value }))}
              placeholder={t("company.ph_linkedin")} />
          </div>
          <Textarea label={t("company.description")} value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder={t("company.ph_about")} />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-1">{t("company.primary_contact")}</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("company.contact_name")} value={form.contact_name}
              onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            <Input label={t("company.contact_title")} value={form.contact_title}
              onChange={e => setForm(p => ({ ...p, contact_title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("company.contact_email")} type="email" value={form.contact_email}
              onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            <Input label={t("company.contact_phone")} value={form.contact_phone}
              onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-1">{t("company.prefs")}</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("company.annual_budget")} value={form.budget}
              onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}
              placeholder={t("proj.ph_budget_eg")} />
            <Input label={t("company.pref_cats")} value={form._categories}
              onChange={e => setForm(p => ({ ...p, _categories: e.target.value }))}
              placeholder={t("company.ph_tags")} />
          </div>
          {!isAdminView && (
            <Select label={t("label.language")} value={form.preferred_lang ?? "en"}
              onChange={e => setForm(p => ({ ...p, preferred_lang: e.target.value }))}
              options={[
                { value: "en", label: t("lang.en") },
                { value: "es", label: t("lang.es") },
              ]} />
          )}
          <Textarea label={t("company.internal_notes")} value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder={t("company.ph_vetting")} />

          <div className="border-t border-gray-100 pt-4 mt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Eye size={11} />{t('company.vis_mode')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'open',     label: t('company.vis_open'),     desc: t('company.vis_open_desc'),    cls: 'border-blue-500 bg-blue-50', lbl: 'text-blue-800' },
                { id: 'internal', label: t('company.vis_internal'), desc: t('company.vis_int_desc'),     cls: 'border-amber-500 bg-amber-50', lbl: 'text-amber-800' },
              ].map(opt => {
                const current = visCfg.getCompanyVisibility(auth.user?.id);
                const isActive = current === opt.id;
                return (
                  <button key={opt.id} type="button"
                    onClick={() => visCfg.setCompanyVisibility(auth.user?.id, opt.id)}
                    className={`p-3 text-left rounded-xl border-2 transition-all ${isActive ? opt.cls : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`text-sm font-bold mb-0.5 ${isActive ? opt.lbl : 'text-gray-700'}`}>{opt.label}</div>
                    <p className={`text-xs leading-tight ${isActive ? opt.lbl + ' opacity-70' : 'text-gray-400'}`}>{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("company.saving") : t("company.save")}
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(() => {
        const done = tabs.filter(t => cpvTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/tabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{tabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, tabs.findIndex(t => t.id === tab));
        function scrollTo(idx) {
          setTab(tabs[Math.max(0, Math.min(idx, tabs.length - 1))]?.id ?? tab);
        }
        function onScroll() {
          if (cpvCarouselScrolling.current) return;
          const el = cpvCarouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const t2 = tabs[closest];
          if (t2 && t2.id !== tab) setTab(t2.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            {carouselIdx < tabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            <div ref={cpvCarouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {tabs.map((tabItem, i) => {
                const isActive = tabItem.id === tab;
                const Icon = tabItem.icon;
                const st = cpvTabStatus[tabItem.id];
                return (
                  <div key={tabItem.id}
                    style={{ flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tabItem.label}</span>
                        {tabItem.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tabItem.count}</span>}
                        {isActive && (
                          <button onClick={e => { e.stopPropagation(); setCpvManualComplete(tabItem.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {cpvMountedSlides.has(tabItem.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

      {/* OVERVIEW TAB */}
      {tabItem.id === "overview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          {!profile && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Building2 size={26} className="text-blue-300" />
              </div>
              <p className="text-gray-700 font-medium">{t("company.empty")}</p>
              <p className="text-gray-400 text-sm mt-1">{t("company.empty_hint")}</p>
            </div>
          )}
          {profile?.description && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("company.about")}</div>
              <p className="text-gray-700 text-sm leading-relaxed">{profile.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {profile?.industry     && <div><span className="text-gray-400">{t("company.industry")}: </span><strong>{profile.industry}</strong></div>}
            {profile?.company_size && <div><span className="text-gray-400">{t("company.size")}: </span><strong>{profile.company_size}</strong></div>}
            {profile?.founded_year && <div><span className="text-gray-400">{t("company.est")} </span><strong>{profile.founded_year}</strong></div>}
            {profile?.hq_location  && <div><span className="text-gray-400">{t("company.hq")}: </span><strong>{profile.hq_location}</strong></div>}
            {profile?.budget       && <div><span className="text-gray-400">{t("label.budget")}: </span><strong>{profile.budget}</strong></div>}
          </div>

          <div className="flex gap-3 flex-wrap">
            {profile?.website && (
              <a href={profile.website} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Globe className="w-3.5 h-3.5 mr-1" /> {t("company.website")}
              </a>
            )}
            {profile?.linkedin_url && (
              <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Link className="w-3.5 h-3.5 mr-1" /> {t("company.linkedin")}
              </a>
            )}
          </div>

          {profile?.preferred_categories?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("company.preferred_areas")}</div>
              <div className="flex flex-wrap gap-2">
                {profile.preferred_categories.map(c => (
                  <span key={c} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("company.primary_contact")}</div>
            {profile?.contact_name ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                  {profile.contact_name[0]}
                </div>
                <div className="text-sm space-y-0.5">
                  <div className="font-semibold text-gray-900">{profile.contact_name}</div>
                  {profile.contact_title && <div className="text-gray-500">{profile.contact_title}</div>}
                  <div className="flex gap-4 text-gray-400 text-xs">
                    {profile.contact_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{profile.contact_email}</span>}
                    {profile.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{profile.contact_phone}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t("company.no_contact")}</p>
            )}
          </div>

          {profile?.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm">
              <div className="font-medium text-amber-800 mb-1">{t("company.notes")}</div>
              <p className="text-gray-700">{profile.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* MY PLAN TAB */}
      {tabItem.id === "plan" && <PlanUsageCard auth={auth} />}

      {/* SLA TAB */}
      {tabItem.id === "sla" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">{t("sla.title")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{t("sla.subtitle")}</p>
            </div>
            <button onClick={() => setSlaEditing(p => !p)}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
              {slaEditing ? t("sla.cancel") : t("sla.edit")}
            </button>
          </div>

          {/* Header fields */}
          {slaEditing ? (
            <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <Select label={t("sla.tier")} value={slaForm.tier}
                  onChange={e => setSlaForm(p => ({ ...p, tier: e.target.value }))}
                  options={[{ value:"standard", label:t("sla.tier_standard") },{ value:"premium", label:t("sla.tier_premium") },{ value:"enterprise", label:t("sla.tier_enterprise") }]} />
                <Input label={t("sla.uptime")} type="number" value={slaForm.uptime_guarantee_pct}
                  onChange={e => setSlaForm(p => ({ ...p, uptime_guarantee_pct: Number(e.target.value) }))} />
              </div>
              <div className="flex gap-6">
                {[["dedicated_consultant", t("sla.dedicated")],["priority_support", t("sla.priority_support")]].map(([k,lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={slaForm[k]} onChange={e => setSlaForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
          ) : sla ? (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <Badge className={tierColors[sla.tier] ?? tierColors.standard}>{SLA_TIER_LABEL_KEYS[sla.tier] ? t(SLA_TIER_LABEL_KEYS[sla.tier]) : cap(sla.tier)} {t("sla.tier_suffix")}</Badge>
              {sla.uptime_guarantee_pct && <Badge className="bg-gray-100 text-gray-700">{sla.uptime_guarantee_pct}{t("sla.uptime_badge")}</Badge>}
              {sla.priority_support    && <Badge className="bg-orange-100 text-orange-700">{t("sla.priority_support")}</Badge>}
              {sla.dedicated_consultant && <Badge className="bg-green-100 text-green-700">{t("sla.dedicated")}</Badge>}
            </div>
          ) : null}

          {/* Legend */}
          {!slaEditing && sla && (
            <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
              <span><span className="text-blue-400 mr-1">↩</span>{t("sla.initial_response")}</span>
              <span><Check size={13} className="text-green-500 mr-1 inline" />{t("sla.resolution")}</span>
            </div>
          )}

          {/* Matrix */}
          {(sla || slaEditing) ? (
            <SlaMatrixEditor caseTypes={slaCaseTypes} matrix={slaMatrix} editing={slaEditing}
              onChangeCaseTypes={setSlaCaseTypes} onChangeMatrix={setSlaMatrix} />
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="mb-2 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
              <p className="text-sm mb-4">{t("sla.none")}</p>
              <button onClick={() => setSlaEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                {t("sla.configure")}
              </button>
            </div>
          )}

          {/* Notes + actions */}
          {slaEditing ? (
            <div className="mt-5 space-y-4">
              <Textarea label={t("sla.notes")} value={slaForm.notes} onChange={e => setSlaForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={t("sla.extra_terms")} />
              <div className="flex justify-end gap-3">
                <button onClick={() => setSlaEditing(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
                <button onClick={handleSaveSla} disabled={savingSla}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingSla ? t("sla.saving") : t("sla.save")}
                </button>
              </div>
            </div>
          ) : sla?.notes ? (
            <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-gray-700">
              <div className="font-medium text-yellow-800 mb-1">{t("sla.notes")}</div>
              {sla.notes}
            </div>
          ) : null}
        </div>
      )}

      {/* DB CONNECTIONS TAB */}
      {tabItem.id === "connections" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">{t("conn.title")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {connections.length === 1 ? t("conn.subtitle_one") : t("conn.subtitle_many").replace("{n}", connections.length)}
              </p>
            </div>
            <button onClick={() => setShowAddConn(p => !p)}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
              {t("conn.add_btn")}
            </button>
          </div>

          {showAddConn && (
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("conn.type_label")}</label>
                  <select value={connForm.db_type} onChange={e => handleConnTypeChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <optgroup label={t("conn.group_db")}>
                      {["postgresql","mysql","mssql","oracle","mongodb","other"].map(ty => (
                        <option key={ty} value={ty}>{connTypeLabels[ty]}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t("conn.group_sap")}>
                      {["sap_gui","sap_hana","sap_rfc","sap_odata"].map(ty => (
                        <option key={ty} value={ty}>{connTypeLabels[ty]}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t("conn.group_net")}>
                      <option value="vpn">VPN</option>
                    </optgroup>
                  </select>
                </div>
                <Input label={isSapConnType(connForm.db_type) ? t("conn.host_sap") : isVpnConnType(connForm.db_type) ? t("conn.host_vpn") : t("conn.host_db")}
                  value={connForm.host} onChange={e => setConnForm(p => ({ ...p, host: e.target.value }))}
                  placeholder={isSapConnType(connForm.db_type) ? "saphost.example.com" : "host.example.com"} />
              </div>
              {!isSapConnType(connForm.db_type) && !isVpnConnType(connForm.db_type) && (
                <div className="grid grid-cols-3 gap-3">
                  <Input label={t("conn.port")} type="number" value={connForm.port} onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} />
                  <Input label={t("conn.db_name")} value={connForm.db_name} onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} />
                  <Input label={t("conn.username")} value={connForm.username} onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} />
                </div>
              )}
              {(connForm.db_type === "sap_gui" || connForm.db_type === "sap_rfc") && (
                <div className="grid grid-cols-4 gap-3">
                  <Input label={t("conn.sys_num")} type="number" value={connForm.port} onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="00" />
                  <Input label={t("conn.sys_id")} value={connForm.db_name} onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} placeholder="PRD" />
                  <Input label={t("conn.sap_client_lbl")} value={connForm.meta?.sap_client ?? ""} onChange={e => setConnForm(p => ({ ...p, meta: { ...p.meta, sap_client: e.target.value } }))} placeholder="100" />
                  <Input label={t("conn.username")} value={connForm.username} onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} />
                </div>
              )}
              {connForm.db_type === "sap_hana" && (
                <div className="grid grid-cols-3 gap-3">
                  <Input label={t("conn.port")} type="number" value={connForm.port} onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="39015" />
                  <Input label={t("conn.db_schema")} value={connForm.db_name} onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} />
                  <Input label={t("conn.username")} value={connForm.username} onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} />
                </div>
              )}
              {connForm.db_type === "sap_odata" && (
                <div className="grid grid-cols-3 gap-3">
                  <Input label={t("conn.port")} type="number" value={connForm.port} onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="443" />
                  <Input label={t("conn.svc_path")} value={connForm.db_name} onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} placeholder="/sap/opu/odata/sap/..." />
                  <Input label={t("conn.user_oauth")} value={connForm.username} onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} />
                </div>
              )}
              {isSapConnType(connForm.db_type) && (
                <SapProfileFields meta={connForm.meta} onChange={meta => setConnForm(p => ({ ...p, meta }))} dbType={connForm.db_type} />
              )}
              {isVpnConnType(connForm.db_type) && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("conn.vpn_protocol")}</label>
                    <select value={connForm.meta?.vpn_protocol ?? "OpenVPN"}
                      onChange={e => setConnForm(p => ({ ...p, meta: { ...p.meta, vpn_protocol: e.target.value } }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {["OpenVPN","IPSec/IKEv2","WireGuard","SSL/TLS","PPTP","L2TP"].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <Input label={t("conn.port")} type="number" value={connForm.port} onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} placeholder="1194" />
                  <Input label={t("conn.vpn_profile")} value={connForm.db_name} onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} placeholder={t("conn.ph_vpn_profile")} />
                </div>
              )}
              <Textarea label={t("conn.notes")} value={connForm.notes}
                onChange={e => setConnForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={isSapConnType(connForm.db_type) ? t("conn.ph_access_vpn") : isVpnConnType(connForm.db_type) ? t("conn.ph_access_pki") : t("conn.ph_access_other")} />
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddConn(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
                <button onClick={handleAddConn} disabled={savingConn}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingConn ? t("conn.adding") : t("conn.add_action")}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {connections.map(conn => (
              <div key={conn.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={dbTypeColors[conn.db_type] ?? dbTypeColors.other}>{connTypeLabels[conn.db_type] ?? conn.db_type?.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-semibold text-gray-800">
                      {isSapConnType(conn.db_type) ? (conn.db_name || conn.host) : isVpnConnType(conn.db_type) ? (conn.db_name || conn.host) : conn.db_name}
                    </span>
                    {conn.meta?.sap_client && <span className="text-xs text-gray-500 font-mono">{t("conn.sap_client_num").replace("{n}", conn.meta.sap_client)}</span>}
                    {conn.meta?.vpn_protocol && <span className="text-xs text-indigo-500 font-mono">{conn.meta.vpn_protocol}</span>}
                  </div>
                  <button onClick={() => deleteConnection(conn.id)}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-100 hover:bg-red-50">
                    {t("action.remove")}
                  </button>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {conn.username && <span>{conn.username}@</span>}{conn.host}{conn.port ? `:${conn.port}` : ""}
                  {isSapConnType(conn.db_type) && conn.db_name && conn.db_name !== conn.host && <span className="ml-2 text-gray-400">SID: {conn.db_name}</span>}
                </div>
                {isSapConnType(conn.db_type) && <SapProfileBadges meta={conn.meta ?? {}} />}
                {conn.notes && <p className="text-xs text-gray-400 mt-2">{conn.notes}</p>}
              </div>
            ))}
            {connections.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">{t("conn.empty")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAM TAB */}
      {tabItem.id === "team" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">{t("team.title")}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{t("team.subtitle")}</p>
            </div>
            <button onClick={() => setShowAddMember(p => !p)}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
              {t("team.add_btn")}
            </button>
          </div>

          {showAddMember && (
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("team.name_label")} value={memberForm.full_name}
                  onChange={e => setMemberForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
                <Input label={t("team.email_label")} type="email" value={memberForm.email}
                  onChange={e => setMemberForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Job Title" value={memberForm.role_title}
                  onChange={e => setMemberForm(p => ({ ...p, role_title: e.target.value }))} placeholder={t("contact.ph_role_title")} />
                <Input label={t("team.phone_label")} value={memberForm.phone}
                  onChange={e => setMemberForm(p => ({ ...p, phone: e.target.value }))} placeholder={t("contact.ph_phone")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
                <select value={memberForm.system_role}
                  onChange={e => setMemberForm(p => ({ ...p, system_role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— No system role —</option>
                  <option value="key_user">Key User</option>
                  <option value="final_user">Final User</option>
                  <option value="internal_consultant">Internal Consultant</option>
                  <option value="project_manager">Project Manager</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={memberForm.is_primary}
                  onChange={e => setMemberForm(p => ({ ...p, is_primary: e.target.checked }))}
                  className="rounded accent-blue-600" />
                {t("team.primary_label")}
              </label>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddMember(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
                <button onClick={handleAddMember} disabled={savingMember}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingMember ? t("team.adding") : t("team.add_action")}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {members.map(m => (
              <div key={m.id} className="border border-gray-100 rounded-xl p-4">
                {editingMemberId === m.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input label={t("team.name_label")} value={editMemberForm.full_name}
                        onChange={e => setEditMemberForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
                      <Input label={t("team.email_label")} type="email" value={editMemberForm.email}
                        onChange={e => setEditMemberForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="Job Title" value={editMemberForm.role_title}
                        onChange={e => setEditMemberForm(p => ({ ...p, role_title: e.target.value }))} placeholder={t("contact.ph_role_title")} />
                      <Input label={t("team.phone_label")} value={editMemberForm.phone}
                        onChange={e => setEditMemberForm(p => ({ ...p, phone: e.target.value }))} placeholder={t("contact.ph_phone")} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
                      <select value={editMemberForm.system_role ?? ""}
                        onChange={e => setEditMemberForm(p => ({ ...p, system_role: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">— No system role —</option>
                        <option value="key_user">Key User</option>
                        <option value="final_user">Final User</option>
                        <option value="internal_consultant">Internal Consultant</option>
                        <option value="project_manager">Project Manager</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editMemberForm.is_primary}
                        onChange={e => setEditMemberForm(p => ({ ...p, is_primary: e.target.checked }))}
                        className="rounded accent-blue-600" />
                      {t("team.primary_label")}
                    </label>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingMemberId(null)} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">{t("action.cancel")}</button>
                      <button onClick={handleSaveMember} disabled={savingEditMember}
                        className="px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {savingEditMember ? t("action.saving") : t("action.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {m.full_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">{m.full_name}</span>
                          <MemberStatusIcon email={m.email} />
                          {m.is_primary && <Badge className="bg-blue-100 text-blue-700">{t("team.primary_badge")}</Badge>}
                          {m.system_role === "key_user"            && <Badge className="bg-indigo-100 text-indigo-700">Key User</Badge>}
                          {m.system_role === "final_user"          && <Badge className="bg-teal-100 text-teal-700">Final User</Badge>}
                          {m.system_role === "internal_consultant" && <Badge className="bg-indigo-100 text-indigo-700">Internal Consultant</Badge>}
                          {m.system_role === "project_manager"     && <Badge className="bg-rose-100 text-rose-700">Project Manager</Badge>}
                        </div>
                        {m.role_title && <div className="text-xs text-gray-500">{m.role_title}</div>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEditMember(m)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleRemoveMember(m.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5">
                      {m.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{m.email}</div>}
                      {m.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{m.phone}</div>}
                    </div>
                  </>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">{t("team.empty")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIFECYCLE TAB */}
      {tabItem.id === "lifecycle" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t("lifecycle.title")}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{t("lifecycle.subtitle")}</p>
          </div>

          {/* Template preset cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(lcTemplates.length ? lcTemplates : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }))).map(tmpl => {
              const isSelected = lifecycleMode === tmpl.key;
              const active = tmpl.stages.filter(s => !s.is_terminal);
              const isBuiltin = ["short","standard","full"].includes(tmpl.key);
              return (
                <button key={tmpl.key} onClick={() => setLifecycleMode(tmpl.key)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-900">{isBuiltin ? t(`lc.preset_${tmpl.key}_name`) : tmpl.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{isBuiltin ? t(`lc.preset_${tmpl.key}_subtitle`) : (tmpl.subtitle ?? "")}</span>
                  </div>
                  <p className="text-xs text-gray-500">{isBuiltin ? t(`lc.preset_${tmpl.key}_desc`) : (tmpl.description ?? "")}</p>
                </button>
              );
            })}
          </div>

          {/* Flow preview */}
          {(() => {
            const stages = getTemplateStages(lifecycleMode);
            const active = stages.filter(s => !s.is_terminal);
            const terminal = stages.filter(s => s.is_terminal);
            return (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("lifecycle.flow_preview")}</p>
                <div className="flex items-center flex-wrap gap-2">
                  {active.map((s, i) => (
                    <span key={s.key} className="flex items-center gap-2">
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                        style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                      {i < active.length - 1 && <span className="text-gray-300 text-sm">→</span>}
                    </span>
                  ))}
                  {terminal.length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="text-gray-300 text-sm">→</span>
                      {terminal.map(s => (
                        <span key={s.key} className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                          style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Override toggles */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("lifecycle.override_title")}</p>
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium text-gray-700">{t("lifecycle.allow_proj")}</p>
                <p className="text-xs text-gray-400">{t("lifecycle.allow_proj_desc")}</p>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-4 ${allowProjOverride ? "bg-[#1A4B8C]" : "bg-gray-200"}`}
                onClick={() => setAllowProjOverride(p => !p)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allowProjOverride ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium text-gray-700">{t("lifecycle.allow_case")}</p>
                <p className="text-xs text-gray-400">{t("lifecycle.allow_case_desc")}</p>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-4 ${allowCaseOverride ? "bg-[#1A4B8C]" : "bg-gray-200"}`}
                onClick={() => setAllowCaseOverride(p => !p)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allowCaseOverride ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleSaveLifecycle} disabled={savingLifecycle}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {savingLifecycle ? t("state.saving") : t("lifecycle.save")}
            </button>
          </div>
        </div>
      )}

      {/* Activity Phases Config */}
      {tabItem.id === "phases" && phasesForm && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t("phases.title")}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{t("phases.subtitle")}</p>
            </div>
            {!editingPhases ? (
              <button onClick={() => setEditingPhases(true)}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-4 py-2">
                {t("phases.edit")}
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditingPhases(false); setPhasesForm(profile?.activity_phases ?? DEFAULT_ACTIVITY_PHASES.map(p => ({ ...p, enabled: true }))); }}
                  className="text-sm text-gray-500 px-3 py-1.5">{t("action.cancel")}</button>
                <button onClick={handleSavePhases} disabled={savingPhases}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
                  {savingPhases ? t("state.saving") : t("phases.save")}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {phasesForm.map((phase, idx) => (
              <div key={phase.key} className={`border rounded-xl p-4 transition-all ${(phase.enabled ?? true) ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: phase.color }} />

                  {editingPhases ? (
                    <>
                      <input value={phase.label}
                        onChange={e => setPhasesForm(prev => prev.map((p, i) => i === idx ? { ...p, label: e.target.value } : p))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      <input type="color" value={phase.color}
                        onChange={e => setPhasesForm(prev => prev.map((p, i) => i === idx ? { ...p, color: e.target.value } : p))}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" title={t("phase.color_tooltip")} />
                      <div className="flex-shrink-0">
                        <label className="text-xs font-semibold text-gray-500 block mb-1">{t("phases.req_status")}</label>
                        <select value={phase.required_status ?? ""}
                          onChange={e => setPhasesForm(prev => prev.map((p, i) => i === idx ? { ...p, required_status: e.target.value || null } : p))}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="">{t("phases.status_none")}</option>
                          <option value="in_progress">{t("act.in_progress")}</option>
                          <option value="technical_test">{t("cd.phase_technical_test")}</option>
                          <option value="functional_test">{t("cd.phase_functional_test")}</option>
                          <option value="user_test">{t("cd.phase_user_test")}</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
                        <input type="checkbox" checked={phase.enabled ?? true}
                          onChange={e => setPhasesForm(prev => prev.map((p, i) => i === idx ? { ...p, enabled: e.target.checked } : p))}
                          className="accent-blue-600" />
                        {t("phases.active_label")}
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <span className="font-semibold text-gray-900 text-sm">{phase.label}</span>
                        {phase.required_status && (
                          <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            {t("phases.requires").replace("{status}", phase.required_status.replace(/_/g, " "))}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(phase.enabled ?? true) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {(phase.enabled ?? true) ? t("phases.active") : t("phases.disabled")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {editingPhases && (
            <button
              onClick={() => setPhasesForm(DEFAULT_ACTIVITY_PHASES.map(p => ({ ...p, enabled: true })))}
              className="text-xs text-gray-400 hover:text-gray-600 underline">
              {t("phases.reset")}
            </button>
          )}

        </div>
      )}

      {tabItem.id === "defaults" && (
        <CaseDefaultsPanel profile={profile} updateProfile={updateProfile} />
      )}

      {tabItem.id === "assignment" && (
        <AssignmentSettingsPanel profile={profile} updateProfile={updateProfile} />
      )}

      {tabItem.id === "sap" && (
        <div className="space-y-6">
          <SapIntegrationPanel clientId={effectiveClientId} auth={auth} />
          <AbapStandardsPanel level="client" entityId={effectiveClientId} auth={auth} />
        </div>
      )}

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
            <div style={{ marginTop:10, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {tabs.map((tabItem, i) => {
                const Icon = tabItem.icon;
                const isActive = tabItem.id === tab;
                const st = cpvTabStatus[tabItem.id];
                return (
                  <button key={tabItem.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>}
                    <span>{tabItem.label}</span>
                    {tabItem.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tabItem.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// V9: INVOICES VIEW
// ============================================================
function InvoicesView({ auth }) {
  const { t } = useT();
  const clientFilter = auth.isClient ? { client_id: auth.user?.id } : {};
  const { invoices, loading, createInvoice, updateInvoice, deleteInvoice } = useInvoices(clientFilter);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "" });
  const [saving, setSaving]             = useState(false);
  const [cases, setCases]               = useState([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title, client_id").order("title");
      if (auth.isClient) q = q.eq("client_id", auth.user?.id);
      const { data } = await q;
      setCases(data ?? []);
    })();
  }, [auth]);

  const displayed = statusFilter ? invoices.filter(i => i.status === statusFilter) : invoices;
  const totalBilled      = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalPaid        = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOutstanding = invoices.filter(i => ["sent","overdue"].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0);

  async function handleCreate() {
    setSaving(true);
    try {
      await createInvoice({
        ...form,
        amount: Number(form.amount),
        client_id: auth.isClient ? auth.user?.id : form.client_id,
        invoice_number: form.invoice_number || `INV-${Date.now()}`,
      });
      setShowCreate(false);
      setForm({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "" });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("invoices.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{invoices.length === 1 ? t("invoices.count_one") : t("invoices.count_many").replace("{n}", invoices.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            {t("invoices.new")}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t("invoices.total_billed"), value: `$${totalBilled.toLocaleString()}`,      color: "bg-blue-50 text-blue-700" },
          { label: t("invoices.paid"),          value: `$${totalPaid.toLocaleString()}`,        color: "bg-green-50 text-green-700" },
          { label: t("invoices.outstanding"),   value: `$${totalOutstanding.toLocaleString()}`, color: "bg-orange-50 text-orange-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t("invoices.all_statuses")}</option>
          {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{INV_STATUS_LABEL_KEYS[s] ? t(INV_STATUS_LABEL_KEYS[s]) : cap(s)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_num")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_client")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_case")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_amount")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_status")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_due")}</th>
              {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {displayed.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-sm text-gray-700">{inv.invoice_number || `INV-${inv.id?.slice(0,8)}`}</td>
                <td className="px-5 py-4">
                  <div className="font-medium text-gray-900">{inv.client?.client_profiles?.company_name ?? inv.client?.full_name ?? "—"}</div>
                </td>
                <td className="px-5 py-4 text-gray-500">{inv.case?.title ?? "—"}</td>
                <td className="px-5 py-4 font-semibold text-gray-900">${(inv.amount ?? 0).toLocaleString()}</td>
                <td className="px-5 py-4">
                  <Badge className={INVOICE_STATUS_COLORS[inv.status] ?? INVOICE_STATUS_COLORS.draft}>{INV_STATUS_LABEL_KEYS[inv.status] ? t(INV_STATUS_LABEL_KEYS[inv.status]) : cap(inv.status)}</Badge>
                </td>
                <td className="px-5 py-4 text-gray-500">{fmtDate(inv.due_date)}</td>
                {(auth.isAdmin || auth.isManager) && (
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      {inv.status === "draft" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "sent" })}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100 hover:bg-blue-100">
                          {t("action.send")}
                        </button>
                      )}
                      {inv.status === "sent" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "paid" })}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-100 hover:bg-green-100">
                          {t("action.mark_paid")}
                        </button>
                      )}
                      {(inv.status === "sent" || inv.status === "draft") && (
                        <button onClick={() => updateInvoice(inv.id, { status: "overdue" })}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded border border-red-100 hover:bg-red-100">
                          {t("invoices.overdue")}
                        </button>
                      )}
                      <button onClick={() => deleteInvoice(inv.id)}
                        className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded border border-gray-100 hover:bg-gray-100">
                        {t("action.delete")}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">{t("invoices.none")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("invoices.new_title")}>
        <Input label={t("invoices.number")} value={form.invoice_number}
          onChange={e => setForm(p => ({ ...p, invoice_number: e.target.value }))}
          placeholder={t("invoices.ph_number")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t("invoices.amount_label")} type="number" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          <Select label={t("label.status")} value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            options={["draft","sent","paid","overdue"].map(s => ({ value: s, label: INV_STATUS_LABEL_KEYS[s] ? t(INV_STATUS_LABEL_KEYS[s]) : cap(s) }))} />
        </div>
        <Input label={t("invoices.col_due")} type="date" value={form.due_date}
          onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.col_case")}</label>
          <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">{t("invoices.case_opt")}</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <Textarea label={t("label.notes")} value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder={t("invoices.notes_ph")} />
        <div className="flex justify-end gap-3 mt-2">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("invoices.creating") : t("invoices.create")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// V9: KANBAN CARD  (hoisted so React never remounts on re-render)
// ============================================================
const PRIORITY_DOT = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#6b7280" };

function KanbanCard({ c, cardSize, cols, canMove, movingId, onSelect, onMove }) {
  const priority1 = cap(c.priority)?.[0] ?? "?";
  const company   = c.client?.client_profiles?.company_name;
  const project   = c.project ?? { name: company || c.client?.full_name || c.title, client: c.client };

  const MoveSelect = canMove ? (
    <div className="mt-2 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
      <select disabled={movingId === c.id}
        value={c.status}
        onChange={e => onMove(c.id, e.target.value)}
        className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
        {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
      </select>
    </div>
  ) : null;

  if (cardSize === "s") {
    return (
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-2 py-1.5 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-1.5 min-w-0"
        onClick={() => onSelect(c)}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIORITY_DOT[c.priority] ?? "#6b7280" }} />
        <span className="text-xs text-gray-800 font-medium truncate flex-1 min-w-0">{c.title}</span>
      </div>
    );
  }

  if (cardSize === "l") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onSelect(c)}>
        <div className="flex items-start gap-2 mb-2">
          <ProjectAvatar project={project} size={36} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <span className="font-semibold text-sm text-gray-900 line-clamp-3 flex-1 break-words">{c.title}</span>
              <Badge className={`${PRIORITY_COLORS[c.priority]} flex-shrink-0 text-xs ml-1`}>{priority1}</Badge>
            </div>
            {company && <div className="text-xs text-gray-400 mt-0.5 truncate">{company}</div>}
          </div>
        </div>
        {c.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">{c.description}</p>}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1">
            {(c.case_assignments ?? []).slice(0, 4).map((a, i) => (
              <PersonAvatar key={i} name={a.users?.full_name} avatarUrl={a.users?.avatar_url} size={26} className="border-2 border-white" />
            ))}
          </div>
          {c.due_date && <span className="text-xs text-gray-400">{fmtDate(c.due_date)}</span>}
        </div>
        {canMove && (
          <div className="mt-3 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
            <select disabled={movingId === c.id} value={c.status} onChange={e => onMove(c.id, e.target.value)}
              className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
              {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  // Medium (default)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(c)}>
      <div className="flex items-start gap-2 mb-1">
        <ProjectAvatar project={project} size={32} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="font-medium text-sm text-gray-900 line-clamp-2 flex-1 break-words">{c.title}</span>
            <Badge className={`${PRIORITY_COLORS[c.priority]} flex-shrink-0 text-xs`}>{priority1}</Badge>
          </div>
          {company && <div className="text-xs text-gray-400 mt-0.5 truncate">{company}</div>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex -space-x-1">
          {(c.case_assignments ?? []).slice(0, 3).map((a, i) => (
            <PersonAvatar key={i} name={a.users?.full_name} avatarUrl={a.users?.avatar_url} size={24} className="border-2 border-white" />
          ))}
        </div>
        {c.due_date && <span className="text-xs text-gray-400">{fmtDate(c.due_date)}</span>}
      </div>
      {canMove && (
        <div className="mt-2 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
          <select disabled={movingId === c.id} value={c.status} onChange={e => onMove(c.id, e.target.value)}
            className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
            {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ============================================================
// V9: KANBAN VIEW
// ============================================================
function KanbanView({ auth }) {
  const { t } = useT();
  const { cases: _rawCasesKB, loading, updateCase } = useCases();
  const _kanbanVisCfg = useVisibilitySettings();
  const cases = filterCasesByVisibility(_rawCasesKB, auth, _kanbanVisCfg);
  const { templates: lcTemplates } = useLifecycleTemplates();
  const [selectedCase, setSelectedCase]       = useState(null);
  const [movingId, setMovingId]               = useState(null);
  const [cardSize, setCardSize]               = useState("m"); // "s" | "m" | "l"
  const [kanbanProject, setKanbanProject]     = useState(""); // "" = all

  const filteredCases = cases.filter(c => {
    if (auth.isClient)     return c.client_id === auth.user?.id;
    if (auth.isConsultant) return c.case_assignments?.some(a => a.consultant_id === auth.user?.id);
    if (auth.isKeyUser)    return c.case_key_users?.some(ku => ku.user_id === auth.user?.id);
    return true;
  });

  // Unique projects for the filter bar
  const kanbanProjects = (() => {
    const seen = new Set();
    const list = [];
    filteredCases.forEach(c => {
      if (c.project_id && !seen.has(c.project_id)) {
        seen.add(c.project_id);
        list.push({ id: c.project_id, name: c.project?.name || c.client?.client_profiles?.company_name || "Project" });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const boardCases = kanbanProject ? filteredCases.filter(c => c.project_id === kanbanProject) : filteredCases;

  // Build a stage catalog from all known presets + custom DB templates
  const stageCatalog = {};
  Object.values(LIFECYCLE_PRESETS).forEach(preset =>
    preset.stages.forEach(s => { stageCatalog[s.key] = s; })
  );
  lcTemplates.forEach(tpl =>
    (tpl.stages ?? []).forEach(s => { stageCatalog[s.key] = s; })
  );

  // Derive columns from statuses actually present in visible (project-filtered) cases
  const usedKeys = [...new Set(boardCases.map(c => c.status).filter(Boolean))];
  const kanbanCols = usedKeys
    .map(key => stageCatalog[key] ?? { key, label: cap(key.replace(/_/g, " ")), color: "#9ca3af", is_terminal: false })
    .sort((a, b) => (a.is_terminal ? 1 : 0) - (b.is_terminal ? 1 : 0));

  async function handleMove(caseId, newStatus) {
    if (newStatus === cases.find(c => c.id === caseId)?.status) return;
    setMovingId(caseId);
    try { await updateCase(caseId, { status: newStatus }); }
    catch (e) { alert(e.message); }
    setMovingId(null);
  }

  if (loading) return <Spinner />;

  if (selectedCase) {
    return (
      <CaseDetail
        caseData={selectedCase}
        auth={auth}
        onBack={() => setSelectedCase(null)}
        onStatusChange={async (id, status, extras = {}) => {
          await updateCase(id, { status, ...extras });
          setSelectedCase(prev => ({ ...prev, status }));
        }}
        onDelete={async () => { await updateCase(selectedCase.id, { status: "cancelled" }); setSelectedCase(null); }}
        onUpdate={async (id, payload) => {
          await updateCase(id, payload);
          setSelectedCase(prev => ({ ...prev, ...payload }));
        }}
      />
    );
  }

  const canMove = auth.isAdmin || auth.isManager;

  // Column header height varies by size
  const colHeaderPy = cardSize === "s" ? "pt-2 pb-1" : "pt-4 pb-2";
  const colPadding  = cardSize === "s" ? "p-1.5" : "p-3";
  const colGap      = cardSize === "s" ? "space-y-1" : "space-y-2";
  const colMinH     = cardSize === "s" ? "min-h-12" : "min-h-20";
  const colRadius   = cardSize === "s" ? "rounded-xl" : "rounded-2xl";
  const borderTop   = cardSize === "s" ? "3px" : "4px";

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("kanban.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("kanban.subtitle")} · {t("kanban.case_count").replace("{n}", boardCases.length)}</p>
        </div>
        {/* Size toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {[["s","S"],["m","M"],["l","L"]].map(([val, label]) => (
            <button key={val}
              onClick={() => setCardSize(val)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${cardSize === val ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Project filter bar ── */}
      {kanbanProjects.length > 1 && (
        <div className="mb-4 -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-2 pb-1" style={{ width: "max-content" }}>
            <button
              onClick={() => setKanbanProject("")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                kanbanProject === "" ? "bg-gray-800 text-white border-gray-800 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}>
              <FolderKanban size={14} />
              All projects
              <span className="opacity-60 text-xs ml-0.5">{filteredCases.length}</span>
            </button>
            {kanbanProjects.map(p => (
              <button key={p.id}
                onClick={() => setKanbanProject(id => id === p.id ? "" : p.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                  kanbanProject === p.id ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}>
                <FolderOpen size={14} />
                {p.name}
                <span className="opacity-60 text-xs ml-0.5">{filteredCases.filter(c => c.project_id === p.id).length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {kanbanCols.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          {t("kanban.no_cases")}
        </div>
      ) : (
        <div className="grid items-start"
          style={{
            gap: cardSize === "s" ? "8px" : "12px",
            gridTemplateColumns: `repeat(${kanbanCols.length}, minmax(0, 1fr))`,
          }}>
          {kanbanCols.map(col => {
            const colCases = boardCases.filter(c => c.status === col.key);
            return (
              <div key={col.key} className={`${colRadius} border border-gray-100 shadow-sm overflow-hidden`}
                style={{ borderTop: `${borderTop} solid ${col.color}`, background: col.color + "0d" }}>
                <div className={`px-3 ${colHeaderPy} flex items-center justify-between`}>
                  <span className={`font-semibold ${cardSize === "s" ? "text-xs" : "text-sm"} truncate`} style={{ color: col.color }}>{col.label}</span>
                  <span className={`${cardSize === "s" ? "text-[10px]" : "text-xs"} text-gray-400 bg-white rounded-full px-1.5 py-0.5 border border-gray-100 flex-shrink-0 ml-1`}>{colCases.length}</span>
                </div>
                <div className={`${colPadding} ${colGap} ${colMinH} flex flex-col`}>
                  {colCases.map(c => (
                    <KanbanCard key={c.id} c={c}
                      cardSize={cardSize} cols={kanbanCols}
                      canMove={canMove} movingId={movingId}
                      onSelect={setSelectedCase} onMove={handleMove} />
                  ))}
                  {colCases.length === 0 && (
                    <div className="text-center py-4 text-gray-300 text-xs">{t("kanban.empty_col")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// V9: TIME ENTRIES VIEW
// ============================================================
function TimeEntriesView({ auth }) {
  const { t } = useT();
  const { entries, loading, addTimeEntry, approveEntry, deleteEntry } = useTimeEntries();

  // Period
  const _today = new Date();
  const _todayStr = _today.toISOString().slice(0, 10);
  const [period, setPeriod]           = useState("month");
  const [dateFrom, setDateFrom]       = useState(() => new Date(_today.getFullYear(), _today.getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo]           = useState(() => new Date(_today.getFullYear(), _today.getMonth() + 1, 0).toISOString().slice(0, 10));

  // UI state
  const [tab, setTab]                       = useState("raw");
  const [filterConsultant, setFilterConsultant] = useState("");
  const [filterCase, setFilterCase]         = useState("");
  const [pendingOnly, setPendingOnly]       = useState(false);
  const [expandedConsultant, setExpandedConsultant] = useState(null);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState({ case_id: "", date: _todayStr, hours: 1, description: "", is_billable: true });
  const [saving, setSaving]                 = useState(false);
  const [approvingId, setApprovingId]       = useState(null);
  const [cases, setCases]                   = useState([]);
  const [consultantRates, setConsultantRates] = useState({});

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title, estimated_hours, budget").order("title");
      if (auth.isConsultant) {
        const { data: asgn } = await supabase.from("case_assignments").select("case_id").eq("consultant_id", auth.user?.id);
        const ids = (asgn ?? []).map(a => a.case_id);
        if (ids.length) q = q.in("id", ids); else { setCases([]); return; }
      }
      const { data } = await q;
      setCases(data ?? []);
    })();
  }, [auth]);

  useEffect(() => {
    if (auth.isConsultant) return;
    supabase.from("consultant_profiles").select("user_id, hourly_rate").then(({ data }) => {
      const map = {};
      (data ?? []).forEach(p => { map[p.user_id] = p.hourly_rate; });
      setConsultantRates(map);
    });
  }, [auth]);

  function setPeriodPreset(p) {
    setPeriod(p);
    const d = new Date();
    if (p === "week") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setDateFrom(mon.toISOString().slice(0, 10));
      setDateTo(sun.toISOString().slice(0, 10));
    } else if (p === "month") {
      setDateFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
      setDateTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else if (p === "lastmonth") {
      setDateFrom(new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10));
      setDateTo(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10));
    }
  }

  const filtered = entries.filter(e => {
    if (auth.isConsultant && e.consultant_id !== auth.user?.id) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    if (filterConsultant && e.consultant_id !== filterConsultant) return false;
    if (filterCase       && e.case_id        !== filterCase)       return false;
    if (pendingOnly      && e.is_approved)                         return false;
    return true;
  });

  const totalH    = filtered.reduce((s, e) => s + (e.hours ?? 0), 0);
  const billableH = filtered.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
  const pendingCount = filtered.filter(e => !e.is_approved).length;

  // Group by consultant
  const byConsultant = {};
  filtered.forEach(e => {
    const cid = e.consultant_id ?? 'unknown';
    if (!byConsultant[cid]) byConsultant[cid] = { id: cid, name: e.consultant?.full_name ?? 'Unknown', avatarUrl: e.consultant?.avatar_url ?? null, rate: consultantRates[cid], entries: [] };
    byConsultant[cid].entries.push(e);
  });
  const consultantGroups = Object.values(byConsultant);
  const pendingConsultants = consultantGroups.filter(g => g.entries.some(e => !e.is_approved)).length;

  // Group by case
  const byCase = {};
  filtered.forEach(e => {
    const cid = e.case_id ?? 'unknown';
    if (!byCase[cid]) byCase[cid] = { id: cid, title: e.case?.title ?? 'No case', estimatedHours: e.case?.estimated_hours, budget: e.case?.budget, entries: [] };
    byCase[cid].entries.push(e);
  });
  const caseGroups = Object.values(byCase).sort((a, b) =>
    b.entries.reduce((s, e) => s + (e.hours ?? 0), 0) - a.entries.reduce((s, e) => s + (e.hours ?? 0), 0)
  );

  // Dropdown options derived from all entries (not just filtered)
  const consultantOptions = [...new Map(entries.filter(e => e.consultant?.full_name).map(e => [e.consultant_id, e.consultant.full_name])).entries()];
  const caseOptions       = [...new Map(entries.filter(e => e.case?.title).map(e => [e.case_id, e.case.title])).entries()];

  function exportCSV() {
    const rows = [['Date', 'Consultant', 'Case', 'Hours', 'Billable', 'Approved', 'Description']];
    filtered.forEach(e => rows.push([e.date, e.consultant?.full_name ?? '', e.case?.title ?? '', e.hours,
      e.is_billable ? 'Yes' : 'No', e.is_approved ? 'Yes' : 'No', e.description ?? '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `time-entries-${dateFrom}-${dateTo}.csv`,
    });
    a.click();
  }

  async function bulkApprove(consultantId) {
    setApprovingId(consultantId);
    try {
      const pending = byConsultant[consultantId]?.entries.filter(e => !e.is_approved) ?? [];
      for (const e of pending) await approveEntry(e.id, true);
    } finally { setApprovingId(null); }
  }

  async function handleAdd() {
    if (!form.hours || !form.description.trim()) return;
    setSaving(true);
    try {
      await addTimeEntry({ ...form, hours: Number(form.hours) });
      setForm({ case_id: "", date: _todayStr, hours: 1, description: "", is_billable: true });
      setShowForm(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const TABS = [
    { id: "raw",            label: "Log" },
    { id: "by_case",        label: "By Case" },
    { id: "by_consultant",  label: "By Consultant" },
    ...((auth.isAdmin || auth.isManager || auth.isClient) ? [{ id: "budget", label: "Budget vs. Actual" }] : []),
  ];

  const renderRaw = () => {
    if (filtered.length === 0) return <EmptyState Icon={Clock} title={t("time.none")} subtitle={auth.isConsultant ? t("time.log_first") : t("time.none_yet")} />;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_date")}</th>
                {!auth.isConsultant && <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_consultant")}</th>}
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_case")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_hours")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_desc")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_billable")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_approved")}</th>
                {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                  {!auth.isConsultant && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <PersonAvatar name={e.consultant?.full_name} avatarUrl={e.consultant?.avatar_url} size={28} />
                        <span className="text-gray-700">{e.consultant?.full_name}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-3 text-gray-500">{e.case?.title ?? "—"}</td>
                  <td className="px-5 py-3 font-semibold text-blue-700 tabular-nums">{e.hours}h</td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{e.description}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {e.is_billable ? t("time.billable") : t("time.non_billable")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {e.is_approved
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><Check size={10} className="mr-0.5 inline" />{t("time.approved")}</span>
                      : (auth.isAdmin || auth.isManager)
                        ? <button onClick={() => approveEntry(e.id, true)} className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100">{t("time.approve")}</button>
                        : <span className="text-xs text-gray-400">{t("time.pending")}</span>
                    }
                  </td>
                  {(auth.isAdmin || auth.isManager) && (
                    <td className="px-5 py-3">
                      <button onClick={() => deleteEntry(e.id)} className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-0.5 rounded hover:bg-red-50">{t("action.delete")}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderByCase = () => {
    if (caseGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    return (
      <div className="space-y-4">
        {caseGroups.map(g => {
          const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
          const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
          const pending  = g.entries.filter(e => !e.is_approved).length;
          const burnPct  = g.estimatedHours ? Math.round((total / g.estimatedHours) * 100) : null;
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{g.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {g.entries.length} entr{g.entries.length !== 1 ? 'ies' : 'y'}
                    {pending > 0 && <span className="ml-2 text-amber-600 font-medium">· {pending} pending approval</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-blue-700 text-xl tabular-nums">{total.toFixed(1)}h</div>
                  <div className="text-xs text-gray-400">{billable.toFixed(1)}h billable</div>
                </div>
              </div>
              {g.estimatedHours && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="text-gray-400">vs. estimated {g.estimatedHours}h</span>
                    <span className={`font-semibold ${burnPct > 90 ? "text-red-600" : burnPct > 70 ? "text-amber-600" : "text-green-600"}`}>{burnPct}% used</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${burnPct > 90 ? "bg-red-500" : burnPct > 70 ? "bg-amber-400" : "bg-green-500"}`}
                      style={{ width: `${Math.min(burnPct, 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-2 divide-y divide-gray-50">
                {g.entries.slice(0, 6).map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 text-xs text-gray-500">
                    <span className="truncate max-w-sm">{fmtDate(e.date)}{!auth.isConsultant ? ` · ${e.consultant?.full_name ?? ''}` : ''} · {e.description}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="font-semibold text-gray-700 tabular-nums">{e.hours}h</span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.is_approved ? "bg-green-400" : "bg-amber-400"}`} />
                    </div>
                  </div>
                ))}
                {g.entries.length > 6 && <div className="pt-2 text-xs text-gray-400">+{g.entries.length - 6} more entries</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderByConsultant = () => {
    if (consultantGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    return (
      <div className="space-y-3">
        {consultantGroups.map(g => {
          const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
          const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
          const pending  = g.entries.filter(e => !e.is_approved).length;
          const allOk    = pending === 0;
          const amount   = g.rate ? billable * g.rate : null;
          const isOpen   = expandedConsultant === g.id;

          const byCaseInner = {};
          g.entries.forEach(e => {
            const cid = e.case_id ?? 'x';
            if (!byCaseInner[cid]) byCaseInner[cid] = { title: e.case?.title ?? 'No case', hours: 0, billable: 0 };
            byCaseInner[cid].hours += e.hours ?? 0;
            if (e.is_billable) byCaseInner[cid].billable += e.hours ?? 0;
          });

          return (
            <div key={g.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${
              allOk ? "border-green-200" : pending > 0 ? "border-amber-200" : "border-gray-100"
            }`}>
              {/* Consultant header row */}
              <div className="p-5 flex items-center gap-4 cursor-pointer select-none" onClick={() => setExpandedConsultant(isOpen ? null : g.id)}>
                <PersonAvatar name={g.name} avatarUrl={g.avatarUrl} size={40} className="rounded-2xl" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{g.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {Object.keys(byCaseInner).length} case{Object.keys(byCaseInner).length !== 1 ? 's' : ''} · {g.entries.length} entries
                    {g.rate && <span className="ml-1">· ${g.rate}/h</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 mr-2">
                  <div className="font-bold text-blue-700 text-xl tabular-nums">{total.toFixed(1)}h</div>
                  {amount != null && <div className="text-xs text-green-600 font-semibold">${amount.toLocaleString()}</div>}
                  {allOk
                    ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1 justify-end mt-0.5"><Check size={10} />All approved</span>
                    : <span className="text-xs text-amber-600 font-medium mt-0.5 block">{pending} pending</span>
                  }
                </div>
                {(auth.isAdmin || auth.isManager) && !allOk && (
                  <button onClick={ev => { ev.stopPropagation(); bulkApprove(g.id); }}
                    disabled={approvingId === g.id}
                    className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                    {approvingId === g.id ? "…" : "Approve all"}
                  </button>
                )}
                <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  {/* Hours by case summary */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Hours by case</p>
                  <div className="space-y-1 mb-4">
                    {Object.values(byCaseInner).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate max-w-xs">{c.title}</span>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs text-gray-400 tabular-nums">{c.billable.toFixed(1)}h billable</span>
                          <span className="font-semibold text-gray-900 w-12 text-right tabular-nums">{c.hours.toFixed(1)}h</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Full entry table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          <th className="text-left pb-2 font-semibold">Date</th>
                          <th className="text-left pb-2 font-semibold">Case</th>
                          <th className="text-left pb-2 font-semibold">Description</th>
                          <th className="text-right pb-2 font-semibold">Hours</th>
                          <th className="text-center pb-2 font-semibold">Billable</th>
                          <th className="text-center pb-2 font-semibold">Status</th>
                          {(auth.isAdmin || auth.isManager) && <th className="pb-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.entries.map(e => (
                          <tr key={e.id} className={e.is_approved ? "" : "bg-amber-50/40"}>
                            <td className="py-2 pr-3 whitespace-nowrap text-gray-500 tabular-nums">{fmtDate(e.date)}</td>
                            <td className="py-2 pr-3 text-gray-600 max-w-[130px] truncate">{e.case?.title ?? '—'}</td>
                            <td className="py-2 pr-3 text-gray-500 max-w-[190px] truncate">{e.description}</td>
                            <td className="py-2 pr-3 font-semibold text-blue-700 text-right tabular-nums whitespace-nowrap">{e.hours}h</td>
                            <td className="py-2 pr-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                {e.is_billable ? t("label.yes") : t("label.no")}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-center">
                              {e.is_approved
                                ? <span className="text-green-600 font-bold">✓</span>
                                : (auth.isAdmin || auth.isManager)
                                  ? <button onClick={() => approveEntry(e.id, true)} className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-xs hover:bg-amber-100">{t("action.approve")}</button>
                                  : <span className="text-amber-500">{t("label.pending")}</span>
                              }
                            </td>
                            {(auth.isAdmin || auth.isManager) && (
                              <td className="py-2">
                                <button onClick={() => deleteEntry(e.id)} className="text-red-300 hover:text-red-500">✕</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Payroll total */}
                  {allOk && amount != null && (
                    <div className="mt-4 pt-3 border-t border-green-100 flex items-center justify-between bg-green-50/50 rounded-xl px-3 py-2">
                      <span className="text-sm text-gray-600">Billable total · {billable.toFixed(1)}h @ ${g.rate}/h</span>
                      <span className="font-bold text-green-700 text-base tabular-nums">${amount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBudget = () => {
    if (caseGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    const grandTotal    = caseGroups.reduce((s, g) => s + g.entries.reduce((ss, e) => ss + (e.hours ?? 0), 0), 0);
    const grandBillable = caseGroups.reduce((s, g) => s + g.entries.filter(e => e.is_billable).reduce((ss, e) => ss + (e.hours ?? 0), 0), 0);
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Case</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Budget</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Est. Hours</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Logged</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Billable</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase w-36">Burn</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {caseGroups.map(g => {
                const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
                const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
                const burnPct  = g.estimatedHours ? Math.round((total / g.estimatedHours) * 100) : null;
                const pending  = g.entries.filter(e => !e.is_approved).length;
                return (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{g.title}</div>
                      {pending > 0 && <div className="text-xs text-amber-600 mt-0.5">{pending} pending approval</div>}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{g.budget ? `$${Number(g.budget).toLocaleString()}` : '—'}</td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{g.estimatedHours ? `${g.estimatedHours}h` : '—'}</td>
                    <td className="px-5 py-4 text-right font-bold text-blue-700 tabular-nums">{total.toFixed(1)}h</td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{billable.toFixed(1)}h</td>
                    <td className="px-5 py-4">
                      {burnPct != null ? (
                        <div>
                          <div className="text-xs font-semibold mb-1 tabular-nums">
                            <span className={burnPct > 90 ? "text-red-600" : burnPct > 70 ? "text-amber-600" : "text-green-600"}>{burnPct}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${burnPct > 90 ? "bg-red-500" : burnPct > 70 ? "bg-amber-400" : "bg-green-500"}`}
                              style={{ width: `${Math.min(burnPct, 100)}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-gray-400 text-xs">No estimate</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {burnPct == null
                        ? <span className="text-xs text-gray-400">—</span>
                        : burnPct > 100
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Over budget</span>
                          : burnPct > 80
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">At risk</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">On track</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-5 py-3 font-bold text-gray-800" colSpan={3}>Total</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700 tabular-nums">{grandTotal.toFixed(1)}h</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700 tabular-nums">{grandBillable.toFixed(1)}h</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("time.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} · {totalH.toFixed(1)}h total · {billableH.toFixed(1)}h billable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
            <Download size={14} />Export CSV
          </button>
          {auth.isConsultant && (
            <button onClick={() => setShowForm(p => !p)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              {t("time.log")}
            </button>
          )}
        </div>
      </div>

      {/* Pending approval banner */}
      {(auth.isAdmin || auth.isManager) && pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            <strong>{pendingCount}</strong> entr{pendingCount !== 1 ? 'ies' : 'y'} from <strong>{pendingConsultants}</strong> consultant{pendingConsultants !== 1 ? 's' : ''} pending approval in this period
          </span>
          <button onClick={() => { setTab("by_consultant"); setPendingOnly(true); }}
            className="ml-auto text-xs text-amber-700 font-semibold underline whitespace-nowrap">
            Review →
          </button>
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {[
          { key: "week",      label: "This Week" },
          { key: "month",     label: "This Month" },
          { key: "lastmonth", label: "Last Month" },
          { key: "custom",    label: "Custom" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setPeriodPreset(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
              period === key ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-blue-300"
            }`}>
            {label}
          </button>
        ))}
        {period === "custom" && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === tb.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Inline filters (Log + By Consultant tabs) */}
      {(tab === "raw" || tab === "by_consultant") && (
        <div className="flex flex-wrap gap-2 mb-4">
          {!auth.isConsultant && consultantOptions.length > 1 && (
            <select value={filterConsultant} onChange={e => setFilterConsultant(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All consultants</option>
              {consultantOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {caseOptions.length > 1 && (
            <select value={filterCase} onChange={e => setFilterCase(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All cases</option>
              {caseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          )}
          <button onClick={() => setPendingOnly(p => !p)}
            className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
              pendingOnly ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:border-amber-300"
            }`}>
            {pendingOnly ? `Pending only (${filtered.length})` : "Pending only"}
          </button>
        </div>
      )}

      {/* Log time form */}
      {showForm && auth.isConsultant && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("time.form_title")}</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.case")}</label>
            <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">{t("time.select_case")}</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("label.date")} type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <Input label={t("label.hours")} type="number" min="0.25" step="0.25" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
          </div>
          <Textarea label={t("label.description")} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t("time.worked_on")} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-4">
            <input type="checkbox" checked={form.is_billable} onChange={e => setForm(p => ({ ...p, is_billable: e.target.checked }))} className="rounded accent-blue-600" />
            {t("time.billable")}
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("time.saving") : t("action.log_time")}
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === "raw"           && renderRaw()}
      {tab === "by_case"       && renderByCase()}
      {tab === "by_consultant" && renderByConsultant()}
      {tab === "budget"        && renderBudget()}
    </div>
  );
}

// ============================================================
// CONSULTANT ONBOARDING WIZARD
// ============================================================

const ONBOARDING_STEPS = [
  { id: "basics",    labelKey: "ob.step_basics",    Icon: User,      descKey: "ob.step_basics_desc" },
  { id: "workauth",  labelKey: "ob.step_workauth",  Icon: Globe,     descKey: "ob.step_workauth_desc" },
  { id: "customers", labelKey: "ob.step_customers", Icon: Briefcase, descKey: "ob.step_customers_desc" },
  { id: "projects",  labelKey: "ob.step_projects",  Icon: Rocket,    descKey: "ob.step_projects_desc" },
  { id: "skills",    labelKey: "ob.step_skills",    Icon: Zap,       descKey: "ob.step_skills_desc" },
];

function OnboardingRoadmap({ steps, current }) {
  const { t } = useT();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
      <div className="relative flex items-start justify-between">
        {/* Connector line behind circles */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200 z-0" />
        {steps.map((s, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center flex-1 gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                done   ? "bg-emerald-500 text-white shadow"
                       : active ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-100"
                                : "bg-white border-2 border-gray-200 text-gray-400"}`}>
                {done ? <Check className="w-4 h-4" /> : <s.Icon className="w-4 h-4" />}
              </div>
              <div className="text-center px-1">
                <div className={`text-xs font-semibold leading-tight ${
                  active ? "text-blue-600" : done ? "text-emerald-600" : "text-gray-400"}`}>
                  {t(s.labelKey)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">{t(s.descKey)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Mini progress bar */}
      <div className="mt-5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${(current / (steps.length - 1)) * 100}%` }} />
      </div>
      <p className="text-xs text-gray-400 text-right mt-1">
        {t("ob.step_of").replace("{n}", current + 1).replace("{m}", steps.length)}
      </p>
    </div>
  );
}

function ConsultantOnboardingView({ auth, onComplete }) {
  const { t } = useT();
  const { profile, loading, updateProfile, addCustomer, addProject, addWorkAuth } =
    useConsultantProfile(auth.user?.id);

  const [step, setSt]    = useState(0);
  const [saving, setSaving] = useState(false);

  const [basicsForm, setBasicsForm] = useState({
    headline: "", bio: "", linkedin_url: "",
    hourly_rate: "", years_experience: 0,
    external_occupancy_pct: 0, travel_available: false,
    expertise_level: "mid", availability_type: "project_based",
  });
  const [authForm, setAuthForm]   = useState({ country_name: "", country_code: "", auth_type: "citizen" });
  const [custForm, setCustForm]   = useState({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" });
  const [projForm, setProjForm]   = useState({ title: "", consulting_company: "", client_name: "", role: "", url: "", description: "", _tech: "" });
  const [skillInput, setSkillInput] = useState("");

  useEffect(() => {
    if (profile) {
      setBasicsForm(f => ({
        ...f,
        headline:               profile.headline               ?? f.headline,
        bio:                    profile.bio                    ?? f.bio,
        linkedin_url:           profile.linkedin_url           ?? f.linkedin_url,
        hourly_rate:            profile.hourly_rate            ?? f.hourly_rate,
        years_experience:       profile.years_experience       ?? f.years_experience,
        external_occupancy_pct: profile.external_occupancy_pct ?? f.external_occupancy_pct,
        travel_available:       profile.travel_available       ?? f.travel_available,
        expertise_level:        profile.expertise_level        ?? f.expertise_level,
        availability_type:      profile.availability_type      ?? f.availability_type,
      }));
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  const total  = ONBOARDING_STEPS.length;
  const isLast = step === total - 1;

  async function saveBasics() {
    setSaving(true);
    try {
      await updateProfile({
        ...basicsForm,
        hourly_rate:            basicsForm.hourly_rate ? Number(basicsForm.hourly_rate) : null,
        years_experience:       Number(basicsForm.years_experience) || 0,
        external_occupancy_pct: Number(basicsForm.external_occupancy_pct) || 0,
      });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleNext() {
    if (step === 0) await saveBasics();
    if (!isLast) setSt(s => s + 1);
    else onComplete();
  }

  function skip() {
    if (!isLast) setSt(s => s + 1);
    else onComplete();
  }

  async function handleAddWorkAuth() {
    if (!authForm.country_name) return;
    setSaving(true);
    try { await addWorkAuth(authForm); setAuthForm({ country_name: "", country_code: "", auth_type: "citizen" }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddCustomer() {
    if (!custForm.company_name) return;
    setSaving(true);
    try { await addCustomer(custForm); setCustForm({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddProject() {
    if (!projForm.title) return;
    setSaving(true);
    try {
      const { _tech, ...rest } = projForm;
      await addProject({ ...rest, tech_stack: _tech.split(",").map(s => s.trim()).filter(Boolean) });
      setProjForm({ title: "", consulting_company: "", client_name: "", role: "", url: "", description: "", _tech: "" });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddSkill() {
    const val = skillInput.trim();
    if (!val) return;
    setSaving(true);
    try {
      const current = profile?.skills ?? [];
      if (!current.includes(val)) await updateProfile({ skills: [...current, val] });
      setSkillInput("");
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-xl font-bold">TC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t("ob.complete_profile_title")}</h1>
        <p className="text-gray-500 mt-1 text-sm">{t("ob.complete_profile_desc")}</p>
      </div>

      <OnboardingRoadmap steps={ONBOARDING_STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Basic Info ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.basics_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.basics_subtitle")}</p>
            <Input label={t("ob.headline_label")} value={basicsForm.headline}
              onChange={e => setBasicsForm(p => ({ ...p, headline: e.target.value }))}
              placeholder={t("profile.ph_headline_ob")} />
            <Textarea label={t("label.bio")} value={basicsForm.bio}
              onChange={e => setBasicsForm(p => ({ ...p, bio: e.target.value }))}
              placeholder={t("profile.ph_bio")} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("ob.hourly_rate_label")} type="number" value={basicsForm.hourly_rate}
                onChange={e => setBasicsForm(p => ({ ...p, hourly_rate: e.target.value }))} />
              <Input label={t("ob.years_exp_label")} type="number" value={basicsForm.years_experience}
                onChange={e => setBasicsForm(p => ({ ...p, years_experience: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t("ob.expertise_label")} value={basicsForm.expertise_level}
                onChange={e => setBasicsForm(p => ({ ...p, expertise_level: e.target.value }))}
                options={[
                  { value: "junior", label: t("ob.level_junior") },
                  { value: "mid",    label: t("ob.level_mid") },
                  { value: "senior", label: t("ob.level_senior") },
                  { value: "lead",   label: t("ob.level_lead") },
                ]} />
              <Select label={t("ob.avail_type_label")} value={basicsForm.availability_type}
                onChange={e => setBasicsForm(p => ({ ...p, availability_type: e.target.value }))}
                options={[
                  { value: "full_time",     label: t("ob.avail_full_time") },
                  { value: "part_time",     label: t("ob.avail_part_time") },
                  { value: "contract",      label: t("ob.avail_contract") },
                  { value: "project_based", label: t("ob.avail_project") },
                ]} />
            </div>
            <Input label={t("label.linkedin")} value={basicsForm.linkedin_url}
              onChange={e => setBasicsForm(p => ({ ...p, linkedin_url: e.target.value }))}
              placeholder={t("profile.ph_linkedin")} />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("ob.ext_occ_label")} {basicsForm.external_occupancy_pct}%
              </label>
              <input type="range" min="0" max="100" value={basicsForm.external_occupancy_pct}
                onChange={e => setBasicsForm(p => ({ ...p, external_occupancy_pct: Number(e.target.value) }))}
                className="w-full accent-blue-600" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={basicsForm.travel_available}
                onChange={e => setBasicsForm(p => ({ ...p, travel_available: e.target.checked }))}
                className="rounded accent-blue-600" />
              {t("ob.travel_avail_label")}
            </label>
          </>
        )}

        {/* ── Step 1: Work Authorization ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.step_workauth")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.workauth_subtitle")}</p>
            {(profile?.work_authorizations?.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {profile.work_authorizations.map(w => (
                  <div key={w.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-2xl">{w.country_code === "US" ? "🇺🇸" : w.country_code === "GB" ? "🇬🇧" : <Globe size={18} />}</span>
                    <div>
                      <div className="text-sm font-medium">{w.country_name}</div>
                      <div className="text-xs text-gray-400 capitalize">{fmt(w.auth_type)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={`${(profile?.work_authorizations?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("ob.add_country")}</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label={t("ob.country_name_label")} value={authForm.country_name}
                  onChange={e => setAuthForm(p => ({ ...p, country_name: e.target.value }))}
                  placeholder={t("ob.ph_country_name")} />
                <Input label={t("ob.country_code_label")} value={authForm.country_code}
                  onChange={e => setAuthForm(p => ({ ...p, country_code: e.target.value.toUpperCase() }))}
                  placeholder="US" />
                <Select label={t("ob.auth_type_label")} value={authForm.auth_type}
                  onChange={e => setAuthForm(p => ({ ...p, auth_type: e.target.value }))}
                  options={[
                    { value: "citizen",            label: t("ob.auth_citizen") },
                    { value: "permanent_resident", label: t("ob.auth_perm_resident") },
                    { value: "work_visa",          label: t("ob.auth_work_visa") },
                    { value: "other",              label: t("ob.auth_other") },
                  ]} />
              </div>
              <button onClick={handleAddWorkAuth} disabled={saving || !authForm.country_name}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? t("state.saving") : t("ob.add_country_btn")}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Past Customers ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.customers_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.customers_subtitle")}</p>
            {(profile?.consultant_customers?.length ?? 0) > 0 && (
              <div className="space-y-3 mb-5">
                {profile.consultant_customers.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="font-medium text-gray-900">{c.company_name}</div>
                    {c.role_held && <div className="text-sm text-gray-500">{c.role_held}</div>}
                    {(c.start_date || c.end_date) && (
                      <div className="text-xs text-gray-400 mt-1">
                        {fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : t("label.present")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`${(profile?.consultant_customers?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("ob.add_customer")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("ob.company_name_label")} value={custForm.company_name}
                  onChange={e => setCustForm(p => ({ ...p, company_name: e.target.value }))} />
                <Input label={t("ob.role_held_label")} value={custForm.role_held}
                  onChange={e => setCustForm(p => ({ ...p, role_held: e.target.value }))} />
                <Input label={t("label.start_date")} type="date" value={custForm.start_date}
                  onChange={e => setCustForm(p => ({ ...p, start_date: e.target.value }))} />
                <Input label={t("label.end_date")} type="date" value={custForm.end_date}
                  onChange={e => setCustForm(p => ({ ...p, end_date: e.target.value }))}/>
              </div>
              <Textarea label={t("label.description")} value={custForm.description}
                onChange={e => setCustForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddCustomer} disabled={saving || !custForm.company_name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? t("state.saving") : t("ob.add_customer_btn")}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Projects ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.projects_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.projects_subtitle")}</p>
            {(profile?.consultant_projects?.length ?? 0) > 0 && (
              <div className="mb-5">
                <ConsultantProjectsHierarchy projects={profile.consultant_projects} />
              </div>
            )}
            <div className={`${(profile?.consultant_projects?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("ob.add_project")}</p>
              {(profile?.consultant_customers?.length ?? 0) === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  Add a company in Work Experience (previous step) first — it will appear here as the Consulting Company.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("ob.title_label")} value={projForm.title}
                  onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Consulting Company</label>
                  <select value={projForm.consulting_company}
                    onChange={e => setProjForm(p => ({ ...p, consulting_company: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={(profile?.consultant_customers?.length ?? 0) === 0}>
                    <option value="">— Select company —</option>
                    {(profile?.consultant_customers ?? []).map(cu => (
                      <option key={cu.id} value={cu.company_name}>{cu.company_name}</option>
                    ))}
                  </select>
                </div>
                <Input label={t("ob.client_name_label")} value={projForm.client_name}
                  onChange={e => setProjForm(p => ({ ...p, client_name: e.target.value }))} />
                <Input label="Role" value={projForm.role}
                  onChange={e => setProjForm(p => ({ ...p, role: e.target.value }))} />
                <Input label={t("ob.url_label")} value={projForm.url}
                  onChange={e => setProjForm(p => ({ ...p, url: e.target.value }))} />
                <Input label={t("ob.tech_stack_label")} value={projForm._tech}
                  onChange={e => setProjForm(p => ({ ...p, _tech: e.target.value }))} />
              </div>
              <Textarea label={t("label.description")} value={projForm.description}
                onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddProject} disabled={saving || !projForm.title}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? t("state.saving") : t("ob.add_project_btn")}
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Skills ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.skills_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.skills_subtitle")}</p>
            {(profile?.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {profile.skills.map(s => (
                  <span key={s} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">{s}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddSkill(); } }}
                placeholder={t("ob.skill_ph")}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleAddSkill} disabled={saving || !skillInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? "…" : t("ob.add_skill_btn")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : null}
          className={`px-4 py-2 text-sm border border-gray-200 rounded-xl transition-colors ${
            step > 0 ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : "invisible"}`}>
          {t("ob.nav_back")}
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button onClick={skip} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
              {t("ob.nav_skip")}
            </button>
          )}
          <button onClick={handleNext}
            disabled={saving || (step === 0 && !basicsForm.headline.trim())}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? t("state.saving") : isLast ? t("ob.nav_complete_consultant") : step === 0 ? t("ob.nav_save_continue") : t("ob.nav_continue")}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        <button onClick={onComplete} className="hover:text-gray-600 underline underline-offset-2">
          {t("ob.skip_all_consultant")}
        </button>
      </p>
    </div>
  );
}

// ============================================================
// CLIENT ONBOARDING WIZARD
// ============================================================

const ONBOARDING_STEPS_CLIENT = [
  { id: "company", labelKey: "ob.client_step_company", Icon: Building2,         descKey: "ob.client_step_company_desc" },
  { id: "contact", labelKey: "ob.client_step_contact", Icon: Phone,             descKey: "ob.client_step_contact_desc" },
  { id: "prefs",   labelKey: "ob.client_step_prefs",   Icon: SlidersHorizontal, descKey: "ob.client_step_prefs_desc" },
];

function ClientOnboardingView({ auth, onComplete }) {
  const { t } = useT();
  const { profile, loading, updateProfile } = useClientProfile(auth.user?.id);
  const [step, setSt]   = useState(0);
  const [saving, setSaving] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    company_name: "", industry: "", company_size: "",
    founded_year: "", hq_location: "", website: "", description: "",
  });
  const [contactForm, setContactForm] = useState({
    contact_name: "", contact_title: "", contact_email: "", contact_phone: "",
  });
  const [prefsForm, setPrefsForm] = useState({
    budget: "", _categories: "", notes: "",
  });

  useEffect(() => {
    if (profile) {
      setCompanyForm(f => ({
        company_name:  profile.company_name  ?? f.company_name,
        industry:      profile.industry      ?? f.industry,
        company_size:  profile.company_size  ?? f.company_size,
        founded_year:  profile.founded_year  ?? f.founded_year,
        hq_location:   profile.hq_location   ?? f.hq_location,
        website:       profile.website       ?? f.website,
        description:   profile.description   ?? f.description,
      }));
      setContactForm(f => ({
        contact_name:  profile.contact_name  ?? f.contact_name,
        contact_title: profile.contact_title ?? f.contact_title,
        contact_email: profile.contact_email ?? f.contact_email,
        contact_phone: profile.contact_phone ?? f.contact_phone,
      }));
      setPrefsForm(f => ({
        budget:       profile.budget                          ?? f.budget,
        _categories:  profile.preferred_categories?.join(", ") ?? f._categories,
        notes:        profile.notes                           ?? f.notes,
      }));
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  const total  = ONBOARDING_STEPS_CLIENT.length;
  const isLast = step === total - 1;

  async function handleNext() {
    setSaving(true);
    try {
      if (step === 0) {
        await updateProfile({
          ...companyForm,
          founded_year: companyForm.founded_year ? Number(companyForm.founded_year) : null,
        });
      } else if (step === 1) {
        await updateProfile(contactForm);
      } else {
        const { _categories, ...rest } = prefsForm;
        await updateProfile({
          ...rest,
          preferred_categories: _categories.split(",").map(s => s.trim()).filter(Boolean),
        });
      }
      if (!isLast) setSt(s => s + 1);
      else onComplete();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  function skip() { if (!isLast) setSt(s => s + 1); else onComplete(); }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-xl font-bold">TC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t("ob.client_title")}</h1>
        <p className="text-gray-500 mt-1 text-sm">{t("ob.client_desc")}</p>
      </div>

      <OnboardingRoadmap steps={ONBOARDING_STEPS_CLIENT} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Company Info ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.company_info_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.company_info_subtitle")}</p>
            <Input label={t("ob.company_name_req")} value={companyForm.company_name}
              onChange={e => setCompanyForm(p => ({ ...p, company_name: e.target.value }))}
              placeholder={t("ob.ph_company_name")} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("label.industry")} value={companyForm.industry}
                onChange={e => setCompanyForm(p => ({ ...p, industry: e.target.value }))}
                placeholder={t("ob.ph_industry")} />
              <Input label={t("ob.company_size_label")} value={companyForm.company_size}
                onChange={e => setCompanyForm(p => ({ ...p, company_size: e.target.value }))}
                placeholder={t("ob.ph_company_size")} />
              <Input label={t("ob.founded_year_label")} type="number" value={companyForm.founded_year}
                onChange={e => setCompanyForm(p => ({ ...p, founded_year: e.target.value }))} />
              <Input label={t("ob.hq_location_label")} value={companyForm.hq_location}
                onChange={e => setCompanyForm(p => ({ ...p, hq_location: e.target.value }))}
                placeholder={t("company.ph_location")} />
            </div>
            <Input label={t("ob.website_label")} value={companyForm.website}
              onChange={e => setCompanyForm(p => ({ ...p, website: e.target.value }))}
              placeholder={t("company.ph_website")} />
            <Textarea label={t("label.description")} value={companyForm.description}
              onChange={e => setCompanyForm(p => ({ ...p, description: e.target.value }))}
              placeholder={t("company.ph_about")} />
          </>
        )}

        {/* ── Step 1: Primary Contact ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.primary_contact_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.primary_contact_subtitle")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("ob.contact_name_label")} value={contactForm.contact_name}
                onChange={e => setContactForm(p => ({ ...p, contact_name: e.target.value }))}
                placeholder={t("contact.ph_name")} />
              <Input label={t("ob.contact_title_label")} value={contactForm.contact_title}
                onChange={e => setContactForm(p => ({ ...p, contact_title: e.target.value }))}
                placeholder={t("ob.ph_contact_title")} />
              <Input label={t("ob.contact_email_label")} type="email" value={contactForm.contact_email}
                onChange={e => setContactForm(p => ({ ...p, contact_email: e.target.value }))}
                placeholder={t("contact.ph_email")} />
              <Input label={t("ob.contact_phone_label")} value={contactForm.contact_phone}
                onChange={e => setContactForm(p => ({ ...p, contact_phone: e.target.value }))}
                placeholder={t("contact.ph_phone")} />
            </div>
          </>
        )}

        {/* ── Step 2: Consulting Preferences ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t("ob.prefs_title")}</h2>
            <p className="text-sm text-gray-500 mb-5">{t("ob.prefs_subtitle")}</p>
            <Input label={t("ob.budget_label")} value={prefsForm.budget}
              onChange={e => setPrefsForm(p => ({ ...p, budget: e.target.value }))}
              placeholder={t("proj.ph_budget_eg")} />
            <Input label={t("ob.areas_label")} value={prefsForm._categories}
              onChange={e => setPrefsForm(p => ({ ...p, _categories: e.target.value }))}
              placeholder={t("ob.ph_categories")} />
            <Textarea label={t("ob.notes_label")} value={prefsForm.notes}
              onChange={e => setPrefsForm(p => ({ ...p, notes: e.target.value }))}
              placeholder={t("ob.ph_prefs_notes")} />
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : null}
          className={`px-4 py-2 text-sm border border-gray-200 rounded-xl transition-colors ${
            step > 0 ? "text-gray-600 hover:bg-gray-50" : "invisible"}`}>
          {t("ob.nav_back")}
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button onClick={skip} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
              {t("ob.nav_skip")}
            </button>
          )}
          <button onClick={handleNext}
            disabled={saving || (step === 0 && !companyForm.company_name.trim())}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? t("state.saving") : isLast ? t("ob.nav_complete_client") : t("ob.nav_save_continue")}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        <button onClick={onComplete} className="hover:text-gray-600 underline underline-offset-2">
          {t("ob.skip_all_client")}
        </button>
      </p>
    </div>
  );
}

// ============================================================
// MANAGER / ADMIN WELCOME SCREEN
// ============================================================
function ManagerAdminWelcomeView({ auth, onComplete }) {
  const { t } = useT();
  const roleInfo = {
    manager: {
      Icon: FileText,
      title: t("welcome.mgr_title"),
      desc: t("welcome.mgr_desc"),
      highlights: [t("welcome.mgr_h1"), t("welcome.mgr_h2"), t("welcome.mgr_h3"), t("welcome.mgr_h4"), t("welcome.mgr_h5")],
    },
    admin: {
      Icon: Settings,
      title: t("welcome.adm_title"),
      desc: t("welcome.adm_desc"),
      highlights: [t("welcome.adm_h1"), t("welcome.adm_h2"), t("welcome.adm_h3"), t("welcome.adm_h4"), t("welcome.adm_h5")],
    },
  };
  const info = roleInfo[auth.role] ?? roleInfo.manager;

  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-6 shadow-lg">
        <info.Icon className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{info.title}</h1>
      <p className="text-gray-500 text-sm mb-8">{info.desc}</p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 text-left">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("welcome.access_includes")}</p>
        <ul className="space-y-2">
          {info.highlights.map((h, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0"><Check size={11} /></span>
              {h}
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onComplete}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow">
        {t("welcome.go_dashboard")}
      </button>
    </div>
  );
}

import {
  SystemSettingsContext, usePlatformBranding, usePlanConfig,
  useVisibilitySettings, filterCasesByVisibility,
  SystemSettingsProvider, useSystemSettings, usePermissions,
} from "./src/hooks/useSystemSettings.jsx";

function UpgradeModal({ onClose, title, message, roleType, planKey, auth }) {
  const planCfg = usePlanConfig();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    await planCfg.startCheckout(auth.user.id, auth.user.email, roleType, planKey);
    setLoading(false);
  }

  const priceCfg = planCfg.prices[`${roleType}_${planKey}`];

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Zap size={18} className="text-purple-600" />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>
        {priceCfg && (
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-900">{priceCfg.label}</p>
              <p className="text-xs text-purple-600">Monthly subscription</p>
            </div>
            <p className="text-xl font-bold text-purple-900">${priceCfg.amount}<span className="text-sm font-normal text-purple-500">/mo</span></p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">Maybe later</button>
          <button onClick={handleUpgrade} disabled={loading}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors">
            {loading ? 'Loading…' : 'Upgrade now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsUsersTab() {
  const { t } = useT();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ full_name: "", email: "", role: "manager", password: "" });
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState("");
  const [editId, setEditId]     = useState(null);
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving]     = useState(false);
  const [resetSent, setResetSent] = useState({});
  const [search, setSearch]     = useState("");

  const ROLES = ["admin", "manager", "consultant", "client", "key_user", "headhunter", "final_user"];

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    setUsers(data ?? []);
  }

  useEffect(() => { (async () => { await loadUsers(); setLoading(false); })(); }, []);

  async function toggleActive(userId, isActive) {
    await supabase.from("users").update({ is_active: !isActive }).eq("id", userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
  }

  async function saveRole(userId) {
    setSaving(true);
    await supabase.from("users").update({ role: editRole }).eq("id", userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, role: editRole } : u));
    setEditId(null);
    setSaving(false);
  }

  async function sendPasswordReset(email) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setResetSent(p => ({ ...p, [email]: true }));
    setTimeout(() => setResetSent(p => { const n = { ...p }; delete n[email]; return n; }), 5000);
  }

  async function handleCreateUser() {
    setAddError("");
    if (!addForm.full_name || !addForm.email || !addForm.password) {
      setAddError(t("sys.create_user_required")); return;
    }
    setAdding(true);
    try {
      const tmpClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || "",
        import.meta.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { persistSession: false } }
      );
      const { error } = await tmpClient.auth.signUp({
        email: addForm.email, password: addForm.password,
        options: { data: { full_name: addForm.full_name, role: addForm.role } },
      });
      await tmpClient.auth.signOut();
      if (error) throw error;
      await loadUsers();
      setShowAdd(false);
      setAddForm({ full_name: "", email: "", role: "manager", password: "" });
    } catch (e) {
      setAddError(e.message || JSON.stringify(e));
    }
    setAdding(false);
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("sys.search_users")}
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(""); }}
          className="ml-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus size={14} /> {t("sys.add_user")}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("label.name")}</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("label.email")}</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("label.role")}</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">{t("label.status")}</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">{t("sys.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-gray-900">{u.full_name ?? "—"}</span>
                    <TrustBadge level={u.trust_level} size="xs" />
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  {editId === u.id ? (
                    <div className="flex items-center gap-2">
                      <select value={editRole} onChange={e => setEditRole(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button onClick={() => saveRole(u.id)} disabled={saving}
                        className="px-2 py-1 bg-green-600 text-white text-xs rounded-lg">
                        {saving ? "…" : <Check size={12} />}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize
                        ${u.role === "admin" ? "bg-red-100 text-red-700"
                          : u.role === "manager" ? "bg-blue-100 text-blue-700"
                          : u.role === "consultant" ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"}`}>
                        {u.role}
                      </span>
                      <button onClick={() => { setEditId(u.id); setEditRole(u.role); }}
                        className="text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(u.id, u.is_active)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors
                      ${u.is_active !== false
                        ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                        : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"}`}>
                    {u.is_active !== false ? t("label.active") : t("label.inactive")}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => sendPasswordReset(u.email)}
                    title={t("auth.reset_email_tooltip")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 mx-auto
                      ${resetSent[u.email]
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700"}`}>
                    {resetSent[u.email] ? <><Check size={12} /> {t("sys.pwd_sent")}</> : <><RefreshCw size={12} /> {t("sys.pwd_reset")}</>}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">{t("sys.no_users")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{t("sys.create_user_title")}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
              {t("sys.create_user_notice")}
            </div>
            <Input label={t("label.full_name")} value={addForm.full_name}
              onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
            <Input label={t("label.email")} type="email" value={addForm.email}
              onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.role")}</label>
              <select value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <Input label={t("sys.temp_pwd")} type="password" value={addForm.password}
              onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))} placeholder={t("sys.temp_pwd_ph")} />
            {addError && <p className="text-red-600 text-xs mt-2">{addError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">{t("action.cancel")}</button>
              <button onClick={handleCreateUser} disabled={adding}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {adding ? t("state.creating") : t("sys.create_user_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPhasesTab({ ssCtx }) {
  const { t } = useT();
  const DEFAULT_PHASES = [
    { key: "design",                label: t("cd.phase_design"),             color: "#6366f1", required_status: null },
    { key: "development",           label: t("cd.phase_development"),        color: "#2563eb", required_status: null },
    { key: "technical_test",        label: t("cd.phase_technical_test"),     color: "#0891b2", required_status: "technical_test" },
    { key: "technical_adjustment",  label: t("cd.phase_technical_adj"),      color: "#0e7490", required_status: null },
    { key: "functional_test",       label: t("cd.phase_functional_test"),    color: "#059669", required_status: "functional_test" },
    { key: "functional_adjustment", label: t("cd.phase_functional_adj"),     color: "#047857", required_status: null },
    { key: "user_test",             label: t("cd.phase_user_test"),          color: "#7c3aed", required_status: "user_test" },
    { key: "user_adjustment",       label: t("cd.phase_user_adj"),           color: "#6d28d9", required_status: null },
  ];
  const ALL_STATUSES = ["", "open", "estimated", "assigned", "in_progress", "on_hold",
    "technical_test", "functional_test", "user_test", "completed", "cancelled"];

  const [phases, setPhases]   = useState(null);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPhase, setNewPhase] = useState({ key: "", label: "", color: "#6366f1", required_status: "" });
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null);

  useEffect(() => {
    if (!ssCtx.loading) {
      setPhases(ssCtx.settings["activity_phases"] ?? DEFAULT_PHASES);
    }
  }, [ssCtx.loading, ssCtx.settings]);

  async function savePhasesData(newPhases) {
    setSaving(true);
    try {
      await ssCtx.setSetting("activity_phases", newPhases);
      setPhases(newPhases);
      setToast(t("sys.saved"));
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setToast(t("state.error_prefix") + e.message);
    }
    setSaving(false);
  }

  async function deletePhase(key) {
    await savePhasesData(phases.filter(p => p.key !== key));
  }

  async function saveEdit() {
    await savePhasesData(phases.map(p => p.key === editing.key ? editing : p));
    setEditing(null);
  }

  async function addPhase() {
    if (!newPhase.key || !newPhase.label) return;
    await savePhasesData([...phases, { ...newPhase, required_status: newPhase.required_status || null }]);
    setShowAdd(false);
    setNewPhase({ key: "", label: "", color: "#6366f1", required_status: "" });
  }

  if (ssCtx.loading || phases === null) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{t("sys.phases_desc")}</p>
        <div className="flex gap-2">
          <button onClick={() => savePhasesData(DEFAULT_PHASES)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
            <RotateCcw size={13} /> {t("sys.reset_defaults")}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <Plus size={13} /> {t("sys.add_phase")}
          </button>
        </div>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2 bg-green-100 text-green-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600 w-12">{t("sys.col_color")}</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("sys.col_key")}</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("sys.col_label")}</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">{t("sys.col_req_status")}</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600 w-24">{t("sys.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {phases.map(ph => (
              <tr key={ph.key} className="border-b border-gray-100 last:border-0">
                {editing?.key === ph.key ? (
                  <>
                    <td className="px-4 py-2">
                      <input type="color" value={editing.color}
                        onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs font-mono">{ph.key}</td>
                    <td className="px-4 py-2">
                      <input value={editing.label} onChange={e => setEditing(p => ({ ...p, label: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full" />
                    </td>
                    <td className="px-4 py-2">
                      <select value={editing.required_status ?? ""}
                        onChange={e => setEditing(p => ({ ...p, required_status: e.target.value || null }))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                        {ALL_STATUSES.map(s => <option key={s} value={s}>{s || t("sys.none_status")}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={saveEdit} disabled={saving}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded-lg flex items-center gap-1">
                          <Check size={11} /> {t("action.save")}
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg"><X size={11} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="w-6 h-6 rounded-full" style={{ background: ph.color }} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{ph.key}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{ph.label}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{ph.required_status ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setEditing({ ...ph })}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => deletePhase(ph.key)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{t("sys.phase_modal_title")}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.phase_key_label")}</label>
                <input value={newPhase.key}
                  onChange={e => setNewPhase(p => ({ ...p, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" placeholder={t("sys.ph_stage_key_eg")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.col_label")}</label>
                <input value={newPhase.label} onChange={e => setNewPhase(p => ({ ...p, label: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" placeholder={t("sys.ph_stage_label_eg")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.col_color")}</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={newPhase.color} onChange={e => setNewPhase(p => ({ ...p, color: e.target.value }))}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-gray-200" />
                  <span className="text-sm text-gray-500 font-mono">{newPhase.color}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.phase_req_status")}</label>
                <select value={newPhase.required_status}
                  onChange={e => setNewPhase(p => ({ ...p, required_status: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full">
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s || t("sys.none_status")}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">{t("action.cancel")}</button>
              <button onClick={addPhase} disabled={saving || !newPhase.key || !newPhase.label}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {t("sys.add_phase")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsCatalogTab({ ssCtx }) {
  const CATALOG_DEFAULTS = {
    sap_areas:        ["SAP S/4HANA", "SAP BW / Analytics", "SAP FICO", "SAP MM/SD", "SAP HCM", "SAP Basis / Infrastructure", "SAP Fiori / UI5", "SAP Integration (CPI/PI)", "Other SAP"],
    industries:       ["Technology", "Finance & Banking", "Healthcare", "Legal", "Manufacturing", "Retail & Commerce", "Energy & Utilities", "Public Sector", "Other"],
    sap_components:   ["FI","CO","MM","SD","PP","PM","QM","WM","EWM","HCM","PS","RE","FI-AA","TR","GRC","BW","PI/PO","ABAP","BC","SRM","CRM","IS-Retail","IS-Utilities","IS-Oil","LE","CS"],
    work_modes:       ["remote", "on_site", "hybrid"],
    interview_formats:["video", "phone", "in_person", "technical"],
    expertise_levels: ["junior", "mid", "senior", "lead", "expert"],
    priorities:       ["low", "medium", "high", "critical"],
    connection_types: ["sap_gui", "sap_hana", "sap_rfc", "sap_odata", "rest", "soap", "jdbc", "sftp", "smtp", "ldap"],
    skills:         ["ABAP Development", "SAP Basis Administration", "SAP FICO Configuration", "SAP MM Configuration", "SAP SD Configuration", "SAP HCM", "SAP Fiori / UI5", "SAP BW / Analytics", "SAP Integration (CPI/PI)", "S/4HANA Migration", "SAP GRC", "SAP PM / QM", "HANA DB Administration", "SAP Security / Roles", "SAP PS (Project Systems)"],
    certifications: ["SAP Certified Associate - ABAP with SAP NetWeaver", "SAP Certified Application Associate - SAP S/4HANA Finance", "SAP Certified Application Associate - SAP S/4HANA Sourcing and Procurement", "SAP Certified Application Associate - SAP SuccessFactors", "SAP Certified Technology Associate - SAP HANA", "SAP Certified Technology Associate - SAP Basis", "SAP Certified Application Associate - SAP MM", "SAP Certified Application Associate - SAP SD", "SAP Certified Application Associate - SAP HCM"],
    languages:      ["English", "Spanish", "German", "French", "Portuguese", "Italian", "Dutch", "Polish", "Mandarin", "Japanese", "Arabic", "Russian", "Hindi"],
    deliverables:   ["Business Blueprint", "Functional Specification", "Technical Specification", "Configuration Document", "Data Migration Plan", "Test Scripts", "UAT Report", "Training Material", "Go-Live Checklist", "Cutover Plan", "Gap Analysis", "Integration Test Report", "Migration Report", "Process Flow Diagram", "Project Charter", "System Documentation", "Change Management Plan", "Hypercare Plan", "Project Status Report", "SLA Agreement"],
    project_types:  ["consulting", "help_desk", "implementation", "managed_services", "staff_augmentation", "training", "audit", "development"],
  };

  const [selectedCat, setSelectedCat] = useState("sap_areas");
  const [catalogData, setCatalogData] = useState({});
  const [newValue, setNewValue]       = useState("");
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const { t } = useT();

  const CATEGORY_LABELS = {
    sap_areas:        t("catalog.sap_areas"),
    industries:       t("catalog.industries"),
    sap_components:   t("catalog.sap_components"),
    work_modes:       t("catalog.work_modes"),
    interview_formats:t("catalog.interview_formats"),
    expertise_levels: t("catalog.expertise_levels"),
    priorities:       t("catalog.priorities"),
    connection_types: t("catalog.connection_types"),
    skills:         t("catalog.skills"),
    certifications: t("catalog.certifications"),
    languages:      t("catalog.languages"),
    deliverables:   "Project Deliverables",
    project_types:  "Project Types",
  };

  useEffect(() => {
    if (!ssCtx.loading) {
      const loaded = {};
      Object.keys(CATALOG_DEFAULTS).forEach(cat => {
        loaded[cat] = ssCtx.settings[`catalog_${cat}`] ?? CATALOG_DEFAULTS[cat];
      });
      setCatalogData(loaded);
    }
  }, [ssCtx.loading, ssCtx.settings]);

  async function saveCat(cat, values) {
    setSaving(true);
    try {
      await ssCtx.setSetting(`catalog_${cat}`, values);
      setCatalogData(p => ({ ...p, [cat]: values }));
      setToast(t("sys.saved"));
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setToast(t("state.error_prefix") + e.message);
    }
    setSaving(false);
  }

  async function addValue() {
    if (!newValue.trim()) return;
    await saveCat(selectedCat, [...(catalogData[selectedCat] ?? []), newValue.trim()]);
    setNewValue("");
  }

  async function removeValue(val) {
    await saveCat(selectedCat, (catalogData[selectedCat] ?? []).filter(v => v !== val));
  }

  if (ssCtx.loading) return <Spinner />;

  const current = catalogData[selectedCat] ?? [];

  return (
    <div className="flex gap-6">
      <div className="w-48 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {Object.keys(CATALOG_DEFAULTS).map(cat => (
            <button key={cat} onClick={() => { setSelectedCat(cat); setNewValue(""); }}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors border-r-2
                ${selectedCat === cat ? "bg-blue-50 text-blue-700 border-blue-600" : "border-transparent text-gray-600 hover:bg-gray-50"}`}>
              {CATEGORY_LABELS[cat]}
              <span className="ml-1 text-xs text-gray-400">({(catalogData[cat] ?? CATALOG_DEFAULTS[cat]).length})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{CATEGORY_LABELS[selectedCat]}</h3>
          <div className="flex gap-2 items-center">
            {toast && (
              <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded-lg flex items-center gap-1">
                <CheckCircle2 size={12} /> {toast}
              </span>
            )}
            <button onClick={() => saveCat(selectedCat, CATALOG_DEFAULTS[selectedCat])}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1">
              <RotateCcw size={12} /> {t("sys.reset_cat")}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3">
          {current.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">{t("sys.no_values")}</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {current.map((val, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-800 font-mono">{val}</span>
                  <button onClick={() => removeValue(val)}
                    className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addValue()}
            placeholder={t("sys.add_value_ph").replace("{cat}", CATEGORY_LABELS[selectedCat].toLowerCase())}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={addValue} disabled={saving || !newValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            <Plus size={14} /> {t("action.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPlatformTab({ ssCtx }) {
  const DEFAULTS = {
    platform_name:              "TechCase",
    platform_tagline:           "Consultant case management platform",
    brand_logo_url:             "",
    default_currency:           "USD",
    scoring_weights:            { skills: 40, experience: 30, availability: 15, rate: 15 },
    overdue_grace_days:         1,
    invoice_due_days:           30,
    max_applications_per_case:  10,
    spec_regen_manager_only:    true,
  };

  const [form, setForm]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);
  const { t } = useT();

  useEffect(() => {
    if (!ssCtx.loading) {
      setForm({
        platform_name:              ssCtx.settings["platform_name"]              ?? DEFAULTS.platform_name,
        platform_tagline:           ssCtx.settings["platform_tagline"]           ?? DEFAULTS.platform_tagline,
        brand_logo_url:             ssCtx.settings["brand_logo_url"]             ?? DEFAULTS.brand_logo_url,
        default_currency:           ssCtx.settings["default_currency"]           ?? DEFAULTS.default_currency,
        scoring_weights:            ssCtx.settings["scoring_weights"]            ?? { ...DEFAULTS.scoring_weights },
        overdue_grace_days:         ssCtx.settings["overdue_grace_days"]         ?? DEFAULTS.overdue_grace_days,
        invoice_due_days:           ssCtx.settings["invoice_due_days"]           ?? DEFAULTS.invoice_due_days,
        max_applications_per_case:  ssCtx.settings["max_applications_per_case"]  ?? DEFAULTS.max_applications_per_case,
        spec_regen_manager_only:    ssCtx.settings["spec_regen_manager_only"]    ?? DEFAULTS.spec_regen_manager_only,
      });
    }
  }, [ssCtx.loading, ssCtx.settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        ssCtx.setSetting("platform_name",             form.platform_name),
        ssCtx.setSetting("platform_tagline",          form.platform_tagline),
        ssCtx.setSetting("brand_logo_url",            form.brand_logo_url),
        ssCtx.setSetting("default_currency",          form.default_currency),
        ssCtx.setSetting("scoring_weights",           form.scoring_weights),
        ssCtx.setSetting("overdue_grace_days",        form.overdue_grace_days),
        ssCtx.setSetting("invoice_due_days",          form.invoice_due_days),
        ssCtx.setSetting("max_applications_per_case", form.max_applications_per_case),
        ssCtx.setSetting("spec_regen_manager_only",   form.spec_regen_manager_only),
      ]);
      setToast(t("sys.settings_saved"));
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast(t("state.error_prefix") + e.message);
    }
    setSaving(false);
  }

  const totalWeight = form ? Object.values(form.scoring_weights).reduce((a, b) => a + b, 0) : 100;

  if (ssCtx.loading || !form) return <Spinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Branding */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Palette size={16} className="text-purple-600" /> Branding
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
            <input value={form.platform_name}
              onChange={e => setForm(p => ({ ...p, platform_name: e.target.value }))}
              placeholder="TechCase"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
            <input value={form.platform_tagline}
              onChange={e => setForm(p => ({ ...p, platform_tagline: e.target.value }))}
              placeholder="Consultant case management platform"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input value={form.brand_logo_url}
              onChange={e => setForm(p => ({ ...p, brand_logo_url: e.target.value }))}
              placeholder="https://…/logo.png"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full font-mono text-xs" />
            {form.brand_logo_url && (
              <img src={form.brand_logo_url} alt="Logo preview"
                className="mt-2 h-10 object-contain rounded border border-gray-100 p-1"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings size={16} className="text-gray-600" /> {t("sys.general_title")}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.currency_label")}</label>
            <input value={form.default_currency}
              onChange={e => setForm(p => ({ ...p, default_currency: e.target.value.toUpperCase() }))}
              maxLength={3} placeholder="USD"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.invoice_due_label")}</label>
            <input type="number" min={1} value={form.invoice_due_days}
              onChange={e => setForm(p => ({ ...p, invoice_due_days: +e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.overdue_grace_label")}</label>
            <input type="number" min={0} value={form.overdue_grace_days}
              onChange={e => setForm(p => ({ ...p, overdue_grace_days: +e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.max_apps_label")}</label>
            <input type="number" min={1} value={form.max_applications_per_case}
              onChange={e => setForm(p => ({ ...p, max_applications_per_case: +e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-blue-600" /> {t("sys.scoring_title")}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {t("sys.scoring_hint")}{" "}
          <span className={totalWeight === 100 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{totalWeight}</span>
        </p>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(form.scoring_weights).map(([k, v]) => (
            <div key={k}>
              <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{k.replace(/_/g, " ")} (%)</label>
              <input type="number" min={0} max={100} value={v}
                onChange={e => setForm(p => ({ ...p, scoring_weights: { ...p.scoring_weights, [k]: +e.target.value } }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText size={16} className="text-blue-600" /> {t("sys.spec_regen_title")}
        </h3>
        <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
          <div>
            <p className="text-sm font-medium text-gray-700">{t("sys.spec_regen_label")}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("sys.spec_regen_hint")}</p>
          </div>
          <button type="button"
            onClick={() => setForm(p => ({ ...p, spec_regen_manager_only: !p.spec_regen_manager_only }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.spec_regen_manager_only ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.spec_regen_manager_only}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.spec_regen_manager_only ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </label>
      </div>

      {toast && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${toast.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setForm({
            default_currency:          DEFAULTS.default_currency,
            scoring_weights:           { ...DEFAULTS.scoring_weights },
            overdue_grace_days:        DEFAULTS.overdue_grace_days,
            invoice_due_days:          DEFAULTS.invoice_due_days,
            max_applications_per_case: DEFAULTS.max_applications_per_case,
            spec_regen_manager_only:   DEFAULTS.spec_regen_manager_only,
          })}
          className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50 flex items-center gap-1.5">
          <RotateCcw size={13} /> {t("sys.reset_defaults")}
        </button>
        <button onClick={handleSave} disabled={saving || totalWeight !== 100}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? t("state.saving") : <><Check size={14} /> {t("sys.save")}</>}
        </button>
      </div>
    </div>
  );
}

function SettingsRolesTab({ ssCtx }) {
  const { t } = useT();

  const ALL_ROLES = ["admin", "manager", "consultant", "client", "key_user", "headhunter", "final_user"];
  const CAPABILITIES = Object.keys(ROLE_PERMISSIONS_DEFAULTS);

  const [matrix, setMatrix] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);

  useEffect(() => {
    if (!ssCtx.loading) {
      const stored = ssCtx.settings["role_permissions"] ?? {};
      const merged = {};
      for (const cap of CAPABILITIES) {
        merged[cap] = { ...ROLE_PERMISSIONS_DEFAULTS[cap], ...(stored[cap] ?? {}) };
      }
      setMatrix(merged);
    }
  }, [ssCtx.loading, ssCtx.settings]);

  function toggle(cap, role) {
    if (role === 'admin') return;
    setMatrix(p => ({ ...p, [cap]: { ...p[cap], [role]: !p[cap][role] } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await ssCtx.setSetting("role_permissions", matrix);
      setToast(t("roles.saved"));
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast("Error: " + e.message);
    }
    setSaving(false);
  }

  function handleReset() {
    const fresh = {};
    for (const cap of CAPABILITIES) fresh[cap] = { ...ROLE_PERMISSIONS_DEFAULTS[cap] };
    setMatrix(fresh);
  }

  if (ssCtx.loading || !matrix) return <Spinner />;

  const ROLE_COLORS = {
    admin:               'bg-red-100 text-red-700',
    manager:             'bg-purple-100 text-purple-700',
    consultant:          'bg-blue-100 text-blue-700',
    client:              'bg-green-100 text-green-700',
    key_user:            'bg-amber-100 text-amber-700',
    headhunter:          'bg-pink-100 text-pink-700',
    final_user:          'bg-teal-100 text-teal-700',
    internal_consultant: 'bg-indigo-100 text-indigo-700',
    project_manager:     'bg-rose-100 text-rose-700',
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={16} className="text-blue-600" /> {t("roles.title")}
          </h3>
        </div>
        <p className="text-xs text-gray-400 mb-5">{t("roles.subtitle")} {" "}
          <span className="text-red-500 font-medium">Admin always has full access and cannot be restricted.</span>
        </p>

        {/* Role chips legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {ALL_ROLES.map(r => (
            <span key={r} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[r]}`}>
              {t("role." + r)}
            </span>
          ))}
        </div>

        {/* Permission matrix */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide w-48">
                  {t("roles.capability")}
                </th>
                {ALL_ROLES.map(r => (
                  <th key={r} className="text-center py-2 px-2 min-w-[72px]">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[r]}`}>
                      {t("role." + r)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, idx) => (
                <tr key={cap} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                  <td className="py-2.5 pr-4 font-medium text-gray-700 text-xs">
                    {t("roles.cap." + cap)}
                  </td>
                  {ALL_ROLES.map(role => (
                    <td key={role} className="text-center py-2.5 px-2">
                      {role === 'admin' ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600" title="Admin always has access">
                          <Check size={11} />
                        </span>
                      ) : (
                        <button
                          onClick={() => toggle(cap, role)}
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
                            matrix[cap][role]
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-gray-300 text-transparent hover:border-blue-400'
                          }`}
                        >
                          <Check size={11} />
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${toast.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleReset}
          className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50 flex items-center gap-1.5">
          <RotateCcw size={13} /> {t("roles.reset")}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? t("state.saving") : <><Check size={14} /> {t("roles.save")}</>}
        </button>
      </div>
    </div>
  );
}

function SettingsGenerationTab({ ssCtx }) {
  const { t } = useT();
  const [activeProfile, setActiveProfile] = useState("basic");
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);

  const [form, setForm] = useState(null);

  const AI_MODELS = [
    { value: "claude-haiku-4-5-20251001", labelKey: "model.haiku_label" },
    { value: "claude-sonnet-5-20251001",  labelKey: "model.sonnet_label" },
    { value: "claude-opus-5-20250101",    labelKey: "model.opus_label" },
  ];

  useEffect(() => {
    if (!ssCtx.loading) {
      const stored = ssCtx.settings["generation_profiles"] ?? {};
      const storedCtx = ssCtx.settings["generation_context"] ?? {};
      const merged = {
        ai_model:       ssCtx.settings["ai_model"]       ?? "claude-haiku-4-5-20251001",
        analysis_model: ssCtx.settings["analysis_model"] ?? "claude-haiku-4-5-20251001",
        default_profile: stored.default_profile ?? GENERATION_PROFILE_DEFAULTS.default_profile,
        context: { ...GENERATION_CONTEXT_DEFAULTS, ...storedCtx },
        profiles: {},
      };
      for (const pk of ["basic", "standard", "full"]) {
        const def = GENERATION_PROFILE_DEFAULTS.profiles[pk] ?? {};
        const sto = stored.profiles?.[pk] ?? {};
        const p = { additional_instructions: sto.additional_instructions ?? def.additional_instructions ?? "" };
        for (const dk of GEN_DOCS.map(d => d.key)) {
          p[dk] = { ...(def[dk] ?? {}), ...(sto[dk] ?? {}) };
        }
        merged.profiles[pk] = p;
      }
      setForm(merged);
    }
  }, [ssCtx.loading, ssCtx.settings]);

  function toggleSection(profileKey, docKey, sectionKey) {
    setForm(prev => {
      const cur = prev.profiles[profileKey][docKey]?.[sectionKey] !== false;
      return {
        ...prev,
        profiles: {
          ...prev.profiles,
          [profileKey]: {
            ...prev.profiles[profileKey],
            [docKey]: {
              ...prev.profiles[profileKey][docKey],
              [sectionKey]: !cur,
            },
          },
        },
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { ai_model, analysis_model, context, ...genProfiles } = form;
      await Promise.all([
        ssCtx.setSetting("ai_model",            ai_model),
        ssCtx.setSetting("analysis_model",      analysis_model),
        ssCtx.setSetting("generation_context",  context),
        ssCtx.setSetting("generation_profiles", genProfiles),
      ]);
      setToast(t("gen.saved"));
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast(t("state.error_prefix") + e.message);
    }
    setSaving(false);
  }

  if (ssCtx.loading || !form) return <Spinner />;

  const PROFILE_KEYS = ["basic", "standard", "full"];
  const PROFILE_ICONS = { basic: Zap, standard: BarChart2, full: Sparkles };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600" /> {t("sys.ai_config_title")}
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.model_label")}</label>
          <select value={form.ai_model} onChange={e => setForm(p => ({ ...p, ai_model: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t("sys.model_hint")}</p>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.analysis_model_label")}</label>
          <select value={form.analysis_model} onChange={e => setForm(p => ({ ...p, analysis_model: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t("sys.analysis_model_hint")}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Zap size={16} className="text-blue-600" /> {t("gen.tab_title")}
        </h3>
        <p className="text-xs text-gray-400 mb-4">{t("gen.tab_subtitle")}</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("gen.default_profile")}</label>
          <div className="flex gap-2 flex-wrap mb-1">
            {PROFILE_KEYS.map(pk => {
              const Icon = PROFILE_ICONS[pk];
              const isSel = form.default_profile === pk;
              return (
                <button key={pk} onClick={() => setForm(p => ({ ...p, default_profile: pk }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isSel ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-gray-50'}`}>
                  <Icon size={13} /> {t("gen.profile_" + pk)}
                  {isSel && <Check size={12} className="text-blue-600 ml-1" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">{t("gen.default_profile_hint")}</p>
        </div>
      </div>

      {/* Generation Context */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Database size={16} className="text-indigo-600" /> {t("gen.context_title")}
        </h3>
        <p className="text-xs text-gray-400 mb-4">{t("gen.context_subtitle")}</p>
        <div className="space-y-3">
          {[
            { key: "include_client_info",   labelKey: "gen.ctx_client_info",      descKey: "gen.ctx_client_info_desc" },
            { key: "include_sap_profile",   labelKey: "gen.ctx_sap_profile",      descKey: "gen.ctx_sap_profile_desc" },
            { key: "include_case_metadata", labelKey: "gen.ctx_case_metadata",    descKey: "gen.ctx_case_metadata_desc" },
            { key: "include_project_ctx",   labelKey: "gen.ctx_project_ctx",      descKey: "gen.ctx_project_ctx_desc" },
            { key: "include_related_cases", labelKey: "gen.ctx_related_cases",    descKey: "gen.ctx_related_cases_desc" },
            { key: "sap_live_check",        labelKey: "gen.ctx_sap_live_check",   descKey: "gen.ctx_sap_live_check_desc" },
          ].map(({ key, labelKey, descKey }) => (
            <label key={key} className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{t(labelKey)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t(descKey)}</p>
                {key === "include_related_cases" && form.context.include_related_cases && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">{t("gen.ctx_related_count")}:</span>
                    <input type="number" min={1} max={10} value={form.context.related_cases_count}
                      onChange={e => setForm(p => ({ ...p, context: { ...p.context, related_cases_count: Math.min(10, Math.max(1, +e.target.value)) } }))}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-400" />
                  </div>
                )}
              </div>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, context: { ...p.context, [key]: !p.context[key] } }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.context[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={form.context[key]}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.context[key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Profile detail tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {PROFILE_KEYS.map(pk => {
            const Icon = PROFILE_ICONS[pk];
            const isAct = activeProfile === pk;
            return (
              <button key={pk} onClick={() => setActiveProfile(pk)}
                className={`flex items-center gap-1.5 flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${isAct ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={13} /> {t("gen.profile_" + pk)}
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-5">
          {/* Additional instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("gen.additional_instructions_label")}</label>
            <textarea
              value={form.profiles[activeProfile].additional_instructions}
              onChange={e => setForm(prev => ({
                ...prev,
                profiles: {
                  ...prev.profiles,
                  [activeProfile]: { ...prev.profiles[activeProfile], additional_instructions: e.target.value },
                },
              }))}
              rows={3} placeholder={t("gen.additional_instructions_ph")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y focus:outline-none focus:border-blue-400" />
            <p className="text-xs text-gray-400 mt-1">{t("gen.additional_instructions_hint")}</p>
          </div>

          {/* Per-document section toggles */}
          <div className="space-y-4">
            {GEN_DOCS.map(doc => (
              <div key={doc.key}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{doc.label}</p>
                <div className="flex flex-wrap gap-2">
                  {doc.sections.map(sec => {
                    const enabled = form.profiles[activeProfile][doc.key]?.[sec.key] !== false;
                    return (
                      <button key={sec.key}
                        onClick={() => toggleSection(activeProfile, doc.key, sec.key)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${enabled ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                        {enabled ? <Check size={10} className="text-blue-500" /> : <X size={10} className="text-gray-300" />}
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${toast.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? t("state.saving") : <><Check size={14} /> {t("gen.save")}</>}
        </button>
      </div>
    </div>
  );
}

function UserApprovalQueue() {
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressCount, setBulkProgressCount] = useState({ current: 0, total: 0 });

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    setLoading(true);
    const { data } = await supabase.from('users')
      .select('id, full_name, email, role, created_at, verification_status, trust_level, avg_rating, completed_cases_count')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });
    setUsers(data ?? []);
    setLoading(false);
  }

  async function handleApprove(userId) {
    setProcessing(userId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('users').update({
      verification_status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', userId);
    logEvent('user.approved', { entityType: 'user', entityId: userId });
    notify(userId, 'Your account has been approved! 🎉', 'You now have access to the platform. Welcome aboard.');
    setUsers(p => p.filter(u => u.id !== userId));
    setProcessing(null);
  }

  async function handleReject() {
    if (!rejectModal) return;
    setProcessing(rejectModal.id);
    await supabase.from('users').update({
      verification_status: 'rejected',
      rejection_reason: rejectReason || null,
    }).eq('id', rejectModal.id);
    logEvent('user.rejected', { entityType: 'user', entityId: rejectModal.id, metadata: { reason: rejectReason } });
    notify(rejectModal.id, 'Your account application was not approved', rejectReason.trim() || 'Please contact our team for more information.');
    setUsers(p => p.filter(u => u.id !== rejectModal.id));
    setRejectModal(null);
    setRejectReason('');
    setProcessing(null);
  }

  function toggleUserSelect(id) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAllUsers() {
    if (selectedUserIds.size === users.length && users.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)));
    }
  }
  async function handleBulkApprove() {
    setBulkProcessing(true);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const ids = [...selectedUserIds];
    setBulkProgressCount({ current: 0, total: ids.length });
    for (const userId of ids) {
      await supabase.from('users').update({
        verification_status: 'approved',
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
      }).eq('id', userId);
      await notify(userId, 'Account approved', 'Your account has been approved. Welcome aboard.');
      await logEvent('user.approved_bulk', { entityType: 'user', entityId: userId });
      setBulkProgressCount(p => ({ ...p, current: p.current + 1 }));
    }
    setUsers(p => p.filter(u => !ids.includes(u.id)));
    setSelectedUserIds(new Set());
    setBulkProgressCount({ current: 0, total: 0 });
    setBulkProcessing(false);
  }
  async function handleBulkReject() {
    setBulkProcessing(true);
    const ids = [...selectedUserIds];
    setBulkProgressCount({ current: 0, total: ids.length });
    for (const userId of ids) {
      await supabase.from('users').update({
        verification_status: 'rejected',
        rejection_reason: bulkRejectReason || null,
      }).eq('id', userId);
      await logEvent('user.rejected_bulk', { entityType: 'user', entityId: userId, metadata: { reason: bulkRejectReason } });
      await notify(userId, 'Your account application was not approved', bulkRejectReason.trim() || 'Please contact our team for more information.');
      setBulkProgressCount(p => ({ ...p, current: p.current + 1 }));
    }
    setUsers(p => p.filter(u => !ids.includes(u.id)));
    setSelectedUserIds(new Set());
    setBulkRejectOpen(false);
    setBulkRejectReason('');
    setBulkProgressCount({ current: 0, total: 0 });
    setBulkProcessing(false);
  }
  function exportUsersCSV() {
    const headers = ['Name', 'Email', 'Role', 'Trust Level', 'Verification Status', 'Joined Date'];
    const rows = users.map(u => [
      u.full_name ?? '',
      u.email ?? '',
      u.role ?? '',
      u.trust_level ?? '',
      u.verification_status ?? '',
      u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pending_users.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const ROLE_COLORS = {
    consultant:  'bg-blue-100 text-blue-700',
    client:      'bg-green-100 text-green-700',
    headhunter:  'bg-purple-100 text-purple-700',
    manager:     'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pending Approvals</h2>
          <p className="text-sm text-gray-500 mt-0.5">New users waiting for identity verification and approval.</p>
        </div>
        {users.length > 0 && (
          <button onClick={exportUsersCSV}
            className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 shrink-0 transition-colors">
            <Download className="w-3.5 h-3.5 text-gray-500" />{t("bulk.export_csv")}
          </button>
        )}
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div>
      : users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 py-14 text-center text-sm text-gray-400">
          No pending users — all caught up.
        </div>
      ) : (
        <>
          {/* Select-all + bulk toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox"
                checked={selectedUserIds.size === users.length && users.length > 0}
                onChange={toggleSelectAllUsers}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer" />
              {t("bulk.select_all")}
            </label>
            {selectedUserIds.size > 0 && (
              <>
                <span className="text-xs text-gray-500">{t("bulk.selected").replace("{n}", selectedUserIds.size)}</span>
                <button onClick={handleBulkApprove} disabled={bulkProcessing}
                  className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  <UserCheck className="w-3.5 h-3.5" />
                  {bulkProcessing ? (bulkProgressCount.total > 0 ? `Processing ${bulkProgressCount.current}/${bulkProgressCount.total}` : t('bulk.processing')) : t("bulk.approve_all").replace("All", `All (${selectedUserIds.size})`)}
                </button>
                <button onClick={() => setBulkRejectOpen(true)} disabled={bulkProcessing}
                  className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors">
                  {t("bulk.reject_all").replace("All", `All (${selectedUserIds.size})`)}
                </button>
                <button onClick={() => setSelectedUserIds(new Set())} disabled={bulkProcessing}
                  className="text-xs text-gray-400 hover:text-gray-700 px-1">
                  {t("bulk.deselect")}
                </button>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {users.map(u => (
              <div key={u.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${selectedUserIds.has(u.id) ? 'bg-blue-50' : ''}`}>
                <input type="checkbox"
                  checked={selectedUserIds.has(u.id)}
                  onChange={() => toggleUserSelect(u.id)}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer shrink-0" />
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{u.full_name || '—'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-500'}`}>{u.role}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{u.email} · Signed up {new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setRejectModal(u)} disabled={processing === u.id || bulkProcessing}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40">
                    Reject
                  </button>
                  <button onClick={() => handleApprove(u.id)} disabled={processing === u.id || bulkProcessing}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    {processing === u.id ? '…' : 'Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reject modal (single) */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-900">Reject {rejectModal.full_name || rejectModal.email}?</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder={t("reject.reason_placeholder")}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">{t("action.cancel")}</button>
              <button onClick={handleReject} disabled={processing === rejectModal.id}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40">
                {t("action.confirm_reject")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject modal */}
      {bulkRejectOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-900">{t("bulk.reject_all")} ({selectedUserIds.size})</h3>
            <textarea value={bulkRejectReason} onChange={e => setBulkRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional — shown to all selected users)"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setBulkRejectOpen(false); setBulkRejectReason(''); }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
                {t("action.cancel")}
              </button>
              <button onClick={handleBulkReject} disabled={bulkProcessing}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40">
                {bulkProcessing ? (bulkProgressCount.total > 0 ? `Processing ${bulkProgressCount.current}/${bulkProgressCount.total}` : t('bulk.processing')) : 'Confirm Reject All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approval History ── */}
      <ApprovalHistory ROLE_COLORS={ROLE_COLORS} />
    </div>
  );
}

function ApprovalHistory({ ROLE_COLORS }) {
  const [history, setHistory]       = useState([]);
  const [approverMap, setApproverMap] = useState({});
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [roleFilter, setRoleFilter]     = useState("all");
  const [search, setSearch]             = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("users")
        .select("id, full_name, email, role, verification_status, approved_at, approved_by, created_at, rejection_reason")
        .in("verification_status", ["approved", "rejected"])
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(200);
      const rows = data ?? [];
      setHistory(rows);
      const approverIds = [...new Set(rows.map(u => u.approved_by).filter(Boolean))];
      if (approverIds.length) {
        const { data: approvers } = await supabase.from("users").select("id, full_name").in("id", approverIds);
        const map = {};
        (approvers ?? []).forEach(a => { map[a.id] = a.full_name; });
        setApproverMap(map);
      }
      setLoading(false);
    })();
  }, []);

  const PERIOD_OPTS = [
    { id: "all",     label: "All time",    Icon: CalendarRange },
    { id: "week",    label: "This week",   Icon: CalendarDays  },
    { id: "month",   label: "This month",  Icon: Calendar      },
    { id: "quarter", label: "This quarter",Icon: CalendarRange  },
  ];

  const ROLE_OPTS = [
    { id: "all",                 label: "All roles",           Icon: Users      },
    { id: "consultant",          label: "Consultant",          Icon: Briefcase  },
    { id: "client",              label: "Client",              Icon: Building2  },
    { id: "headhunter",          label: "Headhunter",          Icon: Crosshair  },
    { id: "key_user",            label: "Key User",            Icon: UserCheck  },
    { id: "final_user",          label: "Final User",          Icon: Globe      },
    { id: "internal_consultant", label: "Internal Consultant", Icon: UserCog    },
    { id: "project_manager",     label: "Project Manager",     Icon: FolderKanban },
  ];

  const STATUS_OPTS = [
    { id: "all",      label: "All",      Icon: Users        },
    { id: "approved", label: "Approved", Icon: CheckCircle2 },
    { id: "rejected", label: "Rejected", Icon: XCircle      },
  ];

  function inPeriod(dateStr) {
    if (periodFilter === "all" || !dateStr) return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (periodFilter === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      start.setHours(0,0,0,0);
      return d >= start;
    }
    if (periodFilter === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (periodFilter === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      const qStart = new Date(now.getFullYear(), q * 3, 1);
      return d >= qStart;
    }
    return true;
  }

  const filtered = history.filter(u => {
    if (statusFilter !== "all" && u.verification_status !== statusFilter) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (!inPeriod(u.approved_at)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!((u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  function FilterBtn({ active, onClick, Icon, label }) {
    return (
      <button onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
          active
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"}`}>
        <Icon size={12} />
        {label}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-2">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-gray-400" />
            <span className="font-bold text-gray-900">Approval History</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">{filtered.length}</span>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 w-44" />
        </div>

        {/* Period filter */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Period</p>
          <div className="flex gap-2 flex-wrap">
            {PERIOD_OPTS.map(o => (
              <FilterBtn key={o.id} active={periodFilter === o.id} onClick={() => setPeriodFilter(o.id)} Icon={o.Icon} label={o.label} />
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Status</p>
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTS.map(o => (
              <FilterBtn key={o.id} active={statusFilter === o.id} onClick={() => setStatusFilter(o.id)} Icon={o.Icon} label={o.label} />
            ))}
          </div>
        </div>

        {/* Role filter */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Role</p>
          <div className="flex gap-2 flex-wrap">
            {ROLE_OPTS.map(o => (
              <FilterBtn key={o.id} active={roleFilter === o.id} onClick={() => setRoleFilter(o.id)} Icon={o.Icon} label={o.label} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No records found.</div>
        ) : filtered.map(u => (
          <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
              {(u.full_name || u.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{u.full_name || "—"}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-500"}`}>{u.role}</span>
                {u.verification_status === "approved"
                  ? <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700"><CheckCircle2 size={11} />Approved</span>
                  : <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700"><XCircle size={11} />Rejected</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{u.email}</span>
                {u.approved_at && <span>· {new Date(u.approved_at).toLocaleDateString()}</span>}
                {u.approved_by && approverMap[u.approved_by] && (
                  <span className="flex items-center gap-1">· <UserCheck className="w-3 h-3" /> {approverMap[u.approved_by]}</span>
                )}
                {u.rejection_reason && <span className="text-red-400 italic">· "{u.rejection_reason}"</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CLIENT RATING MODAL  (consultant → client direction)
// ============================================================
function ClientRatingModal({ isOpen, onClose, caseId, caseTitle, clientId, clientName }) {
  const auth = useAuth();
  const { t } = useT();
  const CLIENT_DIMS = ['Communication', 'Clarity of requirements', 'Responsiveness', 'Overall'];
  const [scores, setScores] = useState(() => {
    const init = {};
    CLIENT_DIMS.forEach(d => { init[d] = 3; });
    return init;
  });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  if (!isOpen) return null;
  if (!auth.isConsultant) return null;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('case_ratings').insert({
        case_id: caseId,
        rater_id: auth.user.id,
        ratee_id: clientId,
        rater_role: 'consultant',
        ratee_role: 'client',
        scores,
        comment: comment.trim() || null,
      });
      if (!error) {
        await supabase.rpc('recalculate_trust_level', { p_user_id: clientId });
        logEvent('rating.submitted', { entityType: 'case', entityId: caseId, entityName: caseTitle,
          metadata: { ratee_id: clientId, ratee_role: 'client' } });
        notify(clientId, 'You received a rating', `A consultant submitted a rating for case "${caseTitle}".`);
        setToast(t('rating.client_success'));
        setTimeout(() => { setToast(null); onClose(); }, 1500);
      }
    } catch (e) {
      // submit error is fire-and-forget
    }
    setSubmitting(false);
  }

  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{t('rating.client_modal_title')}: {clientName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Case: {caseTitle}</p>
        </div>
        <div className="p-5 space-y-5">
          {toast && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700">{toast}</div>
          )}
          {CLIENT_DIMS.map(dim => (
            <div key={dim}>
              <div className="flex justify-between items-baseline mb-1.5">
                <p className="text-sm font-medium text-gray-700">{dim}</p>
                <p className="text-xs text-gray-400">{scores[dim] ?? 3}/5</p>
              </div>
              <div className="flex gap-2">
                {stars.map(s => (
                  <button key={s} type="button"
                    onClick={() => setScores(p => ({ ...p, [dim]: s }))}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      (scores[dim] ?? 3) >= s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Comment <span className="text-gray-400 font-normal">(optional)</span></p>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              rows={3} placeholder="Any additional feedback…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
            Skip for now
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
            {submitting ? t('rating.submitting') : t('rating.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingModal({ caseId, caseTitle, rateeId, rateeName, rateeRole, raterRole, onClose, onSubmitted }) {
  const [dimensions, setDimensions] = useState([]);
  const [scores, setScores] = useState({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('rating_dimensions')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        setDimensions(data ?? []);
        const init = {};
        (data ?? []).forEach(d => { init[d.key] = 3; });
        setScores(init);
      });
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('case_ratings').insert({
      case_id: caseId,
      rater_id: user.id,
      ratee_id: rateeId,
      rater_role: raterRole,
      ratee_role: rateeRole,
      scores,
      comment: comment.trim() || null,
    });
    if (!error) {
      await supabase.rpc('recalculate_trust_level', { p_user_id: rateeId });
      notify(rateeId, 'You received a new rating', `A rating was submitted for case "${caseTitle}".`);
      logEvent('case.rated', { entityType: 'case', entityId: caseId, entityName: caseTitle, metadata: { ratee_id: rateeId, ratee_role: rateeRole } });
      onSubmitted?.();
    }
    setSubmitting(false);
    if (!error) onClose();
  }

  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Rate {rateeName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Case: {caseTitle}</p>
        </div>
        <div className="p-5 space-y-5">
          {dimensions.map(d => (
            <div key={d.key}>
              <div className="flex justify-between items-baseline mb-1.5">
                <p className="text-sm font-medium text-gray-700">{d.label}</p>
                <p className="text-xs text-gray-400">{scores[d.key] ?? 3}/5</p>
              </div>
              {d.description && <p className="text-xs text-gray-400 mb-2">{d.description}</p>}
              <div className="flex gap-2">
                {stars.map(s => (
                  <button key={s} type="button"
                    onClick={() => setScores(p => ({ ...p, [d.key]: s }))}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      (scores[d.key] ?? 3) >= s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Comment <span className="text-gray-400 font-normal">(optional)</span></p>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              rows={3} placeholder="Any additional feedback…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
            Skip for now
          </button>
          <button onClick={handleSubmit} disabled={submitting || dimensions.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audit log shared constants ────────────────────────────────
const AUDIT_EVENT_COLORS = {
  'case.created':        'bg-blue-100 text-blue-700',
  'case.status_changed': 'bg-amber-100 text-amber-700',
  'case.cancelled':      'bg-red-100 text-red-700',
  'case.updated':        'bg-gray-100 text-gray-600',
  'spec.generated':      'bg-purple-100 text-purple-700',
  'spec.approved':       'bg-green-100 text-green-700',
  'devplan.generated':   'bg-indigo-100 text-indigo-700',
  'project.created':     'bg-teal-100 text-teal-700',
  'user.signed_up':      'bg-sky-100 text-sky-700',
};
const AUDIT_EVENT_LABELS = {
  'case.created':        'Case created',
  'case.status_changed': 'Status changed',
  'case.cancelled':      'Case cancelled',
  'case.updated':        'Case updated',
  'spec.generated':      'Spec generated',
  'spec.approved':       'Spec approved',
  'devplan.generated':   'Dev plan generated',
  'project.created':     'Project created',
  'user.signed_up':      'User signed up',
};
const AUDIT_ENTITY_ICONS = {
  case:    Briefcase,
  project: FolderOpen,
  user:    User,
  client:  Building2,
};

function auditNavTarget(log) {
  if (!log?.entity_id) return null;
  if (log.entity_type === 'case')    return { view: 'cases',    caseId: log.entity_id };
  if (log.entity_type === 'project') return { view: 'projects', projectId: log.entity_id };
  if (log.entity_type === 'user')    return { view: 'users' };
  return null;
}

function auditRenderDetail(log) {
  if (log.event_type === 'case.status_changed') {
    const ov = log.old_value?.status, nv = log.new_value?.status;
    return (
      <span className="flex items-center gap-1.5 text-xs mt-0.5">
        {ov && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{ov}</span>}
        {ov && nv && <span className="text-gray-400">→</span>}
        {nv && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">{nv}</span>}
      </span>
    );
  }
  if (log.event_type === 'case.cancelled' && log.metadata?.reason) {
    return <p className="text-xs text-gray-400 mt-0.5 truncate">Reason: {log.metadata.reason}</p>;
  }
  if (log.event_type === 'spec.generated' || log.event_type === 'devplan.generated') {
    const m = log.metadata ?? {};
    const parts = [];
    if (m.model) parts.push(m.model.replace('claude-', '').replace(/-\d{8,}$/, ''));
    if (m.duration_ms) parts.push(`${(m.duration_ms / 1000).toFixed(1)}s`);
    if (m.activity_count) parts.push(`${m.activity_count} activities`);
    return parts.length ? <p className="text-xs text-gray-400 mt-0.5">{parts.join(' · ')}</p> : null;
  }
  return null;
}

// ── Audit entity quick-view panel ─────────────────────────────
function AuditEntityPanel({ log, onClose, onNavigate }) {
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!log?.entity_id) { setLoading(false); return; }
    setLoading(true);
    setEntity(null);
    (async () => {
      try {
        if (log.entity_type === 'case') {
          const { data } = await supabase.from('cases').select(
            `id, title, status, priority, description, area_sap, skills_required,
             budget, start_date, due_date, estimated_hours, case_type,
             client:client_id(full_name, client_profiles(company_name)),
             project:project_id(id, name)`
          ).eq('id', log.entity_id).maybeSingle();
          setEntity(data);
        } else if (log.entity_type === 'project') {
          const { data } = await supabase.from('projects').select(
            `id, name, status, description, start_date, end_date, budget,
             client:client_id(full_name, client_profiles(company_name))`
          ).eq('id', log.entity_id).maybeSingle();
          setEntity(data);
        } else if (log.entity_type === 'user') {
          const { data } = await supabase.from('users').select(
            'id, full_name, email, role, verification_status, avatar_url, created_at'
          ).eq('id', log.entity_id).maybeSingle();
          setEntity(data);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, [log?.entity_id, log?.entity_type]);

  const target   = auditNavTarget(log);
  const EntityIcon = AUDIT_ENTITY_ICONS[log?.entity_type] ?? Tag;

  return (
    <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <EntityIcon size={14} className="text-gray-400 flex-shrink-0" />
          <h2 className="font-bold text-gray-900 text-sm truncate">{log.entity_name ?? log.entity_id ?? 'Entity'}</h2>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {target && onNavigate && (
            <button onClick={() => { onNavigate(target); onClose(); }}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
              Open in full <ExternalLink size={11} />
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Event info block */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${AUDIT_EVENT_COLORS[log.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
              {AUDIT_EVENT_LABELS[log.event_type] ?? log.event_type}
            </span>
          </div>
          {auditRenderDetail(log)}
          <p className="text-xs text-gray-400 mt-2">
            <span className="font-medium text-gray-500">{log.user_name ?? log.user_email ?? 'system'}</span>
            <span className="mx-1.5">·</span>
            {new Date(log.created_at).toLocaleString()}
          </p>
        </div>

        {/* Entity current state */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Current state</p>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !entity ? (
            <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p>This record no longer exists.</p>
              <p className="text-xs mt-1 font-mono text-gray-300">{log.entity_id}</p>
            </div>
          ) : log.entity_type === 'case' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {entity.priority && <Badge className={PRIORITY_COLORS[entity.priority] ?? 'bg-gray-100 text-gray-600'}>{cap(entity.priority)}</Badge>}
                {entity.status   && <Badge className="bg-gray-100 text-gray-700 capitalize">{entity.status}</Badge>}
                {entity.case_type && <Badge className="bg-blue-50 text-blue-700 capitalize">{entity.case_type}</Badge>}
              </div>
              {entity.description && <p className="text-sm text-gray-600 line-clamp-4 leading-relaxed">{entity.description}</p>}
              {(entity.budget || entity.estimated_hours || entity.start_date || entity.due_date) && (
                <div className="grid grid-cols-2 gap-2">
                  {entity.budget && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Budget</div>
                      <div className="font-semibold text-gray-900 tabular-nums">${Number(entity.budget).toLocaleString()}</div>
                    </div>
                  )}
                  {entity.estimated_hours && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Est. hours</div>
                      <div className="font-semibold text-gray-900 tabular-nums">{entity.estimated_hours}h</div>
                    </div>
                  )}
                  {entity.start_date && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Start</div>
                      <div className="font-semibold text-gray-900">{fmtDate(entity.start_date)}</div>
                    </div>
                  )}
                  {entity.due_date && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Due</div>
                      <div className="font-semibold text-gray-900">{fmtDate(entity.due_date)}</div>
                    </div>
                  )}
                </div>
              )}
              {entity.area_sap && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">SAP area</p>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{entity.area_sap}</span>
                </div>
              )}
              {entity.skills_required?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Skills required</p>
                  <div className="flex flex-wrap gap-1">
                    {entity.skills_required.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(entity.project?.name || entity.client) && (
                <div className="space-y-1 pt-1 border-t border-gray-100">
                  {entity.project?.name && (
                    <p className="text-xs text-gray-600"><span className="text-gray-400">Project: </span>{entity.project.name}</p>
                  )}
                  {entity.client && (
                    <p className="text-xs text-gray-600">
                      <span className="text-gray-400">Client: </span>
                      {entity.client.client_profiles?.company_name ?? entity.client.full_name}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : log.entity_type === 'project' ? (
            <div className="space-y-3">
              {entity.status && <Badge className="bg-gray-100 text-gray-700 capitalize">{entity.status}</Badge>}
              {entity.description && <p className="text-sm text-gray-600 line-clamp-4 leading-relaxed">{entity.description}</p>}
              {(entity.budget || entity.start_date || entity.end_date) && (
                <div className="grid grid-cols-2 gap-2">
                  {entity.budget && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Budget</div>
                      <div className="font-semibold text-gray-900 tabular-nums">${Number(entity.budget).toLocaleString()}</div>
                    </div>
                  )}
                  {entity.start_date && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Start</div>
                      <div className="font-semibold text-gray-900">{fmtDate(entity.start_date)}</div>
                    </div>
                  )}
                  {entity.end_date && (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">End</div>
                      <div className="font-semibold text-gray-900">{fmtDate(entity.end_date)}</div>
                    </div>
                  )}
                </div>
              )}
              {entity.client && (
                <p className="text-xs text-gray-600 pt-1 border-t border-gray-100">
                  <span className="text-gray-400">Client: </span>
                  {entity.client.client_profiles?.company_name ?? entity.client.full_name}
                </p>
              )}
            </div>
          ) : log.entity_type === 'user' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <PersonAvatar name={entity.full_name} avatarUrl={entity.avatar_url} size={48} className="rounded-2xl" />
                <div>
                  <div className="font-semibold text-gray-900">{entity.full_name}</div>
                  <div className="text-xs text-gray-500">{entity.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {entity.role && <Badge className="bg-blue-50 text-blue-700 capitalize">{entity.role}</Badge>}
                {entity.verification_status && (
                  <Badge className={entity.verification_status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                    {entity.verification_status}
                  </Badge>
                )}
              </div>
              {entity.created_at && (
                <p className="text-xs text-gray-400">Joined {new Date(entity.created_at).toLocaleDateString()}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AuditLogDashboard({ onNavigate }) {
  const { t } = useT();
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [panelLog, setPanelLog] = useState(null);
  const PAGE = 50;
  const [filters, setFilters] = useState({ type: '', search: '', dateFrom: '', dateTo: '' });

  useEffect(() => { fetchLogs(); }, [filters, page]);

  async function fetchLogs() {
    setLoading(true);
    let q = supabase.from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (filters.type)     q = q.eq('event_type', filters.type);
    if (filters.search)   q = q.or(`entity_name.ilike.%${filters.search}%,user_email.ilike.%${filters.search}%,user_name.ilike.%${filters.search}%`);
    if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom + 'T00:00:00Z');
    if (filters.dateTo)   q = q.lte('created_at', filters.dateTo   + 'T23:59:59Z');
    const { data, count, error } = await q;
    if (!error) { setLogs(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }

  const ALL_TYPES = Object.keys(AUDIT_EVENT_COLORS);

  return (
    <div className="space-y-5 max-w-5xl mx-auto p-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Audit Log</h2>
        <p className="text-sm text-gray-500 mt-0.5">Full activity trail — click any row to preview the entity, or open it directly.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filters.type}
          onChange={e => { setFilters(p => ({ ...p, type: e.target.value })); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
          <option value="">All event types</option>
          {ALL_TYPES.map(k => <option key={k} value={k}>{AUDIT_EVENT_LABELS[k] ?? k}</option>)}
        </select>
        <input value={filters.search} placeholder="Search entity, user…"
          onChange={e => { setFilters(p => ({ ...p, search: e.target.value })); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 flex-1 min-w-[180px] bg-white" />
        <input type="date" value={filters.dateFrom}
          onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value })); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
        <span className="self-center text-gray-400 text-xs">to</span>
        <input type="date" value={filters.dateTo}
          onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value })); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white" />
        {(filters.type || filters.search || filters.dateFrom || filters.dateTo) && (
          <button onClick={() => { setFilters({ type: '', search: '', dateFrom: '', dateTo: '' }); setPage(0); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white">
            Clear
          </button>
        )}
      </div>

      {!loading && <p className="text-xs text-gray-400">{total.toLocaleString()} events total</p>}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No events match your filters.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => {
              const target     = auditNavTarget(log);
              const EntityIcon = AUDIT_ENTITY_ICONS[log.entity_type] ?? null;
              const isActive   = panelLog?.id === log.id;
              return (
                <div key={log.id}
                  onClick={() => setPanelLog(isActive ? null : log)}
                  className={`group flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                    isActive ? "bg-blue-50 border-l-2 border-blue-500" : "hover:bg-gray-50 border-l-2 border-transparent"
                  }`}>
                  {/* Event badge */}
                  <span className={`mt-0.5 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${AUDIT_EVENT_COLORS[log.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {AUDIT_EVENT_LABELS[log.event_type] ?? log.event_type}
                  </span>
                  {/* Entity name + detail */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {EntityIcon && <EntityIcon size={12} className="text-gray-400 flex-shrink-0" />}
                      <p className={`text-sm font-medium truncate ${target ? "text-blue-700" : "text-gray-800"}`}>
                        {log.entity_name ?? log.entity_id ?? '—'}
                      </p>
                    </div>
                    {auditRenderDetail(log)}
                  </div>
                  {/* Right: user · time · Open button */}
                  <div className="text-right text-xs text-gray-400 whitespace-nowrap shrink-0 flex flex-col items-end gap-0.5">
                    <p className="font-medium text-gray-600">{log.user_name ?? log.user_email ?? 'system'}</p>
                    <p>{new Date(log.created_at).toLocaleString()}</p>
                    {target && onNavigate && (
                      <button
                        onClick={e => { e.stopPropagation(); onNavigate(target); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs">
                        Open <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(page > 0 || logs.length === PAGE) && (
        <div className="flex justify-between items-center">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 bg-white">
            ← Previous
          </button>
          <span className="text-xs text-gray-400">Page {page + 1} · {Math.min((page + 1) * PAGE, total).toLocaleString()} of {total.toLocaleString()}</span>
          <button disabled={logs.length < PAGE} onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 bg-white">
            Next →
          </button>
        </div>
      )}

      {/* Entity quick-view panel */}
      {panelLog && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          <div className="flex-1 pointer-events-auto" onClick={() => setPanelLog(null)} />
          <div className="w-full max-w-md pointer-events-auto flex flex-col h-full border-l border-gray-200 shadow-2xl">
            <AuditEntityPanel
              log={panelLog}
              onClose={() => setPanelLog(null)}
              onNavigate={target => { onNavigate?.(target); setPanelLog(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTrustTab({ ssCtx }) {
  const { t } = useT();
  const [dimensions, setDimensions] = useState([]);
  const [dimLoading, setDimLoading] = useState(true);
  const [thresholds, setThresholds] = useState({ silver: { cases: 3, min_rating: 3.5 }, gold: { cases: 10, min_rating: 4.2 }, platinum: { cases: 25, min_rating: 4.5 } });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    supabase.from('rating_dimensions').select('*').order('sort_order').then(({ data }) => {
      setDimensions(data ?? []);
      setDimLoading(false);
    });
    const stored = ssCtx.settings['trust_thresholds'];
    if (stored) {
      try { setThresholds(typeof stored === 'string' ? JSON.parse(stored) : stored); } catch (_) {}
    }
  }, [ssCtx.settings]);

  async function toggleDimension(id, active) {
    await supabase.from('rating_dimensions').update({ active }).eq('id', id);
    setDimensions(p => p.map(d => d.id === id ? { ...d, active } : d));
  }

  async function saveThresholds() {
    setSaving(true);
    await ssCtx.setSetting('trust_thresholds', JSON.stringify(thresholds));
    setToast('Saved!');
    setTimeout(() => setToast(null), 2000);
    setSaving(false);
  }

  const TIERS = ['silver', 'gold', 'platinum'];
  const TIER_LABELS = { silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

  return (
    <div className="space-y-6 max-w-3xl">
      {toast && <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-xl shadow-lg">{toast}</div>}

      {/* Tier thresholds */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Tier Thresholds</h3>
        <p className="text-xs text-gray-400 mb-4">Minimum completed ratings and average score required to reach each tier.</p>
        <div className="space-y-4">
          {TIERS.map(tier => (
            <div key={tier} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">{TIER_LABELS[tier]}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Min. cases rated</label>
                <input type="number" min={1} value={thresholds[tier]?.cases ?? 0}
                  onChange={e => setThresholds(p => ({ ...p, [tier]: { ...p[tier], cases: +e.target.value } }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Min. avg rating (1–5)</label>
                <input type="number" min={1} max={5} step={0.1} value={thresholds[tier]?.min_rating ?? 0}
                  onChange={e => setThresholds(p => ({ ...p, [tier]: { ...p[tier], min_rating: +e.target.value } }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={saveThresholds} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Thresholds'}
          </button>
        </div>
      </div>

      {/* Rating dimensions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Rating Dimensions</h3>
        <p className="text-xs text-gray-400 mb-4">Categories shown in the rating modal after a case completes. Weight affects the tier calculation average.</p>
        {dimLoading ? <Spinner /> : (
          <div className="space-y-2">
            {dimensions.map(d => (
              <div key={d.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{d.label}</p>
                  <p className="text-xs text-gray-400 truncate">{d.description}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span>×</span>
                  <input type="number" min={0.1} max={5} step={0.1} value={d.weight}
                    onChange={e => {
                      const w = +e.target.value;
                      setDimensions(p => p.map(x => x.id === d.id ? { ...x, weight: w } : x));
                      supabase.from('rating_dimensions').update({ weight: w }).eq('id', d.id);
                    }}
                    className="w-14 border border-gray-200 rounded px-1 py-0.5 text-center focus:outline-none focus:border-blue-400" />
                </div>
                <button type="button"
                  onClick={() => toggleDimension(d.id, !d.active)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${d.active ? 'bg-blue-600' : 'bg-gray-200'}`}
                  role="switch" aria-checked={d.active}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${d.active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS — INVOICE TAB
// ============================================================
function SettingsInvoiceTab({ ssCtx }) {
  const { t } = useT();
  const { settings, setSetting } = ssCtx;
  const [companyName, setCompanyName] = useState(settings['invoice_company_name'] ?? '');
  const [taxRate, setTaxRate]         = useState(settings['invoice_tax_rate'] ?? '0');
  const [hourlyRate, setHourlyRate]   = useState(settings['invoice_hourly_rate'] ?? '150');
  const [paymentNotes, setPaymentNotes] = useState(settings['invoice_payment_notes'] ?? '');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        setSetting('invoice_company_name',  companyName.trim()),
        setSetting('invoice_tax_rate',      taxRate),
        setSetting('invoice_hourly_rate',   hourlyRate),
        setSetting('invoice_payment_notes', paymentNotes.trim()),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
        <h3 className="font-semibold text-gray-900">{t('settings.invoice')}</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Company Name</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)}
            placeholder="Your Company LLC"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Default Tax Rate (%)</label>
            <input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={e => setTaxRate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Default Hourly Rate ($)</label>
            <input type="number" min={0} step={1} value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Default Payment Notes / Terms</label>
          <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} rows={4}
            placeholder="E.g. Payment due within 30 days. Bank: ..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}

// ── People tab — users + permissions combined ─────────────────
function SettingsPeopleTab({ ssCtx, auth, onNavigate }) {
  const { t } = useT();
  const ALL_ROLES = ["admin", "manager", "consultant", "client", "key_user", "headhunter", "final_user"];
  const CAPS = Object.keys(ROLE_PERMISSIONS_DEFAULTS);

  const PERSONA_TABS = [
    { id: "internal",    label: "Internal",    roles: ["admin", "manager"],                  Icon: Shield,    accent: "purple", border: "border-purple-500", activeBg: "bg-purple-600", accentTxt: "text-purple-600", lightBg: "bg-purple-50" },
    { id: "consultants", label: "Consultants", roles: ["consultant"],                        Icon: Briefcase, accent: "blue",   border: "border-blue-500",   activeBg: "bg-blue-600",   accentTxt: "text-blue-600",   lightBg: "bg-blue-50"   },
    { id: "client_team", label: "Client Team", roles: ["client", "key_user", "final_user", "internal_consultant", "project_manager"], Icon: Building2, accent: "green",  border: "border-green-500",  activeBg: "bg-green-600",  accentTxt: "text-green-600",  lightBg: "bg-green-50"  },
    { id: "headhunters", label: "Headhunters", roles: ["headhunter"],                       Icon: Handshake, accent: "pink",   border: "border-pink-500",   activeBg: "bg-pink-600",   accentTxt: "text-pink-600",   lightBg: "bg-pink-50"   },
  ];

  const ROLE_COLORS = {
    admin:      { pill: "bg-red-100 text-red-700 border-red-200",       active: "bg-red-600 text-white border-red-600"       },
    manager:    { pill: "bg-purple-100 text-purple-700 border-purple-200", active: "bg-purple-600 text-white border-purple-600" },
    consultant: { pill: "bg-blue-100 text-blue-700 border-blue-200",    active: "bg-blue-600 text-white border-blue-600"     },
    client:     { pill: "bg-green-100 text-green-700 border-green-200", active: "bg-green-600 text-white border-green-600"   },
    key_user:   { pill: "bg-amber-100 text-amber-700 border-amber-200", active: "bg-amber-500 text-white border-amber-500"   },
    headhunter:          { pill: "bg-pink-100 text-pink-700 border-pink-200",     active: "bg-pink-600 text-white border-pink-600"      },
    final_user:          { pill: "bg-teal-100 text-teal-700 border-teal-200",     active: "bg-teal-600 text-white border-teal-600"      },
    internal_consultant: { pill: "bg-indigo-100 text-indigo-700 border-indigo-200", active: "bg-indigo-600 text-white border-indigo-600" },
    project_manager:     { pill: "bg-rose-100 text-rose-700 border-rose-200",     active: "bg-rose-600 text-white border-rose-600"      },
  };

  const planCfg = usePlanConfig();

  const [personaTab, setPersonaTab]       = useState("consultants");
  const [selectedRole, setSelectedRole]   = useState("consultant");
  const [detailUser, setDetailUser]       = useState(null);
  const [panelConsultantId, setPanelConsultantId]       = useState(null);
  const [panelUserRole, setPanelUserRole]               = useState('');
  const [panelTeamMember, setPanelTeamMember]           = useState(null);
  const [panelTeamMemberCompany, setPanelTeamMemberCompany] = useState(null);
  const [users, setUsers]               = useState([]);
  const [teamMembers, setTeamMembers]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [showApprovals, setShowApprovals] = useState(false);
  const [search, setSearch]             = useState("");
  const [showAdd, setShowAdd]           = useState(false);
  const [addForm, setAddForm]           = useState({ full_name: "", email: "", role: "consultant", password: "" });
  const [adding, setAdding]             = useState(false);
  const [addError, setAddError]         = useState("");
  const [editId, setEditId]             = useState(null);
  const [editRole, setEditRole]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [resetSent, setResetSent]       = useState({});
  const [matrix, setMatrix]             = useState(null);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixToast, setMatrixToast]   = useState(null);
  const [detailEditRole, setDetailEditRole] = useState("");
  const [detailEditOpen, setDetailEditOpen] = useState(false);

  useEffect(() => {
    const group = PERSONA_TABS.find(p => p.id === personaTab);
    const defaultRole = group?.roles[0] ?? "consultant";
    setSelectedRole(defaultRole);
    setDetailUser(null);
    setSearch("");
    setEditId(null);
  }, [personaTab]);

  async function loadUsers() {
    const [{ data: authUsers }, { data: tmRows }] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("client_team_members").select("id, full_name, email, system_role, role_title, phone, client_id, is_primary, created_at"),
    ]);
    setUsers(authUsers ?? []);
    // Build a synthetic user list from team members who have a system_role (sub-roles)
    // Exclude any who already have an auth user with that email so we don't double-count
    const authEmails = new Set((authUsers ?? []).map(u => u.email?.toLowerCase()));
    const CLIENT_SUBROLES = ['key_user', 'final_user', 'internal_consultant', 'project_manager'];
    const syntheticMembers = (tmRows ?? [])
      .filter(m => m.system_role && CLIENT_SUBROLES.includes(m.system_role))
      .filter(m => !authEmails.has(m.email?.toLowerCase()))
      .map(m => ({
        id: `tm_${m.id}`,
        full_name: m.full_name,
        email: m.email,
        role: m.system_role,
        role_title: m.role_title,
        phone: m.phone,
        client_id: m.client_id,
        is_primary: m.is_primary,
        created_at: m.created_at,
        _isTeamMemberOnly: true,
      }));
    setTeamMembers(syntheticMembers);
    setLoading(false);
  }
  async function loadPending() {
    const { data } = await supabase.from("users")
      .select("id, full_name, email, role, created_at").eq("verification_status", "pending");
    setPendingUsers(data ?? []);
  }
  useEffect(() => { loadUsers(); loadPending(); }, []);
  useEffect(() => {
    if (ssCtx.loading) return;
    const stored = ssCtx.settings["role_permissions"] ?? {};
    const merged = {};
    for (const cap of CAPS) merged[cap] = { ...ROLE_PERMISSIONS_DEFAULTS[cap], ...(stored[cap] ?? {}) };
    setMatrix(merged);
  }, [ssCtx.loading, ssCtx.settings]);

  async function toggleActive(uid, isActive) {
    await supabase.from("users").update({ is_active: !isActive }).eq("id", uid);
    setUsers(p => p.map(u => u.id === uid ? { ...u, is_active: !isActive } : u));
    setDetailUser(p => p?.id === uid ? { ...p, is_active: !isActive } : p);
  }
  async function saveRole(uid, role) {
    const roleToSave = role ?? editRole;
    setSaving(true);
    await supabase.from("users").update({ role: roleToSave }).eq("id", uid);
    setUsers(p => p.map(u => u.id === uid ? { ...u, role: roleToSave } : u));
    setDetailUser(p => p?.id === uid ? { ...p, role: roleToSave } : p);
    setEditId(null); setDetailEditOpen(false); setSaving(false);
  }
  async function sendPasswordReset(email) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setResetSent(p => ({ ...p, [email]: true }));
    setTimeout(() => setResetSent(p => { const n = { ...p }; delete n[email]; return n; }), 5000);
  }
  async function handleCreateUser() {
    setAddError("");
    if (!addForm.full_name || !addForm.email || !addForm.password) { setAddError(t("sys.create_user_required")); return; }
    setAdding(true);
    try {
      const tmp = createClient(import.meta.env.VITE_SUPABASE_URL || "", import.meta.env.VITE_SUPABASE_ANON_KEY || "", { auth: { persistSession: false } });
      const { error } = await tmp.auth.signUp({ email: addForm.email, password: addForm.password, options: { data: { full_name: addForm.full_name, role: addForm.role } } });
      await tmp.auth.signOut();
      if (error) throw error;
      await loadUsers();
      setShowAdd(false);
      setAddForm({ full_name: "", email: "", role: selectedRole, password: "" });
    } catch (e) { setAddError(e.message || JSON.stringify(e)); }
    setAdding(false);
  }
  function togglePermission(cap) {
    if (selectedRole === "admin") return;
    setMatrix(p => ({ ...p, [cap]: { ...p[cap], [selectedRole]: !p[cap][selectedRole] } }));
  }
  async function savePermissions() {
    setMatrixSaving(true);
    try {
      await ssCtx.setSetting("role_permissions", matrix);
      setMatrixToast(t("sys.saved")); setTimeout(() => setMatrixToast(null), 3000);
    } catch (e) { setMatrixToast(t("state.error_prefix") + e.message); }
    setMatrixSaving(false);
  }

  function drillDown(u) {
    if (u._isTeamMemberOnly) {
      setPanelTeamMember(u);
      return;
    }
    setPanelConsultantId(u.id);
    setPanelUserRole(u.role ?? '');
  }

  useEffect(() => {
    if (!panelTeamMember?.client_id) { setPanelTeamMemberCompany(null); return; }
    setPanelTeamMemberCompany(null);
    supabase.from('client_profiles')
      .select('id, company_name, industry, website, description')
      .eq('id', panelTeamMember.client_id)
      .maybeSingle()
      .then(({ data }) => setPanelTeamMemberCompany(data ?? null));
  }, [panelTeamMember]);

  const currentPersona = PERSONA_TABS.find(p => p.id === personaTab);
  const groupRoles     = currentPersona?.roles ?? [];
  const allGroupUsers  = personaTab === 'client_team'
    ? [...users.filter(u => groupRoles.includes(u.role)), ...teamMembers]
    : users.filter(u => groupRoles.includes(u.role));
  const groupUsers     = allGroupUsers;
  const roleFiltered   = groupRoles.length > 1 ? groupUsers.filter(u => u.role === selectedRole) : groupUsers;
  const displayed      = roleFiltered.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );
  const isNavigable    = false; // consultant/headhunter cards open as a drawer panel now

  return (
    <div className="space-y-4">

      {/* Persona tab cards */}
      <div className="grid grid-cols-4 gap-3">
        {PERSONA_TABS.map(({ id, label, roles, Icon: Ic, border, activeBg, accentTxt, lightBg }) => {
          const count = id === 'client_team'
            ? users.filter(u => roles.includes(u.role)).length + teamMembers.filter(m => roles.includes(m.role)).length
            : users.filter(u => roles.includes(u.role)).length;
          const isActive = personaTab === id;
          return (
            <button key={id} onClick={() => setPersonaTab(id)}
              className={`rounded-2xl border-2 p-4 text-left transition-all ${
                isActive ? `${border} bg-white shadow-sm` : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
              }`}>
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2 rounded-xl ${isActive ? `${activeBg} text-white` : `${lightBg}`}`}>
                  <Ic size={15} className={isActive ? "" : accentTxt} />
                </div>
                <span className={`text-2xl font-bold tabular-nums ${isActive ? accentTxt : "text-gray-400"}`}>{count}</span>
              </div>
              <div className={`text-sm font-semibold ${isActive ? "text-gray-900" : "text-gray-500"}`}>{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{roles.map(r => r.replace("_", " ")).join(" · ")}</div>
            </button>
          );
        })}
      </div>

      {/* Pending approvals banner */}
      {pendingUsers.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-800 font-medium">
            {pendingUsers.length} user{pendingUsers.length !== 1 ? "s" : ""} waiting for approval
          </span>
          <button onClick={() => setShowApprovals(p => !p)}
            className="ml-auto text-xs text-amber-700 font-semibold underline whitespace-nowrap">
            {showApprovals ? "Hide queue" : "Review →"}
          </button>
        </div>
      )}
      {showApprovals && (
        <div className="bg-white rounded-2xl border border-amber-200 p-5">
          <UserApprovalQueue />
        </div>
      )}

      {/* Role pills within multi-role groups */}
      {groupRoles.length > 1 && (
        <div className="flex gap-2">
          {groupRoles.map(role => {
            const count = groupUsers.filter(u => u.role === role).length;
            const colors = ROLE_COLORS[role];
            const isActive = selectedRole === role;
            return (
              <button key={role} onClick={() => { setSelectedRole(role); setDetailUser(null); setSearch(""); setEditId(null); }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${isActive ? colors.active : colors.pill}`}>
                {t("role." + role)}
                <span className={`ml-1.5 ${isActive ? "opacity-80" : "opacity-60"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-5 gap-5 items-start">

        {/* LEFT: User list */}
        <div className="col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-gray-100">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${currentPersona?.label ?? "users"}…`}
                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => { setShowAdd(true); setAddForm(p => ({ ...p, role: selectedRole })); setAddError(""); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap">
              <Plus size={13} />{t("sys.add_user")}
            </button>
          </div>

          {loading ? <div className="flex justify-center py-8"><Spinner /></div> : displayed.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              No {currentPersona?.label.toLowerCase()} users{search ? " matching your search" : ""}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{t("label.name")}</th>
                    {groupRoles.length > 1 && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>}
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">{t("label.status")}</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">{t("sys.col_actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map(u => {
                    const isSelected = detailUser?.id === u.id;
                    return (
                      <tr key={u.id} className={`transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                        <td className="px-4 py-3">
                          <button onClick={() => drillDown(u)}
                            className="flex items-center gap-2 text-left group w-full">
                            <PersonAvatar name={u.full_name} avatarUrl={u.avatar_url} size={28} className="rounded-xl" />
                            <div className="min-w-0">
                              <div className={`font-medium truncate text-sm flex items-center gap-1 ${isNavigable ? "text-blue-700 group-hover:text-blue-900" : "text-gray-900"}`}>
                                {u.full_name ?? "—"}
                                {isNavigable && <ExternalLink size={10} className="opacity-0 group-hover:opacity-70 flex-shrink-0 transition-opacity" />}
                              </div>
                              <div className="text-xs text-gray-400 truncate">{u.email}</div>
                            </div>
                          </button>
                        </td>
                        {groupRoles.length > 1 && (
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role]?.pill ?? ""}`}>
                              {u.role.replace("_", " ")}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[planCfg.getUserPlan(u.id)] ?? PLAN_BADGE.free}`}>{planCfg.getUserPlan(u.id)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleActive(u.id, u.is_active)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              u.is_active !== false
                                ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                                : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"
                            }`}>
                            {u.is_active !== false ? t("label.active") : t("label.inactive")}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {editId === u.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <select value={editRole} onChange={e => setEditRole(e.target.value)}
                                className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white">
                                {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <button onClick={() => saveRole(u.id)} disabled={saving}
                                className="px-1.5 py-0.5 bg-green-600 text-white text-xs rounded">
                                {saving ? "…" : "✓"}
                              </button>
                              <button onClick={() => setEditId(null)}
                                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => { setEditId(u.id); setEditRole(u.role); }}
                                title={t("action.edit") + " role"}
                                className="text-gray-400 hover:text-blue-600 transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => sendPasswordReset(u.email)}
                                title={t("auth.reset_email_tooltip")}
                                className={`transition-colors ${resetSent[u.email] ? "text-green-600" : "text-gray-400 hover:text-blue-600"}`}>
                                {resetSent[u.email] ? <Check size={13} /> : <RefreshCw size={13} />}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT: User detail panel or permissions */}
        <div className="col-span-2 space-y-4">

          {/* User detail panel */}
          {detailUser && !isNavigable && (
            <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                  <User size={14} className="text-blue-600" />Profile
                </h3>
                <button onClick={() => setDetailUser(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={15} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  {detailUser.avatar_url
                    ? <img src={detailUser.avatar_url} alt="" className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold flex-shrink-0">
                        {detailUser.full_name?.[0] ?? "?"}
                      </div>
                  }
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{detailUser.full_name ?? "—"}</div>
                    <div className="text-xs text-gray-500">{detailUser.email}</div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[detailUser.role]?.pill ?? ""}`}>
                    {detailUser.role?.replace("_", " ")}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    detailUser.is_active !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {detailUser.is_active !== false ? t("label.active") : t("label.inactive")}
                  </span>
                  {detailUser.verification_status && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      detailUser.verification_status === "approved" ? "bg-emerald-100 text-emerald-700"
                      : detailUser.verification_status === "pending" ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>
                      {detailUser.verification_status}
                    </span>
                  )}
                </div>

                {/* Join date */}
                {detailUser.created_at && (
                  <div className="text-xs text-gray-500">
                    Joined {new Date(detailUser.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                )}

                {/* Role change */}
                {detailEditOpen ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">{t("settings.change_role")}</label>
                    <select value={detailEditRole} onChange={e => setDetailEditRole(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white">
                      {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => saveRole(detailUser.id, detailEditRole)} disabled={saving}
                        className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                        {saving ? t("state.saving") : t("settings.save_role")}
                      </button>
                      <button onClick={() => setDetailEditOpen(false)}
                        className="px-2 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg">{t("action.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setDetailEditOpen(true); setDetailEditRole(detailUser.role); }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                      <Pencil size={11} />{t("settings.change_role")}
                    </button>
                    <button onClick={() => sendPasswordReset(detailUser.email)}
                      className={`flex items-center justify-center gap-1 px-3 py-1.5 border text-xs font-medium rounded-lg transition-colors ${
                        resetSent[detailUser.email] ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}>
                      {resetSent[detailUser.email] ? <><Check size={11} />Sent</> : <><RefreshCw size={11} />Reset pwd</>}
                    </button>
                  </div>
                )}

                {/* Toggle active */}
                <button onClick={() => toggleActive(detailUser.id, detailUser.is_active)}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    detailUser.is_active !== false
                      ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                  }`}>
                  {detailUser.is_active !== false ? t("settings.deactivate_user") : t("settings.activate_user")}
                </button>
              </div>
            </div>
          )}

          {/* Permissions panel */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <Shield size={14} className="text-blue-600" />Permissions — {t("role." + selectedRole)}
              </h3>
              {selectedRole !== "admin" && (
                <button onClick={savePermissions} disabled={matrixSaving}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                  {matrixSaving ? t("state.saving") : t("action.save")}
                </button>
              )}
            </div>
            {selectedRole === "admin" ? (
              <div className="p-4">
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
                  Admin has unrestricted access to all capabilities and cannot be configured.
                </div>
                <div className="mt-3 space-y-1">
                  {CAPS.map(cap => (
                    <div key={cap} className="flex items-center justify-between py-1.5 px-2 rounded-lg text-xs">
                      <span className="text-gray-700">{t("roles.cap." + cap)}</span>
                      <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                        <Check size={10} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : !matrix ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <div className="p-2">
                <div className="space-y-0.5 max-h-[340px] overflow-y-auto">
                  {CAPS.map(cap => (
                    <label key={cap}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
                      <span className="text-xs text-gray-700 group-hover:text-gray-900 pr-3">{t("roles.cap." + cap)}</span>
                      <input type="checkbox"
                        checked={matrix[cap]?.[selectedRole] ?? false}
                        onChange={() => togglePermission(cap)}
                        className="rounded accent-blue-600 w-4 h-4 flex-shrink-0 cursor-pointer" />
                    </label>
                  ))}
                </div>
                {matrixToast && (
                  <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${matrixToast.startsWith("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                    {matrixToast}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add user modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{t("sys.create_user_title")}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">{t("sys.create_user_notice")}</div>
            <Input label={t("label.full_name")} value={addForm.full_name} onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
            <Input label={t("label.email")} type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder={t("contact.ph_email")} />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.role")}</label>
              <select value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <Input label={t("sys.temp_pwd")} type="password" value={addForm.password} onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))} placeholder={t("sys.temp_pwd_ph")} />
            {addError && <p className="text-red-600 text-xs mt-2">{addError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">{t("action.cancel")}</button>
              <button onClick={handleCreateUser} disabled={adding}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {adding ? t("state.creating") : t("sys.create_user_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consultant / headhunter / client profile drawer */}
      {panelConsultantId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanelConsultantId(null)} />
          <ConsultantProfilePanel
            consultantId={panelConsultantId}
            initialRole={panelUserRole}
            onClose={() => setPanelConsultantId(null)}
            auth={auth}
            onOpenClientProfile={onNavigate ? (clientId) => onNavigate({ view: 'client-profile', clientId }) : null}
          />
        </div>
      )}

      {/* Team-member-only contact drawer (no auth account) */}
      {panelTeamMember && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanelTeamMember(null)} />
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900 text-base">Contact</h2>
              <button onClick={() => setPanelTeamMember(null)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <PersonAvatar name={panelTeamMember.full_name || panelTeamMember.email} size={56} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-base leading-tight">{panelTeamMember.full_name || '—'}</h3>
                  <p className="text-xs text-gray-400 truncate">{panelTeamMember.email}</p>
                </div>
              </div>
              {/* Role badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {panelTeamMember.role && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    ROLE_COLORS[panelTeamMember.role]
                      ? `${ROLE_COLORS[panelTeamMember.role].bg} ${ROLE_COLORS[panelTeamMember.role].text}`
                      : 'bg-gray-100 text-gray-600'
                  }`}>{panelTeamMember.role.replace(/_/g, ' ')}</span>
                )}
                {panelTeamMember.role_title && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">{panelTeamMember.role_title}</span>
                )}
                {panelTeamMember.is_primary && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Primary contact</span>
                )}
              </div>
              {/* Contact details */}
              <div className="space-y-2">
                {panelTeamMember.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail size={13} className="text-gray-400 flex-shrink-0" />{panelTeamMember.email}
                  </div>
                )}
                {panelTeamMember.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={13} className="text-gray-400 flex-shrink-0" />{panelTeamMember.phone}
                  </div>
                )}
              </div>
              {/* Company */}
              {panelTeamMemberCompany && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{panelTeamMemberCompany.company_name}</p>
                    {panelTeamMemberCompany.industry && (
                      <p className="text-xs text-gray-500 capitalize">{panelTeamMemberCompany.industry}</p>
                    )}
                    {panelTeamMemberCompany.website && (
                      <a href={panelTeamMemberCompany.website} target="_blank" rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                        <ExternalLink size={11} />{panelTeamMemberCompany.website}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Note: no auth account */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">This contact does not have a platform account yet.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plans tab ─────────────────────────────────────────────────
function SettingsPlansTab({ ssCtx, auth }) {
  const { t } = useT();
  const planCfg = usePlanConfig();
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState({});
  const [tab, setTab] = useState('users');
  const [editConfig, setEditConfig] = useState(null);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    supabase.from('users').select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  useEffect(() => {
    if (tab === 'config') setEditConfig(JSON.parse(JSON.stringify(planCfg.config)));
  }, [tab]);

  async function changePlan(userId, plan, role) {
    setSaving(p => ({ ...p, [userId]: true }));
    const roleType = ROLE_TO_PLAN_TYPE[role] ?? 'client';
    await planCfg.setUserPlan(userId, plan, roleType);
    setSaving(p => ({ ...p, [userId]: false }));
  }

  async function saveConfig() {
    setConfigSaving(true);
    await ssCtx.setSetting('plan_config', editConfig);
    setConfigSaving(false);
  }

  const PLAN_TYPES = ['client', 'consultant', 'headhunter'];
  const PLAN_KEYS  = { client: ['free','starter','professional','enterprise'], consultant: ['free','starter','professional'], headhunter: ['free','professional'] };
  const LIMIT_LABELS = { maxCases: 'Max active cases', maxTeam: 'Max team members', maxApps: 'Max applications/mo', maxCandidates: 'Max candidates', ai: 'AI features', analytics: 'Analytics', priority: 'Priority listing', helpDesk: 'Help Desk projects' };

  const CLIENT_TEAM_ROLES_ADMIN = ['key_user', 'final_user', 'internal_consultant', 'project_manager'];
  const billingUsers  = users.filter(u => ROLE_TO_PLAN_TYPE[u.role] && !CLIENT_TEAM_ROLES_ADMIN.includes(u.role));
  const teamMembers   = users.filter(u => CLIENT_TEAM_ROLES_ADMIN.includes(u.role));
  const relevantUsers = billingUsers;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Plans & Membership</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage subscription plans and assign them to users.</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[{id:'users',label:'User Plans'},{id:'config',label:'Plan Limits'}].map(s => (
          <button key={s.id} onClick={() => setTab(s.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Plan</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {relevantUsers.map(u => {
                const roleType  = ROLE_TO_PLAN_TYPE[u.role] ?? 'client';
                const planKeys  = PLAN_KEYS[roleType] ?? ['free'];
                const curPlan   = planCfg.getUserPlan(u.id);
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PersonAvatar name={u.full_name || u.email} size={28} />
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{u.full_name || '—'}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{u.role?.replace(/_/g,' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${PLAN_BADGE[curPlan] ?? PLAN_BADGE.free}`}>{curPlan}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select value={curPlan}
                        onChange={e => changePlan(u.id, e.target.value, u.role)}
                        disabled={saving[u.id]}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                        {planKeys.map(pk => (
                          <option key={pk} value={pk}>{(planCfg.config[roleType]?.[pk] ?? DEFAULT_PLAN_CONFIG[roleType]?.[pk])?.label ?? pk}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {relevantUsers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">No users yet</td></tr>
              )}
            </tbody>
          </table>
          {teamMembers.length > 0 && (
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex items-start gap-2">
              <AlertCircle size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                <span className="font-semibold">Team members</span> (Key User, Final User, Internal Consultant, Project Manager) inherit their associated client's plan — they don't have individual plans. To change their limits, update the client account plan above.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && editConfig && (
        <div className="space-y-6">
          {PLAN_TYPES.map(rt => (
            <div key={rt} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 capitalize">{rt} Plans</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Limit</th>
                      {(PLAN_KEYS[rt] ?? []).map(pk => (
                        <th key={pk} className="px-4 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[pk] ?? PLAN_BADGE.free}`}>{editConfig[rt]?.[pk]?.label ?? pk}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(LIMIT_LABELS).filter(([k]) => Object.keys(DEFAULT_PLAN_CONFIG[rt]?.free ?? {}).includes(k)).map(([limitKey, limitLabel]) => (
                      <tr key={limitKey} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 font-medium">{limitLabel}</td>
                        {(PLAN_KEYS[rt] ?? []).map(pk => {
                          const val = editConfig[rt]?.[pk]?.[limitKey];
                          const isBoolean = typeof val === 'boolean';
                          return (
                            <td key={pk} className="px-4 py-2 text-center">
                              {isBoolean ? (
                                <button onClick={() => setEditConfig(p => ({ ...p, [rt]: { ...p[rt], [pk]: { ...p[rt][pk], [limitKey]: !val } } }))}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors ${val ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                                  {val ? <Check size={14} /> : <X size={14} />}
                                </button>
                              ) : (
                                <input type="number" value={val ?? 0} min={-1}
                                  onChange={e => setEditConfig(p => ({ ...p, [rt]: { ...p[rt], [pk]: { ...p[rt][pk], [limitKey]: Number(e.target.value) } } }))}
                                  className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button onClick={saveConfig} disabled={configSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors">
              {configSaving ? 'Saving…' : 'Save Plan Config'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function SettingsPricingTab({ ssCtx, auth }) {
  const savedPrices  = ssCtx.settings['plan_prices']     ?? DEFAULT_PLAN_PRICES;
  const savedPriceIds = ssCtx.settings['stripe_price_ids'] ?? {};
  const [prices, setPrices]   = useState(() => JSON.parse(JSON.stringify(savedPrices)));
  const [saving, setSaving]   = useState(false);
  const [setting, setSetting] = useState(false);
  const [toast, setToast]     = useState(null);
  const [setupLog, setSetupLog] = useState(null);

  useEffect(() => {
    setPrices(JSON.parse(JSON.stringify(savedPrices)));
  }, [ssCtx.settings]);

  async function savePrices() {
    setSaving(true);
    await ssCtx.setSetting('plan_prices', prices);
    setToast('Prices saved'); setTimeout(() => setToast(null), 3000);
    setSaving(false);
  }

  async function runStripeSetup() {
    setSetting(true); setSetupLog(null);
    try {
      const res = await fetch('/api/stripe-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans: prices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Setup failed');
      await ssCtx.setSetting('stripe_price_ids', data.priceIds);
      setSetupLog({ ok: true, priceIds: data.priceIds });
      setToast('Stripe products created ✓'); setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setSetupLog({ ok: false, message: e.message });
    }
    setSetting(false);
  }

  const stripeReady = Boolean(Object.keys(savedPriceIds).length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Pricing & Stripe</h2>
          <p className="text-sm text-gray-500 mt-0.5">Set monthly prices per plan. Click "Create Stripe Products" after editing.</p>
        </div>
        <div className="flex items-center gap-2">
          {stripeReady && (
            <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full font-medium">
              <Check size={12} />Stripe connected
            </span>
          )}
          {toast && (
            <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full font-medium">{toast}</span>
          )}
        </div>
      </div>

      {/* Price table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Monthly price (USD)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stripe Price ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Object.entries(prices).map(([key, cfg]) => (
              <tr key={key} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-800">{cfg.label}</p>
                    <p className="text-xs text-gray-400 capitalize">{cfg.roleType} · {cfg.planKey}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-sm">$</span>
                    <input
                      type="number" min={0} value={cfg.amount}
                      onChange={e => setPrices(p => ({ ...p, [key]: { ...p[key], amount: Number(e.target.value) } }))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">/mo</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {savedPriceIds[key]
                    ? <span className="text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">{savedPriceIds[key]}</span>
                    : <span className="text-xs text-gray-300 italic">not set up</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={savePrices} disabled={saving}
          className="px-5 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
          {saving ? 'Saving…' : 'Save Prices'}
        </button>
        <button onClick={runStripeSetup} disabled={setting}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
          {setting ? 'Creating…' : <><Zap size={14} />Create Stripe Products</>}
        </button>
      </div>

      {/* Stripe setup result */}
      {setupLog && (
        <div className={`rounded-xl p-4 text-sm border ${setupLog.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {setupLog.ok
            ? <><span className="font-semibold">Products created.</span> Price IDs saved to system settings.</>
            : <><span className="font-semibold">Error:</span> {setupLog.message}</>}
        </div>
      )}

      {/* Env var instructions */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={14} />Required environment variables</p>
        <p className="text-xs text-amber-700">Set these in your Vercel project settings under Environment Variables:</p>
        <div className="space-y-1">
          {['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'].map(v => (
            <code key={v} className="block text-xs font-mono bg-amber-100 px-2 py-1 rounded text-amber-900">{v}</code>
          ))}
        </div>
        <p className="text-xs text-amber-700 mt-2">Webhook endpoint to register in Stripe: <code className="font-mono bg-amber-100 px-1 rounded">https://your-domain.vercel.app/api/stripe-webhook</code></p>
      </div>
    </div>
  );
}

// ── Workflow tab — Lifecycle + Phases + SLA ───────────────────
function SettingsWorkflowTab({ auth, ssCtx }) {
  const [wTab, setWTab] = useState("lifecycle");
  const WTABS = [
    { id: "lifecycle", label: "Lifecycle Templates", Icon: TrendingUp },
    { id: "phases",    label: "Activity Phases",     Icon: ListChecks },
    { id: "sla",       label: "SLA",                 Icon: Shield },
  ];
  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-100">
        {WTABS.map(tb => (
          <button key={tb.id} onClick={() => setWTab(tb.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              wTab === tb.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <tb.Icon size={14} />{tb.label}
          </button>
        ))}
      </div>
      {wTab === "lifecycle" && <LifecycleSettingsView auth={auth} />}
      {wTab === "phases"    && <SettingsPhasesTab ssCtx={ssCtx} />}
      {wTab === "sla"       && <SlaView auth={auth} />}
    </div>
  );
}

// ── Sign-up Flow settings — per-role ─────────────────────────
function SettingsSignupFlowTab({ ssCtx }) {
  const { t } = useT();
  const { settings, setSetting } = ssCtx;
  const perRole = settings["signup_flow_per_role"] ?? {};
  const ALL_ROLE_KEYS = ["consultant", "headhunter", "client", "key_user", "final_user", "internal_consultant", "project_manager"];
  const visibleRoles = settings["signup_roles_visible"] ?? ALL_ROLE_KEYS;
  const [saving, setSaving] = useState(null);

  const ROLES = [
    { key: "consultant",          label: "Consultant",           Icon: Briefcase,  note: null },
    { key: "headhunter",          label: "Headhunter",           Icon: Crosshair,  note: null },
    { key: "client",              label: "Client",               Icon: Building2,  note: null },
    { key: "key_user",            label: "Key User",             Icon: UserCheck,  note: "Team pre-registration enforced" },
    { key: "final_user",          label: "Final User",           Icon: Globe,      note: "Team pre-registration enforced" },
    { key: "internal_consultant", label: "Internal Consultant",  Icon: UserCog,    note: null },
    { key: "project_manager",     label: "Project Manager",      Icon: FolderKanban, note: null },
  ];

  const MODES = [
    { value: "email_verify",       label: "Email Verify",   desc: "OTP → auto-approved",      Icon: Mail },
    { value: "admin_approval",     label: "Admin Approval", desc: "No OTP → pending queue",   Icon: Shield },
    { value: "email_and_approval", label: "Both",           desc: "OTP → pending queue",      Icon: BadgeCheck },
  ];

  async function setRoleFlow(roleKey, mode) {
    setSaving(roleKey);
    await setSetting("signup_flow_per_role", { ...perRole, [roleKey]: mode });
    setSaving(null);
  }

  async function toggleRoleVisible(roleKey) {
    const next = visibleRoles.includes(roleKey)
      ? visibleRoles.filter(k => k !== roleKey)
      : [...visibleRoles, roleKey];
    await setSetting("signup_roles_visible", next);
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-500 mb-1">Configure how each role's sign-up is processed.</p>
      <div className="flex gap-4 mb-4 mt-3">
        {MODES.map(({ value, label, desc, Icon: Ic }) => (
          <div key={value} className="flex items-center gap-1.5 text-xs text-gray-500">
            <Ic size={12} className="text-gray-400" /><span className="font-medium text-gray-700">{label}</span> — {desc}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {ROLES.map(({ key, label, Icon: Ic, note }) => {
          const current = perRole[key] ?? "email_verify";
          return (
            <div key={key} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center gap-2 mb-3">
                <Ic size={14} className="text-gray-500 flex-shrink-0" />
                <span className="font-medium text-sm text-gray-800">{label}</span>
                {note && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                    {note}
                  </span>
                )}
                <button onClick={() => toggleRoleVisible(key)}
                  className={`ml-auto flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all ${
                    visibleRoles.includes(key)
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-gray-100 border-gray-200 text-gray-400"
                  }`}>
                  <span className={`w-3 h-3 rounded-full ${visibleRoles.includes(key) ? "bg-green-500" : "bg-gray-300"}`} />
                  {visibleRoles.includes(key) ? t("settings.in_signup") : t("settings.hidden")}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(({ value, label: mLabel, desc, Icon: MIc }) => {
                  const active = current === value;
                  return (
                    <button key={value} onClick={() => setRoleFlow(key, value)}
                      disabled={saving === key}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-center transition-all ${
                        active
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      } disabled:opacity-50`}>
                      <MIc size={13} className={active ? "text-blue-600" : "text-gray-400"} />
                      <span className={`text-xs font-semibold ${active ? "text-blue-700" : "text-gray-700"}`}>{mLabel}</span>
                      <span className={`text-[10px] leading-tight ${active ? "text-blue-500" : "text-gray-400"}`}>{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Auto-approve domains */}
      <AutoApproveDomainsSection settings={settings} setSetting={setSetting} />
    </div>
  );
}

function AutoApproveDomainsSection({ settings, setSetting }) {
  const domains = settings["auto_approve_domains"] ?? [];
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function addDomain() {
    const raw = input.trim().toLowerCase().replace(/^@/, "");
    if (!raw || domains.includes(raw)) { setInput(""); return; }
    setSaving(true);
    await setSetting("auto_approve_domains", [...domains, raw]);
    setInput("");
    setSaving(false);
  }

  async function removeDomain(d) {
    await setSetting("auto_approve_domains", domains.filter(x => x !== d));
  }

  return (
    <div className="mt-6 border border-blue-100 rounded-xl p-4 bg-blue-50/40">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-blue-600" />
        <span className="text-sm font-semibold text-gray-800">Auto-approve domains</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Users who sign up with an email from these domains are approved instantly, skipping the manual queue — regardless of their role's flow setting.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {domains.length === 0 && <span className="text-xs text-gray-400 italic">No domains configured</span>}
        {domains.map(d => (
          <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
            @{d}
            <button onClick={() => removeDomain(d)} className="text-blue-400 hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addDomain()}
          placeholder="company.com"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button onClick={addDomain} disabled={saving || !input.trim()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

// ── SMTP settings ─────────────────────────────────────────────
function SettingsSMTPTab({ ssCtx }) {
  const { t } = useT();
  const { settings, setSetting } = ssCtx;
  const stored = settings["smtp_config"] ?? {};
  const EMPTY = { host: "", port: 587, username: "", password: "", from_email: "", from_name: "", encryption: "tls" };
  const [form, setForm] = useState({ ...EMPTY, ...stored });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    await setSetting("smtp_config", form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleTest() {
    if (!form.host || !form.from_email) { setTestResult({ ok: false, msg: "Fill in host and from email first." }); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await supabase.functions.invoke("send-email", {
        body: { to: form.from_email, subject: "TechCase SMTP Test", html: "<p>SMTP is working correctly.</p>", smtpConfig: form },
      });
      if (res.error) throw new Error(res.error.message ?? "Edge function error");
      setTestResult({ ok: true, msg: `Test email sent to ${form.from_email}` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || "Test failed" });
    }
    setTesting(false);
  }

  const field = (label, key, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={f(key)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
        <AlertTriangle size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-700 leading-relaxed">
          <span className="font-semibold">Two places to configure SMTP:</span><br />
          1. <span className="font-medium">Here</span> — used for platform notifications (approvals, rejections, alerts).<br />
          2. <span className="font-medium">Supabase Dashboard → Authentication → SMTP Settings</span> — required for OTP / Email Verify flows.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field("SMTP Host", "host", "text", "smtp.gmail.com")}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
          <input type="number" value={form.port} onChange={f("port")}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field("Username / Email", "username", "text", "you@domain.com")}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <input type={showPass ? "text" : "password"} value={form.password} onChange={f("password")}
              placeholder="App password or SMTP key"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={() => setShowPass(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <Lock size={13} /> : <Lock size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field("From Email", "from_email", "email", "noreply@yourdomain.com")}
        {field("From Name", "from_name", "text", "TechCase")}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Encryption</label>
        <div className="flex gap-2">
          {[["tls", "TLS (587)"], ["ssl", "SSL (465)"], ["none", "None (25)"]].map(([v, l]) => (
            <button key={v} onClick={() => setForm(p => ({ ...p, encryption: v }))}
              className={`flex-1 py-2 text-xs font-medium rounded-xl border-2 transition-all ${form.encryption === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${testResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {testResult.ok ? <BadgeCheck size={14} /> : <AlertTriangle size={14} />}
          {testResult.msg}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={handleTest} disabled={testing || saving}
          className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 font-medium disabled:opacity-50">
          {testing ? t("smtp.sending") : t("smtp.send_test")}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
          {saved ? t("smtp.saved") : saving ? t("state.saving") : t("smtp.save_settings")}
        </button>
      </div>
    </div>
  );
}

// ── Platform tab — Platform + Invoice + Trust stacked ─────────
function SettingsPlatformCombinedTab({ ssCtx }) {
  const SECTIONS = [
    { id: "signup",   label: "Sign-up Flow",        Icon: Shield,    Component: SettingsSignupFlowTab },
    { id: "smtp",     label: "Email / SMTP",        Icon: Mail,      Component: SettingsSMTPTab },
    { id: "platform", label: "Platform Defaults",   Icon: Sparkles,  Component: SettingsPlatformTab },
    { id: "invoice",  label: "Invoice Defaults",    Icon: Receipt,   Component: SettingsInvoiceTab },
    { id: "trust",    label: "Trust & Ratings",     Icon: BadgeCheck, Component: SettingsTrustTab },
  ];
  const [open, setOpen] = useState({ signup: true, smtp: false, platform: true, invoice: true, trust: true });
  return (
    <div className="space-y-4">
      {SECTIONS.map(({ id, label, Icon: Ic, Component }) => (
        <div key={id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setOpen(p => ({ ...p, [id]: !p[id] }))}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
            <span className="font-semibold text-gray-900 flex items-center gap-2">
              <Ic size={15} className="text-blue-600" />{label}
            </span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${open[id] ? "rotate-180" : ""}`} />
          </button>
          {open[id] && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <Component ssCtx={ssCtx} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SystemSettingsView({ auth, onNavigate }) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState("people");
  const ssCtx = useSystemSettings();

  const TABS = [
    { id: "people",     label: "People",         Icon: Users },
    { id: "plans",      label: "Plans",          Icon: CreditCard },
    { id: "pricing",    label: "Pricing",        Icon: DollarSign },
    { id: "workflow",   label: "Workflow",        Icon: TrendingUp },
    { id: "catalog",    label: "Catalog",         Icon: Tag },
    { id: "generation", label: "AI & Generation", Icon: Zap },
    { id: "abap",       label: "ABAP Templates",  Icon: FileCode2 },
    { id: "platform",   label: "Platform",        Icon: Sparkles },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map(({ id, label, Icon: Ic }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <Ic size={15} />{label}
          </button>
        ))}
      </div>

      {activeTab === "people"     && <SettingsPeopleTab ssCtx={ssCtx} auth={auth} onNavigate={onNavigate} />}
      {activeTab === "plans"      && <SettingsPlansTab ssCtx={ssCtx} auth={auth} />}
      {activeTab === "pricing"    && <SettingsPricingTab ssCtx={ssCtx} auth={auth} />}
      {activeTab === "workflow"   && <SettingsWorkflowTab auth={auth} ssCtx={ssCtx} />}
      {activeTab === "catalog"    && <SettingsCatalogTab ssCtx={ssCtx} />}
      {activeTab === "generation" && <SettingsGenerationTab ssCtx={ssCtx} />}
      {activeTab === "abap"       && <AbapTemplatesSection auth={auth} />}
      {activeTab === "platform"   && <SettingsPlatformCombinedTab ssCtx={ssCtx} />}
    </div>
  );
}

// ============================================================
// GLOBAL SEARCH
// ============================================================
function GlobalSearch({ auth, onNavigate, onClose }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ cases: [], projects: [], users: [] });
  const [searching, setSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults({ cases: [], projects: [], users: [] });
      return;
    }
    const q = query;
    const timer = setTimeout(async () => {
      setSearching(true);
      const [casesRes, projectsRes, usersRes] = await Promise.all([
        supabase.from('cases')
          .select('id, title, status, client_id')
          .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
          .limit(5),
        supabase.from('projects')
          .select('id, name, status')
          .ilike('name', `%${q}%`)
          .limit(5),
        supabase.from('users')
          .select('id, full_name, email, role, trust_level')
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(5),
      ]);
      setResults({
        cases:    casesRes.data    ?? [],
        projects: projectsRes.data ?? [],
        users:    usersRes.data    ?? [],
      });
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const allResults = [
    ...results.cases.map(c    => ({ type: 'case',    item: c })),
    ...results.projects.map(p => ({ type: 'project', item: p })),
    ...results.users.map(u    => ({ type: 'user',    item: u })),
  ];
  const casesOffset    = 0;
  const projectsOffset = results.cases.length;
  const usersOffset    = results.cases.length + results.projects.length;

  function handleSelect({ type, item }) {
    if (type === 'case') {
      logEvent('search.navigate', { metadata: { query, resultType: 'case',    resultId: item.id } });
      onNavigate({ view: 'cases',    caseId:    item.id });
    } else if (type === 'project') {
      logEvent('search.navigate', { metadata: { query, resultType: 'project', resultId: item.id } });
      onNavigate({ view: 'projects', projectId: item.id });
    } else if (type === 'user') {
      logEvent('search.navigate', { metadata: { query, resultType: 'user',    resultId: item.id } });
      onNavigate({ view: 'profile',  userId:    item.id });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      handleSelect(allResults[focusedIndex]);
    }
  }

  const searched      = query.length >= 2;
  const totalResults  = results.cases.length + results.projects.length + results.users.length;

  const sectionHeader = (label) => (
    <div className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
      {label}
    </div>
  );

  const resultRow = (globalIdx, icon, title, badge, onClick) => (
    <button
      key={globalIdx}
      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors text-sm border-b border-gray-50 last:border-0 ${focusedIndex === globalIdx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      onClick={onClick}
      onMouseEnter={() => setFocusedIndex(globalIdx)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <span className="font-medium text-gray-800 truncate">{title}</span>
        {badge && <span className="text-[11px] text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{badge}</span>}
      </div>
      <span className="text-xs text-blue-500 flex-shrink-0 ml-3">{t('search.view')} →</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: '70vh' }}
        onKeyDown={handleKeyDown}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          {searching
            ? <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
            : <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 outline-none text-gray-800 text-sm bg-transparent placeholder:text-gray-400"
          />
          {query
            ? <button onClick={() => { setQuery(''); setFocusedIndex(-1); inputRef.current?.focus(); }}
                className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            : null
          }
          <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono select-none">Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto">
          {!searched && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">{t('search.empty')}</div>
          )}
          {searched && !searching && totalResults === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {t('search.no_results')} &ldquo;{query}&rdquo;
            </div>
          )}

          {searched && results.cases.length > 0 && (
            <div>
              {sectionHeader(t('search.cases'))}
              {results.cases.map((c, i) =>
                resultRow(
                  casesOffset + i,
                  <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />,
                  c.title,
                  c.status?.replace(/_/g, ' '),
                  () => handleSelect({ type: 'case', item: c })
                )
              )}
            </div>
          )}

          {searched && results.projects.length > 0 && (
            <div>
              {sectionHeader(t('search.projects'))}
              {results.projects.map((p, i) =>
                resultRow(
                  projectsOffset + i,
                  <Layers className="w-4 h-4 text-purple-400 flex-shrink-0" />,
                  p.name,
                  p.status?.replace(/_/g, ' '),
                  () => handleSelect({ type: 'project', item: p })
                )
              )}
            </div>
          )}

          {searched && results.users.length > 0 && (
            <div>
              {sectionHeader(t('search.people'))}
              {results.users.map((u, i) =>
                resultRow(
                  usersOffset + i,
                  <Users className="w-4 h-4 text-green-500 flex-shrink-0" />,
                  u.full_name || u.email,
                  u.role,
                  () => handleSelect({ type: 'user', item: u })
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================
function StartDateMonitor({ auth }) {
  const [monitorCases, setMonitorCases] = useState([]);
  useEffect(() => {
    if (!auth?.user?.id) return;
    supabase.from("cases")
      .select("id, title, status, start_date, client_id, case_assignments(consultant_id)")
      .eq("status", "assigned")
      .not("start_date", "is", null)
      .then(({ data }) => setMonitorCases(data ?? []));
  }, [auth?.user?.id]);
  useStartDateMonitor(auth, monitorCases);
  return null;
}

export default function App() {
  const auth = useAuth();
  const [activeView, setActiveView]       = useState("dashboard");
  const [authed, setAuthed]               = useState(false);
  const [onboardingRole, setOnboarding]   = useState(null); // role string or null
  const unreadCount                       = useUnreadCount();
  const [searchOpen, setSearchOpen]       = useState(false);
  const [pendingCaseId, setPendingCaseId] = useState(null);
  const [pendingProjectId, setPendingProjectId] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingClientId, setPendingClientId] = useState(null);

  // Sync authed state with auth session
  useEffect(() => {
    if (!auth.loading) setAuthed(!!auth.user);
  }, [auth.loading, auth.user]);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed || !auth.user) {
    return (
      <SystemSettingsProvider>
        <LanguageProvider userId={null}>
          <AuthScreen onAuth={(newRole = null) => {
            setAuthed(true);
            if (newRole) setOnboarding(newRole);
          }} />
        </LanguageProvider>
      </SystemSettingsProvider>
    );
  }

  function completeOnboarding(view = "dashboard") {
    setOnboarding(null);
    setActiveView(view);
  }

  // Show role-specific onboarding wizard for new signups — full-screen, no sidebar
  if (onboardingRole && auth.user) {
    const bg = "min-h-screen bg-[#EAF4FD] p-6";
    let inner;
    if (onboardingRole === "consultant") {
      inner = <ConsultantOnboardingView auth={auth} onComplete={() => completeOnboarding("profile")} />;
    } else if (onboardingRole === "client") {
      inner = <ClientOnboardingView auth={auth} onComplete={() => completeOnboarding("client-profile")} />;
    } else {
      inner = <ManagerAdminWelcomeView auth={auth} onComplete={() => completeOnboarding("dashboard")} />;
    }
    return (
      <SystemSettingsProvider>
        <LanguageProvider userId={auth.user?.id} initialLang={auth.profile?.language_pref}>
          <div className={bg}>{inner}</div>
        </LanguageProvider>
      </SystemSettingsProvider>
    );
  }

  async function handleSignOut() {
    await auth.signOut();
    setAuthed(false);
    setOnboarding(null);
    setActiveView("dashboard");
  }

  function renderView() {
    switch (activeView) {
      case "dashboard":      return <Dashboard auth={auth} />;
      case "projects":       return <ProjectsView auth={auth} initialProjectId={pendingProjectId} />;
      case "cases":          return <CasesView auth={auth} initialCaseId={pendingCaseId} />;
      case "my-cases":       return <CasesView auth={auth} initialCaseId={pendingCaseId} />;
      case "arena":          return <ArenaView auth={auth} />;
      case "profile":        return pendingUserId
                               ? <ConsultantProfileView userId={pendingUserId} onBack={() => { setActiveView("settings"); setPendingUserId(null); }} />
                               : auth.isConsultant ? <ConsultantProfileView /> : <ProfileView auth={auth} />;
      case "consultants":    return <ConsultantsView auth={auth} />;
      case "users":          return auth.isAdmin ? <UsersView /> : <Dashboard auth={auth} />;
      case "reports":        return auth.isAdmin ? <ReportsView /> : <Dashboard auth={auth} />;
      case "sla":            return (auth.isAdmin || auth.isManager) ? <SlaView auth={auth} /> : <Dashboard auth={auth} />;
      case "db-connections": return <DbConnectionsView auth={auth} />;
      case "team-members":   return <ClientTeamView auth={auth} />;
      case "client-profile": return (auth.isClient || ((auth.isAdmin || auth.isManager) && pendingClientId))
        ? <ClientProfileView auth={auth} clientId={pendingClientId ?? auth.user?.id} onBack={pendingClientId ? () => { setPendingClientId(null); setActiveView("settings"); } : null} />
        : <Dashboard auth={auth} />;
      case "lifecycle":      return (auth.isAdmin || auth.isManager) ? <LifecycleSettingsView auth={auth} /> : <Dashboard auth={auth} />;
      case "settings":       return (auth.isAdmin || auth.isManager) ? <SystemSettingsView auth={auth} onNavigate={({ view, userId, clientId }) => { setPendingUserId(userId ?? null); setPendingClientId(clientId ?? null); setActiveView(view); }} /> : <Dashboard auth={auth} />;
      case "audit_log":      return (auth.isAdmin || auth.isManager)
        ? <AuditLogDashboard onNavigate={({ view, caseId, projectId, userId }) => {
            setPendingCaseId(caseId ?? null);
            setPendingProjectId(projectId ?? null);
            setPendingUserId(userId ?? null);
            setActiveView(view);
          }} />
        : <Dashboard auth={auth} />;
      case "approvals":      return (auth.isAdmin || auth.isManager) ? <UserApprovalQueue /> : <Dashboard auth={auth} />;
      case "templates":      return (auth.isAdmin || auth.isManager) ? <CaseTemplatesView auth={auth} /> : <Dashboard auth={auth} />;
      case "notifications":  return <NotificationsView />;
      case "invoices":       return <InvoicesView auth={auth} />;
      case "kanban":         return <KanbanView auth={auth} />;
      case "time":           return <TimeEntriesView auth={auth} />;
      default:               return <Dashboard auth={auth} />;
    }
  }

  if (auth.profile && auth.profile.verification_status !== 'approved') {
    return <PendingApprovalScreen auth={auth} />;
  }

  {/* Profile gate: consultant needs headline, client needs company_name */}
  if (auth.profile?.verification_status === 'approved') {
    const _role = auth.profile.role;
    const _cpC  = Array.isArray(auth.profile.consultant_profiles) ? auth.profile.consultant_profiles[0] : auth.profile.consultant_profiles;
    const _cpCl = Array.isArray(auth.profile.client_profiles)    ? auth.profile.client_profiles[0]    : auth.profile.client_profiles;
    const _done = (_role === "consultant" && !!_cpC?.headline) ||
                  (_role === "client"     && !!_cpCl?.company_name) ||
                  (_role !== "consultant" && _role !== "client");
    if (!_done) return <ProfileOnboardingScreen auth={auth} />;
  }

  return (
    <SystemSettingsProvider>
      <LanguageProvider userId={auth.user?.id} initialLang={auth.profile?.language_pref}>
        <StartDateMonitor auth={auth} />
        <div className="min-h-screen bg-[#EAF4FD]">
          <Sidebar
            role={auth.role}
            activeView={activeView}
            onNav={setActiveView}
            onSignOut={handleSignOut}
            profile={auth.profile}
            unreadCount={unreadCount}
            auth={auth}
            onSearchOpen={() => setSearchOpen(true)}
          />
          {searchOpen && (
            <GlobalSearch
              auth={auth}
              onNavigate={({ view, caseId, projectId, userId }) => {
                setPendingCaseId(caseId ?? null);
                setPendingProjectId(projectId ?? null);
                setPendingUserId(userId ?? null);
                setActiveView(view);
                setSearchOpen(false);
              }}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <main className="ml-64 p-8 min-h-screen">
            <div className="max-w-5xl mx-auto">
              <ErrorBoundary key={activeView}>
                {renderView()}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </LanguageProvider>
    </SystemSettingsProvider>
  );
}

