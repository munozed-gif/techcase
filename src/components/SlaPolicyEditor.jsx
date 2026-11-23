// The one SLA editor: type × priority matrix (initial response / solution, business hours), the
// business calendar the clock runs on, and the contract terms. Same shape for the platform default,
// partner catalogs, customer overrides and service contracts.
import { normalizeSla, calendarText } from "../lib/servicePlans.js";

const inp = "w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white";
const num = v => (v === "" ? "" : Number(v));
const DAYS = [[1, "Mon", "Lun"], [2, "Tue", "Mar"], [3, "Wed", "Mié"], [4, "Thu", "Jue"], [5, "Fri", "Vie"], [6, "Sat", "Sáb"], [7, "Sun", "Dom"]];
const TIMEZONES = ["America/Mexico_City", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Madrid", "Europe/London", "UTC"];

export function SlaPolicyEditor({ value, onChange, lang = "en", readOnly = false, showTerms = true, showCalendar = true }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const sla = normalizeSla(value);
  const set = patch => onChange?.({ ...sla, ...patch });
  const setCal = patch => set({ calendar: { ...sla.calendar, ...patch } });
  const setTerms = patch => set({ terms: { ...sla.terms, ...patch } });
  const tzs = TIMEZONES.includes(sla.calendar.timezone) ? TIMEZONES : [sla.calendar.timezone, ...TIMEZONES];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{L("SLA — initial response / solution (business hours)", "SLA — respuesta inicial / solución (horas laborales)")}</p>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr className="text-gray-500"><th className="text-left font-medium pr-3" />{sla.priorities.map(p => <th key={p.key} className="font-medium px-1">{p[es ? "es" : "en"]}</th>)}</tr></thead>
            <tbody>
              {sla.types.map(tp => (
                <tr key={tp.key} className="border-t border-gray-50">
                  <td className="pr-3 py-1 text-gray-700 whitespace-nowrap">{tp[es ? "es" : "en"]}</td>
                  {sla.priorities.map(pr => {
                    const v = sla.matrix[tp.key]?.[pr.key] ?? ["", ""];
                    const setV = (idx, val) => set({ matrix: { ...sla.matrix, [tp.key]: { ...(sla.matrix[tp.key] ?? {}), [pr.key]: idx === 0 ? [num(val), v[1]] : [v[0], num(val)] } } });
                    return (
                      <td key={pr.key} className="px-1 py-1">
                        {readOnly ? <span className="text-gray-700 whitespace-nowrap">{v[0]} / {v[1]} h</span> : (
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.5" min="0" value={v[0]} onChange={e => setV(0, e.target.value)} className={inp + " w-14"} title={L("Initial response (h)", "Respuesta inicial (h)")} />
                            <span className="text-gray-300">/</span>
                            <input type="number" step="0.5" min="0" value={v[1]} onChange={e => setV(1, e.target.value)} className={inp + " w-14"} title={L("Solution (h)", "Solución (h)")} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCalendar && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Business calendar (the SLA clock only runs in these hours)", "Calendario laboral (el reloj del SLA solo corre en este horario)")}</p>
          {readOnly ? <p className="text-xs text-gray-600">{calendarText(sla.calendar, es)}</p> : (
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <label className="text-xs text-gray-600">{L("Day starts", "Inicio del día")}
                <input type="time" value={sla.calendar.start} onChange={e => setCal({ start: e.target.value })} className={inp + " mt-1"} /></label>
              <label className="text-xs text-gray-600">{L("Hours per day", "Horas por día")}
                <input type="number" min="1" max="24" step="0.5" value={sla.calendar.hoursPerDay} onChange={e => setCal({ hoursPerDay: num(e.target.value) })} className={inp + " mt-1"} /></label>
              <label className="text-xs text-gray-600 sm:col-span-2">{L("Time zone", "Zona horaria")}
                <select value={sla.calendar.timezone} onChange={e => setCal({ timezone: e.target.value })} className={inp + " mt-1"}>
                  {tzs.map(z => <option key={z} value={z}>{z}</option>)}
                </select></label>
              <div className="sm:col-span-4 flex flex-wrap gap-1.5">
                {DAYS.map(([d, en, sp]) => {
                  const on = sla.calendar.workDays.map(Number).includes(d);
                  return (
                    <button key={d} type="button" onClick={() => setCal({ workDays: on ? sla.calendar.workDays.filter(x => Number(x) !== d) : [...sla.calendar.workDays, d].sort() })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}>{es ? sp : en}</button>
                  );
                })}
                <span className="text-[11px] text-gray-400 self-center ml-2">{calendarText(sla.calendar, es)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showTerms && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Service terms", "Condiciones del servicio")}</p>
          {readOnly ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold capitalize">{sla.terms.tier}</span>
              {sla.terms.uptime_pct != null && sla.terms.uptime_pct !== "" && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{sla.terms.uptime_pct}% {L("uptime", "disponibilidad")}</span>}
              {sla.terms.priority_support && <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{L("Priority support", "Soporte prioritario")}</span>}
              {sla.terms.dedicated_consultant && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">{L("Dedicated consultant", "Consultor dedicado")}</span>}
              {sla.terms.notes && <span className="text-gray-500">{sla.terms.notes}</span>}
            </div>
          ) : (
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <label className="text-xs text-gray-600">{L("Tier", "Nivel")}
                <select value={sla.terms.tier} onChange={e => setTerms({ tier: e.target.value })} className={inp + " mt-1"}>
                  <option value="standard">Standard</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option>
                </select></label>
              <label className="text-xs text-gray-600">{L("Uptime guarantee %", "Disponibilidad garantizada %")}
                <input type="number" min="0" max="100" step="0.1" value={sla.terms.uptime_pct ?? ""} onChange={e => setTerms({ uptime_pct: num(e.target.value) })} className={inp + " mt-1"} /></label>
              <label className="text-xs text-gray-600 flex items-center gap-2 pb-2"><input type="checkbox" checked={!!sla.terms.priority_support} onChange={e => setTerms({ priority_support: e.target.checked })} />{L("Priority support", "Soporte prioritario")}</label>
              <label className="text-xs text-gray-600 flex items-center gap-2 pb-2"><input type="checkbox" checked={!!sla.terms.dedicated_consultant} onChange={e => setTerms({ dedicated_consultant: e.target.checked })} />{L("Dedicated consultant", "Consultor dedicado")}</label>
              <label className="text-xs text-gray-600 sm:col-span-4">{L("Notes", "Notas")}
                <input value={sla.terms.notes ?? ""} onChange={e => setTerms({ notes: e.target.value })} className={inp + " mt-1"} /></label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
