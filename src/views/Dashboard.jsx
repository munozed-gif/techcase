import { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, Briefcase, CalendarDays, Check, CheckCircle2,
  ChevronRight, ClipboardList, Clock, Code2, FolderOpen, Heart, Headphones,
  Inbox, Layers, ListChecks, PauseCircle, SlidersHorizontal, Smile, Tag,
  Target, ThumbsUp, UserCheck, Users, X, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useCases } from "../hooks/useCaseHooks.js";
import { useApplications } from "../hooks/useCaseHooks.js";
import { useProjects } from "../hooks/useCoreHooks.js";
import { useFollowedClients } from "../hooks/useProfileHooks.js";
import { useNotifications } from "../hooks/useNotificationHooks.js";
import { useActivityFeed, useFeedPrefs, useGlobalActivity } from "../hooks/useActivityHooks.js";
import { filterCasesByVisibility, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { getLifecycleStages } from "../lib/businessConstants.js";
import { FeedCard, FeedPreferencesModal } from "../components/FeedComponents.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { APP_STATUS_COLORS, CASE_CARD_COLORS, INDUSTRY_AREAS, PLAN_BADGE, PRIORITY_COLORS, ROLE_COLORS, SAP_AREAS, STATUS_CARD_ICONS, STATUS_COLORS } from "../lib/businessConstants.js";
import { PRIORITY_LABEL_KEYS, STATUS_LABEL_KEYS, cap, fmt, fmtDate } from "../lib/uiUtils.jsx";
import { ApplyWizard } from "./ApplyWizard.jsx";
import { CaseDetail } from "./CaseDetail.jsx";
import { ProjectAvatar } from "./Projects.jsx";
import { ClientRatingModal } from "./SystemSettingsView.jsx";

function Dashboard({ auth, onNavigate }) {
  const { t } = useT();
  const { settings: catalogSettings } = useSystemSettings();
  const { cases: _rawCases, loading: casesLoading, updateCase, deleteCase } = useCases();
  const _dashVisCfg = useVisibilitySettings();
  const cases = filterCasesByVisibility(_rawCases, auth, _dashVisCfg);
  const { templates: lcTemplates } = useLifecycleTemplates();
  const { projects: allProjects } = useProjects();
  const [hdRatings, setHdRatings] = useState([]);
  const { applications } = useApplications();
  const [applyingToCase, setApplying]   = useState(null);
  const [clientFilter, setClientFilter] = useState(null); // { id, name } | null
  const [activeTab, setActiveTab]       = useState(null);
  const [availTab, setAvailTab]         = useState("all");
  const [filterSap, setFilterSap]       = useState("");
  const [filterIndustry, setFilterInd]  = useState("");
  const [filterStartFrom, setStartFrom] = useState("");
  const [feedFilter, setFeedFilter]     = useState("all");
  const [showFeedPrefs, setShowFeedPrefs] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const { followed, isFollowing, toggle: toggleFollow } = useFollowedClients();
  const { prefs, savePrefs } = useFeedPrefs(auth.user?.id);
  const { markRead } = useNotifications();
  const [ratedCaseIds, setRatedCaseIds]       = useState(new Set());
  const [ratePendingModal, setRatePendingModal] = useState(null); // { caseId, caseTitle, rateeId, rateeName }

  // Fetch which cases this consultant has already rated the CLIENT for (ratee_role = 'client')
  useEffect(() => {
    if (!auth.isConsultant || !auth.user?.id) return;
    supabase.from('case_ratings')
      .select('case_id')
      .eq('rater_id', auth.user.id)
      .eq('ratee_role', 'client')
      .then(({ data }) => {
        setRatedCaseIds(new Set((data ?? []).map(r => r.case_id)));
      });
  }, [auth.isConsultant, auth.user?.id]);

  // Fetch ratings for help desk cases (client satisfaction)
  useEffect(() => {
    if (cases.length === 0) return;
    const hdProjectIds = new Set(
      (allProjects ?? []).filter(p => p.project_type === 'help_desk').map(p => p.id)
    );
    const hdCaseIds = cases
      .filter(c => c.project_id && hdProjectIds.has(c.project_id))
      .map(c => c.id);
    if (hdCaseIds.length === 0) { setHdRatings([]); return; }
    supabase.from('case_ratings')
      .select('case_id, scores, rater_role')
      .in('case_id', hdCaseIds)
      .then(({ data }) => setHdRatings(data ?? []));
  }, [cases, allProjects]);

  // Pre-compute filtered sets
  const myApplications   = applications.filter(a => a.consultant_id === auth.user?.id);
  const appliedCaseIds   = new Set(myApplications.map(a => a.case_id));
  const assignedCaseIds  = new Set(
    cases.flatMap(c => c.case_assignments ?? [])
      .filter(a => a.consultant_id === auth.user?.id)
      .map(a => a.case_id ?? a.id)
  );
  const TRUST_ORDER = ['starter', 'silver', 'gold', 'platinum'];
  const _userTrustIdx = TRUST_ORDER.indexOf(auth.profile?.trust_level ?? 'starter');
  const availableCases = cases.filter(c => {
    const lcStages = getLifecycleStages(c.case_lifecycle, lcTemplates);
    const arenaKeys = lcStages.filter(s => s.is_arena).map(s => s.key);
    const isArenaStage = arenaKeys.length > 0 ? arenaKeys.includes(c.status) : c.status === 'estimated';
    if (!isArenaStage) return false;
    if (c.case_assignments && c.case_assignments.length > 0) return false;
    if (appliedCaseIds.has(c.id)) return false;
    const vis = _dashVisCfg.getCaseVisibility(c.id, c.client_id);
    if (vis === 'private') return false;
    if (vis === 'invite-only') {
      const invites = _dashVisCfg.getCaseInvitations(c.id);
      if (!invites.some(i => i.consultantId === auth.user?.id)) return false;
    }
    if (c.min_trust_level && TRUST_ORDER.indexOf(c.min_trust_level) > _userTrustIdx) return false;
    return true;
  });
  const _hiddenTierCases = cases.filter(c => {
    const lcStages = getLifecycleStages(c.case_lifecycle, lcTemplates);
    const arenaKeys = lcStages.filter(s => s.is_arena).map(s => s.key);
    const isArenaStage = arenaKeys.length > 0 ? arenaKeys.includes(c.status) : c.status === 'estimated';
    return isArenaStage &&
      !appliedCaseIds.has(c.id) &&
      !(c.case_assignments && c.case_assignments.length > 0) &&
      c.min_trust_level &&
      TRUST_ORDER.indexOf(c.min_trust_level) > _userTrustIdx;
  });
  const _nextUnlockTier = _hiddenTierCases.length > 0
    ? _hiddenTierCases.reduce((best, c) => {
        const idx = TRUST_ORDER.indexOf(c.min_trust_level);
        return idx < TRUST_ORDER.indexOf(best) ? c.min_trust_level : best;
      }, 'platinum')
    : null;

  const filteredAvailable = availableCases.filter(c => {
    if (filterSap       && c.area_sap      !== filterSap)      return false;
    if (filterIndustry  && c.area_industry !== filterIndustry) return false;
    if (filterStartFrom && c.start_date    && c.start_date < filterStartFrom) return false;
    return true;
  });
  const followingCases = filteredAvailable.filter(c => isFollowing(c.client_id));
  const otherCases     = filteredAvailable.filter(c => !isFollowing(c.client_id));
  const assignedCases    = cases.filter(c => c.case_assignments?.some(a => a.consultant_id === auth.user?.id));
  const myCases          = cases.filter(c => c.client_id === auth.user?.id);
  const managedCases     = cases.filter(c => c.manager_id === auth.user?.id);

  const visibleCaseIds   = cases.map(c => c.id);
  const { activities, loading: actLoading } = useGlobalActivity(visibleCaseIds);
  const { items: feedItems, loading: feedLoading, refresh: refreshFeed } = useActivityFeed(
    prefs.scope === 'all' ? visibleCaseIds
      : auth.isConsultant ? cases.filter(c => c.case_assignments?.some(a => a.consultant_id === auth.user?.id)).map(c => c.id)
      : auth.isClient ? cases.filter(c => c.client_id === auth.user?.id).map(c => c.id)
      : visibleCaseIds,
    auth.user?.id
  );
  const caseById = Object.fromEntries(cases.map(c => [c.id, c]));

  // Filter feed items by type and prefs
  const filteredFeed = feedItems.filter(item => {
    if (feedFilter !== 'all' && item._type !== feedFilter) return false;
    if (!prefs.show_comments    && item._type === 'comment')       return false;
    if (!prefs.show_progress    && item._type === 'progress')      return false;
    if (!prefs.show_status      && item._type === 'status_change') return false;
    if (!prefs.show_assignments && item._type === 'assignment')    return false;
    if (!prefs.show_documents   && item._type === 'document')      return false;
    if (!prefs.show_alerts      && (item._type === 'alert' || item._type === 'milestone')) return false;
    return true;
  });
  const unreadFeedCount = feedItems.filter(i => i.is_unread).length;

  // ── Client strip ─────────────────────────────────────────────
  const STRIP_PALETTE = [
    { bg:'#dbeafe', fg:'#1e40af' }, { bg:'#ccfbf1', fg:'#0f766e' },
    { bg:'#ede9fe', fg:'#6d28d9' }, { bg:'#fce7f3', fg:'#9d174d' },
    { bg:'#fef3c7', fg:'#92400e' }, { bg:'#d1fae5', fg:'#065f46' },
    { bg:'#e0f2fe', fg:'#075985' }, { bg:'#fee2e2', fg:'#991b1b' },
  ];
  function stripClientEntry(c, map) {
    if (!c.client_id) return;
    const cpRaw = c.client?.client_profiles;
    const company = (Array.isArray(cpRaw) ? cpRaw[0]?.company_name : cpRaw?.company_name)
      || c.client?.full_name || 'Unknown';
    if (!map.has(c.client_id)) {
      const ws = company.trim().split(/\s+/);
      map.set(c.client_id, {
        id: c.client_id, name: company,
        initials: ws.length >= 2 ? (ws[0][0] + ws[1][0]).toUpperCase() : company.slice(0, 2).toUpperCase(),
        color: STRIP_PALETTE[map.size % STRIP_PALETTE.length],
        avatarUrl: c.client?.avatar_url || null,
        activeCases: 0, pastCases: 0, isFollowed: false,
      });
    }
  }
  const clientStripMap = new Map();
  // 1. seed from role-appropriate assigned/managed cases
  const stripSource = auth.isConsultant ? assignedCases
    : auth.isManager ? managedCases
    : auth.isAdmin   ? cases : [];
  stripSource.forEach(c => {
    stripClientEntry(c, clientStripMap);
    const e = clientStripMap.get(c.client_id);
    if (!e) return;
    if (['in_progress', 'open'].includes(c.status)) e.activeCases++;
    else if (c.status === 'completed') e.pastCases++;
  });
  // 2. seed from followed clients (look up via any visible case)
  if (auth.isConsultant && followed.length > 0) {
    cases.forEach(c => {
      if (!c.client_id || !followed.includes(c.client_id)) return;
      stripClientEntry(c, clientStripMap);
      clientStripMap.get(c.client_id).isFollowed = true;
    });
  }
  // 3. seed ALL clients with active cases visible on the platform
  cases.forEach(c => {
    if (!c.client_id || !['in_progress', 'open'].includes(c.status)) return;
    stripClientEntry(c, clientStripMap);
    clientStripMap.get(c.client_id).hasActivePlatformCase = true;
  });
  const activeClients    = [...clientStripMap.values()].filter(cl => cl.activeCases > 0);
  const followedClients  = [...clientStripMap.values()].filter(cl => cl.activeCases === 0 && cl.pastCases === 0 && cl.isFollowed);
  const platformClients  = [...clientStripMap.values()].filter(cl => cl.activeCases === 0 && !cl.isFollowed && cl.hasActivePlatformCase);
  const pastClients      = [...clientStripMap.values()].filter(cl => cl.activeCases === 0 && cl.pastCases > 0 && !cl.hasActivePlatformCase);
  const showClientStrip  = activeClients.length + followedClients.length + platformClients.length + pastClients.length > 0;

  // Stat tiles — each carries its pre-filtered items and type for the list panel
  const statDefs = {
    admin: [
      { id: "total",    label: t("dashboard.total_cases"),     Icon: FolderOpen,    color: "gray",   type: "cases",        items: cases },
      { id: "open",     label: t("dashboard.open_cases"),      Icon: Inbox,         color: "green",  type: "cases",        items: cases.filter(c => c.status === "open") },
      { id: "progress", label: t("dashboard.in_progress"),     Icon: Activity,      color: "blue",   type: "cases",        items: cases.filter(c => c.status === "in_progress") },
      { id: "apps",     label: t("label.applications"),        Icon: ClipboardList, color: "purple", type: "applications", items: applications },
    ],
    manager: [
      { id: "mycases",  label: t("dashboard.my_cases"),        Icon: FolderOpen,    color: "gray",   type: "cases",        items: managedCases },
      { id: "open",     label: t("dashboard.open_cases"),      Icon: Inbox,         color: "green",  type: "cases",        items: cases.filter(c => c.status === "open") },
      { id: "pending",  label: t("dashboard.pending_reviews"), Icon: Clock,         color: "yellow", type: "applications", items: applications.filter(a => a.status === "pending") },
    ],
    consultant: [
      { id: "myapps",   label: t("dashboard.my_applications"), Icon: ClipboardList, color: "gray",  type: "applications", items: myApplications },
      { id: "accepted", label: t("dashboard.accepted"),        Icon: CheckCircle2,  color: "green", type: "applications", items: myApplications.filter(a => a.status === "accepted") },
      { id: "open",     label: t("dashboard.open_cases"),      Icon: Inbox,         color: "green", type: "cases",        items: availableCases },
    ],
    client: [
      { id: "mycases",   label: t("dashboard.my_cases"),   Icon: FolderOpen,   color: "gray",  type: "cases", items: myCases },
      { id: "active",    label: t("label.active"),          Icon: Activity,     color: "blue",  type: "cases", items: myCases.filter(c => c.status === "in_progress") },
      { id: "completed", label: t("dashboard.completed"),   Icon: CheckCircle2, color: "green", type: "cases", items: myCases.filter(c => c.status === "completed") },
    ],
    key_user: (() => {
      const kuCases = cases.filter(c => c.case_key_users?.some(ku => ku.user_id === auth.user?.id));
      return [
        { id: "mycases",   label: t("dashboard.my_cases"),   Icon: FolderOpen,   color: "gray",  type: "cases", items: kuCases },
        { id: "active",    label: t("label.active"),          Icon: Activity,     color: "blue",  type: "cases", items: kuCases.filter(c => c.status === "in_progress") },
        { id: "completed", label: t("dashboard.completed"),   Icon: CheckCircle2, color: "green", type: "cases", items: kuCases.filter(c => c.status === "completed") },
      ];
    })(),
  };

  const myStats    = statDefs[auth.role] ?? [];
  const activeStat = myStats.find(s => s.id === activeTab);

  const colorMap = {
    blue:   { icon: "bg-blue-100 text-blue-600",     active: "bg-blue-50 border-blue-400",     num: "text-blue-700" },
    green:  { icon: "bg-green-100 text-green-600",   active: "bg-green-50 border-green-400",   num: "text-green-700" },
    teal:   { icon: "bg-teal-100 text-teal-600",     active: "bg-teal-50 border-teal-400",     num: "text-teal-700" },
    purple: { icon: "bg-purple-100 text-purple-600", active: "bg-purple-50 border-purple-400", num: "text-purple-700" },
    yellow: { icon: "bg-yellow-100 text-yellow-600", active: "bg-yellow-50 border-yellow-400", num: "text-yellow-700" },
    red:    { icon: "bg-red-100 text-red-600",       active: "bg-red-50 border-red-400",       num: "text-red-700" },
    gray:   { icon: "bg-gray-100 text-gray-500",     active: "bg-gray-50 border-gray-400",     num: "text-gray-700" },
  };

  if (casesLoading) return <Spinner />;

  if (selectedCase) {
    return (
      <CaseDetail
        caseData={selectedCase}
        auth={auth}
        onBack={() => setSelectedCase(null)}
        onStatusChange={async (caseId, status) => {
          await updateCase(caseId, { status });
          setSelectedCase(p => ({ ...p, status }));
        }}
        onDelete={async () => { await deleteCase(selectedCase.id); setSelectedCase(null); }}
        onUpdate={async (payload) => { await updateCase(selectedCase.id, payload); setSelectedCase(p => ({ ...p, ...payload })); }}
      />
    );
  }

  if (applyingToCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <ApplyWizard
          caseData={applyingToCase}
          auth={auth}
          onComplete={() => setApplying(null)}
          onCancel={() => setApplying(null)}
        />
      </div>
    );
  }

  const FEED_TABS = [
    { id: 'all',           label: t('feed.all') },
    { id: 'comment',       label: t('feed.comments') },
    { id: 'progress',      label: t('feed.progress') },
    { id: 'status_change', label: t('feed.status') },
    { id: 'assignment',    label: t('feed.assignments') },
    { id: 'alert',         label: t('feed.alerts') },
  ];

  return (
    <div className="flex gap-6 items-start">
    <div className="flex-1 min-w-0">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.welcome")}, {auth.profile?.full_name?.split(" ")[0] ?? t("auth.name_fallback")}
          </h1>
          <p className="text-gray-500 mt-1">{t("dashboard.subtitle")}</p>
        </div>
      </div>

      {/* ── Client strip ── */}
      {showClientStrip && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-6">
          <style>{`
            @keyframes _stripSpin  { to { transform: rotate(360deg);  } }
            @keyframes _stripStill { to { transform: rotate(-360deg); } }
          `}</style>

          <div className="flex items-center gap-2 mb-4">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t("dashboard.clients")}</span>
          </div>

          <div style={{ display:'flex', alignItems:'flex-start', gap:0, overflowX:'auto', padding:'4px 4px 6px 4px', margin:'-4px -4px 0 -4px', scrollbarWidth:'none' }}>

            {/* Working now */}
            {activeClients.length > 0 && (
              <div style={{ flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#8fa8c2', marginBottom:10 }}>{t("dashboard.working_now")}</div>
                <div style={{ display:'flex', gap:18 }}>
                  {activeClients.map(cl => (
                    <div key={cl.id} onClick={() => setClientFilter(clientFilter?.id === cl.id ? null : { id: cl.id, name: cl.name })}
                      style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer',
                               outline: clientFilter?.id === cl.id ? '2px solid #3b82f6' : 'none', borderRadius:8, padding:2 }}
                      title={t("dash.view_cases").replace("{name}", cl.name)}>
                      {/* spinning ring wrapper */}
                      <div style={{ padding:3, borderRadius:'50%', background:'conic-gradient(#1A4B8C 0%, #5B9BD5 55%, #10b981 100%)', animation:'_stripSpin 4s linear infinite' }}>
                        {/* counter-rotating avatar keeps avatar still */}
                        <div style={{ width:52, height:52, borderRadius:'50%', background:cl.avatarUrl ? 'transparent' : cl.color.bg, color:cl.color.fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, border:'2.5px solid #ffffff', position:'relative', animation:'_stripStill 4s linear infinite', overflow:'hidden' }}>
                          {cl.avatarUrl
                            ? <img src={cl.avatarUrl} alt={cl.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : cl.initials}
                          <div style={{ width:9, height:9, background:'#10b981', border:'1.5px solid #ffffff', borderRadius:'50%', position:'absolute', bottom:1, right:1 }} />
                        </div>
                      </div>
                      <div style={{ fontSize:10.5, fontWeight:600, color:'#5b7a9b', maxWidth:66, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cl.name}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:'#8fa8c2', textAlign:'center', marginTop:-4 }}>{t(cl.activeCases === 1 ? "count.case_one" : "count.case_many").replace("{n}", cl.activeCases)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider: active → following */}
            {activeClients.length > 0 && followedClients.length > 0 && (
              <div style={{ width:1, background:'#d4e6f5', alignSelf:'stretch', flexShrink:0, margin:'0 20px', minHeight:80 }} />
            )}

            {/* Following (liked but no active/past cases) */}
            {followedClients.length > 0 && (
              <div style={{ flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#8fa8c2', marginBottom:10 }}>{t("dashboard.following")}</div>
                <div style={{ display:'flex', gap:18 }}>
                  {followedClients.map(cl => (
                    <div key={cl.id} onClick={() => setClientFilter(clientFilter?.id === cl.id ? null : { id: cl.id, name: cl.name })}
                      style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer',
                               outline: clientFilter?.id === cl.id ? '2px solid #3b82f6' : 'none', borderRadius:8, padding:2 }}
                      title={t("dash.view_cases").replace("{name}", cl.name)}>
                      <div style={{ padding:3, borderRadius:'50%', background:'conic-gradient(#93c5fd 0%, #5B9BD5 50%, #bfdbfe 100%)', animation:'_stripSpin 5s linear infinite' }}>
                        <div style={{ width:52, height:52, borderRadius:'50%', background:cl.avatarUrl ? 'transparent' : cl.color.bg, color:cl.color.fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, border:'2.5px solid #ffffff', position:'relative', animation:'_stripStill 5s linear infinite', overflow:'hidden' }}>
                          {cl.avatarUrl
                            ? <img src={cl.avatarUrl} alt={cl.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : cl.initials}
                          <div style={{ fontSize:9, position:'absolute', bottom:0, right:-1, lineHeight:1 }}><Heart size={7} className="fill-current" /></div>
                        </div>
                      </div>
                      <div style={{ fontSize:10.5, fontWeight:600, color:'#5b7a9b', maxWidth:66, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cl.name}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:'#5B9BD5', textAlign:'center', marginTop:-4 }}>{t("dashboard.following")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider: following → platform active */}
            {(activeClients.length > 0 || followedClients.length > 0) && platformClients.length > 0 && (
              <div style={{ width:1, background:'#d4e6f5', alignSelf:'stretch', flexShrink:0, margin:'0 20px', minHeight:80 }} />
            )}

            {/* All clients with active cases on platform (not assigned, not followed) */}
            {platformClients.length > 0 && (
              <div style={{ flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#8fa8c2', marginBottom:10 }}>{t("dashboard.active_cases")}</div>
                <div style={{ display:'flex', gap:18 }}>
                  {platformClients.map(cl => (
                    <div key={cl.id} onClick={() => setClientFilter(clientFilter?.id === cl.id ? null : { id: cl.id, name: cl.name })}
                      style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer',
                               outline: clientFilter?.id === cl.id ? '2px solid #3b82f6' : 'none', borderRadius:8, padding:2 }}
                      title={t("dash.view_cases").replace("{name}", cl.name)}>
                      <div style={{ padding:3, borderRadius:'50%', background:'#e2e8f0' }}>
                        <div style={{ width:52, height:52, borderRadius:'50%', background:cl.avatarUrl ? 'transparent' : cl.color.bg, color:cl.color.fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, border:'2.5px solid #ffffff', overflow:'hidden' }}>
                          {cl.avatarUrl
                            ? <img src={cl.avatarUrl} alt={cl.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : cl.initials}
                        </div>
                      </div>
                      <div style={{ fontSize:10.5, fontWeight:600, color:'#5b7a9b', maxWidth:66, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cl.name}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textAlign:'center', marginTop:-4 }}>{t("dashboard.active")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider: platform active → past */}
            {(activeClients.length > 0 || followedClients.length > 0 || platformClients.length > 0) && pastClients.length > 0 && (
              <div style={{ width:1, background:'#d4e6f5', alignSelf:'stretch', flexShrink:0, margin:'0 20px', minHeight:80 }} />
            )}

            {/* Past clients */}
            {pastClients.length > 0 && (
              <div style={{ flexShrink:0 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#8fa8c2', marginBottom:10 }}>{t("dashboard.past_clients")}</div>
                <div style={{ display:'flex', gap:18 }}>
                  {pastClients.map(cl => (
                    <div key={cl.id} onClick={() => setClientFilter(clientFilter?.id === cl.id ? null : { id: cl.id, name: cl.name })}
                      style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, opacity:.5, filter:'grayscale(.35)', cursor:'pointer',
                               outline: clientFilter?.id === cl.id ? '2px solid #3b82f6' : 'none', borderRadius:8, padding:2 }}
                      title={t("dash.view_cases").replace("{name}", cl.name)}>
                      <div style={{ padding:3, borderRadius:'50%', background:'#d4e6f5' }}>
                        <div style={{ width:52, height:52, borderRadius:'50%', background:cl.avatarUrl ? 'transparent' : cl.color.bg, color:cl.color.fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, border:'2.5px solid #ffffff', overflow:'hidden' }}>
                          {cl.avatarUrl
                            ? <img src={cl.avatarUrl} alt={cl.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : cl.initials}
                        </div>
                      </div>
                      <div style={{ fontSize:10.5, fontWeight:600, color:'#5b7a9b', maxWidth:66, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cl.name}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:'#8fa8c2', textAlign:'center', marginTop:-4 }}>{cl.pastCases} {t("dashboard.done")} <Check size={8} className="inline" /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Client drill-down panel ── */}
      {clientFilter && (() => {
        const clientCases = stripSource.filter(c => c.client_id === clientFilter.id);
        const activeCsCases = clientCases.filter(c => !["completed","cancelled"].includes(c.status));
        const pastCsCases   = clientCases.filter(c =>  ["completed","cancelled"].includes(c.status));
        const STATUS_COLORS = {
          open:        "bg-emerald-100 text-emerald-700",
          estimated:   "bg-teal-100 text-teal-700",
          assigned:    "bg-violet-100 text-violet-700",
          in_progress: "bg-blue-100 text-blue-700",
          on_hold:     "bg-yellow-100 text-yellow-700",
          completed:   "bg-gray-100 text-gray-600",
          cancelled:   "bg-red-100 text-red-600",
          technical_test:  "bg-cyan-100 text-cyan-700",
          functional_test: "bg-amber-100 text-amber-700",
          user_test:       "bg-orange-100 text-orange-700",
        };
        const CaseRow = ({ c }) => {
          const rc = CASE_CARD_COLORS[c.status] ?? { bar: "#9ca3af", border: "#e5e7eb" };
          return (
            <div onClick={() => setSelectedCase(c)}
              className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer transition-all hover:shadow-sm rounded-xl mx-3 my-1.5"
              style={{ border: `1.5px solid ${rc.border}` }}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate group-hover:text-blue-700">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{[c.area_sap, c.area_industry].filter(Boolean).join(" · ") || t("dashboard.no_area")}</p>
              </div>
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {c.status?.replace(/_/g, " ")}
                </span>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500" />
              </div>
            </div>
          );
        };
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-blue-200 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-blue-50/60">
              <div>
                <span className="font-semibold text-gray-900 text-sm">{clientFilter.name}</span>
                <span className="ml-2 text-xs text-gray-400">{clientCases.length} {clientCases.length === 1 ? t("dashboard.case_single") : t("dashboard.case_plural")} total</span>
              </div>
              <button onClick={() => setClientFilter(null)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
            </div>

            {clientCases.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">{t("dashboard.no_cases_client")}</p>
            ) : (
              <>
                {activeCsCases.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 bg-gray-50 border-b border-gray-100">{t("dashboard.active")}</div>
                    {activeCsCases.map(c => <CaseRow key={c.id} c={c} />)}
                  </div>
                )}
                {pastCsCases.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 bg-gray-50 border-b border-gray-100">{t("dashboard.past")}</div>
                    {pastCsCases.map(c => <CaseRow key={c.id} c={c} />)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Clickable stat tiles */}
      <div className="flex gap-3 mb-6 overflow-x-auto px-1 py-1 -mx-1 -mt-1" style={{scrollbarWidth:'none'}}>
        {myStats.map(s => {
          const isActive = activeTab === s.id;
          return (
            <button key={s.id}
              onClick={() => setActiveTab(t => t === s.id ? null : s.id)}
              className={`text-left rounded-xl px-4 py-3 shadow-sm border-2 transition-all flex items-center gap-3 flex-shrink-0 ${
                isActive ? `${colorMap[s.color].active} shadow-none` : "bg-white border-gray-100 hover:shadow-md hover:border-gray-200"
              }`}>
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${colorMap[s.color].icon}`}>
                <s.Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className={`text-xl font-bold leading-none ${isActive ? colorMap[s.color].num : "text-gray-900"}`}>{s.items.length}</div>
                <div className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{s.label}</div>
                {isActive && <div className="text-xs text-gray-400 mt-0.5 font-medium">▲ list</div>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtered list panel — shown when a stat tile is active */}
      {activeStat && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <activeStat.Icon className="w-5 h-5 text-gray-500" />
              <h2 className="text-base font-bold text-gray-900">{activeStat.label}</h2>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">{activeStat.items.length}</span>
            </div>
            <button onClick={() => setActiveTab(null)} className="text-gray-400 hover:text-gray-600 text-sm"><X size={13} className="mr-1 inline" />{t("action.close")}</button>
          </div>
          <div className="flex flex-col gap-2 p-3 max-h-[70vh] overflow-y-auto">
            {activeStat.items.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">{t("dashboard.nothing_yet")}</div>
            )}

            {/* Case rows */}
            {activeStat.type === "cases" && activeStat.items.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-white rounded-xl transition-all hover:shadow-sm"
                style={{ border: `1.5px solid ${(CASE_CARD_COLORS[c.status] ?? { border: '#e5e7eb' }).border}` }}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ProjectAvatar project={c.project ?? { name: c.title }} size={36} />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{c.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      {c.project?.name && <span className="font-medium text-gray-500">{c.project.name}</span>}
                      {c.due_date && <span>{t("label.due_colon")} {fmtDate(c.due_date)}</span>}
                      {c.budget && <span>${Number(c.budget).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <Badge className={PRIORITY_COLORS[c.priority]}>{PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}</Badge>
                  <Badge className={STATUS_COLORS[c.status]}>{STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : cap(fmt(c.status))}</Badge>
                  {activeStat.id === "open" && auth.isConsultant && !appliedCaseIds.has(c.id) && (
                    <button onClick={() => setApplying(c)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
                      {t("arena.apply")}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Application rows */}
            {activeStat.type === "applications" && activeStat.items.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 transition-all hover:shadow-sm">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ProjectAvatar project={a.case?.project ?? { name: a.case?.client?.client_profiles?.company_name || a.case?.title || '?', client: a.case?.client }} size={36} />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {a.case?.title ?? t("reports.unknown")}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      {a.consultant?.full_name && <span>{a.consultant.full_name}</span>}
                      {a.proposed_rate && <span>${a.proposed_rate}/hr</span>}
                      {a.time_commitment && <span>{a.time_commitment}% time</span>}
                      {a.submitted_at && <span>{fmtDate(a.submitted_at)}</span>}
                    </div>
                  </div>
                </div>
                <Badge className={APP_STATUS_COLORS[a.status]}>{STATUS_LABEL_KEYS[a.status] ? t(STATUS_LABEL_KEYS[a.status]) : cap(a.status)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Default content when no stat tile is active */}
      {!activeTab && (
        <>
          {/* Available Cases — consultants only */}
          {auth.isConsultant && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t("dashboard.available_cases")}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{t("dashboard.avail_subtitle")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-lg">
                    {filteredAvailable.length} open
                  </span>
                  {onNavigate && (
                    <button onClick={() => onNavigate("arena")}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors">
                      <Target className="w-3 h-3" /> Arena
                    </button>
                  )}
                </div>
              </div>
              {_hiddenTierCases.length > 0 && (auth.isConsultant || auth.isHeadhunter) && (
                <div className="mx-5 mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                  <span className="text-amber-500 shrink-0 text-base">🔒</span>
                  <p className="text-sm text-amber-700">
                    <strong>{_hiddenTierCases.length}</strong> premium {_hiddenTierCases.length === 1 ? 'case is' : 'cases are'} hidden — reach <strong className="capitalize">{_nextUnlockTier}</strong> level to unlock {_hiddenTierCases.length === 1 ? 'it' : 'them'}.
                  </p>
                </div>
              )}

              {/* Filters */}
              <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2 bg-gray-50/50">
                <select value={filterSap} onChange={e => setFilterSap(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("dashboard.all_sap")}</option>
                  {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterIndustry} onChange={e => setFilterInd(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("dashboard.all_industries")}</option>
                  {(catalogSettings?.["catalog_industries"] ?? INDUSTRY_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input type="date" value={filterStartFrom} onChange={e => setStartFrom(e.target.value)}
                  title={t("label.start_date_from")}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {(filterSap || filterIndustry || filterStartFrom) && (
                  <button onClick={() => { setFilterSap(""); setFilterInd(""); setStartFrom(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2"><X size={11} className="mr-0.5 inline" />{t("action.clear")}</button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                {[
                  { id: "all",       label: t("dashboard.all_cases"),    count: filteredAvailable.length },
                  { id: "following", label: t("dashboard.following_tab"), count: followingCases.length },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setAvailTab(tab.id)}
                    className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                      availTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}>
                    {tab.label}
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{tab.count}</span>
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="divide-y divide-gray-50">
                {(() => {
                  const list = availTab === "following" ? followingCases : filteredAvailable;
                  if (list.length === 0) {
                    return (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        {availTab === "following"
                          ? <>{t("dashboard.no_following")} <Heart size={11} className="inline text-gray-400" /></>
                          : t("dashboard.no_open_cases")}
                      </div>
                    );
                  }
                  return list.map(c => {
                    const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
                    const following   = isFollowing(c.client_id);
                    return (
                      <div key={c.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <ProjectAvatar project={c.project ?? { name: companyName || c.title, client: c.client }} size={40} className="mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            {/* Title + badges */}
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{c.title}</span>
                              <Badge className={PRIORITY_COLORS[c.priority]}>{PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}</Badge>
                              {c.area_sap      && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{c.area_sap}</span>}
                              {c.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium">{c.area_industry}</span>}
                            </div>
                            {/* Company + follow button */}
                            {companyName && (
                              <div className="flex items-center gap-1 mb-1.5">
                                <span className="text-xs text-gray-500 font-medium">{companyName}</span>
                                <button onClick={e => { e.stopPropagation(); toggleFollow(c.client_id); }}
                                  title={following ? t("action.unfollow_company") : t("action.follow_company")}
                                  className={`text-base leading-none transition-colors ${following ? "text-rose-500 hover:text-rose-400" : "text-gray-300 hover:text-rose-400"}`}>
                                  <Heart className={`w-4 h-4 ${following ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                                </button>
                              </div>
                            )}
                            {c.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{c.description}</p>}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                              {c.start_date && <span>{t("label.starts")} {fmtDate(c.start_date)}</span>}
                              {c.due_date   && <span>{t("label.due")} {fmtDate(c.due_date)}</span>}
                              {c.budget     && <span>{t("label.budget")}: ${Number(c.budget).toLocaleString()}</span>}
                              {c.skills_required?.length > 0 && (
                                <span>{t("label.skills")}: {c.skills_required.slice(0, 3).join(", ")}{c.skills_required.length > 3 ? "…" : ""}</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => setApplying(c)}
                            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                            {t("arena.apply")}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Rate-pending banner — consultants only */}
          {auth.isConsultant && (() => {
            const pendingRate = assignedCases.filter(
              c => c.status === 'completed' && !ratedCaseIds.has(c.id)
            );
            if (!pendingRate.length) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-2 flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm">!</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">
                    {t('profile.rate_pending').replace('{n}', pendingRate.length)}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingRate.map(c => (
                      <button key={c.id}
                        onClick={() => setRatePendingModal({
                          caseId: c.id,
                          caseTitle: c.title,
                          rateeId: c.client_id,
                          rateeName: (Array.isArray(c.client?.client_profiles)
                            ? c.client?.client_profiles[0]?.company_name
                            : c.client?.client_profiles?.company_name)
                            ?? c.client?.full_name ?? 'Client',
                        })}
                        className="px-3 py-1 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                        {t('profile.rate_now')}: {c.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Starting Soon — managers and admins */}
          {(auth.isAdmin || auth.isManager) && (() => {
            const startingSoon = cases.filter(c => {
              if (c.status !== "assigned" || !c.start_date) return false;
              const d = Math.ceil((new Date(c.start_date + "T00:00:00") - Date.now()) / 86400000);
              return d >= -30 && d <= 7;
            }).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
            if (!startingSoon.length) return null;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mt-6">
                <div className="p-5 border-b border-amber-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h2 className="text-base font-bold text-gray-900">{t("dashboard.starting_soon")}</h2>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg">{startingSoon.length}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {startingSoon.map(c => {
                    const d = Math.ceil((new Date(c.start_date + "T00:00:00") - Date.now()) / 86400000);
                    const late = d < 0;
                    const consultant = c.case_assignments?.[0]?.consultant?.full_name ?? t("fallback.unassigned");
                    return (
                      <div key={c.id} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setSelectedCase(c)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <ProjectAvatar project={c.project ?? { name: c.title }} size={32} />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{c.title}</div>
                            <div className="text-xs text-gray-400">{consultant}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${late ? "bg-red-100 text-red-700" : d <= 1 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                            {late ? t("dashboard.days_late").replace("{n}", Math.abs(d)) : d === 0 ? t("dashboard.today") : d === 1 ? t("dashboard.tomorrow") : t("dashboard.starts_in_d").replace("{n}", d)}
                          </span>
                          <span className="text-xs text-gray-400">{c.start_date}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Help Desk KPIs ── */}
      {(() => {
        const hdProjectIds = new Set(
          (allProjects ?? []).filter(p => p.project_type === 'help_desk').map(p => p.id)
        );
        const hdCases = cases.filter(c => c.project_id && hdProjectIds.has(c.project_id));
        if (hdCases.length === 0) return null;

        const now = Date.now();
        const TERMINAL = ['completed', 'cancelled'];

        function caseStats(list) {
          const open     = list.filter(c => !TERMINAL.includes(c.status)).length;
          const resolved = list.filter(c => c.status === 'completed').length;
          const overdue  = list.filter(c =>
            !TERMINAL.includes(c.status) && c.due_date && new Date(c.due_date).getTime() < now
          ).length;
          const caseIds  = new Set(list.map(c => c.id));
          const relevant = hdRatings.filter(r => caseIds.has(r.case_id));
          const scores   = relevant.map(r => {
            const vals = Object.values(r.scores ?? {}).filter(v => typeof v === 'number');
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          }).filter(s => s != null);
          const csat = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
          return { open, resolved, overdue, csat, total: list.length };
        }

        const summary = caseStats(hdCases);

        // Group by project
        const byProject = {};
        hdCases.forEach(c => {
          if (!byProject[c.project_id]) {
            const proj = allProjects.find(p => p.id === c.project_id);
            byProject[c.project_id] = { project: proj, cases: [] };
          }
          byProject[c.project_id].cases.push(c);
        });

        // Group by customer (client_id)
        const byClient = {};
        hdCases.forEach(c => {
          if (!c.client_id) return;
          if (!byClient[c.client_id]) {
            byClient[c.client_id] = {
              name: (Array.isArray(c.client?.client_profiles) ? c.client.client_profiles[0]?.company_name : c.client?.client_profiles?.company_name) || c.client?.full_name || 'Unknown',
              cases: [],
            };
          }
          byClient[c.client_id].cases.push(c);
        });

        const csatColor = (v) => v == null ? 'text-gray-400' : v >= 4 ? 'text-green-600' : v >= 3 ? 'text-amber-600' : 'text-red-500';
        const csatBg    = (v) => v == null ? 'bg-gray-50 border-gray-100' : v >= 4 ? 'bg-green-50 border-green-100' : v >= 3 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100';

        function StatTile({ label, value, sub, color = 'text-gray-900' }) {
          return (
            <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold leading-none ${color}`}>{value ?? '—'}</div>
              {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
              <div className="text-xs text-gray-500 mt-1 font-medium">{label}</div>
            </div>
          );
        }

        function GroupCard({ title, avatarChar, stats }) {
          return (
            <div className={`border rounded-xl p-4 ${csatBg(stats.csat)}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                  {avatarChar}
                </div>
                <span className="text-sm font-semibold text-gray-800 truncate flex-1">{title}</span>
                {stats.csat != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stats.csat >= 4 ? 'bg-green-100 text-green-700' : stats.csat >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                    ★ {stats.csat}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-base font-bold text-blue-600">{stats.open}</div>
                  <div className="text-xs text-gray-400">Open</div>
                </div>
                <div>
                  <div className="text-base font-bold text-green-600">{stats.resolved}</div>
                  <div className="text-xs text-gray-400">Resolved</div>
                </div>
                <div>
                  <div className={`text-base font-bold ${stats.overdue > 0 ? 'text-red-500' : 'text-gray-400'}`}>{stats.overdue}</div>
                  <div className="text-xs text-gray-400">Overdue</div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mt-6">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-indigo-500" />
                <h2 className="text-base font-bold text-gray-900">Help Desk</h2>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg">{hdCases.length} tickets</span>
              </div>
              {summary.overdue > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">
                  <AlertTriangle className="w-3 h-3" /> {summary.overdue} overdue
                </span>
              )}
            </div>

            {/* Summary KPI row */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex gap-3">
                <StatTile label="Open" value={summary.open} color="text-blue-600" />
                <StatTile label="Resolved" value={summary.resolved} color="text-green-600" />
                <StatTile label="Overdue" value={summary.overdue} color={summary.overdue > 0 ? 'text-red-500' : 'text-gray-400'} />
                <StatTile
                  label="Avg CSAT"
                  value={summary.csat != null ? `${summary.csat}/5` : '—'}
                  sub={summary.csat != null ? (summary.csat >= 4 ? 'Good' : summary.csat >= 3 ? 'Fair' : 'Low') : 'no ratings'}
                  color={csatColor(summary.csat)}
                />
              </div>
            </div>

            {/* By Project */}
            {Object.keys(byProject).length > 0 && (
              <div className="p-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Project</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Object.entries(byProject).map(([pid, { project, cases: pc }]) => {
                    const s = caseStats(pc);
                    return (
                      <GroupCard
                        key={pid}
                        title={project?.name ?? 'Unknown Project'}
                        avatarChar={(project?.name ?? 'P')[0].toUpperCase()}
                        stats={s}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* By Customer */}
            {Object.keys(byClient).length > 0 && (
              <div className="p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Customer</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Object.entries(byClient).map(([cid, { name, cases: cc }]) => {
                    const s = caseStats(cc);
                    return (
                      <GroupCard
                        key={cid}
                        title={name}
                        avatarChar={name[0].toUpperCase()}
                        stats={s}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Activity Feed ── */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100">
        {/* Feed header */}
        <div className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900">{t("dashboard.activity_feed")}</span>
              {unreadFeedCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">{unreadFeedCount}</span>
              )}
            </div>
            <button onClick={() => setShowFeedPrefs(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t("dashboard.preferences")}
            </button>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0" style={{ scrollbarWidth: 'none' }}>
            {FEED_TABS.map(tab => (
              <button key={tab.id} onClick={() => setFeedFilter(tab.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${
                  feedFilter === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}>
                {tab.label}
                {tab.id === 'all' && feedItems.length > 0 && (
                  <span className="ml-1 text-gray-400 font-normal">{feedItems.length}</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-b border-gray-100 -mx-5" />
        </div>

        {/* Feed items */}
        <div className="p-4 space-y-3">
          {feedLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm">{t("dashboard.loading_feed")}</span>
            </div>
          )}
          {!feedLoading && filteredFeed.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <Activity className="w-8 h-8 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">{t("dashboard.no_activity")}</p>
              <p className="text-xs mt-1">{t("dashboard.activity_hint")}</p>
            </div>
          )}
          {!feedLoading && filteredFeed.map(item => (
            <FeedCard
              key={item._key}
              item={item}
              caseData={item.case_id ? caseById[item.case_id] : null}
              onOpenCase={setSelectedCase}
              onMarkRead={markRead}
            />
          ))}
        </div>
      </div>
    </div>

    {/* Right sidebar */}
    <div className="w-72 flex-shrink-0 self-start sticky top-6 space-y-4">
      {(() => {
        const scopedCases = auth.isConsultant ? assignedCases : auth.isClient ? myCases : cases;
        const now = new Date();

        // 1 — Status Snapshot
        const SNAP_STATUSES = [
          { key: "open",            Icon: Inbox,         color: "#16a34a", bg: "#f0fdf4" },
          { key: "estimated",       Icon: ClipboardList, color: "#0d9488", bg: "#f0fdfa" },
          { key: "assigned",        Icon: UserCheck,     color: "#7c3aed", bg: "#faf5ff" },
          { key: "in_progress",     Icon: Zap,           color: "#2563eb", bg: "#eff6ff" },
          { key: "on_hold",         Icon: PauseCircle,   color: "#b45309", bg: "#fffbeb" },
          { key: "technical_test",  Icon: Code2,         color: "#0891b2", bg: "#ecfeff" },
          { key: "functional_test", Icon: ListChecks,    color: "#d97706", bg: "#fffbeb" },
          { key: "user_test",       Icon: Users,         color: "#ea580c", bg: "#fff7ed" },
          { key: "completed",       Icon: CheckCircle2,  color: "#4b5563", bg: "#f9fafb" },
          { key: "cancelled",       Icon: XCircle,       color: "#dc2626", bg: "#fef2f2" },
        ].map(s => ({ ...s, label: STATUS_LABEL_KEYS[s.key] ? t(STATUS_LABEL_KEYS[s.key]) : cap(fmt(s.key)), count: scopedCases.filter(c => c.status === s.key).length }))
         .filter(s => s.count > 0);

        // 2 — Due Soon (next 14 days)
        const in14 = new Date(now.getTime() + 14 * 86400000);
        const dueSoon = scopedCases
          .filter(c => c.due_date && !["completed","cancelled"].includes(c.status))
          .filter(c => { const d = new Date(c.due_date + "T00:00:00"); return d >= now && d <= in14; })
          .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
          .slice(0, 6);

        // 3 — Pending Attention (role-aware)
        let attentionItems = [];
        let attentionTitle = "";
        let attentionEmpty = "";
        if (auth.isAdmin || auth.isManager) {
          const pendingApps = applications.filter(a => a.status === "pending");
          attentionTitle = t("dashboard.pending_applications") || "Pending Applications";
          attentionEmpty = "No pending applications";
          attentionItems = pendingApps.slice(0, 6).map(a => ({
            id: a.id,
            label: a.consultant?.full_name || a.case?.consultant?.full_name || "—",
            sub: a.case?.title ?? cases.find(c => c.id === a.case_id)?.title ?? "—",
            onClick: () => {},
          }));
        } else if (auth.isConsultant) {
          const onHold = assignedCases.filter(c => c.status === "on_hold");
          attentionTitle = "Cases On Hold";
          attentionEmpty = "No cases on hold";
          attentionItems = onHold.slice(0, 6).map(c => ({
            id: c.id, label: c.title, sub: c.client?.client_profiles?.company_name || "", onClick: () => setSelectedCase(c),
          }));
        } else if (auth.isClient) {
          const waiting = myCases.filter(c => c.status === "estimated");
          attentionTitle = "Awaiting Estimation";
          attentionEmpty = "No cases awaiting action";
          attentionItems = waiting.slice(0, 6).map(c => ({
            id: c.id, label: c.title, sub: fmtDate(c.created_at), onClick: () => setSelectedCase(c),
          }));
        } else {
          const needsAction = scopedCases.filter(c => ["on_hold","estimated"].includes(c.status));
          attentionTitle = "Needs Attention";
          attentionEmpty = "Nothing needs attention";
          attentionItems = needsAction.slice(0, 6).map(c => ({
            id: c.id, label: c.title, sub: STATUS_LABEL_KEYS[c.status] ? t(STATUS_LABEL_KEYS[c.status]) : c.status, onClick: () => setSelectedCase(c),
          }));
        }

        // 4 — Starting Soon (admin/manager only)
        const startingSoon = (auth.isAdmin || auth.isManager) ? cases.filter(c => {
          if (!c.start_date) return false;
          const d = Math.ceil((new Date(c.start_date + "T00:00:00") - Date.now()) / 86400000);
          return d >= 0 && d <= 7;
        }).sort((a, b) => (a.start_date < b.start_date ? -1 : 1)).slice(0, 5) : [];

        return (
          <>
            {/* ── 1. Status Snapshot ── */}
            {SNAP_STATUSES.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-bold text-gray-900">Pipeline</span>
                  <span className="ml-auto text-xs text-gray-400">{scopedCases.length} total</span>
                </div>
                <div className="p-3 grid grid-cols-3 gap-1.5">
                  {SNAP_STATUSES.map(s => {
                    const { Icon } = s;
                    return (
                      <div key={s.key} className="rounded-xl p-2 flex flex-col items-center gap-1 text-center"
                        style={{ background: s.bg }}>
                        <Icon size={14} style={{ color: s.color }} />
                        <span className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.count}</span>
                        <span className="text-[9px] leading-none text-gray-500 truncate w-full text-center">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 2. Due Soon ── */}
            {dueSoon.length > 0 && (
              <div className="bg-white rounded-2xl border border-rose-100 shadow-sm">
                <div className="px-4 pt-4 pb-3 border-b border-rose-100 flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-sm font-bold text-gray-900">Due Soon</span>
                  <span className="ml-auto px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-bold rounded-md">{dueSoon.length}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {dueSoon.map(c => {
                    const daysLeft = Math.ceil((new Date(c.due_date + "T00:00:00") - now) / 86400000);
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedCase(c)}>
                        <span className="text-xs font-medium text-gray-800 truncate">{c.title}</span>
                        <span className={`text-xs font-semibold flex-shrink-0 ${daysLeft <= 2 ? "text-rose-600" : daysLeft <= 5 ? "text-orange-500" : "text-amber-500"}`}>
                          {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 2b. Assigned / Recent Cases ── */}
            {(() => {
              const caseList = auth.isConsultant ? assignedCases : cases.slice(0, 8);
              if (!caseList.length) return null;
              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-bold text-gray-900">
                      {auth.isConsultant ? t("dashboard.assigned_cases") : t("dashboard.recent_cases")}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{caseList.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 p-2">
                    {caseList.map(c => {
                      const cc = CASE_CARD_COLORS[c.status] ?? { bar: "#9ca3af", border: "#e5e7eb", bg: "#ffffff" };
                      const StatusIcon = STATUS_CARD_ICONS[c.status] ?? Tag;
                      return (
                        <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all hover:shadow-sm"
                          style={{ backgroundColor: cc.bg, border: `1.5px solid ${cc.border}` }}
                          onClick={() => setSelectedCase(c)}>
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: cc.bar + "33", color: cc.bar }}>
                            <StatusIcon size={16} strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-xs truncate">{c.title}</div>
                            <div className="text-[10px] text-gray-400 truncate mt-0.5">
                              {c.project?.name ?? fmtDate(c.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── 3. Pending Attention ── */}
            {attentionItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100 shadow-sm">
                <div className="px-4 pt-4 pb-3 border-b border-amber-100 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold text-gray-900">{attentionTitle}</span>
                  <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md">{attentionItems.length}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {attentionItems.map(item => (
                    <div key={item.id} className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors" onClick={item.onClick}>
                      <div className="text-xs font-medium text-gray-800 truncate">{item.label}</div>
                      {item.sub && <div className="text-[10px] text-gray-400 truncate mt-0.5">{item.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 4. Starting Soon (admin/manager) ── */}
            {startingSoon.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100 shadow-sm">
                <div className="px-4 pt-4 pb-3 border-b border-amber-100 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold text-gray-900">{t("dashboard.starting_soon")}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {startingSoon.map(c => {
                    const d = Math.ceil((new Date(c.start_date + "T00:00:00") - Date.now()) / 86400000);
                    return (
                      <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50" onClick={() => setSelectedCase(c)}>
                        <span className="text-xs font-medium text-gray-800 truncate">{c.title}</span>
                        <span className="text-xs text-amber-600 font-semibold flex-shrink-0">{d === 0 ? t("dashboard.today") : `${d}d`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>

    {ratePendingModal && (
      <ClientRatingModal
        isOpen={true}
        caseId={ratePendingModal.caseId}
        caseTitle={ratePendingModal.caseTitle}
        clientId={ratePendingModal.rateeId}
        clientName={ratePendingModal.rateeName}
        onClose={() => {
          setRatedCaseIds(prev => new Set([...prev, ratePendingModal.caseId]));
          setRatePendingModal(null);
        }}
      />
    )}

    <FeedPreferencesModal
      open={showFeedPrefs}
      onClose={() => setShowFeedPrefs(false)}
      auth={auth}
      prefs={prefs}
      savePrefs={savePrefs}
    />
    </div>
  );
}

export { Dashboard };
