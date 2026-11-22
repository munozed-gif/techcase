// Service plans (Support Factory / Help Desk style) for project proposals.
//
// 1 UE (Unidad Equivalente) = one full-time consultant month (168 h by default).
// A plan band is chosen by the number of UE; the hourly rate depends on band × term (months).
// Prepaid plans: the whole term is prepaid and the total hours can be used at any time during
// the contracted period; hours beyond the pool are billed at the extra-hour rate.
// On demand: hourly rate, minimum monthly payment, consumption billed the following month.
// Each partner has its own catalog (partners.service_plans); the platform default lives in
// system_settings.service_plans_default and falls back to DEFAULT_SERVICE_CATALOG.
import { fromUsd, fmtMoney } from "./costs.js";

export const DEFAULT_SERVICE_CATALOG = {
  currency: "USD",
  ueHours: 168,            // hours per month in 1 UE
  hoursPerDay: 8,
  terms: [1, 3, 6, 12],    // months
  bands: [
    { key: "p1", name: "Plan 1 — ½ UE",   minUe: 0, maxUe: 1 },        // < 1 UE
    { key: "p2", name: "Plan 2 — 1 a 4 UE", minUe: 1, maxUe: 4 },      // 1 ≤ UE < 4
    { key: "p3", name: "Plan 3 — 4 a 8 UE", minUe: 4, maxUe: 8.0001 }, // 4 ≤ UE ≤ 8
    { key: "p4", name: "Plan 4 — > 8 UE",  minUe: 8.0001, maxUe: null },
  ],
  // Hourly rate per band × term (daily rate = hourly × hoursPerDay)
  rates: {
    p1: { 1: 33.5,   3: 32.5,   6: 31.25,  12: 30 },
    p2: { 1: 32.875, 3: 31.875, 6: 30.625, 12: 29.375 },
    p3: { 1: 32.25,  3: 31.25,  6: 30,     12: 28.75 },
    p4: { 1: 31,     3: 30,     6: 28.75,  12: 27.5 },
  },
  extraHourRate: 34.5,
  onDemand: { hourRate: 42.5, minMonthly: 425 },
  factors: { specialist: 1.5, onsite: 2 },
  sla: {
    types: [
      { key: "error",       en: "Error",               es: "Error" },
      { key: "info",        en: "General information", es: "Información general" },
      { key: "improvement", en: "Improvement",         es: "Mejora" },
    ],
    priorities: [
      { key: "critical", en: "Critical", es: "Crítico" },
      { key: "high",     en: "High",     es: "Alto" },
      { key: "normal",   en: "Normal",   es: "Normal" },
      { key: "low",      en: "Low",      es: "Bajo" },
    ],
    // [initial response, solution] in hours (business hours; 1 day = hoursPerDay)
    matrix: {
      error:       { critical: [0.5, 4], high: [1, 8], normal: [2, 16], low: [4, 32] },
      info:        { critical: [1, 8],   high: [2, 16], normal: [4, 32], low: [8, 64] },
      improvement: { critical: [2, 16],  high: [3, 32], normal: [6, 48], low: [16, 96] },
    },
  },
  premises: {
    es: [
      "Servicio de soporte remoto con consultores de nivel Senior.",
      "Si se requiere un consultor de mayor nivel al contratado, la asignación de un Consultor Especialista se contabiliza a 1.5 horas por hora sobre las horas contratadas.",
      "Si se requiere un consultor en sitio, el cliente cubre traslados, boleto aéreo, hospedaje y viáticos, y cada hora se contabiliza a 2.0 horas sobre las horas contratadas.",
      "El servicio cubre la atención de solicitudes en horario laboral. No incluye horario extendido ni continuidad operativa 24x7 (se negocian aparte).",
      "Planes de servicio de 1, 3, 6 o 12 meses y bajo demanda.",
      "Los planes prepagados se pagan en su totalidad antes de iniciar el servicio; el total de horas puede utilizarse durante todo el período contratado.",
      "Las horas adicionales se pagan los primeros 5 días del mes siguiente al servido.",
      "De no cumplirse las condiciones de pago, el servicio será suspendido.",
      "Los precios no incluyen impuestos a las ventas.",
    ],
    en: [
      "Remote support service with Senior-level consultants.",
      "If a consultant above the contracted level is required, a Specialist Consultant counts 1.5 hours per hour against the contracted hours.",
      "If an on-site consultant is required, the customer covers travel, flights, lodging and per diem, and each hour counts 2.0 hours against the contracted hours.",
      "The service covers requests during business hours. Extended hours and 24x7 operational continuity are not included (negotiated separately).",
      "Service plans of 1, 3, 6 or 12 months and on demand.",
      "Prepaid plans are paid in full before the service starts; the total hours can be used at any time during the contracted period.",
      "Additional hours are paid within the first 5 days of the month following the month served.",
      "If the payment conditions are not met, the service will be suspended.",
      "Prices do not include sales taxes.",
    ],
  },
};

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

/** Catalog with defaults filled in (partner catalog → platform default → built-in). */
export function resolveCatalog(partnerCatalog, platformDefault) {
  const src = partnerCatalog ?? platformDefault ?? {};
  const base = DEFAULT_SERVICE_CATALOG;
  return {
    ...base, ...src,
    bands: src.bands?.length ? src.bands : base.bands,
    rates: { ...base.rates, ...(src.rates ?? {}) },
    terms: (src.terms?.length ? src.terms : base.terms).map(Number).sort((a, b) => a - b),
    onDemand: { ...base.onDemand, ...(src.onDemand ?? {}) },
    factors: { ...base.factors, ...(src.factors ?? {}) },
    sla: { ...base.sla, ...(src.sla ?? {}), matrix: { ...base.sla.matrix, ...(src.sla?.matrix ?? {}) } },
    premises: { ...base.premises, ...(src.premises ?? {}) },
  };
}

export function bandFor(catalog, ue) {
  const u = Number(ue) || 0;
  return catalog.bands.find(b => u >= Number(b.minUe ?? 0) && (b.maxUe == null || u < Number(b.maxUe))) ?? catalog.bands[catalog.bands.length - 1];
}

/** Convert a catalog amount to the proposal currency (catalog prices are in catalog.currency). */
function toCur(amount, catalog, currency, cfg) {
  const cc = (catalog.currency || "USD").toUpperCase();
  const pc = (currency || cc).toUpperCase();
  if (cc === pc) return amount;
  return cc === "USD" ? fromUsd(amount, pc, cfg) : amount; // other catalog currencies: no conversion table
}

/**
 * Totals for a service-plan or on-demand proposal.
 * commercials: { proposalType: 'plan'|'on_demand', ue, terms: [months], taxPct, onDemandHours }
 * backlogHours: estimated hours of the selected cases (optional), shown against the pool.
 */
export function computeServiceTotals(commercials, catalog, currency, cfg, backlogHours = 0) {
  const c = commercials ?? {};
  const tax = Number(c.taxPct) || 0;
  if (c.proposalType === "on_demand") {
    const rate = r2(toCur(catalog.onDemand.hourRate, catalog, currency, cfg));
    const min = r2(toCur(catalog.onDemand.minMonthly, catalog, currency, cfg));
    const est = Number(c.onDemandHours) || 0;
    const examples = [...new Set([Math.round(min / (rate || 1)), 42, 84, 168, est].filter(h => h > 0))].sort((a, b) => a - b)
      .map(h => ({ hours: h, ue: r2(h / catalog.ueHours), amount: r2(Math.max(min, h * rate)) }));
    return {
      type: "on_demand", currency, rate, dailyRate: r2(rate * catalog.hoursPerDay), minMonthly: min,
      extraHourRate: rate, estimatedHours: est, examples, backlogHours: r2(backlogHours),
      options: [], total: r2(min), taxPct: tax,
    };
  }
  const ue = Number(c.ue) || 0;
  const band = bandFor(catalog, ue);
  const hoursMonth = r2(ue * catalog.ueHours);
  const terms = (c.terms?.length ? c.terms : catalog.terms).map(Number).filter(t => catalog.rates[band.key]?.[t] != null)
    .sort((a, b) => a - b);
  const options = terms.map(months => {
    const rate = r2(toCur(catalog.rates[band.key][months], catalog, currency, cfg));
    const exactRate = toCur(catalog.rates[band.key][months], catalog, currency, cfg);
    const totalHours = r2(hoursMonth * months);
    const total = r2(totalHours * exactRate);
    return {
      months, band: band.key, bandName: band.name, rate, dailyRate: r2(exactRate * catalog.hoursPerDay),
      hoursMonth, totalHours, total, monthly: r2(total / months),
      taxAmount: r2(total * tax / 100), totalWithTax: r2(total * (1 + tax / 100)),
    };
  });
  const pool = options[0]?.totalHours ?? 0;
  return {
    type: "plan", currency, ue, band: band.key, bandName: band.name, hoursMonth, options,
    extraHourRate: r2(toCur(catalog.extraHourRate, catalog, currency, cfg)),
    factors: catalog.factors, backlogHours: r2(backlogHours),
    backlogPctOfFirst: pool ? Math.round((backlogHours / pool) * 100) : null,
    total: options[0]?.total ?? 0, taxPct: tax,
  };
}

// ── Document sections (built by the platform, never by the AI) ─────────────
const termName = (m, es) => es
  ? ({ 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" }[m] ?? `${m} meses`)
  : ({ 1: "Monthly", 3: "Quarterly", 6: "Half-yearly", 12: "Yearly" }[m] ?? `${m} months`);
export { termName };

const fmtH = (h, es) => (Number(h) || 0).toLocaleString(es ? "es" : "en-US", { maximumFractionDigits: 1 });
const slaTime = (h, hpd, es) => {
  const v = Number(h) || 0;
  if (v < 1) return `${Math.round(v * 60)} ${es ? "minutos" : "minutes"}`;
  if (v < hpd || v % hpd !== 0) return `${fmtH(v, es)} ${es ? (v === 1 ? "hora" : "horas") : (v === 1 ? "hour" : "hours")}`;
  const d = v / hpd;
  return `${d} ${es ? (d === 1 ? "día" : "días") : (d === 1 ? "day" : "days")}`;
};

export function slaMarkdown(catalog, lang = "en") {
  const es = lang === "es";
  const { types, priorities, matrix } = catalog.sla;
  const lines = [`## ${es ? "Acuerdo de nivel de servicio (SLA)" : "Service level agreement (SLA)"}`, "",
    es ? "Tiempos en horario laboral, según el tipo de solicitud y su prioridad." : "Times in business hours, by request type and priority.", "",
    `| ${es ? "Tipo" : "Type"} | ${es ? "Prioridad" : "Priority"} | ${es ? "Respuesta inicial" : "Initial response"} | ${es ? "Solución" : "Solution"} |`,
    "|---|---|---|---|"];
  for (const tp of types) for (const pr of priorities) {
    const v = matrix[tp.key]?.[pr.key];
    if (!v) continue;
    lines.push(`| ${tp[es ? "es" : "en"]} | ${pr[es ? "es" : "en"]} | ${slaTime(v[0], catalog.hoursPerDay, es)} | ${slaTime(v[1], catalog.hoursPerDay, es)} |`);
  }
  return lines.join("\n");
}

export function premisesMarkdown(catalog, lang = "en") {
  const es = lang === "es";
  const items = catalog.premises?.[es ? "es" : "en"] ?? [];
  return [`## ${es ? "Premisas del servicio" : "Service premises"}`, "", ...items.map(i => `- ${i}`)].join("\n");
}

export function servicePlanMarkdown(totals, catalog, lang = "en") {
  const es = lang === "es";
  const cur = totals.currency;
  const m = v => fmtMoney(v, cur, lang);
  const out = [`## ${es ? "Planes y propuesta económica" : "Plans and economic proposal"}`, ""];
  if (totals.type === "on_demand") {
    out.push(es
      ? `**Servicio bajo demanda** — tarifa ${m(totals.rate)} por hora (${m(totals.dailyRate)} por día). Pago mínimo mensual de ${m(totals.minMonthly)}, que se descuenta del total consumido si éste lo supera.`
      : `**On-demand service** — ${m(totals.rate)} per hour (${m(totals.dailyRate)} per day). Minimum monthly payment of ${m(totals.minMonthly)}, deducted from the total consumed when that is higher.`, "",
      `| ${es ? "Horas / mes" : "Hours / month"} | UE | ${es ? "Monto del mes" : "Monthly amount"} |`, "|---:|---:|---:|",
      ...totals.examples.map(e => `| ${fmtH(e.hours, es)} | ${e.ue} | ${m(e.amount)} |`), "",
      es ? "El monto de las horas consumidas se paga los primeros 5 días del mes siguiente al servido." : "The hours consumed are paid within the first 5 days of the following month.");
  } else {
    out.push(es
      ? `**${totals.bandName}** — ${fmtH(totals.ue, es)} UE = **${fmtH(totals.hoursMonth, es)} horas por mes** (1 UE = ${catalog.ueHours} h/mes). Elija el período que prefiera; el total de horas puede utilizarse durante todo el período contratado.`
      : `**${totals.bandName}** — ${fmtH(totals.ue, es)} UE = **${fmtH(totals.hoursMonth, es)} hours per month** (1 UE = ${catalog.ueHours} h/month). Choose the period you prefer; the total hours can be used at any time during the contracted period.`, "",
      `| ${es ? "Plan prepagado" : "Prepaid plan"} | ${es ? "Meses" : "Months"} | ${es ? "Horas totales" : "Total hours"} | ${es ? "Tarifa hora" : "Hourly rate"} | ${es ? "Tarifa diaria" : "Daily rate"} | ${es ? "Equivalente mensual" : "Monthly equivalent"} | ${es ? "Total del período" : "Period total"} |`,
      "|---|---:|---:|---:|---:|---:|---:|",
      ...totals.options.map(o => `| ${termName(o.months, es)} | ${o.months} | ${fmtH(o.totalHours, es)} | ${m(o.rate)} | ${m(o.dailyRate)} | ${m(o.monthly)} | **${m(o.total)}** |`), "",
      es ? `**Hora adicional:** ${m(totals.extraHourRate)} (horas utilizadas por encima del total contratado).` : `**Additional hour:** ${m(totals.extraHourRate)} (hours used beyond the contracted total).`,
      es ? `Consultor especialista: cada hora cuenta ×${totals.factors?.specialist ?? 1.5}. Consultor en sitio: cada hora cuenta ×${totals.factors?.onsite ?? 2}, más gastos de viaje.` : `Specialist consultant: each hour counts ×${totals.factors?.specialist ?? 1.5}. On-site consultant: each hour counts ×${totals.factors?.onsite ?? 2}, plus travel expenses.`);
    if (totals.backlogHours > 0) {
      out.push("", es
        ? `Los casos incluidos en esta propuesta suman unas **${fmtH(totals.backlogHours, es)} horas** estimadas, que se consumen del total contratado.`
        : `The cases included in this proposal add up to about **${fmtH(totals.backlogHours, es)} estimated hours**, consumed from the contracted total.`);
    }
    if (totals.taxPct) out.push("", es ? `Impuestos: ${totals.taxPct}% sobre los montos indicados.` : `Taxes: ${totals.taxPct}% on the amounts shown.`);
  }
  out.push("", es ? `Montos en ${cur}. Los precios no incluyen impuestos a las ventas salvo que se indique.` : `Amounts in ${cur}. Prices exclude sales taxes unless stated.`);
  return out.join("\n");
}

/** Replace the [[SLA]], [[PREMISES]] and [[INVESTMENT]] markers of a service-proposal narrative. */
export function mergeServiceSections(md, { investment, sla, premises }) {
  let t = md ?? "";
  const put = (marker, block) => { t = t.includes(marker) ? t.replace(marker, block) : `${t}\n\n${block}`; };
  put("[[SLA]]", sla);
  put("[[PREMISES]]", premises);
  put("[[INVESTMENT]]", investment);
  return t;
}
