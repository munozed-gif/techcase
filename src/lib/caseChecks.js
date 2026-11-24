// Checks on a case before its documents go to the AI (Analyze): a document that belongs to another
// case, no project / customer, a duplicate case, no functional spec attached, unreadable or cut files.
// Blocking issues stop Analyze until they are fixed or confirmed with a reason
// (notes.caseChecks.resolved = { [issueKey]: { reason, by, name, at } }).

// Case codes such as FSCM-CR-22, MM-ST-I-001, VSS-046, MM-021, EF-MM-021.
const CODE_RE = /\b([A-Z]{2,6}(?:-[A-Z0-9~]{1,5})*?-\d{2,4})(?![\d])/g;

export function codesIn(text) {
  const out = new Set();
  for (const m of String(text ?? '').toUpperCase().matchAll(CODE_RE)) out.add(m[1]);
  return [...out];
}
/** The case's own code, from its reference or title. */
export function caseCode(caseData) {
  return codesIn(caseData?.case_ref)[0] ?? codesIn(caseData?.title)[0] ?? null;
}
// Same code, ignoring a document prefix (EF-, DF-): EF-MM-021 matches MM-021.
export function sameCode(a, b) {
  if (!a || !b) return false;
  const A = a.toUpperCase(), B = b.toUpperCase();
  return A === B || A.endsWith(`-${B}`) || B.endsWith(`-${A}`);
}
// A code that clearly names a different case: same family (prefix) but another number.
function otherCase(code, own) {
  if (!own || sameCode(code, own)) return false;
  const fam = c => c.replace(/-\d+$/, '').split('-').slice(-2).join('-');
  const famOwn = fam(own), famCode = fam(code);
  return famOwn === famCode || famCode.endsWith(famOwn) || famOwn.endsWith(famCode) || code.split('-')[0] === own.split('-')[0];
}

const words = s => new Set(String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2));
export function titleSimilarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}

const SPEC_EXT = /\.(docx?|pdf|txt|md)$/i;
const CLOSED = /^(cancel|closed|terminated|rejected|archived|completed)/i;

/**
 * Run the checks. ctx: { caseData, documents (customer documents only), project, siblings
 * (other cases of the project: {id,title,case_ref,status}), heads: { [docId]: { text, total, error } },
 * cutAt (chars per file the AI receives) }.
 * Returns [{ key, kind, severity: 'block' | 'warn', doc?, otherCase?, detail }].
 */
export function runCaseChecks({ caseData, documents, project, siblings, heads, cutAt }) {
  const out = [];
  const own = caseCode(caseData);
  for (const d of documents ?? []) {
    const fileCodes = codesIn(d.file_name).filter(c => otherCase(c, own));
    const head = heads?.[d.id];
    const isSpec = SPEC_EXT.test(d.file_name ?? '') && !/correo|outlook|mail|whatsapp/i.test(d.file_name ?? '');
    // The spec's own header names its case: only judge the first part of functional spec documents.
    const textCodes = isSpec && head?.text && !codesIn(d.file_name).some(c => sameCode(c, own))
      ? codesIn(head.text.slice(0, 2500)) : [];
    const textOther = textCodes.length && own && !textCodes.some(c => sameCode(c, own)) ? textCodes.filter(c => otherCase(c, own)) : [];
    if (fileCodes.length || textOther.length) {
      out.push({ key: `doc_other_case:${d.id}`, kind: 'doc_other_case', severity: 'block', doc: d.file_name,
        detail: { codes: [...new Set([...fileCodes, ...textOther])], own, where: fileCodes.length ? 'name' : 'text' } });
    }
    if (head?.error) out.push({ key: `doc_unreadable:${d.id}`, kind: 'doc_unreadable', severity: 'warn', doc: d.file_name, detail: { error: head.error } });
    else if (head && !head.text?.trim() && !/\.(png|jpe?g|gif|webp)$/i.test(d.file_name ?? '')) out.push({ key: `doc_unreadable:${d.id}`, kind: 'doc_unreadable', severity: 'warn', doc: d.file_name, detail: { error: 'empty' } });
    else if (head?.total && cutAt && head.total > cutAt) out.push({ key: `doc_cut:${d.id}`, kind: 'doc_cut', severity: 'warn', doc: d.file_name, detail: { total: head.total, cutAt } });
  }
  if (!caseData?.project_id) out.push({ key: 'no_project', kind: 'no_project', severity: 'block' });
  else if (project && !(project.customer_id || project.client_id) && !(caseData.customer_id || caseData.client_id || caseData.external_client_name)) {
    out.push({ key: 'no_customer', kind: 'no_customer', severity: 'warn', detail: { project: project.name } });
  }
  for (const s of siblings ?? []) {
    if (s.id === caseData.id || CLOSED.test(s.status ?? '')) continue;
    const sc = caseCode(s);
    const dup = (own && sc && sameCode(own, sc)) || titleSimilarity(s.title, caseData.title) >= 0.85;
    if (dup) out.push({ key: `duplicate:${s.id}`, kind: 'duplicate', severity: 'block', otherCase: s });
  }
  const specDocs = (documents ?? []).filter(d => SPEC_EXT.test(d.file_name ?? '') && !/correo|outlook|mail/i.test(d.file_name ?? ''));
  if ((documents ?? []).length && !specDocs.length) out.push({ key: 'no_spec_doc', kind: 'no_spec_doc', severity: 'warn' });
  if (!(documents ?? []).length) out.push({ key: 'no_docs', kind: 'no_docs', severity: 'warn' });
  return out;
}

/** Issues still open (not fixed and not confirmed). */
export const openIssues = (issues, resolved) => (issues ?? []).filter(i => !resolved?.[i.key]);
export const blockingIssues = (issues, resolved) => openIssues(issues, resolved).filter(i => i.severity === 'block');

/** Human text of an issue. L(en, es). */
export function issueText(i, L) {
  const d = i.detail ?? {};
  switch (i.kind) {
    case 'doc_other_case': return L(`"${i.doc}" seems to belong to another case (${d.codes.join(', ')}${d.where === 'text' ? ', in its header' : ''}; this case is ${d.own}).`, `"${i.doc}" parece ser de otro caso (${d.codes.join(', ')}${d.where === 'text' ? ', en su encabezado' : ''}; este caso es ${d.own}).`);
    case 'doc_unreadable': return L(`"${i.doc}" could not be read as text — the AI will not see its content (scanned PDF or damaged file?).`, `"${i.doc}" no se pudo leer como texto — la IA no verá su contenido (¿PDF escaneado o archivo dañado?).`);
    case 'doc_cut': return L(`"${i.doc}" is long (${Math.round(d.total / 1000)}k characters); the AI receives only the first ${Math.round(d.cutAt / 1000)}k.`, `"${i.doc}" es largo (${Math.round(d.total / 1000)}k caracteres); la IA recibe solo los primeros ${Math.round(d.cutAt / 1000)}k.`);
    case 'no_project': return L('The case has no project: the project rules, hours catalog and customer data do not apply.', 'El caso no tiene proyecto: no aplican las reglas del proyecto, el catálogo de horas ni los datos del cliente.');
    case 'no_customer': return L(`The project "${d.project}" has no customer.`, `El proyecto "${d.project}" no tiene cliente.`);
    case 'duplicate': return L(`Possible duplicate: "${i.otherCase.title}" (${i.otherCase.status}) in the same project.`, `Posible duplicado: "${i.otherCase.title}" (${i.otherCase.status}) en el mismo proyecto.`);
    case 'no_spec_doc': return L('No functional spec (Word / PDF) attached — only spreadsheets, images or emails.', 'No hay especificación funcional (Word / PDF) adjunta — solo planillas, imágenes o correos.');
    case 'no_docs': return L('The case has no documents.', 'El caso no tiene documentos.');
    default: return i.kind;
  }
}
