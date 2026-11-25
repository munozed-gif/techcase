// Sales: sellers (independent or inside a partner) register opportunities, build the proposal in a
// presale project, and once the customer accepts, decide who delivers it. One-time commission on the
// accepted proposal value.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, Plus, X, TrendingUp, ShieldCheck, Briefcase, Package, DollarSign, ExternalLink, Trophy,
  Gavel, Users, Handshake, Globe2, AlertTriangle, CheckCircle2, Clock, Ban, Pencil,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { usePartnerContext } from "../hooks/usePartnerContext.js";
import {
  STAGES, stageOf, NEED_TYPES, PAYERS, DELIVERY_MODES, lbl, money, errText, useMySeller,
} from "../lib/sales.js";
import { SolutionCard } from "../components/SolutionsEditor.jsx";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";

const inp = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";

// ── Become a seller (Profile, Sales) ──────────────────────────────────────────
export function BecomeSellerCard({ auth, lang, compact = false }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const { seller, loading, refresh } = useMySeller(auth.user?.id);
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { settings } = useSystemSettings() ?? {};
  // Seller program switched off in Settings → Sign-up access: no new requests (existing sellers keep their status).
  const signupRoles = settings?.signup_roles_visible;
  const sellerOpen = !Array.isArray(signupRoles) || signupRoles.includes("seller");
  if (loading) return null;
  if (["client", "invited_client", "final_user", "key_user"].includes(auth.role)) return null;
  if (!sellerOpen && !["approved", "pending"].includes(seller?.status)) return null;

  async function request() {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("seller_request", { p_headline: headline, p_note: note });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setOpen(false); refresh();
  }

  const box = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5";
  if (seller?.status === "approved") {
    if (compact) return null;
    return (
      <div className={box}>
        <div className="flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 size={16} />{L("You are a seller", "Eres vendedor")}{seller.partner_name ? ` · ${seller.partner_name}` : ""}</div>
        <p className="text-xs text-gray-500 mt-1">{L("Open Sales in the menu to register opportunities.", "Abre Ventas en el menú para registrar oportunidades.")}</p>
      </div>
    );
  }
  if (seller?.status === "pending") {
    return (
      <div className={box}>
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700"><Clock size={16} />{L("Seller request pending", "Solicitud de vendedor pendiente")}</div>
        <p className="text-xs text-gray-500 mt-1">{L("An administrator will review it. You will get a notification.", "Un administrador la revisará. Recibirás una notificación.")}</p>
      </div>
    );
  }
  return (
    <div className={box}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><TrendingUp size={18} /></div>
        <div className="flex-1">
          <div className="text-sm font-bold text-gray-900">{L("Sell SAP projects", "Vende proyectos SAP")}</div>
          <p className="text-xs text-gray-500 mt-0.5">
            {L("Find customers, build the proposal with the platform, and earn a one-time commission when the customer accepts. Delivery can go to your team, a partner, or open bidding.",
               "Encuentra clientes, arma la propuesta con la plataforma y gana una comisión única cuando el cliente acepta. La entrega puede ir a tu equipo, a un partner o a licitación abierta.")}
          </p>
          {seller?.status === "rejected" && <p className="text-xs text-red-600 mt-1">{L("Your previous request was rejected", "Tu solicitud anterior fue rechazada")}{seller.review_note ? `: ${seller.review_note}` : ""}.</p>}
          {seller?.status === "suspended" && <p className="text-xs text-red-600 mt-1">{L("Your seller access is suspended.", "Tu acceso de vendedor está suspendido.")}</p>}
          {!open && seller?.status !== "suspended" && (
            <button onClick={() => setOpen(true)} className="mt-3 px-3 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
              {L("Become a seller", "Ser vendedor")}
            </button>
          )}
          {open && (
            <div className="mt-3 space-y-2">
              <input value={headline} onChange={e => setHeadline(e.target.value)} className={inp} placeholder={L("Your sales focus (e.g. S/4HANA for retail, LATAM)", "Tu enfoque comercial (ej. S/4HANA para retail, LATAM)")} />
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder={L("Experience, network, references…", "Experiencia, red de contactos, referencias…")} />
              {error && <div className="text-xs text-red-600">{error}</div>}
              <div className="flex gap-2">
                <button onClick={request} disabled={busy} className="px-3 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1">
                  {busy && <Loader2 size={13} className="animate-spin" />}{L("Send request", "Enviar solicitud")}
                </button>
                <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Cancel", "Cancelar")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Commissions (seller: own; staff: all with payout actions) ────────────────
function CommissionAction({ row, mode, es, onClose, onDone }) {
  const L = (en, sp) => (es ? sp : en);
  const [amount, setAmount] = useState(row.amount ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    setBusy(true); setError(null);
    let res;
    if (mode === "pay") res = await supabase.rpc("sales_commission_record_payment", { p_id: row.id, p_paid_at: date || null, p_ref: ref || null, p_note: note || null });
    else if (mode === "amount") res = await supabase.rpc("sales_commission_set_amount", { p_id: row.id, p_amount: amount === "" ? null : Number(amount), p_note: note || null });
    else res = await supabase.rpc("sales_commission_cancel", { p_id: row.id, p_note: note });
    setBusy(false);
    if (res.error) { setError(errText(res.error)); return; }
    onDone();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">{mode === "pay" ? L("Record payout", "Registrar pago") : mode === "amount" ? L("Adjust commission", "Ajustar comisión") : L("Cancel commission", "Cancelar comisión")}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500">{row.seller?.full_name} · “{row.opportunity?.title}” · <strong>{money(row.amount, row.currency)}</strong></div>
        {mode === "pay" && (<>
          <label className="block text-xs font-semibold text-gray-600">{L("Payment date", "Fecha de pago")}<input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp + " mt-1"} /></label>
          <label className="block text-xs font-semibold text-gray-600">{L("Payment reference", "Referencia de pago")}<input value={ref} onChange={e => setRef(e.target.value)} className={inp + " mt-1"} /></label>
        </>)}
        {mode === "amount" && (
          <label className="block text-xs font-semibold text-gray-600">{L("Amount", "Importe")} ({row.currency})<input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={inp + " mt-1"} /></label>
        )}
        <label className="block text-xs font-semibold text-gray-600">{mode === "cancel" ? L("Reason (required)", "Motivo (obligatorio)") : L("Note", "Nota")}
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={inp + " mt-1"} /></label>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Close", "Cerrar")}</button>
          <button onClick={save} disabled={busy || (mode === "cancel" && !note.trim())}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 flex items-center gap-2 ${mode === "cancel" ? "bg-red-600" : "bg-violet-600"}`}>
            {busy && <Loader2 size={14} className="animate-spin" />}{L("Save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalesCommissionsTable({ lang, staff = false }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [action, setAction] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("sales_commissions_list");
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>;
  const live = rows.filter(r => r.payout_status !== "cancelled");
  const sum = l => l.reduce((a, r) => a + Number(r.amount || 0), 0);
  const pill = s => ({ pending: ["bg-amber-100 text-amber-700", L("Pending", "Pendiente")], paid: ["bg-green-100 text-green-700", L("Paid", "Pagada")], cancelled: ["bg-gray-100 text-gray-500", L("Cancelled", "Cancelada")] }[s]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[[L("Total", "Total"), sum(live), "text-purple-600"], [L("Paid out", "Pagado"), sum(live.filter(r => r.payout_status === "paid")), "text-green-600"],
          [L("Pending", "Pendiente"), sum(live.filter(r => r.payout_status === "pending")), "text-amber-600"]].map(([l, v, c]) => (
          <div key={l} className="p-3 bg-gray-50 rounded-xl border border-gray-100"><div className="text-xs text-gray-500">{l}</div><div className={`text-lg font-black ${c}`}>{money(v)}</div></div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">
          <DollarSign size={28} className="mx-auto mb-2 opacity-20" />{L("No commissions yet. A commission is created when the customer accepts the proposal.", "Aún no hay comisiones. Se crea cuando el cliente acepta la propuesta.")}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
              {staff && <th className="text-left px-4 py-2.5">{L("Seller", "Vendedor")}</th>}
              <th className="text-left px-4 py-2.5">{L("Deal", "Negocio")}</th>
              <th className="text-right px-4 py-2.5">{L("Commission", "Comisión")}</th>
              <th className="text-left px-4 py-2.5">{L("Paid by", "Paga")}</th>
              <th className="text-left px-4 py-2.5">{L("Invoice", "Factura")}</th>
              <th className="text-left px-4 py-2.5">{L("Payout", "Pago")}</th>
              {staff && <th />}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const [cls, label] = pill(r.payout_status);
                return (
                  <tr key={r.id} className="align-top">
                    {staff && <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{r.seller?.full_name}</td>}
                    <td className="px-4 py-3 text-xs"><div className="font-medium text-gray-800">{r.opportunity?.title}</div><div className="text-gray-400">{r.opportunity?.company}</div></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className={`font-black ${r.payout_status === "cancelled" ? "text-gray-400 line-through" : "text-purple-600"}`}>{money(r.amount, r.currency)}</div>
                      <div className="text-[10px] text-gray-400">{r.pct}% × {money(r.base_amount, r.currency)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{lbl(PAYERS, r.payer, es)}</td>
                    <td className="px-4 py-3 text-xs">{r.invoice ? <><div className="font-mono">{r.invoice.number}</div><div className="text-gray-400">{r.invoice.status}</div></> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                      {r.paid_at && <div className="text-[10px] text-gray-400 mt-1">{r.paid_at}{r.payment_ref ? ` · ${r.payment_ref}` : ""}</div>}
                      {r.note && <div className="text-[10px] text-gray-400 mt-1 max-w-[160px]">{r.note}</div>}
                    </td>
                    {staff && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.payout_status === "pending" && (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setAction({ row: r, mode: "pay" })} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200">{L("Record payout", "Registrar pago")}</button>
                            <button onClick={() => setAction({ row: r, mode: "amount" })} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={13} /></button>
                            <button onClick={() => setAction({ row: r, mode: "cancel" })} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Ban size={13} /></button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {action && <CommissionAction row={action.row} mode={action.mode} es={es} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} />}
    </div>
  );
}

// ── Opportunity form ──────────────────────────────────────────────────────────
function OpportunityForm({ es, initial, solutions, defaultPayer, defaultPct, onClose, onSaved }) {
  const L = (en, sp) => (es ? sp : en);
  const won = initial?.stage === "won";
  const [f, setF] = useState(() => ({
    title: "", prospect_company: "", contact_name: "", contact_email: "", contact_phone: "", country: "", industry: "",
    need_type: "implementation", sap_area: "", description: "", solution_id: "", est_value: "", currency: "USD", expected_close: "",
    commission_pct: defaultPct ?? "", commission_payer: defaultPayer ?? "customer",
    ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])),
  }));
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function check() {
    if (!f.prospect_company.trim()) { setConflict(null); return; }
    const { data } = await supabase.rpc("sales_check_conflict", { p_company: f.prospect_company, p_email: f.contact_email || null, p_exclude: initial?.id ?? null });
    setConflict(data?.conflict ? data : null);
  }
  function pickSolution(id) {
    const s = solutions.find(x => x.id === id);
    setF(p => ({ ...p, solution_id: id, ...(s && !p.title ? { title: s.title } : {}), ...(s && !p.sap_area ? { sap_area: (s.sap_areas ?? [])[0] ?? "" } : {}),
      ...(s ? { need_type: "solution" } : {}), ...(s && !p.est_value && s.price ? { est_value: s.price, currency: s.currency } : {}) }));
  }
  async function save() {
    setBusy(true); setError(null);
    const keys = ["title", "prospect_company", "contact_name", "contact_email", "contact_phone", "country", "industry", "need_type", "sap_area",
      "description", "solution_id", "est_value", "currency", "expected_close", ...(won ? [] : ["commission_pct", "commission_payer"])];
    const p = Object.fromEntries(keys.map(k => [k, f[k] === "" ? null : f[k]]));
    const { data, error: e } = await supabase.rpc("opportunity_save", { p_id: initial?.id ?? null, p });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    onSaved(data);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">{initial?.id ? L("Edit opportunity", "Editar oportunidad") : L("New opportunity", "Nueva oportunidad")}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {solutions.length > 0 && (
          <label className="block text-xs font-semibold text-gray-600">{L("Packaged solution (optional)", "Solución empaquetada (opcional)")}
            <select value={f.solution_id ?? ""} onChange={e => pickSolution(e.target.value)} className={inp + " mt-1 bg-white"}>
              <option value="">{L("— None, custom need —", "— Ninguna, necesidad a medida —")}</option>
              {solutions.map(s => <option key={s.id} value={s.id}>{s.title}{s.partner_name ? ` · ${s.partner_name}` : ""}</option>)}
            </select></label>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2 text-xs font-semibold text-gray-600">{L("Opportunity", "Oportunidad")}
            <input value={f.title} onChange={e => set("title", e.target.value)} className={inp + " mt-1"} placeholder={L("S/4HANA migration", "Migración a S/4HANA")} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Company", "Empresa")}
            <input value={f.prospect_company} onChange={e => set("prospect_company", e.target.value)} onBlur={check} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Contact name", "Nombre del contacto")}
            <input value={f.contact_name} onChange={e => set("contact_name", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Contact email", "Email del contacto")}
            <input type="email" value={f.contact_email} onChange={e => set("contact_email", e.target.value)} onBlur={check} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Contact phone", "Teléfono del contacto")}
            <input value={f.contact_phone} onChange={e => set("contact_phone", e.target.value)} className={inp + " mt-1"} /></label>
          {conflict && (
            <div className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {L(`This customer is already registered by another seller${conflict.seller ? ` (${conflict.seller})` : ""} until ${conflict.until}.`,
                 `Este cliente ya está registrado por otro vendedor${conflict.seller ? ` (${conflict.seller})` : ""} hasta el ${conflict.until}.`)}
            </div>
          )}
          <label className="text-xs font-semibold text-gray-600">{L("Country", "País")}
            <input value={f.country} onChange={e => set("country", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Industry", "Industria")}
            <input value={f.industry} onChange={e => set("industry", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Need", "Necesidad")}
            <select value={f.need_type} onChange={e => set("need_type", e.target.value)} className={inp + " mt-1 bg-white"}>
              {NEED_TYPES.map(n => <option key={n.id} value={n.id}>{es ? n.es : n.en}</option>)}
            </select></label>
          <label className="text-xs font-semibold text-gray-600">{L("SAP area", "Área SAP")}
            <input value={f.sap_area} onChange={e => set("sap_area", e.target.value)} className={inp + " mt-1"} placeholder="FI, MM, EWM…" /></label>
          <label className="sm:col-span-2 text-xs font-semibold text-gray-600">{L("What the customer needs", "Qué necesita el cliente")}
            <textarea rows={3} value={f.description} onChange={e => set("description", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Estimated value", "Valor estimado")}
            <div className="flex gap-2 mt-1">
              <input type="number" min="0" value={f.est_value} onChange={e => set("est_value", e.target.value)} className={inp} />
              <input value={f.currency} onChange={e => set("currency", e.target.value.toUpperCase())} className={inp + " w-20"} />
            </div></label>
          <label className="text-xs font-semibold text-gray-600">{L("Expected close", "Cierre esperado")}
            <input type="date" value={f.expected_close ?? ""} onChange={e => set("expected_close", e.target.value)} className={inp + " mt-1"} /></label>
        </div>
        <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 text-xs font-bold text-violet-800">{L("Your commission (one-time, on the accepted proposal)", "Tu comisión (única, sobre la propuesta aceptada)")}</div>
          <label className="text-xs font-semibold text-gray-600">%
            <input type="number" min="0" max="100" step="0.5" disabled={won} value={f.commission_pct} onChange={e => set("commission_pct", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Who pays it", "Quién la paga")}
            <select disabled={won} value={f.commission_payer} onChange={e => set("commission_payer", e.target.value)} className={inp + " mt-1 bg-white"}>
              {PAYERS.map(p => <option key={p.id} value={p.id}>{es ? p.es : p.en}</option>)}
            </select></label>
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Cancel", "Cancelar")}</button>
          <button onClick={save} disabled={busy || !f.title.trim() || !f.prospect_company.trim() || (!initial?.id && !!conflict)}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}{L("Save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delivery handoff ─────────────────────────────────────────────────────────
function DeliveryPanel({ es, opp, userId, onChanged, onNavigate }) {
  const L = (en, sp) => (es ? sp : en);
  const ctx = usePartnerContext(userId);
  const [mode, setMode] = useState(opp.delivery_mode ?? (opp.partner_id ? "own" : "partner"));
  const [teams, setTeams] = useState([]);
  const [dir, setDir] = useState([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const deliveries = opp.deliveries ?? [];
  const awarded = deliveries.find(d => d.status === "awarded");
  const bids = deliveries.filter(d => d.mode === "bid" && d.status === "submitted");
  const requests = deliveries.filter(d => d.mode === "request");

  useEffect(() => {
    supabase.from("consultant_team_members").select("role, status, team:team_id(id, name)").eq("user_id", userId)
      .then(({ data }) => setTeams((data ?? []).filter(r => r.role === "owner" || r.status === "accepted").map(r => r.team).filter(Boolean)));
    supabase.rpc("delivery_partner_directory").then(({ data }) => setDir(Array.isArray(data) ? data : []));
  }, [userId]);

  const ownOptions = [
    ...ctx.approvedPartners.map(p => ({ key: "p:" + p.id, label: p.name, partner: p.id })),
    ...teams.map(t => ({ key: "t:" + t.id, label: `${L("Team", "Equipo")}: ${t.name}`, team: t.id })),
  ];

  async function go(m = mode) {
    setBusy(true); setError(null);
    const own = ownOptions.find(o => o.key === target) ?? ownOptions[0];
    const args = { p_opportunity: opp.id, p_mode: m, p_partner: null, p_team: null, p_note: note || null };
    if (m === "own") { args.p_partner = own?.partner ?? null; args.p_team = own?.team ?? null; }
    if (m === "partner") args.p_partner = target || null;
    const { error: e } = await supabase.rpc("delivery_choose", args);
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setTarget(""); setNote(""); onChanged();
  }
  async function award(id) {
    if (!window.confirm(L("Award the delivery to this bid? The other bidders are told they were not selected.", "¿Adjudicar la entrega a esta oferta? Se avisará a los demás que no fueron seleccionados."))) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("delivery_award", { p_delivery: id });
    setBusy(false);
    if (e) setError(errText(e)); else onChanged();
  }

  if (opp.delivery_status === "assigned") {
    return (
      <div className="p-4 rounded-xl border border-green-200 bg-green-50 text-sm">
        <div className="font-semibold text-green-800 flex items-center gap-2"><CheckCircle2 size={15} />{L("Delivery assigned", "Entrega asignada")}</div>
        <div className="text-xs text-green-800 mt-1">
          {opp.delivery_mode === "arena"
            ? L("The cases are published in the Arena for consultants and teams to apply.", "Los casos están publicados en la Arena para que consultores y equipos postulen.")
            : <>{awarded?.partner_name ?? awarded?.team_name}{awarded?.price != null ? ` · ${money(awarded.price, awarded.currency)}` : ""}{awarded?.start_date ? ` · ${L("start", "inicio")} ${awarded.start_date}` : ""}</>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-gray-900">{L("Who delivers it?", "¿Quién lo entrega?")}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {DELIVERY_MODES.map(m => {
          const Icon = { own: Users, partner: Handshake, open: Gavel, arena: Globe2 }[m.id];
          return (
            <button key={m.id} onClick={() => { setMode(m.id); setTarget(""); }}
              className={`text-left p-3 rounded-xl border text-xs ${mode === m.id ? "border-violet-500 bg-violet-50" : "border-gray-200 hover:border-violet-200"}`}>
              <div className="font-semibold text-gray-900 flex items-center gap-1.5"><Icon size={13} />{es ? m.es : m.en}</div>
              <div className="text-gray-500 mt-0.5">{es ? m.desc_es : m.desc_en}</div>
            </button>
          );
        })}
      </div>

      {mode === "own" && (
        ownOptions.length === 0
          ? <div className="text-xs text-gray-500">{L("You have no partner or consultant team yet. Create a team in Profile → Teams, or choose another option.", "Aún no tienes partner ni equipo. Crea un equipo en Perfil → Equipos, o elige otra opción.")}</div>
          : <div className="flex gap-2">
              <select value={target || ownOptions[0]?.key} onChange={e => setTarget(e.target.value)} className={inp + " bg-white"}>
                {ownOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button onClick={() => go()} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white disabled:opacity-50 whitespace-nowrap">{L("Assign", "Asignar")}</button>
            </div>
      )}
      {mode === "partner" && (
        <div className="space-y-2">
          <select value={target} onChange={e => setTarget(e.target.value)} className={inp + " bg-white"}>
            <option value="">{L("Choose a partner…", "Elige un partner…")}</option>
            {dir.filter(p => p.id !== opp.partner_id).map(p => <option key={p.id} value={p.id}>{p.name}{p.country ? ` · ${p.country}` : ""}{p.solutions ? ` · ${p.solutions} ${L("solutions", "soluciones")}` : ""}</option>)}
          </select>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder={L("Message to the partner (scope, dates, budget)", "Mensaje al partner (alcance, fechas, presupuesto)")} />
          <button onClick={() => go()} disabled={busy || !target} className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white disabled:opacity-50">{L("Send request", "Enviar solicitud")}</button>
        </div>
      )}
      {mode === "open" && (opp.delivery_mode === "open"
        ? <div className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg p-2">{L("Open for bids. Partners and team owners see it in their Partner area and in the Arena.", "Abierto a ofertas. Partners y dueños de equipos lo ven en su área de Partner y en la Arena.")}</div>
        : <button onClick={() => go("open")} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white disabled:opacity-50">{L("Open for bids", "Abrir a ofertas")}</button>)}
      {mode === "arena" && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">{L("Each case of the project becomes public in the Arena.", "Cada caso del proyecto pasa a ser público en la Arena.")}</div>
          <button onClick={() => go("arena")} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white disabled:opacity-50">{L("Publish cases in the Arena", "Publicar casos en la Arena")}</button>
        </div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}

      {requests.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-600">{L("Requests", "Solicitudes")}</div>
          {requests.map(r => (
            <div key={r.id} className="text-xs flex justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span>{r.partner_name}</span>
              <span className="text-gray-500">{{ requested: L("waiting", "esperando"), declined: L("declined", "rechazó"), withdrawn: L("withdrawn", "retirada"), not_selected: L("closed", "cerrada"), awarded: L("accepted", "aceptó") }[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      )}
      {opp.delivery_mode === "open" && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-600">{L("Bids", "Ofertas")} ({bids.length})</div>
          {bids.length === 0 && <div className="text-xs text-gray-400">{L("No bids yet.", "Aún no hay ofertas.")}</div>}
          {bids.sort((a, b) => Number(a.price) - Number(b.price)).map(b => (
            <div key={b.id} className="border border-gray-100 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-gray-900">{b.partner_name ?? `${L("Team", "Equipo")}: ${b.team_name}`}</div>
                <div className="font-black text-violet-700">{money(b.price, b.currency)}</div>
              </div>
              {b.start_date && <div className="text-gray-500">{L("Start", "Inicio")}: {b.start_date}</div>}
              {b.team_summary && <div className="text-gray-600 whitespace-pre-wrap">{b.team_summary}</div>}
              {b.note && <div className="text-gray-500 italic">“{b.note}”</div>}
              <div className="flex justify-end"><button onClick={() => award(b.id)} disabled={busy} className="px-3 py-1 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50">{L("Award", "Adjudicar")}</button></div>
            </div>
          ))}
        </div>
      )}
      {opp.project?.id && onNavigate && (
        <button onClick={() => onNavigate("projects", { projectId: opp.project.id })} className="text-xs text-blue-700 hover:underline flex items-center gap-1"><ExternalLink size={11} />{L("Open project", "Abrir proyecto")}</button>
      )}
    </div>
  );
}

// ── Opportunity drawer ───────────────────────────────────────────────────────
function OpportunityDrawer({ es, opp, userId, solutions, onClose, onChanged, onNavigate, onEdit }) {
  const L = (en, sp) => (es ? sp : en);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const st = stageOf(opp.stage);
  const closed = opp.stage === "won" || opp.stage === "lost";
  const protectedDays = opp.protection_until ? Math.ceil((new Date(opp.protection_until) - new Date()) / 86400000) : null;

  async function setStage(stage) {
    let reason = null;
    if (stage === "lost") { reason = window.prompt(L("Why was it lost?", "¿Por qué se perdió?")); if (!reason) return; }
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("opportunity_set_stage", { p_id: opp.id, p_stage: stage, p_reason: reason });
    setBusy(false);
    if (e) setError(errText(e)); else onChanged();
  }
  async function createProject() {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc("opportunity_create_project", { p_id: opp.id });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    onChanged();
    if (data && onNavigate) onNavigate("projects", { projectId: data });
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl p-5 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-lg font-black text-gray-900 leading-tight">{opp.title}</div>
            <div className="text-sm text-gray-500">{opp.prospect_company}{opp.contact_name ? ` · ${opp.contact_name}` : ""}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{es ? st.es : st.en}</span>
              <span className="text-[11px] text-gray-500">{lbl(NEED_TYPES, opp.need_type, es)}{opp.sap_area ? ` · ${opp.sap_area}` : ""}</span>
              {!closed && protectedDays != null && protectedDays >= 0 && (
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><ShieldCheck size={12} />{L(`Protected ${protectedDays} more days`, `Protegido ${protectedDays} días más`)}</span>
              )}
              {opp.seller_name && opp.seller_id !== userId && <span className="text-[11px] text-gray-500">· {opp.seller_name}</span>}
            </div>
          </div>
          {onEdit && <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700"><Pencil size={15} /></button>}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-gray-50 rounded-xl"><div className="text-gray-500">{L("Value", "Valor")}</div><div className="font-bold text-gray-900">{money(opp.est_value, opp.currency)}</div></div>
          <div className="p-3 bg-gray-50 rounded-xl"><div className="text-gray-500">{L("Expected close", "Cierre esperado")}</div><div className="font-bold text-gray-900">{opp.expected_close ?? "—"}</div></div>
          <div className="p-3 bg-gray-50 rounded-xl"><div className="text-gray-500">{L("Contact", "Contacto")}</div><div className="font-medium text-gray-900 break-all">{opp.contact_email ?? "—"}{opp.contact_phone ? ` · ${opp.contact_phone}` : ""}</div></div>
          <div className="p-3 bg-gray-50 rounded-xl"><div className="text-gray-500">{L("Commission", "Comisión")}</div><div className="font-bold text-gray-900">{opp.commission?.amount != null ? money(opp.commission.amount, opp.commission.currency) : `${opp.commission_pct ?? "—"}%`} <span className="font-normal text-gray-500">· {lbl(PAYERS, opp.commission_payer, es)}</span></div></div>
        </div>
        {opp.description && <div className="text-sm text-gray-700 whitespace-pre-wrap">{opp.description}</div>}
        {opp.solution && (() => { const s = solutions.find(x => x.id === opp.solution.id); return s ? <SolutionCard s={s} es={es} /> : <div className="text-xs text-gray-500"><Package size={12} className="inline mr-1" />{opp.solution.title}</div>; })()}
        {opp.stage === "lost" && opp.lost_reason && <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{L("Lost", "Perdida")}: {opp.lost_reason}</div>}

        {/* Steps */}
        {!closed && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-gray-900">{L("Next steps", "Próximos pasos")}</div>
            <div className="flex flex-wrap gap-2">
              {opp.project?.id ? (
                <button onClick={() => onNavigate?.("projects", { projectId: opp.project.id })} className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white flex items-center gap-1"><Briefcase size={13} />{L("Open presale project → Proposals", "Abrir proyecto de preventa → Propuestas")}</button>
              ) : (
                <button onClick={createProject} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Briefcase size={13} />}{L("Create presale project", "Crear proyecto de preventa")}
                </button>
              )}
              {["lead", "qualified", "proposal"].filter(s => s !== opp.stage).map(s => (
                <button key={s} onClick={() => setStage(s)} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{L("Move to", "Mover a")} {lbl(STAGES, s, es)}</button>
              ))}
              <button onClick={() => setStage("lost")} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50">{L("Mark lost", "Marcar perdida")}</button>
            </div>
            <p className="text-[11px] text-gray-500">
              {L("In the presale project, add or estimate the cases and build the proposal (cases, service plan or on demand). When the customer accepts it, the deal is won automatically.",
                 "En el proyecto de preventa agrega o estima los casos y arma la propuesta (casos, plan de servicio o bajo demanda). Cuando el cliente la acepta, el negocio se gana automáticamente.")}
            </p>
          </div>
        )}
        {opp.stage === "lost" && <button onClick={() => setStage("lead")} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700">{L("Reopen", "Reabrir")}</button>}

        {(opp.proposals ?? []).length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-bold text-gray-900">{L("Proposals", "Propuestas")}</div>
            {opp.proposals.map(p => (
              <div key={p.id} className="text-xs flex justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span>{p.title} · v{p.version}</span><span className="text-gray-500">{p.status}{p.total ? ` · ${money(p.total, p.currency)}` : ""}</span>
              </div>
            ))}
          </div>
        )}

        {opp.stage === "won" && (
          <>
            {opp.commission && (
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-800 flex items-center gap-2">
                <Trophy size={14} />{L("Commission", "Comisión")}: <strong>{money(opp.commission.amount, opp.commission.currency)}</strong>
                ({opp.commission.pct}% × {money(opp.commission.base_amount, opp.commission.currency)}) · {opp.commission.payout_status}
              </div>
            )}
            <DeliveryPanel es={es} opp={opp} userId={userId} onChanged={onChanged} onNavigate={onNavigate} />
          </>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────
export function SalesView({ auth, onNavigate }) {
  const { lang } = useT();
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const { seller, loading } = useMySeller(auth.user?.id);
  const staff = auth.isAdmin || auth.isManager;
  const [tab, setTab] = useState("pipeline");
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState(null);
  const [solutions, setSolutions] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);   // {} new | opp edit

  const approved = seller?.status === "approved";
  const load = useCallback(async () => {
    const [{ data }, { data: sols }, { data: s }] = await Promise.all([
      supabase.rpc("opportunities_list", { p_all: all }),
      supabase.rpc("solutions_catalog"),
      supabase.from("system_settings").select("value").eq("key", "sales_settings").maybeSingle(),
    ]);
    setRows(Array.isArray(data) ? data : []);
    setSolutions((Array.isArray(sols) ? sols : []).filter(x => x.status === "published"));
    setCfg(s?.value ?? {});
  }, [all]);
  useEffect(() => { if (approved || staff) load(); }, [approved, staff, load]);

  const open = useMemo(() => rows?.find(r => r.id === openId) ?? null, [rows, openId]);
  const kpi = useMemo(() => {
    const r = rows ?? [];
    const sum = l => l.reduce((a, x) => a + Number(x.est_value || 0), 0);
    return {
      pipeline: sum(r.filter(x => !["won", "lost"].includes(x.stage))),
      won: sum(r.filter(x => x.stage === "won")),
      wonCount: r.filter(x => x.stage === "won").length,
      comm: r.reduce((a, x) => a + (x.commission && x.commission.payout_status !== "cancelled" ? Number(x.commission.amount || 0) : 0), 0),
      toDeliver: r.filter(x => x.stage === "won" && x.delivery_status !== "assigned").length,
    };
  }, [rows]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-gray-300" /></div>;
  if (!approved && !staff) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-black text-gray-900">{L("Sales", "Ventas")}</h1>
        <BecomeSellerCard auth={auth} lang={lang} />
      </div>
    );
  }

  const TABS = [
    { id: "pipeline",    label: L("Pipeline", "Pipeline"), Icon: TrendingUp },
    { id: "solutions",   label: L("Solutions", "Soluciones"), Icon: Package },
    { id: "commissions", label: L("My commissions", "Mis comisiones"), Icon: DollarSign },
  ];
  const cols = STAGES.filter(s => s.id !== "lost");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-gray-900">{L("Sales", "Ventas")}</h1>
          <p className="text-sm text-gray-500">
            {seller?.partner_name ? `${L("Selling for", "Vendiendo para")} ${seller.partner_name}` : approved ? L("Independent seller", "Vendedor independiente") : L("Administrator view", "Vista de administrador")}
          </p>
        </div>
        {staff && (
          <label className="text-xs text-gray-600 flex items-center gap-1.5"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />{L("All sellers", "Todos los vendedores")}</label>
        )}
        {approved && (
          <button onClick={() => setForm({})} className="px-4 py-2 text-sm font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1"><Plus size={15} />{L("New opportunity", "Nueva oportunidad")}</button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[[L("Open pipeline", "Pipeline abierto"), money(kpi.pipeline), "text-blue-600"], [L("Won", "Ganado"), `${money(kpi.won)} · ${kpi.wonCount}`, "text-green-600"],
          [L("Commissions", "Comisiones"), money(kpi.comm), "text-purple-600"], [L("Waiting for delivery", "Pendiente de entrega"), kpi.toDeliver, "text-amber-600"]].map(([l, v, c]) => (
          <div key={l} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm"><div className="text-xs text-gray-500">{l}</div><div className={`text-lg font-black ${c}`}>{v}</div></div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}><Icon size={14} />{label}</button>
        ))}
      </div>

      {tab === "pipeline" && (!rows ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300" /></div> : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {cols.map(col => {
              const list = rows.filter(r => r.stage === col.id);
              return (
                <div key={col.id} className="bg-gray-50 rounded-2xl p-3 min-h-[200px] space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{es ? col.es : col.en}</span>
                    <span className="text-[11px] text-gray-400 ml-auto">{list.length} · {money(list.reduce((a, x) => a + Number(x.est_value || 0), 0))}</span>
                  </div>
                  {list.length === 0 && <div className="text-[11px] text-gray-300 text-center py-6">—</div>}
                  {list.map(o => (
                    <button key={o.id} onClick={() => setOpenId(o.id)} className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-violet-200 space-y-1">
                      <div className="text-sm font-semibold text-gray-900 leading-tight">{o.title}</div>
                      <div className="text-[11px] text-gray-500">{o.prospect_company}{o.sap_area ? ` · ${o.sap_area}` : ""}</div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-gray-700">{money(o.est_value, o.currency)}</span>
                        {o.stage === "won"
                          ? <span className={o.delivery_status === "assigned" ? "text-green-600" : "text-amber-600"}>{o.delivery_status === "assigned" ? L("Delivery assigned", "Entrega asignada") : L("Choose delivery", "Elegir entrega")}</span>
                          : o.project ? <span className="text-blue-600">{L("Project", "Proyecto")}</span> : null}
                      </div>
                      {all && o.seller_name && <div className="text-[10px] text-gray-400">{o.seller_name}</div>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {rows.some(r => r.stage === "lost") && (
            <details className="bg-white rounded-2xl border border-gray-100 p-3">
              <summary className="text-xs font-semibold text-gray-500 cursor-pointer">{L("Lost", "Perdidas")} ({rows.filter(r => r.stage === "lost").length})</summary>
              <div className="mt-2 space-y-1">
                {rows.filter(r => r.stage === "lost").map(o => (
                  <button key={o.id} onClick={() => setOpenId(o.id)} className="w-full text-left text-xs flex justify-between px-2 py-1.5 rounded hover:bg-gray-50">
                    <span>{o.title} · {o.prospect_company}</span><span className="text-gray-400">{o.lost_reason}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      ))}

      {tab === "solutions" && (
        solutions.length === 0
          ? <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100"><Package size={28} className="mx-auto mb-2 opacity-30" />{L("No packaged solutions are published yet. Partners publish them in Partner → Solutions.", "Aún no hay soluciones publicadas. Los partners las publican en Partner → Soluciones.")}</div>
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {solutions.map(s => (
                <SolutionCard key={s.id} s={s} es={es} footer={approved && (
                  <button onClick={() => setForm({ solution_id: s.id, title: s.title, need_type: "solution", sap_area: (s.sap_areas ?? [])[0] ?? "", est_value: s.price ?? "", currency: s.currency })}
                    className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 w-fit">{L("Offer to a customer", "Ofrecer a un cliente")}</button>
                )} />
              ))}
            </div>
      )}

      {tab === "commissions" && <SalesCommissionsTable lang={lang} />}

      {open && (
        <OpportunityDrawer es={es} opp={open} userId={auth.user?.id} solutions={solutions}
          onClose={() => setOpenId(null)} onChanged={load} onNavigate={onNavigate}
          onEdit={(open.seller_id === auth.user?.id || staff) ? () => setForm(open) : null} />
      )}
      {form && (
        <OpportunityForm es={es} initial={form.id ? form : (Object.keys(form).length ? form : null)} solutions={solutions}
          defaultPayer={cfg?.default_payer} defaultPct={seller?.default_commission_pct ?? cfg?.default_commission_pct ?? 5}
          onClose={() => setForm(null)} onSaved={id => { setForm(null); load(); if (id) setOpenId(id); }} />
      )}
    </div>
  );
}
export { OpportunityDrawer, OpportunityForm, DeliveryPanel };
