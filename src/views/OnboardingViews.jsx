import { useState, useEffect } from "react";
import {
  Briefcase, Building2, Check, FileText, Globe, Phone, Rocket, Settings,
  SlidersHorizontal, User, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { logEvent } from "../lib/utils.js";
import { Badge, Spinner, ProfileCompleteWizard } from "../components/ProfileComponents.jsx";
import { Input, Select } from "../components/ui.jsx";
import { fmtDate } from "../lib/uiUtils.jsx";
import { ROLE_COLORS, SAP_AREAS, INDUSTRY_AREAS, PROJECT_TYPES } from "../lib/businessConstants.js";

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

export { ONBOARDING_STEPS, OnboardingRoadmap, ConsultantOnboardingView, ONBOARDING_STEPS_CLIENT, ClientOnboardingView, ManagerAdminWelcomeView };
