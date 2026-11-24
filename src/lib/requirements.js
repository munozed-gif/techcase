// Requirement traceability: a checklist of what the customer asked for (extracted from the case
// documents by AI, edited by the consultants), checked against the generated spec.
// notes.requirements = [{ id, source, text, kind, outOfScope?, reason?, by?, at?, manual? }]
// notes.reqCoverage  = { at, spec, specHash, items: [{ id, status: covered|partial|missing, where, note }],
//                        accepted: { [reqId | 'rule:<id>']: { reason, by, at } } }

export const REQ_KINDS = ['functional', 'data', 'ui', 'report', 'integration', 'authorization', 'test_scenario', 'non_functional'];
export const REQ_KIND_LABEL = {
  functional: ['Functional', 'Funcional'], data: ['Data', 'Datos'], ui: ['Screen / UI', 'Pantalla / UI'],
  report: ['Report / output', 'Reporte / salida'], integration: ['Integration', 'Integración'],
  authorization: ['Authorization', 'Autorización'], test_scenario: ['Test scenarios', 'Escenarios de prueba'],
  non_functional: ['Non-functional', 'No funcional'],
};

/** Small stable hash of a text (spec content), to know whether a coverage result is current. */
export function textHash(s) {
  let h = 5381; const t = s ?? '';
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length}:${(h >>> 0).toString(36)}`;
}

/** Parse a JSON array (or {requirements:[...]}) out of an AI answer. */
export function parseJsonArray(raw, key) {
  const txt = (raw ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(txt);
  if (v === undefined) { const m = txt.match(/\[[\s\S]*\]/); if (m) v = tryParse(m[0]); }
  if (v === undefined) { const m = txt.match(/\{[\s\S]*\}/); if (m) v = tryParse(m[0]); }
  if (v && !Array.isArray(v) && Array.isArray(v[key])) v = v[key];
  return Array.isArray(v) ? v : null;
}

/** Normalise the extracted list: REQ-01.. ids, known kinds, no empty texts. */
export function normalizeRequirements(list) {
  return (list ?? []).filter(r => r && String(r.text ?? '').trim()).map((r, i) => ({
    id: `REQ-${String(i + 1).padStart(2, '0')}`,
    source: String(r.source ?? '').trim(),
    text: String(r.text).trim(),
    kind: REQ_KINDS.includes(r.kind) ? r.kind : 'functional',
  }));
}

export const inScope = reqs => (reqs ?? []).filter(r => !r.outOfScope && r.text?.trim());

/** Block sent to every spec prompt. */
export function requirementsPromptBlock(reqs) {
  const list = inScope(reqs);
  if (!list.length) return '';
  return `\n\nREQUIREMENTS CHECKLIST — the customer's requirements, confirmed by the consultants. The specification MUST cover every one of them (or, if one cannot be resolved from the documents, list it under Assumptions / Next Steps as an open question with its id). At the END of the document add a section "## Trazabilidad de requerimientos" (in English: "## Requirements Traceability") with the table | ID | Requerimiento | Dónde se cubre | listing EVERY id below and the section / object of this spec that covers it:\n${list.map(r => `- ${r.id} [${r.kind}]${r.source ? ` (${r.source})` : ''}: ${r.text}`).join('\n')}`;
}

/** Coverage summary over the in-scope requirements and the rule violations. */
export function coverageStats(reqs, cov, ruleViolations = []) {
  const list = inScope(reqs);
  const byId = Object.fromEntries((cov?.items ?? []).map(i => [i.id, i]));
  const accepted = cov?.accepted ?? {};
  const rows = list.map(r => ({ ...r, status: byId[r.id]?.status ?? 'missing', where: byId[r.id]?.where ?? '', note: byId[r.id]?.note ?? '' }));
  const covered = rows.filter(r => r.status === 'covered').length;
  const gaps = rows.filter(r => r.status !== 'covered');
  const openGaps = gaps.filter(r => !accepted[r.id]);
  const openRules = (ruleViolations ?? []).filter(v => !accepted[`rule:${v.id}`]);
  return {
    total: list.length, covered, pct: list.length ? Math.round((covered / list.length) * 100) : 0,
    rows, gaps, openGaps, openRules, accepted,
    ok: list.length > 0 && openGaps.length === 0 && openRules.length === 0,
  };
}
