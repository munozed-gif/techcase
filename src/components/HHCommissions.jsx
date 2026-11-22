// Headhunter placement fees (hh_commissions): created by the DB when the customer accepts an
// application a headhunter submitted. The customer is invoiced; the platform only records the payout.
import { useState, useEffect, useCallback } from "react";
import { Loader2, DollarSign, CheckCircle2, Clock, Pencil, Ban, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const money = (n, cur = "USD") => `${cur === "USD" ? "$" : cur + " "}${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function useHhCommissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc("hh_commissions_list");
    setError(e?.message ?? null);
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { rows, loading, error, reload };
}

export function commissionTotals(rows) {
  const live = rows.filter(r => r.payout_status !== "cancelled");
  const sum = list => list.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const paid = live.filter(r => r.payout_status === "paid");
  const pending = live.filter(r => r.payout_status === "pending");
  return { total: sum(live), paid: sum(paid), pending: sum(pending), paidCount: paid.length, pendingCount: pending.length };
}

function StatusPill({ status, es }) {
  const map = {
    pending:   ["bg-amber-100 text-amber-700", es ? "Pendiente" : "Pending"],
    paid:      ["bg-green-100 text-green-700", es ? "Pagada" : "Paid"],
    cancelled: ["bg-gray-100 text-gray-500", es ? "Cancelada" : "Cancelled"],
  };
  const [cls, label] = map[status] ?? map.pending;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

function InvoicePill({ inv, es }) {
  if (!inv) return <span className="text-xs text-gray-400">—</span>;
  const label = { draft: es ? "Borrador" : "Draft", sent: es ? "Enviada" : "Sent", paid: es ? "Cobrada" : "Collected", overdue: es ? "Vencida" : "Overdue" }[inv.status] ?? inv.status;
  const cls = inv.status === "paid" ? "text-green-700" : inv.status === "overdue" ? "text-red-600" : "text-gray-600";
  return (
    <div className="text-xs leading-tight">
      <div className="font-mono text-gray-700">{inv.number}</div>
      <div className={cls}>{label}{inv.due_date && inv.status !== "paid" ? ` · ${es ? "vence" : "due"} ${inv.due_date}` : ""}</div>
    </div>
  );
}

function ActionModal({ row, mode, es, onClose, onDone }) {
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
    if (mode === "pay") res = await supabase.rpc("hh_commission_record_payment", { p_id: row.id, p_paid_at: date || null, p_ref: ref || null, p_note: note || null });
    else if (mode === "amount") res = await supabase.rpc("hh_commission_set_amount", { p_id: row.id, p_amount: amount === "" ? null : Number(amount), p_note: note || null });
    else res = await supabase.rpc("hh_commission_cancel", { p_id: row.id, p_note: note });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  const title = mode === "pay" ? L("Record payout", "Registrar pago") : mode === "amount" ? L("Adjust fee", "Ajustar comisión") : L("Cancel fee", "Cancelar comisión");
  const inp = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">{title}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500">
          {row.headhunter?.full_name} · {row.consultant?.full_name} · “{row.case?.title}” · <strong>{money(row.amount, row.currency)}</strong>
        </div>
        {mode === "pay" && (
          <>
            <label className="block text-xs font-semibold text-gray-600">{L("Payment date", "Fecha de pago")}
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp + " mt-1"} /></label>
            <label className="block text-xs font-semibold text-gray-600">{L("Payment reference", "Referencia de pago")}
              <input value={ref} onChange={e => setRef(e.target.value)} placeholder={L("Transfer no., receipt…", "Nº de transferencia, recibo…")} className={inp + " mt-1"} /></label>
          </>
        )}
        {mode === "amount" && (
          <label className="block text-xs font-semibold text-gray-600">{L("Amount", "Importe")} ({row.currency})
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inp + " mt-1"} />
            <span className="block font-normal text-gray-400 mt-1">{L("The customer's invoice is updated too.", "También se actualiza la factura del cliente.")}</span></label>
        )}
        <label className="block text-xs font-semibold text-gray-600">{mode === "cancel" ? L("Reason (required)", "Motivo (obligatorio)") : L("Note", "Nota")}
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={inp + " mt-1"} /></label>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Close", "Cerrar")}</button>
          <button onClick={save} disabled={busy || (mode === "cancel" && !note.trim())}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 flex items-center gap-2 ${mode === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"}`}>
            {busy && <Loader2 size={14} className="animate-spin" />}{L("Save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Table of placement fees. `staff` shows the headhunter column and the payout actions. */
export function HHCommissionsTable({ lang, staff = false, data }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const own = useHhCommissions();
  const { rows, loading, error, reload } = data ?? own;
  const [action, setAction] = useState(null);
  const [filter, setFilter] = useState("all");
  const list = filter === "all" ? rows : rows.filter(r => r.payout_status === filter);
  const tot = commissionTotals(rows);
  const srcLabel = s => ({ plan: L("activity plan", "plan de actividades"), default: L("default hours", "horas por defecto"), manual: L("adjusted", "ajustada") }[s] ?? s);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>;

  return (
    <div className="space-y-4">
      {staff && (
        <div className="grid grid-cols-3 gap-3">
          {[[L("Total fees", "Total comisiones"), tot.total, DollarSign, "text-purple-600"],
            [L("Paid out", "Pagado"), tot.paid, CheckCircle2, "text-green-600"],
            [L("Pending payout", "Pendiente de pago"), tot.pending, Clock, "text-amber-600"]].map(([label, v, Icon, cls]) => (
            <div key={label} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="text-xs text-gray-500 flex items-center gap-1"><Icon size={12} />{label}</div>
              <div className={`text-lg font-black ${cls}`}>{money(v)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[["all", L("All", "Todas")], ["pending", L("Pending", "Pendientes")], ["paid", L("Paid", "Pagadas")], ["cancelled", L("Cancelled", "Canceladas")]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {list.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          <DollarSign size={28} className="mx-auto mb-2 opacity-20" />
          {L("No placement fees yet. A fee is created when the customer accepts a candidate you proposed.",
             "Aún no hay comisiones. Se generan cuando el cliente acepta un candidato que propusiste.")}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                {staff && <th className="text-left px-4 py-2.5">{L("Headhunter", "Headhunter")}</th>}
                <th className="text-left px-4 py-2.5">{L("Candidate", "Candidato")}</th>
                <th className="text-left px-4 py-2.5">{L("Case", "Caso")}</th>
                <th className="text-right px-4 py-2.5">{L("Fee", "Comisión")}</th>
                <th className="text-left px-4 py-2.5">{L("Customer invoice", "Factura al cliente")}</th>
                <th className="text-left px-4 py-2.5">{L("Payout", "Pago")}</th>
                {staff && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 align-top">
                  {staff && <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{r.headhunter?.full_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">{r.consultant?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate" title={r.case?.title}>{r.case?.title ?? "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className={`font-black ${r.payout_status === "paid" ? "text-green-600" : r.payout_status === "cancelled" ? "text-gray-400 line-through" : "text-purple-600"}`}>{money(r.amount, r.currency)}</div>
                    <div className="text-[10px] text-gray-400">{r.pct}% × {r.rate ?? 0}/h × {r.base_hours}h · {srcLabel(r.hours_source)}</div>
                  </td>
                  <td className="px-4 py-3"><InvoicePill inv={r.invoice} es={es} /></td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.payout_status} es={es} />
                    {r.paid_at && <div className="text-[10px] text-gray-400 mt-1">{r.paid_at}{r.payment_ref ? ` · ${r.payment_ref}` : ""}</div>}
                    {r.note && <div className="text-[10px] text-gray-400 mt-1 max-w-[180px]">{r.note}</div>}
                  </td>
                  {staff && (
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {r.payout_status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setAction({ row: r, mode: "pay" })}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">{L("Record payout", "Registrar pago")}</button>
                          {r.invoice?.status !== "paid" && (
                            <button onClick={() => setAction({ row: r, mode: "amount" })} title={L("Adjust fee", "Ajustar comisión")}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={13} /></button>
                          )}
                          <button onClick={() => setAction({ row: r, mode: "cancel" })} title={L("Cancel fee", "Cancelar comisión")}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Ban size={13} /></button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {action && <ActionModal row={action.row} mode={action.mode} es={es} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />}
    </div>
  );
}
