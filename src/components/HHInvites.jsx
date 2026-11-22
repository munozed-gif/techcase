// Headhunter candidate invitations: invite by e-mail, invitations list, personal referral link,
// and the consultant's "My headhunters" card. Links are created only when the consultant accepts.
import { useState, useEffect, useCallback } from "react";
import { Check, Copy, Link2, Loader2, Mail, RotateCcw, UserPlus, X, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { buildEmailHtml, sendEmail } from "../lib/utils.js";

export const hhInviteLink = token => `${window.location.origin}/hh-invite/${token}`;
export const hhReferralLink = code => `${window.location.origin}/hh/${code}`;

/** E-mail for a representation invitation (in the language chosen by the headhunter). */
export async function sendHhInviteEmail({ email, name, message, token, lang, headhunterName, existingUser }) {
  const es = lang === "es";
  const who = headhunterName || (es ? "Un headhunter" : "A headhunter");
  const html = buildEmailHtml({
    title: es ? "Te invitan a ser candidato" : "You're invited to be a candidate",
    preheader: es ? `${who} quiere representarte en Arena Solutions Platform.` : `${who} wants to represent you on Arena Solutions Platform.`,
    bodyHtml: (es
      ? `<p style="margin:0 0 12px;color:#cbd5e1">Hola ${name || ""},</p>
<p style="margin:0 0 12px;color:#94a3b8"><strong>${who}</strong> te invita a ser su candidato en Arena Solutions Platform, para proponerte en necesidades de recursos y casos SAP que encajen con tu perfil.</p>
${message ? `<p style="margin:0 0 12px;color:#cbd5e1;font-style:italic">“${message}”</p>` : ""}
<p style="margin:0;color:#94a3b8">${existingUser ? "Abre el enlace con tu cuenta para aceptar o rechazar." : "Crea tu cuenta de consultor con este mismo correo y acepta la invitación."} Puedes tener varios headhunters y terminar la representación cuando quieras.</p>`
      : `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name || "there"},</p>
<p style="margin:0 0 12px;color:#94a3b8"><strong>${who}</strong> invites you to be their candidate on Arena Solutions Platform, to put you forward for resource needs and SAP cases that match your profile.</p>
${message ? `<p style="margin:0 0 12px;color:#cbd5e1;font-style:italic">“${message}”</p>` : ""}
<p style="margin:0;color:#94a3b8">${existingUser ? "Open the link with your account to accept or decline." : "Create your consultant account with this same e-mail and accept the invitation."} You can have several headhunters and end a representation at any time.</p>`),
    ctaText: es ? "Ver la invitación" : "View invitation",
    ctaUrl: hhInviteLink(token),
    footerNote: es ? "La invitación vence en 30 días. Si no la esperabas, puedes ignorar este correo." : "The invitation expires in 30 days. If you didn't expect it, you can ignore this e-mail.",
  });
  await sendEmail(email, es ? `${who} te invita a ser su candidato` : `${who} invites you to be their candidate`, html);
}

/** Headhunter: modal to invite a candidate by e-mail. */
export function InviteCandidateModal({ lang, onClose, onSent }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [mailLang, setMailLang] = useState(es ? "es" : "en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase.rpc("hh_invite_create", { p_email: email, p_name: name || null, p_message: message || null, p_lang: mailLang });
      if (e) throw e;
      await sendHhInviteEmail({ email: email.trim(), name, message, token: data.token, lang: mailLang, headhunterName: data.headhunter_name, existingUser: data.existing_user });
      onSent?.(data.existing_user
        ? L(`Invitation sent to ${data.user_name ?? email} (in-app notification + e-mail).`, `Invitación enviada a ${data.user_name ?? email} (notificación + correo).`)
        : L(`Invitation e-mail sent to ${email}. They'll create their consultant account with it.`, `Invitación enviada a ${email}. Creará su cuenta de consultor con ese correo.`));
      onClose();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><UserPlus size={17} className="text-violet-600" />{L("Invite a candidate", "Invitar candidato")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">{L("Consultant e-mail", "Correo del consultor")} *</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="consultant@email.com"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-600">{L("Name", "Nombre")}</span>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-600">{L("Personal message (optional)", "Mensaje personal (opcional)")}</span>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder={L("e.g. I have several SAP MM needs that match your profile…", "p. ej. Tengo varias necesidades SAP MM que encajan con tu perfil…")} /></label>
          <label className="block"><span className="text-xs font-medium text-gray-600">{L("E-mail language", "Idioma del correo")}</span>
            <select value={mailLang} onChange={e => setMailLang(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="es">Español</option><option value="en">English</option>
            </select></label>
          <p className="text-[11px] text-gray-400">{L("They become your candidate only when they accept, with an account that uses this e-mail. A consultant can have several headhunters.", "Será tu candidato solo cuando acepte, con una cuenta que use este correo. Un consultor puede tener varios headhunters.")}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">{L("Cancel", "Cancelar")}</button>
          <button onClick={send} disabled={busy || !email.trim()} className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}{L("Send invitation", "Enviar invitación")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Headhunter: invitations sent, with resend / cancel. */
export function HHInvitationsList({ userId, lang, nonce }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("hh_candidate_invites").select("id, email, name, status, expires_at, created_at, responded_at")
      .eq("headhunter_id", userId).order("created_at", { ascending: false }).limit(100);
    setRows(data ?? []);
  }, [userId]);
  useEffect(() => { load(); }, [load, nonce]);

  async function resend(id) {
    setBusy(id); setMsg(null);
    const { data, error } = await supabase.rpc("hh_invite_resend", { p_id: id });
    if (error) setMsg(error.message);
    else { await sendHhInviteEmail({ ...data, headhunterName: data.headhunter_name }); setMsg(L(`Invitation resent to ${data.email}.`, `Invitación reenviada a ${data.email}.`)); await load(); }
    setBusy(null);
  }
  async function revoke(id) {
    if (!window.confirm(L("Cancel this invitation?", "¿Cancelar esta invitación?"))) return;
    setBusy(id);
    const { error } = await supabase.rpc("hh_invite_revoke", { p_id: id });
    if (error) setMsg(error.message); else await load();
    setBusy(null);
  }
  if (rows.length === 0) return null;
  const now = Date.now();
  const st = r => (r.status === "pending" && new Date(r.expires_at).getTime() <= now ? "expired" : r.status);
  const meta = {
    pending: ["bg-amber-50 text-amber-700", L("Pending", "Pendiente")], accepted: ["bg-emerald-50 text-emerald-700", L("Accepted", "Aceptada")],
    declined: ["bg-red-50 text-red-600", L("Declined", "Rechazada")], revoked: ["bg-gray-100 text-gray-500", L("Cancelled", "Cancelada")],
    expired: ["bg-gray-100 text-gray-500", L("Expired", "Vencida")],
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Invitations", "Invitaciones")}</p>
      <div className="divide-y divide-gray-50">
        {rows.map(r => {
          const s = st(r);
          return (
            <div key={r.id} className="flex items-center gap-3 py-2 text-sm flex-wrap">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{r.name || r.email}</span>
                {r.name && <span className="text-xs text-gray-400 ml-1">{r.email}</span>}
                <span className="block text-[11px] text-gray-400">{new Date(r.created_at).toLocaleDateString(es ? "es" : "en-US")}{s === "pending" ? ` · ${L("expires", "vence")} ${new Date(r.expires_at).toLocaleDateString(es ? "es" : "en-US")}` : ""}</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta[s][0]}`}>{meta[s][1]}</span>
              {(s === "pending" || s === "expired") && r.status === "pending" && (
                <>
                  <button onClick={() => resend(r.id)} disabled={busy === r.id} className="text-xs font-semibold text-violet-600 inline-flex items-center gap-1 disabled:opacity-50">
                    {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}{L("Resend", "Reenviar")}</button>
                  <button onClick={() => revoke(r.id)} disabled={busy === r.id} className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1"><XCircle size={11} />{L("Cancel", "Cancelar")}</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-xs text-gray-600 mt-2">{msg}</p>}
    </div>
  );
}

/** Headhunter: personal link to share (LinkedIn, WhatsApp…). */
export function ReferralLinkCard({ lang }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc("hh_referral_code").then(({ data, error }) => { if (error) setErr(error.message); else setCode(data); });
  }, []);
  const link = code ? hhReferralLink(code) : "";
  return (
    <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Link2 size={13} />{L("Your personal link", "Tu enlace personal")}</p>
      <p className="text-xs text-violet-700/80 mb-2">{L("Share it (LinkedIn, WhatsApp, e-mail). Consultants who open it and confirm become your candidates.", "Compártelo (LinkedIn, WhatsApp, correo). Los consultores que lo abran y confirmen pasan a ser tus candidatos.")}</p>
      {err ? <p className="text-xs text-red-600">{err}</p> : (
        <div className="flex gap-2">
          <input readOnly value={link || "…"} className="flex-1 min-w-0 border border-violet-200 rounded-xl px-3 py-2 text-xs bg-white font-mono" />
          <button disabled={!code} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl px-3 py-2 disabled:opacity-50">
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? L("Copied", "Copiado") : L("Copy", "Copiar")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Consultant: headhunters who represent me + pending invitations. */
export function MyHeadhuntersCard({ auth, lang }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const { data: d } = await supabase.rpc("hh_my_headhunters");
    setData(d ?? { active: [], invitations: [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data || (data.active.length === 0 && data.invitations.length === 0)) return null;

  async function respond(token, accept) {
    setBusy(token); setMsg(null);
    const { error } = await supabase.rpc("hh_invite_respond", { p_token: token, p_accept: accept });
    if (error) setMsg(error.message); else await load();
    setBusy(null);
  }
  async function end(hhId) {
    if (!window.confirm(L("End this representation? The headhunter will be notified.", "¿Terminar esta representación? El headhunter será notificado."))) return;
    setBusy(hhId); setMsg(null);
    const { error } = await supabase.rpc("hh_end_representation", { p_headhunter: hhId, p_consultant: auth.user.id });
    if (error) setMsg(error.message); else await load();
    setBusy(null);
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">{L("Headhunters", "Headhunters")}</p>
      {data.invitations.map(i => (
        <div key={i.token} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-sm text-gray-900"><b>{i.headhunter_name ?? L("A headhunter", "Un headhunter")}</b> {L("invites you to be represented as a candidate.", "te invita a ser su candidato.")}</p>
          {i.message && <p className="text-xs text-gray-600 italic mt-1">“{i.message}”</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => respond(i.token, true)} disabled={busy === i.token} className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">{L("Accept", "Aceptar")}</button>
            <button onClick={() => respond(i.token, false)} disabled={busy === i.token} className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 disabled:opacity-50">{L("Decline", "Rechazar")}</button>
          </div>
        </div>
      ))}
      {data.active.map(h => (
        <div key={h.id} className="flex items-center gap-3 text-sm">
          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">{(h.full_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{h.full_name}</p>
            <p className="text-[11px] text-gray-400">{h.email} · {L("since", "desde")} {new Date(h.since).toLocaleDateString(es ? "es" : "en-US")}</p>
          </div>
          <button onClick={() => end(h.id)} disabled={busy === h.id} className="text-xs text-gray-400 hover:text-red-600">{L("End representation", "Terminar representación")}</button>
        </div>
      ))}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}
