// Consultant sign-off before the spec goes to the customer: the conditions, who signed and when.
// The sign-off holds a fingerprint of the specs and is cleared when they change.
// A condition with mode 'warn' (Settings → Spec quality, spec_analysis_policy.signoff.conditions) is shown but does not block.
import { CheckCircle2, XCircle, PenLine, AlertTriangle } from "lucide-react";

export function SignoffPanel({ conditions, signoff, valid, canSign, onSign, onUndo, L }) {
  const allOk = conditions.every(c => c.ok || c.mode === 'warn');
  const stale = !!signoff?.at && !valid;
  const tone = valid ? 'border-emerald-200 bg-emerald-50/60' : allOk ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50';
  return (
    <div className={`mb-4 p-3 rounded-xl border text-xs space-y-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <PenLine size={14} className={valid ? 'text-emerald-600' : 'text-gray-500'} />
        <span className="font-semibold text-gray-800 flex-1">
          {valid ? L(`Signed off by ${signoff.name ?? '—'} on ${new Date(signoff.at).toLocaleString()} — ready to send`, `Firmada por ${signoff.name ?? '—'} el ${new Date(signoff.at).toLocaleString()} — lista para enviar`)
            : stale ? L('The spec changed after the sign-off — sign it off again', 'La spec cambió después de la firma — fírmela de nuevo')
            : L('Sign-off for sending to the customer', 'Firma para enviar al cliente')}
        </span>
        {canSign && !valid && (
          <button onClick={onSign} disabled={!allOk} title={!allOk ? L('Every condition must be met first', 'Primero deben cumplirse todas las condiciones') : undefined}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <PenLine size={12} />{L('Sign off', 'Firmar')}
          </button>
        )}
        {canSign && valid && <button onClick={onUndo} className="underline text-gray-600">{L('Withdraw sign-off', 'Retirar firma')}</button>}
      </div>
      {!valid && (
        <div className="space-y-1">
          {conditions.map(c => (
            <div key={c.key} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 size={13} className="text-green-500 mt-0.5 flex-shrink-0" />
                : c.mode === 'warn' ? <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                : <XCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />}
              <div><span className={c.ok ? 'text-gray-700' : c.mode === 'warn' ? 'text-gray-700' : 'text-gray-900 font-semibold'}>{c.label}</span>{c.detail && <span className="text-gray-500"> — {c.detail}</span>}{!c.ok && c.mode === 'warn' && <span className="text-amber-600"> ({L('warning, does not block', 'aviso, no bloquea')})</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
