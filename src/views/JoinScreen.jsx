import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, User } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { usePlatformBranding } from "../hooks/useSystemSettings.jsx";

// Standalone screen shown at /join/:token — no sidebar, no auth required yet
export function JoinScreen({ token, onJoined }) {
  const branding = usePlatformBranding();
  const [invite, setInvite]     = useState(null);   // invitation row
  const [caseData, setCaseData] = useState(null);
  const [state, setState]       = useState("loading"); // loading | ready | invalid | expired | accepted | error
  const [form, setForm]         = useState({ full_name: "", password: "", password2: "" });
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg]     = useState("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      const { data, error } = await supabase
        .from("case_invitations")
        .select("*, cases(id, title, description, area_sap)")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) { setState("invalid"); return; }
      if (data.status === "accepted") { setState("accepted"); return; }
      if (data.status === "expired" || new Date(data.expires_at) < new Date()) {
        await supabase.from("case_invitations").update({ status: "expired" }).eq("id", data.id);
        setState("expired");
        return;
      }
      setInvite(data);
      setCaseData(data.cases ?? null);
      // Pre-fill name if provided
      if (data.invited_name) setForm(f => ({ ...f, full_name: data.invited_name }));
      setState("ready");
    })();
  }, [token]);

  async function handleJoin(e) {
    e.preventDefault();
    setErrMsg("");
    if (form.password !== form.password2) { setErrMsg("Passwords don't match."); return; }
    if (form.password.length < 8) { setErrMsg("Password must be at least 8 characters."); return; }
    if (!form.full_name.trim()) { setErrMsg("Please enter your name."); return; }
    setSubmitting(true);
    try {
      // Check if this email already has an account — avoid creating duplicates
      const { data: existingUser } = await supabase
        .from("users")
        .select("id, full_name, role")
        .eq("email", invite.invited_email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        // Account already exists — mark invitation accepted and ask them to sign in
        await supabase.from("case_invitations").update({ status: "accepted" }).eq("id", invite.id);
        // Also ensure the case is linked to this user
        await supabase.from("cases").update({ client_id: existingUser.id }).eq("id", invite.case_id);
        setState("already_has_account");
        setSubmitting(false);
        return;
      }

      // New user — sign up with invited_client role
      const { error: signUpErr } = await supabase.auth.signUp({
        email: invite.invited_email,
        password: form.password,
        options: { data: { full_name: form.full_name.trim(), role: "invited_client" } },
      });
      if (signUpErr) throw signUpErr;

      // Mark invitation accepted
      await supabase.from("case_invitations").update({ status: "accepted" }).eq("id", invite.id);

      // Give the auth session a moment to settle, then notify the parent
      setTimeout(() => onJoined?.(), 800);
    } catch (err) {
      setErrMsg(err.message);
      setSubmitting(false);
    }
  }

  const platformName = branding?.platformName ?? "Arena";

  if (state === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-[#EAF4FD]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (state === "invalid") return (
    <JoinMessageScreen icon={<AlertCircle className="w-10 h-10 text-red-400" />}
      title="Invitation not found"
      body="This link may have already been used or doesn't exist. Ask your consultant to resend it."
      platformName={platformName} />
  );

  if (state === "expired") return (
    <JoinMessageScreen icon={<AlertCircle className="w-10 h-10 text-amber-400" />}
      title="Link expired"
      body="This invitation link has expired (7-day limit). Ask your consultant to resend a new one."
      platformName={platformName} />
  );

  if (state === "accepted") return (
    <JoinMessageScreen icon={<CheckCircle2 className="w-10 h-10 text-emerald-500" />}
      title="Already joined"
      body="This invitation was already accepted. Sign in to access your case."
      platformName={platformName}
      showSignIn onSignIn={() => onJoined?.()} />
  );

  if (state === "already_has_account") return (
    <JoinMessageScreen icon={<CheckCircle2 className="w-10 h-10 text-blue-500" />}
      title="You already have an account"
      body={`An account already exists for ${invite?.invited_email}. Sign in with your existing password to access this case — it's been linked to your account.`}
      platformName={platformName}
      showSignIn onSignIn={() => onJoined?.()} />
  );

  return (
    <div className="min-h-screen bg-[#EAF4FD] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You're invited</h1>
          <p className="text-gray-500 text-sm mt-1">
            to collaborate on a case via{" "}
            <span className="font-semibold text-blue-700">{platformName}</span>
          </p>
        </div>

        {/* Case preview */}
        {caseData && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Case</p>
            <p className="font-semibold text-gray-900">{caseData.title}</p>
            {caseData.area_sap && (
              <span className="mt-2 inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{caseData.area_sap}</span>
            )}
            {caseData.description && (
              <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-3">{caseData.description}</p>
            )}
          </div>
        )}

        {/* Sign-up form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Create your account</h2>
          <p className="text-xs text-gray-400 mb-5">
            Invited as <span className="font-medium text-gray-700">{invite.invited_email}</span>
          </p>
          {errMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {errMsg}
            </div>
          )}
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Your name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  required
                  placeholder="First Last"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  placeholder="Min 8 characters"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={form.password2}
                  onChange={e => setForm(f => ({ ...f, password2: e.target.value }))}
                  required
                  placeholder="Repeat password"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</> : "Join & View My Case"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          You'll have read access to this case. To get full platform access, request it from your profile once logged in.
        </p>
      </div>
    </div>
  );
}

function JoinMessageScreen({ icon, title, body, platformName, showSignIn, onSignIn }) {
  return (
    <div className="min-h-screen bg-[#EAF4FD] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{body}</p>
        {showSignIn && (
          <button
            onClick={onSignIn}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Sign In
          </button>
        )}
        <p className="text-xs text-gray-400 mt-4">{platformName}</p>
      </div>
    </div>
  );
}
