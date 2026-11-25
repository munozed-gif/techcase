// Which spec the development plan (Activities tab) is built from, and its technical objects.
// system_settings.dev_plan_settings = { base, fallback, full_spec, align_objects }
//   base: 'approved' (the spec signed off / sent to the customer) | 'a' | 'b' | 'c' | 'd'
//   fallback: order tried when the base spec does not exist
//   full_spec: send the whole spec (otherwise the first 4,000 characters, the old behaviour)
//   align_objects: one development activity per technical object, with the spec's calculated hours
import { readObjects, computeEstimate } from './specHours.js';

export const DEV_PLAN_DEFAULTS = { base: 'approved', fallback: ['c', 'a', 'b', 'd'], full_spec: true, align_objects: true };
export const SPEC_NAMES = {
  a: ['Spec A — custom development', 'Spec A — desarrollo a medida'],
  b: ['Spec B — standard SAP', 'Spec B — SAP estándar'],
  c: ['Spec C — customer proposal (sent to the customer)', 'Spec C — propuesta del cliente (la que se envía)'],
  d: ['Spec D — customer summary', 'Spec D — resumen para el cliente'],
};
const MAX_SPEC_CHARS = 60000;

export function devPlanSettings(settings) {
  const v = settings?.dev_plan_settings ?? {};
  return { ...DEV_PLAN_DEFAULTS, ...v, fallback: Array.isArray(v.fallback) && v.fallback.length ? v.fallback : DEV_PLAN_DEFAULTS.fallback };
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
  for (const k of order) if (texts[k]?.trim()) return { key: k, text: cfg.full_spec ? texts[k].slice(0, MAX_SPEC_CHARS) : texts[k].slice(0, 4000), notes, cfg };
  // Manual / older specs: the record's main text.
  const t = specRow?.content ?? '';
  return t.trim() ? { key: null, text: cfg.full_spec ? t.slice(0, MAX_SPEC_CHARS) : t.slice(0, 4000), notes, cfg } : null;
}

/** Technical objects of the spec with the platform's standard hours (same catalog as the spec). */
export function planObjects(pick, settings) {
  if (!pick?.text) return [];
  const { objects } = readObjects(pick.text);
  if (!objects.length) return [];
  const est = computeEstimate(objects, { settings, scenarios: pick.notes?.scenarioCount ?? 0, overrides: pick.notes?.hoursOverrides ?? {} });
  return est.rows.map(r => ({ name: r.name, type: r.type, kind: r.kind, complexity: r.complexity, std: r.std, description: r.description ?? '' }));
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
    const o = objects.find((x, i) => !used.has(i) && x.name && hay.includes(norm(x.name).split(/[\s(]/)[0]));
    if (!o) return a;
    used.add(objects.indexOf(o));
    return { ...a, est_hours: o.std, sap_object_type: KIND_TO_SAP_TYPE[o.kind] ?? a.sap_object_type, _specObject: o.name };
  });
  objects.forEach((o, i) => {
    if (used.has(i) || !isCustomObject(o)) return;   // standard objects that are only read are not built
    out.push({
      title: `${es ? 'Desarrollar' : 'Build'} ${o.name}`.slice(0, 200),
      description: o.description || `${o.type}`, acceptance_criteria: es ? 'Objeto según la especificación aprobada; Code Inspector sin errores.' : 'Object as in the approved specification; Code Inspector without errors.',
      est_hours: o.std, phase: 'development', sap_object_type: KIND_TO_SAP_TYPE[o.kind] ?? 'none', _specObject: o.name,
      _selected: true, _type: activities[0]?._type ?? 'activity',
    });
  });
  return out;
}
