// Questions for the customer (src/lib/questions.js): the list the analysis finds, edited by the
// consultants, answered by the customer on /questions/:token or recorded by hand.
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { HelpCircle, RefreshCw, Plus, Send, Copy, Check, Ban, Undo2, ChevronDown } from "lucide-react";
import { usePersistedOpen, SectionHeader } from "./SpecRequirements.jsx";
import { Q_KINDS, Q_KIND_LABEL, Q_AREAS, qAreaName, areaOf, askableQuestions, liveQuestions, openQuestions } from "../lib/questions.js";

// Textarea that grows with its text (no inner scroll, nothing cut off).
function AutoTextarea({ value, onChange, className = '', minRows = 2, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} onChange={onChange} className={`resize-none overflow-hidden ${className}`} {...rest} />;
}

const kindName = (k, lang) => (Q_KIND_LABEL[k] ?? [k, k])[lang === 'es' ? 1 : 0];

// ── Links to questions (Q-07) from anywhere: requirements, coverage notes, reviews ──
const QREF_RE = /\b(?:Q|REQ)-\d{1,3}\b/g;
/** Ask the specification screen to show question `id` (opens its panel and scrolls to it). */
export function openQuestion(id) {
  try { window.dispatchEvent(new CustomEvent('arena:open-question', { detail: { id } })); } catch { /* ignore */ }
}
/** Same for a requirement of the checklist (REQ-06). */
export function openRequirement(id) {
  try { window.dispatchEvent(new CustomEvent('arena:open-question', { detail: { id, kind: 'req' } })); } catch { /* ignore */ }
}
const openRef = id => (id.startsWith('REQ-') ? openRequirement(id) : openQuestion(id));
/** References (Q-07, REQ-06) mentioned in a text, without repeats. */
export const refsIn = t => [...new Set(String(t ?? '').match(QREF_RE) ?? [])];
/** Text where every "Q-07" / "REQ-06" becomes a link to that question / requirement. */
export function QRefText({ text, className = '' }) {
  const t = String(text ?? '');
  const parts = [];
  let last = 0, m;
  QREF_RE.lastIndex = 0;
  while ((m = QREF_RE.exec(t))) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    const id = m[0];
    parts.push(<button key={`${id}-${m.index}`} type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); openRef(id); }}
      className="font-mono font-semibold text-violet-700 dark:text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-900">{id}</button>);
    last = m.index + id.length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return <span className={className}>{parts}</span>;
}
/** For rendered markdown (HTML): turn "Q-07" into links handled by onQRefClick. */
export const linkQRefsHtml = html => String(html ?? '').replace(/(>[^<]*)/g, seg => seg.replace(QREF_RE, id => `<a href="#${id}" data-qref="${id}" class="qref">${id}</a>`));
export function onQRefClick(e) {
  const a = e.target?.closest?.('[data-qref]');
  if (!a) return;
  e.preventDefault();
  openRef(a.getAttribute('data-qref'));
}
const STATUS_CLS = {
  open: 'bg-amber-50 text-amber-700 border-amber-200', answered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  acknowledged: 'bg-blue-50 text-blue-700 border-blue-200', discarded: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function QuestionsPanel({ questions, onChange, onExtract, loading, error, canEdit, state, L, lang, who, links, onSendLink, onCopyLink, onRevokeLink, copiedId }) {
  const [open, setOpen] = usePersistedOpen('genctx2_questions_open', false);
  const [answerFor, setAnswerFor] = useState(null);
  const [answer, setAnswer] = useState('');
  const [confirmMode, setConfirmMode] = useState(false);   // answer box opened by "Confirm assumption"
  const [confirmedBy, setConfirmedBy] = useState('');
  const startAnswer = q => { setAnswerFor(q.id); setAnswer(''); setConfirmMode(false); setConfirmedBy(''); };
  const startConfirm = q => { setAnswerFor(q.id); setAnswer(q.assumption ?? ''); setConfirmMode(true); setConfirmedBy(''); };
  const list = questions ?? [];
  const upd = (id, patch) => onChange(list.map(q => (q.id === id ? { ...q, ...patch } : q)));
  const stamp = () => ({ by: who?.id ?? null, name: who?.name ?? null, at: new Date().toISOString() });
  const statusTxt = s => ({ open: L('Open', 'Abierta'), answered: L('Answered', 'Respondida'), acknowledged: L('Assumption accepted', 'Supuesto aceptado'), discarded: L('Discarded', 'Descartada') })[s] ?? s;
  const nextId = () => `Q-${String(Math.max(0, ...list.map(q => Number(String(q.id).replace(/\D/g, '')) || 0)) + 1).padStart(2, '0')}`;
  const nOpen = openQuestions(list).length;
  const [areaFilter, setAreaFilter] = useState(null);
  const askable = askableQuestions(list);
  const byArea = Q_AREAS.map(a => ({ area: a, n: askable.filter(q => areaOf(q) === a).length, total: liveQuestions(list).filter(q => areaOf(q) === a).length })).filter(x => x.total > 0);
  const AREA_CLS = { functional: 'bg-blue-50 text-blue-700 border-blue-200', abap: 'bg-violet-50 text-violet-700 border-violet-200', basis: 'bg-slate-100 text-slate-700 border-slate-300',
    security: 'bg-red-50 text-red-700 border-red-200', integration: 'bg-teal-50 text-teal-700 border-teal-200', data: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    testing: 'bg-amber-50 text-amber-700 border-amber-200', management: 'bg-gray-100 text-gray-700 border-gray-300' };
  const shown = areaFilter ? list.filter(q => areaOf(q) === areaFilter) : list;
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    const onFocus = e => {
      const id = e.detail?.id;
      if (!id) return;
      setOpen(true); setAreaFilter(null); setFlash(id);
      setTimeout(() => document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      setTimeout(() => setFlash(f => (f === id ? null : f)), 2600);
    };
    window.addEventListener('arena:focus-question', onFocus);
    return () => window.removeEventListener('arena:focus-question', onFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <SectionHeader Icon={HelpCircle} title={L('Questions for the customer', 'Preguntas para el cliente')}
        detail={liveQuestions(list).length ? `${liveQuestions(list).length - askableQuestions(list).length}/${liveQuestions(list).length} ${L('answered', 'respondidas')}${askableQuestions(list).length ? ` · ${askableQuestions(list).length} ${L('pending', 'pendientes')}` : ''}` : null}
        pill={loading ? L('Looking…', 'Buscando…') : state === 'fresh' ? L('Current', 'Al día') : state === 'outdated' ? L('Outdated', 'Desactualizado') : L('Not run', 'Sin ejecutar')} pillTone={loading ? 'running' : state === 'fresh' ? 'ok' : state === 'outdated' ? 'warn' : 'muted'}
        open={open} onToggle={() => setOpen(o => !o)}
        actions={[
          canEdit && askable.length > 0 && { Icon: Send, title: L('One link with all the unanswered questions (copies the link)', 'Un enlace con todas las preguntas sin responder (copia el enlace)'), onClick: () => onSendLink(null) },
          canEdit && { Icon: RefreshCw, title: list.length ? L('Look for questions again', 'Buscar preguntas de nuevo') : L('Find questions', 'Buscar preguntas'), onClick: onExtract, loading, primary: true },
        ]} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {open && byArea.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-500">{L('By area (answered / total) — filter the list, or send each area its own link with its pending questions:', 'Por área (respondidas / total) — filtra la lista, o envía a cada área su propio enlace con sus preguntas pendientes:')}</p>
          <div className="flex flex-wrap gap-1.5">
            {byArea.map(x => (
              <span key={x.area} className={`inline-flex items-center rounded-lg border text-[11px] overflow-hidden ${AREA_CLS[x.area]} ${areaFilter === x.area ? 'ring-2 ring-blue-300' : ''}`}>
                <button onClick={() => { setAreaFilter(f => (f === x.area ? null : x.area)); setOpen(true); }} className="px-2 py-1 font-semibold inline-flex items-center gap-1"
                  title={L(`${x.total - x.n} of ${x.total} answered · ${x.n} pending`, `${x.total - x.n} de ${x.total} respondidas · ${x.n} pendientes`)}>
                  {x.n === 0 && <Check size={11} />}{qAreaName(x.area, lang)} · {x.total - x.n}/{x.total}
                </button>
                {canEdit && x.n > 0 && (
                  <button onClick={() => onSendLink(x.area)} title={L(`Create a link with the ${x.n} unanswered ${qAreaName(x.area, lang)} questions (copies it)`, `Crear un enlace con las ${x.n} preguntas sin responder de ${qAreaName(x.area, lang)} (lo copia)`)}
                    className="px-1.5 py-1 border-l border-current/20 hover:bg-white/60 inline-flex items-center gap-1"><Send size={11} />{L(`Link (${x.n} pending)`, `Enlace (${x.n} pend.)`)}</button>
                )}
              </span>
            ))}
            {areaFilter && <button onClick={() => setAreaFilter(null)} className="text-[11px] underline text-gray-500">{L('Show all', 'Ver todas')}</button>}
          </div>
        </div>
      )}
      {open && askable.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 space-y-2.5">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{L(`Pending by area · ${askable.length} of ${liveQuestions(list).length}`, `Pendientes por área · ${askable.length} de ${liveQuestions(list).length}`)}</p>
          {byArea.filter(x => x.n > 0).map(x => (
            <div key={x.area} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${AREA_CLS[x.area]}`}>{qAreaName(x.area, lang)}</span>
                <span className="text-[11px] text-gray-500">{L(`${x.total - x.n}/${x.total} answered · ${x.n} pending`, `${x.total - x.n}/${x.total} respondidas · ${x.n} pendientes`)}</span>
                {canEdit && (
                  <button onClick={() => onSendLink(x.area)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"><Send size={11} />{L('Link for this area', 'Enlace para esta área')}</button>
                )}
              </div>
              <ul className="space-y-1">
                {askable.filter(q => areaOf(q) === x.area).map(q => (
                  <li key={q.id} className="flex items-start gap-2 text-xs bg-white border border-gray-100 rounded-lg px-2 py-1.5">
                    <span className="font-mono font-semibold text-gray-500 flex-shrink-0">{q.id}</span>
                    <span className={`px-1 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 ${STATUS_CLS[q.status] ?? STATUS_CLS.open}`}>{statusTxt(q.status)}</span>
                    <span className="flex-1 text-gray-700"><QRefText text={q.text} />{q.assumption ? <span className="block text-[11px] text-gray-500 mt-0.5">{L('Assumption', 'Supuesto')}: <QRefText text={q.assumption} /></span> : null}</span>
                    {canEdit && <span className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => { setAreaFilter(x.area); startAnswer(q); }} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-50">{L('Answer', 'Responder')}</button>
                      {q.assumption?.trim() && <button onClick={() => { setAreaFilter(x.area); startConfirm(q); }} className="px-1.5 py-0.5 text-[10px] rounded border border-violet-200 text-violet-700 hover:bg-violet-50 whitespace-nowrap">{L('Confirm assumption', 'Confirmar supuesto')}</button>}
                    </span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {open && (links ?? []).length > 0 && (
        <div className="space-y-1">
          {links.map(l => {
            const n = Object.keys(l.answers ?? {}).length;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className={`px-1.5 py-0.5 rounded-full font-semibold ${l.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : l.status === 'revoked' ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
                  {l.status === 'answered' ? L('Answered', 'Respondido') : l.status === 'revoked' ? L('Revoked', 'Revocado') : L('Waiting for the customer', 'Esperando al cliente')}
                </span>
                {l.platform?.area && <span className={`px-1.5 py-0.5 rounded border font-semibold ${AREA_CLS[l.platform.area] ?? ''}`}>{qAreaName(l.platform.area, lang)}</span>}
                <span className="text-gray-600 flex-1">{L('Sent', 'Enviado')} {new Date(l.created_at).toLocaleDateString()} · {(l.questions ?? []).length} {L('questions', 'preguntas')} · {n} {L('answered', 'respondidas')}{l.customer_name ? ` · ${l.customer_name}` : ''}</span>
                {l.status === 'pending' && (
                  <>
                    <button onClick={() => onCopyLink(l)} className="inline-flex items-center gap-1 underline text-gray-600">{copiedId === l.id ? <><Check size={11} />{L('Copied', 'Copiado')}</> : <><Copy size={11} />{L('Copy link', 'Copiar enlace')}</>}</button>
                    {canEdit && <button onClick={() => onRevokeLink(l)} className="inline-flex items-center gap-1 underline text-gray-500"><Ban size={11} />{L('Revoke', 'Revocar')}</button>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {open && (
        <>
          {!list.length && !loading && (
            <p className="text-xs text-gray-400 italic">{L('The analysis looks for contradictions between the documents, ambiguous rules and missing information. Answered questions override the documents when generating; open ones become explicit assumptions in the spec.', 'El análisis busca contradicciones entre documentos, reglas ambiguas e información faltante. Las respuestas prevalecen sobre los documentos al generar; las preguntas abiertas quedan como supuestos explícitos en la spec.')}</p>
          )}
          <div className="space-y-1.5">
            {shown.map(q => (
              <div key={q.id} id={`q-${q.id}`} className={`p-2 rounded-lg border text-xs scroll-mt-24 transition-shadow ${q.status === 'discarded' ? 'bg-gray-50 border-gray-100 opacity-70' : 'border-gray-100'} ${flash === q.id ? 'ring-2 ring-violet-400 shadow-md' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-gray-500 w-11 flex-shrink-0 pt-1">{q.id}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_CLS[q.status] ?? STATUS_CLS.open}`}>{statusTxt(q.status)}</span>
                      {canEdit && q.status === 'open'
                        ? <select value={q.kind} onChange={e => upd(q.id, { kind: e.target.value })} className="px-1 py-0.5 border border-gray-200 rounded bg-white text-[11px]">
                            {Q_KINDS.map(k => <option key={k} value={k}>{kindName(k, lang)}</option>)}
                          </select>
                        : <span className="text-[11px] text-gray-500">{kindName(q.kind, lang)}</span>}
                      {canEdit && q.status !== 'answered' && q.status !== 'discarded'
                        ? <select value={areaOf(q)} onChange={e => upd(q.id, { area: e.target.value })} title={L('Who has to answer it', 'Quién debe responderla')}
                            className={`px-1 py-0.5 border rounded text-[11px] font-semibold ${AREA_CLS[areaOf(q)]}`}>
                            {Q_AREAS.map(a => <option key={a} value={a}>{qAreaName(a, lang)}</option>)}
                          </select>
                        : <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${AREA_CLS[areaOf(q)]}`}>{qAreaName(areaOf(q), lang)}</span>}
                      {q.affects?.length > 0 && <span className="text-[11px] text-gray-500">{L('Affects', 'Afecta')}: <QRefText text={q.affects.join(', ')} /></span>}
                    </div>
                    {canEdit && q.status === 'open'
                      ? <>
                          <AutoTextarea value={q.text} onChange={e => upd(q.id, { text: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                          {refsIn(q.text).length > 0 && <div className="text-[11px] text-gray-500">{L('References', 'Referencias')}: <QRefText text={refsIn(q.text).join(', ')} /></div>}
                        </>
                      : <div className={q.status === 'discarded' ? 'line-through' : ''}><QRefText text={q.text} /></div>}
                    {q.sources && <div className="text-[11px] text-gray-500">{L('Sources', 'Fuentes')}: <QRefText text={q.sources} /></div>}
                    {q.status !== 'answered' && (canEdit && q.status === 'open'
                      ? <label className="block text-[11px] text-gray-500">{L('Assumption if not answered', 'Supuesto si no se responde')}:
                          <AutoTextarea minRows={1} value={q.assumption ?? ''} onChange={e => upd(q.id, { assumption: e.target.value })} className="mt-0.5 w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                        </label>
                      : q.assumption && <div className="text-[11px] text-gray-600">{L('Assumption', 'Supuesto')}: <QRefText text={q.assumption} /></div>)}
                    {q.status === 'answered' && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 rounded px-2 py-1">
                        <span className="font-semibold">{L('Answer', 'Respuesta')}:</span> <QRefText text={q.answer} />
                        <span className="text-emerald-600"> — {q.via === 'customer' ? L('customer', 'cliente')
                          : q.via === 'assumption' ? `${L('assumption confirmed', 'supuesto confirmado')}${q.confirmedBy ? ` ${L('by', 'por')} ${q.confirmedBy}` : ''} · ${L('recorded by', 'registrado por')}`
                          : L('recorded by', 'registrada por')} {q.name ?? ''}{q.at ? `, ${new Date(q.at).toLocaleDateString()}` : ''}</span>
                      </div>
                    )}
                    {q.status === 'discarded' && q.reason && <div className="text-[11px] text-gray-500">{L('Discarded', 'Descartada')}: <QRefText text={q.reason} /></div>}
                    {answerFor === q.id && (
                      <div className="space-y-1">
                        {confirmMode && <p className="text-[11px] text-violet-700">{L('The assumption becomes the answer: edit it if needed (e.g. the final technical name) and say who confirmed it.', 'El supuesto pasa a ser la respuesta: edítelo si hace falta (p. ej. el nombre técnico definitivo) e indique quién lo confirmó.')}</p>}
                        <AutoTextarea autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
                          placeholder={L('Answer (where did it come from? e.g. email of 24/11 from the key user)', 'Respuesta (¿de dónde viene? p. ej. correo del 24/11 del usuario clave)')}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                        {confirmMode && (
                          <input value={confirmedBy} onChange={e => setConfirmedBy(e.target.value)}
                            placeholder={L('Confirmed by (name / role, e.g. Rafael Rodriguez, project architect)', 'Confirmado por (nombre / rol, p. ej. Rafael Rodriguez, arquitecto del proyecto)')}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                        )}
                        {confirmMode ? (
                          <div className="flex gap-1.5">
                            <button disabled={!answer.trim() || !confirmedBy.trim()} onClick={() => { upd(q.id, { status: 'answered', answer: answer.trim(), via: 'assumption', confirmedBy: confirmedBy.trim(), ...stamp() }); setAnswerFor(null); setConfirmMode(false); }}
                              className="px-2 py-1 rounded bg-violet-600 text-white disabled:opacity-40">{L('Confirm as answer', 'Confirmar como respuesta')}</button>
                            <button onClick={() => { setAnswerFor(null); setConfirmMode(false); }} className="px-2 py-1 rounded border border-gray-200">{L('Cancel', 'Cancelar')}</button>
                          </div>
                        ) : (
                        <div className="flex gap-1.5">
                          <button disabled={!answer.trim()} onClick={() => { upd(q.id, { status: 'answered', answer: answer.trim(), via: 'consultant', ...stamp() }); setAnswerFor(null); }}
                            className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-40">{L('Save answer', 'Guardar respuesta')}</button>
                          <button disabled={!answer.trim()} onClick={() => { upd(q.id, { status: 'discarded', reason: answer.trim(), ...stamp() }); setAnswerFor(null); }}
                            className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">{L('Discard (text = reason)', 'Descartar (texto = motivo)')}</button>
                          <button onClick={() => setAnswerFor(null)} className="px-2 py-1 rounded border border-gray-200">{L('Cancel', 'Cancelar')}</button>
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit && answerFor !== q.id && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {(q.status === 'open' || q.status === 'acknowledged')
                        ? <>
                            <button onClick={() => startAnswer(q)} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-50">{L('Answer', 'Responder')}</button>
                            {q.assumption?.trim() && <button onClick={() => startConfirm(q)} title={L('Use the assumption as the answer (records who confirmed it)', 'Usar el supuesto como respuesta (registra quién lo confirmó)')}
                              className="px-1.5 py-0.5 text-[10px] rounded border border-violet-200 text-violet-700 hover:bg-violet-50 whitespace-nowrap">{L('Confirm assumption', 'Confirmar supuesto')}</button>}
                          </>
                        : <button title={L('Reopen', 'Reabrir')} onClick={() => upd(q.id, { status: 'open', answer: null, reason: null })} className="p-1 text-gray-400 hover:text-blue-600"><Undo2 size={13} /></button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => onChange([...list, { id: nextId(), kind: 'ambiguity', area: areaFilter ?? 'functional', text: '', sources: '', affects: [], assumption: '', status: 'open', manual: true, ...stamp() }])}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus size={13} />{L('Add question', 'Agregar pregunta')}</button>
          )}
        </>
      )}
    </div>
  );
}
