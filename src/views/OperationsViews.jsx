import { useState, useEffect } from "react";
import {
  Activity, AlertCircle, Bell, Check, CheckCircle2, Clock, Database, DollarSign,
  Download, FileText, FolderOpen, Mail, Pencil, Phone, SlidersHorizontal,
  Target, Trash2, User, Users, X, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useNotifications, useLeaderboard } from "../hooks/useNotificationHooks.js";
import { useClientTeamMembers, useDbConnections, useInvoices, useSlaConfig, useTimeEntries } from "../hooks/useCoreHooks.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { logEvent, notify } from "../lib/utils.js";
import { Badge, Spinner, TrustBadge } from "../components/ProfileComponents.jsx";
import { EmptyState, Input, Modal, Select, Textarea } from "../components/ui.jsx";
import { ROLE_LABEL_KEYS, SLA_DEFAULT_TYPES, SLA_TIER_LABEL_KEYS, STATUS_LABEL_KEYS, SlaMatrixEditor, cap, fmt, fmtDate, makeDefaultMatrix } from "../lib/uiUtils.jsx";
import { ROLE_COLORS, STATUS_COLORS } from "../lib/businessConstants.js";
import { useApplications, useCases } from "../hooks/useCaseHooks.js";
import { PersonAvatar } from "./Projects.jsx";

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
    <div className="border border-indigo-100 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/20 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">{t("sap.profile_title")}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("sap.product_label")}</label>
          <select value={meta.sap_product ?? "S/4HANA"} onChange={e => set("sap_product", e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
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
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("sap.role_label")}</label>
          <select value={meta.system_role ?? "DEV"} onChange={e => set("system_role", e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {[["DEV","sap.role_dev"],["QAS","sap.role_qas"],["PRD","sap.role_prd"],["SBX","sap.role_sbx"],["TRN","sap.role_trn"]].map(([v,k]) => <option key={v} value={v}>{t(k)} ({v})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("sap.language_label")}</label>
          <select value={meta.language ?? "EN"} onChange={e => set("language", e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {[["EN","English"],["ES","Spanish"],["DE","German"],["FR","French"],["PT","Portuguese"],["IT","Italian"],["NL","Dutch"],["PL","Polish"],["ZH","Chinese"],["JA","Japanese"],["AR","Arabic"]].map(([v,l]) => <option key={v} value={v}>{l} ({v})</option>)}
          </select>
        </div>
        <Input label={t("sap.transport_label")} value={meta.transport_route ?? ""}
          onChange={e => set("transport_route", e.target.value)} placeholder={t("sap.ph_transport")} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("sap.components_label")}</label>
        <div className="flex flex-wrap gap-1.5">
          {SAP_COMPONENTS.map(comp => {
            const active = (meta.components ?? []).includes(comp);
            return (
              <button key={comp} type="button" onClick={() => toggleComp(comp)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-300 hover:text-indigo-600"}`}>
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

function VpnProfileFields({ meta = {}, onChange }) {
  const set = (k, v) => onChange({ ...meta, [k]: v });
  const protocols = [
    { value: 'ssl',   label: 'SSL-VPN' },
    { value: 'ipsec', label: 'IPsec VPN' },
    { value: 'other', label: 'Other' },
  ];
  const clients = ['FortiClient', 'Cisco AnyConnect', 'OpenVPN', 'GlobalProtect', 'Pulse Secure', 'Other'];
  return (
    <div className="border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">VPN Profile</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Protocol</label>
          <div className="flex gap-2">
            {protocols.map(p => (
              <button key={p.value} type="button"
                onClick={() => set('protocol', p.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${(meta.protocol ?? 'ssl') === p.value ? 'bg-slate-700 text-white border-slate-700 dark:bg-slate-500 dark:border-slate-500' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-slate-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Authentication</label>
          <div className="flex gap-2">
            {[['prompt','Prompt on login'],['save','Save login']].map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => set('auth_mode', v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${(meta.auth_mode ?? 'prompt') === v ? 'bg-slate-700 text-white border-slate-700 dark:bg-slate-500 dark:border-slate-500' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-slate-400'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">VPN Client</label>
          <select value={meta.vpn_client ?? ''} onChange={e => set('vpn_client', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-slate-400">
            <option value="">— Select client —</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Connection Name</label>
          <input type="text" value={meta.conn_name ?? ''} onChange={e => set('conn_name', e.target.value)}
            placeholder="e.g. ADMOSA"
            className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
          <input type="password" value={meta.password ?? ''} onChange={e => set('password', e.target.value)}
            placeholder="VPN password"
            className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Remote Gateway</label>
          <input type="text" value={meta.remote_gateway ?? ''} onChange={e => set('remote_gateway', e.target.value)}
            placeholder="gtspfw.example.com"
            className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm" />
        </div>
      </div>
    </div>
  );
}

function VpnProfileBadges({ meta = {}, host, port }) {
  if (!meta.protocol && !meta.vpn_client) return null;
  const protocolLabel = { ssl: 'SSL-VPN', ipsec: 'IPsec VPN', other: 'VPN' }[meta.protocol ?? 'ssl'] ?? 'VPN';
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
      <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">{protocolLabel}</span>
      {meta.vpn_client && <span className="text-xs text-gray-500 dark:text-gray-400">{meta.vpn_client}</span>}
      {meta.conn_name && <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{meta.conn_name}</span>}
      {meta.auth_mode === 'save' && <span className="text-xs text-gray-400">· Save login</span>}
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
  const [addError, setAddError]    = useState(null);
  const [addLinkedUser, setAddLinkedUser] = useState(null);
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
    setAddError(null);
    setAddLinkedUser(null);
    try {
      const result = await addMember(form);
      setForm({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
      setShowAdd(false);
      if (result?.existingUser) setAddLinkedUser(result.existingUser);
    } catch (e) { setAddError(e.message); }
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
          <button onClick={() => { setShowAdd(p => !p); setAddError(null); }}
            className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
            {t("team.add_btn")}
          </button>
        )}
      </div>

      {addLinkedUser && (
        <div className="flex items-start gap-2 px-4 py-3 mb-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle2 size={15} className="text-green-500 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{addLinkedUser.full_name}</strong> was added and automatically linked to their existing platform account
            {addLinkedUser.role ? ` (${addLinkedUser.role})` : ''}.
          </span>
          <button onClick={() => setAddLinkedUser(null)} className="ml-auto text-green-400 hover:text-green-600 flex-shrink-0"><X size={13} /></button>
        </div>
      )}

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("team.name_label")} value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder={t("contact.ph_name")} />
            <Input label={t("team.email_label")} type="email" value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setAddError(null); }} placeholder={t("contact.ph_email")} />
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
          {addError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle size={13} className="flex-shrink-0" />{addError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowAdd(false); setAddError(null); }} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
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

export { NotificationsView, UsersView, ReportsView, SlaView, SlaClientDetail, DbConnectionsView, SapProfileFields, SapProfileBadges, VpnProfileFields, VpnProfileBadges, DbConnectionsList, ClientTeamView, ClientTeamList };
