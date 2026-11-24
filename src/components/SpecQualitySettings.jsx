// Settings → Spec quality: the standard hours catalog used to calculate spec estimates and the
// projects' mandatory rules applied to every generated spec.
import { useState, useEffect } from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { CardCarousel } from "./CardCarousel.jsx";
import { DEFAULT_SPEC_HOURS, specHoursSettings } from "../lib/specHours.js";
import { KIND_LABEL } from "../lib/specDiff.js";
import { ProjectRulesEditor } from "./ProjectRulesEditor.jsx";

const KIND_ORDER = ['table', 'ddic', 'message', 'class', 'enhancement', 'function', 'program', 'report', 'service', 'fiori', 'integration', 'form', 'auth', 'config', 'transaction', 'other'];

function HoursCatalog({ ssCtx }) {
  const saved = specHoursSettings(ssCtx.settings);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setDraft(specHoursSettings(ssCtx.settings)); }, [ssCtx.settings?.spec_hours]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const setCell = (k, c, v) => setDraft(d => ({ ...d, catalog: { ...d.catalog, [k]: { ...d.catalog[k], [c]: v === '' ? '' : Number(v) } } }));
  const setNum = (k, v) => setDraft(d => ({ ...d, [k]: v === '' ? '' : Number(v) }));
  async function save() {
    setSaving(true);
    const clean = JSON.parse(JSON.stringify(draft, (key, v) => (v === '' ? 0 : v)));
    await ssCtx.setSetting('spec_hours', clean);
    setSaving(false); setDone(true); setTimeout(() => setDone(false), 2000);
  }
  const inp = "w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right";
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Catálogo de horas estándar</h2>
        <p className="text-sm text-gray-500">Horas de un consultor de nivel medio por tipo de objeto técnico y complejidad. La plataforma calcula con estos valores las horas de las specs (la IA solo indica la complejidad de cada objeto); las horas Arena salen de los factores de estimación. Valores iniciales tomados de las specs generadas.</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <th className="text-left px-4 py-2">Tipo de objeto</th><th className="text-right px-4 py-2">Baja</th><th className="text-right px-4 py-2">Media</th><th className="text-right px-4 py-2">Alta</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {KIND_ORDER.map(k => (
              <tr key={k}>
                <td className="px-4 py-1.5 text-xs font-semibold text-gray-700">{k === 'other' ? 'Otro' : (KIND_LABEL[k]?.[1] ?? k)}</td>
                {['low', 'medium', 'high'].map(c => (
                  <td key={c} className="px-4 py-1.5 text-right">
                    <input type="number" min="0" step="0.5" value={draft.catalog[k]?.[c] ?? ''} onChange={e => setCell(k, c, e.target.value)} className={inp} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700 space-y-2">
          <div className="font-semibold text-sm text-gray-800">Fases</div>
          <label className="flex items-center gap-2">Análisis y diseño: <input type="number" min="0" value={draft.analysis_pct} onChange={e => setNum('analysis_pct', e.target.value)} className={inp} /> % del desarrollo, mínimo <input type="number" min="0" value={draft.analysis_min} onChange={e => setNum('analysis_min', e.target.value)} className={inp} /> h</label>
          <label className="flex items-center gap-2">Pruebas unitarias: <input type="number" min="0" value={draft.unit_test_pct} onChange={e => setNum('unit_test_pct', e.target.value)} className={inp} /> % del desarrollo, mínimo <input type="number" min="0" value={draft.unit_test_min} onChange={e => setNum('unit_test_min', e.target.value)} className={inp} /> h</label>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700 space-y-2">
          <div className="font-semibold text-sm text-gray-800">Soporte UAT</div>
          <label className="flex items-center gap-2">Base: <input type="number" min="0" step="0.5" value={draft.uat_base} onChange={e => setNum('uat_base', e.target.value)} className={inp} /> h</label>
          <label className="flex items-center gap-2">Por escenario de la matriz de pruebas: <input type="number" min="0" step="0.05" value={draft.uat_per_scenario} onChange={e => setNum('uat_per_scenario', e.target.value)} className={inp} /> h</label>
          <p className="text-gray-500">Los escenarios se cuentan en las hojas "Matriz de escenarios" de las planillas del caso.</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SPEC_HOURS)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Valores iniciales</button>
        <button onClick={save} disabled={!dirty || saving} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{saving ? 'Guardando…' : done ? 'Guardado ✓' : 'Guardar'}</button>
      </div>
    </div>
  );
}

export function SettingsSpecQualityTab({ ssCtx }) {
  return (
    <CardCarousel storageKey="settings_spec_quality_slide" slides={[
      { id: 'rules', label: 'Reglas obligatorias del proyecto', Icon: ShieldCheck, content: <ProjectRulesEditor ssCtx={ssCtx} /> },
      { id: 'hours', label: 'Catálogo de horas', Icon: Clock, content: <HoursCatalog ssCtx={ssCtx} /> },
    ]} />
  );
}
