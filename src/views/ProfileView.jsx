import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import {
  Briefcase, Camera, Check, ChevronLeft, ChevronRight, DollarSign, Globe,
  GraduationCap, Mail, Pencil, Plane, Plus, Star, Trash2, UserMinus, Users, X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useConsultantProfile } from "../hooks/useProfileHooks.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { logEvent, callClaude } from "../lib/utils.js";
import {
  Badge, Spinner, ResumeImporter, ConsultantProjectsHierarchy,
  TrustBadge, TierProgressBar, VouchingPanel, PlanUsageCard,
  ProfileCompleteWizard, ProfileOnboardingScreen,
} from "../components/ProfileComponents.jsx";
import { ConsultantProfileView } from "../components/ConsultantProfileView.jsx";
import { Input, Select, Textarea } from "../components/ui.jsx";
import { fmtDate, fmt, AVAIL_LABEL_KEYS, EXPERTISE_LABEL_KEYS, WORK_MODE_LABEL_KEYS } from "../lib/uiUtils.jsx";
import { ROLE_COLORS, SAP_AREAS, INDUSTRY_AREAS } from "../lib/businessConstants.js";
import { useRatings } from "../hooks/useCaseHooks.js";
import { useConsultantTeams } from "../hooks/useTeamHooks.js";

function ProfileView({ auth, compact = false }) {
  const { t, lang, setLang } = useT();
  // Extract the real consultant_profiles id from auth (useAuth already fetched it via FK join)
  const cpRaw = auth.profile?.consultant_profiles;
  const realProfileId = Array.isArray(cpRaw) ? cpRaw[0]?.id : cpRaw?.id;
  const { profile, availability, loading, profileError, updateProfile, uploadPhoto, addCustomer, updateCustomer, deleteCustomer, addProject, updateProject, deleteProject, addWorkAuth } =
    useConsultantProfile(auth.user?.id, realProfileId);
  const { ratings, avgRating } = useRatings(auth.user?.id);
  const { teams, pendingInvites, createTeam, inviteMember, respondToInvite, removeMember, leaveTeam, deleteTeam } = useConsultantTeams(auth.user?.id);
  const [teamForm, setTeamForm] = useState({ name: "", desc: "" });
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
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
  const { isDark, theme, setTheme, previewTheme } = useTheme();
  const themeOnEditStart = useRef(theme);

  // Capture the committed theme whenever editing opens
  useEffect(() => {
    if (editing) themeOnEditStart.current = theme;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Live-preview: updates React state + DOM class — no persistence
  function previewAppearance(t) {
    previewTheme(t);
  }

  // Cancel editing — revert any unpersisted theme preview
  function cancelEdit() {
    if (theme !== themeOnEditStart.current) previewTheme(themeOnEditStart.current);
    setEditing(false);
  }

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
      // Persist theme only now (was just a preview until save)
      if (theme !== themeOnEditStart.current) await setTheme(theme);
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
    { id: "teams",      label: "Teams",                     icon: Users,          count: teams.length > 0 ? teams.length : null },
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
      <div className="rounded-2xl shadow-sm p-6 mb-6" style={{background:'var(--t-card-bg)',border:'1px solid var(--t-border)'}}>
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
            <h1 className="text-xl font-bold" style={{color:'var(--t-text)'}}>{auth.profile?.full_name}</h1>
            <p className="text-sm" style={{color:'var(--t-text2)'}}>{profile?.headline || t("profile.headline_ph")}</p>
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
          <button onClick={() => editing ? cancelEdit() : setEditing(true)}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
            style={{border:'1px solid var(--t-border)',color:'var(--t-text)',background:'var(--t-tab-inactive)'}}>
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
          <button onClick={() => editing ? cancelEdit() : setEditing(true)}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
            style={{border:'1px solid var(--t-border)',color:'var(--t-text)',background:'var(--t-tab-inactive)'}}>
            {editing ? t("profile.cancel") : t("profile.edit")}
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="rounded-2xl shadow-sm p-6 mb-6" style={{background:'var(--t-card-bg)',border:'1px solid var(--t-border)'}}>
          <h3 className="font-semibold mb-4" style={{color:'var(--t-text)'}}>{t("profile.edit")}</h3>
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

          {/* Appearance */}
          <div className="mb-4">
            <div className="text-sm font-medium mb-2" style={{color:'var(--t-text2)'}}>Appearance</div>
            <div className="flex gap-2">
              <button onClick={() => previewAppearance("dark")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${isDark ? "bg-blue-600 border-blue-600 text-white" : "border-gray-200 text-gray-600 hover:border-blue-400"}`}
                style={isDark ? {} : {background:'var(--t-card-bg)'}}>
                🌙 Dark
              </button>
              <button onClick={() => previewAppearance("light")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${!isDark ? "bg-blue-600 border-blue-600 text-white" : "border-gray-200 text-gray-600 hover:border-blue-400"}`}
                style={!isDark ? {} : {background:'var(--t-card-bg)'}}>
                ☀️ Light
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
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
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'var(--t-text2)'}}/>
              </button>
            )}
            {carouselIdx < tabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid var(--t-arrow-border)', background:'var(--t-arrow-bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'var(--t-text2)'}}/>
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
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'var(--t-border-active)':'var(--t-border)'}`, background:'var(--t-card-bg)', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--t-tab-border)', background:isActive?'var(--t-tab-active)':'var(--t-tab-inactive)', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'var(--t-border-active)',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'var(--t-text-accent)':'var(--t-text2)',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'var(--t-text)':'var(--t-text2)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'var(--t-badge-act-bg)':'var(--t-badge-inact-bg)',color:isActive?'var(--t-badge-act-color)':'var(--t-badge-inact-color)',flexShrink:0}}>{tab.count}</span>}
                        {isActive && (
                          <button onClick={e => { e.stopPropagation(); setPvManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'var(--t-done-border)':'var(--t-pill-inactive-bdr)'}`,background:st==="complete"?'var(--t-done-bg)':'var(--t-tab-inactive)',color:st==="complete"?'var(--t-done-color)':'var(--t-text2)',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
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

          {/* ── Teams ── */}
          {tab.id === "teams" && (
            <div className="space-y-5">

              {/* Pending invitations */}
              {pendingInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pending Invitations</p>
                  {pendingInvites.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 border border-amber-200 bg-amber-50 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{inv.team?.name}</p>
                        {inv.team?.owner?.full_name && (
                          <p className="text-xs text-gray-500">from {inv.team.owner.full_name}</p>
                        )}
                      </div>
                      <button onClick={() => respondToInvite(inv.id, true)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg">
                        Accept
                      </button>
                      <button onClick={() => respondToInvite(inv.id, false)}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                        Decline
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* My teams list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Teams</p>
                  <button onClick={() => setShowCreateTeam(p => !p)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg">
                    <Plus size={12} /> New Team
                  </button>
                </div>

                {/* Create team form */}
                {showCreateTeam && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-3 space-y-3">
                    <p className="text-sm font-semibold text-indigo-800">Create a new team</p>
                    <input
                      placeholder="Team name *"
                      value={teamForm.name}
                      onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      placeholder="Short description (optional)"
                      value={teamForm.desc}
                      onChange={e => setTeamForm(p => ({ ...p, desc: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowCreateTeam(false); setTeamForm({ name: "", desc: "" }); }}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                      <button disabled={!teamForm.name.trim() || creatingTeam}
                        onClick={async () => {
                          setCreatingTeam(true);
                          try {
                            await createTeam(teamForm.name, teamForm.desc, auth.user?.email ?? "");
                            setShowCreateTeam(false);
                            setTeamForm({ name: "", desc: "" });
                          } catch (e) { alert(e.message); }
                          setCreatingTeam(false);
                        }}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                        {creatingTeam ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </div>
                )}

                {teams.length === 0 && !showCreateTeam && (
                  <p className="text-sm text-gray-400">No teams yet. Create one to apply to cases as a group.</p>
                )}

                <div className="space-y-3">
                  {teams.map(team => {
                    const isOwner = team.members?.some(m => m.user_id === auth.user?.id && m.role === "owner");
                    const accepted = (team.members ?? []).filter(m => m.status === "accepted");
                    const pending  = (team.members ?? []).filter(m => m.status === "pending");
                    const isExpanded = expandedTeam === team.id;
                    return (
                      <div key={team.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        {/* Team header */}
                        <div className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                          onClick={() => setExpandedTeam(isExpanded ? null : team.id)}>
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {team.name[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{team.name}</p>
                            {team.description && <p className="text-xs text-gray-400 truncate">{team.description}</p>}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">{accepted.length} member{accepted.length !== 1 ? 's' : ''}</span>
                          {isOwner && <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full flex-shrink-0">Owner</span>}
                        </div>

                        {/* Expanded: members + invite */}
                        {isExpanded && (
                          <div className="p-3 space-y-3 border-t border-gray-100">
                            {/* Member list */}
                            <div className="space-y-2">
                              {accepted.map(m => (
                                <div key={m.id} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                                    {(m.member?.full_name ?? m.email)[0].toUpperCase()}
                                  </div>
                                  <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">
                                    {m.member?.full_name ?? m.email}
                                    {m.role === "owner" && <span className="ml-1 text-indigo-500">(owner)</span>}
                                  </span>
                                  {isOwner && m.user_id !== auth.user?.id && (
                                    <button onClick={() => removeMember(m.id)}
                                      className="text-red-400 hover:text-red-600 flex-shrink-0"><UserMinus size={13} /></button>
                                  )}
                                </div>
                              ))}
                              {pending.map(m => (
                                <div key={m.id} className="flex items-center gap-2 opacity-60">
                                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                                    {m.email[0].toUpperCase()}
                                  </div>
                                  <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">{m.email}</span>
                                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Pending</span>
                                  {isOwner && (
                                    <button onClick={() => removeMember(m.id)}
                                      className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={12} /></button>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Invite by email */}
                            {isOwner && (
                              <div className="border-t border-gray-100 pt-3">
                                <p className="text-xs font-medium text-gray-500 mb-2">Invite by email</p>
                                <div className="flex gap-2">
                                  <input
                                    type="email"
                                    placeholder="colleague@email.com"
                                    value={inviteEmail}
                                    onChange={e => { setInviteEmail(e.target.value); setInviteError(""); }}
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                  <button disabled={!inviteEmail.trim() || inviting}
                                    onClick={async () => {
                                      setInviting(true);
                                      setInviteError("");
                                      try {
                                        await inviteMember(team.id, team.name, inviteEmail);
                                        setInviteEmail("");
                                      } catch (e) { setInviteError(e.message); }
                                      setInviting(false);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                    <Mail size={11} /> {inviting ? "…" : "Invite"}
                                  </button>
                                </div>
                                {inviteError && <p className="text-xs text-red-500 mt-1">{inviteError}</p>}
                                <p className="text-[10px] text-gray-400 mt-1">
                                  If they're not on the platform yet, they'll see the invitation when they sign up.
                                </p>
                              </div>
                            )}

                            {/* Leave / Delete */}
                            <div className="flex gap-2 border-t border-gray-100 pt-3">
                              {!isOwner && (
                                <button onClick={() => leaveTeam(team.id)}
                                  className="text-xs text-red-500 hover:text-red-700 underline">Leave team</button>
                              )}
                              {isOwner && (
                                <button onClick={() => { if (window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) deleteTeam(team.id); }}
                                  className="text-xs text-red-500 hover:text-red-700 underline">Delete team</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            <div style={{ marginTop:10, background:'var(--t-pill-bar)', borderRadius:12, border:'1px solid var(--t-border)', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {tabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === profileTab;
                const st = pvTabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'var(--t-pill-act-border)':st==="complete"?'var(--t-done-border)':'var(--t-border)'}`, background:isActive?'var(--t-pill-act-bg)':st==="complete"?'var(--t-done-bg)':'var(--t-pill-inactive-bg)', color:isActive?'var(--t-pill-act-color)':st==="complete"?'var(--t-done-color)':'var(--t-text2)', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
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

export { ProfileView };
