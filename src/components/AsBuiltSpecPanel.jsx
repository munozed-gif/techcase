import { useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { callClaude, logEvent, notify, notifyManagers } from "../lib/utils.js";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";

// ── As-built spec update ─────────────────────────────────────────────────────
// After development and tests, regenerate the approved spec documents with what was
// actually built in SAP (blueprint objects with their final code/definitions and
// transports), the change requests made along the way (run feedback, case comments)
// and the test results (test activities). The new versions are saved in the Docs tab
// ("As-built documentation"); the originals stay as the approved baseline. Approval
// uses the same permission as the original spec and opens the "As-built spec
// approved" gate of the Approved stage.

// Which approved spec documents can be updated. SpecA and SpecD are ticked by default
// (they change during development); SpecB/SpecC are proposals.
const ASBUILT_DOCS = [
  { key: 'specA', label: 'Technical spec (Custom ABAP)', title: 'ABAP', prefix: 'SpecA_CustomABAP', def: true },
  { key: 'specD', label: 'Client functional spec',       title: 'Client Spec', prefix: 'SpecD_EspecCliente', def: true },
  { key: 'specB', label: 'SAP standard spec',            title: 'SAP', prefix: 'SpecB_StandardSAP', def: false },
  { key: 'specC', label: 'Client proposal',              title: 'Customer', prefix: 'SpecC_PropuestaCliente', def: false },
];
const cut = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n) + '\n…[truncated]' : t; };

export default function AsBuiltSpecPanel({ caseData, auth, spec, refetch, addDocument, refetchDocuments, canApprove, genModel, buildCaseDocHtml }) {
  const { settings } = useSystemSettings();
  const ab = spec?.asbuilt ?? null;
  let notesObj = {};
  try { notesObj = JSON.parse(spec?.notes ?? '{}') ?? {}; } catch { notesObj = {}; }
  const available = ASBUILT_DOCS.filter(d => String(notesObj[d.key] ?? '').trim().length > 50);
  const [picked, setPicked] = useState(() => new Set(available.filter(d => d.def).map(d => d.key)));
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (!spec || spec.status !== 'approved') return null;

  async function saveAsBuilt(value) {
    const { error: e } = await supabase.from('case_specifications')
      .update({ asbuilt: value, updated_at: new Date().toISOString() }).eq('id', spec.id);
    if (e) throw e;
    window.dispatchEvent(new CustomEvent('arena:spec-updated', { detail: { caseId: caseData.id } }));
    await refetch?.();
  }

  async function gatherContext() {
    // 1) What was built in SAP: blueprint objects, final code/definitions, transports.
    const bp = (settings['sap_blueprint'] ?? {})[caseData.id] ?? {};
    const objs = (bp.objects ?? []).map(o => [
      `### ${o.name} (${o.type}) — status: ${o.status ?? 'planned'}`,
      o.description ? `Spec: ${o.description}` : '',
      o.appliedTransport ? `Transport: ${o.appliedTransport}${o.appliedPackage ? ` · Package: ${o.appliedPackage}` : ''}` : '',
      o.generatedCode ? `Final code / definition:\n${cut(o.generatedCode, 3500)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');
    // 2) Change requests along the way.
    const runFeedback = ((settings['sap_impl_feedback'] ?? {})[caseData.id] ?? '').trim();
    const runs = (bp.runs ?? []).slice(-10).map(r =>
      `Run ${r.runNumber} (${String(r.startedAt ?? '').slice(0, 16)}): ` +
      (r.objects ?? []).map(o => `${o.name}=${o.status}`).join(', ')).join('\n');
    // 3) Tests: test activities and their outcome / adjustments.
    const { data: acts } = await supabase.from('case_activities')
      .select('title, phase, status, progress_pct, test_outcome, adjustment_notes, description')
      .eq('case_id', caseData.id).order('sort_order');
    const tests = (acts ?? [])
      .filter(a => /test|adjust/i.test(a.phase ?? '') || a.test_outcome || a.adjustment_notes)
      .map(a => `- [${a.phase ?? '—'}] ${a.title} · ${a.status ?? ''} ${a.progress_pct ?? 0}%` +
        `${a.test_outcome ? ` · outcome: ${a.test_outcome}` : ''}${a.adjustment_notes ? ` · adjustments: ${cut(a.adjustment_notes, 400)}` : ''}`)
      .join('\n');
    // 4) Case comments (latest first, non-empty).
    const { data: com } = await supabase.from('case_comments')
      .select('body, created_at').eq('case_id', caseData.id).order('created_at', { ascending: false }).limit(30);
    const comments = (com ?? []).filter(c => c.body?.trim())
      .map(c => `- ${String(c.created_at).slice(0, 10)}: ${cut(c.body.trim(), 400)}`).join('\n');
    return { objs, runFeedback, runs, tests, comments };
  }

  async function handleGenerate() {
    const docs = available.filter(d => picked.has(d.key));
    if (!docs.length) return;
    setBusy(true); setError(null);
    try {
      setProgress('Collecting what was built and tested…');
      const ctx = await gatherContext();
      const version = (ab?.version ?? 1) + 1;
      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      const saved = [];
      for (const d of docs) {
        setProgress(`Updating ${d.label}…`);
        const prompt = `You are updating an APPROVED SAP specification so it documents what was ACTUALLY BUILT ("as-built"), after development and the technical, functional and user tests.

Case: ${caseData.title} · SAP module: ${caseData.area_sap ?? 'general'}

=== APPROVED SPEC (baseline — keep its structure, headings and language) ===
${cut(notesObj[d.key], 30000)}

=== OBJECTS BUILT IN SAP (source of truth for names, types, lengths, fields, logic) ===
${ctx.objs || '(no SAP objects recorded)'}

=== CHANGES REQUESTED DURING IMPLEMENTATION ===
${ctx.runFeedback || '(none)'}
${ctx.runs ? `\nImplementation runs:\n${ctx.runs}` : ''}

=== TEST RESULTS AND ADJUSTMENTS ===
${ctx.tests || '(no test activities recorded)'}

=== CASE COMMENTS (latest first) ===
${ctx.comments || '(none)'}
${extra.trim() ? `\n=== NOTES FROM THE REVIEWER ===\n${extra.trim()}\n` : ''}
Instructions:
- Start with a section "## Changes vs. approved spec" listing every difference (object, what changed, why if known). Write "No changes" if there are none.
- Then the full updated document: same sections as the baseline, rewritten wherever the built objects, change requests or test results differ. Keep what is still correct.
- Use the exact object names, types, lengths and fields from "OBJECTS BUILT IN SAP". Do not invent objects that were not built.
- Same language as the baseline. Output Markdown only, no code fences around the whole document.`;
        const resp = await callClaude({
          model: genModel,
          system: 'You are a senior SAP functional/technical writer. You produce precise as-built documentation.',
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          max_tokens: 16000,
        });
        const md = (typeof resp === 'string' ? resp : (resp.content?.[0]?.text ?? '')).trim();
        if (md.length < 50) throw new Error(`The AI returned an empty document for ${d.label}`);
        const meta = [
          { label: 'Case', value: '#' + (caseData.id ?? '').slice(0, 8) },
          { label: 'Version', value: `v${version} · As-built` },
          { label: 'SAP area', value: caseData.area_sap ?? '—' },
          { label: 'Generated', value: new Date().toLocaleDateString() },
        ];
        const html = buildCaseDocHtml(`${d.title} — As-built v${version}`, 'SAP Consulting · As-built specification', meta, md);
        const fileName = `AsBuilt_${d.prefix}_v${version}_${safeName}_${dateStr}.html`;
        await addDocument(new File([html], fileName, { type: 'text/html' }), `[As-built] ${d.label} v${version} (auto-generated)`);
        saved.push({ key: d.key, name: d.label, file_name: fileName });
      }
      setProgress('Saving…');
      await saveAsBuilt({
        status: 'submitted', version, docs: saved, notes: extra.trim() || null,
        generated_at: new Date().toISOString(), generated_by: auth.user?.id ?? null,
        approved_by: null, approved_at: null, rejected_reason: null,
      });
      if (refetchDocuments) await refetchDocuments();
      logEvent('spec.asbuilt_generated', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { version, docs: saved.map(s => s.key) } });
      notifyManagers('As-built spec ready for review', `The as-built spec v${version} for "${caseData.title}" is waiting for approval.`, 'spec_approved').catch(() => {});
      setExtra('');
    } catch (e) {
      setError(e?.message ?? String(e));
    }
    setProgress(''); setBusy(false);
  }

  async function handleApprove() {
    setBusy(true); setError(null);
    try {
      await saveAsBuilt({ ...ab, status: 'approved', approved_by: auth.user?.id, approved_at: new Date().toISOString(), rejected_reason: null });
      logEvent('spec.asbuilt_approved', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { version: ab?.version } });
      const body = `The as-built spec v${ab?.version} for "${caseData.title}" was approved by ${auth.profile?.full_name ?? 'a manager'}.`;
      notifyManagers('As-built spec approved', body, 'spec_approved').catch(() => {});
      if (ab?.generated_by && ab.generated_by !== auth.user?.id) notify(ab.generated_by, 'As-built spec approved', body, 'spec_approved').catch(() => {});
    } catch (e) { setError(e?.message ?? String(e)); }
    setBusy(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setBusy(true); setError(null);
    try {
      await saveAsBuilt({ ...ab, status: 'rejected', rejected_reason: rejectReason.trim(), approved_by: null, approved_at: null });
      if (ab?.generated_by && ab.generated_by !== auth.user?.id) {
        notify(ab.generated_by, 'As-built spec needs changes', `"${caseData.title}": ${rejectReason.trim()}`, 'spec_approved').catch(() => {});
      }
      setRejecting(false); setRejectReason('');
    } catch (e) { setError(e?.message ?? String(e)); }
    setBusy(false);
  }

  const badge = !ab ? null
    : ab.status === 'approved' ? ['Approved', 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30']
    : ab.status === 'rejected' ? ['Changes requested', 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30']
    : ['Pending approval', 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'];

  return (
    <div className="bg-white dark:bg-gray-900/60 rounded-2xl border border-emerald-200 dark:border-emerald-500/25 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          <FileText size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 dark:text-white text-sm">As-built update</p>
            {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge[1]}`}>{badge[0]}{ab?.version ? ` · v${ab.version}` : ''}</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
            After development and the technical, functional and user tests, update the approved spec with what was actually built in SAP. Required to move the case to Approved.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {ab?.docs?.length > 0 && (
          <div className="text-xs text-gray-600 dark:text-white/60 space-y-1">
            <p>Latest version (v{ab.version}, {ab.generated_at ? new Date(ab.generated_at).toLocaleString() : ''}) — in the Docs tab under <strong>As-built documentation</strong>:</p>
            <ul className="list-disc pl-5">{ab.docs.map(d => <li key={d.file_name} className="font-mono text-[11px]">{d.file_name}</li>)}</ul>
            {ab.status === 'rejected' && ab.rejected_reason && <p className="text-red-600 dark:text-red-400">Changes requested: {ab.rejected_reason}</p>}
            {ab.status === 'approved' && ab.approved_at && <p className="text-green-700 dark:text-green-400">Approved {new Date(ab.approved_at).toLocaleString()}.</p>}
          </div>
        )}

        {ab?.status === 'submitted' && canApprove && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleApprove} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-40">
              <CheckCircle2 size={13} /> Approve as-built spec
            </button>
            <button onClick={() => setRejecting(r => !r)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
              <XCircle size={13} /> Request changes
            </button>
            {rejecting && (
              <div className="w-full flex gap-2">
                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="What should change?"
                  className="flex-1 text-xs border border-gray-200 dark:border-white/15 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                <button onClick={handleReject} disabled={!rejectReason.trim() || busy}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg disabled:opacity-40">Send</button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
            <p className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">
              {ab ? 'Generate a new version' : 'Documents to update'}
            </p>
            {available.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-white/40">No approved spec documents with content were found for this case.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {available.map(d => (
                  <label key={d.key} className="flex items-center gap-2 text-xs text-gray-700 dark:text-white/70 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                    <input type="checkbox" className="accent-emerald-600" checked={picked.has(d.key)}
                      onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(d.key) : n.delete(d.key); return n; })} />
                    {d.label}
                  </label>
                ))}
              </div>
            )}
            <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2}
              placeholder="Optional notes for the update, e.g. mention that the payment code was extended to 8 characters at the client's request"
              className="w-full text-xs border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 bg-white dark:bg-white/5 text-gray-800 dark:text-white/80 placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <p className="text-[11px] text-gray-500 dark:text-white/35">
              Uses the approved spec, the objects built in SAP (with their final code and transports), the run feedback, the test activities and the case comments. The original documents are kept unchanged.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={handleGenerate} disabled={busy || picked.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : ab ? <RotateCcw size={13} /> : <Sparkles size={13} />}
                {ab ? 'Generate new version' : 'Generate updated spec'}
              </button>
              {progress && <span className="text-xs text-gray-500 dark:text-white/50">{progress}</span>}
            </div>
            {ab?.status === 'approved' && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">A new version replaces the approved one and needs approval again.</p>
            )}
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}
      </div>
    </div>
  );
}
