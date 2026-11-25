// /proposal/:token — the customer reads a proposal and accepts it, asks for changes or
// rejects it. No login needed: the secure link is the access (RPCs proposal_by_token /
// proposal_decide). Approval sets each case's budget and returns the cases to Estimated.
import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock, Copy, Download, FileText, Presentation, Maximize2, Lock, ScrollText, Loader2, MessageSquare, Paperclip, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { docLinkClick, openHtml } from "../lib/openDoc.js";
import { supabase } from "../lib/supabase.js";
import { NovaLandingMark } from "./LandingView.jsx";
import { Tm } from "../components/BrandMark.jsx";
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
  const [view, setView] = useState("proposal");   // "proposal" | "deck" | "summary" | "files"

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
    const args = { p_token: token, p_decision: decision, p_name: name.trim(), p_note: note.trim() || null, p_option: decision === "accepted" ? (chosen ?? null) : null };
    const { error: e } = await supabase.rpc(data?.recipient ? "proposal_decide_link" : "proposal_decide_v2", args);
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
          <span style={{ color: "#4F6EF7" }}>Arena</span> <span style={{ color: "rgba(255,255,255,.85)" }}>Solutions Platform<Tm /></span>
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
  // Cards of this link (a recipient link may include only some of them).
  const avail = { proposal: !!data.html, deck: !!data.deck_html, summary: !!data.summary_html, files: (data.attachments ?? []).length > 0 };
  const CARDS = [
    { k: "proposal", I: FileText, t: lang === "es" ? "Propuesta" : "Proposal", sub: lang === "es" ? "Documento comercial" : "Commercial document" },
    { k: "deck", I: Presentation, t: lang === "es" ? "Presentación" : "Presentation", sub: lang === "es" ? "Diapositivas" : "Slides" },
    { k: "summary", I: ScrollText, t: lang === "es" ? "Resumen de anexos" : "Attachments summary", sub: lang === "es" ? "Resumen técnico" : "Technical summary" },
    { k: "files", I: Paperclip, t: lang === "es" ? "Anexos" : "Attachments", sub: `${(data.attachments ?? []).length} ${lang === "es" ? "archivos" : "files"}` },
  ];
  const curView = avail[view] ? view : (CARDS.find(c => avail[c.k])?.k ?? null);
  const canDecide = !data.recipient || data.recipient.can_decide;
  const expired = data.valid_until && new Date(data.valid_until + "T23:59:59") < new Date();

  return (
    <div style={PAGE}>
      {Header}
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-3 min-w-0">
          {/* Four cards: enabled when this link includes them, locked otherwise */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CARDS.map(c => {
              const on = avail[c.k]; const active = curView === c.k;
              return (
                <button key={c.k} type="button" disabled={!on} onClick={() => setView(c.k)}
                  className="rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                  style={{ background: active ? "rgba(79,110,247,.22)" : "rgba(255,255,255,.04)", border: `1px solid ${active ? "#4F6EF7" : "rgba(255,255,255,.1)"}`, opacity: on ? 1 : 0.4 }}>
                  <span className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: on ? "rgba(79,110,247,.18)" : "rgba(255,255,255,.06)", color: on ? "#A5B4FC" : "#64748B" }}>
                      {on ? <c.I size={16} /> : <Lock size={14} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{c.t}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{on ? c.sub : (lang === "es" ? "No incluido" : "Not included")}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {curView && curView !== "files" && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {curView === "deck" && (
                <button onClick={() => openHtml(data.deck_html)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white border border-white/20 hover:bg-white/10">
                  <Maximize2 size={14} />{lang === "es" ? "Pantalla completa" : "Full screen"}
                </button>
              )}
              <button onClick={() => openHtml(curView === "deck" ? data.deck_html : curView === "summary" ? data.summary_html : data.html, { print: true })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#4F6EF7] hover:bg-[#3d5bea]">
                <Download size={14} />{lang === "es" ? "Descargar PDF" : "Download PDF"}
              </button>
            </div>
          )}

          {!curView ? (
            <p className="rounded-2xl p-6 text-sm text-gray-400" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>{lang === "es" ? "No hay documentos disponibles en este enlace." : "There are no documents in this link."}</p>
          ) : curView === "deck" ? (
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0B1220]">
              <iframe key="deck" title="presentation" srcDoc={data.deck_html} className="w-full aspect-video block" sandbox="allow-scripts" />
            </div>
          ) : curView === "files" ? (
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                {data.attachments.map(a => {
                  const ext = (String(a.file_name ?? "").match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
                  const base = String(a.file_name ?? "").replace(/\.[a-z0-9]{1,5}$/i, ""); const parts = base.split("_");
                  const short = (parts.length > 2 ? parts.slice(2).join("_") : base).slice(0, 15);
                  return (
                    <a key={a.doc_id ?? a.file_name} href={a.file_url} onClick={docLinkClick(a.file_url, a.file_name)} target="_blank" rel="noreferrer" title={a.file_name}
                      className="aspect-square min-w-0 flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl hover:bg-white/10 transition"
                      style={{ border: "1px solid rgba(255,255,255,.12)" }}>
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(79,110,247,.18)", color: "#A5B4FC" }}><FileText size={18} /></span>
                      <span className="w-full text-center text-[11px] leading-tight font-medium text-gray-200 break-all line-clamp-2">{short}</span>
                      {ext && <span className="text-[9px] uppercase tracking-wide text-gray-500">{ext}</span>}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white min-h-[70vh]">
              <iframe key={curView} title={curView} srcDoc={(curView === "summary" ? data.summary_html : data.html).replace("</head>", "<style>.print-btn{display:none!important}</style></head>")} className={`w-full ${embedded ? "h-[70vh]" : "h-[78vh]"} bg-white`} sandbox="allow-same-origin allow-popups allow-modals" />
            </div>
          )}
        </div>
        <aside className="space-y-4">
          {data.recipient?.name && (
            <p className="text-gray-400 text-xs px-1">{lang === "es" ? "Enlace de" : "Link for"} <span className="text-gray-200 font-semibold">{data.recipient.name}</span></p>
          )}
          {data.totals && (
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
          ) : !canDecide ? (
            <div className="rounded-2xl p-4 text-sm text-gray-300" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
              {lang === "es" ? "Este enlace es de consulta: la decisión sobre la propuesta la toma otra persona de su equipo." : "This link is for viewing: someone else in your team decides on the proposal."}
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

// ─── /proposal-preview/:id — the customer page with a draft's data, opened from the proposal editor ──
// The editor saves the data in this browser's localStorage under PREVIEW_KEY(id); nothing is loaded
// from the server, so the page works for drafts and the link is never opened for the customer.
export const PREVIEW_KEY = id => `arena_proposal_preview_${id}`;

export function ProposalPreviewPage({ id }) {
  const read = () => { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY(id)) ?? "null"); } catch { return null; } };
  const [data, setData] = useState(read);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onStorage = e => { if (e.key === PREVIEW_KEY(id)) setData(read()); };   // editor opened the preview again
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [id]);
  const es = (data?.language ?? navigator.language ?? "").startsWith("es");
  if (!data) {
    return (
      <div style={{ ...BG, alignItems: "center", justifyContent: "center" }} className="px-6 text-center">
        <AlertCircle size={28} className="text-amber-400 mb-3" />
        <p className="text-white font-semibold mb-1">{es ? "No hay vista previa" : "No preview"}</p>
        <p className="text-gray-400 text-sm max-w-sm">{es ? "Abre la vista previa desde la propuesta (paso Anexos y envío → Ver como el cliente)." : "Open the preview from the proposal (Attach & send step → Preview customer view)."}</p>
      </div>
    );
  }
  const { _link, _draft, _at, ...preview } = data;
  return (
    <div style={{ background: "#0B0F1A", minHeight: "100dvh" }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-white/10" style={{ background: "#111829" }}>
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md" style={{ background: "rgba(245,158,11,.15)", color: "#FCD34D" }}>{es ? "Vista del cliente · previsualización" : "Customer view · preview"}</span>
        <span className="text-xs text-gray-400">
          {_draft ? (es ? "El enlace se abre para el cliente cuando envíes la propuesta." : "The link opens for the customer once you send the proposal.") : (es ? "Esta es la página que tiene el cliente." : "This is the page the customer has.")}
          {_at ? ` · ${new Date(_at).toLocaleTimeString()}` : ""}
        </span>
        {_link && (
          <div className="flex items-center gap-1.5 flex-1 min-w-[14rem] md:max-w-md md:ml-auto">
            <input readOnly value={_link} className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1.5 bg-white/5 border border-white/10 text-gray-300" />
            <button onClick={() => { navigator.clipboard?.writeText(_link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-gray-300 hover:text-white p-1.5" title={es ? "Copiar enlace" : "Copy link"}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
          </div>
        )}
      </div>
      <ProposalReviewView key={_at} preview={preview} token={null} />
    </div>
  );
}
