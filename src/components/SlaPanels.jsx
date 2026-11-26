// Unified SLA screens: platform policy (Settings → Workflow → SLA), customer override (Partner →
// Customers), the case clock (Case detail) and the monitor (SLA menu). The policy shape is the
// service-plan SLA (see SlaPolicyEditor). Resolution: contract → customer → partner → platform.
import { PauseCircle as _LPauseCircle } from "lucide-react";
import { Ico } from "./Ico.jsx";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Check, Clock, AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { SlaPolicyEditor } from "./SlaPolicyEditor.jsx";
import { normalizeSla } from "../lib/servicePlans.js";
import { useT } from "../i18n/index.jsx";

const SOURCE = {
  contract: ["Service contract", "Contrato de servicio"], customer: ["Customer SLA", "SLA del cliente"],
  partner: ["Partner SLA", "SLA del partner"], platform: ["Platform SLA", "SLA de la plataforma"], default: ["Platform SLA (built-in)", "SLA de la plataforma (predeterminado)"],
};
export const sourceLabel = (s, es) => (SOURCE[s] ?? [s, s])[es ? 1 : 0];
const TYPES = [["error", "Error", "Error"], ["info", "General information", "Información general"], ["improvement", "Improvement", "Mejora"]];
const PRIOS = { critical: ["Critical", "Crítico"], high: ["High", "Alto"], normal: ["Normal", "Normal"], low: ["Low", "Bajo"] };
const fmtDue = (d, es) => d ? new Date(d).toLocaleString(es ? "es" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function dueState(due, doneAt, breached) {
  if (doneAt) return breached || new Date(doneAt) > new Date(due) ? "late" : "met";
  if (breached || (due && new Date(due) < new Date())) return "breached";
  return "running";
}
const STATE_CLS = { met: "text-green-700 bg-green-50", late: "text-red-700 bg-red-50", breached: "text-red-700 bg-red-50", running: "text-blue-700 bg-blue-50", paused: "text-gray-600 bg-gray-100" };
const isOpen = st => st === "running" || st === "paused";
const pausedNote = (t, es) => Number(t.paused_hours) > 0 ? (es ? ` (+${Number(t.paused_hours)} h en pausa)` : ` (+${Number(t.paused_hours)} h paused)`) : "";

// ── Settings → Workflow → SLA ────────────────────────────────────────────────
export function SlaSettingsPanel({ ssCtx, lang = "en" }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const catalog = ssCtx.settings["service_plans_default"] ?? null;
  const [sla, setSla] = useState(() => normalizeSla(catalog?.sla, catalog?.hoursPerDay));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [ov, setOv] = useState(null);
  useEffect(() => { setSla(normalizeSla(catalog?.sla, catalog?.hoursPerDay)); }, [catalog]);
  useEffect(() => {
    (async () => {
      const [{ data: parts }, { data: custs }, { data: ctrs }] = await Promise.all([
        supabase.from("partners").select("id, name, service_plans").not("service_plans", "is", null),
        supabase.from("customers").select("id, name, sla, partner_id").not("sla", "is", null),
        supabase.from("service_contracts").select("id, project_id, band_name, kind, status, start_date, end_date, sla, project:project_id(name)").eq("status", "active"),
      ]);
      setOv({ partners: (parts ?? []).filter(p => p.service_plans?.sla), customers: custs ?? [], contracts: ctrs ?? [] });
    })();
  }, []);

  async function save() {
    setBusy(true); setOk(false);
    await ssCtx.setSetting("service_plans_default", { ...(catalog ?? {}), sla });
    setBusy(false); setOk(true);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-base font-bold text-gray-900">{L("Service level agreement", "Acuerdo de nivel de servicio")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {L("One SLA for the whole platform. A case is timed with the most specific SLA: its project's active service contract → the customer's SLA → the partner's SLA (Partner → Service plans) → this platform SLA. The same table appears in service-plan proposals.",
             "Un solo SLA para toda la plataforma. Cada caso se mide con el SLA más específico: contrato de servicio activo del proyecto → SLA del cliente → SLA del partner (Partner → Planes de servicio) → este SLA de la plataforma. La misma tabla aparece en las propuestas de planes de servicio.")}
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <SlaPolicyEditor value={sla} onChange={v => { setSla(v); setOk(false); }} lang={lang} />
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{L("Save platform SLA", "Guardar SLA de la plataforma")}
          </button>
          {ok && <span className="text-xs text-green-700">{L("Saved. Running case clocks were re-timed.", "Guardado. Los relojes de los casos en curso se recalcularon.")}</span>}
        </div>
        <p className="text-[11px] text-gray-400">
          {L("Cases are timed when they have an SLA type: tickets start as Error; cases of a project with an active service contract start as General information; anyone managing the case can change it in the case.",
             "Un caso se mide cuando tiene tipo de SLA: los tickets empiezan como Error; los casos de un proyecto con contrato de servicio activo, como Información general; quien gestiona el caso puede cambiarlo en el caso.")}
        </p>
      </div>

      <SlaAlertsCard ssCtx={ssCtx} lang={lang} />

      <div className="grid md:grid-cols-3 gap-4">
        {[[L("Partners with their own SLA", "Partners con SLA propio"), ov?.partners.map(p => p.name)],
          [L("Customers with their own SLA", "Clientes con SLA propio"), ov?.customers.map(c => c.name)],
          [L("Active service contracts", "Contratos de servicio activos"), ov?.contracts.map(k => `${k.project?.name ?? "—"} · ${k.band_name ?? k.kind}`)]].map(([t, list]) => (
          <div key={t} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t}</div>
            {!list ? <Loader2 size={14} className="animate-spin text-gray-300" /> : list.length === 0
              ? <div className="text-xs text-gray-400">{L("None — they use the platform SLA.", "Ninguno — usan el SLA de la plataforma.")}</div>
              : <ul className="text-xs text-gray-700 space-y-1">{list.map((x, i) => <li key={i} className="truncate">• {x}</li>)}</ul>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Partner → Customers: customer override ──────────────────────────────────
export function CustomerSlaModal({ customer, lang = "en", canManage, onClose, onSaved }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [eff, setEff] = useState(null);
  const [custom, setCustom] = useState(!!customer.sla);
  const [sla, setSla] = useState(customer.sla ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    supabase.rpc("sla_effective", { p_customer: customer.id }).then(({ data }) => {
      setEff(data);
      if (!customer.sla) setSla(data?.policy ?? null);
    });
  }, [customer.id, customer.sla]);

  async function save() {
    setBusy(true); setError(null);
    const { error: e } = await supabase.from("customers").update({ sla: custom ? normalizeSla(sla) : null }).eq("id", customer.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onSaved?.();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={17} className="text-blue-600" />SLA — {customer.name}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setCustom(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${!custom ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{L("Use the partner / platform SLA", "Usar el SLA del partner / plataforma")}</button>
            <button onClick={() => setCustom(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${custom ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{L("Own SLA for this customer", "SLA propio para este cliente")}</button>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {custom ? L("Applies to this customer's cases unless a project has an active service contract (the contract's SLA wins).", "Aplica a los casos de este cliente salvo que el proyecto tenga un contrato de servicio activo (gana el SLA del contrato).")
                  : `${L("In use", "En uso")}: ${eff ? sourceLabel(eff.source, es) : "…"}`}
        </p>
        {!eff && !customer.sla ? <Loader2 className="animate-spin text-gray-300" /> :
          <SlaPolicyEditor value={sla} onChange={setSla} lang={lang} readOnly={!custom || !canManage} />}
        {error && <div className="text-xs text-red-600">{error}</div>}
        {canManage && (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Cancel", "Cancelar")}</button>
            <button onClick={save} disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}{L("Save", "Guardar")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Case detail: the clock ──────────────────────────────────────────────────
export function CaseSlaPanel({ caseId, lang = "en", canEdit = true, refreshKey }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [t, setT] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("sla_for_case", { p_case: caseId });
    setT(data ?? null);
  }, [caseId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function setType(v) {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("sla_set_case_type", { p_case: caseId, p_type: v || null });
    setBusy(false);
    if (e) setError(e.message); else load();
  }

  if (t === undefined) return null;
  const active = t && t.status !== "off";
  const typeSel = canEdit && (
    <select value={active ? t.sla_type ?? "" : ""} disabled={busy} onChange={e => setType(e.target.value)}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
      <option value="">{L("No SLA", "Sin SLA")}</option>
      {TYPES.map(([k, en, sp]) => <option key={k} value={k}>{es ? sp : en}</option>)}
    </select>
  );
  if (!active) {
    if (!canEdit) return null;
    return <div className="flex items-center gap-2 text-xs text-gray-500"><ShieldCheck size={13} />SLA: {typeSel}</div>;
  }
  const paused = t.status === "paused";
  const r = paused && !t.first_response_at ? "paused" : dueState(t.response_due, t.first_response_at, t.first_response_breached);
  const s = t.status === "cancelled" ? "met" : paused ? "paused" : dueState(t.resolution_due, t.resolved_at, t.resolution_breached);
  const lbl = st => ({ met: L("met", "cumplido"), late: L("late", "tarde"), breached: L("breached", "incumplido"), running: L("due", "vence"), paused: L("paused · due was", "en pausa · vencía") }[st]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-1 font-semibold text-gray-700"><ShieldCheck size={13} className="text-blue-600" />SLA</span>
      {typeSel || <span className="text-gray-600">{TYPES.find(x => x[0] === t.sla_type)?.[es ? 2 : 1] ?? t.sla_type}</span>}
      <span className="text-gray-400">· {(PRIOS[t.priority] ?? [t.priority, t.priority])[es ? 1 : 0]} · {sourceLabel(t.source, es)}</span>
      <span className={`px-2 py-0.5 rounded-full font-semibold ${STATE_CLS[r]}`} title={`${t.response_hours} h`}>
        {L("Response", "Respuesta")} {lbl(r)} {["running", "breached", "paused"].includes(r) ? fmtDue(t.response_due, es) : fmtDue(t.first_response_at, es)}
      </span>
      <span className={`px-2 py-0.5 rounded-full font-semibold ${STATE_CLS[s]}`} title={`${t.resolution_hours} h`}>
        {L("Solution", "Solución")} {t.status === "cancelled" ? L("stopped", "detenido") : `${lbl(s)} ${["running", "breached", "paused"].includes(s) ? fmtDue(t.resolution_due, es) : fmtDue(t.resolved_at, es)}`}{pausedNote(t, es)}
      </span>
      {paused && <span className="px-2 py-0.5 rounded-full font-semibold text-gray-600 bg-gray-100 inline-flex items-center"><Ico i={_LPauseCircle} />{L("Clock paused since", "Reloj en pausa desde")} {fmtDue(t.paused_at, es)}</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

// ── SLA menu: monitor ───────────────────────────────────────────────────────
export function SlaMonitor({ lang: langProp, onOpenCase }) {
  const { lang: ctxLang } = useT();
  const lang = langProp ?? ctxLang;
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    await supabase.rpc("sla_check_breaches");
    const { data } = await supabase.rpc("sla_monitor");
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 120000); return () => clearInterval(id); }, [load]);

  const stats = useMemo(() => {
    const r = rows ?? [];
    const open = r.filter(x => isOpen(x.status));
    const closed = r.filter(x => x.status === "met" || x.status === "breached");
    const byCust = {};
    for (const x of closed) {
      const k = x.customer ?? "—";
      byCust[k] = byCust[k] ?? { met: 0, total: 0 };
      byCust[k].total += 1; if (x.status === "met") byCust[k].met += 1;
    }
    const soon = open.filter(x => x.status === "running" && !x.resolution_breached && new Date(x.resolution_due) - new Date() < 4 * 3600e3 && new Date(x.resolution_due) > new Date()).length;
    return {
      open: open.length, breached: open.filter(x => x.response_breached || x.resolution_breached).length, soon,
      compliance: closed.length ? Math.round(closed.filter(x => x.status === "met").length * 100 / closed.length) : null, byCust,
    };
  }, [rows]);

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300" /></div>;
  const list = rows.filter(x => (filter === "open" ? isOpen(x.status) : filter === "paused" ? x.status === "paused" : filter === "breached" ? (x.response_breached || x.resolution_breached || x.status === "breached") : filter === "closed" ? !isOpen(x.status) : true))
    .filter(x => !q || `${x.title} ${x.customer ?? ""} ${x.project?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{L("SLA monitor", "Monitor de SLA")}</h1>
        <p className="text-sm text-gray-500 mt-1">{L("Response and solution clocks of every case with an SLA (business hours). The SLA itself is set in Settings → Workflow → SLA, per partner, per customer or by the service contract.",
          "Relojes de respuesta y solución de cada caso con SLA (horas laborales). El SLA se define en Ajustes → Flujo → SLA, por partner, por cliente o por el contrato de servicio.")}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[[L("Open clocks", "Relojes abiertos"), stats.open, "text-blue-600", Clock], [L("Breached (open)", "Incumplidos (abiertos)"), stats.breached, "text-red-600", AlertTriangle],
          [L("Due in < 4 h", "Vencen en < 4 h"), stats.soon, "text-amber-600", Clock], [L("Compliance (closed)", "Cumplimiento (cerrados)"), stats.compliance == null ? "—" : `${stats.compliance}%`, "text-green-600", CheckCircle2]].map(([l, v, c, Icon]) => (
          <div key={l} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm"><div className="text-xs text-gray-500 flex items-center gap-1"><Icon size={12} />{l}</div><div className={`text-xl font-black ${c}`}>{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[["open", L("Open", "Abiertos")], ["paused", L("Paused", "En pausa")], ["breached", L("Breached", "Incumplidos")], ["closed", L("Closed", "Cerrados")], ["all", L("All", "Todos")]].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={L("Search case, customer, project", "Buscar caso, cliente, proyecto")} className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 min-w-[200px]" />
      </div>
      {list.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">{L("No cases here. Cases get an SLA clock when they have an SLA type (tickets and cases under a service contract get one automatically).", "No hay casos aquí. Un caso tiene reloj de SLA cuando tiene tipo de SLA (los tickets y los casos bajo contrato de servicio lo reciben automáticamente).")}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2.5">{L("Case", "Caso")}</th><th className="text-left px-4 py-2.5">{L("Customer", "Cliente")}</th>
              <th className="text-left px-4 py-2.5">{L("Type · priority", "Tipo · prioridad")}</th><th className="text-left px-4 py-2.5">{L("First response", "Primera respuesta")}</th>
              <th className="text-left px-4 py-2.5">{L("Solution", "Solución")}</th><th className="text-left px-4 py-2.5">{L("SLA from", "SLA de")}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(x => {
                const r = x.status === "paused" && !x.first_response_at ? "paused" : dueState(x.response_due, x.first_response_at, x.response_breached);
                const s = x.status === "cancelled" ? "met" : x.status === "paused" ? "paused" : dueState(x.resolution_due, x.resolved_at, x.resolution_breached);
                return (
                  <tr key={x.case_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenCase?.(x.case_id)}>
                    <td className="px-4 py-2.5"><div className="font-medium text-gray-900">{x.title}</div><div className="text-[11px] text-gray-400">{x.project?.name ?? ""} · {x.case_status}</div></td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{x.customer ?? "—"}{x.partner ? <div className="text-gray-400">{x.partner}</div> : null}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{TYPES.find(t => t[0] === x.sla_type)?.[es ? 2 : 1] ?? x.sla_type} · {(PRIOS[x.priority] ?? [x.priority, x.priority])[es ? 1 : 0]}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATE_CLS[r]}`}>{fmtDue(x.first_response_at ?? x.response_due, es)}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATE_CLS[s]}`}>{x.status === "cancelled" ? L("stopped", "detenido") : `${x.status === "paused" ? "‖ " : ""}${fmtDue(x.resolved_at ?? x.resolution_due, es)}${pausedNote(x, es)}`}</span></td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{sourceLabel(x.source, es)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(stats.byCust).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{L("Compliance by customer (closed cases)", "Cumplimiento por cliente (casos cerrados)")}</div>
          <div className="space-y-1.5">
            {Object.entries(stats.byCust).map(([k, v]) => {
              const pct = Math.round(v.met * 100 / v.total);
              return (
                <div key={k} className="flex items-center gap-3 text-xs">
                  <span className="w-48 truncate text-gray-700">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pct >= 90 ? "bg-green-500" : pct >= 75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} /></div>
                  <span className="w-20 text-right text-gray-600">{pct}% ({v.met}/{v.total})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only effective SLA (client profile, contract card) ─────────────────
export function EffectiveSlaCard({ lang = "en", customerId, projectId, clientUserId, policy, source }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [eff, setEff] = useState(policy ? { policy, source } : undefined);
  useEffect(() => {
    if (policy) { setEff({ policy, source }); return; }
    supabase.rpc("sla_effective", { p_customer: customerId ?? null, p_project: projectId ?? null, p_client_user: clientUserId ?? null })
      .then(({ data }) => setEff(data ?? null));
  }, [customerId, projectId, clientUserId, policy, source]);
  if (eff === undefined) return <Loader2 className="animate-spin text-gray-300" />;
  if (!eff) return <p className="text-sm text-gray-400">{L("No SLA available.", "No hay SLA disponible.")}</p>;
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{L("Source", "Origen")}: <b className="text-gray-700">{sourceLabel(eff.source, es)}</b></div>
      <SlaPolicyEditor value={eff.policy} lang={lang} readOnly />
    </div>
  );
}

// ── Settings: automatic alerts (server-side schedule) ───────────────────────
const FREQS = [1, 5, 10, 15, 30, 60];
function SlaAlertsCard({ ssCtx, lang = "en" }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const cfg = { enabled: true, interval_minutes: 5, ...(ssCtx.settings["sla_alerts"] ?? {}) };
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadStatus = useCallback(async () => {
    const { data } = await supabase.rpc("sla_schedule_status");
    setStatus(data ?? null);
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  async function save(patch) {
    setBusy(true);
    await ssCtx.setSetting("sla_alerts", { ...cfg, ...patch });
    setBusy(false);
    loadStatus();
  }
  const last = status?.runs?.[0];
  const fmt = d => d ? new Date(d).toLocaleString(es ? "es" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-start gap-4">
        <button onClick={() => save({ enabled: !cfg.enabled })} disabled={busy} role="switch" aria-checked={cfg.enabled}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${cfg.enabled ? "bg-blue-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-5" : ""}`} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-800">{L("Automatic SLA alerts", "Alertas automáticas de SLA")}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {L("The server checks every SLA clock on this schedule and sends “at risk” (80%) and “breached” notifications, even when nobody is signed in. Turned off, no alerts are sent (the SLA monitor still shows the clocks).",
               "El servidor revisa todos los relojes de SLA con esta frecuencia y envía avisos de “en riesgo” (80%) e “incumplido”, aunque nadie haya iniciado sesión. Desactivado, no se envían avisos (el monitor de SLA sigue mostrando los relojes).")}
          </div>
          {cfg.enabled && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-gray-600">{L("Check every", "Revisar cada")}</span>
              <select value={cfg.interval_minutes} disabled={busy} onChange={e => save({ interval_minutes: Number(e.target.value) })}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                {FREQS.map(m => <option key={m} value={m}>{m === 60 ? L("1 hour", "1 hora") : `${m} ${L(m === 1 ? "minute" : "minutes", m === 1 ? "minuto" : "minutos")}`}</option>)}
              </select>
              {busy && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>
          )}
        </div>
      </div>
      {cfg.enabled && <SlaEmailSettings cfg={cfg} save={save} busy={busy} lang={lang} />}
      <div className="text-[11px] text-gray-500 border-t border-gray-50 pt-2">
        {status == null ? L("Schedule status unavailable.", "Estado de la programación no disponible.")
          : !status.scheduled ? L("Not scheduled.", "No programado.")
          : <>{L("Scheduled", "Programado")} ({status.schedule}) · {L("last run", "última ejecución")}: {last ? `${fmt(last.start)} — ${last.status}${last.status !== "succeeded" && last.message ? ` (${last.message})` : ""}` : L("not yet", "aún no")}</>}
      </div>
    </div>
  );
}

// Email part of the automatic alerts (queued in email_outbox, sent by send-queued-emails).
function SlaEmailSettings({ cfg, save, busy, lang = "en" }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const emailOn = cfg.email_enabled !== false;
  const events = cfg.email_events ?? ["at_risk", "breached"];
  const [log, setLog] = useState(null);
  useEffect(() => { supabase.rpc("sla_email_log", { p_limit: 8 }).then(({ data }) => setLog(Array.isArray(data) ? data : [])); }, [cfg]);
  const toggleEvent = ev => save({ email_events: events.includes(ev) ? events.filter(x => x !== ev) : [...events, ev] });
  const pill = st => ({ sent: "bg-green-100 text-green-700", pending: "bg-gray-100 text-gray-600", sending: "bg-blue-100 text-blue-700", failed: "bg-red-100 text-red-700", skipped: "bg-gray-100 text-gray-500" }[st] ?? "bg-gray-100 text-gray-600");
  return (
    <div className="border-t border-gray-50 pt-3 space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <input type="checkbox" checked={emailOn} disabled={busy} onChange={e => save({ email_enabled: e.target.checked })} />
        {L("Also send email", "Enviar también por correo")}
      </label>
      {emailOn && (
        <div className="pl-6 space-y-2">
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            {[["at_risk", L("At risk (80%)", "En riesgo (80%)")], ["breached", L("Breached", "Incumplido")]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={events.includes(k)} disabled={busy} onChange={() => toggleEvent(k)} />{l}</label>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{L("Same recipients as the in-app alerts, in each person's language. Each person can turn SLA emails off in Notifications → preferences.",
            "Mismos destinatarios que los avisos en la app, en el idioma de cada persona. Cada uno puede desactivar los correos de SLA en Notificaciones → preferencias.")}</p>
          {log && log.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-500">{L("Latest emails", "Últimos correos")}</div>
              {log.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${pill(m.status)}`}>{m.status}</span>
                  <span className="text-gray-500 truncate flex-1" title={m.error ?? ""}>{m.to} · {m.subject}</span>
                  <span className="text-gray-400 whitespace-nowrap">{new Date(m.sent_at ?? m.created_at).toLocaleString(es ? "es" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
