import { useState } from "react";
import {
  BadgeCheck, Briefcase, Building2, Check, Crosshair, FolderKanban,
  Globe, Loader2, Mail, Send, Shield, UserCheck, UserCog,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { usePlatformBranding, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { Input } from "../components/ui.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { ROLE_PERMISSIONS_DEFAULTS } from "../lib/constants.js";
import { NovaLandingMark } from "./LandingView.jsx";

// AuthScreen — sign-in, sign-up wizard, password reset

function AuthScreen({ onAuth, onBack }) {
  const { t } = useT();
  const branding = usePlatformBranding();
  const [mode, setMode]         = useState("signin");
  // Sign-in fields
  const [siEmail, setSiEmail]   = useState("");
  const [siPass,  setSiPass]    = useState("");
  // Sign-up wizard
  const [step, setStep]         = useState(0);
  const [email, setEmail]       = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode]         = useState("");
  const [role, setRole]         = useState("");
  const [name, setName]         = useState("");
  const [password, setPass]     = useState("");
  const [confirmPass, setConf]  = useState("");
  // Consultant-specific
  const [headline, setHeadline]       = useState("");
  const [skills, setSkills]           = useState("");
  const [yearsExp, setYearsExp]       = useState("");
  const [hourlyRate, setHourly]       = useState("");
  const [expertiseLevel, setExpertise]= useState("mid");
  // Client-specific
  const [companyName, setCompany]     = useState("");
  const [industry, setIndustry]       = useState("");
  // Key-user detection (set after email lookup)
  const [keyUserCompany, setKeyUserCompany] = useState(null);
  // Final-user detection (set after email lookup)
  const [finalUserClient, setFinalUserClient] = useState(null); // { clientId, companyName } | null
  // Internal consultant / project manager detection (set after email lookup)
  const [internalConsultantClient, setInternalConsultantClient] = useState(null); // { clientId, companyName } | null
  const [projectManagerClient, setProjectManagerClient] = useState(null);         // { clientId, companyName } | null
  const [otpVerified, setOtpVerified]   = useState(false);
  const [approvalDone, setApprovalDone] = useState(false); // admin_approval success screen

  const [error, setError]           = useState("");
  const [emailTaken, setEmailTaken]   = useState(false);
  const [magicSent, setMagicSent]     = useState(false);
  const [magicLoad, setMagicLoad]     = useState(false);
  const [magicCode, setMagicCode]     = useState("");
  const [magicVerifying, setMagicVerifying] = useState(false);
  const [loading, setLoad]          = useState(false);
  const auth = useAuth();
  const { settings: ssSettings } = useSystemSettings();
  const rolePermMatrix = ssSettings["role_permissions"] ?? {};
  function requiresTeamFor(r) {
    const defaults = ROLE_PERMISSIONS_DEFAULTS["require_team_signup"] ?? {};
    const stored   = rolePermMatrix["require_team_signup"] ?? {};
    return ({ ...defaults, ...stored })[r] === true;
  }
  function getRoleFlow(r) {
    const perRole = ssSettings["signup_flow_per_role"] ?? {};
    return perRole[r] ?? "email_verify";
  }

  // Dynamic progress steps based on whether OTP is needed for selected role
  const roleFlow = role ? getRoleFlow(role) : "email_verify";
  const needsOTP = roleFlow !== "admin_approval";
  const SIGNUP_STEPS = needsOTP
    ? [{ id: "setup", label: "Setup" }, { id: "verify", label: "Verify" }, { id: "profile", label: "Profile" }]
    : [{ id: "setup", label: "Setup" }, { id: "profile", label: "Profile" }];
  const displayStep = needsOTP ? step : (step === 2 ? 1 : 0);

  function switchMode(m) {
    setMode(m); setError(""); setEmailTaken(false); setMagicSent(false); setStep(0);
    setCodeSent(false); setCode(""); setRole(""); setOtpVerified(false); setApprovalDone(false);
  }

  async function sendMagicLink() {
    setMagicLoad(true);
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setMagicLoad(false);
    if (err) { setError(err.message); return; }
    setMagicSent(true); setMagicCode("");
  }

  async function verifyMagicCode() {
    if (magicCode.length < 4) return;
    setMagicVerifying(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(), token: magicCode.trim(), type: "email",
    });
    setMagicVerifying(false);
    if (err) { setError(err.message); return; }
    // Session is now active — App gate will route to profile completion screen
    onAuth(null);
  }

  // ── Sign in ──────────────────────────────────────────────────
  async function handleSignIn() {
    setError(""); setLoad(true);
    try { await auth.signIn(siEmail, siPass); onAuth(null); }
    catch (e) { setError(e.message); }
    setLoad(false);
  }

  // ── Look up pre-registered key/final user by email ────────────
  // Uses a SECURITY DEFINER RPC to bypass RLS (safe for unauthenticated callers)
  async function checkEmailPreReg(em) {
    const { data } = await supabase.rpc("check_team_registration", { email_to_check: em.trim() });
    if (!data) {
      setKeyUserCompany(null); setFinalUserClient(null);
      setInternalConsultantClient(null); setProjectManagerClient(null);
      return;
    }
    setKeyUserCompany(data.key_user_company ?? null);
    setFinalUserClient(data.final_user_client_id
      ? { clientId: data.final_user_client_id, companyName: data.final_user_company ?? "a company" }
      : null);
    setInternalConsultantClient(data.internal_consultant_client_id
      ? { clientId: data.internal_consultant_client_id, companyName: data.internal_consultant_company ?? "a company" }
      : null);
    setProjectManagerClient(data.project_manager_client_id
      ? { clientId: data.project_manager_client_id, companyName: data.project_manager_company ?? "a company" }
      : null);
    if (data.member_name) setName(data.member_name);
  }

  // ── Step 0: role chosen → decide OTP or skip ─────────────────
  async function handleRoleSelect(r) {
    if (!email.trim()) { setError(t("auth.error_email_first")); return; }
    setError(""); setRole(r); setLoad(true);
    try {
      await checkEmailPreReg(email);
      const flow = getRoleFlow(r);
      if (flow === "admin_approval") {
        setOtpVerified(false);
        setStep(2);
      } else {
        // Send OTP then go to step 1 (Verify)
        await doSendOtp();
      }
    } catch (e) { setError(e.message); }
    setLoad(false);
  }

  // ── Step 0a: send OTP internally ─────────────────────────────
  async function doSendOtp() {
    if (!email.trim()) { setError(t("auth.error_email_first")); return; }
    setError(""); setLoad(true);
    try {
      // signUp is the correct API for new account creation.
      // A random temp password is used here; the real password is set in Step 2.
      const tempPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + "1!";
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password: tempPass,
      });
      if (err) {
        console.error("sendCode error:", err);
        // Extract a readable message — guard against Supabase returning "{}" as message
        const raw = err.message || err.error_description || err.msg || "";
        const isUseless = !raw || raw === "{}" || raw === "[object Object]";
        const msg = isUseless
          ? (err.status ? t("auth.error_status").replace("{n}", err.status) : t("auth.error_send_code"))
          : raw;
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists"))
          { setError(t("auth.error_email_taken")); setEmailTaken(true); }
        else if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many"))
          setError(t("auth.error_rate_limit"));
        else if (msg.toLowerCase().includes("signup") || msg.toLowerCase().includes("disabled"))
          setError(t("auth.error_signup_disabled"));
        else if (msg.toLowerCase().includes("smtp") || msg.toLowerCase().includes("email"))
          setError(t("auth.error_smtp"));
        else
          setError(msg);
      } else if (!data?.user || data.user.identities?.length === 0) {
        // Supabase returns an empty identities array when the email already exists
        setError(t("auth.error_email_taken")); setEmailTaken(true);
      } else {
        setCodeSent(true);
        setCode("");
        setStep(1); // move to Verify step after sending
      }
    } catch (e) {
      setError(e?.message || e?.toString() || t("auth.error_unexpected"));
    }
    setLoad(false);
  }

  async function resendOtp() {
    setError(""); setLoad(true);
    await doSendOtp();
    setLoad(false);
  }

  // ── Step 1: verify OTP ────────────────────────────────────────
  async function verifyCode() {
    if (code.length < 4) { setError(t("auth.error_verify_code")); return; }
    setError(""); setLoad(true);
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code, type: "signup",
    });
    if (err) { setError(err.message || t("auth.error_invalid_code")); setLoad(false); return; }
    const { data: existing } = await supabase
      .from("users").select("role").eq("id", data.user?.id).maybeSingle();
    if (existing?.role) { onAuth(null); return; }
    setOtpVerified(true);
    setStep(2);
    setLoad(false);
  }

  // ── Step 2: create account ────────────────────────────────────
  async function createAccount() {
    if (!name.trim()) { setError(t("auth.error_name")); return; }
    if (password.length < 6) { setError(t("auth.error_password_short")); return; }
    if (password !== confirmPass) { setError(t("auth.error_password_match")); return; }
    if (role === "consultant" && !headline.trim()) { setError(t("auth.error_headline")); return; }
    if (role === "client" && !companyName.trim()) { setError(t("auth.error_company")); return; }
    if (role === "key_user"            && requiresTeamFor("key_user")            && !keyUserCompany)                         { setError(t("auth.error_key_user"));  return; }
    if (role === "final_user"          && requiresTeamFor("final_user")          && !finalUserClient)                        { setError(t("auth.error_team_code")); return; }
    if (role === "internal_consultant" && requiresTeamFor("internal_consultant") && !finalUserClient && !keyUserCompany)     { setError(t("auth.error_team_code")); return; }
    if (role === "project_manager"     && requiresTeamFor("project_manager")     && !finalUserClient && !keyUserCompany)     { setError(t("auth.error_team_code")); return; }
    setError(""); setLoad(true);
    try {
      const flow = getRoleFlow(role);
      const autoApproveDomains = (ssSettings["auto_approve_domains"] ?? []).map(d => d.toLowerCase().trim()).filter(Boolean);
      const emailDomain = (email.trim().split("@")[1] ?? "").toLowerCase();
      const isDomainAutoApproved = autoApproveDomains.length > 0 && autoApproveDomains.includes(emailDomain);
      const verificationStatus = (isDomainAutoApproved || flow === "email_verify") ? "approved" : "pending";

      let userId, userEmail;
      if (otpVerified) {
        // OTP path: user is already authenticated, just set password
        await supabase.auth.updateUser({ password, data: { full_name: name.trim(), role } });
        const { data: { user } } = await supabase.auth.getUser();
        userId = user.id; userEmail = user.email;
      } else {
        // Admin-approval path: sign up with email+password directly
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim(), role } },
        });
        if (signUpErr) {
          const raw = signUpErr.message ?? "";
          const isUseless = !raw || raw === "{}" || raw === "[object Object]";
          setError(isUseless
            ? "Registration failed. If you are using Admin Approval mode, go to Supabase → Authentication → Providers → Email and disable \"Confirm email\"."
            : raw);
          setLoad(false); return;
        }
        if (!signUpData.user) { setError("Registration failed — please try again."); setLoad(false); return; }
        userId = signUpData.user.id; userEmail = signUpData.user.email;
        // Write the user row now even if email confirmation is still pending,
        // so the admin approval tab can see them regardless of Supabase confirmation settings.
        const earlyRow = { id: userId, email: userEmail, full_name: name.trim(), role, verification_status: verificationStatus };
        await supabase.from("users").upsert(earlyRow, { onConflict: "id" });
        if (!signUpData.session) {
          setApprovalDone(true); setLoad(false); return;
        }
      }

      const userRow = { id: userId, email: userEmail, full_name: name.trim(), role, verification_status: verificationStatus };
      await supabase.from("users").upsert(userRow, { onConflict: "id" });
      if (role === "consultant") {
        const skillsArr = skills.split(",").map(s => s.trim()).filter(Boolean);
        await supabase.from("consultant_profiles").upsert({
          id: userId, headline: headline.trim(), skills: skillsArr,
          years_experience: yearsExp ? parseInt(yearsExp, 10) : null,
          hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
          expertise_level: expertiseLevel,
        }, { onConflict: "id" });
      }
      if (role === "client") {
        await supabase.from("client_profiles").upsert({
          id: userId, company_name: companyName.trim(), industry: industry || null,
        }, { onConflict: "id" });
      }
      if (role === "key_user") {
        const { data: matchingCases } = await supabase.from("cases")
          .select("id").eq("key_user_email", userEmail);
        if (matchingCases?.length) {
          await supabase.from("case_key_users").insert(
            matchingCases.map(c => ({ case_id: c.id, user_id: userId }))
          ).onConflict("case_id,user_id").ignore();
        }
      }
      onAuth(role);
    } catch (e) { setError(e.message); }
    setLoad(false);
  }

  const logo = (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center mb-4">
        <NovaLandingMark size={176} />
      </div>
      <h1 className="text-2xl font-bold text-white">{branding.platformName}</h1>
      <p className="text-blue-400 mt-1 text-sm">{branding.tagline}</p>
    </div>
  );

  const tabs = (
    <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
      {[["signin", t("auth.sign_in_title")], ["signup", t("action.create_account")]].map(([m, label]) => (
        <button key={m} onClick={() => switchMode(m)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            mode === m ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  const errorBox = error && (
    <div className="mt-4 rounded-xl overflow-hidden border border-red-200">
      <div className="p-4 bg-red-50 text-sm text-red-700">{error}</div>
      {emailTaken && (
        magicSent ? (
          <div className="p-4 bg-blue-50 border-t border-blue-200 space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Code sent — check your inbox</p>
                <p className="text-xs text-blue-600 mt-0.5">Enter the code from the email to continue your profile setup.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={magicCode}
                onChange={e => setMagicCode(e.target.value.replace(/\D/g, ""))}
                placeholder="Code from email"
                className="flex-1 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
              <button onClick={verifyMagicCode} disabled={magicVerifying || magicCode.length < 4}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5">
                {magicVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify →"}
              </button>
            </div>
            <button onClick={sendMagicLink} disabled={magicLoad} className="w-full text-xs text-blue-500 hover:text-blue-700 transition-colors">
              {magicLoad ? "Sending…" : "Resend code"}
            </button>
          </div>
        ) : (
          <div className="p-4 bg-amber-50 border-t border-amber-200">
            <p className="text-xs text-amber-700 mb-3">Haven't set a password yet? We'll email you a one-time code so you can finish your profile setup.</p>
            <button onClick={sendMagicLink} disabled={magicLoad}
              className="w-full py-2.5 text-sm font-semibold text-blue-700 bg-white border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {magicLoad ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Mail className="w-4 h-4" />Send me a login code</>}
            </button>
          </div>
        )
      )}
    </div>
  );

  const NAV_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
    .auth-nav{position:sticky;top:0;z-index:10;height:60px;padding:0 24px;
      background:rgba(11,15,26,.95);backdrop-filter:blur(12px);
      border-bottom:1px solid rgba(255,255,255,.07);
      display:flex;align-items:center;justify-content:space-between;}
    .auth-nav-logo{display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none;}
    .auth-nav-arena{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.45rem;font-weight:800;
      color:#4F6EF7;letter-spacing:-.04em;}
    .auth-nav-rest{font-family:'Plus Jakarta Sans',sans-serif;font-size:.85rem;font-weight:600;
      color:rgba(255,255,255,.55);}
    .auth-nav-links{display:flex;align-items:center;gap:28px;}
    .auth-nav-links a{font-size:.85rem;font-weight:500;color:rgba(255,255,255,.6);text-decoration:none;}
    @media(max-width:640px){.auth-nav-links{display:none;}}
  `;

  return (
    <div style={{
      minHeight:"100vh", background:"#0B0F1A",
      backgroundImage:"radial-gradient(circle at 70% -10%,rgba(79,110,247,.22) 0%,transparent 65%),linear-gradient(rgba(79,110,247,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.07) 1px,transparent 1px)",
      backgroundSize:"100% 100%,48px 48px,48px 48px"
    }}>
      <style>{NAV_CSS}</style>

      {/* Landing nav */}
      <nav className="auth-nav">
        <button className="auth-nav-logo" onClick={onBack} style={{background:"none",border:"none",padding:0}}>
          <NovaLandingMark size={32} />
          <span className="auth-nav-arena">Arena</span>
          <span className="auth-nav-rest">Solutions Platform</span>
        </button>
        <div className="auth-nav-links">
          <a href="#" onClick={onBack}>Features</a>
          <a href="#" onClick={onBack}>Lifecycle</a>
          <a href="#" onClick={onBack}>Pricing</a>
        </div>
      </nav>

      <div className="flex items-center justify-center p-4" style={{minHeight:"calc(100vh - 60px)"}}>
      <div className="w-full max-w-md">
        {logo}

        {/* ── SIGN IN ── */}
        {mode === "signin" && (
          <div className="rounded-2xl shadow-xl p-8" style={{background:"#D6E8F7"}}>
            {tabs}
            <Input label={t("auth.email")} type="email" value={siEmail}
              onChange={e => setSiEmail(e.target.value)} placeholder={t("auth.ph_email")} />
            <Input label={t("auth.password")} type="password" value={siPass}
              onChange={e => setSiPass(e.target.value)} placeholder={t("auth.ph_password_dots")} />
            {errorBox}
            <button onClick={handleSignIn} disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 mt-2">
              {loading ? t("auth.signing_in") : t("action.sign_in")}
            </button>
          </div>
        )}

        {/* ── SIGN UP WIZARD ── */}
        {mode === "signup" && (
          <div className="rounded-2xl shadow-xl p-8" style={{background:"#D6E8F7"}}>
            {tabs}

            {/* Step progress */}
            <div className="flex items-center mb-8 relative">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
              {SIGNUP_STEPS.map((s, i) => (
                <div key={s.id} className="relative z-10 flex flex-col items-center flex-1 gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 transition-all ${
                    i < displayStep  ? "bg-emerald-500 text-white ring-emerald-100"
                    : i === displayStep ? "bg-[#1C3557] text-white ring-blue-200"
                                       : "bg-gray-100 text-gray-400 ring-gray-200"}`}>
                    {i < displayStep ? <Check size={11} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${i === displayStep ? "text-[#1C3557]" : i < displayStep ? "text-emerald-600" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* approvalDone — admin_approval success when Supabase requires email confirm */}
            {approvalDone && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                  <BadgeCheck size={30} className="text-blue-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{t("ob.registration_submitted")}</h2>
                <p className="text-sm text-gray-500">
                  Your account has been created and is pending admin review. You may receive a confirmation email — please confirm it. An admin will then approve your account.
                </p>
                <button onClick={() => switchMode("signin")}
                  className="w-full py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
                  Back to Sign In
                </button>
              </div>
            )}

            {/* Step 0 — Email + Role selection */}
            {!approvalDone && step === 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">{t("auth.verify_heading")}</h2>
                <p className="text-sm text-gray-500 mb-5">Enter your email and choose your role to get started.</p>
                <Input label={t("auth.email")} type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setKeyUserCompany(null); setFinalUserClient(null); setInternalConsultantClient(null); setProjectManagerClient(null); }}
                  onBlur={e => { if (e.target.value.trim()) checkEmailPreReg(e.target.value); }}
                  placeholder={t("auth.ph_email")} />
                <p className="text-xs font-medium text-gray-700 mb-3 mt-1">{t("auth.choose_type")}</p>
                {(() => {
                  const visibleSignup = ssSettings["signup_roles_visible"] ?? ["consultant", "headhunter", "client", "key_user", "final_user"];
                  const generalRoles = [
                    { role: "consultant", Icon: Briefcase, label: t("auth.build_consultant"), desc: t("auth.help_clients") },
                    { role: "client",     Icon: Building2, label: t("auth.build_client"),     desc: t("auth.tell_consultants") },
                    { role: "headhunter", Icon: Crosshair, label: t("auth.build_headhunter"), desc: t("auth.help_headhunter") },
                  ].filter(o => visibleSignup.includes(o.role));
                  const isLinkedToTeam = !!(keyUserCompany || finalUserClient || internalConsultantClient || projectManagerClient);
                  return generalRoles.length > 0 ? (
                    <div className={`grid gap-3 ${generalRoles.length === 1 ? "grid-cols-1" : generalRoles.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
                      {generalRoles.map(opt => (
                        <button key={opt.role} onClick={() => handleRoleSelect(opt.role)} disabled={loading || isLinkedToTeam}
                          className={`flex flex-col items-center gap-2 p-4 border-2 rounded-2xl transition-all text-center group
                            ${isLinkedToTeam
                              ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                              : "border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"}`}>
                          <opt.Icon className={`w-7 h-7 ${isLinkedToTeam ? "text-gray-400" : "text-blue-600 group-hover:text-blue-700"}`} />
                          <span className={`font-semibold text-sm ${isLinkedToTeam ? "text-gray-400" : "text-gray-900 group-hover:text-blue-700"}`}>{opt.label}</span>
                          <span className="text-xs text-gray-400 leading-snug">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : null;
                })()}
                {(ssSettings["signup_roles_visible"] ?? ["consultant","headhunter","client","key_user","final_user"]).includes("key_user") && <button
                  onClick={() => (!requiresTeamFor("key_user") || keyUserCompany) && handleRoleSelect("key_user")}
                  disabled={loading || (requiresTeamFor("key_user") && !keyUserCompany)}
                  className={`w-full mt-3 flex items-center gap-4 p-4 border-2 rounded-2xl transition-all text-left
                    ${(!requiresTeamFor("key_user") || keyUserCompany)
                      ? "border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 cursor-pointer"
                      : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                  <UserCheck className={`w-7 h-7 flex-shrink-0 ${(!requiresTeamFor("key_user") || keyUserCompany) ? "text-blue-600" : "text-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${(!requiresTeamFor("key_user") || keyUserCompany) ? "text-blue-700" : "text-gray-500"}`}>{t("auth.role_key_user")}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t("auth.key_user_desc")}</div>
                    {keyUserCompany
                      ? <div className="text-xs text-blue-600 font-semibold mt-1">{t("auth.key_user_linked").replace("{n}", keyUserCompany)}</div>
                      : requiresTeamFor("key_user")
                      ? <div className="text-xs text-amber-600 mt-1">{t("auth.key_user_not_registered")}</div>
                      : null}
                  </div>
                </button>}
                {(ssSettings["signup_roles_visible"] ?? ["consultant","headhunter","client","key_user","final_user"]).includes("final_user") && <button
                  onClick={() => (!requiresTeamFor("final_user") || finalUserClient) && handleRoleSelect("final_user")}
                  disabled={loading || (requiresTeamFor("final_user") && !finalUserClient)}
                  className={`w-full mt-3 flex items-center gap-4 p-4 border-2 rounded-2xl transition-all text-left
                    ${(!requiresTeamFor("final_user") || finalUserClient)
                      ? "border-teal-300 bg-teal-50 hover:border-teal-500 hover:bg-teal-100 cursor-pointer"
                      : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                  <Globe className={`w-7 h-7 flex-shrink-0 ${(!requiresTeamFor("final_user") || finalUserClient) ? "teal-600" : "text-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${(!requiresTeamFor("final_user") || finalUserClient) ? "text-teal-700" : "text-gray-500"}`}>{t("auth.role_final_user")}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t("auth.final_user_desc")}</div>
                    {finalUserClient
                      ? <div className="text-xs text-teal-600 font-semibold mt-1">{t("auth.final_user_linked").replace("{n}", finalUserClient.companyName)}</div>
                      : requiresTeamFor("final_user")
                      ? <div className="text-xs text-amber-600 mt-1">{t("auth.final_user_not_registered")}</div>
                      : null}
                  </div>
                </button>}
                {(ssSettings["signup_roles_visible"] ?? ["consultant","headhunter","client","key_user","final_user","internal_consultant","project_manager"]).includes("internal_consultant") && <button
                  onClick={() => (!requiresTeamFor("internal_consultant") || internalConsultantClient) && handleRoleSelect("internal_consultant")}
                  disabled={loading || (requiresTeamFor("internal_consultant") && !internalConsultantClient)}
                  className={`w-full mt-3 flex items-center gap-4 p-4 border-2 rounded-2xl transition-all text-left
                    ${(!requiresTeamFor("internal_consultant") || internalConsultantClient)
                      ? "border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100 cursor-pointer"
                      : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                  <UserCog className={`w-7 h-7 flex-shrink-0 ${(!requiresTeamFor("internal_consultant") || internalConsultantClient) ? "text-indigo-600" : "text-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${(!requiresTeamFor("internal_consultant") || internalConsultantClient) ? "text-indigo-700" : "text-gray-500"}`}>{t("auth.role_internal_consultant")}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t("auth.internal_consultant_desc")}</div>
                    {internalConsultantClient
                      ? <div className="text-xs text-indigo-600 font-semibold mt-1">{t("auth.final_user_linked").replace("{n}", internalConsultantClient.companyName)}</div>
                      : requiresTeamFor("internal_consultant")
                      ? <div className="text-xs text-amber-600 mt-1">{t("auth.final_user_not_registered")}</div>
                      : null}
                  </div>
                </button>}
                {(ssSettings["signup_roles_visible"] ?? ["consultant","headhunter","client","key_user","final_user","internal_consultant","project_manager"]).includes("project_manager") && <button
                  onClick={() => (!requiresTeamFor("project_manager") || projectManagerClient) && handleRoleSelect("project_manager")}
                  disabled={loading || (requiresTeamFor("project_manager") && !projectManagerClient)}
                  className={`w-full mt-3 flex items-center gap-4 p-4 border-2 rounded-2xl transition-all text-left
                    ${(!requiresTeamFor("project_manager") || projectManagerClient)
                      ? "border-rose-300 bg-rose-50 hover:border-rose-500 hover:bg-rose-100 cursor-pointer"
                      : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                  <FolderKanban className={`w-7 h-7 flex-shrink-0 ${(!requiresTeamFor("project_manager") || projectManagerClient) ? "text-rose-600" : "text-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${(!requiresTeamFor("project_manager") || projectManagerClient) ? "text-rose-700" : "text-gray-500"}`}>{t("auth.role_project_manager")}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t("auth.project_manager_desc")}</div>
                    {projectManagerClient
                      ? <div className="text-xs text-rose-600 font-semibold mt-1">{t("auth.final_user_linked").replace("{n}", projectManagerClient.companyName)}</div>
                      : requiresTeamFor("project_manager")
                      ? <div className="text-xs text-amber-600 mt-1">{t("auth.final_user_not_registered")}</div>
                      : null}
                  </div>
                </button>}
                {loading && <p className="text-xs text-center text-gray-400 mt-3">Checking…</p>}
              </div>
            )}

            {/* Step 1 — OTP Verify (only for email_verify / email_and_approval) */}
            {!approvalDone && step === 1 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">{t("auth.verify_heading")}</h2>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                  <Mail className="w-4 h-4 inline-block mr-1" />{t("auth.code_sent").replace("{n}", email)}
                </div>
                <Input label={t("auth.code_label")} value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder={t("auth.code_placeholder")} />
                <div className="flex gap-2 mt-2">
                  <button onClick={resendOtp} disabled={loading}
                    className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-xl text-sm transition-colors">
                    {t("action.resend")}
                  </button>
                  <button onClick={verifyCode} disabled={loading || code.length < 4}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                    {loading ? t("auth.verifying") : t("auth.verify_btn")}
                  </button>
                </div>
                <button onClick={() => { setStep(0); setCodeSent(false); setCode(""); setRole(""); }}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  {t("action.back")}
                </button>
              </div>
            )}

            {/* Step 2 — Profile details */}
            {!approvalDone && step === 2 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  {role === "consultant" ? t("auth.build_consultant")
                    : role === "key_user" ? t("auth.build_key_user")
                    : role === "final_user" ? t("auth.role_final_user")
                    : t("auth.build_client")}
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  {role === "consultant"
                    ? t("auth.help_clients")
                    : role === "key_user"
                    ? t("auth.key_user_access").replace("{n}", keyUserCompany ?? "your company")
                    : role === "final_user"
                    ? t("auth.final_user_desc")
                    : t("auth.tell_consultants")}
                </p>
                {role === "key_user" && keyUserCompany && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4">
                    <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm text-blue-700 font-medium">{keyUserCompany}</span>
                  </div>
                )}
                {role === "final_user" && finalUserClient && (
                  <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 mb-4">
                    <Building2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span className="text-sm text-teal-700 font-medium">{finalUserClient.companyName}</span>
                  </div>
                )}

                {/* ── Common fields ── */}
                <Input label={t("label.full_name")} value={name}
                  onChange={e => setName(e.target.value)} placeholder={t("contact.ph_name")} />
                <Input label={t("auth.password")} type="password" value={password}
                  onChange={e => setPass(e.target.value)} placeholder={t("auth.ph_password")} />
                <Input label={t("auth.confirm_password")} type="password" value={confirmPass}
                  onChange={e => setConf(e.target.value)} placeholder={t("auth.ph_password_dots")} />

                {/* ── Consultant fields ── */}
                {role === "consultant" && (<>
                  <div className="border-t border-gray-100 my-4" />
                  <Input label={t("label.headline")} value={headline}
                    onChange={e => setHeadline(e.target.value)}
                    placeholder={t("auth.ph_headline_eg")} />
                  <Input label={t("profile.skills_label")} value={skills}
                    onChange={e => setSkills(e.target.value)}
                    placeholder={t("auth.ph_skills_eg")} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={t("label.years_exp")} type="number" value={yearsExp}
                      onChange={e => setYearsExp(e.target.value)} placeholder={t("auth.ph_years_eg")} />
                    <Input label={t("label.hourly_rate")} type="number" value={hourlyRate}
                      onChange={e => setHourly(e.target.value)} placeholder={t("auth.ph_rate_num_eg")} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.expertise")}</label>
                    <select value={expertiseLevel} onChange={e => setExpertise(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                      <option value="junior">{t("level.junior")}</option>
                      <option value="mid">{t("level.mid")}</option>
                      <option value="senior">{t("level.senior")}</option>
                      <option value="expert">{t("level.expert")}</option>
                    </select>
                  </div>
                </>)}

                {/* ── Client fields ── */}
                {role === "client" && (<>
                  <div className="border-t border-gray-100 my-4" />
                  <Input label={t("company.name")} value={companyName}
                    onChange={e => setCompany(e.target.value)} placeholder={t("auth.ph_company_eg")} />
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("company.industry")}</label>
                    <select value={industry} onChange={e => setIndustry(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                      <option value="">{t("signup.select_industry")}</option>
                      <option value="technology">{t("industry.technology")}</option>
                      <option value="finance">{t("industry.finance")}</option>
                      <option value="healthcare">{t("industry.healthcare")}</option>
                      <option value="manufacturing">{t("industry.manufacturing")}</option>
                      <option value="retail">{t("industry.retail")}</option>
                      <option value="energy">{t("industry.energy")}</option>
                      <option value="logistics">{t("industry.logistics")}</option>
                      <option value="professional_services">{t("industry.professional")}</option>
                      <option value="other">{t("industry.other")}</option>
                    </select>
                  </div>
                </>)}

                {(roleFlow === "admin_approval" || roleFlow === "email_and_approval") && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mt-2">
                    <Shield size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {roleFlow === "email_and_approval"
                        ? "Your email has been verified. An admin will now review your account before you can log in."
                        : "Your account will be reviewed by an admin before you can log in. You'll be notified once approved."}
                    </p>
                  </div>
                )}
                <button onClick={createAccount} disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 mt-2">
                  {loading ? t("auth.creating") : t("action.create_account")}
                </button>
                <button onClick={() => { setStep(needsOTP ? 1 : 0); setRole(""); }}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  {t("action.back")}
                </button>
              </div>
            )}

            {errorBox}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export { AuthScreen };
