import {
  BarChart2, Bell, ClipboardCheck, ClipboardList, Clock, Database, FolderOpen, Handshake,
  Inbox, Layers, LayoutDashboard, LayoutGrid, LayoutTemplate, Receipt, Search,
  SlidersHorizontal, Target, User, UserCheck, UsersRound,
} from "lucide-react";
import { useT } from "../i18n/index.jsx";
import { usePlatformBranding, useVisibilitySettings, useSystemSettings, usePlanConfig } from "../hooks/useSystemSettings.jsx";
import { ROLE_TO_PLAN_TYPE } from "../lib/businessConstants.js";
import { NotificationBell } from "./NotificationBell.jsx";
import { PersonAvatar } from "../views/Projects.jsx";

// Nova logo — module-level keyframe + font injection
if (typeof document !== 'undefined') {
  if (!document.getElementById('nova-logo-font')) {
    const lnk = document.createElement('link');
    lnk.id = 'nova-logo-font';
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&display=swap';
    document.head.appendChild(lnk);
  }
  let _kf = document.getElementById('nova-logo-kf');
  if (!_kf) { _kf = document.createElement('style'); _kf.id = 'nova-logo-kf'; document.head.appendChild(_kf); }
  _kf.textContent = `@keyframes nova-orbit {
  from { transform: rotate(var(--ns,0deg)) translateX(var(--nr,36px)) rotate(calc(-1*var(--ns,0deg))); }
  to   { transform: rotate(calc(var(--ns,0deg)+360deg)) translateX(var(--nr,36px)) rotate(calc(-1*(var(--ns,0deg)+360deg))); }
}`;
}

const NOVA_ORBITERS = [
  { s:   0, r: 54, d:  9, z: 13, c: '#2563EB', gr: 7, gc: 'rgba(37,99,235,0.48)' },
  { s: 195, r: 54, d:  9, z: 10, c: '#60A5FA', gr: 5, gc: 'rgba(96,165,250,0.4)' },
  { s: 100, r: 74, d: 16, z: 11, c: '#3B82F6', gr: 6, gc: 'rgba(59,130,246,0.4)' },
  { s: 280, r: 74, d: 16, z:  8, c: '#93C5FD', gr: 4, gc: 'rgba(147,197,253,0.35)' },
];

function NovaLogo({ size = 80 }) {
  const sc = size / 152;
  const orb = Math.round(52 * sc);
  const d1  = Math.round(108 * sc);
  const d2  = Math.round(148 * sc);
  const fs  = Math.round(30 * sc);
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{ position:'absolute', top:'50%', left:'50%', width:d1, height:d1, marginTop:-d1/2, marginLeft:-d1/2, borderRadius:'50%', border:'1px solid rgba(37,99,235,0.22)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', width:d2, height:d2, marginTop:-d2/2, marginLeft:-d2/2, borderRadius:'50%', border:'1px solid rgba(37,99,235,0.11)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:orb, height:orb, borderRadius:'50%', background:'radial-gradient(circle at 36% 33%,#3B82F6 0%,#0D1F3C 78%)', boxShadow:'0 4px 22px rgba(37,99,235,0.55)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:'#fff', fontSize:fs, zIndex:10, userSelect:'none' }}>A</div>
      {NOVA_ORBITERS.map((o, i) => {
        const r = Math.round(o.r * sc);
        const z = Math.max(4, Math.round(o.z * sc));
        const gr = Math.max(2, Math.round(o.gr * sc));
        return (
          <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0, animation:`nova-orbit ${o.d}s linear infinite`, '--ns':`${o.s}deg`, '--nr':`${r}px`, zIndex:2 }}>
            <div style={{ position:'absolute', width:z, height:z, top:-z/2, left:-z/2, borderRadius:'50%', background:o.c, boxShadow:`0 1px 4px rgba(0,0,0,.15),0 0 ${gr}px ${o.gc}` }} />
          </div>
        );
      })}
    </div>
  );
}

function Sidebar({ role, activeView, onNav, onSignOut, profile, unreadCount, auth, onSearchOpen, mobileOpen, onMobileClose }) {
  const { t, lang, setLang } = useT();
  const sidebarVisCfg = useVisibilitySettings();
  const branding = usePlatformBranding();
  const ssCtx = useSystemSettings();
  const planCfg = usePlanConfig();

  const NAV_CONCEPT = { 'my-cases': 'cases', 'leader-cases': 'cases' };
  const conceptOf = id => NAV_CONCEPT[id] ?? id;

  const navItems = {
    admin: [
      { id: "dashboard",       Icon: LayoutDashboard,   labelKey: "nav.dashboard" },
      { id: "cases",           Icon: FolderOpen,        labelKey: "nav.cases" },
      { id: "projects",        Icon: Layers,            labelKey: "nav.projects" },
      { id: "kanban",          Icon: LayoutGrid,        labelKey: "nav.kanban" },
      { id: "arena",           Icon: Target,            labelKey: "nav.arena" },
      { id: "invoices",        Icon: Receipt,           labelKey: "nav.invoices" },
      { id: "time",            Icon: Clock,             labelKey: "nav.time" },
      { id: "db-connections",  Icon: Database,          labelKey: "nav.db_connections" },
      { id: "team-members",    Icon: Handshake,         labelKey: "nav.team_members" },
      { id: "reports",         Icon: BarChart2,         labelKey: "nav.reports" },
      { id: "audit_log",       Icon: ClipboardList,     labelKey: "log.nav" },
      { id: "templates",       Icon: LayoutTemplate,    labelKey: "nav.templates" },
      { id: "approvals",       Icon: UserCheck,         labelKey: "nav.approvals" },
      { id: "settings",        Icon: SlidersHorizontal, labelKey: "nav.settings" },
    ],
    manager: [
      { id: "dashboard",       Icon: LayoutDashboard,   labelKey: "nav.dashboard" },
      { id: "cases",           Icon: FolderOpen,        labelKey: "nav.cases" },
      { id: "projects",        Icon: Layers,            labelKey: "nav.projects" },
      { id: "kanban",          Icon: LayoutGrid,        labelKey: "nav.kanban" },
      { id: "arena",           Icon: Target,            labelKey: "nav.arena" },
      { id: "invoices",        Icon: Receipt,           labelKey: "nav.invoices" },
      { id: "time",            Icon: Clock,             labelKey: "nav.time" },
      { id: "consultants",     Icon: UserCheck,         labelKey: "nav.consultants" },
      { id: "db-connections",  Icon: Database,          labelKey: "nav.db_connections" },
      { id: "team-members",    Icon: Handshake,         labelKey: "nav.team_members" },
      { id: "reports",         Icon: BarChart2,          labelKey: "nav.reports" },
      { id: "audit_log",       Icon: ClipboardList,     labelKey: "log.nav" },
      { id: "templates",       Icon: LayoutTemplate,    labelKey: "nav.templates" },
      { id: "approvals",       Icon: UserCheck,         labelKey: "nav.approvals" },
      { id: "settings",        Icon: SlidersHorizontal, labelKey: "nav.settings" },
    ],
    consultant: [
      { id: "dashboard", Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",  Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "projects",  Icon: Layers,          labelKey: "nav.projects" },
      { id: "arena",     Icon: Target,          labelKey: "nav.arena" },
      { id: "kanban",    Icon: LayoutGrid,      labelKey: "nav.kanban" },
      { id: "time",      Icon: Clock,           labelKey: "nav.time" },
    ],
    client: [
      { id: "dashboard",   Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "cases",       Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "projects",    Icon: Layers,          labelKey: "nav.projects" },
      { id: "kanban",      Icon: LayoutGrid,      labelKey: "nav.kanban" },
      { id: "arena",       Icon: Target,          labelKey: "nav.arena" },
      { id: "invoices",    Icon: Receipt,         labelKey: "nav.invoices" },
      { id: "consultants", Icon: UserCheck,       labelKey: "nav.consultants" },
    ],
    key_user: [
      { id: "dashboard",  Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",   Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "my-reviews", Icon: ClipboardCheck,  labelKey: "nav.my_reviews" },
      { id: "kanban",     Icon: LayoutGrid,      labelKey: "nav.kanban" },
    ],
    headhunter: [
      { id: "dashboard",     Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "cases",         Icon: FolderOpen,      labelKey: "nav.resource_needs" },
      { id: "hh-candidates", Icon: UsersRound,      labelKey: "nav.hh_candidates" },
      { id: "hh-pipeline",   Icon: LayoutGrid,      labelKey: "nav.hh_pipeline" },
      { id: "hh-placements", Icon: UserCheck,       labelKey: "nav.hh_placements" },
      { id: "arena",         Icon: Target,          labelKey: "nav.arena" },
      { id: "consultants",   Icon: Handshake,       labelKey: "nav.consultants" },
    ],
    final_user: [
      { id: "dashboard", Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",  Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "kanban",    Icon: LayoutGrid,      labelKey: "nav.kanban" },
    ],
    internal_consultant: [
      { id: "dashboard",  Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",   Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "my-reviews", Icon: ClipboardCheck,  labelKey: "nav.my_reviews" },
      { id: "arena",      Icon: Target,          labelKey: "nav.arena" },
      { id: "kanban",     Icon: LayoutGrid,      labelKey: "nav.kanban" },
      { id: "time",       Icon: Clock,           labelKey: "nav.time" },
    ],
    project_manager: [
      { id: "dashboard",    Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "cases",        Icon: FolderOpen,      labelKey: "nav.cases" },
      { id: "projects",     Icon: Layers,          labelKey: "nav.projects" },
      { id: "my-reviews",   Icon: ClipboardCheck,  labelKey: "nav.my_reviews" },
      { id: "kanban",       Icon: LayoutGrid,      labelKey: "nav.kanban" },
      { id: "time",         Icon: Clock,           labelKey: "nav.time" },
      { id: "team-members", Icon: Handshake,       labelKey: "nav.team_members" },
    ],
    invited_client: [
      { id: "dashboard", Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",  Icon: FolderOpen,      labelKey: "nav.my_cases" },
    ],
    dispatch: [
      { id: "dashboard",      Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "dispatch-queue", Icon: Inbox,           labelKey: "nav.dispatch_queue" },
      { id: "team-members",   Icon: Handshake,       labelKey: "nav.team_members" },
    ],
    area_leader: [
      { id: "dashboard",    Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "leader-cases", Icon: FolderOpen,      labelKey: "nav.leader_cases" },
      { id: "spec-review",  Icon: ClipboardCheck,  labelKey: "nav.spec_review" },
    ],
  };

  let items = navItems[role] ?? [];
  // Hide consultants nav for clients in Internal mode — they don't participate in marketplace
  if (role === 'client' && auth?.user?.id) {
    const compVis = sidebarVisCfg.getCompanyVisibility(auth.user.id);
    if (compVis === 'internal') {
      items = items.filter(i => i.id !== 'consultants');
    }
  }

  // Nav visibility settings (role-based and plan-based)
  const navRoleVis   = ssCtx.settings['nav_visibility_by_role'] ?? {};
  const navPlanVisCfg = ssCtx.settings['nav_visibility_by_plan'] ?? {};
  if (role !== 'admin') {
    const roleHide = navRoleVis[role] ?? {};
    items = items.filter(item => roleHide[conceptOf(item.id)] !== false);

    const roleType = ROLE_TO_PLAN_TYPE[role];
    if (roleType && auth?.user?.id) {
      const userPlan = planCfg.getUserPlan(auth.user.id);
      const planHide = navPlanVisCfg[roleType]?.[userPlan] ?? {};
      items = items.filter(item => planHide[conceptOf(item.id)] !== false);
    }
  }
  const showNotifications = role === 'admin' || (() => {
    const roleHide = navRoleVis[role] ?? {};
    if (roleHide['notifications'] === false) return false;
    const roleType = ROLE_TO_PLAN_TYPE[role];
    if (roleType && auth?.user?.id) {
      const userPlan = planCfg.getUserPlan(auth.user.id);
      const planHide = navPlanVisCfg[roleType]?.[userPlan] ?? {};
      if (planHide['notifications'] === false) return false;
    }
    return true;
  })();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onMobileClose} />
      )}
    <aside className={`w-64 text-white flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`} style={{background:"#0B0F1A",backgroundImage:"radial-gradient(circle at 50% -10%,rgba(79,110,247,.22) 0%,transparent 65%),linear-gradient(rgba(79,110,247,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.07) 1px,transparent 1px)",backgroundSize:"100% 100%,48px 48px,48px 48px"}}>
      {/* Logo */}
      <div className="py-5 px-4 border-b border-blue-900 flex flex-col items-center gap-2">
        <NovaLogo size={80} />
        <div className="text-center">
          <div className="font-bold text-sm">
            {(() => {
              const parts = branding.platformName.split(' ');
              return parts.length > 1
                ? <><span style={{color:'#4F6EF7'}}>{parts[0]}</span> <span className="text-white">{parts.slice(1).join(' ')}</span></>
                : <span style={{color:'#4F6EF7'}}>{branding.platformName}</span>;
            })()}
          </div>
          <div className="text-xs text-blue-300 capitalize">{role} Portal</div>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => onSearchOpen?.()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-blue-300 hover:text-white hover:bg-blue-900/70 border border-blue-800/40 transition-all"
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">{t("search.shortcut_hint")}</span>
          <kbd className="text-[11px] bg-blue-900/60 text-blue-400 px-1.5 py-0.5 rounded font-mono select-none">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-3 pb-2 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => {
            const isActive = activeView === item.id;
            return (
              <button key={item.id} onClick={() => onNav(item.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 px-2 text-center transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg"
                    : "text-blue-200 hover:bg-blue-900/80 hover:text-white"}`}
                style={{ minHeight: 72 }}>
                <item.Icon size={22} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.8 }} />
                <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.01em' }}>
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}

          {/* Notifications */}
          {showNotifications && (() => {
            const isActive = activeView === "notifications";
            return (
              <button onClick={() => onNav("notifications")}
                className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 px-2 text-center transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg"
                    : "text-blue-200 hover:bg-blue-900/80 hover:text-white"}`}
                style={{ minHeight: 72 }}>
                <span className="relative">
                  <Bell size={22} style={{ opacity: isActive ? 1 : 0.8 }} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.01em' }}>
                  {t("nav.notifications")}
                </span>
              </button>
            );
          })()}
        </div>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-blue-900">
        {(() => {
          const profileView = (role === 'client' || role === 'invited_client') ? 'client-profile' : 'profile';
          const canGoToProfile = ['consultant', 'headhunter', 'client', 'invited_client'].includes(role);
          return (
            <div className="flex items-center gap-2 mb-3 -mx-2">
              <div
                className={`flex items-center gap-3 flex-1 min-w-0 rounded-xl px-2 py-1.5 transition-colors ${canGoToProfile ? 'cursor-pointer hover:bg-blue-900/60' : ''}`}
                onClick={canGoToProfile ? () => onNav(profileView) : undefined}
                title={canGoToProfile ? t("nav.profile") : undefined}
              >
                <PersonAvatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{profile?.full_name ?? t("fallback.user")}</div>
                  <div className="text-xs text-blue-300 truncate">{profile?.email}</div>
                </div>
              </div>
              {auth && <NotificationBell auth={auth} />}
            </div>
          );
        })()}
        <button onClick={onSignOut}
          className="w-full text-sm text-blue-300 hover:text-white py-1.5 px-3 rounded-lg hover:bg-blue-900 transition-colors text-left">
          {t("action.sign_out")}
        </button>
      </div>
    </aside>
    </>
  );
}

export { Sidebar, NovaLogo };
