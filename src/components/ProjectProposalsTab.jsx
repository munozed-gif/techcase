// Project → Proposals tab.
// Partner owners/admins and Arena admins/managers build a customer proposal from the
// project's cases: pick cases (they move to "Proposal pending"), choose which case
// material the AI reads, set the commercial terms (hours/rates/amounts computed here),
// generate the document (spec-doc style), attach documents and send it by secure link.
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileSignature, Plus, ChevronLeft, ChevronRight, Check, Sparkles, Send, Copy, ExternalLink,
  RotateCcw, XCircle, Loader2, AlertTriangle, Paperclip, Eye, GitBranch, Clock,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { callClaude, buildEmailHtml, sendEmail, logEvent } from "../lib/utils.js";
import { costConfig, caseCurrency, fmtMoney, COMMON_CURRENCIES } from "../lib/costs.js";
import {
  PROPOSAL_STATUS_META, OPEN_PROPOSAL_STATUSES, DEFAULT_COMMERCIALS, computeTotals, investmentMarkdown,
  mergeInvestment, buildProposalHtml, htmlToText, caseHours,
} from "../lib/proposals.js";

const TERMINAL = ["completed", "cancelled", "closed", "terminated", "resolved", "approved"];
const STEPS = ["cases", "sources", "terms", "document", "send"];

function parseNotes(spec) {
  if (!spec?.notes) return {};
  try { return JSON.parse(spec.notes) ?? {}; } catch { return {}; }
}
const clip = (s, n = 6000) => { const t = String(s ?? "").trim(); return t.length > n ? t.slice(0, n) + "\n…" : t; };
const proposalLink = token => `${window.location.origin}/proposal/${token}`;

export function ProjectProposalsTab({ project, auth }) {
  const { lang } = useT();
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const ss = useSystemSettings();
  const cfg = useMemo(() => costConfig(ss.settings), [ss.settings]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [cases, setCases] = useState([]);
  const [acts, setActs] = useState({});       // caseId → activities
  const [specs, setSpecs] = useState({});     // caseId → spec row
  const [docs, setDocs] = useState({});       // caseId → documents
  const [assigned, setAssigned] = useState(new Set());
  const [customer, setCustomer] = useState(null);
  const [partner, setPartner] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ data: props, error: e1 }, { data: cs }] = await Promise.all([
        supabase.from("project_proposals").select("*").eq("project_id", project.id).order("created_at", { ascending: false }),
        supabase.from("cases").select("id, title, status, expected_seniority, area_sap, description, priority, budget, currency")
          .eq("project_id", project.id).order("created_at"),
      ]);
      if (e1) throw e1;
      const ids = (cs ?? []).map(c => c.id);
      const [{ data: a }, { data: sp }, { data: d }, { data: asg }, cust, part] = await Promise.all([
        ids.length ? supabase.from("case_activities").select("case_id, title, phase, est_hours, est_hours_manual, start_date_plan, end_date_plan, sort_order").in("case_id", ids).order("sort_order") : { data: [] },
        ids.length ? supabase.from("case_specifications").select("case_id, status, mode, content, notes").in("case_id", ids) : { data: [] },
        ids.length ? supabase.from("case_documents").select("id, case_id, file_name, file_url, file_type, notes, created_at").in("case_id", ids).order("created_at", { ascending: false }) : { data: [] },
        ids.length ? supabase.from("case_assignments").select("case_id, is_active").in("case_id", ids) : { data: [] },
        project.customer_id ? supabase.from("customers").select("id, name, contact_name, contact_email, currency").eq("id", project.customer_id).maybeSingle() : { data: null },
        project.partner_id ? supabase.from("partners").select("id, name").eq("id", project.partner_id).maybeSingle() : { data: null },
      ]);
      const group = (rows) => (rows ?? []).reduce((m, r) => { (m[r.case_id] ??= []).push(r); return m; }, {});
      setProposals(props ?? []);
      setCases(cs ?? []);
      setActs(group(a));
      setSpecs(Object.fromEntries((sp ?? []).map(s => [s.case_id, s])));
      setDocs(group(d));
      setAssigned(new Set((asg ?? []).filter(x => x.is_active !== false).map(x => x.case_id)));
      setCustomer(cust.data ?? null);
      setPartner(part.data ?? null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [project.id, project.customer_id, project.partner_id]);

  useEffect(() => { load(); }, [load]);

  async function createProposal() {
    setError(null);
    const currency = caseCurrency({ customer, project });
    const n = proposals.length + 1;
    const { data, error: e } = await supabase.from("project_proposals").insert({
      project_id: project.id, partner_id: project.partner_id ?? null, customer_id: project.customer_id ?? null,
      title: `${L("Proposal", "Propuesta")} ${project.name}${n > 1 ? ` #${n}` : ""}`,
      language: es ? "es" : "en", currency, commercials: DEFAULT_COMMERCIALS,
      recipients: customer?.contact_email ? [{ name: customer.contact_name ?? "", email: customer.contact_email }]
        : project.stakeholder_email ? [{ name: project.stakeholder_name ?? "", email: project.stakeholder_email }] : [],
    }).select().single();
    if (e) { setError(e.message); return; }
    await supabase.from("proposal_events").insert({ proposal_id: data.id, event: "created", actor_id: auth.user?.id, actor_name: auth.profile?.full_name ?? null });
    setProposals(p => [data, ...p]);
    setOpenId(data.id);
  }

  const open = proposals.find(p => p.id === openId);
  const ctx = { project, auth, cfg, cases, acts, specs, docs, assigned, customer, partner, proposals, L, es, lang, settings: ss.settings };

  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;

  if (open) {
    return (
      <ProposalEditor key={open.id} proposal={open} ctx={ctx}
        onBack={() => { setOpenId(null); load(); }}
        onChange={row => setProposals(ps => ps.map(p => (p.id === row.id ? row : p)))}
        onOpen={id => { setOpenId(id); load(); }} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><FileSignature size={17} className="text-blue-600" />{L("Proposals", "Propuestas")}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{L(
            "Build a commercial proposal for the customer from this project's cases, their specs and plans, and send it for approval.",
            "Crea una propuesta comercial para el cliente a partir de los casos del proyecto, sus specs y planes, y envíala para aprobación.")}</p>
        </div>
        <button onClick={createProposal} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2">
          <Plus size={15} />{L("New proposal", "Nueva propuesta")}
        </button>
      </div>
      {error && <Banner>{error}</Banner>}
      {proposals.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">
          {L("No proposals yet for this project.", "Aún no hay propuestas para este proyecto.")}
        </div>
      ) : (
        <div className="grid gap-3">
          {proposals.map(p => {
            const meta = PROPOSAL_STATUS_META[p.status] ?? PROPOSAL_STATUS_META.draft;
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)}
                className="text-left bg-white border border-gray-200 hover:border-blue-300 rounded-2xl p-4 flex items-center gap-4 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><FileSignature size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{p.title}</span>
                    <span className="text-xs text-gray-400">v{p.version}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta[es ? "es" : "en"]}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {p.case_ids.length} {L(p.case_ids.length === 1 ? "case" : "cases", p.case_ids.length === 1 ? "caso" : "casos")}
                    {p.sent_at ? ` · ${L("sent", "enviada")} ${new Date(p.sent_at).toLocaleDateString(es ? "es" : "en-US")}` : ""}
                    {p.decided_at ? ` · ${p.decided_by_name ?? ""} ${new Date(p.decided_at).toLocaleDateString(es ? "es" : "en-US")}` : ""}
                  </p>
                </div>
                {p.totals?.total != null && <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtMoney(p.totals.total, p.currency, lang)}</span>}
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Banner({ children, tone = "red" }) {
  const cls = tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" : tone === "blue" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-700";
  return <div className={`border rounded-xl px-3 py-2 text-sm flex items-start gap-2 ${cls}`}><AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /><div>{children}</div></div>;
}

// ─── Editor ────────────────────────────────────────────────────────────────
function ProposalEditor({ proposal, ctx, onBack, onChange, onOpen }) {
  const { project, auth, cfg, cases, acts, specs, docs, assigned, customer, partner, proposals, L, es, settings } = ctx;
  const [p, setP] = useState(proposal);
  const [step, setStep] = useState(proposal.status === "draft" ? (proposal.html ? "send" : proposal.case_ids.length ? "sources" : "cases") : "view");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set(proposal.case_ids));
  const [events, setEvents] = useState([]);
  const isDraft = p.status === "draft";
  const lang = p.language || "en";
  const pes = lang === "es";

  useEffect(() => {
    supabase.from("proposal_events").select("*").eq("proposal_id", p.id).order("created_at")
      .then(({ data }) => setEvents(data ?? []));
  }, [p.id, p.status]);

  async function save(patch) {
    const { data, error: e } = await supabase.from("project_proposals").update(patch).eq("id", p.id).select().single();
    if (e) throw e;
    setP(data); onChange(data);
    return data;
  }

  const propCases = cases.filter(c => p.case_ids.includes(c.id));
  const commercials = { ...DEFAULT_COMMERCIALS, ...(p.commercials ?? {}) };
  const totals = useMemo(() => computeTotals(propCases.map(c => ({ ...c, activities: acts[c.id] ?? [] })), commercials, cfg, p.currency),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.case_ids, p.commercials, p.currency, cfg, acts]);

  // Cases held by other open proposals
  const heldElsewhere = new Set(proposals.filter(o => o.id !== p.id && OPEN_PROPOSAL_STATUSES.includes(o.status)).flatMap(o => o.case_ids));

  async function applyCases() {
    setBusy("cases"); setError(null);
    try {
      const ids = [...selected];
      const { error: e } = await supabase.rpc("proposal_set_cases", { p_id: p.id, p_case_ids: ids });
      if (e) throw e;
      // Default sources for newly added cases: everything that exists, documents as input only.
      const src = { ...(p.sources ?? {}) };
      for (const id of ids) {
        if (src[id]) continue;
        const notes = parseNotes(specs[id]);
        src[id] = { request: true, spec: !!specs[id]?.content, specC: !!notes.specC, specD: !!notes.specD, plan: (acts[id]?.length ?? 0) > 0, docs: [], attach: [] };
      }
      for (const k of Object.keys(src)) if (!ids.includes(k)) delete src[k];
      await save({ sources: src });
      setStep("sources");
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  // ── AI input from the chosen sources ────────────────────────────────────
  async function docText(d) {
    try {
      if (/\.html?$/i.test(d.file_name) || (d.file_type ?? "").includes("html")) {
        const r = await fetch(d.file_url); return htmlToText(await r.text(), 8000);
      }
      const r = await fetch("/api/extract-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: d.file_url, fileName: d.file_name }) });
      const { text } = await r.json(); return clip(text, 8000);
    } catch { return ""; }
  }

  async function generate() {
    setBusy("generate"); setError(null);
    try {
      const blocks = [];
      for (const c of propCases) {
        const s = p.sources?.[c.id] ?? {};
        const notes = parseNotes(specs[c.id]);
        const line = totals.cases[c.id];
        const parts = [`### CASE: ${c.title}`, `SAP area: ${c.area_sap ?? "—"} · Expected seniority: ${c.expected_seniority ?? "mid"} · Standard hours: ${line?.hoursStandard ?? 0} · Arena hours: ${line?.hoursArena ?? 0}`];
        if (s.request) parts.push(`REQUEST:\n${clip(c.description, 3000)}${notes.requestSummary ? `\n\nREQUEST SUMMARY:\n${clip(typeof notes.requestSummary === "string" ? notes.requestSummary : JSON.stringify(notes.requestSummary), 3000)}` : ""}`);
        if (s.spec && specs[c.id]?.content) parts.push(`FUNCTIONAL SPECIFICATION:\n${clip(specs[c.id].content)}`);
        if (s.specC && notes.specC) parts.push(`CUSTOMER PROPOSAL SPEC (C):\n${clip(notes.specC, 4000)}`);
        if (s.specD && notes.specD) parts.push(`CLIENT SPEC (D):\n${clip(notes.specD, 4000)}`);
        if (s.plan && acts[c.id]?.length) parts.push(`ACTIVITY PLAN (phase · activity · standard h / Arena h):\n${acts[c.id].map(a => `- ${a.phase ?? ""} · ${a.title} · ${Number(a.est_hours_manual ?? a.est_hours) || 0} / ${Number(a.est_hours) || 0}`).join("\n")}`);
        for (const d of (docs[c.id] ?? []).filter(d => (s.docs ?? []).includes(d.id))) {
          const t = await docText(d);
          if (t) parts.push(`DOCUMENT "${d.file_name}":\n${t}`);
        }
        blocks.push(parts.join("\n\n"));
      }
      const langName = pes ? "Spanish" : "English";
      const H = pes
        ? ["Resumen ejecutivo", "Entendimiento de sus necesidades", "Alcance propuesto", "Enfoque y metodología", "Entregables", "Cronograma", "Equipo y seniority", "Supuestos y exclusiones", "Condiciones comerciales", "Próximos pasos"]
        : ["Executive summary", "Understanding of your needs", "Proposed scope", "Approach and methodology", "Deliverables", "Timeline", "Team and seniority", "Assumptions and exclusions", "Commercial terms", "Next steps"];
      const system = `You are a senior SAP consulting partner writing a commercial proposal for a customer. Write in ${langName}, in a confident, clear and concise business tone.
Output GitHub-flavoured markdown only (no code fences around the whole answer). Use exactly these level-2 sections, in this order:
${H.map((h, i) => `${i + 1}. ## ${h}${i === 5 ? " (from the activity plans; the proposed start date is given below)" : ""}`).join("\n")}
After "## ${H[5]}" put a line containing only [[INVESTMENT]] — the platform inserts the effort and price tables there.
Under "## ${H[2]}" add one "### " subsection per case.
Rules: never write prices, rates, amounts or hour totals yourself (they are in the investment section). Do not invent facts beyond the provided material; when something is unknown, state it as an assumption. Keep the whole document under about 1,200 words.`;
      const user = `PROPOSAL: ${p.title}
Customer: ${customer?.name ?? project.client?.full_name ?? project.stakeholder_name ?? "—"}
Project: ${project.name}${project.description ? ` — ${clip(project.description, 600)}` : ""}
Prepared by: ${partner?.name ?? "Arena Solutions"}
Proposed start date: ${commercials.startDate || "to be agreed"}
Payment terms: ${commercials.paymentTerms || "to be agreed"}
Validity: ${commercials.validDays || 30} days
Price basis: ${commercials.basis === "standard" ? "standard estimate" : "Arena estimate (AI-assisted delivery)"}, both estimates shown
${commercials.notes ? `Additional notes from the consultant: ${clip(commercials.notes, 1500)}\n` : ""}
MATERIAL PER CASE:

${blocks.join("\n\n---\n\n")}`;
      const resp = await callClaude({
        system, messages: [{ role: "user", content: user }], max_tokens: 8000,
        model: settings?.ai_model ?? "claude-haiku-5-5", feature: "proposal", projectId: project.id,
      });
      const text = (resp?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      if (!text) throw new Error(L("The AI returned no text. Try again.", "La IA no devolvió texto. Inténtalo de nuevo."));
      await saveDocument(text);
      logEvent("proposal.generated", { entityType: "project", entityId: project.id, entityName: p.title });
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  function attachmentsList() {
    return propCases.flatMap(c => (docs[c.id] ?? []).filter(d => (p.sources?.[c.id]?.attach ?? []).includes(d.id))
      .map(d => ({ doc_id: d.id, case_id: c.id, case_title: c.title, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type })));
  }

  async function saveDocument(narrative) {
    const md = mergeInvestment(narrative, investmentMarkdown(totals, commercials, lang));
    const attachments = attachmentsList();
    const validUntil = p.valid_until || new Date(Date.now() + (Number(commercials.validDays) || 30) * 86400000).toISOString().slice(0, 10);
    const dfmt = d => new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString(pes ? "es-MX" : "en-US", { year: "numeric", month: "long", day: "numeric" });
    const html = buildProposalHtml({
      lang, title: pes ? "Propuesta comercial" : "Commercial proposal", subtitle: project.name,
      eyebrow: `${partner?.name ?? "Arena"} · ${pes ? "Propuesta" : "Proposal"} v${p.version}`,
      meta: [
        { label: pes ? "Cliente" : "Customer", value: customer?.name ?? project.stakeholder_name ?? "—" },
        { label: pes ? "Casos" : "Cases", value: String(propCases.length) },
        { label: pes ? "Total" : "Total", value: fmtMoney(totals.total, p.currency, lang) },
        { label: pes ? "Fecha" : "Date", value: dfmt(new Date().toISOString().slice(0, 10)) },
        { label: pes ? "Válida hasta" : "Valid until", value: dfmt(validUntil) },
      ],
      markdown: md, attachments, preparedBy: partner?.name ?? auth.profile?.full_name ?? "", customerName: customer?.name ?? "",
    });
    await save({ content_md: md, html, attachments, totals, valid_until: validUntil });
  }

  async function send() {
    setBusy("send"); setError(null);
    try {
      const rec = (p.recipients ?? []).filter(r => /\S+@\S+\.\S+/.test(r.email ?? ""));
      if (!rec.length) throw new Error(L("Add at least one recipient email.", "Agrega al menos un correo de destinatario."));
      if (!p.html) throw new Error(L("Generate the document first.", "Primero genera el documento."));
      const row = await save({ status: "sent", sent_at: new Date().toISOString() });
      await supabase.from("proposal_events").insert({ proposal_id: p.id, event: "sent", actor_id: auth.user?.id, actor_name: auth.profile?.full_name ?? null, note: rec.map(r => r.email).join(", ") });
      const link = proposalLink(row.token);
      const from = partner?.name ?? "Arena Solutions Platform";
      for (const r of rec) {
        const html = buildEmailHtml({
          title: pes ? "Tienes una propuesta para revisar" : "You have a proposal to review",
          preheader: `${p.title} — ${fmtMoney(totals.total, p.currency, lang)}`,
          bodyHtml: pes
            ? `<p>Hola ${r.name || ""},</p><p><strong>${from}</strong> te envió la propuesta <strong>${p.title}</strong> para el proyecto <strong>${project.name}</strong>.</p><p>Total: <strong>${fmtMoney(totals.total, p.currency, lang)}</strong> · Válida hasta ${row.valid_until ?? "—"}</p><p>Puedes revisarla, descargar los anexos y aceptarla, pedir cambios o rechazarla desde el enlace.</p>`
            : `<p>Hello ${r.name || ""},</p><p><strong>${from}</strong> has sent you the proposal <strong>${p.title}</strong> for the project <strong>${project.name}</strong>.</p><p>Total: <strong>${fmtMoney(totals.total, p.currency, lang)}</strong> · Valid until ${row.valid_until ?? "—"}</p><p>From the link you can review it, download the attachments, and accept it, ask for changes or reject it.</p>`,
          ctaText: pes ? "Revisar propuesta" : "Review proposal", ctaUrl: link,
        });
        await sendEmail(r.email, `${p.title} — ${from}`, html);
      }
      logEvent("proposal.sent", { entityType: "project", entityId: project.id, entityName: p.title, metadata: { recipients: rec.map(r => r.email) } });
      setStep("view");
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  async function withdraw() {
    if (!window.confirm(L("Withdraw this proposal? Its cases go back to their previous status.", "¿Retirar esta propuesta? Sus casos vuelven a su estado anterior."))) return;
    setBusy("withdraw"); setError(null);
    const { error: e } = await supabase.rpc("proposal_withdraw", { p_id: p.id });
    if (e) setError(e.message); else { const { data } = await supabase.from("project_proposals").select("*").eq("id", p.id).single(); setP(data); onChange(data); }
    setBusy(null);
  }

  async function newVersion() {
    setBusy("version"); setError(null);
    const { data, error: e } = await supabase.rpc("proposal_new_version", { p_id: p.id });
    if (e) { setError(e.message); setBusy(null); return; }
    setBusy(null); onOpen(data);
  }

  const meta = PROPOSAL_STATUS_META[p.status] ?? PROPOSAL_STATUS_META.draft;
  const stepIdx = STEPS.indexOf(step);
  const stepLabels = {
    cases: L("1 · Cases", "1 · Casos"), sources: L("2 · Sources", "2 · Fuentes"), terms: L("3 · Commercial terms", "3 · Condiciones"),
    document: L("4 · Document", "4 · Documento"), send: L("5 · Attach & send", "5 · Anexos y envío"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ChevronLeft size={15} />{L("Proposals", "Propuestas")}</button>
        <span className="text-gray-300">/</span>
        {isDraft
          ? <input value={p.title} onChange={e => setP({ ...p, title: e.target.value })} onBlur={e => save({ title: e.target.value }).catch(err => setError(err.message))}
              className="font-semibold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-blue-500 min-w-[16rem]" />
          : <span className="font-semibold text-gray-900">{p.title}</span>}
        <span className="text-xs text-gray-400">v{p.version}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta[es ? "es" : "en"]}</span>
      </div>
      {error && <Banner>{error}</Banner>}

      {isDraft && (
        <div className="flex gap-1.5 flex-wrap">
          {STEPS.map((s, i) => {
            const reachable = i === 0 || p.case_ids.length > 0;
            return (
              <button key={s} disabled={!reachable} onClick={() => setStep(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${step === s ? "bg-blue-600 text-white border-blue-600" : i < stepIdx ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-500 border-gray-200"} disabled:opacity-40`}>
                {i < stepIdx && <Check size={11} className="inline mr-1" />}{stepLabels[s]}
              </button>
            );
          })}
        </div>
      )}

      {/* 1 · Cases */}
      {isDraft && step === "cases" && (
        <Card title={L("Which cases go into this proposal?", "¿Qué casos van en esta propuesta?")}
          hint={L("Selected cases move to “Proposal pending” and leave the Arena until the customer answers.",
            "Los casos seleccionados pasan a “Propuesta pendiente” y salen de la Arena hasta que el cliente responda.")}>
          <div className="divide-y divide-gray-100">
            {cases.map(c => {
              const h = caseHours(acts[c.id]);
              const reason = TERMINAL.includes(c.status) ? L("Finished", "Terminado")
                : assigned.has(c.id) ? L("Consultant already assigned", "Ya tiene consultor asignado")
                : heldElsewhere.has(c.id) ? L("In another open proposal", "En otra propuesta abierta") : null;
              const on = selected.has(c.id);
              return (
                <label key={c.id} className={`flex items-center gap-3 py-2.5 ${reason ? "opacity-50" : "cursor-pointer"}`}>
                  <input type="checkbox" disabled={!!reason} checked={on}
                    onChange={() => setSelected(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                    <p className="text-xs text-gray-500">{c.status.replace(/_/g, " ")} · {c.area_sap ?? "—"} · {L("spec", "spec")} {specs[c.id]?.content ? "✓" : "—"} · {L("plan", "plan")} {h.activities ? `${h.activities} ${L("activities", "actividades")}` : "—"}</p>
                  </div>
                  <div className="text-right text-xs whitespace-nowrap">
                    <div className="text-gray-500">{L("Standard", "Estándar")} <b className="text-gray-900">{h.standard} h</b></div>
                    <div className="text-blue-600">Arena <b>{h.arena} h</b></div>
                  </div>
                  {reason && <span className="text-[11px] text-gray-500 w-36 text-right">{reason}</span>}
                  {!reason && !h.activities && on && <span className="text-[11px] text-amber-600 w-36 text-right">{L("No plan: 0 hours", "Sin plan: 0 horas")}</span>}
                </label>
              );
            })}
            {cases.length === 0 && <p className="text-sm text-gray-400 py-4">{L("This project has no cases yet.", "Este proyecto aún no tiene casos.")}</p>}
          </div>
          <Footer>
            <span className="text-xs text-gray-500">{selected.size} {L("selected", "seleccionados")}</span>
            <PrimaryBtn busy={busy === "cases"} disabled={selected.size === 0} onClick={applyCases}>{L("Save cases & continue", "Guardar casos y continuar")}</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {/* 2 · Sources */}
      {isDraft && step === "sources" && (
        <Card title={L("What should the AI read for each case?", "¿Qué debe leer la IA de cada caso?")}
          hint={L("Tick the material used to write the proposal, and the documents to attach to it.", "Marca el material para redactar la propuesta y los documentos que se adjuntan.")}>
          <div className="space-y-4">
            {propCases.map(c => {
              const s = p.sources?.[c.id] ?? {};
              const notes = parseNotes(specs[c.id]);
              const setS = patch => setP(prev => ({ ...prev, sources: { ...prev.sources, [c.id]: { ...s, ...patch } } }));
              const toggleList = (key, id) => { const cur = new Set(s[key] ?? []); cur.has(id) ? cur.delete(id) : cur.add(id); setS({ [key]: [...cur] }); };
              const opts = [
                ["request", L("Request & summary", "Solicitud y resumen"), true],
                ["spec", L("Final specification", "Especificación final"), !!specs[c.id]?.content],
                ["specC", L("Spec C — customer proposal", "Spec C — propuesta al cliente"), !!notes.specC],
                ["specD", L("Spec D — client spec", "Spec D — spec cliente"), !!notes.specD],
                ["plan", L("Activity plan", "Plan de actividades"), (acts[c.id]?.length ?? 0) > 0],
              ];
              return (
                <div key={c.id} className="border border-gray-200 rounded-xl p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">{c.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {opts.map(([k, label, avail]) => (
                      <label key={k} className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${avail ? "border-gray-200 cursor-pointer" : "border-gray-100 text-gray-300"}`}>
                        <input type="checkbox" disabled={!avail} checked={!!s[k] && avail} onChange={() => setS({ [k]: !s[k] })} />{label}
                      </label>
                    ))}
                  </div>
                  {(docs[c.id]?.length ?? 0) > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{L("Case documents", "Documentos del caso")}</p>
                      <div className="divide-y divide-gray-50">
                        {docs[c.id].map(d => (
                          <div key={d.id} className="flex items-center gap-3 py-1.5 text-xs">
                            <span className="flex-1 truncate text-gray-700">{d.file_name}</span>
                            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={(s.docs ?? []).includes(d.id)} onChange={() => toggleList("docs", d.id)} /><Sparkles size={11} className="text-violet-500" />{L("AI input", "Para IA")}</label>
                            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={(s.attach ?? []).includes(d.id)} onChange={() => toggleList("attach", d.id)} /><Paperclip size={11} className="text-gray-500" />{L("Attach", "Adjuntar")}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Footer>
            <button onClick={() => setStep("cases")} className="text-sm text-gray-500">{L("Back", "Atrás")}</button>
            <PrimaryBtn busy={busy === "sources"} onClick={async () => { setBusy("sources"); try { await save({ sources: p.sources }); setStep("terms"); } catch (e) { setError(e.message); } setBusy(null); }}>{L("Continue", "Continuar")}</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {/* 3 · Commercial terms */}
      {isDraft && step === "terms" && (
        <TermsStep p={p} setP={setP} totals={totals} propCases={propCases} cfg={cfg} L={L} lang={lang}
          busy={busy === "terms"}
          onBack={() => setStep("sources")}
          onNext={async () => { setBusy("terms"); try { await save({ commercials: p.commercials, currency: p.currency, language: p.language, totals }); setStep("document"); } catch (e) { setError(e.message); } setBusy(null); }} />
      )}

      {/* 4 · Document */}
      {isDraft && step === "document" && (
        <Card title={L("Proposal document", "Documento de la propuesta")}
          hint={L("The AI writes the text from the chosen material; hours and amounts come from step 3 and are never written by the AI.",
            "La IA redacta el texto con el material elegido; horas e importes vienen del paso 3 y nunca los escribe la IA.")}>
          <div className="flex gap-2 flex-wrap mb-3">
            <PrimaryBtn busy={busy === "generate"} onClick={generate}><Sparkles size={14} />{p.content_md ? L("Regenerate with AI", "Regenerar con IA") : L("Generate with AI", "Generar con IA")}</PrimaryBtn>
            {p.html && <button onClick={() => openHtml(p.html)} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Eye size={14} />{L("Open full page", "Abrir página completa")}</button>}
          </div>
          {busy === "generate" && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{L("Reading the case material and writing the proposal… this can take a minute.", "Leyendo el material de los casos y redactando la propuesta… puede tardar un minuto.")}</p>}
          {p.content_md && (
            <div className="grid lg:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{L("Edit text (markdown)", "Editar texto (markdown)")}</p>
                <textarea value={p.content_md} onChange={e => setP({ ...p, content_md: e.target.value })}
                  className="w-full h-[520px] font-mono text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={async () => { setBusy("savedoc"); try { await saveDocument(p.content_md.replace(/## (Effort & investment|Esfuerzo e inversión)[\s\S]*?(?=\n## |$)/, "[[INVESTMENT]]\n")); } catch (e) { setError(e.message); } setBusy(null); }}
                  className="mt-2 text-sm font-semibold text-blue-600 inline-flex items-center gap-1.5">
                  {busy === "savedoc" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}{L("Apply edits to the document", "Aplicar cambios al documento")}</button>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{L("Preview", "Vista previa")}</p>
                <iframe title="proposal" srcDoc={p.html ?? ""} className="w-full h-[560px] border border-gray-200 rounded-xl bg-white" sandbox="allow-same-origin allow-popups allow-modals" />
              </div>
            </div>
          )}
          <Footer>
            <button onClick={() => setStep("terms")} className="text-sm text-gray-500">{L("Back", "Atrás")}</button>
            <PrimaryBtn disabled={!p.html} onClick={() => setStep("send")}>{L("Continue", "Continuar")}</PrimaryBtn>
          </Footer>
        </Card>
      )}

      {/* 5 · Attach & send */}
      {isDraft && step === "send" && (
        <SendStep p={p} setP={setP} save={save} L={L} lang={lang} busy={busy} setError={setError}
          attachments={attachmentsList()} totals={totals}
          onRebuild={async () => { setBusy("rebuild"); try { await saveDocument(p.content_md.replace(/## (Effort & investment|Esfuerzo e inversión)[\s\S]*?(?=\n## |$)/, "[[INVESTMENT]]\n")); } catch (e) { setError(e.message); } setBusy(null); }}
          onBack={() => setStep("document")} onSend={send} onWithdraw={withdraw} />
      )}

      {/* Sent / answered */}
      {!isDraft && (
        <ProposalStatusView p={p} events={events} L={L} es={es} lang={lang} busy={busy}
          onWithdraw={withdraw} onNewVersion={newVersion} />
      )}

      {isDraft && step !== "cases" && (
        <div className="text-right">
          <button onClick={withdraw} className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1"><XCircle size={12} />{L("Discard draft", "Descartar borrador")}</button>
        </div>
      )}
    </div>
  );
}

function openHtml(html) {
  const w = window.open("", "_blank");
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}

function Card({ title, hint, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      {hint && <p className="text-xs text-gray-500 mt-0.5 mb-4">{hint}</p>}
      {children}
    </div>
  );
}
function Footer({ children }) {
  return <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">{children}</div>;
}
function PrimaryBtn({ busy, disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={busy || disabled}
      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
      {busy && <Loader2 size={14} className="animate-spin" />}{children}
    </button>
  );
}
function Num({ label, value, onChange, suffix, step = "1" }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1 flex items-center border border-gray-200 rounded-xl overflow-hidden">
        <input type="number" step={step} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full px-3 py-2 text-sm focus:outline-none" />
        {suffix && <span className="px-2 text-xs text-gray-400">{suffix}</span>}
      </div>
    </label>
  );
}

function TermsStep({ p, setP, totals, propCases, cfg, L, lang, busy, onBack, onNext }) {
  const c = { ...DEFAULT_COMMERCIALS, ...(p.commercials ?? {}) };
  const setC = patch => setP(prev => ({ ...prev, commercials: { ...c, ...patch } }));
  const m = v => fmtMoney(v, p.currency, lang);
  return (
    <Card title={L("Commercial terms", "Condiciones comerciales")}
      hint={L("Both estimates are shown to the customer; the price basis decides which one is charged and becomes each case's budget on approval.",
        "Al cliente se le muestran ambas estimaciones; la base de precio decide cuál se cobra y se convierte en el presupuesto de cada caso al aprobar.")}>
      <div className="grid md:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Currency", "Moneda")}</span>
          <select value={p.currency} onChange={e => setP({ ...p, currency: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            {[...new Set([p.currency, ...COMMON_CURRENCIES])].map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Price basis", "Base de precio")}</span>
          <select value={c.basis} onChange={e => setC({ basis: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="arena">{L("Arena estimate", "Estimación Arena")}</option>
            <option value="standard">{L("Standard estimate", "Estimación estándar")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Rates", "Tarifas")}</span>
          <select value={c.rateMode} onChange={e => setC({ rateMode: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="seniority">{L("By seniority (Settings → Costs)", "Por seniority (Configuración → Costos)")}</option>
            <option value="custom">{L("Custom per case", "Personalizada por caso")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Document language", "Idioma del documento")}</span>
          <select value={p.language} onChange={e => setP({ ...p, language: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="en">English</option><option value="es">Español</option>
          </select>
        </label>
        <Num label={L("Contingency", "Contingencia")} suffix="%" value={c.contingencyPct} onChange={v => setC({ contingencyPct: v })} />
        <Num label={L("Discount", "Descuento")} suffix="%" value={c.discountPct} onChange={v => setC({ discountPct: v })} />
        <Num label={L("Taxes", "Impuestos")} suffix="%" value={c.taxPct} onChange={v => setC({ taxPct: v })} />
        <Num label={L("Valid for", "Vigencia")} suffix={L("days", "días")} value={c.validDays} onChange={v => setC({ validDays: v })} />
        <label className="block md:col-span-2">
          <span className="text-xs font-medium text-gray-600">{L("Payment terms", "Condiciones de pago")}</span>
          <input value={c.paymentTerms} onChange={e => setC({ paymentTerms: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Proposed start", "Inicio propuesto")}</span>
          <input type="date" value={c.startDate} onChange={e => setC({ startDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="block md:col-span-4">
          <span className="text-xs font-medium text-gray-600">{L("Notes for the AI (optional)", "Notas para la IA (opcional)")}</span>
          <textarea rows={2} value={c.notes} onChange={e => setC({ notes: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder={L("e.g. emphasise the go-live date, mention our S/4HANA experience…", "p. ej. destacar la fecha de salida, mencionar nuestra experiencia en S/4HANA…")} />
        </label>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">{L("Case", "Caso")}</th>
              <th className="py-2 pr-3 text-right">{L("Standard h", "Horas est.")}</th>
              <th className="py-2 pr-3 text-right">{L("Arena h", "Horas Arena")}</th>
              <th className="py-2 pr-3 text-right">{L("Rate / h", "Tarifa / h")}</th>
              <th className="py-2 pr-3 text-right">{L("Standard", "Estándar")}</th>
              <th className="py-2 text-right">Arena</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map(l => (
              <tr key={l.id} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-900">{l.title}<span className="text-xs text-gray-400 ml-1">· {l.seniority}</span></td>
                <td className="py-2 pr-3 text-right">{l.hoursStandard}</td>
                <td className="py-2 pr-3 text-right text-blue-600 font-medium">{l.hoursArena}</td>
                <td className="py-2 pr-3 text-right">
                  {c.rateMode === "custom"
                    ? <input type="number" value={c.rates?.[l.id] ?? l.rate} onChange={e => setC({ rates: { ...c.rates, [l.id]: e.target.value === "" ? "" : Number(e.target.value) } })}
                        className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                    : m(l.rate)}
                </td>
                <td className={`py-2 pr-3 text-right ${c.basis === "standard" ? "font-semibold text-gray-900" : "text-gray-500"}`}>{m(l.stdAmount)}</td>
                <td className={`py-2 text-right ${c.basis === "arena" ? "font-semibold text-gray-900" : "text-gray-500"}`}>{m(l.arenaAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 ml-auto max-w-xs text-sm space-y-1">
          <Row k={L("Subtotal", "Subtotal")} v={m(totals.subtotal)} />
          {!!totals.contingency && <Row k={`${L("Contingency", "Contingencia")} (${c.contingencyPct}%)`} v={m(totals.contingency)} />}
          {!!totals.discount && <Row k={`${L("Discount", "Descuento")} (${c.discountPct}%)`} v={`-${m(totals.discount)}`} />}
          {!!totals.tax && <Row k={`${L("Taxes", "Impuestos")} (${c.taxPct}%)`} v={m(totals.tax)} />}
          <Row k={<b>{L("Total", "Total")}</b>} v={<b>{m(totals.total)}</b>} />
          {totals.savings > 0 && <p className="text-xs text-emerald-600 text-right">{L("Arena saving vs standard", "Ahorro Arena vs estándar")}: {m(totals.savings)}</p>}
        </div>
      </div>
      {propCases.some(cs => !totals.cases[cs.id]?.hoursArena) && (
        <div className="mt-3"><Banner tone="amber">{L("Some cases have no activity plan, so they count 0 hours. Generate their plan in the case first.", "Algunos casos no tienen plan de actividades y suman 0 horas. Genera primero su plan en el caso.")}</Banner></div>
      )}
      <Footer>
        <button onClick={onBack} className="text-sm text-gray-500">{L("Back", "Atrás")}</button>
        <PrimaryBtn busy={busy} onClick={onNext}>{L("Continue", "Continuar")}</PrimaryBtn>
      </Footer>
    </Card>
  );
}
function Row({ k, v }) { return <div className="flex justify-between gap-4"><span className="text-gray-500">{k}</span><span className="text-gray-900">{v}</span></div>; }

function SendStep({ p, setP, save, L, lang, busy, setError, attachments, totals, onRebuild, onBack, onSend }) {
  const rec = p.recipients ?? [];
  const setRec = list => setP(prev => ({ ...prev, recipients: list }));
  const staleAttach = JSON.stringify((p.attachments ?? []).map(a => a.doc_id).sort()) !== JSON.stringify(attachments.map(a => a.doc_id).sort());
  return (
    <Card title={L("Attach & send", "Anexos y envío")}
      hint={L("The customer gets an email with a secure link: they can read the proposal, download the attachments and accept, ask for changes or reject it.",
        "El cliente recibe un correo con un enlace seguro: puede leer la propuesta, descargar los anexos y aceptarla, pedir cambios o rechazarla.")}>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{L("Recipients", "Destinatarios")}</p>
          <div className="space-y-2">
            {rec.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input value={r.name ?? ""} placeholder={L("Name", "Nombre")} onChange={e => setRec(rec.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-1/3 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input value={r.email ?? ""} placeholder="email@company.com" onChange={e => setRec(rec.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button onClick={() => setRec(rec.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><XCircle size={16} /></button>
              </div>
            ))}
            <button onClick={() => setRec([...rec, { name: "", email: "" }])} className="text-sm text-blue-600 font-semibold inline-flex items-center gap-1"><Plus size={13} />{L("Add recipient", "Agregar destinatario")}</button>
          </div>
          <label className="block mt-4">
            <span className="text-xs font-medium text-gray-600">{L("Valid until", "Válida hasta")}</span>
            <input type="date" value={p.valid_until ?? ""} onChange={e => setP({ ...p, valid_until: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </label>
          <p className="text-sm text-gray-700 mt-4">{L("Total", "Total")}: <b>{fmtMoney(totals.total, p.currency, lang)}</b></p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{L("Attachments", "Anexos")}</p>
          {attachments.length === 0
            ? <p className="text-sm text-gray-400">{L("None. Tick “Attach” on case documents in step 2.", "Ninguno. Marca “Adjuntar” en documentos del caso en el paso 2.")}</p>
            : <ul className="space-y-1">{attachments.map(a => <li key={a.doc_id} className="text-sm flex items-center gap-2"><Paperclip size={12} className="text-gray-400" /><a href={a.file_url} target="_blank" rel="noreferrer" className="text-blue-600 truncate">{a.file_name}</a><span className="text-xs text-gray-400 truncate">· {a.case_title}</span></li>)}</ul>}
          {staleAttach && <div className="mt-2"><Banner tone="amber">{L("Attachments changed since the document was built.", "Los anexos cambiaron desde que se armó el documento.")} <button onClick={onRebuild} className="underline font-semibold">{L("Rebuild document", "Reconstruir documento")}</button></Banner></div>}
          <button onClick={() => openHtml(p.html)} className="mt-4 inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Eye size={14} />{L("Preview / save as PDF", "Vista previa / guardar PDF")}</button>
        </div>
      </div>
      <Footer>
        <button onClick={onBack} className="text-sm text-gray-500">{L("Back", "Atrás")}</button>
        <div className="flex gap-2">
          <button onClick={async () => { try { await save({ recipients: p.recipients, valid_until: p.valid_until || null }); } catch (e) { setError(e.message); } }}
            className="text-sm border border-gray-200 rounded-xl px-4 py-2 text-gray-700">{L("Save draft", "Guardar borrador")}</button>
          <PrimaryBtn busy={busy === "send"} onClick={async () => { try { await save({ recipients: p.recipients, valid_until: p.valid_until || null }); await onSend(); } catch (e) { setError(e.message); } }}>
            <Send size={14} />{L("Send to customer", "Enviar al cliente")}
          </PrimaryBtn>
        </div>
      </Footer>
    </Card>
  );
}

function ProposalStatusView({ p, events, L, es, lang, busy, onWithdraw, onNewVersion }) {
  const [copied, setCopied] = useState(false);
  const link = proposalLink(p.token);
  const evLabel = e => ({
    created: L("Draft created", "Borrador creado"), sent: L("Sent", "Enviada"), viewed: L("Opened by the customer", "Abierta por el cliente"),
    accepted: L("Accepted", "Aceptada"), rejected: L("Rejected", "Rechazada"), changes_requested: L("Changes requested", "Cambios solicitados"),
    withdrawn: L("Withdrawn", "Retirada"), superseded: L("Replaced by a new version", "Reemplazada por una nueva versión"),
  }[e] ?? e);
  const open = ["sent", "viewed", "changes_requested"].includes(p.status);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {p.html
          ? <iframe title="proposal" srcDoc={p.html} className="w-full h-[640px] bg-white" sandbox="allow-same-origin allow-popups allow-modals" />
          : <p className="p-6 text-sm text-gray-400">{L("No document.", "Sin documento.")}</p>}
      </div>
      <div className="space-y-4">
        {p.status === "accepted" && <Banner tone="blue">{L("Accepted: each case got its budget and is back in Estimated, ready to be assigned.", "Aceptada: cada caso recibió su presupuesto y volvió a Estimado, listo para asignar.")}</Banner>}
        {p.status === "rejected" && <Banner tone="amber">{L("Rejected: the cases went back to their previous status.", "Rechazada: los casos volvieron a su estado anterior.")}</Banner>}
        {p.decision_note && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-semibold text-amber-800 mb-1">{p.decided_by_name}</p>
            <p className="text-amber-900 whitespace-pre-wrap">{p.decision_note}</p>
          </div>
        )}
        {p.totals?.total != null && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
            <Row k={L("Total", "Total")} v={<b>{fmtMoney(p.totals.total, p.currency, lang)}</b>} />
            <Row k={L("Valid until", "Válida hasta")} v={p.valid_until ?? "—"} />
          </div>
        )}
        {open && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{L("Customer link", "Enlace del cliente")}</p>
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600" />
              <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-gray-500 hover:text-blue-600">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
              <a href={link} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-blue-600"><ExternalLink size={15} /></a>
            </div>
          </div>
        )}
        {open && (
          <div className="flex flex-col gap-2">
            <button onClick={onNewVersion} disabled={!!busy} className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-50">
              {busy === "version" ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}{L("New version", "Nueva versión")}
            </button>
            <button onClick={onWithdraw} disabled={!!busy} className="inline-flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 hover:text-red-600 text-sm rounded-xl px-4 py-2">
              <XCircle size={14} />{L("Withdraw", "Retirar")}
            </button>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{L("History", "Historial")}</p>
          <ul className="space-y-1.5">
            {events.map(e => (
              <li key={e.id} className="text-xs flex gap-2">
                <Clock size={11} className="text-gray-300 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{evLabel(e.event)}{e.actor_name ? ` · ${e.actor_name}` : ""}<span className="text-gray-400"> · {new Date(e.created_at).toLocaleString(es ? "es" : "en-US", { dateStyle: "short", timeStyle: "short" })}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
