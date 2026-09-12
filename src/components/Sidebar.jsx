import {
  BarChart2, Bell, ClipboardList, Clock, Database, FolderOpen, Handshake,
  Layers, LayoutDashboard, LayoutGrid, LayoutTemplate, Receipt, Search,
  SlidersHorizontal, Target, User, UserCheck,
} from "lucide-react";
import { useT } from "../i18n/index.jsx";
import { usePlatformBranding, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { NotificationBell } from "./NotificationBell.jsx";
import { PersonAvatar } from "../views/Projects.jsx";

function Sidebar({ role, activeView, onNav, onSignOut, profile, unreadCount, auth, onSearchOpen }) {
  const { t, lang, setLang } = useT();
  const sidebarVisCfg = useVisibilitySettings();
  const branding = usePlatformBranding();

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
      { id: "audit_log",       Icon: ClipboardList,     labelKey: "log.nav" },
      { id: "templates",       Icon: LayoutTemplate,    labelKey: "nav.templates" },
      { id: "approvals",       Icon: UserCheck,         labelKey: "nav.approvals" },
      { id: "settings",        Icon: SlidersHorizontal, labelKey: "nav.settings" },
    ],
    consultant: [
      { id: "dashboard", Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",  Icon: FolderOpen,      labelKey: "nav.my_cases" },
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
      { id: "dashboard", Icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { id: "my-cases",  Icon: FolderOpen,      labelKey: "nav.my_cases" },
      { id: "kanban",    Icon: LayoutGrid,      labelKey: "nav.kanban" },
    ],
    headhunter: [
      { id: "arena",       Icon: Target,    labelKey: "nav.arena" },
      { id: "consultants", Icon: UserCheck, labelKey: "nav.consultants" },
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

  return (
    <aside className="w-64 bg-[#1C3557] text-white flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-6 border-b border-blue-900">
        <div className="flex items-center gap-3">
          <img src={branding.logoUrl} width="36" height="36" alt={branding.platformName} style={{objectFit:"contain"}}/>
          <div>
            <div className="font-bold text-white">{branding.platformName}</div>
            <div className="text-xs text-blue-300 capitalize">{role} Portal</div>
          </div>
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
          {(() => {
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
          const profileView = role === 'client' ? 'client-profile' : 'profile';
          const canGoToProfile = ['consultant', 'headhunter', 'client'].includes(role);
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
  );
}

export { Sidebar };
