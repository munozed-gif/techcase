// Delivery side of won deals: named requests a partner answers, and open projects that partners
// (owner/admin) and team owners bid on. The customer's name stays hidden until the award.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Gavel, Check, X, Briefcase, Clock, Undo2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { usePartnerContext } from "../hooks/usePartnerContext.js";
import { NEED_TYPES, lbl, money, errText } from "../lib/sales.js";

const inp = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";

function useMyOwnedTeams(userId) {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    if (!userId) return;
    supabase.from("consultant_team_members").select("team_id, role, team:team_id(id, name)").eq("user_id", userId).eq("role", "owner")
      .then(({ data }) => setTeams((data ?? []).map(r => r.team).filter(Boolean)));
  }, [userId]);
  return teams;
}

function CasesList({ cases, es }) {
  if (!cases?.length) return null;
  const total = cases.reduce((a, c) => a + (Number(c.estimated_hours) || 0), 0);
  return (
    <div className="text-xs text-gray-600 bg-gray-50 rounded-lg border border-gray-100 p-2 space-y-0.5">
      {cases.slice(0, 6).map((c, i) => (
        <div key={i} className="flex justify-between gap-2"><span className="truncate">• {c.title}</span>{c.estimated_hours ? <span className="text-gray-400 flex-shrink-0">{c.estimated_hours} h</span> : null}</div>
      ))}
      {cases.length > 6 && <div className="text-gray-400">+{cases.length - 6}</div>}
      {total > 0 && <div className="text-gray-500 font-semibold pt-1 border-t border-gray-100">{es ? "Total estimado" : "Estimated total"}: {total} h</div>}
    </div>
  );
}

function BidModal({ es, tender, partners, teams, onClose, onDone }) {
  const L = (en, sp) => (es ? sp : en);
  const options = [...partners.map(p => ({ key: "p:" + p.id, label: p.name, partner: p.id })), ...teams.map(t => ({ key: "t:" + t.id, label: `${L("Team", "Equipo")}: ${t.name}`, team: t.id }))];
  const prev = tender.my_bids?.find(b => b.status === "submitted");
  const [who, setWho] = useState(prev ? (prev.partner_id ? "p:" + prev.partner_id : "t:" + prev.team_id) : options[0]?.key ?? "");
  const [price, setPrice] = useState(prev?.price ?? "");
  const [cur, setCur] = useState(prev?.currency ?? tender.currency ?? "USD");
  const [start, setStart] = useState(prev?.start_date ?? "");
  const [team, setTeam] = useState(prev?.team_summary ?? "");
  const [note, setNote] = useState(prev?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sel = options.find(o => o.key === who);

  async function submit() {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("delivery_bid", {
      p_opportunity: tender.opportunity_id, p_partner: sel?.partner ?? null, p_team: sel?.team ?? null,
      p_price: price === "" ? null : Number(price), p_currency: cur, p_start: start || null, p_team_summary: team, p_note: note,
    });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    onDone();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">{L("Bid to deliver", "Ofertar para entregar")} — {tender.title}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <label className="block text-xs font-semibold text-gray-600">{L("Bid as", "Ofertar como")}
          <select value={who} onChange={e => setWho(e.target.value)} className={inp + " mt-1 bg-white"}>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 text-xs font-semibold text-gray-600">{L("Total price", "Precio total")}
            <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Currency", "Moneda")}
            <input value={cur} onChange={e => setCur(e.target.value.toUpperCase())} className={inp + " mt-1"} /></label>
        </div>
        <label className="block text-xs font-semibold text-gray-600">{L("Earliest start", "Inicio más temprano")}
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inp + " mt-1"} /></label>
        <label className="block text-xs font-semibold text-gray-600">{L("Proposed team (roles, seniority, people)", "Equipo propuesto (roles, seniority, personas)")}
          <textarea rows={3} value={team} onChange={e => setTeam(e.target.value)} className={inp + " mt-1"} /></label>
        <label className="block text-xs font-semibold text-gray-600">{L("Note to the seller", "Nota para el vendedor")}
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={inp + " mt-1"} /></label>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Cancel", "Cancelar")}</button>
          <button onClick={submit} disabled={busy || !sel || price === ""} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}{prev ? L("Update bid", "Actualizar oferta") : L("Send bid", "Enviar oferta")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Projects open for delivery bids. compact: render nothing when there are none (Arena). */
export function OpenTendersPanel({ lang, userId, compact = false }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const ctx = usePartnerContext(userId);
  const teams = useMyOwnedTeams(userId);
  const [rows, setRows] = useState(null);
  const [bidding, setBidding] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("delivery_open_tenders");
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withdraw(id) {
    const { error } = await supabase.rpc("delivery_withdraw", { p_delivery: id });
    if (error) setMsg(errText(error)); else load();
  }

  if (!rows) return compact ? null : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>;
  if (compact && rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center"><Gavel size={14} /></div>
        <div className="font-bold text-gray-900 text-sm">{L("Projects open for delivery bids", "Proyectos abiertos a ofertas de entrega")}</div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{rows.length}</span>
      </div>
      {msg && <div className="text-xs text-red-600">{msg}</div>}
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6 text-center">
          {L("No projects are open for bidding right now.", "No hay proyectos abiertos a ofertas por ahora.")}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map(t => {
            const mine = (t.my_bids ?? []).find(b => b.status === "submitted");
            return (
              <div key={t.opportunity_id} className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{t.title}</div>
                    <div className="text-[11px] text-gray-500">
                      {lbl(NEED_TYPES, t.need_type, es)}{t.sap_area ? ` · ${t.sap_area}` : ""}{t.industry ? ` · ${t.industry}` : ""}{t.country ? ` · ${t.country}` : ""}
                      {t.solution ? ` · ${t.solution}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{t.bids} {L("bids", "ofertas")}</span>
                </div>
                {t.description && <div className="text-xs text-gray-600 line-clamp-3">{t.description}</div>}
                <CasesList cases={t.cases} es={es} />
                <div className="flex items-center justify-between gap-2 pt-1">
                  {mine ? <span className="text-xs text-green-700 font-semibold">{L("Your bid", "Tu oferta")}: {money(mine.price, mine.currency)}</span> : <span />}
                  <div className="flex gap-1">
                    {mine && <button onClick={() => withdraw(mine.id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title={L("Withdraw", "Retirar")}><Undo2 size={13} /></button>}
                    <button onClick={() => setBidding(t)} disabled={!ctx.manageablePartners.length && !teams.length}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                      {mine ? L("Edit bid", "Editar oferta") : L("Bid", "Ofertar")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {bidding && (
        <BidModal es={es} tender={bidding} partners={ctx.manageablePartners} teams={teams}
          onClose={() => setBidding(null)} onDone={() => { setBidding(null); load(); }} />
      )}
    </div>
  );
}

/** Named delivery requests sent to my partners. */
export function DeliveryRequestsPanel({ lang, onNavigate }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("delivery_requests_for_me");
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function answer(r, accept) {
    let note = null;
    if (!accept) { note = window.prompt(L("Reason (optional)", "Motivo (opcional)")) ?? null; }
    setBusy(r.id); setError(null);
    const { error: e } = await supabase.rpc("delivery_respond", { p_delivery: r.id, p_accept: accept, p_note: note });
    setBusy(null);
    if (e) setError(errText(e)); else load();
  }

  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>;
  const statusPill = s => ({
    requested: ["bg-amber-100 text-amber-700", L("Waiting for you", "Esperando tu respuesta")],
    awarded: ["bg-green-100 text-green-700", L("Accepted", "Aceptada")],
    declined: ["bg-gray-100 text-gray-500", L("Declined", "Rechazada")],
    withdrawn: ["bg-gray-100 text-gray-500", L("Withdrawn by the seller", "Retirada por el vendedor")],
    not_selected: ["bg-gray-100 text-gray-500", L("Closed", "Cerrada")],
  }[s] ?? ["bg-gray-100 text-gray-500", s]);
  return (
    <div className="space-y-3">
      <div className="font-bold text-gray-900 text-sm flex items-center gap-2"><Briefcase size={15} className="text-violet-600" />{L("Delivery requests", "Solicitudes de entrega")}</div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-6 text-center">
          {L("No seller has asked your partner to deliver a project yet.", "Ningún vendedor ha pedido aún a tu partner entregar un proyecto.")}
        </div>
      ) : rows.map(r => {
        const [cls, label] = statusPill(r.status);
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-gray-900 text-sm">{r.opportunity?.title}</div>
                <div className="text-[11px] text-gray-500">
                  {r.opportunity?.company} · {lbl(NEED_TYPES, r.opportunity?.need_type, es)}{r.opportunity?.sap_area ? ` · ${r.opportunity.sap_area}` : ""}
                  {" · "}{L("Seller", "Vendedor")}: {r.opportunity?.seller ?? "—"} · {r.partner_name}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
            </div>
            {r.opportunity?.description && <div className="text-xs text-gray-600">{r.opportunity.description}</div>}
            {r.note && <div className="text-xs text-gray-500 italic">“{r.note}”</div>}
            <CasesList cases={r.cases} es={es} />
            <div className="flex justify-end gap-2">
              {r.status === "requested" && (
                <>
                  <button onClick={() => answer(r, false)} disabled={busy === r.id} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-600 hover:bg-gray-100 flex items-center gap-1"><X size={12} />{L("Decline", "Rechazar")}</button>
                  <button onClick={() => answer(r, true)} disabled={busy === r.id} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}{L("Accept and deliver", "Aceptar y entregar")}
                  </button>
                </>
              )}
              {r.status === "awarded" && r.project_id && onNavigate && (
                <button onClick={() => onNavigate("projects", { projectId: r.project_id })} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">{L("Open project", "Abrir proyecto")}</button>
              )}
              {r.status === "requested" && <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock size={10} />{new Date(r.created_at).toLocaleDateString()}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
