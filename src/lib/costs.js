// Case cost settings and currency helpers (Costs tab, Settings → Costs).
// The platform currency is USD. fx_rates: units of each currency per 1 USD (e.g. { EUR: 0.92 }).

export const DEFAULT_COST_CONFIG = {
  vm_monthly_usd: 70,          // AWS t3.large + storage, split by share of SAP operations
  arena_fee_pct: 10,           // Arena platform / management, % of income
  support_fee_pct: 5,          // Arena support, % of income
  payment_fee_pct: 2.9,        // card / Stripe fee on paid invoices
  payment_fee_fixed_usd: 0.3,
  contingency_pct: 10,         // reserve on the planned consultant cost
  tax_pct: 0,                  // taxes / withholding on income
  default_rates: { junior: 25, mid: 40, senior: 60, expert: 80 },   // USD/h when no consultant rate
  fx_rates: {},
  // Hours reported while the case was in these stages count as rework (cost of quality) …
  rework_stages: ['returned', 'adjustments', 'reopened'],
  // … and after go-live (these stages) as hypercare / warranty.
  hypercare_stages: ['approved', 'terminated', 'completed', 'resolved', 'closed'],
};

export function costConfig(settings) {
  const s = settings?.cost_config ?? {};
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const out = { ...DEFAULT_COST_CONFIG };
  for (const k of Object.keys(DEFAULT_COST_CONFIG)) {
    if (typeof DEFAULT_COST_CONFIG[k] === 'number') out[k] = num(s[k], DEFAULT_COST_CONFIG[k]);
  }
  out.default_rates = { ...DEFAULT_COST_CONFIG.default_rates, ...(s.default_rates ?? {}) };
  out.fx_rates = { ...(s.fx_rates ?? {}) };
  out.rework_stages = Array.isArray(s.rework_stages) && s.rework_stages.length ? s.rework_stages : DEFAULT_COST_CONFIG.rework_stages;
  out.hypercare_stages = Array.isArray(s.hypercare_stages) && s.hypercare_stages.length ? s.hypercare_stages : DEFAULT_COST_CONFIG.hypercare_stages;
  out.ai_prices = s.ai_prices ?? null;
  return out;
}

const norm = (c) => String(c ?? '').trim().toUpperCase();

/** The customer-facing currency: customer → project → case, the first one that is not USD. */
export function caseCurrency({ customer, project, caseRow }) {
  for (const c of [customer?.currency, project?.currency, caseRow?.currency]) {
    const n = norm(c);
    if (n && n !== 'USD') return n;
  }
  return 'USD';
}

export function toUsd(amount, currency, cfg) {
  const c = norm(currency) || 'USD';
  if (c === 'USD') return amount;
  const r = Number(cfg?.fx_rates?.[c]);
  return r ? amount / r : amount;
}
export function fromUsd(amount, currency, cfg) {
  const c = norm(currency) || 'USD';
  if (c === 'USD') return amount;
  const r = Number(cfg?.fx_rates?.[c]);
  return r ? amount * r : amount;
}

export function fmtMoney(v, currency = 'USD', lang = 'en', digits = 2) {
  const n = Number(v) || 0;
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es' : 'en-US', {
      style: 'currency', currency: norm(currency) || 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${norm(currency) || 'USD'} ${n.toFixed(digits)}`;
  }
}

export const AI_FEATURE_LABEL = {
  en: {
    context_analyze: 'Compiled context — Analyze', sap_live_check: 'Live SAP object check', sap_coverage: 'SAP standard coverage', spec_requirements: 'Requirements checklist', spec_coverage: 'Requirements coverage check', video_analysis: 'Video analysis', spec_questions: 'Questions for the customer',
    proposal_validation: 'Proposal validation', spec: 'Specifications (A–D)', spec_wizard: 'Spec wizard', prototype: 'Interactive prototype',
    dev_plan: 'Activity plan', activities_ai: 'Activities (AI)', user_manual: 'User manual', blueprint: 'SAP blueprint',
    sap_implementation: 'SAP implementation', sap_diagnostics: 'SAP diagnostics', proposal: 'Customer proposal', case_ai: 'Case (other)', other: 'Other',
  },
  es: {
    context_analyze: 'Contexto compilado — Analizar', sap_live_check: 'Verificación de objetos SAP en vivo', sap_coverage: 'Cobertura SAP estándar', spec_requirements: 'Checklist de requerimientos', spec_coverage: 'Verificación de cobertura de requerimientos', video_analysis: 'Análisis de video', spec_questions: 'Preguntas para el cliente',
    proposal_validation: 'Validación de la propuesta', spec: 'Especificaciones (A–D)', spec_wizard: 'Asistente de spec', prototype: 'Prototipo interactivo',
    dev_plan: 'Plan de actividades', activities_ai: 'Actividades (IA)', user_manual: 'Manual de usuario', blueprint: 'Blueprint SAP',
    sap_implementation: 'Implementación SAP', sap_diagnostics: 'Diagnóstico SAP', proposal: 'Propuesta al cliente', case_ai: 'Caso (otros)', other: 'Otros',
  },
};

export const EXPENSE_CATEGORIES = {
  en: { travel: 'Travel', license: 'Licences', subcontractor: 'Subcontractor', hardware: 'Hardware', other: 'Other' },
  es: { travel: 'Viajes', license: 'Licencias', subcontractor: 'Subcontratista', hardware: 'Hardware', other: 'Otros' },
};

export const COMMON_CURRENCIES = ['USD', 'EUR', 'MXN', 'COP', 'PEN', 'CLP', 'ARS', 'BRL', 'VES', 'GBP', 'CAD', 'CHF'];

/**
 * Status of the case on each date, from its status history (audit log case.status_changed /
 * case.reopened, oldest first). Returns (dateString) => status.
 */
export function statusTimeline(events, currentStatus) {
  const ev = (events ?? []).map(e => ({
    t: new Date(e.created_at).getTime(),
    from: e.old_value?.status ?? null,
    to: e.event_type === 'case.reopened' ? 'reopened' : (e.new_value?.status ?? null),
  })).filter(e => e.to).sort((a, b) => a.t - b.t);
  // time: the reported start time (HH:MM); without it, midday of that date.
  return (date, time) => {
    const hhmm = /^\d{2}:\d{2}/.test(String(time ?? '')) ? String(time).slice(0, 5) : '12:00';
    const t = new Date(`${String(date).slice(0, 10)}T${hhmm}:00`).getTime();
    let st = ev.length ? (ev[0].from ?? 'open') : (currentStatus ?? 'open');
    for (const e of ev) { if (e.t <= t) st = e.to; else break; }
    return st;
  };
}

/** Months (YYYY-MM) from a start date to an end date (default now). */
export function monthsBetween(start, end = new Date()) {
  const out = [];
  const d = new Date(start); d.setDate(1);
  const e = new Date(end);
  while (d <= e && out.length < 120) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  return out;
}
