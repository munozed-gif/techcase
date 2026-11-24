// Requirement traceability UI: the editable requirements checklist (summary node) and the
// coverage panel of a generated spec (spec node). Logic lives in src/lib/requirements.js.
import { useState } from "react";
import { Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle, ListChecks, Wrench, Undo2 } from "lucide-react";
import { REQ_KINDS, REQ_KIND_LABEL, inScope } from "../lib/requirements.js";

const kindName = (k, lang) => (REQ_KIND_LABEL[k] ?? [k, k])[lang === 'es' ? 1 : 0];

export function RequirementsChecklist({ requirements, onChange, onExtract, loading, error, canEdit, state, L, lang, who }) {
  const [open, setOpen] = useState(true);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const list = requirements ?? [];
  const upd = (id, patch) => onChange(list.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const nextId = () => {
    const n = Math.max(0, ...list.map(r => Number(String(r.id).replace(/\D/g, '')) || 0)) + 1;
    return `REQ-${String(n).padStart(2, '0')}`;
  };
  const stateCls = state === 'fresh' ? 'text-emerald-700' : state === 'outdated' ? 'text-amber-700' : 'text-gray-400';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <ListChecks size={14} />{L('Requirements checklist', 'Checklist de requerimientos')}
          {list.length > 0 && <span className="normal-case font-normal text-gray-400">· {inScope(list).length} {L('in scope', 'en alcance')}</span>}
          <span className={`normal-case font-semibold ${stateCls}`}>· {state === 'fresh' ? L('current', 'al día') : state === 'outdated' ? L('outdated', 'desactualizado') : L('not run', 'sin ejecutar')}</span>
        </button>
        {canEdit && (
          <button onClick={onExtract} disabled={loading}
            className="px-3 py-1 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? L('Extracting…', 'Extrayendo…') : list.length ? L('Extract again', 'Extraer de nuevo') : L('Extract requirements', 'Extraer requerimientos')}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {open && (
        <>
          {!list.length && !loading && (
            <p className="text-xs text-gray-400 italic">{L('Extract the list of everything the customer asks for from the case documents. The consultants review it; every spec must cover it before it can be sent to the customer.', 'Extraiga de los documentos del caso la lista de todo lo que pide el cliente. Los consultores la revisan; cada spec debe cubrirla antes de poder enviarse al cliente.')}</p>
          )}
          <div className="space-y-1.5">
            {list.map(r => (
              <div key={r.id} className={`p-2 rounded-lg border text-xs ${r.outOfScope ? 'bg-gray-50 border-gray-100 opacity-70' : 'border-gray-100'}`}>
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
                      {r.source && <span title={r.source} className="truncate max-w-xs">{L('Source', 'Fuente')}: {r.source}</span>}
                      {r.manual && <span className="text-blue-600">{L('added by a consultant', 'agregado por un consultor')}</span>}
                      {r.outOfScope && <span className="text-gray-600">{L('Out of scope', 'Fuera de alcance')}: {r.reason}</span>}
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

export function CoveragePanel({ stats, current, checked, onCheck, onFix, onAccept, onUnaccept, loading, canEdit, L, ruleViolations }) {
  const [openState, setOpen] = useState(null);   // null = automatic: open while there are gaps
  const open = openState ?? (checked && (stats.gaps.length > 0 || (ruleViolations ?? []).length > 0));
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
            : !checked ? L('Requirements coverage — not checked', 'Cobertura de requerimientos — sin verificar')
            : `${L('Requirements coverage', 'Cobertura de requerimientos')}: ${stats.pct}% (${stats.covered}/${stats.total})${stats.openGaps.length ? ` · ${stats.openGaps.length} ${L('open gaps', 'brechas abiertas')}` : ''}${stats.openRules.length ? ` · ${stats.openRules.length} ${L('rule violations', 'reglas incumplidas')}` : ''}${!current ? ` · ${L('outdated: the spec changed', 'desactualizada: la spec cambió')}` : ''}`}
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
      {checked && current && !stats.ok && (
        <p className="text-red-700">{L('The spec cannot be sent until every requirement is covered or its gap is accepted with a reason. For each gap below: "Fix gaps" regenerates the spec adding what is missing (from the customer documents); if the customer has to define it, add it as a question for the customer; if it is out of scope, accept the gap with the reason.', 'La spec no se puede enviar hasta que cada requerimiento esté cubierto o su brecha se acepte con un motivo. Para cada brecha de abajo: "Corregir brechas" regenera la spec agregando lo que falta (desde los documentos del cliente); si lo tiene que definir el cliente, agréguelo como pregunta para el cliente; si queda fuera de alcance, acepte la brecha con el motivo.')}</p>
      )}
      {open && checked && (
        <div className="space-y-1.5 pt-1">
          {[...stats.rows].sort((a, b) => (a.status === 'covered') - (b.status === 'covered')).map(r => (
            <div key={r.id} className="p-2 rounded-lg bg-white border border-gray-100">
              <div className="flex items-start gap-2">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 ${STATUS_CLS[r.status] ?? STATUS_CLS.missing}`}>{statusTxt(r.status)}</span>
                <div className="flex-1">
                  <div><span className="font-mono text-gray-500">{r.id}</span> {r.text}</div>
                  {r.where && <div className="text-[11px] text-gray-500">{L('Where', 'Dónde')}: {r.where}</div>}
                  {r.note && r.status !== 'covered' && <div className="text-[11px] text-gray-600">{r.note}</div>}
                  {r.status !== 'covered' && acceptCtl(r.id)}
                </div>
              </div>
            </div>
          ))}
          {(ruleViolations ?? []).map(v => (
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
