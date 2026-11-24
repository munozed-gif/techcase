// Case checks shown on the Analyze node (src/lib/caseChecks.js). Blocking issues stop Analyze until
// they are fixed (remove the document, link the project) or confirmed with a reason.
import { useState, useEffect } from "react";
import { ShieldAlert, ShieldCheck, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { issueText, openIssues } from "../lib/caseChecks.js";

export function CaseChecksPanel({ issues, resolved, loading, onRecheck, onResolve, onUnresolve, onRemoveDoc, onLinkProject, needsProject, canEdit, L }) {
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState('');
  useEffect(() => {
    if (!needsProject || projects) return;
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data ?? []));
  }, [needsProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openIssues(issues, resolved);
  const blocking = open.filter(i => i.severity === 'block');
  const done = (issues ?? []).filter(i => resolved?.[i.key]);
  if (!issues) return loading ? <div className="text-xs text-gray-400 px-1">{L('Checking the case…', 'Revisando el caso…')}</div> : null;
  const tone = blocking.length ? 'border-red-200 bg-red-50/60' : open.length ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40';

  return (
    <div className={`rounded-xl border p-3 text-xs space-y-2 ${tone}`}>
      <div className="flex items-center gap-2">
        {blocking.length ? <ShieldAlert size={15} className="text-red-600" /> : <ShieldCheck size={15} className={open.length ? 'text-amber-600' : 'text-emerald-600'} />}
        <span className="font-semibold text-gray-800 flex-1">
          {blocking.length ? L(`Case checks — ${blocking.length} to resolve before Analyze`, `Revisión del caso — ${blocking.length} por resolver antes de Analizar`)
            : open.length ? L(`Case checks — ${open.length} warning${open.length === 1 ? '' : 's'}`, `Revisión del caso — ${open.length} advertencia${open.length === 1 ? '' : 's'}`)
            : L('Case checks — all good', 'Revisión del caso — todo en orden')}
        </span>
        <button onClick={onRecheck} disabled={loading} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 bg-white font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />{L('Check again', 'Revisar de nuevo')}
        </button>
      </div>
      {open.map(i => (
        <div key={i.key} className={`p-2 rounded-lg bg-white border ${i.severity === 'block' ? 'border-red-200' : 'border-amber-200'}`}>
          <div className="flex items-start gap-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${i.severity === 'block' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {i.severity === 'block' ? L('BLOCKS', 'BLOQUEA') : L('WARNING', 'AVISO')}
            </span>
            <div className="flex-1 text-gray-700">{issueText(i, L)}</div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-1">
              {i.kind === 'doc_other_case' && onRemoveDoc && (
                <button onClick={() => onRemoveDoc(i)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-200 text-red-700 hover:bg-red-50"><Trash2 size={11} />{L('Remove the document', 'Quitar el documento')}</button>
              )}
              {i.kind === 'no_project' && projects && (
                <span className="inline-flex items-center gap-1">
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} className="px-1.5 py-0.5 border border-gray-200 rounded bg-white">
                    <option value="">{L('Choose a project…', 'Elegir un proyecto…')}</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button disabled={!projectId} onClick={() => onLinkProject(projectId)} className="px-2 py-0.5 rounded bg-[#1A4B8C] text-white disabled:opacity-40">{L('Link', 'Vincular')}</button>
                </span>
              )}
              {reasonFor === i.key ? (
                <span className="inline-flex flex-1 gap-1.5 min-w-[240px]">
                  <input autoFocus value={reason} onChange={e => setReason(e.target.value)} className="flex-1 px-2 py-0.5 border border-gray-200 rounded"
                    placeholder={i.kind === 'doc_other_case' ? L('Why does it belong to this case?', '¿Por qué pertenece a este caso?') : i.kind === 'duplicate' ? L('Why is it not a duplicate?', '¿Por qué no es un duplicado?') : L('Reason', 'Motivo')} />
                  <button disabled={!reason.trim()} onClick={() => { onResolve(i.key, reason.trim()); setReasonFor(null); setReason(''); }} className="px-2 py-0.5 rounded bg-gray-800 text-white disabled:opacity-40">{L('Confirm', 'Confirmar')}</button>
                  <button onClick={() => setReasonFor(null)} className="px-2 py-0.5 rounded border border-gray-200">{L('Cancel', 'Cancelar')}</button>
                </span>
              ) : (
                <button onClick={() => { setReasonFor(i.key); setReason(''); }} className="underline text-gray-600">
                  {i.kind === 'doc_other_case' ? L('It belongs to this case', 'Pertenece a este caso') : i.kind === 'duplicate' ? L('Not a duplicate', 'No es duplicado') : i.severity === 'block' ? L('Continue anyway, with a reason', 'Continuar de todos modos, con motivo') : L('Dismiss', 'Descartar')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {done.length > 0 && (
        <div className="text-[11px] text-gray-500 space-y-0.5">
          {done.map(i => (
            <div key={i.key}>✓ {issueText(i, L)} — {resolved[i.key].reason}{resolved[i.key].name ? ` (${resolved[i.key].name})` : ''}
              {canEdit && <button onClick={() => onUnresolve(i.key)} className="ml-1 underline">{L('undo', 'deshacer')}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
