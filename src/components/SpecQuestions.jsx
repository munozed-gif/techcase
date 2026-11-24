// Questions for the customer (src/lib/questions.js): the list the analysis finds, edited by the
// consultants, answered by the customer on /questions/:token or recorded by hand.
import { useState } from "react";
import { HelpCircle, RefreshCw, Plus, Send, Copy, Check, Ban, Undo2, ChevronDown } from "lucide-react";
import { usePersistedOpen, SectionHeader } from "./SpecRequirements.jsx";
import { Q_KINDS, Q_KIND_LABEL, liveQuestions, openQuestions } from "../lib/questions.js";

const kindName = (k, lang) => (Q_KIND_LABEL[k] ?? [k, k])[lang === 'es' ? 1 : 0];
const STATUS_CLS = {
  open: 'bg-amber-50 text-amber-700 border-amber-200', answered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  acknowledged: 'bg-blue-50 text-blue-700 border-blue-200', discarded: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function QuestionsPanel({ questions, onChange, onExtract, loading, error, canEdit, state, L, lang, who, links, onSendLink, onCopyLink, onRevokeLink, copiedId }) {
  const [open, setOpen] = usePersistedOpen('genctx_questions_open');
  const [answerFor, setAnswerFor] = useState(null);
  const [answer, setAnswer] = useState('');
  const list = questions ?? [];
  const upd = (id, patch) => onChange(list.map(q => (q.id === id ? { ...q, ...patch } : q)));
  const stamp = () => ({ by: who?.id ?? null, name: who?.name ?? null, at: new Date().toISOString() });
  const statusTxt = s => ({ open: L('Open', 'Abierta'), answered: L('Answered', 'Respondida'), acknowledged: L('Assumption accepted', 'Supuesto aceptado'), discarded: L('Discarded', 'Descartada') })[s] ?? s;
  const nextId = () => `Q-${String(Math.max(0, ...list.map(q => Number(String(q.id).replace(/\D/g, '')) || 0)) + 1).padStart(2, '0')}`;
  const nOpen = openQuestions(list).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <SectionHeader Icon={HelpCircle} title={L('Questions for the customer', 'Preguntas para el cliente')}
        detail={liveQuestions(list).length ? `${nOpen} ${L('open', 'abiertas')} / ${liveQuestions(list).length}` : null}
        pill={loading ? L('Looking…', 'Buscando…') : state === 'fresh' ? L('Current', 'Al día') : state === 'outdated' ? L('Outdated', 'Desactualizado') : L('Not run', 'Sin ejecutar')} pillTone={loading ? 'running' : state === 'fresh' ? 'ok' : state === 'outdated' ? 'warn' : 'muted'}
        open={open} onToggle={() => setOpen(o => !o)}
        actions={[
          canEdit && nOpen > 0 && { Icon: Send, title: L('Send the open questions to the customer (copies the link)', 'Enviar las preguntas abiertas al cliente (copia el enlace)'), onClick: onSendLink },
          canEdit && { Icon: RefreshCw, title: list.length ? L('Look for questions again', 'Buscar preguntas de nuevo') : L('Find questions', 'Buscar preguntas'), onClick: onExtract, loading, primary: true },
        ]} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {(links ?? []).length > 0 && (
        <div className="space-y-1">
          {links.map(l => {
            const n = Object.keys(l.answers ?? {}).length;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className={`px-1.5 py-0.5 rounded-full font-semibold ${l.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : l.status === 'revoked' ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
                  {l.status === 'answered' ? L('Answered', 'Respondido') : l.status === 'revoked' ? L('Revoked', 'Revocado') : L('Waiting for the customer', 'Esperando al cliente')}
                </span>
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
            {list.map(q => (
              <div key={q.id} className={`p-2 rounded-lg border text-xs ${q.status === 'discarded' ? 'bg-gray-50 border-gray-100 opacity-70' : 'border-gray-100'}`}>
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
                      {q.affects?.length > 0 && <span className="text-[11px] text-gray-500">{L('Affects', 'Afecta')}: {q.affects.join(', ')}</span>}
                    </div>
                    {canEdit && q.status === 'open'
                      ? <textarea rows={2} value={q.text} onChange={e => upd(q.id, { text: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                      : <div className={q.status === 'discarded' ? 'line-through' : ''}>{q.text}</div>}
                    {q.sources && <div className="text-[11px] text-gray-500">{L('Sources', 'Fuentes')}: {q.sources}</div>}
                    {q.status !== 'answered' && (canEdit && q.status === 'open'
                      ? <label className="block text-[11px] text-gray-500">{L('Assumption if not answered', 'Supuesto si no se responde')}:
                          <input value={q.assumption ?? ''} onChange={e => upd(q.id, { assumption: e.target.value })} className="mt-0.5 w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                        </label>
                      : q.assumption && <div className="text-[11px] text-gray-600">{L('Assumption', 'Supuesto')}: {q.assumption}</div>)}
                    {q.status === 'answered' && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 rounded px-2 py-1">
                        <span className="font-semibold">{L('Answer', 'Respuesta')}:</span> {q.answer}
                        <span className="text-emerald-600"> — {q.via === 'customer' ? L('customer', 'cliente') : L('recorded by', 'registrada por')} {q.name ?? ''}{q.at ? `, ${new Date(q.at).toLocaleDateString()}` : ''}</span>
                      </div>
                    )}
                    {q.status === 'discarded' && q.reason && <div className="text-[11px] text-gray-500">{L('Discarded', 'Descartada')}: {q.reason}</div>}
                    {answerFor === q.id && (
                      <div className="space-y-1">
                        <textarea autoFocus rows={2} value={answer} onChange={e => setAnswer(e.target.value)}
                          placeholder={L('Answer (where did it come from? e.g. email of 24/11 from the key user)', 'Respuesta (¿de dónde viene? p. ej. correo del 24/11 del usuario clave)')}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                        <div className="flex gap-1.5">
                          <button disabled={!answer.trim()} onClick={() => { upd(q.id, { status: 'answered', answer: answer.trim(), via: 'consultant', ...stamp() }); setAnswerFor(null); }}
                            className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-40">{L('Save answer', 'Guardar respuesta')}</button>
                          <button disabled={!answer.trim()} onClick={() => { upd(q.id, { status: 'discarded', reason: answer.trim(), ...stamp() }); setAnswerFor(null); }}
                            className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">{L('Discard (text = reason)', 'Descartar (texto = motivo)')}</button>
                          <button onClick={() => setAnswerFor(null)} className="px-2 py-1 rounded border border-gray-200">{L('Cancel', 'Cancelar')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {canEdit && answerFor !== q.id && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {(q.status === 'open' || q.status === 'acknowledged')
                        ? <button onClick={() => { setAnswerFor(q.id); setAnswer(''); }} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-50">{L('Answer', 'Responder')}</button>
                        : <button title={L('Reopen', 'Reabrir')} onClick={() => upd(q.id, { status: 'open', answer: null, reason: null })} className="p-1 text-gray-400 hover:text-blue-600"><Undo2 size={13} /></button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => onChange([...list, { id: nextId(), kind: 'ambiguity', text: '', sources: '', affects: [], assumption: '', status: 'open', manual: true, ...stamp() }])}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus size={13} />{L('Add question', 'Agregar pregunta')}</button>
          )}
        </>
      )}
    </div>
  );
}
