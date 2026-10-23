import { useState, useEffect, Component } from "react";
import {
  Activity, AlertCircle, AlertTriangle, BadgeCheck, BarChart2, Briefcase,
  Building2, Calendar, CalendarDays, CalendarRange, Check, CheckCircle2,
  ChevronDown, ChevronUp, ClipboardList, CreditCard, Crosshair, Database, DollarSign, Download,
  ExternalLink, FileCode2, FileText, FolderKanban, FolderOpen, Globe,
  Handshake, ListChecks, Lock, Mail, Palette, Pencil, Phone, Plus, Receipt,
  RefreshCw, RotateCcw, Search, Send, Settings, Shield, SlidersHorizontal,
  Monitor, Rocket, Sparkles, Tag, Trash2, TrendingUp, User, UserCheck, UserCog,
  Users, X, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useSystemSettings, useVisibilitySettings, usePlanConfig, usePlatformBranding } from "../hooks/useSystemSettings.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { logEvent, notify, clearAuditConfigCache } from "../lib/utils.js";
import { Badge, PlanUsageCard, Spinner, TrustBadge } from "../components/ProfileComponents.jsx";
import { EmptyState, Input, Modal, Select, Textarea } from "../components/ui.jsx";
import {
  SlaMatrixEditor, SLA_PRIORITIES, SLA_DEFAULT_TYPES,
  fmtDate, fmt, cap, ROLE_LABEL_KEYS,
  INVOICE_STATUS_COLORS,
} from "../lib/uiUtils.jsx";
import {
  ROLE_COLORS, PLAN_BADGE, DEFAULT_PLAN_CONFIG, DEFAULT_PLAN_PRICES,
  LIFECYCLE_PRESETS, DEFAULT_ACTIVITY_PHASES,
  SAP_AREAS, INDUSTRY_AREAS, PROJECT_TYPES, ROLE_TO_PLAN_TYPE, PRIORITY_COLORS,
  DEFAULT_MIGRATION_CONFIG,
} from "../lib/businessConstants.js";
import { GENERATION_CONTEXT_DEFAULTS, GENERATION_PROFILE_DEFAULTS, GEN_DOCS, ROLE_PERMISSIONS_DEFAULTS, WIZARD_MODE_DEFAULTS } from "../lib/constants.js";
import { LifecycleSettingsView, CaseDefaultsPanel, AssignmentSettingsPanel, TransitionGatesPanel } from "./SettingsSubViews.jsx";
import { PersonAvatar } from "./Projects.jsx";
import { AbapTemplatesSection } from "../components/SapPanels.jsx";
import { SlaClientView } from "./OperationsViews.jsx";
import { ConsultantProfilePanel } from "./ArenaView.jsx";

// Nova Logo preview for settings branding section
if (typeof document !== 'undefined') {
  let _kf = document.getElementById('nova-logo-kf');
  if (!_kf) { _kf = document.createElement('style'); _kf.id = 'nova-logo-kf'; document.head.appendChild(_kf); }
  if (!_kf.textContent.includes('nova-orbit')) {
    _kf.textContent = `@keyframes nova-orbit {
  from { transform: rotate(var(--ns,0deg)) translateX(var(--nr,36px)) rotate(calc(-1*var(--ns,0deg))); }
  to   { transform: rotate(calc(var(--ns,0deg)+360deg)) translateX(var(--nr,36px)) rotate(calc(-1*(var(--ns,0deg)+360deg))); }
}`;
  }
}
const _SETTINGS_NOVA = [
  { s:  0, r:54, d:9,  z:13, c:'#2563EB', gr:7, gc:'rgba(37,99,235,0.48)' },
  { s:195, r:54, d:9,  z:10, c:'#60A5FA', gr:5, gc:'rgba(96,165,250,0.4)'  },
  { s:100, r:74, d:16, z:11, c:'#3B82F6', gr:6, gc:'rgba(59,130,246,0.4)'  },
  { s:280, r:74, d:16, z:8,  c:'#93C5FD', gr:4, gc:'rgba(147,197,253,0.35)'},
];
function NovaSettingsLogo({ size = 80 }) {
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
      {_SETTINGS_NOVA.map((o, i) => {
        const r = Math.round(o.r * sc); const z = Math.max(4, Math.round(o.z * sc)); const gr = Math.max(2, Math.round(o.gr * sc));
        return (
          <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0, animation:`nova-orbit ${o.d}s linear infinite`, '--ns':`${o.s}deg`, '--nr':`${r}px`, zIndex:2 }}>
            <div style={{ position:'absolute', width:z, height:z, top:-z/2, left:-z/2, borderRadius:'50%', background:o.c, boxShadow:`0 1px 4px rgba(0,0,0,.15),0 0 ${gr}px ${o.gc}` }} />
          </div>
        );
      })}
    </div>
  );
}

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

  const ROLES = ["admin", "manager", "consultant", "client", "key_user", "headhunter", "final_user", "dispatch", "area_leader"];

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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ email: addForm.email, password: addForm.password, full_name: addForm.full_name, role: addForm.role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create user');
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
              <th className="px-4 py-3 text-center font-semibold text-gray-600">{t("sys.col_ai_pro")}</th>
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
                  <button
                    onClick={async () => {
                      await supabase.from("users").update({ is_pro: !u.is_pro }).eq("id", u.id);
                      setUsers(p => p.map(x => x.id === u.id ? { ...x, is_pro: !x.is_pro } : x));
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 mx-auto ${
                      u.is_pro
                        ? "bg-violet-100 text-violet-700 hover:bg-gray-100 hover:text-gray-600"
                        : "bg-gray-100 text-gray-400 hover:bg-violet-100 hover:text-violet-700"
                    }`}
                    title={u.is_pro ? t("sys.ai_pro_revoke") : t("sys.ai_pro_grant")}
                  >
                    <Zap size={10} />
                    {u.is_pro ? "Pro" : "Free"}
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
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">{t("sys.no_users")}</td></tr>
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
    doc_types:      ["Functional Spec", "Technical Spec", "ABAP Standards", "Blueprint", "Test Script", "Go-Live Checklist", "Data Migration", "Contract / SOW", "Change Request", "Status Report", "Meeting Minutes", "User Manual", "Training Material", "Other"],
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
    doc_types:      "Document Types",
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
    show_pricing_section:       true,
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
        show_pricing_section:       ssCtx.settings["show_pricing_section"]       ?? DEFAULTS.show_pricing_section,
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
        ssCtx.setSetting("show_pricing_section",      form.show_pricing_section),
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
            <div className="flex gap-2">
              <input value={form.brand_logo_url}
                onChange={e => setForm(p => ({ ...p, brand_logo_url: e.target.value }))}
                placeholder="Leave empty to use Nova Logo"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full font-mono text-xs" />
              {form.brand_logo_url && (
                <button
                  onClick={() => setForm(p => ({ ...p, brand_logo_url: "" }))}
                  className="flex-shrink-0 px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 whitespace-nowrap">
                  Use Nova Logo
                </button>
              )}
            </div>
            {form.brand_logo_url ? (
              <img src={form.brand_logo_url} alt="Logo preview"
                className="mt-2 h-10 object-contain rounded border border-gray-100 p-1"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <p className="text-xs text-gray-400 mt-1">Nova Logo will be used (animated, shown in sidebar)</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Arena Logo (Nova)</label>
            <div className="flex items-center gap-6 p-4 rounded-xl border border-gray-100 bg-[#0C1828]">
              <NovaSettingsLogo size={80} />
              <div>
                <div className="text-white font-bold text-sm mb-0.5">{form.platform_name || "Arena"}</div>
                <div className="text-blue-300 text-xs">{form.platform_tagline || "Consultant Case Management"}</div>
                <div className="text-[11px] text-blue-400/60 mt-2">Used in sidebar &amp; navigation</div>
              </div>
              <div className="ml-auto">
                <NovaSettingsLogo size={36} />
              </div>
            </div>
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

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Palette size={16} className="text-blue-600" /> Landing Page
        </h3>
        <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
          <div>
            <p className="text-sm font-medium text-gray-700">Show Pricing Section</p>
            <p className="text-xs text-gray-400 mt-0.5">Display the pricing section on the public landing page, including nav and footer links.</p>
          </div>
          <button type="button"
            onClick={() => setForm(p => ({ ...p, show_pricing_section: !p.show_pricing_section }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.show_pricing_section ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch" aria-checked={form.show_pricing_section}>
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.show_pricing_section ? 'translate-x-5' : 'translate-x-0'}`} />
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
            show_pricing_section:      DEFAULTS.show_pricing_section,
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

const NAV_ITEMS_CONFIG = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'cases',         label: 'Cases / My Cases' },
  { id: 'projects',      label: 'Projects' },
  { id: 'kanban',        label: 'Kanban' },
  { id: 'arena',         label: 'Arena' },
  { id: 'time',          label: 'Time Entries' },
  { id: 'invoices',      label: 'Invoices' },
  { id: 'reports',       label: 'Reports' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'my-reviews',    label: 'My Reviews' },
];

const NAV_VIS_ROLES = ["manager", "consultant", "internal_consultant", "project_manager", "client", "key_user", "headhunter", "final_user", "dispatch", "area_leader"];

function SettingsRolesTab({ ssCtx }) {
  const { t } = useT();

  const ALL_ROLES = ["admin", "manager", "consultant", "internal_consultant", "project_manager", "client", "key_user", "headhunter", "final_user", "dispatch", "area_leader"];
  const CAPABILITIES = Object.keys(ROLE_PERMISSIONS_DEFAULTS);

  const WIZARD_TYPES = ["case", "project"];
  const WIZARD_ROLES = ["admin", "manager", "consultant", "client", "key_user", "headhunter", "final_user", "internal_consultant", "project_manager"];
  const WIZARD_OPTIONS = ["ask", "express", "advanced"];

  const [matrix, setMatrix] = useState(null);
  const [wizardModes, setWizardModes] = useState(null);
  const [navVisibility, setNavVisibility] = useState({});
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

      const storedWiz = ssCtx.settings["wizard_modes"] ?? {};
      const mergedWiz = {};
      for (const type of WIZARD_TYPES) {
        mergedWiz[type] = {};
        for (const role of WIZARD_ROLES) {
          mergedWiz[type][role] = storedWiz[type]?.[role] ?? WIZARD_MODE_DEFAULTS[type]?.[role] ?? "ask";
        }
      }
      setWizardModes(mergedWiz);
      setNavVisibility(ssCtx.settings["nav_visibility_by_role"] ?? {});
    }
  }, [ssCtx.loading, ssCtx.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(cap, role) {
    if (role === 'admin') return;
    setMatrix(p => ({ ...p, [cap]: { ...p[cap], [role]: !p[cap][role] } }));
  }

  function toggleNavItem(role, navId) {
    setNavVisibility(prev => {
      const roleVis = prev[role] ?? {};
      const current = roleVis[navId] !== false;
      return { ...prev, [role]: { ...roleVis, [navId]: !current } };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await ssCtx.setSetting("role_permissions", matrix);
      await ssCtx.setSetting("wizard_modes", wizardModes);
      await ssCtx.setSetting("nav_visibility_by_role", navVisibility);
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
    const freshWiz = {};
    for (const type of WIZARD_TYPES) {
      freshWiz[type] = {};
      for (const role of WIZARD_ROLES) freshWiz[type][role] = WIZARD_MODE_DEFAULTS[type]?.[role] ?? "ask";
    }
    setWizardModes(freshWiz);
    setNavVisibility({});
  }

  if (ssCtx.loading || !matrix || !wizardModes) return <Spinner />;

  const ROLE_COLORS = {
    admin:               'border border-red-500 text-red-500 bg-red-500/10',
    manager:             'border border-purple-500 text-purple-400 bg-purple-500/10',
    consultant:          'border border-blue-500 text-blue-400 bg-blue-500/10',
    client:              'border border-green-500 text-green-400 bg-green-500/10',
    key_user:            'border border-amber-500 text-amber-400 bg-amber-500/10',
    headhunter:          'border border-pink-500 text-pink-400 bg-pink-500/10',
    final_user:          'border border-teal-500 text-teal-400 bg-teal-500/10',
    internal_consultant: 'border border-indigo-500 text-indigo-400 bg-indigo-500/10',
    project_manager:     'border border-rose-500 text-rose-400 bg-rose-500/10',
    dispatch:            'border border-cyan-500 text-cyan-400 bg-cyan-500/10',
    area_leader:         'border border-orange-500 text-orange-400 bg-orange-500/10',
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield size={16} className="text-blue-600" /> {t("roles.title")}
          </h3>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">{t("roles.subtitle")} {" "}
          <span className="text-red-500 font-medium">Admin always has full access and cannot be restricted.</span>
        </p>

        {/* Permission matrix */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide w-48">
                  {t("roles.capability")}
                </th>
                {ALL_ROLES.map(r => (
                  <th key={r} className="text-center py-2 px-2 min-w-[80px]">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_COLORS[r]}`}>
                      {t("role." + r)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, idx) => (
                <tr key={cap} className={`border-b border-gray-100 dark:border-gray-700 ${idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}>
                  <td className="py-2.5 pr-4 font-medium text-gray-700 dark:text-gray-300 text-xs">
                    {t("roles.cap." + cap)}
                  </td>
                  {ALL_ROLES.map(role => (
                    <td key={role} className="text-center py-2.5 px-2">
                      {role === 'admin' ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-red-500 bg-red-500/20 text-red-500" title="Admin always has access">
                          <Check size={11} />
                        </span>
                      ) : (
                        <button
                          onClick={() => toggle(cap, role)}
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
                            matrix[cap]?.[role]
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-transparent border-gray-400 dark:border-gray-500 text-transparent hover:border-blue-400'
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

      {/* Wizard Mode Defaults */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={16} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">{t("roles.wizard_modes_title")}</h3>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">{t("roles.wizard_modes_desc")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide w-36">{t("roles.wizard_type")}</th>
                {WIZARD_ROLES.map(r => (
                  <th key={r} className="text-center py-2 px-1.5 min-w-[80px]">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t("role." + r)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WIZARD_TYPES.map((type, idx) => (
                <tr key={type} className={`border-b border-gray-100 dark:border-gray-700 ${idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}>
                  <td className="py-3 pr-4 font-medium text-gray-700 dark:text-gray-300 text-xs">{t("roles.wizard_type_" + type)}</td>
                  {WIZARD_ROLES.map(role => (
                    <td key={role} className="text-center py-2 px-1.5">
                      <select
                        value={wizardModes[type][role]}
                        onChange={e => setWizardModes(p => ({ ...p, [type]: { ...p[type], [role]: e.target.value } }))}
                        className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-400 cursor-pointer"
                      >
                        {WIZARD_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{t("roles.wizard_opt_" + opt)}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menu Visibility */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal size={16} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Menu Visibility</h3>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
          Choose which sidebar items each role can see. Items not in a role's default menu are already hidden. Admin always sees everything.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide w-36">Nav Item</th>
                {NAV_VIS_ROLES.map(r => (
                  <th key={r} className="text-center py-2 px-2 min-w-[76px]">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t("role." + r)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV_ITEMS_CONFIG.map((nav, idx) => (
                <tr key={nav.id} className={`border-b border-gray-100 dark:border-gray-700 ${idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''}`}>
                  <td className="py-2.5 pr-4 font-medium text-gray-700 dark:text-gray-300 text-xs">{nav.label}</td>
                  {NAV_VIS_ROLES.map(role => {
                    const visible = (navVisibility[role] ?? {})[nav.id] !== false;
                    return (
                      <td key={role} className="text-center py-2.5 px-2">
                        <button
                          onClick={() => toggleNavItem(role, nav.id)}
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
                            visible
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-transparent border-gray-400 dark:border-gray-500 text-transparent hover:border-blue-400'
                          }`}
                        >
                          <Check size={11} />
                        </button>
                      </td>
                    );
                  })}
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
          className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5">
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

const INFRA_NODE_META = [
  {
    key: 'vm',
    label: 'Virtual Machine',
    icon: Monitor,
    color: 'text-blue-500',
    autoSolveActions: [
      'Refresh Cloudflare tunnel URL from Supabase registry',
      'Retry connection with fresh URL',
    ],
    cannotSolve: ['VM fully down — requires AWS Console restart'],
  },
  {
    key: 'vpn',
    label: 'VPN',
    icon: Shield,
    color: 'text-purple-500',
    autoSolveActions: [
      'Start VPN using project connection credentials',
      'Wait up to 8s for tunnel to establish',
      'Re-verify VPN status after start',
    ],
    cannotSolve: ['Credential / authentication errors — requires manual fix'],
  },
  {
    key: 'mcp',
    label: 'MCP Server',
    icon: Rocket,
    color: 'text-indigo-500',
    autoSolveActions: [
      'POST /restart → systemctl restart sap-mcp',
      'Poll /health every 3s for up to 45s',
      'Refresh tunnel URL if still unreachable',
      'Write restart_mcp to Supabase vm_command_queue (VM picks up within 60s)',
      'Poll /health for 90s more after queue command',
    ],
    cannotSolve: ['Port conflict requiring manual investigation', 'Missing vm_command_queue table in Supabase'],
  },
  {
    key: 'sap',
    label: 'SAP Connection',
    icon: Database,
    color: 'text-green-500',
    autoSolveActions: [
      'Retry once on network / timeout errors',
      'Classify error type (401 / 403 / 404) for diagnosis',
    ],
    cannotSolve: ['Wrong credentials — requires updating SAP settings', 'No ADT authorization (403)', 'SICF service not active (404)'],
  },
];

const INFRA_CHECK_DEFAULTS = {
  vm:  { enabled: true, autoSolve: true },
  vpn: { enabled: true, autoSolve: true },
  mcp: { enabled: true, autoSolve: true },
  sap: { enabled: true, autoSolve: false },
};

function InfraCheckSettingsCard({ ssCtx }) {
  const raw = ssCtx.settings['infra_check_settings'] ?? {};
  const [cfg, setCfg] = useState(() =>
    Object.fromEntries(INFRA_NODE_META.map(n => [
      n.key,
      { enabled: raw[n.key]?.enabled ?? INFRA_CHECK_DEFAULTS[n.key].enabled,
        autoSolve: raw[n.key]?.autoSolve ?? INFRA_CHECK_DEFAULTS[n.key].autoSolve },
    ]))
  );
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next) {
    setCfg(next);
    setSaving(true);
    try {
      await ssCtx.setSetting('infra_check_settings', next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  function toggle(nodeKey, field) {
    const next = { ...cfg, [nodeKey]: { ...cfg[nodeKey], [field]: !cfg[nodeKey][field] } };
    save(next);
  }

  const Toggle = ({ on, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  );

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Activity size={14} className="text-blue-500" /> Infrastructure Check
          </h4>
          <p className="text-xs text-gray-400 mt-0.5">Configure which nodes to check and whether auto-solve is allowed per node.</p>
        </div>
        {saving && <RefreshCw size={12} className="animate-spin text-gray-400" />}
        {saved && !saving && <span className="text-xs text-green-500 flex items-center gap-1"><Check size={11} /> Saved</span>}
      </div>

      <div className="space-y-2">
        {INFRA_NODE_META.map(({ key, label, icon: Icon, color, autoSolveActions, cannotSolve }) => {
          const node = cfg[key];
          const isExpanded = !!expanded[key];
          return (
            <div key={key} className={`rounded-xl border transition-colors ${node.enabled ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Icon size={14} className={color} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>

                {/* Auto-solve toggle — only shown when node is enabled */}
                {node.enabled && (
                  <div className="flex items-center gap-1.5 mr-3">
                    <span className="text-xs text-gray-400">Auto-solve</span>
                    <Toggle on={node.autoSolve} onClick={() => toggle(key, 'autoSolve')} />
                  </div>
                )}

                {/* Enable toggle */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Check</span>
                  <Toggle on={node.enabled} onClick={() => toggle(key, 'enabled')} />
                </div>

                {/* Expand actions */}
                <button onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                  className="p-1 text-gray-300 hover:text-gray-500 transition-colors">
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Auto-solve actions</p>
                    <ul className="space-y-1">
                      {autoSolveActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <CheckCircle2 size={11} className="text-green-400 mt-0.5 shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {cannotSolve?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 mt-2">Cannot auto-solve</p>
                      <ul className="space-y-1">
                        {cannotSolve.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                            <XCircle size={11} className="text-red-300 mt-0.5 shrink-0" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SapInfraStatus({ mcpUrl }) {
  const [status, setStatus] = useState(null); // null | { vm, mcp, vpn, vpnDetail, timestamp } | 'error'
  const [checking, setChecking] = useState(false);

  async function check() {
    const base = (mcpUrl ?? '').trim().replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    if (!base) return;
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) { setStatus(await res.json()); return; }
      // Older server without /status — fall back to /health to confirm VM+MCP are up
      if (res.status === 404) {
        const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
        if (h.ok) { setStatus({ vm: true, mcp: true, vpn: null }); return; }
      }
      setStatus('error');
    } catch { setStatus('error'); }
    finally { setChecking(false); }
  }

  const dot = (ok, label) => (
    <span className="flex items-center gap-1.5 text-xs">
      {ok === true  ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
       : ok === false ? <XCircle size={13} className="text-red-400 shrink-0" />
       : <AlertCircle size={13} className="text-gray-300 shrink-0" />}
      <span className={ok === true ? 'text-green-700' : ok === false ? 'text-red-500' : 'text-gray-400'}>{label}</span>
    </span>
  );

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <button
        onClick={check}
        disabled={checking || !(mcpUrl ?? '').trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {checking ? <RefreshCw size={12} className="animate-spin" /> : <Activity size={12} />}
        Check infrastructure
      </button>
      {status && status !== 'error' && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
          {dot(status.vm,  'VM')}
          {dot(status.mcp, 'MCP')}
          {dot(status.vpn, status.vpn === null ? 'VPN?' : 'VPN')}
        </div>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <XCircle size={13} /> Unreachable — check the URL or tunnel
        </span>
      )}
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
    { value: "claude-haiku-4-5-20251001", labelKey: "model.haiku45_label" },
    { value: "claude-haiku-5-5",          labelKey: "model.haiku55_label" },
    { value: "claude-sonnet-4-6",         labelKey: "model.sonnet46_label" },
    { value: "claude-sonnet-5-5",         labelKey: "model.sonnet55_label" },
  ];

  useEffect(() => {
    if (!ssCtx.loading) {
      const stored = ssCtx.settings["generation_profiles"] ?? {};
      const storedCtx = ssCtx.settings["generation_context"] ?? {};
      const validModelVals = AI_MODELS.map(m => m.value);
      const resolveModel = (key, fallback) => {
        const v = ssCtx.settings[key];
        return validModelVals.includes(v) ? v : fallback;
      };
      const merged = {
        ai_model:         resolveModel("ai_model",        "claude-haiku-5-5"),
        analysis_model:   resolveModel("analysis_model",  "claude-haiku-5-5"),
        prototype_model:  resolveModel("prototype_model", "claude-haiku-5-5"),
        sap_mcp_server_url: ssCtx.settings["sap_mcp_server_url"] ?? "",
        default_profile: stored.default_profile ?? GENERATION_PROFILE_DEFAULTS.default_profile,
        context: { ...GENERATION_CONTEXT_DEFAULTS, ...storedCtx },
        profiles: {},
      };
      for (const pk of ["basic", "standard", "full"]) {
        const def = GENERATION_PROFILE_DEFAULTS.profiles[pk] ?? {};
        const sto = stored.profiles?.[pk] ?? {};
        const p = {
          additional_instructions: sto.additional_instructions ?? def.additional_instructions ?? "",
          prototype_enabled: sto.prototype_enabled ?? false,
          prototype_style:   sto.prototype_style   ?? 'fiori',
        };
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
      const { ai_model, analysis_model, prototype_model, sap_mcp_server_url, context, ...genProfiles } = form;
      await Promise.all([
        ssCtx.setSetting("ai_model",            ai_model),
        ssCtx.setSetting("analysis_model",      analysis_model),
        ssCtx.setSetting("prototype_model",     prototype_model),
        ssCtx.setSetting("sap_mcp_server_url",  sap_mcp_server_url ?? ""),
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
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("sys.prototype_model_label")}</label>
          <select value={form.prototype_model} onChange={e => setForm(p => ({ ...p, prototype_model: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t("sys.prototype_model_hint")}</p>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">SAP MCP Server URL</label>
          <input
            type="url"
            value={form.sap_mcp_server_url}
            onChange={e => setForm(p => ({ ...p, sap_mcp_server_url: e.target.value }))}
            placeholder="https://your-mcp-server.example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
          <p className="text-xs text-gray-400 mt-1">URL of the TechCase SAP MCP server. When set, ABAP code generation connects to SAP live for reading and writing objects.</p>
          <SapInfraStatus mcpUrl={form.sap_mcp_server_url} />
        </div>

        {/* ── Infrastructure Check Settings ─────────────────────── */}
        <InfraCheckSettingsCard ssCtx={ssCtx} />
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

      {/* Request Summary Sections */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <ListChecks size={16} className="text-purple-600" /> Request Summary Sections
        </h3>
        <p className="text-xs text-gray-400 mb-4">Configure the sections the AI generates in the Request Summary analysis. Drag to reorder — order is preserved in the output.</p>
        <div className="space-y-2 mb-3">
          {(form.context.request_summary_sections ?? GENERATION_CONTEXT_DEFAULTS.request_summary_sections).map((sec, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={sec}
                onChange={e => setForm(p => {
                  const secs = [...(p.context.request_summary_sections ?? GENERATION_CONTEXT_DEFAULTS.request_summary_sections)];
                  secs[i] = e.target.value;
                  return { ...p, context: { ...p.context, request_summary_sections: secs } };
                })}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
                placeholder="Section name…"
              />
              <button
                type="button"
                onClick={() => setForm(p => {
                  const secs = [...(p.context.request_summary_sections ?? GENERATION_CONTEXT_DEFAULTS.request_summary_sections)];
                  secs.splice(i, 1);
                  return { ...p, context: { ...p.context, request_summary_sections: secs } };
                })}
                className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                title="Remove section">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setForm(p => ({
            ...p,
            context: {
              ...p.context,
              request_summary_sections: [...(p.context.request_summary_sections ?? GENERATION_CONTEXT_DEFAULTS.request_summary_sections), 'New Section'],
            },
          }))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
          <Plus size={12} /> Add Section
        </button>
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
            { key: "include_project_docs",  labelKey: "gen.ctx_project_docs",     descKey: "gen.ctx_project_docs_desc" },
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
                className={`flex items-center gap-1.5 flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${isAct ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
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

          {/* Interactive Prototype */}
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Monitor size={13} className="text-indigo-500" /> Generate Interactive Prototype
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Claude generates a navigable HTML prototype saved in the Documents tab</p>
              </div>
              <button type="button"
                onClick={() => setForm(prev => ({
                  ...prev,
                  profiles: {
                    ...prev.profiles,
                    [activeProfile]: { ...prev.profiles[activeProfile], prototype_enabled: !prev.profiles[activeProfile].prototype_enabled },
                  },
                }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.profiles[activeProfile].prototype_enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                role="switch" aria-checked={!!form.profiles[activeProfile].prototype_enabled}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.profiles[activeProfile].prototype_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>
            {form.profiles[activeProfile].prototype_enabled && (
              <div className="mt-3 pl-1">
                <p className="text-xs font-medium text-gray-600 mb-2">Prototype Style</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'auto',      label: '✦ Auto',     desc: 'AI picks style from case signals' },
                    { value: 'fiori',     label: 'SAP Fiori',  desc: 'Fiori shell bar, cards & tables' },
                    { value: 'sapgui',    label: 'SAP GUI',    desc: 'Classic GUI: ALV grid + detail panel' },
                    { value: 'wireframe', label: 'Wireframe',  desc: 'Low-fidelity grey boxes & labels' },
                    { value: 'branded',   label: 'Branded',    desc: 'TechCase Arena dark theme' },
                  ].map(s => {
                    const sel = (form.profiles[activeProfile].prototype_style ?? 'auto') === s.value;
                    return (
                      <button key={s.value}
                        onClick={() => setForm(prev => ({
                          ...prev,
                          profiles: { ...prev.profiles, [activeProfile]: { ...prev.profiles[activeProfile], prototype_style: s.value } },
                        }))}
                        className={`flex flex-col px-3 py-2 rounded-lg border text-left transition-all ${sel ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-gray-50'}`}>
                        <span className="text-xs font-semibold">{s.label}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{s.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
    const targetUser = users.find(u => u.id === userId);
    const updateData = {
      verification_status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };
    if (targetUser?.role === 'invited_client') updateData.role = 'client';
    await supabase.from('users').update(updateData).eq('id', userId);
    logEvent('user.approved', { entityType: 'user', entityId: userId });
    const msg = targetUser?.role === 'invited_client'
      ? 'Your full access has been approved! You now have complete client access.'
      : 'Your account has been approved! 🎉 You now have access to the platform. Welcome aboard.';
    notify(userId, 'Account approved', msg);
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
      const targetUser = users.find(u => u.id === userId);
      const updateData = {
        verification_status: 'approved',
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
      };
      if (targetUser?.role === 'invited_client') updateData.role = 'client';
      await supabase.from('users').update(updateData).eq('id', userId);
      const msg = targetUser?.role === 'invited_client'
        ? 'Your full access has been approved! You now have complete client access.'
        : 'Your account has been approved. Welcome aboard.';
      await notify(userId, 'Account approved', msg);
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
    consultant:      'bg-blue-100 text-blue-700',
    client:          'bg-green-100 text-green-700',
    headhunter:      'bg-purple-100 text-purple-700',
    manager:         'bg-orange-100 text-orange-700',
    invited_client:  'bg-sky-100 text-sky-700',
  };
  const ROLE_LABELS = {
    invited_client: 'Invited Client → Full Access',
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
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-500'}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
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
  const ALL_ROLES = ["admin", "manager", "consultant", "internal_consultant", "project_manager", "client", "key_user", "headhunter", "final_user", "dispatch", "area_leader"];
  const CAPS = Object.keys(ROLE_PERMISSIONS_DEFAULTS);

  const PERSONA_TABS = [
    { id: "internal",    label: "Internal",    roles: ["admin", "manager", "area_leader", "dispatch"], Icon: Shield,    accent: "purple", border: "border-purple-500", activeBg: "bg-purple-600", accentTxt: "text-purple-600", lightBg: "bg-purple-50" },
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
    area_leader:         { pill: "bg-orange-100 text-orange-700 border-orange-200", active: "bg-orange-600 text-white border-orange-600"  },
    dispatch:            { pill: "bg-cyan-100 text-cyan-700 border-cyan-200",       active: "bg-cyan-600 text-white border-cyan-600"      },
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ email: addForm.email, password: addForm.password, full_name: addForm.full_name, role: addForm.role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create user');
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
  const [navPlanVis, setNavPlanVis] = useState(ssCtx.settings['nav_visibility_by_plan'] ?? {});
  const [navPlanSaving, setNavPlanSaving] = useState(false);

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
  const PLAN_KEYS  = { client: ['free','growth','enterprise'], consultant: ['free','pro'], headhunter: ['free','pro','agency'] };
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
        {[{id:'users',label:'User Plans'},{id:'config',label:'Plan Limits'},{id:'nav',label:'Feature Access'}].map(s => (
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

      {tab === 'nav' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">Control which sidebar items are available per membership plan. Unchecked items are hidden for users on that plan.</p>
          {PLAN_TYPES.map(rt => (
            <div key={rt} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 capitalize">{rt} Plans</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-36">Nav Item</th>
                      {(PLAN_KEYS[rt] ?? []).map(pk => (
                        <th key={pk} className="px-4 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLAN_BADGE[pk] ?? PLAN_BADGE.free}`}>{pk}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {NAV_ITEMS_CONFIG.map((nav, idx) => (
                      <tr key={nav.id} className={idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-white/5' : ''}>
                        <td className="px-4 py-2.5 font-medium text-gray-700">{nav.label}</td>
                        {(PLAN_KEYS[rt] ?? []).map(pk => {
                          const visible = (navPlanVis[rt]?.[pk] ?? {})[nav.id] !== false;
                          return (
                            <td key={pk} className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => setNavPlanVis(prev => {
                                  const rtVis  = prev[rt]  ?? {};
                                  const pkVis  = rtVis[pk] ?? {};
                                  return { ...prev, [rt]: { ...rtVis, [pk]: { ...pkVis, [nav.id]: !visible } } };
                                })}
                                className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
                                  visible
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-transparent border-gray-400 dark:border-gray-500 text-transparent hover:border-blue-400'
                                }`}
                              >
                                <Check size={11} />
                              </button>
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
            <button
              onClick={async () => {
                setNavPlanSaving(true);
                await ssCtx.setSetting('nav_visibility_by_plan', navPlanVis);
                setNavPlanSaving(false);
              }}
              disabled={navPlanSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors">
              {navPlanSaving ? 'Saving…' : 'Save Feature Access'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function SettingsPricingTab({ ssCtx, auth }) {
  const savedPrices  = { ...DEFAULT_PLAN_PRICES, ...(ssCtx.settings['plan_prices'] ?? {}) };
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
function SettingsDefaultLifecycleTab({ ssCtx }) {
  const { settings, setSetting } = ssCtx;
  const { templates } = useLifecycleTemplates();
  const cfg = settings["default_lifecycle_config"] ?? {};
  const [casePreset,       setCasePreset]       = useState(cfg.case?.preset         ?? "standard");
  const [caseReopenTo,     setCaseReopenTo]     = useState(cfg.case?.reopen_to      ?? "open");
  const [caseAllowOverride,setCaseAllowOverride] = useState(cfg.case?.allow_override ?? true);
  const [projPreset,       setProjPreset]       = useState(cfg.project?.preset      ?? "standard");
  const [projReopenTo,     setProjReopenTo]     = useState(cfg.project?.reopen_to   ?? "open");
  const [projAllowOverride,setProjAllowOverride] = useState(cfg.project?.allow_override ?? true);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    const c = settings["default_lifecycle_config"] ?? {};
    setCasePreset(c.case?.preset            ?? "standard");
    setCaseReopenTo(c.case?.reopen_to       ?? "open");
    setCaseAllowOverride(c.case?.allow_override ?? true);
    setProjPreset(c.project?.preset         ?? "standard");
    setProjReopenTo(c.project?.reopen_to    ?? "open");
    setProjAllowOverride(c.project?.allow_override ?? true);
  }, [settings]);

  const tmplList = templates.length
    ? templates
    : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }));

  function stagesFor(preset) {
    const tmpl = templates.find(t => t.key === preset);
    return (tmpl?.stages ?? LIFECYCLE_PRESETS[preset]?.stages ?? LIFECYCLE_PRESETS.standard.stages).filter(s => !s.is_terminal);
  }

  async function handleSave() {
    setSaving(true);
    await setSetting("default_lifecycle_config", {
      case:    { preset: casePreset,  reopen_to: caseReopenTo,  allow_override: caseAllowOverride },
      project: { preset: projPreset,  reopen_to: projReopenTo,  allow_override: projAllowOverride },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const LcSelect = ({ label, value, onChange }) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tmplList.map(tmpl => {
          const isBuiltin = ["short","standard","full"].includes(tmpl.key);
          const active = (tmpl.stages ?? []).filter(s => !s.is_terminal);
          return (
            <button key={tmpl.key} onClick={() => onChange(tmpl.key)}
              className={`text-left p-3 rounded-xl border-2 transition-all ${
                value === tmpl.key ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
              <p className="font-semibold text-sm text-gray-900">{isBuiltin ? tmpl.name : tmpl.name}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {active.slice(0, 4).map((s, i) => (
                  <span key={s.key} className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: s.color + "22", color: s.color }}>{s.label}</span>
                    {i < Math.min(active.length, 4) - 1 && <span className="text-gray-300 text-[10px]">›</span>}
                  </span>
                ))}
                {active.length > 4 && <span className="text-[10px] text-gray-400">+{active.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const ReopenSelect = ({ label, preset, value, onChange }) => {
    const stages = stagesFor(preset);
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400">
          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          {!stages.find(s => s.key === value) && <option value={value}>{value}</option>}
        </select>
      </div>
    );
  };

  const OverrideToggle = ({ label, desc, value, onChange }) => (
    <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-8 max-w-2xl">
      <p className="text-sm text-gray-500">
        These defaults apply automatically when a case or project is created without a client, or by roles that don't configure their own lifecycle.
      </p>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
        <p className="text-sm font-bold text-gray-800">Cases</p>
        <LcSelect label="Default lifecycle template" value={casePreset} onChange={setCasePreset} />
        <ReopenSelect label="Default reopen-to stage" preset={casePreset} value={caseReopenTo} onChange={setCaseReopenTo} />
        <OverrideToggle
          label="Allow cases to change template"
          desc="Individual cases can pick a different lifecycle template"
          value={caseAllowOverride}
          onChange={setCaseAllowOverride}
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
        <p className="text-sm font-bold text-gray-800">Projects</p>
        <LcSelect label="Default lifecycle template" value={projPreset} onChange={setProjPreset} />
        <ReopenSelect label="Default reopen-to stage" preset={projPreset} value={projReopenTo} onChange={setProjReopenTo} />
        <OverrideToggle
          label="Allow projects to change template"
          desc="Projects under your account can pick a different lifecycle template"
          value={projAllowOverride}
          onChange={setProjAllowOverride}
        />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
          {saving ? "Saving…" : "Save defaults"}
        </button>
        {saved && <span className="text-sm text-green-600 font-semibold">Saved</span>}
      </div>
    </div>
  );
}

// ─── SettingsMigrationTab ────────────────────────────────────────────────────

const COLOR_DOT = {
  violet:  'bg-violet-500',
  blue:    'bg-blue-500',
  cyan:    'bg-cyan-500',
  teal:    'bg-teal-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  green:   'bg-green-500',
  emerald: 'bg-emerald-500',
  red:     'bg-red-500',
  pink:    'bg-pink-500',
  slate:   'bg-slate-400',
};

const SYNC_ROWS = [
  { key: 'phase_deliverables', label: 'Phase deliverables', hint: 'What each deliverable creates when syncing phases', options: [{ v: 'activity', l: 'Activities' }, { v: 'subcase', l: 'Sub-cases' }] },
  { key: 'wricef_items',       label: 'WRICEF items',        hint: 'How WRICEF objects are tracked in the registry case', options: [{ v: 'case', l: 'Cases' }, { v: 'activity', l: 'Activities' }] },
  { key: 'cutover_tasks',      label: 'Cutover tasks',        hint: 'How cutover tasks appear in the cutover plan case', options: [{ v: 'activity', l: 'Activities' }, { v: 'case', l: 'Sub-cases' }] },
];

function SettingsMigrationTab({ ssCtx }) {
  const [sync, setSync] = useState({ ...DEFAULT_MIGRATION_CONFIG.sync });
  const [phases, setPhases] = useState(DEFAULT_MIGRATION_CONFIG.phases.map((p, i) => ({ ...p, _id: i })));
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (ssCtx.loading) return;
    const raw = ssCtx.settings['migration_config'];
    if (!raw) return;
    if (raw.sync) setSync({ ...DEFAULT_MIGRATION_CONFIG.sync, ...raw.sync });
    if (Array.isArray(raw.phases)) setPhases(raw.phases.map((p, i) => ({ ...p, _id: i })));
  }, [ssCtx.loading, ssCtx.settings]);

  function toggleExpand(idx) {
    setExpanded(v => v === idx ? null : idx);
  }

  function updatePhase(idx, key, val) {
    setPhases(ps => ps.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  }

  function movePhase(idx, dir) {
    setPhases(ps => {
      const next = [...ps];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return ps;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      if (expanded === idx) setExpanded(swap);
      else if (expanded === swap) setExpanded(idx);
      return next;
    });
  }

  function deletePhase(idx) {
    setPhases(ps => ps.filter((_, i) => i !== idx));
    if (expanded === idx) setExpanded(null);
  }

  function addPhase() {
    const newPhase = { key: `phase_${Date.now()}`, label: 'New Phase', color: 'slate', deliverables: [], _id: Date.now() };
    setPhases(ps => [...ps, newPhase]);
    setExpanded(phases.length);
  }

  function resetToDefaults() {
    setSync({ ...DEFAULT_MIGRATION_CONFIG.sync });
    setPhases(DEFAULT_MIGRATION_CONFIG.phases.map((p, i) => ({ ...p, _id: i })));
    setExpanded(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const value = {
        sync,
        phases: phases.map(({ _id, ...p }) => ({
          ...p,
          deliverables: typeof p.deliverables === 'string'
            ? p.deliverables.split('\n').map(s => s.trim()).filter(Boolean)
            : (p.deliverables ?? []),
        })),
      };
      await ssCtx.setSetting('migration_config', value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (ssCtx.loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Migration Configuration</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure SAP Activate phases and sync behavior for new migration projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetToDefaults}
            className="px-3 py-1.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Reset to defaults
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60">
            {saved ? <><Check size={14} /> Saved</> : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Sync Behavior */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Sync Behavior</h4>
        <div className="space-y-4">
          {SYNC_ROWS.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{row.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{row.hint}</div>
              </div>
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                {row.options.map(opt => (
                  <button key={opt.v}
                    onClick={() => setSync(s => ({ ...s, [row.key]: opt.v }))}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      sync[row.key] === opt.v
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phases */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Phases</h4>
        <div className="space-y-2">
          {phases.map((phase, idx) => {
            const delivCount = Array.isArray(phase.deliverables)
              ? phase.deliverables.length
              : (phase.deliverables ?? '').split('\n').filter(s => s.trim()).length;
            const isOpen = expanded === idx;
            return (
              <div key={phase._id ?? idx} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-750">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${COLOR_DOT[phase.color] ?? 'bg-slate-400'}`} />
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{phase.label || phase.key}</span>
                  <span className="text-xs text-gray-400">{delivCount} deliverable{delivCount !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => movePhase(idx, -1)} disabled={idx === 0}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30">
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={() => movePhase(idx, 1)} disabled={idx === phases.length - 1}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30">
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => toggleExpand(idx)}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => deletePhase(idx)}
                      className="p-1 rounded text-red-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-4 py-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Label</label>
                        <input
                          value={phase.label}
                          onChange={e => updatePhase(idx, 'label', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Key</label>
                        <input
                          value={phase.key}
                          onChange={e => updatePhase(idx, 'key', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Color</label>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(COLOR_DOT).map(([name, cls]) => (
                          <button key={name} onClick={() => updatePhase(idx, 'color', name)}
                            className={`w-6 h-6 rounded-full ${cls} transition-transform ${phase.color === name ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-105'}`}
                            title={name}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Deliverables (one per line)</label>
                      <textarea
                        rows={5}
                        value={Array.isArray(phase.deliverables) ? phase.deliverables.join('\n') : (phase.deliverables ?? '')}
                        onChange={e => updatePhase(idx, 'deliverables', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={addPhase}
          className="mt-3 flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors w-full justify-center">
          <Plus size={14} /> Add Phase
        </button>
      </div>
    </div>
  );
}

function SettingsWorkflowTab({ auth, ssCtx }) {
  const [wTab, setWTab] = useState("lifecycle");
  const WTABS = [
    { id: "lifecycle", label: "Lifecycle Templates", Icon: TrendingUp },
    { id: "defaults",  label: "Defaults",            Icon: Settings },
    { id: "gates",     label: "Transition Gates",    Icon: Lock },
    { id: "phases",    label: "Activity Phases",     Icon: ListChecks },
    { id: "sla",       label: "SLA",                 Icon: Shield },
    { id: "migration", label: "Migration",            Icon: Rocket },
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
      {wTab === "lifecycle"  && <LifecycleSettingsView auth={auth} />}
      {wTab === "defaults"   && <SettingsDefaultLifecycleTab ssCtx={ssCtx} />}
      {wTab === "gates"      && <TransitionGatesPanel auth={auth} />}
      {wTab === "phases"     && <SettingsPhasesTab ssCtx={ssCtx} />}
      {wTab === "sla"        && <SlaClientView auth={auth} />}
      {wTab === "migration"  && <SettingsMigrationTab ssCtx={ssCtx} />}
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
    <div className="mt-6 border border-blue-500/20 rounded-xl p-4 bg-blue-500/10">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-blue-400" />
        <span className="text-sm font-semibold text-white">Auto-approve domains</span>
      </div>
      <p className="text-xs text-white/50 mb-3">
        Users who sign up with an email from these domains are approved instantly, skipping the manual queue — regardless of their role's flow setting.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {domains.length === 0 && <span className="text-xs text-white/30 italic">No domains configured</span>}
        {domains.map(d => (
          <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-300">
            @{d}
            <button onClick={() => removeDomain(d)} className="text-blue-400/70 hover:text-red-400 transition-colors">
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
          className="border border-white/15 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-white placeholder-white/25"
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

// ── Invitations settings tab ───────────────────────────────────
function SettingsInvitationsTab({ ssCtx }) {
  const { settings, setSetting } = ssCtx;
  const stored = settings["invitation_config"] ?? {};
  const EMPTY  = { delivery: "clipboard", subject: "", intro: "" };
  const [form, setForm]   = useState({ ...EMPTY, ...stored });
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const hasSmtp = !!(settings["smtp_config"]?.host);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    await setSetting("invitation_config", form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Delivery mode toggle */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Delivery method</p>
        <div className="flex gap-2">
          {[["clipboard", "Clipboard only", "Consultant copies & pastes the link manually"],
            ["email",     "Auto-email",     "Platform emails the client automatically when invite is sent"]
          ].map(([val, label, desc]) => (
            <button key={val}
              onClick={() => setForm(p => ({ ...p, delivery: val }))}
              className={`flex-1 text-left rounded-xl border-2 px-3 py-2.5 transition-all ${form.delivery === val ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
              <p className={`text-xs font-semibold ${form.delivery === val ? "text-blue-700" : "text-gray-700"}`}>{label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {form.delivery === "email" && !hasSmtp && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">Configure <span className="font-semibold">Email / SMTP</span> settings above first — email delivery requires a working SMTP connection.</p>
        </div>
      )}

      {form.delivery === "email" && hasSmtp && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <BadgeCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-700">SMTP is configured. Invitation emails will be sent from <span className="font-medium">{settings["smtp_config"].from_email}</span>.</p>
        </div>
      )}

      {/* Customise email */}
      {form.delivery === "email" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email subject <span className="text-gray-400 font-normal">(leave blank for default)</span></label>
            <input type="text" value={form.subject} onChange={f("subject")}
              placeholder="You've been invited to collaborate on a case"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Intro paragraph <span className="text-gray-400 font-normal">(optional — shown above the join button)</span></label>
            <textarea value={form.intro} onChange={f("intro")} rows={3}
              placeholder="Your consultant has invited you to review your case. Click the button below to create your account and get started."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
          {saved ? "Saved!" : saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Platform tab — Platform + Invoice + Trust stacked ─────────
function SettingsPlatformCombinedTab({ ssCtx }) {
  const SECTIONS = [
    { id: "signup",       label: "Sign-up Flow",        Icon: Shield,    Component: SettingsSignupFlowTab },
    { id: "smtp",         label: "Email / SMTP",        Icon: Mail,      Component: SettingsSMTPTab },
    { id: "invitations",  label: "Client Invitations",  Icon: Send,      Component: SettingsInvitationsTab },
    { id: "platform",     label: "Platform Defaults",   Icon: Sparkles,  Component: SettingsPlatformTab },
    { id: "invoice",      label: "Invoice Defaults",    Icon: Receipt,   Component: SettingsInvoiceTab },
    { id: "trust",        label: "Trust & Ratings",     Icon: BadgeCheck, Component: SettingsTrustTab },
  ];
  const [open, setOpen] = useState({ signup: true, smtp: false, invitations: false, platform: true, invoice: true, trust: true });
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

function SettingsHeadhunterTab({ ssCtx }) {
  const raw = ssCtx.settings["headhunter_settings"] ?? {};
  const cfg = {
    see_all_public_cases:   raw.see_all_public_cases   ?? false,
    see_resource_needs:     raw.see_resource_needs     ?? true,
    apply_to_unassigned:    raw.apply_to_unassigned    ?? true,
    default_commission_pct: raw.default_commission_pct ?? 15,
  };

  function toggle(key) {
    ssCtx.setSetting("headhunter_settings", { ...cfg, [key]: !cfg[key] });
  }
  function setNum(key, val) {
    ssCtx.setSetting("headhunter_settings", { ...cfg, [key]: parseFloat(val) || 0 });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Headhunter Permissions</h2>
        <p className="text-sm text-gray-500">Control what headhunters can see and do in the Arena.</p>
      </div>

      <div className="space-y-3">
        {[
          { key: "see_all_public_cases",   label: "See all public cases",   desc: "Headhunters can browse every public case, not just HH-managed or resource-need ones." },
          { key: "see_resource_needs",     label: "See resource-need cases", desc: "Headhunters can view and propose for cases typed as Resource Need." },
          { key: "apply_to_unassigned",    label: "Apply to unassigned HH cases", desc: "Headhunters can submit proposals for public HH-managed cases that have no headhunter assigned yet." },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <button
              onClick={() => toggle(key)}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${cfg[key] ? "bg-violet-600" : "bg-gray-300"}`}
              role="switch" aria-checked={cfg[key]}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg[key] ? "translate-x-5" : ""}`} />
            </button>
            <div>
              <div className="text-sm font-semibold text-gray-800">{label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <label className="text-sm font-semibold text-gray-800 block mb-1">Default commission %</label>
        <p className="text-xs text-gray-500 mb-3">Pre-filled commission percentage when a headhunter submits a proposal.</p>
        <input
          type="number" min="0" max="100" step="0.5"
          value={cfg.default_commission_pct}
          onChange={e => setNum("default_commission_pct", e.target.value)}
          className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>
    </div>
  );
}

function SettingsAreaLeadersTab({ ssCtx }) {
  const catalogSettings = ssCtx?.settings ?? {};
  const availableAreas = catalogSettings["catalog_sap_areas"] ?? SAP_AREAS;

  const [leaders, setLeaders]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null); // { user_id, full_name, areas: [] }
  const [addArea, setAddArea]     = useState("");
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);

  useEffect(() => { loadLeaders(); }, []);

  async function loadLeaders() {
    setLoading(true);
    const [{ data: users }, { data: areaRows }] = await Promise.all([
      supabase.from("users").select("id, full_name, email").eq("role", "area_leader").order("full_name"),
      supabase.from("area_leader_areas").select("user_id, area_sap"),
    ]);
    const areaMap = {};
    (areaRows ?? []).forEach(r => {
      if (!areaMap[r.user_id]) areaMap[r.user_id] = [];
      areaMap[r.user_id].push(r.area_sap);
    });
    setLeaders((users ?? []).map(u => ({ ...u, areas: areaMap[u.id] ?? [] })));
    setLoading(false);
  }

  function openEdit(leader) {
    setEditing({ ...leader, user_id: leader.id, areas: [...leader.areas] });
    setAddArea("");
  }

  async function removeArea(area) {
    if (!editing) return;
    setSaving(true);
    await supabase.from("area_leader_areas")
      .delete()
      .eq("user_id", editing.user_id)
      .eq("area_sap", area);
    setEditing(p => ({ ...p, areas: p.areas.filter(a => a !== area) }));
    setLeaders(p => p.map(l => l.id === editing.user_id ? { ...l, areas: l.areas.filter(a => a !== area) } : l));
    setSaving(false);
  }

  async function addAreaToLeader() {
    if (!editing || !addArea) return;
    if (editing.areas.includes(addArea)) { setAddArea(""); return; }
    setSaving(true);
    await supabase.from("area_leader_areas").insert({ user_id: editing.user_id, area_sap: addArea });
    const newAreas = [...editing.areas, addArea];
    setEditing(p => ({ ...p, areas: newAreas }));
    setLeaders(p => p.map(l => l.id === editing.user_id ? { ...l, areas: newAreas } : l));
    setAddArea("");
    setSaving(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Area Leaders</h2>
        <p className="text-sm text-gray-500">Assign SAP module areas to each area leader. Leaders are auto-assigned to cases in their modules.</p>
      </div>

      {leaders.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-2xl border border-gray-100">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No area leaders yet. Create users with the <strong>Area Leader</strong> role first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaders.map(leader => (
            <div key={leader.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 font-bold text-sm">{leader.full_name?.[0]?.toUpperCase() ?? "?"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{leader.full_name}</div>
                <div className="text-xs text-gray-400 mb-2">{leader.email}</div>
                <div className="flex flex-wrap gap-1.5">
                  {leader.areas.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No areas assigned</span>
                  )}
                  {leader.areas.map(area => (
                    <span key={area} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-lg border border-indigo-100">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => openEdit(leader)}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                Manage Areas
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{editing.full_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">SAP area assignments</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>

            <div className="space-y-2">
              {editing.areas.length === 0 && <p className="text-sm text-gray-400 italic">No areas assigned yet.</p>}
              {editing.areas.map(area => (
                <div key={area} className="flex items-center justify-between px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
                  <span className="text-sm text-indigo-800">{area}</span>
                  <button onClick={() => removeArea(area)} disabled={saving}
                    className="p-1 rounded hover:bg-indigo-100 text-indigo-400 hover:text-red-500 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 flex gap-2">
              <select value={addArea} onChange={e => setAddArea(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— select area —</option>
                {availableAreas.filter(a => !editing.areas.includes(a)).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button onClick={addAreaToLeader} disabled={saving || !addArea}
                className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemSettingsView({ auth, onNavigate }) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState("people");
  const ssCtx = useSystemSettings();

  const TABS = [
    { id: "people",      label: "People",          Icon: Users },
    { id: "roles",       label: "Roles & Perms",   Icon: Shield },
    { id: "plans",       label: "Plans",           Icon: CreditCard },
    { id: "pricing",     label: "Pricing",         Icon: DollarSign },
    { id: "workflow",    label: "Workflow",         Icon: TrendingUp },
    { id: "catalog",     label: "Catalog",          Icon: Tag },
    { id: "generation",  label: "AI & Generation",  Icon: Zap },
    { id: "abap",        label: "ABAP Templates",   Icon: FileCode2 },
    { id: "area_leaders", label: "Area Leaders",     Icon: UserCog },
    { id: "headhunter",  label: "Headhunter",       Icon: Crosshair },
    { id: "platform",    label: "Platform",         Icon: Sparkles },
    { id: "audit",       label: "Audit Events",     Icon: ClipboardList },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
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

      {activeTab === "people"      && <SettingsPeopleTab ssCtx={ssCtx} auth={auth} onNavigate={onNavigate} />}
      {activeTab === "roles"       && <SettingsRolesTab ssCtx={ssCtx} />}
      {activeTab === "plans"       && <SettingsPlansTab ssCtx={ssCtx} auth={auth} />}
      {activeTab === "pricing"     && <SettingsPricingTab ssCtx={ssCtx} auth={auth} />}
      {activeTab === "workflow"    && <SettingsWorkflowTab auth={auth} ssCtx={ssCtx} />}
      {activeTab === "catalog"     && <SettingsCatalogTab ssCtx={ssCtx} />}
      {activeTab === "generation"  && <SettingsGenerationTab ssCtx={ssCtx} />}
      {activeTab === "abap"        && <AbapTemplatesSection auth={auth} />}
      {activeTab === "area_leaders" && <SettingsAreaLeadersTab ssCtx={ssCtx} />}
      {activeTab === "headhunter"  && <SettingsHeadhunterTab ssCtx={ssCtx} />}
      {activeTab === "platform"    && <SettingsPlatformCombinedTab ssCtx={ssCtx} />}
      {activeTab === "audit"       && <SettingsAuditTab ssCtx={ssCtx} />}
    </div>
  );
}

const AUDIT_EVENT_GROUPS = [
  {
    label: "Case Events",
    events: [
      { key: "case.created",             label: "Case created" },
      { key: "case.status_changed",       label: "Status changed" },
      { key: "case.cancelled",            label: "Case cancelled" },
      { key: "case.status_bulk_changed",  label: "Bulk status change" },
      { key: "case.deleted_bulk",         label: "Bulk deleted" },
      { key: "case.rated",                label: "Case rated" },
      { key: "rating.submitted",          label: "Rating submitted" },
      { key: "case.reopened",             label: "Case reopened" },
    ],
  },
  {
    label: "Work Events",
    events: [
      { key: "spec.generated",    label: "Spec generated" },
      { key: "spec.approved",     label: "Spec approved" },
      { key: "devplan.confirmed", label: "Dev plan confirmed" },
      { key: "time.logged",       label: "Time logged" },
      { key: "invoice.created",   label: "Invoice created" },
    ],
  },
  {
    label: "Platform Events",
    events: [
      { key: "project.created",      label: "Project created" },
      { key: "template.created",     label: "Template created" },
      { key: "user.signed_up",       label: "User signed up" },
      { key: "user.approved",        label: "User approved" },
      { key: "user.approved_bulk",   label: "User approved (bulk)" },
      { key: "user.rejected",        label: "User rejected" },
      { key: "user.rejected_bulk",   label: "User rejected (bulk)" },
      { key: "vouch.submitted",      label: "Vouch submitted" },
    ],
  },
];

function SettingsAuditTab({ ssCtx }) {
  const { settings, setSetting } = ssCtx;
  const cfg = settings["audit_log_config"] ?? {};
  const disabled = new Set(cfg.disabled ?? []);
  const [local, setLocal] = useState(() => new Set(cfg.disabled ?? []));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const allKeys = AUDIT_EVENT_GROUPS.flatMap(g => g.events.map(e => e.key));
  const allEnabled = local.size === 0;
  const allDisabled = local.size === allKeys.length;

  function toggle(key) {
    setLocal(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setSaved(false);
  }

  function toggleAll(enable) {
    setLocal(enable ? new Set() : new Set(allKeys));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await setSetting("audit_log_config", { disabled: [...local] });
    clearAuditConfigCache();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Audit Event Configuration</h2>
        <p className="text-sm text-gray-500 mt-0.5">Choose which events are recorded in the audit log. Disabled events will not be stored.</p>
      </div>

      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <button onClick={() => toggleAll(true)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50">
          Enable all
        </button>
        <button onClick={() => toggleAll(false)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
          Disable all
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          {allKeys.length - local.size} / {allKeys.length} events enabled
        </span>
      </div>

      {AUDIT_EVENT_GROUPS.map(group => (
        <div key={group.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {group.events.map(ev => {
              const enabled = !local.has(ev.key);
              return (
                <label key={ev.key} className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{ev.label}</p>
                    <p className="text-xs text-gray-400 font-mono">{ev.key}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(ev.key)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? "bg-blue-600" : "bg-gray-200"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><Check size={14} /> Saved</span>}
      </div>
    </div>
  );
}

export { UpgradeModal, SettingsUsersTab, SettingsPhasesTab, SettingsCatalogTab, SettingsPlatformTab, SettingsRolesTab, SettingsGenerationTab, UserApprovalQueue, ApprovalHistory, ClientRatingModal, RatingModal, AUDIT_EVENT_COLORS, AUDIT_EVENT_LABELS, AUDIT_ENTITY_ICONS, auditNavTarget, auditRenderDetail, AuditEntityPanel, AuditLogDashboard, SettingsTrustTab, SettingsInvoiceTab, SettingsPeopleTab, SettingsPlansTab, SettingsPricingTab, SettingsWorkflowTab, SettingsSignupFlowTab, AutoApproveDomainsSection, SettingsSMTPTab, SettingsPlatformCombinedTab, SystemSettingsView };
