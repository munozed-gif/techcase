// /hh-invite/:token — a headhunter's e-mail invitation (the account must use the invited e-mail)
// /hh/:code         — a headhunter's personal link
// The consultant reads who invites them, signs up or logs in here, and accepts or declines.
import { Tm } from "../components/BrandMark.jsx";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Crosshair, Loader2, LogOut, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { signOutLogged } from "../lib/sessionSecurity.js";
import { NovaLandingMark } from "./LandingView.jsx";

const T = {
  en: {
    invites: "invites you to be their candidate", linkTitle: "wants to represent you as a candidate",
    explain: "As their candidate, they can put you forward for resource needs and SAP cases that match your profile. You can have several headhunters and end a representation at any time from your profile.",
    accept: "Accept", decline: "Decline", working: "Working…",
    acceptedT: "You're now their candidate", acceptedM: "The headhunter has been notified. You can see and end the representation in Profile → Headhunters.",
    declinedT: "Invitation declined", declinedM: "The headhunter has been notified.",
    already: "You are already represented by this headhunter.",
    expired: "This invitation has expired. Ask the headhunter to resend it.", revoked: "This invitation was cancelled.",
    answered: "This invitation was already answered.", notFound: "This link is not valid.",
    signupT: "Create your consultant account", loginT: "Log in", haveAccount: "I already have an account", noAccount: "Create an account",
    name: "Full name", email: "E-mail", password: "Password (min. 8 characters)", create: "Create account and continue", login: "Log in and continue",
    confirmEmail: "Check your e-mail to confirm your account, then open this link again to accept.",
    loggedAs: "Logged in as", otherAccount: "This invitation is for", useOther: "Log out and use that account",
    onlyConsultant: "Only consultant accounts can be represented by a headhunter.", goApp: "Go to the platform",
  },
  es: {
    invites: "te invita a ser su candidato", linkTitle: "quiere representarte como candidato",
    explain: "Como su candidato, puede proponerte en necesidades de recursos y casos SAP que encajen con tu perfil. Puedes tener varios headhunters y terminar una representación cuando quieras desde tu perfil.",
    accept: "Aceptar", decline: "Rechazar", working: "Procesando…",
    acceptedT: "Ahora eres su candidato", acceptedM: "El headhunter fue notificado. Puedes ver y terminar la representación en Perfil → Headhunters.",
    declinedT: "Invitación rechazada", declinedM: "El headhunter fue notificado.",
    already: "Ya te representa este headhunter.",
    expired: "Esta invitación venció. Pide al headhunter que la reenvíe.", revoked: "Esta invitación fue cancelada.",
    answered: "Esta invitación ya fue respondida.", notFound: "Este enlace no es válido.",
    signupT: "Crea tu cuenta de consultor", loginT: "Inicia sesión", haveAccount: "Ya tengo una cuenta", noAccount: "Crear una cuenta",
    name: "Nombre completo", email: "Correo", password: "Contraseña (mín. 8 caracteres)", create: "Crear cuenta y continuar", login: "Iniciar sesión y continuar",
    confirmEmail: "Revisa tu correo para confirmar la cuenta y vuelve a abrir este enlace para aceptar.",
    loggedAs: "Sesión iniciada como", otherAccount: "Esta invitación es para", useOther: "Cerrar sesión y usar esa cuenta",
    onlyConsultant: "Solo las cuentas de consultor pueden ser representadas por un headhunter.", goApp: "Ir a la plataforma",
  },
};

const BG = { minHeight: "100dvh", background: "#0B0F1A", backgroundImage: "radial-gradient(circle at 70% -10%,rgba(139,92,246,.22) 0%,transparent 65%)", display: "flex", flexDirection: "column" };
const box = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" };
const inputCls = "w-full rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500";
const inputStyle = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" };

export default function HHInviteView({ token, code }) {
  const [info, setInfo] = useState(undefined);   // invite or referral info; null = not found
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);             // { email, role }
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [done, setDone] = useState(null);         // 'accepted' | 'declined' | 'already'

  useEffect(() => {
    (async () => {
      const { data, error: e } = token
        ? await supabase.rpc("hh_invite_by_token", { p_token: token })
        : await supabase.rpc("hh_referral_info", { p_code: code });
      if (e) setError(e.message);
      setInfo(data ?? null);
      if (token && data) {
        setForm(f => ({ ...f, email: data.email, name: data.name ?? "" }));
        setMode(data.account_exists ? "login" : "signup");
      }
      const { data: s } = await supabase.auth.getSession();
      setSession(s?.session ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub?.subscription?.unsubscribe?.();
  }, [token, code]);

  useEffect(() => {
    if (!session?.user) { setMe(null); return; }
    supabase.from("users").select("email, role, full_name").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => setMe(data ?? { email: session.user.email, role: session.user.user_metadata?.role }));
  }, [session]);

  const lang = (token ? info?.lang : null) === "es" || (!token && (navigator.language || "").startsWith("es")) ? "es" : "en";
  const L = T[lang];
  const hhName = token ? info?.headhunter?.name : info?.name;

  async function auth(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "signup") {
        if ((form.password ?? "").length < 8) throw new Error(L.password);
        const { data, error: err } = await supabase.auth.signUp({
          email: form.email.trim(), password: form.password,
          options: { data: { full_name: form.name.trim(), role: "consultant" }, emailRedirectTo: window.location.href },
        });
        if (err) throw err;
        if (!data.session) setNotice(L.confirmEmail);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (err) throw err;
      }
    } catch (e2) { setError(e2.message); }
    setBusy(false);
  }

  async function answer(accept) {
    setBusy(true); setError(null);
    const { data, error: e } = token
      ? await supabase.rpc("hh_invite_respond", { p_token: token, p_accept: accept })
      : accept ? await supabase.rpc("hh_referral_accept", { p_code: code }) : { data: { status: "declined" } };
    if (e) setError(e.message); else setDone(data?.status ?? (accept ? "accepted" : "declined"));
    setBusy(false);
  }

  const Header = (
    <header className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid rgba(139,92,246,.2)" }}>
      <NovaLandingMark size={30} />
      <span className="font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        <span style={{ color: "#4F6EF7" }}>Arena</span> <span style={{ color: "rgba(255,255,255,.85)" }}>Solutions Platform<Tm /></span>
      </span>
    </header>
  );
  if (info === undefined) return <div style={BG} className="items-center justify-center"><Loader2 className="animate-spin text-violet-400" /></div>;

  const Center = ({ children }) => <div style={BG}>{Header}<div className="flex-1 flex items-center justify-center px-5 py-8"><div className="w-full max-w-md space-y-4">{children}</div></div></div>;
  if (!info) return <Center><div className="rounded-2xl p-6 text-center" style={box}><AlertCircle className="mx-auto text-red-400 mb-2" size={28} /><p className="text-white font-semibold">{L.notFound}</p></div></Center>;

  const status = token ? info.status : "pending";
  if (done || status !== "pending") {
    const s = done ?? status;
    const ok = s === "accepted" || s === "already";
    return (
      <Center>
        <div className="rounded-2xl p-6 text-center" style={box}>
          {ok ? <CheckCircle2 className="mx-auto text-emerald-400 mb-2" size={30} /> : <XCircle className="mx-auto text-gray-400 mb-2" size={30} />}
          <p className="text-white font-semibold">{s === "accepted" ? L.acceptedT : s === "already" ? L.already : s === "declined" ? L.declinedT : s === "expired" ? L.expired : s === "revoked" ? L.revoked : L.answered}</p>
          {(s === "accepted" || s === "declined") && done && <p className="text-gray-400 text-sm mt-1">{s === "accepted" ? L.acceptedM : L.declinedM}</p>}
          <a href="/" className="inline-block mt-4 text-sm font-semibold text-violet-300 hover:text-violet-200">{L.goApp} →</a>
        </div>
      </Center>
    );
  }

  const wrongAccount = token && me?.email && me.email.toLowerCase() !== (info.email ?? "").toLowerCase();
  const notConsultant = me?.role && me.role !== "consultant";

  return (
    <Center>
      <div className="rounded-2xl p-5" style={box}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center"><Crosshair size={20} /></div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{hhName ?? "Headhunter"}</p>
            <p className="text-gray-400 text-xs">{token ? L.invites : L.linkTitle}</p>
          </div>
        </div>
        {token && info.message && <p className="text-gray-300 text-sm italic mb-3 whitespace-pre-wrap">“{info.message}”</p>}
        <p className="text-gray-400 text-xs leading-relaxed">{L.explain}</p>
      </div>

      {session ? (
        <div className="rounded-2xl p-5 space-y-3" style={box}>
          <p className="text-gray-400 text-xs">{L.loggedAs} <span className="text-white">{me?.email ?? session.user.email}</span></p>
          {wrongAccount ? (
            <>
              <p className="text-amber-300 text-sm">{L.otherAccount} <b>{info.email}</b>.</p>
              <button onClick={() => signOutLogged()} className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-xl px-4 py-2.5" style={{ border: "1px solid rgba(255,255,255,.2)" }}><LogOut size={14} />{L.useOther}</button>
            </>
          ) : notConsultant ? (
            <p className="text-amber-300 text-sm">{L.onlyConsultant}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => answer(true)} disabled={busy} className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{busy ? L.working : L.accept}</button>
              <button onClick={() => answer(false)} disabled={busy} className="inline-flex items-center justify-center gap-2 text-gray-300 text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50" style={{ border: "1px solid rgba(255,255,255,.15)" }}>
                <XCircle size={15} />{L.decline}</button>
            </div>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      ) : (
        <form onSubmit={auth} className="rounded-2xl p-5 space-y-3" style={box}>
          <p className="text-white font-semibold text-sm">{mode === "signup" ? L.signupT : L.loginT}</p>
          {mode === "signup" && <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={L.name} required className={inputCls} style={inputStyle} />}
          <input type="email" value={form.email} readOnly={!!token} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={L.email} required className={inputCls} style={{ ...inputStyle, opacity: token ? 0.75 : 1 }} />
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={L.password} required className={inputCls} style={inputStyle} />
          <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />}{mode === "signup" ? L.create : L.login}</button>
          <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }} className="w-full text-xs text-violet-300 hover:text-violet-200">
            {mode === "signup" ? L.haveAccount : L.noAccount}</button>
          {notice && <p className="text-emerald-300 text-xs">{notice}</p>}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>
      )}
    </Center>
  );
}
