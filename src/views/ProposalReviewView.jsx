// /proposal/:token — the customer reads a proposal and accepts it, asks for changes or
// rejects it. No login needed: the secure link is the access (RPCs proposal_by_token /
// proposal_decide). Approval sets each case's budget and returns the cases to Estimated.
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Download, FileText, Presentation, Maximize2, Loader2, MessageSquare, Paperclip, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { docLinkClick, openHtml } from "../lib/openDoc.js";
import { supabase } from "../lib/supabase.js";
import { NovaLandingMark } from "./LandingView.jsx";
import { fmtMoney } from "../lib/costs.js";
import { termName } from "../lib/servicePlans.js";

const T = {
  en: {
    proposal: "Proposal", from: "from", total: "Total", validUntil: "Valid until", attachments: "Attachments",
    decide: "Your decision", name: "Your full name", comment: "Comment", commentReq: "Required to ask for changes or reject",
    accept: "Accept proposal", changes: "Ask for changes", reject: "Reject", sending: "Sending…",
    acceptedT: "Proposal accepted", acceptedM: "Thank you. The team has been notified and will plan the next steps with you.",
    changesT: "Changes requested", changesM: "Your comments were sent to the team. They will send you a new version.",
    rejectedT: "Proposal rejected", rejectedM: "The team has been notified. Thank you for your time.",
    closedT: "This proposal is no longer available", closedM: "It was withdrawn or replaced by a newer version. Please contact the team that sent it.",
    notFound: "Proposal not found", notFoundM: "The link is not valid. Please contact the team that sent it to you.",
    expired: "This proposal has expired. Please contact the team for an updated one.",
    confirmAccept: "Accept this proposal? The team will be notified and the work can be planned.",
    by: "by",
    choosePlan: "Choose your plan", chooseReq: "Choose one of the plan options to accept.", hours: "hours", perMonth: "/month", periodTotal: "period total",
    onDemand: "On-demand service", perHour: "/hour", minimum: "Monthly minimum", chosen: "Chosen plan", months: "months", month: "month",
  },
  es: {
    proposal: "Propuesta", from: "de", total: "Total", validUntil: "Válida hasta", attachments: "Anexos",
    decide: "Tu decisión", name: "Tu nombre completo", comment: "Comentario", commentReq: "Obligatorio para pedir cambios o rechazar",
    accept: "Aceptar propuesta", changes: "Pedir cambios", reject: "Rechazar", sending: "Enviando…",
    acceptedT: "Propuesta aceptada", acceptedM: "Gracias. El equipo fue notificado y planificará contigo los próximos pasos.",
    changesT: "Cambios solicitados", changesM: "Tus comentarios se enviaron al equipo. Te enviarán una nueva versión.",
    rejectedT: "Propuesta rechazada", rejectedM: "El equipo fue notificado. Gracias por tu tiempo.",
    closedT: "Esta propuesta ya no está disponible", closedM: "Fue retirada o reemplazada por una versión más reciente. Contacta al equipo que la envió.",
    notFound: "Propuesta no encontrada", notFoundM: "El enlace no es válido. Contacta al equipo que te lo envió.",
    expired: "Esta propuesta venció. Contacta al equipo para recibir una actualizada.",
    confirmAccept: "¿Aceptar esta propuesta? El equipo será notificado y se podrá planificar el trabajo.",
    by: "por",
    choosePlan: "Elige tu plan", chooseReq: "Elige una de las opciones de plan para aceptar.", hours: "horas", perMonth: "/mes", periodTotal: "total del período",
    onDemand: "Servicio bajo demanda", perHour: "/hora", minimum: "Mínimo mensual", chosen: "Plan elegido", months: "meses", month: "mes",
  },
};

const BG = {
  minHeight: "100dvh", background: "#0B0F1A",
  backgroundImage: "radial-gradient(circle at 70% -10%,rgba(79,110,247,.22) 0%,transparent 65%)",
  display: "flex", flexDirection: "column",
};

// embedded: shown inside the platform (project → Proposals tab for the customer) instead of a full page.
// preview: the proposal data (same shape as proposal_by_token) shown to the consultant before sending —
// nothing is loaded or recorded, and the decision buttons do nothing.
export default function ProposalReviewView({ token, embedded = false, defaultName = "", onBack, onDecided, preview = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(defaultName ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [option, setOption] = useState(null); // months of the chosen plan option
  const [view, setView] = useState("doc");     // "doc" | "deck" (presentation)

  useEffect(() => {
    if (preview) { setData(preview); setLoading(false); return; }
    supabase.rpc("proposal_by_token", { p_token: token })
      .then(({ data: d, error: e }) => { if (e) setError(e.message); setData(d ?? null); setLoading(false); });
  }, [token, preview]);

  const lang = data?.language === "es" ? "es" : "en";
  const L = T[lang];

  async function decide(decision) {
    setError(null);
    if (preview) { setError(lang === "es" ? "Vista previa: el cliente usará estos botones para responder. Aquí no hacen nada." : "Preview: the customer will use these buttons to answer. They do nothing here."); return; }
    if (!name.trim()) { setError(L.name); return; }
    if (decision !== "accepted" && !note.trim()) { setError(L.commentReq); return; }
    const opts = data?.totals?.type === "plan" ? (data.totals.options ?? []) : [];
    const chosen = opts.length === 1 ? opts[0].months : option;
    if (decision === "accepted" && opts.length > 1 && !chosen) { setError(L.chooseReq); return; }
    if (decision === "accepted" && !window.confirm(L.confirmAccept)) return;
    setBusy(decision);
    const { error: e } = await supabase.rpc("proposal_decide_v2", { p_token: token, p_decision: decision, p_name: name.trim(), p_note: note.trim() || null, p_option: decision === "accepted" ? (chosen ?? null) : null });
    if (e) { setError(e.message); setBusy(null); return; }
    const acceptedOption = decision === "accepted" ? opts.find(o => o.months === chosen) ?? null : null;
    setData(d => ({ ...d, status: decision, decided_by_name: name.trim(), decision_note: note.trim() || null, decided_at: new Date().toISOString(), accepted_option: acceptedOption }));
    onDecided?.(decision);
    setBusy(null);
  }

  const PAGE = embedded ? { ...BG, minHeight: "auto", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(79,110,247,.25)" } : BG;
  const Header = (
    <header style={{ borderBottom: "1px solid rgba(79,110,247,.2)", background: "rgba(11,15,26,.97)", position: embedded ? "static" : "sticky", top: 0, zIndex: 20 }}
      className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {embedded && onBack && <button onClick={onBack} className="text-gray-400 hover:text-white text-sm mr-1">←</button>}
        <NovaLandingMark size={30} />
        <span className="font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: "-.03em" }}>
          <span style={{ color: "#4F6EF7" }}>Arena</span> <span style={{ color: "rgba(255,255,255,.85)" }}>Solutions Platform</span>
        </span>
      </div>
      {data && (
        <div className="text-right min-w-0">
          <p className="text-gray-400 text-xs">{L.proposal}{data.partner_name ? ` ${L.from} ${data.partner_name}` : ""}</p>
          <p className="text-white text-sm font-semibold truncate">{data.title} · v{data.version}</p>
        </div>
      )}
    </header>
  );

  if (loading) return <div style={{ ...PAGE, minHeight: embedded ? 240 : BG.minHeight }} className="items-center justify-center"><Loader2 className="animate-spin text-blue-400" /></div>;

  const Message = ({ icon, color, title, msg, extra }) => (
    <div style={PAGE}>{Header}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${color}`}>{icon}</div>
          <h2 className="text-white text-xl font-bold mb-2">{title}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{msg}</p>
          {extra}
        </div>
      </div>
    </div>
  );

  if (!data) return <Message icon={<AlertCircle size={28} className="text-red-400" />} color="bg-red-900/30 border border-red-800/40" title={L.notFound} msg={L.notFoundM} />;
  if (["withdrawn", "superseded"].includes(data.status)) return <Message icon={<Clock size={28} className="text-gray-400" />} color="bg-white/5 border border-white/10" title={L.closedT} msg={L.closedM} />;

  const decided = ["accepted", "changes_requested", "rejected"].includes(data.status);
  const expired = data.valid_until && new Date(data.valid_until + "T23:59:59") < new Date();

  return (
    <div style={PAGE}>
      {Header}
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-2">
          {(data.html || data.deck_html) && (
            // The documents' own buttons cannot run inside the sandboxed frame: print / present from here.
            <div className="flex flex-wrap items-center justify-between gap-2">
              {data.deck_html ? (
                <div className="inline-flex rounded-lg p-0.5 bg-white/5 border border-white/10">
                  {[["doc", FileText, lang === "es" ? "Documento" : "Document"], ["deck", Presentation, lang === "es" ? "Presentación" : "Presentation"]].map(([k, I, t]) => (
                    <button key={k} onClick={() => setView(k)}
                      style={view === k ? { background: "#4F6EF7", color: "#fff" } : { color: "#CBD5E1" }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold">
                      <I size={14} />{t}
                    </button>
                  ))}
                </div>
              ) : <span />}
              <div className="flex gap-2">
                {view === "deck" && data.deck_html && (
                  <button onClick={() => openHtml(data.deck_html)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white border border-white/20 hover:bg-white/10">
                    <Maximize2 size={14} />{lang === "es" ? "Pantalla completa" : "Full screen"}
                  </button>
                )}
                <button onClick={() => openHtml(view === "deck" && data.deck_html ? data.deck_html : data.html, { print: true })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#4F6EF7] hover:bg-[#3d5bea]">
                  <Download size={14} />{lang === "es" ? "Descargar PDF" : "Download PDF"}
                </button>
              </div>
            </div>
          )}
          {view === "deck" && data.deck_html ? (
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0B1220]">
              <iframe key="deck" title="presentation" srcDoc={data.deck_html} className="w-full aspect-video block" sandbox="allow-scripts" />
            </div>
          ) : (
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-white min-h-[70vh]">
            {data.html
              ? <iframe key="doc" title="proposal" srcDoc={data.html.replace("</head>", "<style>.print-btn{display:none!important}</style></head>")} className={`w-full ${embedded ? "h-[70vh]" : "h-[78vh]"} bg-white`} sandbox="allow-same-origin allow-popups allow-modals" />
              : <p className="p-6 text-sm text-gray-500">—</p>}
          </div>
          )}
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
            {data.customer_name && <p className="text-gray-400 text-xs mb-1">{data.customer_name} · {data.project_name}</p>}
            {data.totals?.type === "plan" ? (
              <>
                <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-2">{data.status === "accepted" ? L.chosen : L.choosePlan}</p>
                <p className="text-gray-400 text-xs mb-2">{data.totals.bandName} · {data.totals.hoursMonth} {L.hours}{L.perMonth}</p>
                <div className="space-y-2">
                  {(data.totals.options ?? []).map(o => {
                    const isChosen = data.status === "accepted" ? data.accepted_option?.months === o.months : (option ?? (data.totals.options.length === 1 ? o.months : null)) === o.months;
                    const selectable = !["accepted", "changes_requested", "rejected"].includes(data.status);
                    return (
                      <button key={o.months} type="button" disabled={!selectable} onClick={() => setOption(o.months)}
                        className="w-full text-left rounded-xl px-3 py-2 transition-colors"
                        style={{ background: isChosen ? "rgba(79,110,247,.18)" : "rgba(255,255,255,.04)", border: `1px solid ${isChosen ? "#4F6EF7" : "rgba(255,255,255,.1)"}` }}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-white text-sm font-semibold">{termName(o.months, lang === "es")} · {o.months} {o.months === 1 ? L.month : L.months}</span>
                          <span className="text-white text-sm font-bold">{fmtMoney(o.total, data.currency, lang)}</span>
                        </span>
                        <span className="block text-gray-400 text-[11px] mt-0.5">{o.totalHours} {L.hours} · {fmtMoney(o.monthly, data.currency, lang)}{L.perMonth} · {fmtMoney(o.rate, data.currency, lang)}{L.perHour}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : data.totals?.type === "on_demand" ? (
              <>
                <p className="text-gray-400 text-xs">{L.onDemand}</p>
                <p className="text-white text-2xl font-bold">{fmtMoney(data.totals.rate ?? 0, data.currency, lang)}<span className="text-sm font-normal text-gray-400">{L.perHour}</span></p>
                <p className="text-gray-400 text-xs mt-1">{L.minimum}: {fmtMoney(data.totals.minMonthly ?? 0, data.currency, lang)}</p>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-xs">{L.total}</p>
                <p className="text-white text-2xl font-bold">{fmtMoney(data.totals?.total ?? 0, data.currency, lang)}</p>
              </>
            )}
            {data.valid_until && <p className={`text-xs mt-1 ${expired ? "text-red-400" : "text-gray-400"}`}>{L.validUntil} {new Date(data.valid_until + "T12:00:00").toLocaleDateString(lang === "es" ? "es" : "en-US", { year: "numeric", month: "long", day: "numeric" })}</p>}
          </div>

          {(data.attachments ?? []).length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-2">{L.attachments}</p>
              <ul className="space-y-1.5">
                {data.attachments.map(a => (
                  <li key={a.doc_id} className="text-sm flex items-center gap-2 min-w-0">
                    <Paperclip size={12} className="text-gray-500 flex-shrink-0" />
                    <a href={a.file_url} onClick={docLinkClick(a.file_url, a.file_name)} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200 truncate">{a.file_name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {decided ? (
            <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              {data.status === "accepted" && <CheckCircle2 size={30} className="text-emerald-400 mx-auto mb-2" />}
              {data.status === "changes_requested" && <MessageSquare size={30} className="text-amber-400 mx-auto mb-2" />}
              {data.status === "rejected" && <XCircle size={30} className="text-red-400 mx-auto mb-2" />}
              <p className="text-white font-semibold">{data.status === "accepted" ? L.acceptedT : data.status === "rejected" ? L.rejectedT : L.changesT}</p>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">{data.status === "accepted" ? L.acceptedM : data.status === "rejected" ? L.rejectedM : L.changesM}</p>
              {data.decided_by_name && <p className="text-gray-500 text-xs mt-3">{L.by} {data.decided_by_name}{data.decided_at ? ` · ${new Date(data.decided_at).toLocaleDateString(lang === "es" ? "es" : "en-US")}` : ""}</p>}
              {data.decision_note && <p className="text-gray-300 text-xs mt-2 text-left whitespace-pre-wrap rounded-lg p-2" style={{ background: "rgba(255,255,255,.05)" }}>{data.decision_note}</p>}
            </div>
          ) : expired ? (
            <div className="rounded-2xl p-4 text-sm text-red-300" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)" }}>{L.expired}</div>
          ) : (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide">{L.decide}</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={L.name}
                className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }} />
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={`${L.comment} — ${L.commentReq.toLowerCase()}`}
                className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }} />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={() => decide("accepted")} disabled={!!busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50">
                {busy === "accepted" ? <Loader2 size={15} className="animate-spin" /> : <ThumbsUp size={15} />}{busy === "accepted" ? L.sending : L.accept}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => decide("changes_requested")} disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 text-amber-300 text-sm font-semibold rounded-xl px-3 py-2 disabled:opacity-50" style={{ border: "1px solid rgba(251,191,36,.35)" }}>
                  {busy === "changes_requested" ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}{L.changes}
                </button>
                <button onClick={() => decide("rejected")} disabled={!!busy}
                  className="inline-flex items-center justify-center gap-1.5 text-red-300 text-sm font-semibold rounded-xl px-3 py-2 disabled:opacity-50" style={{ border: "1px solid rgba(248,113,113,.35)" }}>
                  {busy === "rejected" ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}{L.reject}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
