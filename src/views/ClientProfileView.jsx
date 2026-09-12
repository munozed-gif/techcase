import { useState, useEffect, useRef } from "react";
import {
  Activity, Building2, Camera, Check, CheckCircle2, ChevronLeft,
  ChevronRight, ClipboardList, Clock, Code2, CreditCard, Database,
  DollarSign, Eye, FileText, Globe, Layers, Link, Loader2, Lock, Mail,
  Pencil, Phone, Settings, SlidersHorizontal, Trash2, TrendingUp, User,
  UserCheck, Users, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useClientTeamMembers, useDbConnections, useProjects, useSlaConfig } from "../hooks/useCoreHooks.js";
import { useCases } from "../hooks/useCaseHooks.js";
import { usePlanConfig, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { logEvent, notify } from "../lib/utils.js";
import { Badge, Spinner, TrustBadge } from "../components/ProfileComponents.jsx";
import { EmptyState, Input, Modal, Textarea } from "../components/ui.jsx";
import { AbapStandardsPanel, ProjectSapEnvPanel, SapIntegrationPanel, useClientProfile } from "../components/SapPanels.jsx";
import { DbConnectionsList, SapProfileFields, SapProfileBadges } from "../views/OperationsViews.jsx";
import { ROLE_LABEL_KEYS, SLA_DEFAULT_TYPES, cap, fmt, fmtDate, makeDefaultMatrix } from "../lib/uiUtils.jsx";
import { DEFAULT_ACTIVITY_PHASES, ROLE_COLORS, STATUS_COLORS } from "../lib/businessConstants.js";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";

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

export { ClientProfileView };
