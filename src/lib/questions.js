// Questions for the customer: contradictions between documents, ambiguous rules and missing
// information found by the analysis. Answered questions override the documents in every spec
// prompt; open ones become explicit assumptions.
// notes.questions = [{ id, kind, text, sources, affects, assumption, status, answer?, via?, by?, name?, at?, reason? }]
//   status: 'open' | 'answered' | 'acknowledged' (generate on the assumption) | 'discarded'

export const Q_KINDS = ['contradiction', 'ambiguity', 'missing'];
export const Q_KIND_LABEL = {
  contradiction: ['Contradiction', 'Contradicción'], ambiguity: ['Ambiguity', 'Ambigüedad'], missing: ['Missing information', 'Información faltante'],
};

// Who has to answer: each area can be sent to a different person with its own link.
// Editable in Settings → Spec quality (spec_analysis_policy.question_areas); these are the defaults.
// hints: words / regex of the question that suggest the area (guessArea); order: the lower, the earlier
// the hints are tried. The first area is the fallback when nothing matches.
export const DEFAULT_Q_AREAS = [
  { key: 'functional',  label_en: 'Functional / process',       label_es: 'Funcional / proceso',         order: 99, hints: '' },
  { key: 'abap',        label_en: 'ABAP technical',             label_es: 'Técnico ABAP',                order: 2,  hints: String.raw`\babap\b|badi|bad i|\bexit\b|enhancement|ampliaci[oó]n t[eé]cnica|append|\bclase\b|\bclass\b|m[eé]todo|method|clean core|\bc[01]\b|liberad|released|\bcds\b|programa z|estructura|structure|campo t[eé]cnico|nombre t[eé]cnico|paquete|package|custom field|campo personalizado` },
  { key: 'basis',       label_en: 'Basis / infrastructure',     label_es: 'Basis / infraestructura',     order: 3,  hints: String.raw`basis|transporte?s? (a|de) produc|\bstms\b|mandante|client \d|sistema (qas|prd|dev)|servidor|vpn|kernel|rendimiento|performance|tiempo de carga|load time|instancia` },
  { key: 'security',    label_en: 'Security / authorizations',  label_es: 'Seguridad / autorizaciones',  order: 1,  hints: String.raw`autoriza|authori|\brol(es)?\b|\broles?\b|pfcg|perfil de usuario|user role|acceso del usuario` },
  { key: 'integration', label_en: 'Integration / interfaces',   label_es: 'Integración / interfaces',    order: 4,  hints: String.raw`interfaz|interface|idoc|odata|integraci|middleware|\bcpi\b|\brfc\b|servicio web|web service|sistema externo` },
  { key: 'data',        label_en: 'Master data',                label_es: 'Datos maestros',              order: 6,  hints: String.raw`dato maestro|master data|ubicaci[oó]n|location|business partner|\bbp\b|\badrc\b|zona de transporte asignada|carga de datos` },
  { key: 'testing',     label_en: 'Testing',                    label_es: 'Pruebas',                     order: 5,  hints: String.raw`prueba|test|escenario|ct-\d|caso de prueba|datos de prueba` },
  { key: 'management',  label_en: 'Project / management',       label_es: 'Proyecto / gestión',          order: 7,  hints: String.raw`fecha|plazo|alcance|scope|pedido de cambio|change request|aprobaci|responsable|documentaci[oó]n|\bbw\b|cubo|presupuesto` },
];
export const Q_AREAS = DEFAULT_Q_AREAS.map(a => a.key);
export const Q_AREA_LABEL = Object.fromEntries(DEFAULT_Q_AREAS.map(a => [a.key, [a.label_en, a.label_es]]));
const areaList = areas => (Array.isArray(areas) && areas.length ? areas : DEFAULT_Q_AREAS);
export const qAreaKeys = areas => areaList(areas).map(a => a.key);
export const qAreaName = (a, lang, areas) => {
  const list = areaList(areas);
  const x = list.find(v => v.key === a) ?? list[0];
  return (lang === 'es' ? x.label_es || x.label_en : x.label_en || x.label_es) || x.key;
};

// Hints → regex: a comma-separated word list or a regex (commas act as "or").
const hintCache = new Map();
function hintRegex(h) {
  const src = String(h ?? '').split(',').map(s => s.trim()).filter(Boolean).join('|');
  if (!src) return null;
  if (!hintCache.has(src)) {
    let re;
    try { re = new RegExp(src, 'i'); } catch { re = new RegExp(src.split('|').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'); }
    hintCache.set(src, re);
  }
  return hintCache.get(src);
}
// Best guess for questions created before areas existed (keywords of the question).
export function guessArea(q, areas) {
  const list = areaList(areas);
  const t = `${q?.text ?? ''} ${q?.sources ?? ''}`;
  if (list.some(a => a.key === 'abap') && /\b[ZY][A-Z0-9]*_[A-Z0-9_]{2,}\b/.test(t)) return 'abap';   // Z/Y technical object names
  const ordered = list.map((a, i) => ({ a, i })).sort((x, y) => (Number(x.a.order) || 0) - (Number(y.a.order) || 0) || x.i - y.i);
  for (const { a } of ordered) { const re = hintRegex(a.hints); if (re && re.test(t)) return a.key; }
  return list[0].key;
}
export const areaOf = (q, areas) => (qAreaKeys(areas).includes(q?.area) ? q.area : guessArea(q, areas));
/** Questions that can still be asked (not answered, not discarded). */
export const askableQuestions = qs => liveQuestions(qs).filter(q => q.status === 'open' || q.status === 'acknowledged');

export function normalizeQuestions(list, areas) {
  return (list ?? []).filter(q => q && String(q.text ?? '').trim()).map((q, i) => ({
    id: `Q-${String(i + 1).padStart(2, '0')}`,
    kind: Q_KINDS.includes(q.kind) ? q.kind : 'ambiguity',
    area: qAreaKeys(areas).includes(q.area) ? q.area : guessArea(q, areas),
    text: String(q.text).trim(),
    sources: String(q.sources ?? '').trim(),
    affects: Array.isArray(q.affects) ? q.affects.map(String) : [],
    assumption: String(q.assumption ?? '').trim(),
    status: 'open',
  }));
}

export const liveQuestions = qs => (qs ?? []).filter(q => q.status !== 'discarded' && q.text?.trim());
export const openQuestions = qs => liveQuestions(qs).filter(q => q.status === 'open');

/** Block sent to every spec prompt. */
export function questionsPromptBlock(qs) {
  const live = liveQuestions(qs);
  if (!live.length) return '';
  const answered = live.filter(q => q.status === 'answered' && q.answer?.trim());
  const pending = live.filter(q => q.status !== 'answered');
  const parts = [];
  if (answered.length) {
    parts.push(`CUSTOMER ANSWERS — authoritative: they OVERRIDE the documents wherever they differ. Apply each one:\n${answered.map(q => `- ${q.id}: ${q.text}\n  ANSWER: ${q.answer}`).join('\n')}`);
  }
  if (pending.length) {
    parts.push(`OPEN QUESTIONS — not answered by the customer yet. Use the stated assumption, write "(supuesto — pendiente Q-xx)" (with the question id) next to every part of the spec that relies on it, and list them all in a section "## Preguntas abiertas" (in English: "## Open Questions") with the id, the question and the assumption used:\n${pending.map(q => `- ${q.id}: ${q.text}${q.assumption ? `\n  ASSUMPTION: ${q.assumption}` : ''}`).join('\n')}`);
  }
  return `\n\n${parts.join('\n\n')}`;
}

/** Merge the answers of customer links into the questions (only questions still without an answer). */
export function mergeLinkAnswers(qs, links) {
  let changed = false;
  const next = (qs ?? []).map(q => {
    if (q.status === 'answered') return q;
    for (const l of links ?? []) {
      if (l.status !== 'answered') continue;
      const a = l.answers?.[q.id]?.answer;
      if (a?.trim()) { changed = true; return { ...q, status: 'answered', answer: a.trim(), via: 'customer', name: l.customer_name ?? null, at: l.answered_at ?? new Date().toISOString(), linkId: l.id }; }
    }
    return q;
  });
  return { questions: next, changed };
}
