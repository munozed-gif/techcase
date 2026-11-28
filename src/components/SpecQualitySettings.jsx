// Settings → Spec quality: the standard hours catalog used to calculate spec estimates and the
// projects' mandatory rules applied to every generated spec.
import { useState, useEffect } from "react";
import { Clock, ShieldCheck, ListTodo, ScanSearch, Plus, Trash2 } from "lucide-react";
import { CardCarousel } from "./CardCarousel.jsx";
import { DEFAULT_SPEC_HOURS, specHoursSettings } from "../lib/specHours.js";
import { KIND_LABEL } from "../lib/specDiff.js";
import { ProjectRulesEditor } from "./ProjectRulesEditor.jsx";
import { DEV_PLAN_DEFAULTS, SPEC_NAMES, devPlanSettings } from "../lib/devPlanBase.js";
import { SPEC_ANALYSIS_DEFAULTS, SIGNOFF_CONDITIONS, DOC_SUMMARY_DEFAULT_MODEL, specAnalysisPolicy } from "../lib/specAnalysisPolicy.js";

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

// Compiled-context analysis of the Spec tab (spec_analysis_policy): sign-off gate, chained steps,
// text budget and token limits of each AI step, question areas, requirement kinds, live SAP check,
// project-document summaries and video analysis. The initial values are the platform's behaviour.
function AnalysisPolicySettings({ ssCtx }) {
  const saved = specAnalysisPolicy(ssCtx.settings);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setDraft(specAnalysisPolicy(ssCtx.settings)); }, [ssCtx.settings?.spec_analysis_policy]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    setSaving(true);
    // Empty / invalid numbers fall back to the initial value; rows without a key are dropped.
    await ssCtx.setSetting('spec_analysis_policy', specAnalysisPolicy({ spec_analysis_policy: draft }));
    setSaving(false); setDone(true); setTimeout(() => setDone(false), 2000);
  }
  const set = (sec, k, v) => setDraft(d => ({ ...d, [sec]: { ...d[sec], [k]: v } }));
  const numV = v => (v === '' ? '' : Number(v));
  const inp = "w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right";
  const txt = "w-full px-2 py-1 border border-gray-200 rounded-lg text-xs";
  const box = "p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2";
  const head = (title, hint) => (<div><div className="font-semibold text-sm text-gray-800">{title}</div>{hint && <p className="text-xs text-gray-500">{hint}</p>}</div>);
  const Num = ({ sec, k, label, hint, unit, step = 1, value, onChange }) => (
    <label key={`${sec}.${k}`} className="flex items-start gap-3 text-xs text-gray-700">
      <span className="flex-1 min-w-0"><span className="font-semibold">{label}</span>{hint && <span className="block text-gray-500">{hint}</span>}</span>
      <input type="number" min="0" step={step} value={value ?? draft[sec]?.[k] ?? ''} onChange={e => (onChange ? onChange(numV(e.target.value)) : set(sec, k, numV(e.target.value)))} className={inp} />
      {unit && <span className="w-14 text-gray-500 pt-1">{unit}</span>}
    </label>
  );
  const Check = ({ sec, k, label, hint }) => (
    <label key={`${sec}.${k}`} className="flex items-start gap-2 text-xs text-gray-700">
      <input type="checkbox" checked={!!draft[sec]?.[k]} onChange={e => set(sec, k, e.target.checked)} className="mt-0.5 accent-blue-600" />
      <span><span className="font-semibold">{label}</span>{hint && <span className="block text-gray-500">{hint}</span>}</span>
    </label>
  );
  // Editable list of { key, label_es, label_en, ... } rows.
  const listEdit = (field, cols, blank) => {
    const rows = draft[field] ?? [];
    const upd = (i, patch) => setDraft(d => ({ ...d, [field]: d[field].map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-start gap-1.5 p-1.5 bg-white rounded-lg border border-gray-100">
            {cols.map(c => c.type === 'number'
              ? <input key={c.k} type="number" min="0" title={c.title} placeholder={c.ph} value={r[c.k] ?? ''} onChange={e => upd(i, { [c.k]: numV(e.target.value) })} className={`${c.w} px-2 py-1 border border-gray-200 rounded-lg text-xs text-right`} />
              : <input key={c.k} type="text" title={c.title} placeholder={c.ph} value={r[c.k] ?? ''} onChange={e => upd(i, { [c.k]: e.target.value })} className={`${c.w} px-2 py-1 border border-gray-200 rounded-lg text-xs ${c.mono ? 'font-mono' : ''}`} />)}
            <button onClick={() => setDraft(d => ({ ...d, [field]: d[field].filter((_, j) => j !== i) }))} title="Quitar" className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => setDraft(d => ({ ...d, [field]: [...(d[field] ?? []), { ...blank }] }))} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-white"><Plus size={12} />Agregar</button>
      </div>
    );
  };
  const dsModel = draft.doc_summary.model;
  const dsMode = dsModel === '' ? 'fixed' : dsModel === 'analysis' ? 'analysis' : 'custom';
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Análisis del contexto compilado</h2>
        <p className="text-sm text-gray-500">Parámetros del análisis de la pestaña Spec: resumen de la solicitud, cobertura SAP, validación y verificación en vivo, checklist de requerimientos, preguntas al cliente, revisiones, aplicar respuestas y corregir brechas. Los valores iniciales son el comportamiento actual de la plataforma.</p>
      </div>

      <div className={box}>
        {head('Firma antes de enviar al cliente', 'Condiciones de la firma del consultor (panel de firma de la spec) y cuándo la cobertura se considera cumplida.')}
        {Num({ sec: 'signoff', k: 'coverage_min_pct', label: 'Cobertura mínima', hint: '100 = sin brechas abiertas (comportamiento actual). Con un valor menor, la cobertura se cumple cuando al menos ese % de los requerimientos en alcance no tiene una brecha abierta (cubierto o con brecha aceptada).', unit: '%' })}
        {Check({ sec: 'signoff', k: 'partial_counts_as_gap', label: 'Un requerimiento "parcial" cuenta como brecha', hint: 'Si se desactiva, solo los requerimientos "faltantes" son brechas; los parciales no bloquean ni se envían a Corregir brechas.' })}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-700">Condiciones</div>
          <p className="text-xs text-gray-500">Obligatoria: bloquea la firma y el envío. Aviso: se muestra en el panel pero no bloquea.</p>
          {Object.entries(SIGNOFF_CONDITIONS).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-3 text-xs text-gray-700">
              <span className="flex-1">{lbl[1]}</span>
              <select value={draft.signoff.conditions[k] ?? 'required'} onChange={e => set('signoff', 'conditions', { ...draft.signoff.conditions, [k]: e.target.value })}
                className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
                <option value="required">Obligatoria</option>
                <option value="warn">Aviso</option>
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className={box}>
        {head('Pasos automáticos', 'Pasos que se ejecutan solos al terminar otro. Desactivados, se ejecutan a mano con su botón.')}
        <div className="grid sm:grid-cols-2 gap-2">
          {Check({ sec: 'auto_steps', k: 'review_after_questions', label: 'Revisión del compilado después de las preguntas', hint: 'Revisión y próximos pasos al terminar de buscar preguntas para el cliente.' })}
          {Check({ sec: 'auto_steps', k: 'coverage_after_answers', label: 'Cobertura después de aplicar respuestas', hint: 'Verifica de nuevo la cobertura al confirmar los cambios del checklist.' })}
          {Check({ sec: 'auto_steps', k: 'coverage_after_fix_gaps', label: 'Cobertura después de Corregir brechas', hint: 'Verifica la spec corregida.' })}
          {Check({ sec: 'auto_steps', k: 'review_after_fix_gaps', label: 'Revisión de la generación después de Corregir brechas', hint: 'Revisión de la spec corregida.' })}
          {Check({ sec: 'auto_steps', k: 'coverage_after_generation', label: 'Cobertura después de generar las specs', hint: 'También al reintentar las specs que fallaron.' })}
          {Check({ sec: 'auto_steps', k: 'review_after_generation', label: 'Revisión de la generación después de generar las specs', hint: 'También al reintentar las specs que fallaron.' })}
        </div>
      </div>

      <div className={box}>
        {head('Texto de documentos enviado a la IA', 'Caracteres (aprox. 4 por token). Lo que se corta queda marcado para que la IA no lo lea como completo.')}
        <div className="grid sm:grid-cols-2 gap-2">
          {Num({ sec: 'doc_limits', k: 'per_file_chars', label: 'Por documento del caso', hint: 'Máximo de cada documento del cliente (Word, Excel, texto, transcripciones).', unit: 'caract.', step: 1000 })}
          {Num({ sec: 'doc_limits', k: 'total_chars', label: 'Total de documentos del caso', hint: 'Máximo de todos los documentos del caso en una llamada.', unit: 'caract.', step: 1000 })}
          {Num({ sec: 'doc_limits', k: 'project_doc_chars', label: 'Por documento del proyecto', hint: 'Máximo de cada documento de referencia del proyecto.', unit: 'caract.', step: 1000 })}
          {Num({ sec: 'doc_limits', k: 'standards_chars', label: 'Por documento de estándares ABAP', hint: 'Máximo de cada documento de estándares del proyecto.', unit: 'caract.', step: 1000 })}
          {Num({ sec: 'doc_limits', k: 'combined_extra_chars', label: 'Margen para proyecto y estándares', hint: 'Se suma al total del caso cuando también se envían los documentos del proyecto y los estándares ABAP (resumen de la solicitud).', unit: 'caract.', step: 1000 })}
        </div>
      </div>

      <div className={box}>
        {head('Tokens máximos por paso', 'Respuesta máxima de cada llamada a la IA. Si una lista JSON se corta, se conservan los elementos completos y se muestra un aviso.')}
        <div className="grid sm:grid-cols-2 gap-2">
          {Num({ sec: 'max_tokens', k: 'summary', label: 'Resumen de la solicitud', hint: 'Análisis del pedido (paso Analizar).', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'sap_coverage', label: 'Cobertura SAP estándar', hint: 'Transacciones estándar y brechas.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'validation', label: 'Validación de la propuesta', hint: 'Puntaje y observaciones.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'live_check_objects', label: 'Verificación en vivo: objetos', hint: 'Existencia de objetos y Clean Core en el sistema SAP.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'live_check_data', label: 'Verificación en vivo: datos de prueba', hint: 'Consulta de datos de prueba en el sistema.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'requirements', label: 'Checklist de requerimientos', hint: 'Extracción de requerimientos (lista JSON).', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'questions', label: 'Preguntas para el cliente', hint: 'Contradicciones, ambigüedades y faltantes (lista JSON).', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'review', label: 'Revisión del compilado', hint: 'Estado, preguntas pendientes y próximos pasos.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'coverage', label: 'Cobertura de requerimientos', hint: 'Verificación de la spec contra el checklist (lista JSON).', unit: 'tokens', step: 500 })}
          {Num({ sec: 'max_tokens', k: 'generation_review', label: 'Revisión de la generación', hint: 'Revisión de las specs generadas.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'apply_answers', k: 'max_tokens', label: 'Aplicar respuestas: tokens por parte', hint: 'Respuesta máxima de cada parte del checklist revisada.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'apply_answers', k: 'batch_size', label: 'Aplicar respuestas: requerimientos por parte', hint: 'El checklist se revisa en partes de este tamaño.', unit: 'req.' })}
          {Num({ sec: '_', k: 'review_spec_chars', label: 'Revisión de la generación: caracteres de la spec', hint: 'Comienzo de la spec que se envía a la revisión.', unit: 'caract.', step: 1000, value: draft.review_spec_chars, onChange: v => setDraft(d => ({ ...d, review_spec_chars: v })) })}
        </div>
      </div>

      <div className={box}>
        {head('Áreas de las preguntas', 'Quién debe responder cada pregunta; cada área puede enviarse con su propio enlace. Pistas: palabras separadas por coma o una expresión regular (sin distinguir mayúsculas) que sugieren el área cuando la IA no la indica. Orden: las pistas con número menor se prueban primero. La primera área es la predeterminada. Los nombres de objetos Z/Y siempre sugieren "abap" si existe.')}
        {listEdit('question_areas', [
          { k: 'key', w: 'w-24', ph: 'clave', title: 'Clave (la que devuelve la IA)', mono: true },
          { k: 'label_es', w: 'w-40', ph: 'Nombre (español)', title: 'Nombre en español' },
          { k: 'label_en', w: 'w-40', ph: 'Name (English)', title: 'Nombre en inglés' },
          { k: 'order', w: 'w-14', ph: 'orden', title: 'Orden de prueba de las pistas', type: 'number' },
          { k: 'hints', w: 'flex-1 min-w-[12rem]', ph: 'pistas: palabra, palabra', title: 'Pistas', mono: true },
        ], { key: '', label_es: '', label_en: '', order: 50, hints: '' })}
      </div>

      <div className={box}>
        {head('Tipos de requerimiento', 'Tipos del checklist de requerimientos que la IA puede asignar. "test_scenario" agrupa los escenarios de prueba y se usa en la verificación de datos de prueba.')}
        {listEdit('requirement_kinds', [
          { k: 'key', w: 'w-32', ph: 'clave', title: 'Clave (la que devuelve la IA)', mono: true },
          { k: 'label_es', w: 'w-48', ph: 'Nombre (español)', title: 'Nombre en español' },
          { k: 'label_en', w: 'w-48', ph: 'Name (English)', title: 'Nombre en inglés' },
        ], { key: '', label_es: '', label_en: '' })}
      </div>

      <div className={box}>
        {head('Verificación en vivo: objetos existentes', 'Si el título o la descripción del caso indican una modificación, se busca en SAP el código actual de los objetos Z/Y que nombran.')}
        <label className="block text-xs text-gray-700"><span className="font-semibold">Palabras de modificación</span>
          <span className="block text-gray-500">Separadas por coma (también se aceptan partes de expresión regular). Hoy solo en inglés; se pueden agregar palabras en español como modific, ampli, cambi, mejor, ajust.</span>
          <input type="text" value={draft.live_check.modification_keywords} onChange={e => set('live_check', 'modification_keywords', e.target.value)} className={`${txt} mt-1 font-mono`} />
        </label>
        <div className="grid sm:grid-cols-2 gap-2">
          {Num({ sec: 'live_check', k: 'max_objects', label: 'Objetos buscados como máximo', hint: 'Nombres Z/Y del caso que se buscan en el sistema.', unit: 'objetos' })}
          {Num({ sec: 'live_check', k: 'source_chars', label: 'Caracteres del código existente', hint: 'Comienzo del código fuente encontrado que se envía a la IA.', unit: 'caract.', step: 500 })}
        </div>
      </div>

      <div className={box}>
        {head('Resumen de documentos del proyecto', 'Resumen corto de cada documento de referencia del proyecto que se muestra en el contexto compilado.')}
        {Check({ sec: 'doc_summary', k: 'enabled', label: 'Resumir automáticamente', hint: 'Una llamada a la IA por documento al abrir el contexto compilado.' })}
        <label className="flex flex-wrap items-center gap-2 text-xs text-gray-700"><span className="font-semibold">Modelo</span>
          <select value={dsMode} onChange={e => set('doc_summary', 'model', e.target.value === 'fixed' ? '' : e.target.value === 'analysis' ? 'analysis' : (dsMode === 'custom' ? dsModel : DOC_SUMMARY_DEFAULT_MODEL))}
            className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
            <option value="fixed">Modelo fijo ({DOC_SUMMARY_DEFAULT_MODEL})</option>
            <option value="analysis">Usar el modelo de análisis</option>
            <option value="custom">Otro modelo</option>
          </select>
          {dsMode === 'custom' && <input type="text" value={dsModel} onChange={e => set('doc_summary', 'model', e.target.value)} placeholder="id del modelo" className="w-56 px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono" />}
        </label>
        <div className="grid sm:grid-cols-2 gap-2">
          {Num({ sec: 'doc_summary', k: 'max_tokens', label: 'Tokens máximos', hint: 'Respuesta máxima de cada resumen.', unit: 'tokens', step: 50 })}
          {Num({ sec: 'doc_summary', k: 'input_chars', label: 'Caracteres leídos', hint: 'Comienzo del documento que se envía para resumir.', unit: 'caract.', step: 500 })}
        </div>
      </div>

      <div className={box}>
        {head('Análisis de video', 'Videos adjuntos al caso: el navegador toma fotogramas y la IA los describe con su minuto.')}
        <div className="grid sm:grid-cols-2 gap-2">
          {Num({ sec: 'video', k: 'max_mb', label: 'Tamaño máximo del video', hint: 'Videos más grandes no se aceptan al subir.', unit: 'MB' })}
          {Num({ sec: 'video', k: 'max_frames', label: 'Fotogramas como máximo', hint: 'Se conservan el primero y los mayores cambios de pantalla.', unit: 'fotog.' })}
          {Num({ sec: 'video', k: 'batch_frames', label: 'Fotogramas por llamada', hint: 'Fotogramas enviados en cada llamada a la IA.', unit: 'fotog.' })}
          {Num({ sec: 'video', k: 'batch_mb', label: 'Tamaño por llamada', hint: 'Límite de imágenes por llamada (el servidor admite unos 4,5 MB).', unit: 'MB' })}
          {Num({ sec: 'video', k: 'max_tokens', label: 'Tokens máximos por parte', hint: 'Respuesta máxima de la descripción de cada grupo de fotogramas.', unit: 'tokens', step: 500 })}
          {Num({ sec: 'video', k: 'summary_max_tokens', label: 'Tokens máximos del resumen', hint: 'Respuesta máxima del resumen del video completo.', unit: 'tokens', step: 100 })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setDraft(JSON.parse(JSON.stringify(SPEC_ANALYSIS_DEFAULTS)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Valores iniciales</button>
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
      { id: 'analysis', label: 'Análisis del contexto compilado', Icon: ScanSearch, content: <AnalysisPolicySettings ssCtx={ssCtx} /> },
    ]} />
  );
}
