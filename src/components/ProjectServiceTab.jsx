// Project → Service: service contracts created from accepted plan / on-demand proposals.
// Shows the hours pool (hours logged on the project's cases, weighted by the hour type factor),
// usage per month, additional hours and the contract invoices.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Receipt, Gauge, CalendarRange, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { fmtMoney } from "../lib/costs.js";
import { termName } from "../lib/servicePlans.js";

const monthKey = d => (d ? String(d).slice(0, 7) : "");
const firstOfMonth = d => `${monthKey(d)}-01`;

function monthsBetween(start, end) {
  const out = [];
  if (!start) return out;
  const s = new Date(firstOfMonth(start) + "T12:00:00");
  const e = new Date(firstOfMonth(end) + "T12:00:00");
  for (let d = new Date(s); d <= e && out.length < 60; d.setMonth(d.getMonth() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export function ProjectServiceTab({ project, canManage }) {
  const { lang } = useT();
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [contracts, setContracts] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("service_contracts").select("*").eq("project_id", project.id).order("created_at", { ascending: false });
    if (e) setError(e.message);
    setContracts(data ?? []);
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  if (!contracts) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Gauge size={17} className="text-blue-600" />{L("Service", "Servicio")}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{L(
          "Service contracts from accepted plan or on-demand proposals. The hours logged on this project's cases are consumed from the contract.",
          "Contratos de servicio de propuestas de plan o bajo demanda aceptadas. Las horas registradas en los casos del proyecto se consumen del contrato.")}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {contracts.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">
          {L("No service contract yet. It is created when the customer accepts a service-plan or on-demand proposal.", "Aún no hay contrato de servicio. Se crea cuando el cliente acepta una propuesta de plan de servicio o bajo demanda.")}
        </div>
      )}
      {contracts.map(k => <ContractCard key={k.id} k={k} canManage={canManage} lang={lang} L={L} onChanged={load} />)}
    </div>
  );
}

function ContractCard({ k, canManage, lang, L, onChanged }) {
  const es = lang === "es";
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const m = v => fmtMoney(v, k.currency, lang);

  const loadUsage = useCallback(async () => {
    const { data, error } = await supabase.rpc("service_contract_usage", { p_contract: k.id });
    if (error) setMsg({ ok: false, text: error.message }); else setUsage(data);
  }, [k.id]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  async function invoice(kind, month) {
    setBusy(`${kind}:${month ?? ""}`); setMsg(null);
    const { error } = await supabase.rpc("service_contract_invoice", { p_contract: k.id, p_kind: kind, p_month: month ?? null });
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: L("Invoice created as draft — find it in Invoices.", "Factura creada como borrador — está en Facturas.") }); await loadUsage(); }
    setBusy(null);
  }
  async function setStatus(status) {
    if (!window.confirm(status === "ended" ? L("Mark this contract as ended?", "¿Marcar este contrato como finalizado?") : L("Cancel this contract?", "¿Cancelar este contrato?"))) return;
    const { error } = await supabase.from("service_contracts").update({ status }).eq("id", k.id);
    if (error) setMsg({ ok: false, text: error.message }); else onChanged();
  }

  const isPlan = k.kind === "plan";
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = isPlan ? (k.end_date && k.end_date < today ? k.end_date : today) : today;
  const byMonth = Object.fromEntries((usage?.months ?? []).map(r => [monthKey(r.month), r]));
  const invoices = usage?.invoices ?? [];
  const hasInv = (kind, month) => invoices.some(i => i.kind === kind && (!month || monthKey(i.period_month) === monthKey(month)));
  const months = monthsBetween(k.start_date, lastMonth);
  const used = Number(usage?.used ?? 0);
  const pool = Number(k.total_hours ?? 0);
  const pct = pool ? Math.min(100, Math.round((used / pool) * 100)) : 0;
  const statusCls = { active: "bg-emerald-50 text-emerald-700", ended: "bg-gray-100 text-gray-500", cancelled: "bg-red-50 text-red-600" }[k.status];
  const statusLbl = { active: L("Active", "Activo"), ended: L("Ended", "Finalizado"), cancelled: L("Cancelled", "Cancelado") }[k.status];
  const kindLbl = { prepaid: L("Prepaid plan", "Plan prepagado"), extra: L("Additional hours", "Horas adicionales"), minimum: L("Monthly minimum", "Mínimo mensual"), consumption: L("Consumption", "Consumo") };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{isPlan ? `${k.band_name ?? L("Service plan", "Plan de servicio")} · ${termName(k.months, es)}` : L("On-demand service", "Servicio bajo demanda")}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLbl}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            <CalendarRange size={12} />{k.start_date}{k.end_date ? ` → ${k.end_date}` : ` → ${L("open-ended", "sin fecha de fin")}`}
            {isPlan
              ? <> · {k.hours_per_month} h/{L("month", "mes")} · {k.total_hours} h {L("in total", "en total")} · {m(k.hour_rate)}/h · <b>{m(k.total_amount)}</b></>
              : <> · {m(k.hour_rate)}/h · {L("minimum", "mínimo")} {m(k.min_monthly)}/{L("month", "mes")}</>}
            {Number(k.tax_pct) > 0 && <> · +{k.tax_pct}% {L("tax", "impuestos")}</>}
          </p>
        </div>
        {canManage && k.status === "active" && (
          <div className="flex gap-2">
            <button onClick={() => setStatus("ended")} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1">{L("Mark ended", "Finalizar")}</button>
            <button onClick={() => setStatus("cancelled")} className="text-xs text-red-500 hover:text-red-700 border border-red-100 rounded-lg px-2.5 py-1">{L("Cancel", "Cancelar")}</button>
          </div>
        )}
      </div>

      {isPlan && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600">{L("Hours used", "Horas usadas")}: <b className="text-gray-900">{used}</b> / {pool} h</span>
            <span className={used > pool ? "text-red-600 font-semibold" : "text-gray-500"}>
              {used > pool ? L(`${Math.round((used - pool) * 100) / 100} additional hours`, `${Math.round((used - pool) * 100) / 100} horas adicionales`) : L(`${usage?.remaining ?? pool} h remaining`, `${usage?.remaining ?? pool} h disponibles`)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{L(`Weighted hours: specialist ×${k.factors?.specialist ?? 1.5}, on site ×${k.factors?.onsite ?? 2}. Additional hour: ${m(k.extra_hour_rate)}.`, `Horas ponderadas: especialista ×${k.factors?.specialist ?? 1.5}, en sitio ×${k.factors?.onsite ?? 2}. Hora adicional: ${m(k.extra_hour_rate)}.`)}</p>
        </div>
      )}

      {canManage && isPlan && !hasInv("prepaid") && (
        <button onClick={() => invoice("prepaid", k.start_date)} disabled={!!busy}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-3 py-2 disabled:opacity-50">
          {busy?.startsWith("prepaid") ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}{L(`Create prepaid invoice (${m(k.total_amount)})`, `Crear factura del plan prepagado (${m(k.total_amount)})`)}
        </button>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">{L("Month", "Mes")}</th>
              <th className="py-2 pr-3 text-right">{L("Hours logged", "Horas registradas")}</th>
              <th className="py-2 pr-3 text-right">{L("Counted", "Contabilizadas")}</th>
              {isPlan && <th className="py-2 pr-3 text-right">{L("Cumulative", "Acumulado")}</th>}
              <th className="py-2 pr-3 text-right">{isPlan ? L("Additional h", "Horas adic.") : L("Amount", "Monto")}</th>
              <th className="py-2 text-right">{L("Invoices", "Facturas")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map(mo => {
              const r = byMonth[monthKey(mo)] ?? { raw: 0, counted: 0, cumulative: null, extra: 0 };
              const odAmount = !isPlan ? Math.max(Number(k.min_monthly ?? 0), Number(r.counted ?? 0) * Number(k.hour_rate ?? 0)) : 0;
              return (
                <tr key={mo} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-3 text-gray-900">{new Date(mo + "T12:00:00").toLocaleDateString(es ? "es" : "en-US", { month: "long", year: "numeric" })}</td>
                  <td className="py-2 pr-3 text-right">{r.raw}</td>
                  <td className="py-2 pr-3 text-right font-medium">{r.counted}</td>
                  {isPlan && <td className="py-2 pr-3 text-right text-gray-500">{r.cumulative ?? "—"}</td>}
                  <td className={`py-2 pr-3 text-right ${isPlan && Number(r.extra) > 0 ? "text-red-600 font-semibold" : ""}`}>{isPlan ? r.extra : m(odAmount)}</td>
                  <td className="py-2 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {invoices.filter(i => monthKey(i.period_month) === monthKey(mo) && i.kind !== "prepaid").map(i => (
                        <span key={i.id} className="text-[11px] text-gray-600">{kindLbl[i.kind] ?? i.kind} · {m(i.amount)} · {i.status}</span>
                      ))}
                      {canManage && k.status !== "cancelled" && isPlan && Number(r.extra) > 0 && !hasInv("extra", mo) && (
                        <button onClick={() => invoice("extra", mo)} disabled={!!busy} className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-50">
                          {busy === `extra:${mo}` ? "…" : L(`Invoice ${r.extra} additional h`, `Facturar ${r.extra} h adicionales`)}
                        </button>
                      )}
                      {canManage && k.status !== "cancelled" && !isPlan && !hasInv("minimum", mo) && (
                        <button onClick={() => invoice("minimum", mo)} disabled={!!busy} className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-50">
                          {busy === `minimum:${mo}` ? "…" : L(`Invoice minimum (${m(k.min_monthly)})`, `Facturar mínimo (${m(k.min_monthly)})`)}
                        </button>
                      )}
                      {canManage && k.status !== "cancelled" && !isPlan && Number(r.counted) * Number(k.hour_rate) > Number(k.min_monthly ?? 0) && !hasInv("consumption", mo) && (
                        <button onClick={() => invoice("consumption", mo)} disabled={!!busy} className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-50">
                          {busy === `consumption:${mo}` ? "…" : L("Invoice consumption above minimum", "Facturar consumo sobre el mínimo")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {months.length === 0 && <tr><td colSpan={6} className="py-3 text-xs text-gray-400">{L("The service has not started yet.", "El servicio aún no ha comenzado.")}</td></tr>}
          </tbody>
        </table>
      </div>

      {invoices.length > 0 && (
        <div className="text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-500 uppercase tracking-wide text-[11px]">{L("Contract invoices", "Facturas del contrato")}</p>
          {invoices.map(i => (
            <div key={i.id} className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{i.number}</span><span>· {kindLbl[i.kind] ?? i.kind}</span><span>· {monthKey(i.period_month)}</span>
              <span>· <b>{m(i.amount)}</b></span><span>· {i.status}</span>{i.due_date && <span className="text-gray-400">· {L("due", "vence")} {i.due_date}</span>}
            </div>
          ))}
        </div>
      )}

      {msg && <p className={`text-xs flex items-center gap-1.5 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{msg.text}</p>}
    </div>
  );
}
