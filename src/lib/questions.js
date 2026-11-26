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
export const Q_AREAS = ['functional', 'abap', 'basis', 'security', 'integration', 'data', 'testing', 'management'];
export const Q_AREA_LABEL = {
  functional:  ['Functional / process', 'Funcional / proceso'],
  abap:        ['ABAP technical', 'Técnico ABAP'],
  basis:       ['Basis / infrastructure', 'Basis / infraestructura'],
  security:    ['Security / authorizations', 'Seguridad / autorizaciones'],
  integration: ['Integration / interfaces', 'Integración / interfaces'],
  data:        ['Master data', 'Datos maestros'],
  testing:     ['Testing', 'Pruebas'],
  management:  ['Project / management', 'Proyecto / gestión'],
};
export const qAreaName = (a, lang) => (Q_AREA_LABEL[a] ?? Q_AREA_LABEL.functional)[lang === 'es' ? 1 : 0];

// Best guess for questions created before areas existed (keywords of the question).
const AREA_HINTS = [
  ['security',    /autoriza|authori|\brol(es)?\b|\broles?\b|pfcg|perfil de usuario|user role|acceso del usuario/i],
  ['abap',        /\babap\b|badi|bad i|\bexit\b|enhancement|ampliaci[oó]n t[eé]cnica|append|\bclase\b|\bclass\b|m[eé]todo|method|clean core|\bc[01]\b|liberad|released|\bcds\b|programa z|estructura|structure|campo t[eé]cnico|nombre t[eé]cnico|paquete|package|custom field|campo personalizado/i],
  ['basis',       /basis|transporte?s? (a|de) produc|\bstms\b|mandante|client \d|sistema (qas|prd|dev)|servidor|vpn|kernel|rendimiento|performance|tiempo de carga|load time|instancia/i],
  ['integration', /interfaz|interface|idoc|odata|integraci|middleware|\bcpi\b|\brfc\b|servicio web|web service|sistema externo/i],
  ['testing',     /prueba|test|escenario|ct-\d|caso de prueba|datos de prueba/i],
  ['data',        /dato maestro|master data|ubicaci[oó]n|location|business partner|\bbp\b|\badrc\b|zona de transporte asignada|carga de datos/i],
  ['management',  /fecha|plazo|alcance|scope|pedido de cambio|change request|aprobaci|responsable|documentaci[oó]n|\bbw\b|cubo|presupuesto/i],
];
export function guessArea(q) {
  const t = `${q?.text ?? ''} ${q?.sources ?? ''}`;
  if (/\b[ZY][A-Z0-9]*_[A-Z0-9_]{2,}\b/.test(t)) return 'abap';   // Z/Y technical object names
  for (const [area, re] of AREA_HINTS) if (re.test(t)) return area;
  return 'functional';
}
export const areaOf = q => (Q_AREAS.includes(q?.area) ? q.area : guessArea(q));
/** Questions that can still be asked (not answered, not discarded). */
export const askableQuestions = qs => liveQuestions(qs).filter(q => q.status === 'open' || q.status === 'acknowledged');

export function normalizeQuestions(list) {
  return (list ?? []).filter(q => q && String(q.text ?? '').trim()).map((q, i) => ({
    id: `Q-${String(i + 1).padStart(2, '0')}`,
    kind: Q_KINDS.includes(q.kind) ? q.kind : 'ambiguity',
    area: Q_AREAS.includes(q.area) ? q.area : guessArea(q),
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
