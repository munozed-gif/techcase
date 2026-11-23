import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, RotateCcw, Check } from "lucide-react";
import { DEFAULT_SERVICE_CATALOG, resolveCatalog, computeServiceTotals, termName } from "../lib/servicePlans.js";
import { fmtMoney } from "../lib/costs.js";
import { SlaPolicyEditor } from "./SlaPolicyEditor.jsx";

/**
 * Editor of a service-plan catalog (UE plans, terms, rates, extra hour, on demand, multipliers,
 * SLA and premises). Used for the platform default (Settings) and for each partner (Partner area).
 * value: stored catalog (may be partial or null) · onSave(catalog) → Promise
 */
export function ServicePlansEditor({ value, fallback, onSave, lang = "en", title, hint }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [c, setC] = useState(() => resolveCatalog(value, fallback));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { setC(resolveCatalog(value, fallback)); }, [value, fallback]);

  const set = patch => { setOk(false); setC(p => ({ ...p, ...patch })); };
  const num = v => (v === "" || v == null ? "" : Number(v));
  const inp = "w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-right";

  async function save() {
    setBusy(true); setErr(null);
    try {
      const clean = {
        ...c,
        ueHours: Number(c.ueHours) || 168, hoursPerDay: Number(c.hoursPerDay) || 8,
        terms: [...new Set(c.terms.map(Number).filter(t => t > 0))].sort((a, b) => a - b),
        extraHourRate: Number(c.extraHourRate) || 0,
        onDemand: { hourRate: Number(c.onDemand.hourRate) || 0, minMonthly: Number(c.onDemand.minMonthly) || 0 },
        factors: { specialist: Number(c.factors.specialist) || 1, onsite: Number(c.factors.onsite) || 1 },
      };
      await onSave(clean);
      setOk(true);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const preview = computeServiceTotals({ proposalType: "plan", ue: 1 }, c, c.currency, {});

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900">{title ?? L("Service plans", "Planes de servicio")}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{hint ?? L(
          "Monthly plans in equivalent units (UE) for service proposals: 1 UE = one full-time consultant month. The rate depends on the plan (UE range) and the term.",
          "Planes mensuales en unidades equivalentes (UE) para propuestas de servicio: 1 UE = un consultor a tiempo completo por mes. La tarifa depende del plan (rango de UE) y del período.")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label={L("Currency", "Moneda")}><input value={c.currency} onChange={e => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} className={inp + " text-left uppercase"} /></Field>
        <Field label={L("Hours per UE / month", "Horas por UE / mes")}><input type="number" value={c.ueHours} onChange={e => set({ ueHours: num(e.target.value) })} className={inp} /></Field>
        <Field label={L("Hours per day", "Horas por día")}><input type="number" value={c.hoursPerDay} onChange={e => set({ hoursPerDay: num(e.target.value) })} className={inp} /></Field>
        <Field label={L("Terms (months, comma-separated)", "Períodos (meses, separados por coma)")}>
          <input value={c.terms.join(", ")} onChange={e => set({ terms: e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0) })} className={inp + " text-left"} />
        </Field>
      </div>

      {/* Bands × terms rate matrix */}
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Plans and hourly rates per term", "Planes y tarifa por hora según el período")} ({c.currency}/h)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-medium py-1 pr-2">{L("Plan", "Plan")}</th>
                <th className="font-medium py-1 px-1 w-16">{L("From UE", "Desde UE")}</th>
                <th className="font-medium py-1 px-1 w-16">{L("To UE", "Hasta UE")}</th>
                {c.terms.map(t => <th key={t} className="font-medium py-1 px-1 w-20">{termName(t, es)}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {c.bands.map((b, i) => (
                <tr key={b.key} className="border-t border-gray-50">
                  <td className="py-1 pr-2"><input value={b.name} onChange={e => set({ bands: c.bands.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} className={inp + " text-left"} /></td>
                  <td className="py-1 px-1"><input type="number" step="0.5" value={b.minUe ?? ""} onChange={e => set({ bands: c.bands.map((x, j) => j === i ? { ...x, minUe: num(e.target.value) } : x) })} className={inp} /></td>
                  <td className="py-1 px-1"><input type="number" step="0.5" value={b.maxUe ?? ""} placeholder="∞" onChange={e => set({ bands: c.bands.map((x, j) => j === i ? { ...x, maxUe: e.target.value === "" ? null : Number(e.target.value) } : x) })} className={inp} /></td>
                  {c.terms.map(t => (
                    <td key={t} className="py-1 px-1">
                      <input type="number" step="0.01" value={c.rates[b.key]?.[t] ?? ""}
                        onChange={e => set({ rates: { ...c.rates, [b.key]: { ...(c.rates[b.key] ?? {}), [t]: num(e.target.value) } } })} className={inp} />
                    </td>
                  ))}
                  <td className="py-1 pl-1">
                    {c.bands.length > 1 && <button onClick={() => set({ bands: c.bands.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => { const key = `p${Date.now().toString(36)}`; set({ bands: [...c.bands, { key, name: L("New plan", "Nuevo plan"), minUe: 0, maxUe: null }], rates: { ...c.rates, [key]: {} } }); }}
          className="mt-2 text-xs font-semibold text-blue-600 inline-flex items-center gap-1"><Plus size={12} />{L("Add plan", "Agregar plan")}</button>
        <p className="text-[11px] text-gray-400 mt-1">{L("A plan applies from its “From UE” (included) up to “To UE” (not included). Daily rate = hourly × hours per day.", "Un plan aplica desde su “Desde UE” (incluido) hasta “Hasta UE” (no incluido). Tarifa diaria = hora × horas por día.")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Field label={L("Additional hour", "Hora adicional")}><input type="number" step="0.01" value={c.extraHourRate} onChange={e => set({ extraHourRate: num(e.target.value) })} className={inp} /></Field>
        <Field label={L("On demand — hour", "Bajo demanda — hora")}><input type="number" step="0.01" value={c.onDemand.hourRate} onChange={e => set({ onDemand: { ...c.onDemand, hourRate: num(e.target.value) } })} className={inp} /></Field>
        <Field label={L("On demand — monthly minimum", "Bajo demanda — mínimo mensual")}><input type="number" step="0.01" value={c.onDemand.minMonthly} onChange={e => set({ onDemand: { ...c.onDemand, minMonthly: num(e.target.value) } })} className={inp} /></Field>
        <Field label={L("Specialist factor (×)", "Factor especialista (×)")}><input type="number" step="0.1" value={c.factors.specialist} onChange={e => set({ factors: { ...c.factors, specialist: num(e.target.value) } })} className={inp} /></Field>
        <Field label={L("On-site factor (×)", "Factor en sitio (×)")}><input type="number" step="0.1" value={c.factors.onsite} onChange={e => set({ factors: { ...c.factors, onsite: num(e.target.value) } })} className={inp} /></Field>
      </div>

      {/* SLA — same editor as Settings → Workflow → SLA, customer overrides and contracts */}
      <SlaPolicyEditor value={c.sla} onChange={sla => set({ sla })} lang={lang} />

      {/* Premises */}
      <div className="grid sm:grid-cols-2 gap-3">
        {["es", "en"].map(lg => (
          <Field key={lg} label={`${L("Service premises", "Premisas del servicio")} (${lg.toUpperCase()}) — ${L("one per line", "una por línea")}`}>
            <textarea rows={7} value={(c.premises?.[lg] ?? []).join("\n")}
              onChange={e => set({ premises: { ...c.premises, [lg]: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) } })}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </Field>
        ))}
      </div>

      <p className="text-[11px] text-gray-500">
        {L("Example — 1 UE:", "Ejemplo — 1 UE:")} {preview.options.map(o => `${termName(o.months, es)} ${fmtMoney(o.total, c.currency, lang, 0)}`).join(" · ")}
      </p>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} /> : null}{L("Save service plans", "Guardar planes de servicio")}
        </button>
        <button onClick={() => { setOk(false); setC(resolveCatalog(fallback ?? DEFAULT_SERVICE_CATALOG, null)); }}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"><RotateCcw size={12} />{L("Reset to default values", "Restablecer valores por defecto")}</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="block text-[11px] font-medium text-gray-500 mb-1">{label}</span>{children}</label>;
}
