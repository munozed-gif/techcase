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
};

export function estimationFactors(settings) {
  const s = settings?.estimation_factors ?? {};
  return {
    automation: { ...DEFAULT_ESTIMATION_FACTORS.automation, ...(s.automation ?? {}) },
    seniority: { ...DEFAULT_ESTIMATION_FACTORS.seniority, ...(s.seniority ?? {}) },
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
export function implModeFor(activity, { arenaAvailable, policyTypes }) {
  if (activity?.phase === 'design') return 'design';
  // Testing and adjustment are done by hand (as in the spec's estimate): no automation factor.
  if (/test|adjustment/.test(activity?.phase ?? '')) return 'manual';
  if (!arenaAvailable) return 'manual';
  const type = activity?.sap_object_type && activity.sap_object_type !== 'none'
    ? activity.sap_object_type : guessObjectType(activity);
  if (!type) return 'manual';
  return POLICY_TO_MODE[policyTypes?.[type]] ?? 'manual';
}

const round1 = (n) => Math.max(0.5, Math.round(n * 2) / 2);

/** Arena hours from the standard hours. The design factor only applies with the live SAP check. */
export function arenaHours(manualHours, mode, seniority, factors, { liveCheck = true } = {}) {
  const base = Number(manualHours) || 0;
  if (!base) return 0;
  const f = factors ?? DEFAULT_ESTIMATION_FACTORS;
  const a = mode === 'design' ? (liveCheck ? f.automation.design : 1) : (f.automation[mode] ?? 1);
  const s = f.seniority[seniority] ?? 1;
  return round1(base * a * s);
}

/** Fill est_hours_manual / impl_mode / seniority / est_hours on a list of activities. */
export function applyArenaEstimate(activities, ctx) {
  const factors = ctx.factors ?? DEFAULT_ESTIMATION_FACTORS;
  const seniority = SENIORITY_LEVELS.includes(ctx.seniority) ? ctx.seniority : 'mid';
  return (activities ?? []).map(a => {
    const manual = Number(a.est_hours_manual ?? a.est_hours) || 0;
    const mode = a.impl_mode && ctx.keepModes ? a.impl_mode : implModeFor(a, ctx);
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
