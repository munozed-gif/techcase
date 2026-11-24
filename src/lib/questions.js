// Questions for the customer: contradictions between documents, ambiguous rules and missing
// information found by the analysis. Answered questions override the documents in every spec
// prompt; open ones become explicit assumptions.
// notes.questions = [{ id, kind, text, sources, affects, assumption, status, answer?, via?, by?, name?, at?, reason? }]
//   status: 'open' | 'answered' | 'acknowledged' (generate on the assumption) | 'discarded'

export const Q_KINDS = ['contradiction', 'ambiguity', 'missing'];
export const Q_KIND_LABEL = {
  contradiction: ['Contradiction', 'Contradicción'], ambiguity: ['Ambiguity', 'Ambigüedad'], missing: ['Missing information', 'Información faltante'],
};

export function normalizeQuestions(list) {
  return (list ?? []).filter(q => q && String(q.text ?? '').trim()).map((q, i) => ({
    id: `Q-${String(i + 1).padStart(2, '0')}`,
    kind: Q_KINDS.includes(q.kind) ? q.kind : 'ambiguity',
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
