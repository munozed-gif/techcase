// Headhunter proposes a candidate to a case; the candidate confirms each submission; only then the
// application reaches the customer (credited to that headhunter).
import { useState, useEffect, useCallback } from "react";
import { Loader2, Send, X, Undo2, Percent } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { buildEmailHtml, sendEmailToUser } from "../lib/utils.js";

/** Headhunter: propose a candidate (pick the case, or pick the candidate when the case is given). */
export function SubmitCandidateModal({ lang, userId, candidate, candidates = [], caseData, onClose, onDone }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(caseData?.id ?? "");
  const [candId, setCandId] = useState(candidate?.id ?? "");
  const cand = candidate ?? candidates.find(c => c.id === candId);
  const prof = cand ? (Array.isArray(cand.consultant_profiles) ? cand.consultant_profiles[0] : cand.consultant_profiles) : null;
  const [rate, setRate] = useState(prof?.hourly_rate ?? "");
  const [commit, setCommit] = useState("100");
  const [start, setStart] = useState("");
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (prof?.hourly_rate != null) setRate(prof.hourly_rate); }, [candId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (caseData) return;
    supabase.from("cases").select("id, title, status, area_sap, is_head_hunter, head_hunter_id")
      .in("status", ["open", "estimated"]).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setCases((data ?? []).filter(c => !c.is_head_hunter || c.head_hunter_id === userId)));
  }, [caseData, userId]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase.rpc("hh_submit_candidate", {
        p_case: caseId, p_consultant: candId, p_rate: rate === "" ? null : Number(rate),
        p_time_commitment: commit || null, p_avail_type: null, p_start_date: start || null, p_cover_letter: pitch || null,
      });
      if (e) throw e;
      const title = data.case_title ?? "";
      await sendEmailToUser(candId, es ? `Confirma tu postulación — ${title}` : `Confirm your application — ${title}`, buildEmailHtml({
        title: es ? "Confirma tu postulación" : "Confirm your application",
        bodyHtml: es
          ? `<p style="margin:0 0 12px;color:#cbd5e1"><strong>${data.headhunter_name ?? "Tu headhunter"}</strong> quiere proponerte para <strong>${title}</strong>.</p><p style="margin:0;color:#94a3b8">Entra a la plataforma (Perfil → Equipos → Headhunters) para revisar el caso, la tarifa y la presentación, y confirmar o rechazar. Nada se envía al cliente sin tu confirmación.</p>`
          : `<p style="margin:0 0 12px;color:#cbd5e1"><strong>${data.headhunter_name ?? "Your headhunter"}</strong> wants to propose you for <strong>${title}</strong>.</p><p style="margin:0;color:#94a3b8">Open the platform (Profile → Teams → Headhunters) to review the case, the rate and the presentation, and confirm or decline. Nothing reaches the customer without your confirmation.</p>`,
        ctaText: es ? "Revisar y confirmar" : "Review and confirm", ctaUrl: window.location.origin,
      }), "headhunter");
      onDone?.(L(`Proposal sent to ${cand?.full_name ?? "the candidate"} for confirmation.`, `Propuesta enviada a ${cand?.full_name ?? "el candidato"} para su confirmación.`));
      onClose();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const inp = "mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Send size={16} className="text-violet-600" />{L("Propose a candidate", "Proponer candidato")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {caseData
            ? <p className="text-sm text-gray-700">{L("Case", "Caso")}: <b>{caseData.title}</b></p>
            : <label className="block"><span className="text-xs font-medium text-gray-600">{L("Case", "Caso")} *</span>
                <select value={caseId} onChange={e => setCaseId(e.target.value)} className={inp + " bg-white"}>
                  <option value="">{L("Choose an open case…", "Elige un caso abierto…")}</option>
                  {cases.map(c => <option key={c.id} value={c.id}>{c.title}{c.area_sap ? ` · ${c.area_sap}` : ""}</option>)}
                </select></label>}
          {candidate
            ? <p className="text-sm text-gray-700">{L("Candidate", "Candidato")}: <b>{candidate.full_name}</b></p>
            : <label className="block"><span className="text-xs font-medium text-gray-600">{L("Candidate", "Candidato")} *</span>
                <select value={candId} onChange={e => setCandId(e.target.value)} className={inp + " bg-white"}>
                  <option value="">{L("Choose one of your candidates…", "Elige uno de tus candidatos…")}</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select></label>}
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs font-medium text-gray-600">{L("Rate / hour", "Tarifa / hora")}</span>
              <input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} className={inp} /></label>
            <label className="block"><span className="text-xs font-medium text-gray-600">{L("Dedication %", "Dedicación %")}</span>
              <input type="number" min="5" max="100" step="5" value={commit} onChange={e => setCommit(e.target.value)} className={inp} /></label>
            <label className="block"><span className="text-xs font-medium text-gray-600">{L("Can start", "Puede iniciar")}</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inp} /></label>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">{L("The customer sees the candidate's own rate; your commission is not added to it.", "El cliente ve la tarifa del candidato; tu comisión no se suma.")}</p>
          <label className="block"><span className="text-xs font-medium text-gray-600">{L("Presentation of the candidate", "Presentación del candidato")}</span>
            <textarea rows={5} value={pitch} onChange={e => setPitch(e.target.value)} className={inp}
              placeholder={L("Why this candidate fits: experience, modules, similar projects…", "Por qué encaja: experiencia, módulos, proyectos similares…")} /></label>
          <p className="text-[11px] text-gray-500">{L("The candidate must confirm before the application reaches the customer.", "El candidato debe confirmar antes de que la postulación llegue al cliente.")}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">{L("Cancel", "Cancelar")}</button>
          <button onClick={submit} disabled={busy || !caseId || !candId} className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{L("Send for confirmation", "Enviar para confirmación")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Headhunter: proposals sent, with status and withdraw. */
export function MySubmissionsList({ lang, nonce }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc("hh_my_submissions"); setRows(Array.isArray(data) ? data : []); }, []);
  useEffect(() => { load(); }, [load, nonce]);
  if (!rows || rows.length === 0) return null;
  async function withdraw(id) {
    if (!window.confirm(L("Withdraw this proposal?", "¿Retirar esta propuesta?"))) return;
    setBusy(id); setMsg(null);
    const { error } = await supabase.rpc("hh_submission_withdraw", { p_id: id });
    if (error) setMsg(error.message); else await load();
    setBusy(null);
  }
  const label = r => {
    if (r.status === "awaiting_candidate") return [L("Waiting for the candidate", "Esperando al candidato"), "bg-amber-50 text-amber-700"];
    if (r.status === "declined") return [L("Declined by the candidate", "Rechazada por el candidato"), "bg-red-50 text-red-600"];
    if (r.status === "withdrawn") return [L("Withdrawn", "Retirada"), "bg-gray-100 text-gray-500"];
    const a = r.application?.status;
    if (a === "accepted") return [L("Placed", "Colocado"), "bg-emerald-50 text-emerald-700"];
    if (a === "rejected") return [L("Not selected", "No seleccionado"), "bg-red-50 text-red-600"];
    if (a === "withdrawn") return [L("Withdrawn", "Retirada"), "bg-gray-100 text-gray-500"];
    return [L("With the customer", "Con el cliente"), "bg-blue-50 text-blue-700"];
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Proposals sent", "Propuestas enviadas")}</p>
      <div className="divide-y divide-gray-50">
        {rows.map(r => {
          const [lbl, cls] = label(r);
          const canWithdraw = r.status === "awaiting_candidate" || (r.status === "confirmed" && r.application?.status === "pending" && !r.application?.reviewed_at);
          return (
            <div key={r.id} className="flex items-center gap-3 py-2 text-sm flex-wrap">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{r.consultant?.full_name}</span>
                <span className="text-gray-400"> → </span><span className="text-gray-700">{r.case?.title}</span>
                <span className="block text-[11px] text-gray-400">{new Date(r.created_at).toLocaleDateString(es ? "es" : "en-US")}{r.commission_pct != null ? ` · ${L("commission", "comisión")} ${r.commission_pct}%` : ""}{r.decline_note ? ` · “${r.decline_note}”` : ""}</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
              {canWithdraw && <button onClick={() => withdraw(r.id)} disabled={busy === r.id} className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1 disabled:opacity-50"><Undo2 size={11} />{L("Withdraw", "Retirar")}</button>}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-xs text-red-600 mt-2">{msg}</p>}
    </div>
  );
}

/** Headhunter: default commission % (used when there is no accepted headhunter proposal on the case). */
export function DefaultCommissionField({ lang, userId }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [v, setV] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    supabase.from("users").select("hh_default_commission_pct").eq("id", userId).maybeSingle()
      .then(({ data }) => setV(data?.hh_default_commission_pct ?? ""));
  }, [userId]);
  async function save() {
    const { error } = await supabase.rpc("hh_set_default_commission", { p_pct: v === "" ? null : Number(v) });
    if (error) alert(error.message); else { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  }
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <Percent size={13} className="text-violet-500" />{L("Default commission", "Comisión por defecto")}
      <input type="number" min="0" max="100" step="0.5" value={v} onChange={e => setV(e.target.value)} onBlur={save}
        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right" />%
      {saved && <span className="text-emerald-600">✓</span>}
    </div>
  );
}

/** Consultant: proposals awaiting my confirmation. */
export function SubmissionsToConfirm({ lang, onChanged }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc("hh_submissions_to_confirm"); setRows(Array.isArray(data) ? data : []); }, []);
  useEffect(() => { load(); }, [load]);
  if (rows.length === 0) return null;
  async function respond(id, accept) {
    let note = null;
    if (!accept) { note = window.prompt(L("Optional: tell your headhunter why", "Opcional: dile a tu headhunter por qué")) ?? null; }
    setBusy(id); setMsg(null);
    const { error } = await supabase.rpc("hh_submission_respond", { p_id: id, p_accept: accept, p_note: note });
    if (error) setMsg(error.message);
    else { setMsg(accept ? L("Confirmed — your application is now with the customer.", "Confirmada — tu postulación ya está con el cliente.") : L("Declined.", "Rechazada.")); await load(); onChanged?.(); }
    setBusy(null);
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">{L("Applications to confirm", "Postulaciones por confirmar")}</p>
      {rows.map(r => (
        <div key={r.id} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-sm text-gray-900"><b>{r.headhunter_name}</b> {L("wants to propose you for", "quiere proponerte para")} <b>{r.case?.title}</b>{r.case?.area_sap ? ` · ${r.case.area_sap}` : ""}</p>
          <p className="text-xs text-gray-600 mt-1">
            {r.proposed_rate != null ? `${L("Rate", "Tarifa")} ${r.proposed_rate}/h` : ""}{r.time_commitment ? ` · ${L("dedication", "dedicación")} ${r.time_commitment}%` : ""}{r.start_date ? ` · ${L("start", "inicio")} ${r.start_date}` : ""}
          </p>
          {r.case?.description && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{r.case.description}</p>}
          {r.cover_letter && <p className="text-xs text-gray-700 italic mt-1 whitespace-pre-wrap">“{r.cover_letter}”</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => respond(r.id, true)} disabled={busy === r.id} className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">{L("Confirm and apply", "Confirmar y postular")}</button>
            <button onClick={() => respond(r.id, false)} disabled={busy === r.id} className="text-xs font-semibold text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-1.5 disabled:opacity-50">{L("Decline", "Rechazar")}</button>
          </div>
        </div>
      ))}
      {msg && <p className="text-xs text-gray-700">{msg}</p>}
    </div>
  );
}
