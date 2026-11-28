// Arena estimation.
//
// Every activity keeps the STANDARD estimate (done by hand by a mid-level consultant —
// est_hours_manual) next to the ARENA estimate (est_hours), which applies:
//   - an automation factor, from how the activity is implemented:
//       auto   — Arena generates the ABAP and writes it to SAP (the consultant reviews and tests)
//       semi   — Arena creates the object in SAP; the consultant completes it
//       manual — done by hand (configuration, OData, Smartforms, or no Arena implementation)
//       design — analysis / design work, shorter when the live SAP check verifies objects
//   - a seniority factor (junior · mid · senior · expert).
// The factors are configurable in Settings (system_settings.estimation_factors).

export const SENIORITY_LEVELS = ['junior', 'mid', 'senior', 'expert'];

export const DEFAULT_ESTIMATION_FACTORS = {
  automation: { auto: 0.4, semi: 0.7, manual: 1.0, design: 0.85 },
  seniority: { junior: 1.4, mid: 1.0, senior: 0.8, expert: 0.7 },
  default_seniority: 'mid',   // when neither the assigned consultant nor the case sets one
  round_step: 0.5,            // Arena / calculated hours are rounded to this step (h)
  min_hours: 0.5,             // minimum Arena hours of an activity with hours
  unit_test_mode: 'manual',   // automation mode applied to unit tests (manual = no Arena reduction)
  uat_mode: 'manual',         // automation mode applied to UAT support / test & adjustment activities
};
export const TEST_MODES = ['manual', 'semi', 'auto'];

export function estimationFactors(settings) {
  const s = settings?.estimation_factors ?? {};
  const D = DEFAULT_ESTIMATION_FACTORS;
  const pos = (v, d) => (Number(v) > 0 ? Number(v) : d);
  return {
    automation: { ...D.automation, ...(s.automation ?? {}) },
    seniority: { ...D.seniority, ...(s.seniority ?? {}) },
    default_seniority: SENIORITY_LEVELS.includes(s.default_seniority) ? s.default_seniority : D.default_seniority,
    round_step: pos(s.round_step, D.round_step),
    min_hours: Number(s.min_hours) >= 0 && s.min_hours !== null && s.min_hours !== '' && s.min_hours !== undefined ? Number(s.min_hours) : D.min_hours,
    unit_test_mode: TEST_MODES.includes(s.unit_test_mode) ? s.unit_test_mode : D.unit_test_mode,
    uat_mode: TEST_MODES.includes(s.uat_mode) ? s.uat_mode : D.uat_mode,
  };
}

const POLICY_TO_MODE = { 'ai-generate': 'auto', 'adt-create-only': 'semi', manual: 'manual' };

// Words in an activity's title / description → SAP object type of the pipeline policy.
const TYPE_PATTERNS = [
  ['function_module', /\b(function module|m[oó]dulo de funci[oó]n|\bFM\b|RFC)\b/i],
  ['bapi', /\bBAPI\b/i],
  ['class', /\b(class|clase|ABAP OO|m[eé]todo)\b/i],
  ['badi', /\b(BAdI|BADI)\b/i],
  ['enhancement', /\b(enhancement|ampliaci[oó]n|user exit|exit)\b/i],
  ['report', /\b(report|reporte|informe|ALV)\b/i],
  ['program', /\b(program|programa)\b/i],
  ['table', /\b(table|tabla|Z-?table)\b/i],
  ['structure', /\b(structure|estructura)\b/i],
  ['domain', /\b(domain|dominio)\b/i],
  ['data_element', /\b(data element|elemento de datos)\b/i],
  ['message_class', /\b(message class|clase de mensajes)\b/i],
  ['odata', /\b(OData|Gateway|SEGW|service|servicio|API)\b/i],
  ['smartform', /\b(smartform|smart form|Adobe form|formulario)\b/i],
  ['config', /\b(customizing|configuraci[oó]n|configuration|SPRO|IMG)\b/i],
];

export function guessObjectType(activity) {
  const t = `${activity?.title ?? ''} ${activity?.description ?? ''}`;
  for (const [type, re] of TYPE_PATTERNS) if (re.test(t)) return type;
  return null;
}

/**
 * How an activity is implemented. arenaAvailable: the case can use Arena's SAP implementation
 * (ABAP ADT environment, live SAP check on, plan allows it). policyTypes: the SAP MCP policy's
 * object_types map ({ program: 'ai-generate', … }).
 */
export function implModeFor(activity, { arenaAvailable, policyTypes, factors }) {
  if (activity?.phase === 'design') return 'design';
  // Testing and adjustment: the test mode of the estimation factors (default manual = no automation
  // factor, as in the spec's estimate). Automatic / semi only apply when Arena is available.
  // technical_test / technical_adjustment follow unit_test_mode; the other test phases uat_mode.
  if (/test|adjustment/.test(activity?.phase ?? '')) return testMode(/^technical_/.test(activity.phase) ? factors?.unit_test_mode : factors?.uat_mode, arenaAvailable);
  if (!arenaAvailable) return 'manual';
  const type = activity?.sap_object_type && activity.sap_object_type !== 'none'
    ? activity.sap_object_type : guessObjectType(activity);
  if (!type) return 'manual';
  return POLICY_TO_MODE[policyTypes?.[type]] ?? 'manual';
}

/** Mode used for unit tests / UAT: the configured one, manual when Arena is not available. */
export function testMode(mode, arenaAvailable) {
  return arenaAvailable && TEST_MODES.includes(mode) ? mode : 'manual';
}

/** Round to the configured step (default 0.5 h). */
export function roundHours(n, factors) {
  const step = factors?.round_step ?? DEFAULT_ESTIMATION_FACTORS.round_step;
  return Math.round(n / step) * step;
}
const round1 = (n, f) => Math.max(f?.min_hours ?? DEFAULT_ESTIMATION_FACTORS.min_hours, roundHours(n, f));

/** Arena hours from the standard hours. The design factor only applies with the live SAP check. */
export function arenaHours(manualHours, mode, seniority, factors, { liveCheck = true } = {}) {
  const base = Number(manualHours) || 0;
  if (!base) return 0;
  const f = factors ?? DEFAULT_ESTIMATION_FACTORS;
  const a = mode === 'design' ? (liveCheck ? f.automation.design : 1) : (f.automation[mode] ?? 1);
  const s = f.seniority[seniority] ?? 1;
  return round1(base * a * s, f);
}

/** Fill est_hours_manual / impl_mode / seniority / est_hours on a list of activities. */
export function applyArenaEstimate(activities, ctx) {
  const factors = ctx.factors ?? DEFAULT_ESTIMATION_FACTORS;
  const seniority = SENIORITY_LEVELS.includes(ctx.seniority) ? ctx.seniority : (factors.default_seniority ?? DEFAULT_ESTIMATION_FACTORS.default_seniority);
  return (activities ?? []).map(a => {
    const manual = Number(a.est_hours_manual ?? a.est_hours) || 0;
    const mode = a.impl_mode && ctx.keepModes ? a.impl_mode : implModeFor(a, { ...ctx, factors });
    return { ...a, est_hours_manual: manual, impl_mode: mode, seniority,
      est_hours: arenaHours(manual, mode, seniority, factors, { liveCheck: !!ctx.liveCheck }) };
  });
}

export function estimateTotals(activities) {
  const manual = (activities ?? []).reduce((s, a) => s + (Number(a.est_hours_manual ?? a.est_hours) || 0), 0);
  const arena = (activities ?? []).reduce((s, a) => s + (Number(a.est_hours) || 0), 0);
  const saved = manual > 0 ? Math.round((1 - arena / manual) * 100) : 0;
  return { manual: Math.round(manual * 10) / 10, arena: Math.round(arena * 10) / 10, saved };
}

export const IMPL_MODE_LABEL = {
  en: { auto: 'Auto', semi: 'Semi', manual: 'Manual', design: 'Design' },
  es: { auto: 'Auto', semi: 'Semi', manual: 'Manual', design: 'Diseño' },
};
export const SENIORITY_LABEL = {
  en: { junior: 'Junior', mid: 'Mid', senior: 'Senior', expert: 'Expert' },
  es: { junior: 'Junior', mid: 'Semi-senior', senior: 'Senior', expert: 'Experto' },
};
