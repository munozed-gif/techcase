// Spec hours calculated by the platform, not written by the AI.
// The AI lists the technical objects with a complexity (low / medium / high); the platform takes the
// STANDARD hours from the catalog (Settings → Spec quality), derives the phases (analysis, unit tests,
// UAT from the test-matrix size) and the ARENA hours with the estimation factors, and rewrites the
// objects table and the time-estimation section so the numbers always add up.
import { OBJ_HEADING, TIME_HEADING, cells, kindOf, KIND_LABEL } from './specDiff.js';
import { arenaHours, SENIORITY_LABEL } from './estimation.js';

// Seeded from the hours the generated specs produced per object type (Admosa cases, Nov 2026).
export const DEFAULT_SPEC_HOURS = {
  catalog: {
    table:       { low: 2,   medium: 4,  high: 6 },
    ddic:        { low: 1,   medium: 2,  high: 4 },
    message:     { low: 0.5, medium: 1,  high: 2 },
    class:       { low: 12,  medium: 20, high: 32 },
    enhancement: { low: 6,   medium: 10, high: 16 },
    program:     { low: 16,  medium: 24, high: 40 },
    report:      { low: 12,  medium: 20, high: 24 },
    function:    { low: 8,   medium: 16, high: 24 },
    service:     { low: 6,   medium: 12, high: 32 },
    fiori:       { low: 10,  medium: 16, high: 40 },
    integration: { low: 16,  medium: 24, high: 40 },
    auth:        { low: 2,   medium: 4,  high: 8 },
    config:      { low: 3,   medium: 6,  high: 12 },
    transaction: { low: 1,   medium: 2,  high: 2 },
    form:        { low: 8,   medium: 16, high: 24 },
    other:       { low: 4,   medium: 8,  high: 16 },
  },
  analysis_pct: 15, analysis_min: 4,     // analysis & design: % of development, minimum hours
  unit_test_pct: 15, unit_test_min: 4,   // unit tests: % of development, minimum hours
  uat_base: 4, uat_per_scenario: 0.1,    // UAT support: base + hours per test-matrix scenario
};

export function specHoursSettings(settings) {
  const s = settings?.spec_hours ?? {};
  const catalog = { ...DEFAULT_SPEC_HOURS.catalog };
  for (const [k, v] of Object.entries(s.catalog ?? {})) catalog[k] = { ...(catalog[k] ?? {}), ...v };
  return { ...DEFAULT_SPEC_HOURS, ...s, catalog };
}

// Object kind → SAP MCP policy object type (decides Arena's automation factor).
const KIND_TO_POLICY = {
  table: 'table', ddic: 'structure', message: 'message_class', class: 'class', enhancement: 'badi',
  program: 'program', report: 'report', function: 'function_module', service: 'odata', fiori: 'odata', form: 'smartform',
};
const POLICY_TO_MODE = { 'ai-generate': 'auto', 'adt-create-only': 'semi', manual: 'manual' };

export function normalizeComplexity(v) {
  const t = String(v ?? '').toLowerCase();
  if (/baj|low|simple|sencill/.test(t)) return 'low';
  if (/alt|high|compl/.test(t)) return 'high';
  return 'medium';
}
const COMPLEXITY_LABEL = { es: { low: 'Baja', medium: 'Media', high: 'Alta' }, en: { low: 'Low', medium: 'Medium', high: 'High' } };

const num = s => { const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const r1 = n => Math.round(n * 2) / 2;                    // to 0.5 h
const raw = (n, es) => { const s = String(Number(n)); return es ? s.replace('.', ',') : s; };   // settings as entered
const fmt = (n, es) => { const v = r1(n); const s = Number.isInteger(v) ? String(v) : v.toFixed(1); return es ? s.replace('.', ',') : s; };

/** Objects of the technical-objects table, with complexity and description. */
export function readObjects(md) {
  const lines = String(md ?? '').split('\n');
  const start = lines.findIndex(l => OBJ_HEADING.test(l.trim()));
  if (start < 0) return { objects: [], start: -1, tableFrom: -1, tableTo: -1 };
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{1,3}\s/.test(lines[i].trim())) return { objects: [], start, tableFrom: -1, tableTo: -1 };
    i++;
  }
  const from = i;
  while (i < lines.length && lines[i].trim().startsWith('|')) i++;
  const rows = lines.slice(from, i).map(cells);
  const head = rows.find(r => r.some(c => /^(objeto|object)$/i.test(c)));
  if (!head) return { objects: [], start, tableFrom: -1, tableTo: -1 };
  const ix = re => head.findIndex(c => re.test(c));
  const nameIx = ix(/^(objeto|object)$/i), typeIx = ix(/^(tipo|type)$/i), cxIx = ix(/complej|complex/i), descIx = ix(/descrip/i);
  const objects = rows
    .filter(r => r !== head && !r.every(c => /^:?-{2,}:?$|^$/.test(c)))
    .filter(r => !/subtotal|^total$/i.test(r.join(' ')) && (r[nameIx] ?? '').length > 1)
    .map(r => {
      const name = r[nameIx], type = typeIx >= 0 ? r[typeIx] : '', description = descIx >= 0 ? r[descIx] : '';
      return { name, type, description, complexity: normalizeComplexity(cxIx >= 0 ? r[cxIx] : ''),
        kind: kindOf(`${type} ${name} ${description}`), rule: /regla del proyecto|project rule/i.test(`${type} ${description}`) };
    });
  return { objects, start, tableFrom: from, tableTo: i };
}

/**
 * Calculate the estimate. overrides: { [objectName]: { complexity?, hours? } } set by the consultant.
 * estCtx: caseEstimationContext() result (factors, seniority, live check, Arena availability, policy).
 */
export function computeEstimate(objects, { settings, estCtx, scenarios = 0, overrides = {} } = {}) {
  const cfg = specHoursSettings(settings);
  const factors = estCtx?.factors, seniority = estCtx?.seniority ?? 'mid', liveCheck = !!estCtx?.liveCheck;
  const modeOf = kind => {
    if (!estCtx?.arenaAvailable) return 'manual';
    const p = KIND_TO_POLICY[kind];
    return p ? (POLICY_TO_MODE[estCtx.policyTypes?.[p]] ?? 'manual') : 'manual';
  };
  const rows = objects.map(o => {
    const ov = overrides?.[o.name] ?? {};
    const complexity = ov.complexity ?? o.complexity;
    const base = (cfg.catalog[o.kind] ?? cfg.catalog.other)[complexity] ?? cfg.catalog.other.medium;
    const std = ov.hours !== undefined && ov.hours !== null && ov.hours !== '' ? Number(ov.hours) : base;
    const mode = modeOf(o.kind);
    return { ...o, complexity, std: r1(std), mode, arena: arenaHours(std, mode, seniority, factors, { liveCheck }), overridden: !!(ov.hours ?? ov.complexity) };
  });
  const dev = rows.reduce((s, r) => s + r.std, 0);
  const devArena = rows.reduce((s, r) => s + r.arena, 0);
  const analysis = r1(Math.max(cfg.analysis_min, dev * cfg.analysis_pct / 100));
  const unit = r1(Math.max(cfg.unit_test_min, dev * cfg.unit_test_pct / 100));
  const uat = r1(cfg.uat_base + (Number(scenarios) || 0) * cfg.uat_per_scenario);
  const phases = {
    analysis: { std: analysis, arena: arenaHours(analysis, 'design', seniority, factors, { liveCheck }) },
    dev: { std: r1(dev), arena: r1(devArena) },
    unit: { std: unit, arena: arenaHours(unit, 'manual', seniority, factors) },
    uat: { std: uat, arena: arenaHours(uat, 'manual', seniority, factors) },
  };
  const total = { std: r1(analysis + dev + unit + uat), arena: r1(phases.analysis.arena + devArena + phases.unit.arena + phases.uat.arena) };
  return { rows, phases, total, scenarios: Number(scenarios) || 0, cfg, seniority, liveCheck, arenaAvailable: !!estCtx?.arenaAvailable };
}

function objectsTable(est, es) {
  const L = es
    ? ['#', 'Objeto', 'Tipo', 'Complejidad', 'Descripción', 'Horas estándar', 'Horas Arena', 'Subtotal']
    : ['#', 'Object', 'Type', 'Complexity', 'Description', 'Standard hours', 'Arena hours', 'Subtotal'];
  const cx = COMPLEXITY_LABEL[es ? 'es' : 'en'];
  const out = [`| ${L.slice(0, 7).join(' | ')} |`, '|---|---|---|---|---|---|---|'];
  est.rows.forEach((r, i) => out.push(`| ${i + 1} | ${r.name} | ${r.type || (KIND_LABEL[r.kind] ?? [r.kind, r.kind])[es ? 1 : 0]} | ${cx[r.complexity]} | ${(r.description || '').replace(/\|/g, '/')} | ${fmt(r.std, es)} | ${fmt(r.arena, es)} |`));
  out.push(`| | | | | **${L[7]}** | **${fmt(est.phases.dev.std, es)}** | **${fmt(est.phases.dev.arena, es)}** |`);
  return out;
}

function estimateSection(est, es, headingLevel = '##', number = '5.') {
  const c = est.cfg, p = est.phases;
  const saved = est.total.std > 0 ? Math.round((1 - est.total.arena / est.total.std) * 100) : 0;
  const sen = SENIORITY_LABEL[es ? 'es' : 'en'][est.seniority] ?? est.seniority;
  const rows = es ? [
    ['Análisis y diseño', `${c.analysis_pct} % del desarrollo (mínimo ${raw(c.analysis_min, true)} h)`, p.analysis],
    ['Desarrollo', `Suma de los ${est.rows.length} objetos técnicos (catálogo de horas estándar por tipo y complejidad)`, p.dev],
    ['Pruebas unitarias', `${c.unit_test_pct} % del desarrollo (mínimo ${raw(c.unit_test_min, true)} h)`, p.unit],
    ['Soporte UAT', `${raw(c.uat_base, true)} h + ${raw(c.uat_per_scenario, true)} h × ${est.scenarios} escenarios de la matriz de pruebas`, p.uat],
  ] : [
    ['Analysis & design', `${c.analysis_pct}% of development (minimum ${c.analysis_min} h)`, p.analysis],
    ['Development', `Sum of the ${est.rows.length} technical objects (standard hours catalog by type and complexity)`, p.dev],
    ['Unit testing', `${c.unit_test_pct}% of development (minimum ${c.unit_test_min} h)`, p.unit],
    ['UAT support', `${c.uat_base} h + ${c.uat_per_scenario} h × ${est.scenarios} test-matrix scenarios`, p.uat],
  ];
  const out = [
    `${headingLevel} ${number} ${es ? 'Estimación de tiempos' : 'Time estimation'}`, '',
    es ? '| Fase | Base del cálculo | Horas estándar | Horas Arena |' : '| Phase | Basis | Standard hours | Arena hours |',
    '|---|---|---|---|',
    ...rows.map(([n, b, v]) => `| ${n} | ${b} | ${fmt(v.std, es)} | ${fmt(v.arena, es)} |`),
    `| **Total** | | **${fmt(est.total.std, es)}** | **${fmt(est.total.arena, es)}** |`, '',
    es
      ? `Horas calculadas por la plataforma: estándar según el catálogo de horas (consultor de nivel medio); Arena según los factores de automatización${est.arenaAvailable ? '' : ' (implementación automática de Arena no disponible para este caso)'} y de seniority (${sen})${est.liveCheck ? ', con verificación en vivo de SAP en el análisis' : ''}. Con Arena: ${fmt(est.total.arena, true)} h frente a ${fmt(est.total.std, true)} h estándar (ahorro aproximado del ${saved} %).`
      : `Hours calculated by the platform: standard from the hours catalog (mid-level consultant); Arena with the automation${est.arenaAvailable ? '' : ' (Arena automatic implementation not available for this case)'} and seniority (${sen}) factors${est.liveCheck ? ', with live SAP verification in analysis' : ''}. With Arena: ${fmt(est.total.arena, false)} h vs ${fmt(est.total.std, false)} h standard (about ${saved}% saved).`,
    '',
  ];
  return out;
}

/**
 * Replace the objects table and the time-estimation section with calculated values.
 * Returns { md, estimate } — md unchanged (estimate null) when the spec has no objects table.
 */
export function applySpecHours(md, opts = {}) {
  const text = String(md ?? '');
  const { objects, start, tableFrom, tableTo } = readObjects(text);
  if (!objects.length || tableFrom < 0) return { md: text, estimate: null };
  const es = (opts.lang ?? 'es') === 'es';
  const est = computeEstimate(objects, opts);
  let lines = text.split('\n');
  lines = [...lines.slice(0, tableFrom), ...objectsTable(est, es), ...lines.slice(tableTo)];
  // Drop any "Subtotal / Total" prose lines the AI wrote right after the table.
  const headLine = lines[start];
  const level = (headLine.match(/^(#{1,4})\s/) ?? [, '##'])[1];
  const tIx = lines.findIndex((l, i) => i > start && TIME_HEADING.test(l.trim()));
  if (tIx >= 0) {
    let end = tIx + 1;
    while (end < lines.length && !/^#{1,3}\s/.test(lines[end].trim())) end++;
    const number = (lines[tIx].match(/^(?:#{1,4}\s*)?(\d+(?:\.\d+)*\.?)/) ?? [, '5.'])[1];
    lines = [...lines.slice(0, tIx), ...estimateSection(est, es, (lines[tIx].match(/^(#{1,4})\s/) ?? [, level])[1], number), ...lines.slice(end)];
  } else {
    // No estimation section: add it right after the objects section.
    let end = start + 1;
    while (end < lines.length && !/^#{1,3}\s/.test(lines[end].trim())) end++;
    lines = [...lines.slice(0, end), '', ...estimateSection(est, es, level, ''), ...lines.slice(end)];
  }
  return { md: lines.join('\n'), estimate: est };
}

/** Test-matrix scenarios in extracted spreadsheet text ("[Sheet: …]" blocks, one row per line). */
export function countMatrixScenarios(text) {
  let n = 0, inMatrix = false;
  for (const line of String(text ?? '').split('\n')) {
    const sheet = line.match(/^\[Sheet:\s*(.+?)\]/);
    if (sheet) { inMatrix = /matriz|escenario|scenario|prueba|test/i.test(sheet[1]); continue; }
    if (!inMatrix) continue;
    const c = line.split('|').map(s => s.trim());
    if (/^\d+$/.test(c[0]) && c.length >= 8) n++;
  }
  return n;
}

/** Replace only the time-estimation section (specs without an objects table, e.g. Spec D) with an estimate. */
export function replaceEstimateSection(md, est, lang = 'es') {
  const text = String(md ?? '');
  if (!est) return text;
  const lines = text.split('\n');
  const tIx = lines.findIndex(l => TIME_HEADING.test(l.trim()));
  if (tIx < 0) return text;
  let end = tIx + 1;
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end].trim())) end++;
  const level = (lines[tIx].match(/^(#{1,4})\s/) ?? [, '##'])[1];
  const number = (lines[tIx].match(/^(?:#{1,4}\s*)?(\d+(?:\.\d+)*\.?)/) ?? [, ''])[1];
  return [...lines.slice(0, tIx), ...estimateSection(est, lang === 'es', level, number), ...lines.slice(end)].join('\n');
}
