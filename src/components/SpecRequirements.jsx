// Requirement traceability UI: the editable requirements checklist (summary node) and the
// coverage panel of a generated spec (spec node). Logic lives in src/lib/requirements.js.
import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle, ListChecks, Wrench, Undo2, ChevronDown, MessageCircleQuestion, ArrowRightLeft, Info, MessageSquareReply } from "lucide-react";
import { REQ_KINDS, REQ_KIND_LABEL, inScope } from "../lib/requirements.js";
import { QRefText, openQuestion } from "./SpecQuestions.jsx";

const kindName = (k, lang) => (REQ_KIND_LABEL[k] ?? [k, k])[lang === 'es' ? 1 : 0];

// Open / closed state remembered per browser.
export function usePersistedOpen(key, def = true) {
  const [open, setOpenState] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch { return def; } });
  const setOpen = v => setOpenState(prev => { const next = typeof v === 'function' ? v(prev) : v; try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  return [open, setOpen];
}

// Review of the changes the customer's answers make to the checklist (out of scope / updated text).
function AnswersProposals({ proposals, requirements, onConfirm, onDiscard, L }) {
  const [sel, setSel] = useState(() => Object.fromEntries(proposals.map(p => [p.id, true])));
  const byId = Object.fromEntries((requirements ?? []).map(r => [r.id, r]));
  const n = proposals.filter(p => sel[p.id]).length;
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-800 flex items-center gap-1.5"><MessageSquareReply size={13} />
        {L(`The customer's answers change ${proposals.length} requirements — review and apply`, `Las respuestas del cliente cambian ${proposals.length} requerimientos — revise y aplique`)}</p>
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
        {proposals.map(p => {
          const r = byId[p.id];
          const out = p.action === 'out_of_scope';
          return (
            <label key={p.id} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-gray-100 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={!!sel[p.id]} onChange={() => setSel(x => ({ ...x, [p.id]: !x[p.id] }))} />
              <div className="flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-gray-500">{p.id}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${out ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                    {out ? L('Out of scope', 'Fuera de alcance') : L('Updated', 'Actualizado')}</span>
                  {(p.questions ?? []).map(q => <button type="button" key={q} onClick={e => { e.preventDefault(); e.stopPropagation(); openQuestion(q); }} className="px-1 rounded bg-violet-100 text-violet-700 font-mono text-[10px] hover:underline">{q}</button>)}
                </div>
                <div className={out ? 'line-through text-gray-500' : 'text-gray-500'}>{r?.text}</div>
                {!out && p.text && <div className="text-gray-800"><span className="font-semibold">{L('New', 'Nuevo')}:</span> {p.text}</div>}
                <div className="text-[11px] text-gray-600">{L('Why', 'Por qué')}: <QRefText text={p.reason} /></div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!n} onClick={() => onConfirm(proposals.filter(p => sel[p.id]))}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-40">{L(`Apply ${n} selected`, `Aplicar ${n} seleccionados`)}</button>
        <button onClick={onDiscard} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs">{L('Discard', 'Descartar')}</button>
      </div>
    </div>
  );
}

export function RequirementsChecklist({ requirements, onChange, onExtract, loading, error, canEdit, state, L, lang, who,
  answeredCount = 0, onApplyAnswers, applying = false, proposals = null, onConfirmProposals, onDiscardProposals }) {
  const [open, setOpen] = usePersistedOpen('genctx2_reqs_open', false);
  const [flashReq, setFlashReq] = useState(null);
  useEffect(() => {
    const onFocus = e => {
      const id = e.detail?.id;
      if (!id) return;
      setOpen(true); setFlashReq(id);
      setTimeout(() => document.getElementById(`req-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      setTimeout(() => setFlashReq(f => (f === id ? null : f)), 2600);
    };
    window.addEventListener('arena:focus-requirement', onFocus);
    return () => window.removeEventListener('arena:focus-requirement', onFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const list = requirements ?? [];
  const upd = (id, patch) => onChange(list.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const nextId = () => {
    const n = Math.max(0, ...list.map(r => Number(String(r.id).replace(/\D/g, '')) || 0)) + 1;
    return `REQ-${String(n).padStart(2, '0')}`;
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <SectionHeader Icon={ListChecks} title={L('Requirements checklist', 'Checklist de requerimientos')}
        detail={list.length ? `${inScope(list).length} ${L('in scope', 'en alcance')}` : null}
        pill={loading ? L('Extracting…', 'Extrayendo…') : state === 'fresh' ? L('Current', 'Al día') : state === 'outdated' ? L('Outdated', 'Desactualizado') : L('Not run', 'Sin ejecutar')} pillTone={loading ? 'running' : state === 'fresh' ? 'ok' : state === 'outdated' ? 'warn' : 'muted'}
        open={open} onToggle={() => setOpen(o => !o)}
        actions={[
          canEdit && list.length > 0 && answeredCount > 0 && onApplyAnswers && { Icon: MessageSquareReply, title: L(`Apply the ${answeredCount} customer answers to the checklist (proposes what is now out of scope or changed)`, `Aplicar las ${answeredCount} respuestas del cliente al checklist (propone qué queda fuera de alcance o cambia)`), onClick: onApplyAnswers, loading: applying },
          canEdit && { Icon: RefreshCw, title: list.length ? L('Extract again', 'Extraer de nuevo') : L('Extract requirements', 'Extraer requerimientos'), onClick: onExtract, loading, primary: true },
        ]} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {canEdit && list.length > 0 && answeredCount > 0 && onApplyAnswers && !proposals && (
        <button onClick={onApplyAnswers} disabled={applying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50">
          <MessageSquareReply size={13} className={applying ? 'animate-pulse' : ''} />
          {applying ? L('Applying the answers…', 'Aplicando las respuestas…') : L(`Apply customer answers to the checklist (${answeredCount})`, `Aplicar respuestas del cliente al checklist (${answeredCount})`)}
        </button>
      )}
      {applying && <p className="text-xs text-violet-700">{L('Comparing the customer answers with the requirements…', 'Comparando las respuestas del cliente con los requerimientos…')}</p>}
      {proposals && proposals.length === 0 && (
        <p className="text-xs text-gray-600 flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-600" />{L('The answers do not change any requirement.', 'Las respuestas no cambian ningún requerimiento.')}
          <button onClick={onDiscardProposals} className="underline">{L('OK', 'Entendido')}</button></p>
      )}
      {proposals && proposals.length > 0 && <AnswersProposals key={proposals.map(p => p.id).join()} proposals={proposals} requirements={list} onConfirm={onConfirmProposals} onDiscard={onDiscardProposals} L={L} />}
      {open && (
        <>
          {!list.length && !loading && (
            <p className="text-xs text-gray-400 italic">{L('Extract the list of everything the customer asks for from the case documents. The consultants review it; every spec must cover it before it can be sent to the customer.', 'Extraiga de los documentos del caso la lista de todo lo que pide el cliente. Los consultores la revisan; cada spec debe cubrirla antes de poder enviarse al cliente.')}</p>
          )}
          <div className="space-y-1.5">
            {list.map(r => (
              <div key={r.id} id={`req-${r.id}`} className={`p-2 rounded-lg border text-xs scroll-mt-24 ${r.outOfScope ? 'bg-gray-50 border-gray-100 opacity-70' : 'border-gray-100'} ${flashReq === r.id ? 'ring-2 ring-violet-400 shadow-md' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-gray-500 w-14 flex-shrink-0 pt-1">{r.id}</span>
                  <div className="flex-1 space-y-1">
                    {canEdit
                      ? <textarea rows={2} value={r.text} onChange={e => upd(r.id, { text: e.target.value })} className={`w-full px-2 py-1 border border-gray-200 rounded text-xs ${r.outOfScope ? 'line-through' : ''}`} />
                      : <div className={r.outOfScope ? 'line-through' : ''}>{r.text}</div>}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      {canEdit
                        ? <select value={r.kind} onChange={e => upd(r.id, { kind: e.target.value })} className="px-1 py-0.5 border border-gray-200 rounded bg-white">
                            {REQ_KINDS.map(k => <option key={k} value={k}>{kindName(k, lang)}</option>)}
                          </select>
                        : <span className="px-1.5 py-0.5 rounded bg-gray-100">{kindName(r.kind, lang)}</span>}
                      {r.source && <span title={r.source} className="max-w-md">{L('Source', 'Fuente')}: <QRefText text={r.source} /></span>}
                      {r.manual && <span className="text-blue-600">{L('added by a consultant', 'agregado por un consultor')}</span>}
                      {r.outOfScope && <span className="text-gray-600">{L('Out of scope', 'Fuera de alcance')}: <QRefText text={r.reason} /></span>}
                      {!r.outOfScope && r.originalText && <span className="text-blue-700" title={`${L('Original', 'Original')}: ${r.originalText}`}>{L('Updated by customer answer', 'Actualizado por respuesta del cliente')}{r.reason ? <>: <QRefText text={r.reason} /></> : null}</span>}
                    </div>
                    {reasonFor === r.id && (
                      <div className="flex gap-1.5">
                        <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder={L('Why is it out of scope?', '¿Por qué queda fuera de alcance?')}
                          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs" />
                        <button disabled={!reason.trim()} onClick={() => { upd(r.id, { outOfScope: true, reason: reason.trim(), by: who, at: new Date().toISOString() }); setReasonFor(null); setReason(''); }}
                          className="px-2 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-40">{L('Confirm', 'Confirmar')}</button>
                        <button onClick={() => { setReasonFor(null); setReason(''); }} className="px-2 py-1 rounded border border-gray-200 text-xs">{L('Cancel', 'Cancelar')}</button>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {r.outOfScope
                        ? <button title={L('Back in scope', 'Volver al alcance')} onClick={() => upd(r.id, { outOfScope: false, reason: null })} className="p-1 text-gray-400 hover:text-blue-600"><Undo2 size={13} /></button>
                        : <button title={L('Mark out of scope', 'Marcar fuera de alcance')} onClick={() => { setReasonFor(r.id); setReason(''); }} className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50">{L('Out', 'Fuera')}</button>}
                      {r.manual && <button title={L('Remove', 'Quitar')} onClick={() => onChange(list.filter(x => x.id !== r.id))} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canEdit && list.length > 0 && (
            <button onClick={() => onChange([...list, { id: nextId(), text: '', kind: 'functional', source: '', manual: true, by: who, at: new Date().toISOString() }])}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus size={13} />{L('Add requirement', 'Agregar requerimiento')}</button>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_CLS = {
  covered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
};

// Question ids (Q-01…) a gap depends on: those cited in its note / location that the customer has not answered yet.
const QID_RE = /\bQ-\d+\b/g;
export function pendingQuestionIds(row, questions) {
  const pending = new Set((questions ?? []).filter(q => q?.id && q.status !== 'answered').map(q => q.id));
  const ids = new Set(`${row.note ?? ''} ${row.where ?? ''}`.match(QID_RE) ?? []);
  return [...ids].filter(id => pending.has(id)).sort();
}

export function CoveragePanel({ stats, current, checked, onCheck, onFix, onAccept, onUnaccept, loading, canEdit, L, ruleViolations, specLabel, questions, other, staleSteps = [], questionsStale = false }) {
  const [openState, setOpen] = useState(null);   // null = automatic: open while there are gaps
  const open = openState ?? (checked && (stats.gaps.length > 0 || (ruleViolations ?? []).length > 0));
  const [filter, setFilter] = useState('gaps');
  // Regenerated questions are renumbered: the Q-xx the spec cites no longer match the list.
  const rows = stats.rows.map(r => ({ ...r, waitQ: r.status === 'covered' || questionsStale ? [] : pendingQuestionIds(r, questions) }));
  const n = {
    covered: rows.filter(r => r.status === 'covered').length,
    partial: rows.filter(r => r.status === 'partial').length,
    missing: rows.filter(r => r.status === 'missing').length,
    accepted: rows.filter(r => r.status !== 'covered' && stats.accepted[r.id]).length,
  };
  const waiting = rows.filter(r => r.waitQ.length && !stats.accepted[r.id]);
  const waitIds = [...new Set(waiting.flatMap(r => r.waitQ))].sort();
  const seg = (v, cls) => v > 0 && <div className={cls} style={{ width: `${(v / Math.max(1, stats.total)) * 100}%` }} />;
  const FILTERS = [
    ['gaps', L('Gaps', 'Brechas'), stats.gaps.length],
    ['wait', L('Waiting on the customer', 'Esperan al cliente'), waiting.length],
    ['partial', L('Partial', 'Parciales'), n.partial],
    ['missing', L('Missing', 'Faltan'), n.missing],
    ['covered', L('Covered', 'Cubiertos'), n.covered],
    ['all', L('All', 'Todos'), rows.length],
  ];
  const shown = rows.filter(r => filter === 'all' ? true : filter === 'gaps' ? r.status !== 'covered'
    : filter === 'wait' ? r.waitQ.length && !stats.accepted[r.id] : r.status === filter);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const statusTxt = s => s === 'covered' ? L('covered', 'cubierto') : s === 'partial' ? L('partial', 'parcial') : L('missing', 'falta');
  const tone = !checked || !current ? 'border-gray-200 bg-gray-50' : stats.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60';
  const acceptBox = key => reasonFor === key && (
    <div className="flex gap-1.5 mt-1">
      <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder={L('Reason the gap is accepted', 'Motivo por el que se acepta la brecha')}
        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
      <button disabled={!reason.trim()} onClick={() => { onAccept(key, reason.trim()); setReasonFor(null); setReason(''); }}
        className="px-2 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-40">{L('Accept', 'Aceptar')}</button>
      <button onClick={() => setReasonFor(null)} className="px-2 py-1 rounded border border-gray-200 text-xs bg-white">{L('Cancel', 'Cancelar')}</button>
    </div>
  );
  const acceptCtl = key => {
    const a = stats.accepted[key];
    if (a) return (
      <div className="text-[11px] text-gray-600 mt-0.5">{L('Accepted', 'Aceptada')}: {a.reason}{a.name ? ` — ${a.name}` : ''} · {new Date(a.at).toLocaleDateString()}
        {canEdit && <button onClick={() => onUnaccept(key)} className="ml-2 underline">{L('undo', 'deshacer')}</button>}
      </div>
    );
    return canEdit && reasonFor !== key
      ? <button onClick={() => { setReasonFor(key); setReason(''); }} className="text-[11px] underline text-gray-600 mt-0.5">{L('Accept gap with a reason', 'Aceptar brecha con motivo')}</button>
      : acceptBox(key);
  };
  return (
    <div className={`mb-4 p-3 rounded-xl border text-xs space-y-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        {checked && current && stats.ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className={checked && current ? 'text-red-600' : 'text-gray-400'} />}
        <button onClick={() => setOpen(!open)} className="font-semibold text-gray-800 text-left flex-1">
          {!stats.total ? L('Requirements coverage — no requirements checklist yet', 'Cobertura de requerimientos — aún no hay checklist de requerimientos')
            : !checked ? `${L('Requirements coverage', 'Cobertura de requerimientos')}${specLabel ? ` · ${specLabel}` : ''} — ${L('not checked', 'sin verificar')}`
            : `${L('Requirements coverage', 'Cobertura de requerimientos')}${specLabel ? ` · ${specLabel}` : ''}: ${stats.pct}% (${stats.covered}/${stats.total})${stats.openGaps.length ? ` · ${stats.openGaps.length} ${L('open gaps', 'brechas abiertas')}` : ''}${stats.openRules.length ? ` · ${stats.openRules.length} ${L('rule violations', 'reglas incumplidas')}` : ''}${!current ? ` · ${L('outdated: the spec changed', 'desactualizada: la spec cambió')}` : ''}`}
        </button>
        {checked && (
          <button onClick={() => setOpen(!open)} className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50">
            {open ? L('Hide detail', 'Ocultar detalle') : L(`Show gaps (${stats.gaps.length + (ruleViolations ?? []).length})`, `Ver brechas (${stats.gaps.length + (ruleViolations ?? []).length})`)}
          </button>
        )}
        {canEdit && stats.total > 0 && (
          <button onClick={onCheck} disabled={loading} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={12} className={loading === 'check' ? 'animate-spin' : ''} />{loading === 'check' ? L('Checking…', 'Verificando…') : L('Check coverage', 'Verificar cobertura')}
          </button>
        )}
        {canEdit && checked && current && (stats.openGaps.length > 0 || stats.openRules.length > 0) && (
          <button onClick={onFix} disabled={loading} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A4B8C] text-white font-semibold hover:bg-blue-900 disabled:opacity-50">
            <Wrench size={12} className={loading === 'fix' ? 'animate-pulse' : ''} />{loading === 'fix' ? L('Fixing the spec…', 'Corrigiendo la spec…') : L('Fix gaps', 'Corregir brechas')}
          </button>
        )}
      </div>
      {staleSteps.length > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <b>{L('The spec is older than the analysis.', 'La spec es anterior al análisis.')}</b>{' '}
            {L(`Run after the spec was generated: ${staleSteps.join(', ')}. The spec does not include them yet`, `Se ejecutó después de generar la spec: ${staleSteps.join(', ')}. La spec todavía no lo incluye`)}
            {questionsStale ? L(', and the question numbers (Q-xx) cited in the spec no longer match the current list', ', y los números de pregunta (Q-xx) que cita la spec ya no coinciden con la lista actual') : ''}.
            {' '}{L('Regenerate the spec and then check the coverage again.', 'Regenere la spec y luego vuelva a verificar la cobertura.')}
          </div>
        </div>
      )}
      {checked && stats.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
            {seg(n.covered, 'bg-emerald-500')}{seg(n.partial, 'bg-amber-400')}{seg(n.missing, 'bg-red-500')}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{L('Covered', 'Cubiertos')} <b>{n.covered}</b></span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{L('Partial', 'Parciales')} <b>{n.partial}</b></span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{L('Missing', 'Faltan')} <b>{n.missing}</b></span>
            {n.accepted > 0 && <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} className="text-gray-500" />{L('Gaps accepted', 'Brechas aceptadas')} <b>{n.accepted}</b></span>}
            <span className="inline-flex items-center gap-1 text-gray-400"><Info size={11} />{L('Only fully covered requirements count in the %; partial ones add nothing.', 'El % solo cuenta los requerimientos cubiertos del todo; los parciales no suman.')}</span>
          </div>
          {waiting.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
              <MessageCircleQuestion size={14} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <b>{L(`${waiting.length} gaps are waiting on the customer`, `${waiting.length} brechas esperan respuesta del cliente`)}</b>
                {' '}({waitIds.length} {L('unanswered questions', 'preguntas sin responder')}: {waitIds.slice(0, 10).join(', ')}{waitIds.length > 10 ? '…' : ''}).
                {' '}{L('Send the questions to the customer and regenerate the spec with the answers: these gaps can then become covered.', 'Envíe las preguntas al cliente y regenere la spec con las respuestas: así estas brechas pueden pasar a cubiertas.')}
                {canEdit && <button onClick={() => { setOpen(true); setFilter('wait'); }} className="ml-1 underline font-semibold">{L('See them', 'Verlas')}</button>}
              </div>
            </div>
          )}
          {other?.checked && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
              <ArrowRightLeft size={12} className="text-gray-400" />
              <span>{other.label}: <b className={other.pct > stats.pct ? 'text-emerald-700' : ''}>{other.pct}%</b> ({other.covered}/{other.total}){!other.current ? ` · ${L('outdated', 'desactualizada')}` : ''}</span>
              {other.pct > stats.pct && other.onOpen && (
                <button onClick={other.onOpen} className="px-2 py-0.5 rounded-md border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50">{L(`Open ${other.label}`, `Ver ${other.label}`)}</button>
              )}
            </div>
          )}
        </div>
      )}
      {checked && current && !stats.ok && (
        <p className="text-red-700">{L('The spec cannot be sent until every requirement is covered or its gap is accepted with a reason. For each gap below: "Fix gaps" regenerates the spec adding what is missing (from the customer documents); if the customer has to define it, add it as a question for the customer; if it is out of scope, accept the gap with the reason.', 'La spec no se puede enviar hasta que cada requerimiento esté cubierto o su brecha se acepte con un motivo. Para cada brecha de abajo: "Corregir brechas" regenera la spec agregando lo que falta (desde los documentos del cliente); si lo tiene que definir el cliente, agréguelo como pregunta para el cliente; si queda fuera de alcance, acepte la brecha con el motivo.')}</p>
      )}
      {open && checked && (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap gap-1">
            {FILTERS.filter(([k, , c]) => c > 0 || k === filter || k === 'gaps').map(([k, label, c]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${filter === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {label} · {c}
              </button>
            ))}
          </div>
          {!shown.length && <p className="text-[11px] text-gray-500 py-1">{L('Nothing here.', 'No hay nada aquí.')}</p>}
          {[...shown].sort((a, b) => (a.status === 'covered') - (b.status === 'covered')).map(r => (
            <div key={r.id} className="p-2 rounded-lg bg-white border border-gray-100">
              <div className="flex items-start gap-2">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 ${STATUS_CLS[r.status] ?? STATUS_CLS.missing}`}>{statusTxt(r.status)}</span>
                <div className="flex-1">
                  <div><span className="font-mono text-gray-500">{r.id}</span> {r.text}</div>
                  {r.where && <div className="text-[11px] text-gray-500">{L('Where', 'Dónde')}: <QRefText text={r.where} /></div>}
                  {r.note && r.status !== 'covered' && <div className="text-[11px] text-gray-600"><QRefText text={r.note} /></div>}
                  {r.waitQ.length > 0 && (
                    <div className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-[10px] text-amber-700">
                      <MessageCircleQuestion size={11} />{L('Waiting on the customer', 'Espera al cliente')}:
                      {r.waitQ.map(q => <button type="button" key={q} onClick={() => openQuestion(q)} className="px-1 rounded bg-amber-50 border border-amber-200 font-mono hover:underline">{q}</button>)}
                    </div>
                  )}
                  {r.status !== 'covered' && acceptCtl(r.id)}
                </div>
              </div>
            </div>
          ))}
          {(filter === 'gaps' || filter === 'all') && (ruleViolations ?? []).map(v => (
            <div key={v.id} className="p-2 rounded-lg bg-white border border-red-100">
              <div className="flex items-start gap-2">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 ${STATUS_CLS.missing}`}>{L('rule', 'regla')}</span>
                <div className="flex-1"><div className="font-semibold">{v.text}</div><div className="text-[11px] text-gray-600">{v.detail}</div>{acceptCtl(`rule:${v.id}`)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One header style for the analysis sections (summary, checklist, questions, compiled context):
// icon · TITLE · detail · status pill … icon actions · chevron.
const PILL = {
  ok:      'bg-emerald-50 text-emerald-700 border-emerald-100',
  warn:    'bg-amber-50 text-amber-700 border-amber-100',
  muted:   'bg-gray-50 text-gray-500 border-gray-200',
  running: 'bg-blue-50 text-blue-600 border-blue-100',
};
export function SectionHeader({ Icon, title, detail, pill, pillTone = 'ok', open, onToggle, actions = [] }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggle} className="flex items-start gap-2 flex-1 min-w-0 text-left">
        {Icon && <Icon size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />}
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide leading-snug">{title}</span>
          {(detail || pill) && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {pill && <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 whitespace-nowrap ${PILL[pillTone] ?? PILL.ok}`}>{pill}</span>}
              {detail && <span className="text-[11px] text-gray-400 whitespace-nowrap">{detail}</span>}
            </span>
          )}
        </span>
      </button>
      {actions.filter(Boolean).map(a => (
        <button key={a.title} onClick={a.onClick} disabled={a.disabled || a.loading} title={a.title} aria-label={a.title}
          className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${a.primary ? 'border-violet-200 text-violet-600 hover:bg-violet-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          <a.Icon size={13} className={a.loading ? 'animate-spin' : ''} />
        </button>
      ))}
      <button onClick={onToggle} title={open ? 'Ocultar' : 'Mostrar'} className="flex-shrink-0 p-1 text-gray-400">
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
