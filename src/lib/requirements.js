// Requirement traceability: a checklist of what the customer asked for (extracted from the case
// documents by AI, edited by the consultants), checked against the generated spec.
// notes.requirements = [{ id, source, text, kind, outOfScope?, reason?, by?, at?, manual? }]
// notes.reqCoverage  = { at, spec, specHash, items: [{ id, status: covered|partial|missing, where, note }],
//                        accepted: { [reqId | 'rule:<id>']: { reason, by, at } } }

// Editable in Settings → Spec quality (spec_analysis_policy.requirement_kinds); these are the defaults.
// 'test_scenario' also marks the requirements used for the live test-data check.
export const DEFAULT_REQ_KINDS = [
  { key: 'functional', label_en: 'Functional', label_es: 'Funcional' }, { key: 'data', label_en: 'Data', label_es: 'Datos' },
  { key: 'ui', label_en: 'Screen / UI', label_es: 'Pantalla / UI' }, { key: 'report', label_en: 'Report / output', label_es: 'Reporte / salida' },
  { key: 'integration', label_en: 'Integration', label_es: 'Integración' }, { key: 'authorization', label_en: 'Authorization', label_es: 'Autorización' },
  { key: 'test_scenario', label_en: 'Test scenarios', label_es: 'Escenarios de prueba' }, { key: 'non_functional', label_en: 'Non-functional', label_es: 'No funcional' },
];
export const REQ_KINDS = DEFAULT_REQ_KINDS.map(k => k.key);
export const REQ_KIND_LABEL = Object.fromEntries(DEFAULT_REQ_KINDS.map(k => [k.key, [k.label_en, k.label_es]]));
const kindList = kinds => (Array.isArray(kinds) && kinds.length ? kinds : DEFAULT_REQ_KINDS);
export const reqKindKeys = kinds => kindList(kinds).map(k => k.key);
export const reqKindName = (k, lang, kinds) => {
  const x = kindList(kinds).find(v => v.key === k);
  return x ? ((lang === 'es' ? x.label_es || x.label_en : x.label_en || x.label_es) || x.key) : k;
};

/** Small stable hash of a text (spec content), to know whether a coverage result is current. */
export function textHash(s) {
  let h = 5381; const t = s ?? '';
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length}:${(h >>> 0).toString(36)}`;
}

/** Parse a JSON array (or {requirements:[...]}) out of an AI answer. When the answer was cut off
 *  (output limit) the complete items are kept and the array gets `truncated = true`. */
export function parseJsonArray(raw, key) {
  const txt = (raw ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(txt);
  if (v === undefined) { const m = txt.match(/\[[\s\S]*\]/); if (m) v = tryParse(m[0]); }
  if (v === undefined) { const m = txt.match(/\{[\s\S]*\}/); if (m) v = tryParse(m[0]); }
  if (v && !Array.isArray(v) && Array.isArray(v[key])) v = v[key];
  if (Array.isArray(v)) return v;
  // Answer cut off (output limit): keep the complete top-level objects of the array.
  const start = txt.indexOf('[');
  if (start < 0) return null;
  const out = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < txt.length; i++) {
    const ch = txt[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && objStart >= 0) { const o = tryParse(txt.slice(objStart, i + 1)); if (o) out.push(o); objStart = -1; } }
    else if (ch === ']' && depth === 0) break;
  }
  if (!out.length) return null;
  out.truncated = true;
  return out;
}

/** Normalise the extracted list: REQ-01.. ids, known kinds, no empty texts. */
export function normalizeRequirements(list, kinds) {
  const keys = reqKindKeys(kinds);
  return (list ?? []).filter(r => r && String(r.text ?? '').trim()).map((r, i) => ({
    id: `REQ-${String(i + 1).padStart(2, '0')}`,
    source: String(r.source ?? '').trim(),
    text: String(r.text).trim(),
    kind: keys.includes(r.kind) ? r.kind : keys.includes('functional') ? 'functional' : keys[0],
  }));
}

export const inScope = reqs => (reqs ?? []).filter(r => !r.outOfScope && r.text?.trim());

/** Block sent to every spec prompt. */
export function requirementsPromptBlock(reqs) {
  const list = inScope(reqs);
  if (!list.length) return '';
  return `\n\nREQUIREMENTS CHECKLIST — the customer's requirements, confirmed by the consultants. The specification MUST cover every one of them (or, if one cannot be resolved from the documents, list it under Assumptions / Next Steps as an open question with its id). At the END of the document add a section "## Trazabilidad de requerimientos" (in English: "## Requirements Traceability") with the table | ID | Requerimiento | Dónde se cubre | listing EVERY id below and the section / object of this spec that covers it:\n${list.map(r => `- ${r.id} [${r.kind}]${r.source ? ` (${r.source})` : ''}: ${r.text}`).join('\n')}`;
}

/** Coverage summary over the in-scope requirements and the rule violations.
 *  gate (spec_analysis_policy.signoff): partialIsGap (default true) — a "partial" counts as a gap;
 *  minPct (default 100) — the coverage passes with no open gaps, or with at least this % of the
 *  requirements without an open gap (covered, not counted as a gap, or gap accepted). */
export function coverageStats(reqs, cov, ruleViolations = [], gate = {}) {
  const partialIsGap = gate.partialIsGap !== false;
  const minPct = Number.isFinite(Number(gate.minPct)) ? Number(gate.minPct) : 100;
  const list = inScope(reqs);
  const byId = Object.fromEntries((cov?.items ?? []).map(i => [i.id, i]));
  const accepted = cov?.accepted ?? {};
  const rows = list.map(r => ({ ...r, status: byId[r.id]?.status ?? 'missing', where: byId[r.id]?.where ?? '', note: byId[r.id]?.note ?? '' }));
  const covered = rows.filter(r => r.status === 'covered').length;
  const gaps = rows.filter(r => r.status !== 'covered' && (partialIsGap || r.status !== 'partial'));
  const openGaps = gaps.filter(r => !accepted[r.id]);
  const openRules = (ruleViolations ?? []).filter(v => !accepted[`rule:${v.id}`]);
  const gatePct = list.length ? Math.floor(((list.length - openGaps.length) / list.length) * 100) : 0;   // covered or gap accepted
  const coverageOk = list.length > 0 && (openGaps.length === 0 || gatePct >= minPct);
  return {
    total: list.length, covered, pct: list.length ? Math.round((covered / list.length) * 100) : 0,
    rows, gaps, openGaps, openRules, accepted, gatePct, coverageOk,
    ok: coverageOk && openRules.length === 0,
  };
}
