// Language of the customer's documents, so specs (and questions for the customer) are written in
// the customer's language instead of the consultant's interface language.
const WORDS = {
  es: ['que', 'de', 'la', 'el', 'los', 'las', 'para', 'con', 'una', 'del', 'por', 'se', 'en', 'es', 'si', 'al', 'debe', 'cuando', 'entrega', 'posición'],
  en: ['the', 'and', 'of', 'to', 'is', 'for', 'with', 'that', 'be', 'in', 'on', 'when', 'must', 'should', 'this', 'are', 'it', 'as', 'from', 'by'],
  pt: ['não', 'você', 'para', 'com', 'uma', 'dos', 'das', 'que', 'em', 'ao', 'pelo', 'pela', 'quando', 'deve', 'são', 'também', 'entrega', 'posição', 'é', 'os'],
};

/** 'es' | 'en' | 'pt' | null (not enough text to tell). */
export function detectDocLang(text) {
  const words = String(text ?? '').toLowerCase().normalize('NFC').match(/[a-záéíóúñãõçâêô]+/g) ?? [];
  if (words.length < 40) return null;
  const counts = Object.fromEntries(Object.keys(WORDS).map(l => [l, 0]));
  const sets = Object.fromEntries(Object.entries(WORDS).map(([l, w]) => [l, new Set(w)]));
  for (const w of words) for (const l of Object.keys(sets)) if (sets[l].has(w)) counts[l]++;
  // Words shared by es and pt ("que", "para"...) count for both: prefer pt only with pt-only evidence.
  const ptOnly = words.filter(w => /ção|ções|não|você|também|são\b/.test(w)).length;
  if (counts.pt > counts.es && ptOnly < 3) counts.pt = 0;
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n >= 8 ? best : null;
}
