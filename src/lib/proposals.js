// Customer proposals (Project → Proposals).
// The numbers (hours, rates, amounts, totals) are always computed here, never by the AI;
// the AI only writes the narrative around them. The document uses the same look as the
// case specification documents.
import { BRAND_MARK_HTML } from "./brand.js";
import { fromUsd, fmtMoney } from "./costs.js";

export const PROPOSAL_STATUS_META = {
  draft:             { en: "Draft",             es: "Borrador",            cls: "bg-gray-100 text-gray-700" },
  sent:              { en: "Sent",              es: "Enviada",             cls: "bg-blue-100 text-blue-700" },
  viewed:            { en: "Viewed",            es: "Vista",               cls: "bg-indigo-100 text-indigo-700" },
  changes_requested: { en: "Changes requested", es: "Cambios solicitados", cls: "bg-amber-100 text-amber-800" },
  accepted:          { en: "Accepted",          es: "Aceptada",            cls: "bg-emerald-100 text-emerald-700" },
  rejected:          { en: "Rejected",          es: "Rechazada",           cls: "bg-red-100 text-red-700" },
  withdrawn:         { en: "Withdrawn",         es: "Retirada",            cls: "bg-gray-100 text-gray-500" },
  superseded:        { en: "Replaced",          es: "Reemplazada",         cls: "bg-gray-100 text-gray-500" },
};
export const OPEN_PROPOSAL_STATUSES = ["draft", "sent", "viewed", "changes_requested"];

export const DEFAULT_COMMERCIALS = {
  basis: "arena",          // which estimate is the price: 'arena' | 'standard'
  rateMode: "single",      // 'single' (one rate for all cases, default = author's profile rate)
                           // | 'seniority' (Settings → Costs default rates) | 'custom' (per case)
  baseRate: null,          // rate per hour in the proposal currency when 'single' (and default for 'custom')
  rates: {},               // {caseId: rate in the proposal currency} when custom
  contingencyPct: 0,
  discountPct: 0,
  taxPct: 0,
  paymentTerms: "50% on approval, 50% on delivery",
  validDays: 30,
  startDate: "",
  notes: "",
};

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const round1 = n => Math.round((Number(n) || 0) * 10) / 10;

/** Hours of a case from its activity plan: standard (by hand) and Arena estimate. */
/**
 * Hours from the time-estimation table of a generated spec ("| **Total** | | **88** | **66.5** |").
 * Reads Spec C (customer proposal) first, then Spec A. Returns {standard, arena, source} or null.
 */
export function specHoursFromNotes(notes) {
  let n = notes;
  if (typeof n === "string") { try { n = JSON.parse(n); } catch { n = null; } }
  if (!n || typeof n !== "object") return null;
  for (const [key, source] of [["specC", "specC"], ["specA", "specA"]]) {
    const md = n[key];
    if (typeof md !== "string" || !md) continue;
    const rows = md.split("\n").filter(l => /^\s*\|\s*\**\s*total\b/i.test(l));
    const row = rows[rows.length - 1];
    if (!row) continue;
    const nums = row.split("|").map(c => c.replace(/[*\sh]/gi, "").replace(",", "."))
      .filter(c => /^\d+(\.\d+)?$/.test(c)).map(Number);
    if (!nums.length) continue;
    const standard = nums.length >= 2 ? nums[nums.length - 2] : nums[0];
    const arena = nums[nums.length - 1];
    if (standard > 0) return { standard: round1(standard), arena: round1(arena), source };
  }
  return null;
}

/** Case hours from its activity plan; without a plan, from the spec's estimate (specFallback). */
export function caseHours(activities, specFallback = null) {
  const acts = activities ?? [];
  if (!acts.length && specFallback) {
    return { standard: specFallback.standard, arena: specFallback.arena, activities: 0, source: specFallback.source };
  }
  const standard = acts.reduce((s, a) => s + (Number(a.est_hours_manual ?? a.est_hours) || 0), 0);
  const arena = acts.reduce((s, a) => s + (Number(a.est_hours) || 0), 0);
  return { standard: round1(standard), arena: round1(arena), activities: acts.length, source: acts.length ? "plan" : null };
}

/** Default hourly rate of a case in the proposal currency (Settings → Costs default rates, USD). */
export function defaultRate(caseRow, cfg, currency) {
  const sen = caseRow?.expected_seniority || "mid";
  const usd = Number(cfg?.default_rates?.[sen] ?? cfg?.default_rates?.mid ?? 40) || 0;
  return round2(fromUsd(usd, currency, cfg));
}

/**
 * Totals for a proposal.
 * cases: [{id, title, expected_seniority, activities}]
 * Returns {cases: {id: {...}}, lines, standardSubtotal, arenaSubtotal, savings, subtotal,
 *          contingency, discount, tax, total, hoursStandard, hoursArena, basis, currency}
 * Each case gets `budget` = its share of the agreed price before tax (written to the case on approval).
 */
export function computeTotals(cases, commercials, cfg, currency) {
  const c = { ...DEFAULT_COMMERCIALS, ...(commercials ?? {}) };
  const out = { cases: {}, lines: [], basis: c.basis, currency };
  let stdSub = 0, arenaSub = 0, hStd = 0, hArena = 0;
  for (const cs of cases ?? []) {
    const h = caseHours(cs.activities, cs.specHours ?? null);
    const base = Number(c.baseRate) > 0 ? round2(c.baseRate) : null;
    const rate = c.rateMode === "custom" && c.rates?.[cs.id] != null && c.rates[cs.id] !== ""
      ? round2(c.rates[cs.id])
      : (c.rateMode === "single" || c.rateMode === "custom") && base != null ? base
      : defaultRate(cs, cfg, currency);
    const stdAmount = round2(h.standard * rate);
    const arenaAmount = round2(h.arena * rate);
    const line = { id: cs.id, title: cs.title, seniority: cs.expected_seniority || "mid", rate,
      hoursStandard: h.standard, hoursArena: h.arena, activities: h.activities, hoursSource: h.source, stdAmount, arenaAmount,
      amount: c.basis === "standard" ? stdAmount : arenaAmount };
    out.lines.push(line);
    stdSub += stdAmount; arenaSub += arenaAmount; hStd += h.standard; hArena += h.arena;
  }
  const subtotal = c.basis === "standard" ? stdSub : arenaSub;
  const contingency = round2(subtotal * (Number(c.contingencyPct) || 0) / 100);
  const discount = round2((subtotal + contingency) * (Number(c.discountPct) || 0) / 100);
  const preTax = round2(subtotal + contingency - discount);
  const tax = round2(preTax * (Number(c.taxPct) || 0) / 100);
  // Spread contingency and discount over the cases in proportion to their amount.
  const factor = subtotal > 0 ? preTax / subtotal : 0;
  for (const l of out.lines) out.cases[l.id] = { ...l, budget: round2(l.amount * factor) };
  return {
    ...out,
    standardSubtotal: round2(stdSub), arenaSubtotal: round2(arenaSub), savings: round2(stdSub - arenaSub),
    hoursStandard: round1(hStd), hoursArena: round1(hArena), subtotal: round2(subtotal),
    contingency, discount, preTax, tax, total: round2(preTax + tax),
  };
}

/** Markdown for the "Effort & investment" section (the AI never writes these numbers). */
export function investmentMarkdown(totals, commercials, lang = "en") {
  const es = lang === "es";
  const cur = totals.currency;
  const m = v => fmtMoney(v, cur, lang, 2);
  const h = v => `${(Number(v) || 0).toLocaleString(es ? "es" : "en-US", { maximumFractionDigits: 1 })} h`;
  const basisLabel = totals.basis === "standard"
    ? (es ? "estimación estándar" : "standard estimate")
    : (es ? "estimación Arena" : "Arena estimate");
  const L = es ? {
    title: "## Esfuerzo e inversión", intro: `Precio calculado con la ${basisLabel}. Se muestran ambas estimaciones para su comparación.`,
    hdr: "| Caso | Horas estándar | Horas Arena | Tarifa / h | Importe |",
    sub: "Subtotal", cont: "Contingencia", disc: "Descuento", tax: "Impuestos", total: "**Total**",
    cmp: "Comparación de estimaciones", std: "Estimación estándar", arena: "Estimación Arena", save: "Ahorro con Arena",
  } : {
    title: "## Effort & investment", intro: `Price based on the ${basisLabel}. Both estimates are shown for comparison.`,
    hdr: "| Case | Standard hours | Arena hours | Rate / h | Amount |",
    sub: "Subtotal", cont: "Contingency", disc: "Discount", tax: "Taxes", total: "**Total**",
    cmp: "Estimate comparison", std: "Standard estimate", arena: "Arena estimate", save: "Arena saving",
  };
  const c = { ...DEFAULT_COMMERCIALS, ...(commercials ?? {}) };
  const rows = totals.lines.map(l => `| ${l.title} | ${h(l.hoursStandard)} | ${h(l.hoursArena)} | ${m(l.rate)} | ${m(l.amount)} |`);
  const extra = [];
  extra.push(`| ${L.sub} | ${h(totals.hoursStandard)} | ${h(totals.hoursArena)} |  | ${m(totals.subtotal)} |`);
  if (totals.contingency) extra.push(`| ${L.cont} (${c.contingencyPct}%) |  |  |  | ${m(totals.contingency)} |`);
  if (totals.discount) extra.push(`| ${L.disc} (${c.discountPct}%) |  |  |  | -${m(totals.discount)} |`);
  if (totals.tax) extra.push(`| ${L.tax} (${c.taxPct}%) |  |  |  | ${m(totals.tax)} |`);
  extra.push(`| ${L.total} |  |  |  | **${m(totals.total)}** |`);
  const cmp = [
    `### ${L.cmp}`,
    `| | ${es ? "Horas" : "Hours"} | ${es ? "Importe" : "Amount"} |`, "|---|---|---|",
    `| ${L.std} | ${h(totals.hoursStandard)} | ${m(totals.standardSubtotal)} |`,
    `| ${L.arena} | ${h(totals.hoursArena)} | ${m(totals.arenaSubtotal)} |`,
    ...(totals.savings > 0 ? [`| ${L.save} | ${h(totals.hoursStandard - totals.hoursArena)} | ${m(totals.savings)} |`] : []),
  ];
  return [L.title, L.intro, "", L.hdr, "|---|---|---|---|---|", ...rows, ...extra, "", ...cmp].join("\n");
}

/** Insert the investment section where the AI left [[INVESTMENT]], or before Assumptions / at the end. */
export function mergeInvestment(md, investment) {
  const text = md ?? "";
  if (text.includes("[[INVESTMENT]]")) return text.replace("[[INVESTMENT]]", investment);
  const m = text.match(/\n## +(Assumptions|Supuestos|Terms|Condiciones|Términos)/i);
  if (m) return text.slice(0, m.index) + "\n\n" + investment + "\n" + text.slice(m.index);
  return text + "\n\n" + investment;
}

// ── Markdown → HTML (same rules as the spec documents) ─────────────────────
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function proposalMdToHtml(md) {
  if (!md) return "";
  const fmt = s => esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const out = [];
  let inUl = false, inOl = false, inTable = false, inThead = false, inCode = false, code = [];
  const closeList = () => { if (inUl) { out.push("</ul>"); inUl = false; } if (inOl) { out.push("</ol>"); inOl = false; } };
  const closeTable = () => { if (inTable) { out.push("</tbody></table></div>"); inTable = false; inThead = false; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) { out.push("<pre><code>" + code.map(esc).join("\n") + "</code></pre>"); inCode = false; code = []; }
      else { closeList(); closeTable(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    const isBullet = /^[-*] /.test(line), isNum = /^\d+\. /.test(line), isRow = line.startsWith("|");
    const isSep = isRow && line.split("|").slice(1, -1).every(c => /^[-: ]+$/.test(c.trim()));
    if (!isBullet && inUl) { out.push("</ul>"); inUl = false; }
    if (!isNum && inOl) { out.push("</ol>"); inOl = false; }
    if (!isRow) closeTable();
    if (line.startsWith("#### ")) out.push(`<h4>${fmt(line.slice(5))}</h4>`);
    else if (line.startsWith("### ")) out.push(`<h3>${fmt(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h2>${fmt(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h1>${fmt(line.slice(2))}</h1>`);
    else if (line === "---") out.push("<hr>");
    else if (isBullet) { if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li>${fmt(line.slice(2))}</li>`); }
    else if (isNum) { if (!inOl) { out.push("<ol>"); inOl = true; } out.push(`<li>${fmt(line.replace(/^\d+\. /, ""))}</li>`); }
    else if (isSep) { if (inThead) { out.push("</thead><tbody>"); inThead = false; } }
    else if (isRow) {
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (!inTable) { out.push('<div class="tbl-wrap"><table><thead>'); out.push("<tr>" + cells.map(c => `<th>${fmt(c)}</th>`).join("") + "</tr>"); inTable = true; inThead = true; }
      else out.push("<tr>" + cells.map(c => `<td>${fmt(c)}</td>`).join("") + "</tr>");
    }
    else if (line.trim()) out.push(`<p>${fmt(line)}</p>`);
  }
  closeList(); closeTable();
  if (inCode) out.push("<pre><code>" + code.map(esc).join("\n") + "</code></pre>");
  return out.join("\n");
}

/** Full proposal document, styled like the case specification documents. */
export function buildProposalHtml({ lang = "en", title, subtitle, eyebrow, meta = [], markdown, attachments = [], preparedBy, customerName }) {
  const es = lang === "es";
  const metaHtml = meta.map(m => `<div class="meta-item"><span class="lbl">${esc(m.label)}</span><span class="val">${esc(m.value)}</span></div>`).join("");
  const att = attachments.length
    ? `<h2>${es ? "Anexos" : "Attachments"}</h2><ul>${attachments.map(a => `<li><a href="${esc(a.file_url)}" target="_blank" rel="noopener">${esc(a.file_name)}</a>${a.case_title ? ` — ${esc(a.case_title)}` : ""}</li>`).join("")}</ul>`
    : "";
  return `<!DOCTYPE html>
<html lang="${es ? "es" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(subtitle)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#F6F7FB;color:#1A2A4A;font-size:0.9rem;line-height:1.65}
.doc-header{background:#1A2A4A;color:#fff;padding:2.5rem 3rem 2rem}
.doc-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1.5rem}
.eyebrow{font-family:'IBM Plex Mono',monospace;font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:0.5rem}
.doc-header h1{font-family:'DM Serif Display',Georgia,serif;font-size:clamp(1.5rem,3vw,2.3rem);font-weight:400;line-height:1.15;color:#fff;margin-bottom:0.2rem}
.doc-header h1 em{font-style:italic;color:rgba(255,255,255,0.65)}
.meta-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1.2rem;padding-top:1.1rem;border-top:1px solid rgba(255,255,255,0.1)}
.meta-item{display:flex;flex-direction:column;gap:0.15rem}
.lbl{font-family:'IBM Plex Mono',monospace;font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.35)}
.val{font-size:0.8rem;color:rgba(255,255,255,0.8);font-weight:500}
.doc-body{max-width:860px;margin:0 auto;padding:2rem 1.5rem 4rem}
h1{font-family:'DM Serif Display',serif;font-size:1.35rem;font-weight:400;color:#1254A0;margin:1.8rem 0 0.6rem;padding-bottom:0.4rem;border-bottom:2px solid #DDE1EE}
h2{font-family:'IBM Plex Sans',sans-serif;font-size:0.82rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1254A0;margin:1.4rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:1px solid #DDE1EE}
h3{font-size:0.88rem;font-weight:600;color:#1A2A4A;margin:1rem 0 0.35rem}
h4{font-size:0.8rem;font-weight:600;color:#4A5878;margin:0.8rem 0 0.3rem}
p{font-size:0.85rem;color:#2E3D5A;margin-bottom:0.65rem;line-height:1.7}
ul,ol{padding-left:1.4rem;margin-bottom:0.65rem}
li{font-size:0.83rem;color:#2E3D5A;margin-bottom:0.25rem;line-height:1.55}
a{color:#1254A0}
strong{color:#1A2A4A;font-weight:600}
code{font-family:'IBM Plex Mono',monospace;font-size:0.75em;background:#ECEEF5;color:#D4600A;padding:0.1em 0.35em;border-radius:3px}
hr{border:none;border-top:1px solid #DDE1EE;margin:1.5rem 0}
pre{background:#ECEEF5;border:1px solid #DDE1EE;border-radius:6px;padding:1rem 1.2rem;margin:1rem 0;overflow-x:auto}
pre code{background:none;padding:0;color:#1A2A4A;font-size:0.78rem;line-height:1.6}
.tbl-wrap{overflow-x:auto;margin:1rem 0}
table{width:100%;border-collapse:collapse;font-size:0.78rem;border:1px solid #DDE1EE;border-radius:6px;overflow:hidden}
th{background:#ECEEF5;color:#4A5878;font-weight:600;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;text-align:left;padding:0.55rem 0.8rem;border-bottom:1px solid #DDE1EE}
td{padding:0.55rem 0.8rem;border-bottom:1px solid #DDE1EE;color:#2E3D5A;vertical-align:top}
tr:last-child td{border-bottom:none;background:#F1F4FA}
.sig-row{display:grid;grid-template-columns:repeat(2,1fr);gap:2rem;margin-top:3rem;padding-top:1.5rem;border-top:2px solid #DDE1EE}
.sig-block .sig-label{font-family:'IBM Plex Mono',monospace;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:#8494B2;margin-bottom:1.8rem}
.sig-block .sig-line{border-top:1px solid #1A2A4A;padding-top:0.4rem;font-size:0.72rem;color:#4A5878}
.print-btn{position:fixed;bottom:1.5rem;right:1.5rem;background:#0056A0;color:#fff;border:none;border-radius:8px;padding:0.65rem 1.2rem;font-family:'IBM Plex Sans',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,86,160,0.35)}
@media print{.print-btn{display:none}body{background:#fff}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">${es ? "Guardar PDF" : "Save as PDF"}</button>
<header class="doc-header">
  <div class="doc-header-top">
    <div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}<br><em>${esc(subtitle)}</em></h1>
    </div>
    <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0"><svg width="36" height="36" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="og" cx="36%" cy="33%" r="78%"><stop offset="0%" stop-color="#4F6EF7"/><stop offset="100%" stop-color="#0D1F3C"/></radialGradient></defs><circle cx="40" cy="40" r="39" fill="none" stroke="#4F6EF7" stroke-opacity="0.18" stroke-width="1"/><circle cx="40" cy="40" r="28" fill="none" stroke="#4F6EF7" stroke-opacity="0.35" stroke-width="1"/><circle cx="40" cy="40" r="13" fill="url(#og)"/><text x="40" y="46" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="16" fill="#fff">A</text><circle cx="40" cy="1.5" r="3" fill="#4F6EF7"/><circle cx="13" cy="64" r="2.2" fill="#818cf8" opacity="0.8"/><circle cx="68" cy="18" r="2.5" fill="#6366f1"/></svg><div style="line-height:1.25"><div style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.8);white-space:nowrap"><span style="color:#7B9BFF">Arena</span> Solutions Platform${BRAND_MARK_HTML}</div><div style="font-size:0.5rem;color:#93C5FD;letter-spacing:0.06em;white-space:nowrap">${es ? "Propuesta comercial" : "Commercial proposal"}</div></div></div>
  </div>
  <div class="meta-row">${metaHtml}</div>
</header>
<div class="doc-body">
${proposalMdToHtml(markdown)}
${att}
<div class="sig-row">
  <div class="sig-block"><div class="sig-label">${es ? "Preparado por" : "Prepared by"} — ${esc(preparedBy ?? "")}</div><div class="sig-line">${es ? "Firma y fecha" : "Signature & date"}</div></div>
  <div class="sig-block"><div class="sig-label">${es ? "Aceptado por" : "Accepted by"} — ${esc(customerName ?? "")}</div><div class="sig-line">${es ? "Firma y fecha" : "Signature & date"}</div></div>
</div>
</div>
</body>
</html>`;
}

/** Plain text from an HTML document (for AI input). */
export function htmlToText(html, max = 12000) {
  const t = String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? t.slice(0, max) + "\n…" : t;
}
