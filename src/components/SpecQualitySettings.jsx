// Settings → Spec quality: the standard hours catalog used to calculate spec estimates and the
// projects' mandatory rules applied to every generated spec.
import { useState, useEffect } from "react";
import { Clock, ShieldCheck, ListTodo } from "lucide-react";
import { CardCarousel } from "./CardCarousel.jsx";
import { DEFAULT_SPEC_HOURS, specHoursSettings } from "../lib/specHours.js";
import { KIND_LABEL } from "../lib/specDiff.js";
import { ProjectRulesEditor } from "./ProjectRulesEditor.jsx";
import { DEV_PLAN_DEFAULTS, SPEC_NAMES, devPlanSettings } from "../lib/devPlanBase.js";

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

// Which spec the development plan (case → Activities → Generate plan) is built from.
function DevPlanSettings({ ssCtx }) {
  const saved = devPlanSettings(ssCtx.settings);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setDraft(devPlanSettings(ssCtx.settings)); }, [ssCtx.settings?.dev_plan_settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === '' ? DEV_PLAN_DEFAULTS[k] : v]));
    await ssCtx.setSetting('dev_plan_settings', clean);
    setSaving(false); setDone(true); setTimeout(() => setDone(false), 2000);
  }
  const keys = ['c', 'a', 'b', 'd'];
  const setNum = (k, v) => setDraft(d => ({ ...d, [k]: v === '' ? '' : Number(v) }));
  const inp = "w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right";
  const NumRow = ({ k, label, hint, step = 1, unit }) => (
    <label className="flex items-start gap-3 text-xs text-gray-700">
      <span className="flex-1 min-w-0"><span className="font-semibold">{label}</span>{hint && <span className="block text-gray-500">{hint}</span>}</span>
      <input type="number" min="0" step={step} value={draft[k] ?? ''} onChange={e => setNum(k, e.target.value)} className={inp} />
      {unit && <span className="w-16 text-gray-500 pt-1">{unit}</span>}
    </label>
  );
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Plan de desarrollo</h2>
        <p className="text-sm text-gray-500">Especificación desde la que se genera el plan de actividades del caso (pestaña Actividades → Generar plan de desarrollo).</p>
      </div>
      <label className="block text-xs font-semibold text-gray-700">Especificación base
        <select value={draft.base} onChange={e => setDraft(d => ({ ...d, base: e.target.value }))}
          className="mt-1 block w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="approved">La especificación aprobada (la firmada y enviada al cliente; normalmente la Spec C)</option>
          {keys.map(k => <option key={k} value={k}>{SPEC_NAMES[k][1]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-gray-700">Si no existe, usar en este orden
        <div className="mt-1 flex flex-wrap gap-2">
          {draft.fallback.map((k, i) => (
            <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white">
              {i + 1}. Spec {k.toUpperCase()}
              {i > 0 && <button onClick={() => setDraft(d => { const f = [...d.fallback]; [f[i - 1], f[i]] = [f[i], f[i - 1]]; return { ...d, fallback: f }; })} className="text-gray-400 hover:text-gray-700" title="Subir">↑</button>}
            </span>
          ))}
        </div>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={draft.full_spec} onChange={e => setDraft(d => ({ ...d, full_spec: e.target.checked }))} className="mt-1 accent-blue-600" />
        <span>Enviar la especificación completa a la IA <span className="block text-xs text-gray-500">Si se desactiva, solo se envían los primeros {Number(draft.short_spec_chars || DEV_PLAN_DEFAULTS.short_spec_chars).toLocaleString('es')} caracteres (sin la tabla de objetos ni la estimación).</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={draft.align_objects} onChange={e => setDraft(d => ({ ...d, align_objects: e.target.checked }))} className="mt-1 accent-blue-600" />
        <span>Una actividad de desarrollo por objeto técnico de la especificación, con sus horas calculadas <span className="block text-xs text-gray-500">El plan coincide con la estimación aprobada; los objetos Z que la IA omita se agregan. Las tablas y objetos estándar que solo se leen no son actividades.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={draft.include_tests !== false} onChange={e => setDraft(d => ({ ...d, include_tests: e.target.checked }))} className="mt-1 accent-blue-600" />
        <span>Incluir las pruebas unitarias y el soporte UAT de la estimación <span className="block text-xs text-gray-500">Se crean como actividades de Prueba técnica y Prueba de usuario con las horas de la especificación, para que el plan sume lo mismo que la estimación aprobada.</span></span>
      </label>
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
        <div className="font-semibold text-sm text-gray-800">Generación del plan</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {NumRow({ k: 'design_min', label: 'Actividades de diseño: mínimo', hint: 'Cantidad mínima de actividades de la fase Diseño que se piden a la IA.' })}
          {NumRow({ k: 'design_max', label: 'Actividades de diseño: máximo', hint: 'Cantidad máxima de actividades de la fase Diseño.' })}
          {NumRow({ k: 'dev_min', label: 'Actividades de desarrollo: mínimo', hint: 'Solo si no se alinea con los objetos técnicos (con la opción activa, hay una por objeto).' })}
          {NumRow({ k: 'dev_max', label: 'Actividades de desarrollo: máximo', hint: 'Igual que el mínimo: se ignora cuando las actividades siguen los objetos.' })}
          {NumRow({ k: 'max_hours', label: 'Horas máximas por actividad', hint: 'Límite de las horas estándar de cada actividad que propone la IA (mínimo 0,5 h).', step: 0.5, unit: 'h' })}
          {NumRow({ k: 'json_max_tokens', label: 'Tokens máximos: actividades', hint: 'Respuesta máxima de la llamada que devuelve las actividades (JSON).', step: 500, unit: 'tokens' })}
          {NumRow({ k: 'doc_max_tokens', label: 'Tokens máximos: documento del plan', hint: 'Respuesta máxima de la llamada que redacta el documento del plan (markdown).', step: 500, unit: 'tokens' })}
          {NumRow({ k: 'max_spec_chars', label: 'Caracteres de la especificación completa', hint: 'Caracteres enviados cuando está activa la especificación completa.', step: 1000, unit: 'caract.' })}
          {NumRow({ k: 'short_spec_chars', label: 'Caracteres de la especificación resumida', hint: 'Caracteres enviados cuando la especificación completa está desactivada.', step: 500, unit: 'caract.' })}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setDraft(JSON.parse(JSON.stringify(DEV_PLAN_DEFAULTS)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Valores iniciales</button>
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
      { id: 'devplan', label: 'Plan de desarrollo', Icon: ListTodo, content: <DevPlanSettings ssCtx={ssCtx} /> },
    ]} />
  );
}
