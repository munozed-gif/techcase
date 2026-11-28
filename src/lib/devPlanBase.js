// Which spec the development plan (Activities tab) is built from, and its technical objects.
// system_settings.dev_plan_settings = { base, fallback, full_spec, align_objects }
//   base: 'approved' (the spec signed off / sent to the customer) | 'a' | 'b' | 'c' | 'd'
//   fallback: order tried when the base spec does not exist
//   full_spec: send the whole spec (otherwise the first 4,000 characters, the old behaviour)
//   align_objects: one development activity per technical object, with the spec's calculated hours
//   design_min / design_max, dev_min / dev_max: activity ranges asked of the AI
//   json_max_tokens / doc_max_tokens: max tokens of the activities (JSON) and the plan document calls
//   max_hours: upper limit of est_hours of a generated activity
//   max_spec_chars / short_spec_chars: spec characters sent with full_spec on / off
import { readObjects, computeEstimate } from './specHours.js';

export const DEV_PLAN_DEFAULTS = {
  base: 'approved', fallback: ['c', 'a', 'b', 'd'], full_spec: true, align_objects: true, include_tests: true,
  design_min: 3, design_max: 5, dev_min: 4, dev_max: 8,
  json_max_tokens: 3000, doc_max_tokens: 3000, max_hours: 40,
  max_spec_chars: 60000, short_spec_chars: 4000,
};
const DEV_PLAN_NUMERIC = ['design_min', 'design_max', 'dev_min', 'dev_max', 'json_max_tokens', 'doc_max_tokens', 'max_hours', 'max_spec_chars', 'short_spec_chars'];
export const SPEC_NAMES = {
  a: ['Spec A — custom development', 'Spec A — desarrollo a medida'],
  b: ['Spec B — standard SAP', 'Spec B — SAP estándar'],
  c: ['Spec C — customer proposal (sent to the customer)', 'Spec C — propuesta del cliente (la que se envía)'],
  d: ['Spec D — customer summary', 'Spec D — resumen para el cliente'],
};
export function devPlanSettings(settings) {
  const v = settings?.dev_plan_settings ?? {};
  const out = { ...DEV_PLAN_DEFAULTS, ...v, fallback: Array.isArray(v.fallback) && v.fallback.length ? v.fallback : DEV_PLAN_DEFAULTS.fallback };
  for (const k of DEV_PLAN_NUMERIC) out[k] = Number(out[k]) > 0 ? Number(out[k]) : DEV_PLAN_DEFAULTS[k];
  if (out.design_max < out.design_min) out.design_max = out.design_min;
  if (out.dev_max < out.dev_min) out.dev_max = out.dev_min;
  return out;
}

/** { key, text, notes } of the spec the plan is built from (null when the case has no spec text). */
export function pickPlanSpec(specRow, settings) {
  const cfg = devPlanSettings(settings);
  let notes = {};
  try { notes = typeof specRow?.notes === 'string' ? JSON.parse(specRow.notes) : (specRow?.notes ?? {}); } catch { notes = {}; }
  const texts = { a: notes.specA, b: notes.specB, c: notes.specC, d: notes.specD };
  const approved = notes.approvedSpec || notes.signoff?.specKey || null;
  const first = cfg.base === 'approved' ? approved : cfg.base;
  const order = [first, ...cfg.fallback].filter((k, i, arr) => k && texts[k] !== undefined && arr.indexOf(k) === i);
  for (const k of order) if (texts[k]?.trim()) return { key: k, text: cfg.full_spec ? texts[k].slice(0, cfg.max_spec_chars) : texts[k].slice(0, cfg.short_spec_chars), notes, cfg };
  // Manual / older specs: the record's main text.
  const t = specRow?.content ?? '';
  return t.trim() ? { key: null, text: cfg.full_spec ? t.slice(0, cfg.max_spec_chars) : t.slice(0, cfg.short_spec_chars), notes, cfg } : null;
}

/** Technical objects of the spec with the platform's standard hours (same catalog as the spec). */
export function planObjects(pick, settings) {
  if (!pick?.text) return [];
  const { objects } = readObjects(pick.text);
  if (!objects.length) return [];
  const est = computeEstimate(objects, { settings, scenarios: pick.notes?.scenarioCount ?? 0, overrides: pick.notes?.hoursOverrides ?? {} });
  // The plan matches the approved document: hours written in the spec win (a consultant override
  // still applies); the catalog is used only when the spec states no hours for the object.
  return est.rows.map(r => {
    const override = pick.notes?.hoursOverrides?.[r.name]?.hours;
    const std = override !== undefined && override !== null && override !== '' ? Number(override)
      : Number.isFinite(r.statedHours) ? r.statedHours : r.std;
    // Arena hours written in the spec too (only when the standard hours are the spec's own).
    const arena = (override === undefined || override === null || override === '') && Number.isFinite(r.statedArena) ? r.statedArena : null;
    return { name: r.name, type: r.type, kind: r.kind, complexity: r.complexity, std, arena, description: r.description ?? '', stated: Number.isFinite(r.statedHours) || (override !== undefined && override !== null && override !== '') };
  });
}

// Object kind (spec hours catalog) → sap_object_type of the activities.
export const KIND_TO_SAP_TYPE = {
  table: 'table', ddic: 'structure', message: 'message_class', class: 'class', enhancement: 'enhancement',
  function: 'function_module', program: 'program', report: 'report', service: 'odata', fiori: 'none',
  integration: 'none', form: 'smartform', auth: 'config', config: 'config', transaction: 'none', other: 'none',
};

// A custom object to build (Z/Y or a /namespace/ name), not a standard table or object that is only used.
export const isCustomObject = o => /^(Z|Y|\/[A-Z0-9_]+\/)/i.test(String(o?.name ?? '').trim()) && !/^(standard|est[aá]ndar)/i.test(String(o?.type ?? ''));

/** Align the generated development activities with the spec's objects: hours from the spec, and an
 *  activity added for any object the AI left out. */
export function alignWithObjects(activities, objects, lang = 'es') {
  if (!objects.length) return activities;
  const es = lang === 'es';
  const norm = s => String(s ?? '').toUpperCase();
  const used = new Set();
  const out = activities.map(a => {
    if (a.phase !== 'development') return a;
    const hay = norm(`${a.title} ${a.description}`);
    // SAP names (ZCL_..., /SCMTMS/...) match on their first word; descriptive names ("Custom Logic de ...",
    // "Set ...") on the whole name, so a common word does not attach the wrong object.
    const key = x => { const n = norm(x.name).replace(/\s*\(.*$/, '').trim(); return isCustomObject(x) || /^[A-Z0-9_\/]+$/.test(n.split(/\s/)[0]) && !/\s/.test(n) ? n.split(/[\s(]/)[0] : n; };
    const o = objects.find((x, i) => !used.has(i) && x.name && key(x).length >= 3 && hay.includes(key(x)));
    // A development activity with no object of the spec is work the approved estimate does not include.
    if (!o) return null;
    used.add(objects.indexOf(o));
    return { ...a, est_hours: o.std, sap_object_type: KIND_TO_SAP_TYPE[o.kind] ?? a.sap_object_type, _specObject: o.name, _specArena: o.arena };
  });
  for (let k = out.length - 1; k >= 0; k--) if (out[k] === null) out.splice(k, 1);
  objects.forEach((o, i) => {
    // Every object the approved spec charges hours for is in the plan, so the plan adds up to the spec.
    // Without stated hours, standard objects that are only read are not built.
    const stated = !!o.stated && Number(o.std) > 0;
    if (used.has(i) || (!isCustomObject(o) && !stated)) return;
    const verb = isCustomObject(o) ? (es ? 'Desarrollar' : 'Build')
      : /config|auth|fiori/.test(o.kind ?? '') ? (es ? 'Configurar' : 'Configure') : (es ? 'Implementar' : 'Implement');
    out.push({
      title: `${verb} ${o.name}`.slice(0, 200),
      description: o.description || `${o.type}`, acceptance_criteria: es ? 'Objeto según la especificación aprobada; Code Inspector sin errores.' : 'Object as in the approved specification; Code Inspector without errors.',
      est_hours: o.std, phase: 'development', sap_object_type: KIND_TO_SAP_TYPE[o.kind] ?? 'none', _specObject: o.name, _specArena: o.arena,
      _selected: true, _type: activities[0]?._type ?? 'activity',
    });
  });
  return out;
}

/** Standard hours of each phase of the spec's estimate table: { analysis, unit, uat } (null when absent). */
export function planPhaseHours(pick) {
  const out = { analysis: null, unit: null, uat: null, arena: { analysis: null, unit: null, uat: null } };
  const lines = String(pick?.text ?? '').split('\n').filter(l => l.trim().startsWith('|'));
  const cellsOf = l => l.split('|').slice(1, -1).map(c => c.replace(/\*\*/g, '').trim());
  for (let i = 0; i < lines.length; i++) {
    const head = cellsOf(lines[i]);
    if (!head.some(c => /^(fase|phase)$/i.test(c))) continue;
    const hIx = head.findIndex(c => /^(horas( est[aá]ndar)?|hours|standard hours)$/i.test(c));
    const aIx = head.findIndex(c => /arena/i.test(c));
    if (hIx < 0) continue;
    const numAt = (r, ix) => { if (ix < 0) return null; const m = String(r[ix] ?? '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    for (const l of lines.slice(i + 1)) {
      const r = cellsOf(l);
      const k = /an[aá]lisis|analysis/i.test(r[0] ?? '') ? 'analysis' : /prueba.*unit|unit.*test/i.test(r[0] ?? '') ? 'unit' : /uat|aceptaci|acceptance/i.test(r[0] ?? '') ? 'uat' : null;
      if (!k) continue;
      out[k] = numAt(r, hIx); out.arena[k] = numAt(r, aIx);
    }
    break;
  }
  return out;
}

/** Test activities from the spec's estimate: unit tests (Technical Test) and UAT support (User Test). */
export function planTestActivities(pick, lang = 'es', type = 'activity') {
  const es = lang === 'es';
  const ph = planPhaseHours(pick);
  const out = [];
  if (ph.unit) out.push({ title: es ? 'Pruebas unitarias' : 'Unit testing', description: es ? 'Pruebas unitarias de los objetos desarrollados, según la estimación de la especificación aprobada.' : 'Unit tests of the developed objects, as in the approved specification estimate.', acceptance_criteria: es ? 'Pruebas unitarias ejecutadas sin errores; Code Inspector sin errores.' : 'Unit tests run without errors; Code Inspector without errors.', est_hours: ph.unit, phase: 'technical_test', sap_object_type: 'none', _selected: true, _type: type, _specPhase: 'unit', _specArena: ph.arena.unit });
  if (ph.uat) out.push({ title: es ? 'Soporte UAT' : 'UAT support', description: es ? 'Soporte a las pruebas de aceptación del usuario, según la estimación de la especificación aprobada.' : 'Support for user acceptance testing, as in the approved specification estimate.', acceptance_criteria: es ? 'Escenarios de prueba del cliente ejecutados y aprobados.' : 'Customer test scenarios run and approved.', est_hours: ph.uat, phase: 'user_test', sap_object_type: 'none', _selected: true, _type: type, _specPhase: 'uat', _specArena: ph.arena.uat });
  return out;
}

/** Standard hours of the "Analysis & design" phase in the spec's estimate table (null if absent). */
export function planDesignHours(pick) {
  const lines = String(pick?.text ?? '').split('\n').filter(l => l.trim().startsWith('|'));
  const cellsOf = l => l.split('|').slice(1, -1).map(c => c.replace(/\*\*/g, '').trim());
  for (let i = 0; i < lines.length; i++) {
    const head = cellsOf(lines[i]);
    if (!head.some(c => /^(fase|phase)$/i.test(c))) continue;
    const hIx = head.findIndex(c => /^(horas( est[aá]ndar)?|hours|standard hours)$/i.test(c));
    if (hIx < 0) continue;
    for (const l of lines.slice(i + 1)) {
      const r = cellsOf(l);
      if (/an[aá]lisis|analysis/i.test(r[0] ?? '')) {
        const m = String(r[hIx] ?? '').replace(',', '.').match(/\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      }
    }
  }
  return null;
}

/** Scale the design activities so they add up to the spec's analysis & design hours (0.5 h steps). */
// Rounding of the scaled design hours: Settings → Arena estimation → round_step / min_hours (0.5 / 0.5).
function roundDesign(n, factors) {
  const step = Number(factors?.round_step) > 0 ? Number(factors.round_step) : 0.5;
  const min = Number.isFinite(Number(factors?.min_hours)) && factors?.min_hours !== '' && factors?.min_hours != null ? Number(factors.min_hours) : 0.5;
  return Math.max(min, Math.round(n / step) * step);
}

export function scaleDesign(activities, hours, factors = null) {
  const design = activities.filter(a => a.phase === 'design');
  const sum = design.reduce((s, a) => s + (Number(a.est_hours) || 0), 0);
  if (!design.length || !hours || !sum) return activities;
  const f = hours / sum;
  let left = hours;
  const out = activities.map(a => {
    if (a.phase !== 'design') return a;
    const isLast = a === design[design.length - 1];
    const h = isLast ? roundDesign(left, factors) : roundDesign((Number(a.est_hours) || 0) * f, factors);
    left -= h;
    return { ...a, est_hours: h };
  });
  return out;
}

/** After the Arena estimate: use the Arena hours written in the spec (objects, test phases) and make
 *  the design activities add up to the spec's analysis & design Arena hours. */
export function applySpecArena(activities, pick, factors = null) {
  const designArena = planPhaseHours(pick).arena.analysis;
  let out = activities.map(a => (Number.isFinite(a._specArena) && a._specArena > 0 ? { ...a, est_hours: a._specArena } : a));
  const design = out.filter(a => a.phase === 'design');
  const sum = design.reduce((s, a) => s + (Number(a.est_hours) || 0), 0);
  if (designArena && design.length && sum && Math.abs(sum - designArena) >= 0.5) {
    const f = designArena / sum; let left = designArena;
    out = out.map(a => {
      if (a.phase !== 'design') return a;
      const h = a === design[design.length - 1] ? roundDesign(left, factors) : roundDesign(a.est_hours * f, factors);
      left -= h; return { ...a, est_hours: h };
    });
  }
  return out;
}

/**
 * Development package the spec puts the objects in (e.g. ZE26TMPA_PLANIFICACION), or null.
 * First a row of the technical objects table whose type is a package; then a "paquete X" /
 * "package X" mention in the text. Only customer packages (Z / Y / /NAMESPACE/), never $TMP.
 */
export function specPackage(text) {
  const src = String(text ?? '');
  const isPkg = n => /^(Z|Y|\/[A-Z0-9_]+\/)[A-Z0-9_\/]{1,29}$/i.test(n) && !/^\$/.test(n);
  for (const line of src.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.replace(/\*\*|`/g, '').trim());
    if (!cells.some(c => /^(paquete|package|devclass|paquete de desarrollo|development package)\b/i.test(c))) continue;
    const name = cells.find(c => isPkg(c));
    if (name) return name.toUpperCase();
  }
  const m = src.match(/\b(?:paquete|package)(?:\s+de\s+desarrollo|\s+transportable)?\s+[`*]*((?:Z|Y)[A-Z0-9_]{2,29})\b/i);
  return m && isPkg(m[1]) ? m[1].toUpperCase() : null;
}
