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
  Badge, Spinner, ErrorBoundary, PendingApprovalScreen, ConsultantProjectsHierarchy,
  RESUME_SECTIONS, ResumeImporter, ProfileOnboardingScreen,
  ROLE_LABELS, ProfileCompleteWizard,
  TrustBadge, TierProgressBar, VouchingPanel, PlanUsageCard,
} from "./src/components/ProfileComponents.jsx";


import { ConsultantProfileView } from "./src/components/ConsultantProfileView.jsx";
import { HeadhunterDashboard, HeadhunterCandidates, HeadhunterPipeline, HeadhunterPlacements } from "./src/views/HeadhunterViews.jsx";
import DispatchView from "./src/views/DispatchView.jsx";
import AreaLeaderView from "./src/views/AreaLeaderView.jsx";
import SpecReviewView from "./src/views/SpecReviewView.jsx";
import { MigrationHub } from "./src/views/MigrationViews.jsx";
import { TransportView } from "./src/views/TransportView.jsx";
import { FitGapView } from "./src/views/FitGapView.jsx";
import { TestingView } from "./src/views/TestingView.jsx";


import { NotificationBell } from "./src/components/NotificationBell.jsx";


import { EmptyState, Modal, Input, Textarea, Select } from "./src/components/ui.jsx";


// ============================================================
// AUTH SCREEN
// ============================================================
import { AuthScreen } from "./src/views/AuthScreen.jsx";
import { LandingView } from "./src/views/LandingView.jsx";
import ProjectShareView from "./src/views/ProjectShareView.jsx";
import ApprovalView from "./src/views/ApprovalView.jsx";
import MyReviewsView from "./src/views/MyReviewsView.jsx";


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
import { useConsultantShortlist, ConsultantProfilePanel, ArenaView } from "./src/views/ArenaView.jsx";


// ============================================================
// CONSULTANT PROFILE VIEW
// ============================================================
import { ProfileView } from "./src/views/ProfileView.jsx";


// ============================================================
// CONSULTANTS DIRECTORY (Manager / Client View)
// ============================================================
import { ConsultantsView, ConsultantDetailModal } from "./src/views/ConsultantsView.jsx";


// ============================================================
// NOTIFICATIONS VIEW
// ============================================================
import {
  NotificationsView, UsersView, ReportsView,
  SlaClientView, SlaClientDetail,
  DbConnectionsView, SapProfileFields, SapProfileBadges, DbConnectionsList,
  ClientTeamView, ClientTeamList,
} from "./src/views/OperationsViews.jsx";
import { SlaView } from "./src/views/SlaView.jsx";


// ============================================================
// ============================================================
// LIFECYCLE SETTINGS VIEW (admin/manager global page)
// ============================================================
import {
  LifecycleSettingsView,
  CASE_DEFAULTS_EMPTY, CaseDefaultsPanel,
  AS_DEFAULTS, AssignmentSettingsPanel,
} from "./src/views/SettingsSubViews.jsx";


import {
  useClientProfile,
  ABAP_STANDARDS_DEFAULTS, resolveAbapStandards, buildAbapStandardsPrompt,
  sapObjectPath,
  SAP_ENV_TYPE_META, SapIntegrationPanel, ProjectSapEnvPanel,
  AbapStandardsPanel, AbapTemplatesSection,
  SAP_OBJECT_TYPES, SapImplementationTab,
} from "./src/components/SapPanels.jsx";


import { ClientProfileView } from "./src/views/ClientProfileView.jsx";


// ============================================================
// V9: INVOICES VIEW
// ============================================================
import { InvoicesView } from "./src/views/InvoicesView.jsx";


// ============================================================
// V9: KANBAN CARD  (hoisted so React never remounts on re-render)
// ============================================================
import { PRIORITY_DOT, KanbanCard, KanbanView } from "./src/views/KanbanView.jsx";


// ============================================================
// V9: TIME ENTRIES VIEW
// ============================================================
import { TimeEntriesView } from "./src/views/TimeEntriesView.jsx";


// ============================================================
// CONSULTANT ONBOARDING WIZARD
// ============================================================

import {
  ONBOARDING_STEPS, OnboardingRoadmap, ConsultantOnboardingView,
  ONBOARDING_STEPS_CLIENT, ClientOnboardingView,
  ManagerAdminWelcomeView, InvitedClientOnboardingView,
} from "./src/views/OnboardingViews.jsx";
import { JoinScreen } from "./src/views/JoinScreen.jsx";


import {
  SystemSettingsContext, usePlatformBranding, usePlanConfig,
  useVisibilitySettings, filterCasesByVisibility,
  SystemSettingsProvider, useSystemSettings, usePermissions,
} from "./src/hooks/useSystemSettings.jsx";

import { ThemeProvider } from "./src/context/ThemeContext.jsx";

import {
  UpgradeModal,
  SettingsUsersTab, SettingsPhasesTab, SettingsCatalogTab,
  SettingsPlatformTab, SettingsRolesTab, SettingsGenerationTab,
  UserApprovalQueue, ApprovalHistory,
  ClientRatingModal, RatingModal,
  AUDIT_EVENT_COLORS, AUDIT_EVENT_LABELS, AUDIT_ENTITY_ICONS,
  auditNavTarget, auditRenderDetail,
  AuditEntityPanel, AuditLogDashboard,
  SettingsTrustTab, SettingsInvoiceTab, SettingsPeopleTab,
  SettingsPlansTab, SettingsPricingTab, SettingsWorkflowTab,
  SettingsSignupFlowTab, AutoApproveDomainsSection,
  SettingsSMTPTab, SettingsPlatformCombinedTab,
  SystemSettingsView,
} from "./src/views/SystemSettingsView.jsx";


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

// Intercept /join/:token before any auth flow
const _joinMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/join\/([^/?#]+)/);
// Intercept /share/:token — public read-only project view, no auth required
const _shareMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/share\/([^/?#]+)/);
// Intercept /approve/:token — tokenized blueprint review view, no auth required
const _approveMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/approve\/([^/?#]+)/);

export default function App() {
  const auth = useAuth();
  const [activeView, setActiveView]       = useState("dashboard");
  const [authed, setAuthed]               = useState(false);
  const [showAuth, setShowAuth]           = useState(() => {
    try { return !!localStorage.getItem('arena_returning'); } catch { return false; }
  });
  const [onboardingRole, setOnboarding]   = useState(null); // role string or null
  const unreadCount                       = useUnreadCount();
  const [searchOpen, setSearchOpen]       = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [pendingCaseId, setPendingCaseId] = useState(null);
  const [pendingProjectId, setPendingProjectId] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingClientId, setPendingClientId] = useState(null);
  const [stripeBanner, setStripeBanner] = useState(null); // null | 'success' | 'cancel'

  // Sync authed state with auth session
  useEffect(() => {
    if (!auth.loading) {
      setAuthed(!!auth.user);
      if (auth.user) {
        try { localStorage.setItem('arena_returning', '1'); } catch {}
      }
    }
  }, [auth.loading, auth.user]);

  // Handle Stripe return URL (?stripe=success|cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeParam = params.get('stripe');
    if (stripeParam === 'success' || stripeParam === 'cancel') {
      setStripeBanner(stripeParam);
      params.delete('stripe');
      params.delete('plan');
      const newSearch = params.toString();
      window.history.replaceState(null, '', newSearch ? `?${newSearch}` : window.location.pathname);
      if (stripeParam === 'success') setTimeout(() => setStripeBanner(null), 8000);
      else setTimeout(() => setStripeBanner(null), 5000);
    }
  }, []);

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

  // /share/:token — public read-only project view, no login needed
  if (_shareMatch) {
    return (
      <LanguageProvider>
        <ProjectShareView token={_shareMatch[1]} />
      </LanguageProvider>
    );
  }

  // /approve/:token — tokenized blueprint review, no login needed
  if (_approveMatch) {
    return <ApprovalView token={_approveMatch[1]} />;
  }

  // /join/:token — show branded join screen before any auth check
  if (_joinMatch) {
    return (
      <SystemSettingsProvider>
        <JoinScreen
          token={_joinMatch[1]}
          onJoined={() => {
            // After successful signup, clear the /join path and reload into the app
            window.history.replaceState(null, "", "/");
            window.location.reload();
          }}
        />
      </SystemSettingsProvider>
    );
  }

  if (auth.loading) {
    return (
      <div className="arena-dark min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed || !auth.user) {
    if (!showAuth) {
      return <LandingView onSignIn={() => {
        try { localStorage.setItem('arena_returning', '1'); } catch {}
        setShowAuth(true);
      }} />;
    }
    return (
      <SystemSettingsProvider>
        <LanguageProvider userId={null}>
          <AuthScreen
            onBack={() => setShowAuth(false)}
            onAuth={(newRole = null) => {
              try { localStorage.setItem('arena_returning', '1'); } catch {}
              setAuthed(true);
              setShowAuth(false);
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
    const bg = "arena-dark min-h-screen bg-[#EAF4FD] p-6";
    let inner;
    if (onboardingRole === "consultant") {
      inner = <ConsultantOnboardingView auth={auth} onComplete={() => completeOnboarding("profile")} />;
    } else if (onboardingRole === "client") {
      inner = <ClientOnboardingView auth={auth} onComplete={() => completeOnboarding("client-profile")} />;
    } else if (onboardingRole === "invited_client") {
      inner = <InvitedClientOnboardingView auth={auth} onComplete={() => completeOnboarding("my-cases")} />;
    } else if (onboardingRole === "key_user" || onboardingRole === "internal_consultant" || onboardingRole === "project_manager") {
      inner = <ConsultantOnboardingView auth={auth} onComplete={() => completeOnboarding("cases")} />;
    } else if (onboardingRole === "area_leader") {
      inner = <ManagerAdminWelcomeView auth={auth} onComplete={() => completeOnboarding("leader-cases")} />;
    } else if (onboardingRole === "dispatch") {
      inner = <ManagerAdminWelcomeView auth={auth} onComplete={() => completeOnboarding("dispatch-queue")} />;
    } else if (onboardingRole === "headhunter") {
      inner = <ManagerAdminWelcomeView auth={auth} onComplete={() => completeOnboarding("hh-pipeline")} />;
    } else if (onboardingRole === "final_user") {
      inner = <ClientOnboardingView auth={auth} onComplete={() => completeOnboarding("my-cases")} />;
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
    setShowAuth(true);
  }

  function renderView() {
    // Invited clients are locked to dashboard + their cases only
    if (auth.isInvitedClient && !["dashboard","my-cases","notifications","client-profile"].includes(activeView)) {
      return <CasesView auth={auth} initialCaseId={pendingCaseId} />;
    }

    switch (activeView) {
      case "dashboard":      return auth.isHeadhunter
                               ? <HeadhunterDashboard auth={auth} onNavigate={setActiveView} />
                               : <Dashboard auth={auth} onNavigate={setActiveView} />;
      case "hh-candidates":  return auth.isHeadhunter ? <HeadhunterCandidates auth={auth} /> : <Dashboard auth={auth} />;
      case "hh-pipeline":    return auth.isHeadhunter ? <HeadhunterPipeline auth={auth} /> : <Dashboard auth={auth} />;
      case "hh-placements":  return auth.isHeadhunter ? <HeadhunterPlacements auth={auth} /> : <Dashboard auth={auth} />;
      case "projects":       return <ProjectsView auth={auth} initialProjectId={pendingProjectId} />;
      case "cases":          return <CasesView auth={auth} initialCaseId={pendingCaseId} />;
      case "my-cases":       return <CasesView auth={auth} initialCaseId={pendingCaseId} />;
      case "arena":          return <ArenaView auth={auth} />;
      case "profile":        return pendingUserId
                               ? <ConsultantProfileView userId={pendingUserId} onBack={() => { setActiveView("settings"); setPendingUserId(null); }} />
                               : <ProfileView auth={auth} />;
      case "consultants":    return <ConsultantsView auth={auth} />;
      case "users":          return auth.isAdmin ? <UsersView /> : <Dashboard auth={auth} />;
      case "reports":        return (auth.isAdmin || auth.isManager) ? <ReportsView /> : <Dashboard auth={auth} />;
      case "sla":            return (auth.isAdmin || auth.isManager) ? <SlaView auth={auth} /> : <Dashboard auth={auth} />;
      case "db-connections": return <DbConnectionsView auth={auth} />;
      case "team-members":   return <ClientTeamView auth={auth} />;
      case "client-profile": return (auth.isClient || auth.isInvitedClient || ((auth.isAdmin || auth.isManager) && pendingClientId))
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
      case "my-reviews":    return <MyReviewsView auth={auth} />;
      case "invoices":       return <InvoicesView auth={auth} />;
      case "kanban":         return <KanbanView auth={auth} />;
      case "time":           return <TimeEntriesView auth={auth} />;
      case "dispatch-queue": return (auth.role === 'dispatch' || auth.isAdmin || auth.isManager) ? <DispatchView auth={auth} /> : <Dashboard auth={auth} />;
      case "leader-cases":   return <AreaLeaderView auth={auth} onNavigate={({ view, caseId }) => { setPendingCaseId(caseId ?? null); setActiveView(view); }} />;
      case "spec-review":    return <SpecReviewView auth={auth} onNavigate={({ view, caseId }) => { setPendingCaseId(caseId ?? null); setActiveView(view); }} />;
      case "migration":      return (auth.isAdmin || auth.isManager) ? <MigrationHub auth={auth} /> : <Dashboard auth={auth} />;
      case "transport":      return (auth.isAdmin || auth.isManager) ? <TransportView auth={auth} /> : <Dashboard auth={auth} />;
      case "fitgap":         return (auth.isAdmin || auth.isManager) ? <FitGapView auth={auth} /> : <Dashboard auth={auth} />;
      case "testing":        return (auth.isAdmin || auth.isManager) ? <TestingView auth={auth} /> : <Dashboard auth={auth} />;
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
    const _done = (_role === "consultant"     && !!_cpC?.headline) ||
                  (_role === "client"         && !!_cpCl?.company_name) ||
                  (_role === "invited_client" && !!_cpCl?.company_name) ||
                  (_role !== "consultant" && _role !== "client" && _role !== "invited_client");
    if (!_done) {
      if (_role === "invited_client") {
        return (
          <SystemSettingsProvider>
            <LanguageProvider userId={auth.user?.id} initialLang={auth.profile?.language_pref}>
              <div className="arena-dark min-h-screen bg-[#EAF4FD] p-6">
                <InvitedClientOnboardingView auth={auth} onComplete={() => auth.refreshProfile()} />
              </div>
            </LanguageProvider>
          </SystemSettingsProvider>
        );
      }
      return <ProfileOnboardingScreen auth={auth} />;
    }
  }

  return (
    <ThemeProvider initialTheme={auth.profile?.ui_theme} userId={auth.user?.id}>
    <SystemSettingsProvider>
      <LanguageProvider userId={auth.user?.id} initialLang={auth.profile?.language_pref}>
        <StartDateMonitor auth={auth} />
        <div className="min-h-screen bg-[#EAF4FD]">
          <Sidebar
            role={auth.role}
            activeView={activeView}
            onNav={v => { setActiveView(v); setSidebarOpen(false); }}
            onSignOut={handleSignOut}
            profile={auth.profile}
            unreadCount={unreadCount}
            auth={auth}
            onSearchOpen={() => setSearchOpen(true)}
            mobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
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
          {/* Stripe return banner */}
          {stripeBanner && (
            <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold transition-all ${
              stripeBanner === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-200'
            }`}>
              {stripeBanner === 'success' ? '✓ Subscription activated — welcome to your new plan!' : 'Checkout cancelled. You have not been charged.'}
              <button onClick={() => setStripeBanner(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}

          <main className="md:ml-64 p-4 md:p-8 min-h-screen">
            {/* Mobile hamburger */}
            <button onClick={() => setSidebarOpen(true)}
              className="md:hidden fixed top-4 left-4 z-20 w-10 h-10 flex items-center justify-center rounded-xl bg-[#0B0F1A] text-white shadow-lg"
              aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/>
              </svg>
            </button>
            <div className="max-w-5xl mx-auto pt-12 md:pt-0">
              <ErrorBoundary key={activeView}>
                {renderView()}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </LanguageProvider>
    </SystemSettingsProvider>
    </ThemeProvider>
  );
}

