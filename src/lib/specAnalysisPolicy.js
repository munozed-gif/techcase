// Settings of the compiled-context analysis (Spec tab pipeline: request summary, coverage,
// validation / live SAP check, requirements checklist, customer questions, reviews, apply answers,
// fix gaps). Stored in system_settings.spec_analysis_policy, edited in Settings → Spec quality →
// "Análisis del contexto compilado". Every default is the value the code used before it was a setting.
import { DEFAULT_Q_AREAS } from "./questions.js";
import { DEFAULT_REQ_KINDS } from "./requirements.js";
import { VIDEO_DEFAULTS } from "./videoAnalysis.js";

// Sign-off conditions (CaseSubPanels signoffConditions): key → [en, es] label.
export const SIGNOFF_CONDITIONS = {
  coverage:         ['Requirements covered (or gaps accepted)', 'Requerimientos cubiertos (o brechas aceptadas)'],
  rules:            ['Project mandatory rules met (or accepted)', 'Reglas obligatorias del proyecto cumplidas (o aceptadas)'],
  questions:        ['Customer questions answered or acknowledged', 'Preguntas al cliente respondidas o aceptadas como supuesto'],
  analysis_in_spec: ['The spec was generated after the last analysis', 'La spec se generó después del último análisis'],
  answers_in_spec:  ['The spec includes every answer received', 'La spec incluye todas las respuestas recibidas'],
};

// Model of the project-document summaries when doc_summary.model is empty.
export const DOC_SUMMARY_DEFAULT_MODEL = 'claude-haiku-5-5';

export const SPEC_ANALYSIS_DEFAULTS = {
  signoff: {
    coverage_min_pct: 100,            // 100 = no open gaps
    partial_counts_as_gap: true,
    conditions: Object.fromEntries(Object.keys(SIGNOFF_CONDITIONS).map(k => [k, 'required'])),   // 'required' | 'warn'
  },
  auto_steps: {
    review_after_questions: true, coverage_after_answers: true,
    coverage_after_fix_gaps: true, review_after_fix_gaps: true,
    coverage_after_generation: true, review_after_generation: true,
  },
  doc_limits: {
    per_file_chars: 120000,           // per customer document
    total_chars: 240000,              // all customer documents of one AI call
    project_doc_chars: 60000,         // per project document
    standards_chars: 40000,           // per ABAP standards document
    combined_extra_chars: 60000,      // room added to total_chars when project docs + ABAP standards join the case docs
  },
  max_tokens: {
    summary: 3000, sap_coverage: 4000, validation: 4000, live_check_objects: 8000, live_check_data: 4000,
    requirements: 24000, questions: 8000, review: 8000, coverage: 8000, generation_review: 8000,
  },
  apply_answers: { batch_size: 15, max_tokens: 16000 },
  review_spec_chars: 30000,
  question_areas: DEFAULT_Q_AREAS,
  requirement_kinds: DEFAULT_REQ_KINDS,
  live_check: {
    modification_keywords: 'modif, updat, enhanc, extend, fix, correct, adjust',
    max_objects: 3,
    source_chars: 3000,
    badi_search: true,   // search the released BAdIs / enhancement spots of the requirement's area
  },
  doc_summary: { enabled: true, model: '', max_tokens: 200, input_chars: 3000 },   // model '' = DOC_SUMMARY_DEFAULT_MODEL; 'analysis' = analysis_model
  video: { ...VIDEO_DEFAULTS },   // max_frames 40, batch_frames 12, batch_mb 3, max_mb 200, max_tokens 4000, summary_max_tokens 1500
};

const num = (v, d, min = 1) => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) && n >= min ? n : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const nums = (stored, defs, min) => Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, num(stored?.[k], d, min)]));
const bools = (stored, defs) => Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, bool(stored?.[k], d)]));
const keyed = (list, defs) => {
  const ok = Array.isArray(list) ? list.filter(x => x && String(x.key ?? '').trim()) : [];
  const seen = new Set();
  const clean = ok.filter(x => { const k = String(x.key).trim(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(x => ({ ...x, key: String(x.key).trim(), label_en: String(x.label_en ?? ''), label_es: String(x.label_es ?? '') }));
  return clean.length ? clean : defs;
};

/** The stored policy merged over the defaults; invalid numbers fall back to the default. */
export function specAnalysisPolicy(settings) {
  const s = settings?.spec_analysis_policy ?? {};
  const D = SPEC_ANALYSIS_DEFAULTS;
  const conds = s.signoff?.conditions ?? {};
  return {
    signoff: {
      coverage_min_pct: Math.min(100, num(s.signoff?.coverage_min_pct, D.signoff.coverage_min_pct, 0)),
      partial_counts_as_gap: bool(s.signoff?.partial_counts_as_gap, D.signoff.partial_counts_as_gap),
      conditions: Object.fromEntries(Object.keys(SIGNOFF_CONDITIONS).map(k => [k, conds[k] === 'warn' ? 'warn' : 'required'])),
    },
    auto_steps: bools(s.auto_steps, D.auto_steps),
    doc_limits: nums(s.doc_limits, D.doc_limits, 0),
    max_tokens: nums(s.max_tokens, D.max_tokens, 100),
    apply_answers: nums(s.apply_answers, D.apply_answers, 1),
    review_spec_chars: num(s.review_spec_chars, D.review_spec_chars, 1000),
    question_areas: keyed(s.question_areas, D.question_areas).map(a => ({ ...a, hints: String(a.hints ?? ''), order: num(a.order, 0, 0) })),
    requirement_kinds: keyed(s.requirement_kinds, D.requirement_kinds),
    live_check: {
      modification_keywords: typeof s.live_check?.modification_keywords === 'string' ? s.live_check.modification_keywords : D.live_check.modification_keywords,
      max_objects: num(s.live_check?.max_objects, D.live_check.max_objects, 0),
      source_chars: num(s.live_check?.source_chars, D.live_check.source_chars, 0),
      badi_search: s.live_check?.badi_search === false ? false : D.live_check.badi_search,
    },
    doc_summary: {
      enabled: bool(s.doc_summary?.enabled, D.doc_summary.enabled),
      model: typeof s.doc_summary?.model === 'string' ? s.doc_summary.model : D.doc_summary.model,
      max_tokens: num(s.doc_summary?.max_tokens, D.doc_summary.max_tokens, 50),
      input_chars: num(s.doc_summary?.input_chars, D.doc_summary.input_chars, 100),
    },
    video: nums(s.video, D.video, 1),
  };
}

/** Regex of the live-check "modification case" words (comma-separated words or regex parts). */
export function modificationRegex(words) {
  const src = String(words ?? '').split(',').map(w => w.trim()).filter(Boolean).join('|');
  if (!src) return null;
  try { return new RegExp(src, 'i'); } catch { return new RegExp(src.split('|').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'); }
}

/** Model of the project-document summaries: '' = the fixed default, 'analysis' = analysis_model. */
export function docSummaryModel(policy, settings) {
  const m = policy?.doc_summary?.model ?? '';
  if (m === 'analysis') return settings?.analysis_model || DOC_SUMMARY_DEFAULT_MODEL;
  return m || DOC_SUMMARY_DEFAULT_MODEL;
}

/** Amber note text for an AI JSON answer that was cut off (parseJsonArray → truncated). */
export const truncatedNote = (n, L) => L(
  `The answer was cut off; ${n} items were kept. Raise the token limit in Settings → Spec quality.`,
  `La respuesta se cortó; se conservaron ${n} elementos. Sube el límite de tokens en Configuración → Calidad de spec.`);
