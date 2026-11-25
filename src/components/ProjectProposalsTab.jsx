// Project → Proposals tab.
// Partner owners/admins and Arena admins/managers build a customer proposal from the
// project's cases: pick cases (they move to "Proposal pending"), choose which case
// material the AI reads, set the commercial terms (hours/rates/amounts computed here),
// generate the document (spec-doc style), attach documents and send it by secure link.
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileSignature, Plus, ChevronLeft, ChevronRight, Check, Sparkles, Send, Copy, ExternalLink,
  RotateCcw, XCircle, Loader2, AlertTriangle, Paperclip, Eye, GitBranch, Clock, Presentation, Printer,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { docLinkClick } from "../lib/openDoc.js";
import { useT } from "../i18n/index.jsx";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { callClaude, buildEmailHtml, sendEmail, logEvent } from "../lib/utils.js";
import { costConfig, caseCurrency, fmtMoney, COMMON_CURRENCIES, fromUsd } from "../lib/costs.js";
import {
  PROPOSAL_STATUS_META, OPEN_PROPOSAL_STATUSES, DEFAULT_COMMERCIALS, computeTotals, investmentMarkdown,
  mergeInvestment, buildProposalHtml, htmlToText, caseHours, specHoursFromNotes,
} from "../lib/proposals.js";
import { deckPrompt, parseDeck, buildDeckHtml } from "../lib/proposalDeck.js";
import { PREVIEW_KEY } from "../views/ProposalReviewView.jsx";
import { STATUS_LABEL_KEYS } from "../lib/uiUtils.jsx";
import { resolveCatalog, computeServiceTotals, servicePlanMarkdown, slaMarkdown, premisesMarkdown, mergeServiceSections, termName } from "../lib/servicePlans.js";

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
  const [profileRate, setProfileRate] = useState(null); // author's consultant-profile hourly rate (USD)
  useEffect(() => {
    if (!auth.user?.id) return;
    supabase.from("consultant_profiles").select("hourly_rate").eq("id", auth.user.id).maybeSingle()
      .then(({ data }) => setProfileRate(Number(data?.hourly_rate) > 0 ? Number(data.hourly_rate) : null));
  }, [auth.user?.id]);
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
        project.partner_id ? supabase.from("partners").select("id, name, service_plans, logo_url").eq("id", project.partner_id).maybeSingle() : { data: null },
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
      language: es ? "es" : "en", currency,
      commercials: { ...DEFAULT_COMMERCIALS, baseRate: profileRate ? Math.round(fromUsd(profileRate, currency, cfg) * 100) / 100 : null },
      recipients: customer?.contact_email ? [{ name: customer.contact_name ?? "", email: customer.contact_email }]
        : project.stakeholder_email ? [{ name: project.stakeholder_name ?? "", email: project.stakeholder_email }] : [],
    }).select().single();
    if (e) { setError(e.message); return; }
    await supabase.from("proposal_events").insert({ proposal_id: data.id, event: "created", actor_id: auth.user?.id, actor_name: auth.profile?.full_name ?? null });
    setProposals(p => [data, ...p]);
    setOpenId(data.id);
  }

  const open = proposals.find(p => p.id === openId);
  const catalog = useMemo(() => resolveCatalog(partner?.service_plans ?? null, ss.settings?.service_plans_default ?? null), [partner, ss.settings]);
  const ctx = { project, auth, cfg, cases, acts, specs, docs, assigned, customer, partner, proposals, L, es, lang, settings: ss.settings, profileRate, catalog };

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
                {p.totals?.type === "plan"
                  ? <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 whitespace-nowrap">{L("Service plan", "Plan de servicio")} · {p.totals.hoursMonth} h/{L("mo", "mes")}</span>
                  : p.totals?.type === "on_demand"
                    ? <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 whitespace-nowrap">{L("On demand", "Bajo demanda")}</span>
                    : p.totals?.total != null && <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtMoney(p.totals.total, p.currency, lang)}</span>}
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
  const { project, auth, cfg, cases, acts, specs, docs, assigned, customer, partner, proposals, L, es, settings, catalog } = ctx;
  const [p, setP] = useState(proposal);
  const [step, setStep] = useState(proposal.status === "draft" ? (proposal.html ? "send" : proposal.case_ids.length ? "sources" : "cases") : "view");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set(proposal.case_ids));
  const { t } = useT();
  const statusLabel = st => { const k = STATUS_LABEL_KEYS[st]; const v = k ? t(k) : null; return v && v !== k ? v : String(st ?? "").replace(/_/g, " "); };
  // Hours: activity plan first; without a plan, the time estimate written in Spec C (or Spec A).
  const specHoursOf = id => specHoursFromNotes(specs[id]?.notes);
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
  const proposalType = commercials.proposalType || "cases";   // 'cases' (hourly) | 'plan' (UE) | 'on_demand'
  const isService = proposalType !== "cases";
  const caseTotals = useMemo(() => computeTotals(propCases.map(c => ({ ...c, activities: acts[c.id] ?? [], specHours: specHoursOf(c.id) })), commercials, cfg, p.currency),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.case_ids, p.commercials, p.currency, cfg, acts]);
  const totals = useMemo(() => {
    if (!isService) return caseTotals;
    // Selected cases are the starting backlog: their estimated hours are consumed from the plan.
    const backlog = commercials.basis === "standard" ? caseTotals.hoursStandard : caseTotals.hoursArena;
    return { ...computeServiceTotals(commercials, catalog, p.currency, cfg, backlog || 0), sla: catalog.sla,
             caseCount: propCases.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isService, caseTotals, p.commercials, p.currency, catalog, cfg]);

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
      setStep(ids.length ? "sources" : "terms"); // without cases (e.g. a help-desk plan) skip the sources step
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
    if (isService) return generateService();
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
        outputLang: p.language, // the proposal's own language, not the consultant's UI language
      });
      // callClaude returns the text itself (string); keep the object form as a fallback.
      const text = (typeof resp === "string" ? resp
        : (resp?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("\n")).trim()
        .replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/, "").trim();
      if (!text) throw new Error(L("The AI returned no text. Try again.", "La IA no devolvió texto. Inténtalo de nuevo."));
      await saveDocument(text);
      logEvent("proposal.generated", { entityType: "project", entityId: project.id, entityName: p.title });
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  // Service-plan / on-demand proposal: the AI writes the narrative; SLA, premises and plan prices
  // are inserted by the platform from the partner's catalog ([[SLA]] [[PREMISES]] [[INVESTMENT]]).
  async function generateService() {
    setBusy("generate"); setError(null);
    try {
      if (proposalType === "cases" || (proposalType === "plan" && !totals.options?.length)) throw new Error(L("Complete the commercial terms first.", "Completa primero las condiciones comerciales."));
      const langName = pes ? "Spanish" : "English";
      const H = pes
        ? ["Resumen ejecutivo", "Objetivos del servicio", "Alcance y estructura de soporte", "Tipos de solicitud y prioridades", "Roles", "Proceso de atención", "Próximos pasos"]
        : ["Executive summary", "Service objectives", "Scope and support structure", "Request types and priorities", "Roles", "Service process", "Next steps"];
      const system = `You are a senior SAP consulting partner writing a SERVICE proposal (application management / help desk) for a customer. Write in ${langName}, in a confident, clear and concise business tone.
Output GitHub-flavoured markdown only (no code fences around the whole answer). Use exactly this structure, in this order:
## ${H[0]}
## ${H[1]}   (bulleted: operational support, senior consulting, SAP and industry best practices, response times, cost, completeness)
## ${H[2]}   (customer side: coordinator, key users, users; support centre: coordinator, dispatcher, architect, area leads per SAP module, functional and technical consultants)
## ${H[3]}   (request types: Error, General information, Improvement; priorities: Critical, High, Normal, Low with their criteria)
[[SLA]]
## ${H[4]}
## ${H[5]}   (request created by a user → confirmed by the key user/coordinator → dispatcher assigns an area lead → lead assigns a consultant → solution → user tests and approves → closure)
[[PREMISES]]
[[INVESTMENT]]
## ${H[6]}
Put each [[...]] marker alone on its own line — the platform inserts the SLA table, the service premises and the plans/prices there.
Rules: never write prices, rates, hours, SLA times or payment conditions yourself. Do not invent facts beyond the provided material; when something is unknown, state it as an assumption. Keep the whole document under about 1,000 words.`;
      const backlog = propCases.map(c => `- ${c.title}${c.area_sap ? ` (${c.area_sap})` : ""}${c.description ? `: ${clip(c.description, 300)}` : ""}`).join("\n");
      const user = `PROPOSAL: ${p.title}
Customer: ${customer?.name ?? project.client?.full_name ?? project.stakeholder_name ?? "—"}
Project: ${project.name}${project.description ? ` — ${clip(project.description, 800)}` : ""}${project.area_sap ? `\nSAP areas: ${project.area_sap}` : ""}
Prepared by: ${partner?.name ?? "Arena Solutions"}
Service type: ${proposalType === "plan" ? `prepaid monthly plan — ${totals.ue} UE (${totals.hoursMonth} hours per month), terms offered: ${(totals.options ?? []).map(o => o.months).join(", ")} months; the customer chooses the term` : "on-demand service billed on consumption with a monthly minimum"}
Proposed start date: ${commercials.startDate || "to be agreed"}
${commercials.notes ? `Additional notes from the consultant: ${clip(commercials.notes, 1500)}\n` : ""}${backlog ? `\nINITIAL BACKLOG (cases already identified, consumed from the contracted hours):\n${backlog}` : "\nNo cases are defined yet: they will be registered on the platform once the service starts."}`;
      const resp = await callClaude({
        system, messages: [{ role: "user", content: user }], max_tokens: 6000,
        model: settings?.ai_model ?? "claude-haiku-5-5", feature: "proposal", projectId: project.id,
        outputLang: p.language,
      });
      const text = (typeof resp === "string" ? resp
        : (resp?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("\n")).trim()
        .replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/, "").trim();
      if (!text) throw new Error(L("The AI returned no text. Try again.", "La IA no devolvió texto. Inténtalo de nuevo."));
      await saveDocument(text);
      logEvent("proposal.generated", { entityType: "project", entityId: project.id, entityName: p.title, metadata: { type: proposalType } });
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  // Turn the platform-built sections back into markers, so they are rebuilt with current numbers.
  function toMarkers(md) {
    return (md ?? "")
      .replace(/## (Effort & investment|Esfuerzo e inversión)[\s\S]*?(?=\n## |$)/, "[[INVESTMENT]]\n")
      .replace(/## (Acuerdo de nivel de servicio \(SLA\)|Service level agreement \(SLA\))[\s\S]*?(?=\n## |$)/, "[[SLA]]\n")
      .replace(/## (Premisas del servicio|Service premises)[\s\S]*?(?=\n## |$)/, "[[PREMISES]]\n")
      .replace(/## (Planes y propuesta económica|Plans and economic proposal)[\s\S]*?(?=\n## |$)/, "[[INVESTMENT]]\n");
  }

  // Short price line for emails and the document header.
  function priceSummary() {
    if (proposalType === "plan") {
      const opts = totals.options ?? [];
      const lowest = opts.reduce((a, o) => (a == null || o.monthly < a ? o.monthly : a), null);
      return pes ? `${opts.length} ${opts.length === 1 ? "opción" : "opciones"} de plan · desde ${fmtMoney(lowest ?? 0, p.currency, lang)}/mes`
                 : `${opts.length} plan ${opts.length === 1 ? "option" : "options"} · from ${fmtMoney(lowest ?? 0, p.currency, lang)}/month`;
    }
    if (proposalType === "on_demand") {
      return pes ? `${fmtMoney(totals.rate, p.currency, lang)}/hora · mínimo ${fmtMoney(totals.minMonthly, p.currency, lang)}/mes`
                 : `${fmtMoney(totals.rate, p.currency, lang)}/hour · minimum ${fmtMoney(totals.minMonthly, p.currency, lang)}/month`;
    }
    return fmtMoney(totals.total, p.currency, lang);
  }

  function attachmentsList() {
    return propCases.flatMap(c => (docs[c.id] ?? []).filter(d => (p.sources?.[c.id]?.attach ?? []).includes(d.id))
      .map(d => ({ doc_id: d.id, case_id: c.id, case_title: c.title, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type })));
  }

  async function saveDocument(narrative) {
    const md = isService
      ? mergeServiceSections(narrative, {
          investment: servicePlanMarkdown(totals, catalog, lang), sla: slaMarkdown(catalog, lang), premises: premisesMarkdown(catalog, lang),
        })
      : mergeInvestment(narrative, investmentMarkdown(totals, commercials, lang));
    const attachments = attachmentsList();
    const validUntil = p.valid_until || new Date(Date.now() + (Number(commercials.validDays) || 30) * 86400000).toISOString().slice(0, 10);
    const dfmt = d => new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString(pes ? "es-MX" : "en-US", { year: "numeric", month: "long", day: "numeric" });
    const html = buildProposalHtml({
      lang, title: isService ? (pes ? "Propuesta de servicio" : "Service proposal") : (pes ? "Propuesta comercial" : "Commercial proposal"), subtitle: project.name,
      eyebrow: `${partner?.name ?? "Arena"} · ${pes ? "Propuesta" : "Proposal"} v${p.version}`,
      meta: [
        { label: pes ? "Cliente" : "Customer", value: customer?.name ?? project.stakeholder_name ?? "—" },
        isService
          ? { label: pes ? "Servicio" : "Service", value: proposalType === "plan" ? `${totals.bandName} · ${totals.hoursMonth} h/${pes ? "mes" : "month"}` : (pes ? "Bajo demanda" : "On demand") }
          : { label: pes ? "Casos" : "Cases", value: String(propCases.length) },
        { label: isService ? (pes ? "Precio" : "Price") : "Total", value: isService ? priceSummary() : fmtMoney(totals.total, p.currency, lang) },
        { label: pes ? "Fecha" : "Date", value: dfmt(new Date().toISOString().slice(0, 10)) },
        { label: pes ? "Válida hasta" : "Valid until", value: dfmt(validUntil) },
      ],
      markdown: md, attachments, preparedBy: partner?.name ?? auth.profile?.full_name ?? "", customerName: customer?.name ?? "",
    });
    await save({ content_md: md, html, attachments, totals, valid_until: validUntil });
  }

  // ── Presentation for the customer (the document's content as slides; numbers from the platform) ──
  function deckHtml(slides, validUntilOverride) {
    const dfmt = d => d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString(pes ? "es-MX" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
    const invMd = isService ? servicePlanMarkdown(totals, catalog, lang) : investmentMarkdown(totals, commercials, lang);
    const hrs = v => `${(Number(v) || 0).toLocaleString(pes ? "es" : "en-US", { maximumFractionDigits: 1 })} h`;
    const figures = isService
      ? [{ label: pes ? "Precio" : "Price", value: priceSummary() }]
      : [
          { label: "Total", value: fmtMoney(totals.total, p.currency, lang) },
          { label: pes ? "Casos" : "Cases", value: String(propCases.length) },
          { label: pes ? "Horas estimadas" : "Estimated hours", value: hrs(totals.basis === "standard" ? totals.hoursStandard : totals.hoursArena) },
          ...(totals.savings > 0 ? [{ label: pes ? "Ahorro con Arena" : "Arena saving", value: fmtMoney(totals.savings, p.currency, lang) }] : []),
        ];
    return buildDeckHtml({
      slides, lang, title: p.title, customer: customer?.name ?? project.stakeholder_name ?? "", project: project.name,
      preparedBy: partner?.name ?? auth.profile?.full_name ?? "Arena", logoUrl: partner?.logo_url ?? null,
      date: dfmt(new Date().toISOString().slice(0, 10)), validUntil: dfmt(validUntilOverride ?? p.valid_until), investmentMd: invMd, figures,
      contact: auth.profile?.full_name ?? "",
    });
  }

  // "Preview customer view": the draft's data goes to this browser's storage and a new tab shows the
  // customer page with it (/proposal-preview/:id). The tab is opened first so popup blockers allow it.
  function openCustomerPreview() {
    const w = window.open("", "_blank");
    const data = {
      id: p.id, title: p.title, version: p.version, status: isDraft ? "sent" : p.status, language: p.language, currency: p.currency,
      totals: p.totals ?? totals, valid_until: p.valid_until || null, sent_at: p.sent_at ?? null,
      html: p.html, deck_html: p.deck?.slides?.length ? deckHtml(p.deck.slides) : null,
      attachments: attachmentsList(), project_name: project.name, partner_name: partner?.name ?? null, customer_name: customer?.name ?? null,
      _link: proposalLink(p.token), _draft: isDraft, _at: Date.now(),
    };
    try { localStorage.setItem(PREVIEW_KEY(p.id), JSON.stringify(data)); }
    catch { setError(L("The browser did not allow the preview (storage full or blocked).", "El navegador no permitió la vista previa (almacenamiento lleno o bloqueado).")); w?.close(); return; }
    const url = `${window.location.origin}/proposal-preview/${p.id}`;
    if (w) w.location.href = url; else window.open(url, "_blank");
  }

  async function generateDeck() {
    setBusy("deck"); setError(null);
    try {
      if (!p.content_md) throw new Error(L("Generate the proposal document first.", "Genera primero el documento de la propuesta."));
      const { system, user } = deckPrompt({ markdown: p.content_md, lang, title: p.title, customer: customer?.name ?? project.stakeholder_name, project: project.name, type: proposalType });
      const resp = await callClaude({
        system, messages: [{ role: "user", content: user }], max_tokens: 6000,
        model: settings?.ai_model ?? "claude-haiku-5-5", feature: "proposal_deck", projectId: project.id, outputLang: p.language,
      });
      const text = typeof resp === "string" ? resp : (resp?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("\n");
      const slides = parseDeck(text);
      await save({ deck: { slides, generated_at: new Date().toISOString(), doc_md_len: p.content_md.length }, deck_html: deckHtml(slides) });
      logEvent("proposal.deck_generated", { entityType: "project", entityId: project.id, entityName: p.title });
    } catch (e) { setError(e.message?.includes("JSON") ? L("The AI answer could not be read. Try again.", "No se pudo leer la respuesta de la IA. Inténtalo de nuevo.") : e.message); }
    setBusy(null);
  }

  async function send() {
    setBusy("send"); setError(null);
    try {
      const rec = (p.recipients ?? []).filter(r => /\S+@\S+\.\S+/.test(r.email ?? ""));
      if (!rec.length) throw new Error(L("Add at least one recipient email.", "Agrega al menos un correo de destinatario."));
      if (!p.html) throw new Error(L("Generate the document first.", "Primero genera el documento."));
      let row = await save({ status: "sent", sent_at: new Date().toISOString() });
      // The customer sees the presentation from the same link (refreshed with the final validity date).
      if (p.deck?.slides?.length) row = await save({ deck_html: deckHtml(p.deck.slides, row.valid_until) });
      await supabase.from("proposal_events").insert({ proposal_id: p.id, event: "sent", actor_id: auth.user?.id, actor_name: auth.profile?.full_name ?? null, note: rec.map(r => r.email).join(", ") });
      const link = proposalLink(row.token);
      const from = partner?.name ?? "Arena Solutions Platform";
      for (const r of rec) {
        const html = buildEmailHtml({
          title: pes ? "Tienes una propuesta para revisar" : "You have a proposal to review",
          preheader: `${p.title} — ${priceSummary()}`,
          bodyHtml: pes
            ? `<p>Hola ${r.name || ""},</p><p><strong>${from}</strong> te envió la propuesta <strong>${p.title}</strong> para el proyecto <strong>${project.name}</strong>.</p><p>${isService ? "Precio" : "Total"}: <strong>${priceSummary()}</strong>${proposalType === "plan" ? " — elige el período al aceptar" : ""} · Válida hasta ${row.valid_until ?? "—"}</p><p>Puedes revisarla, descargar los anexos y aceptarla, pedir cambios o rechazarla desde el enlace.</p>`
            : `<p>Hello ${r.name || ""},</p><p><strong>${from}</strong> has sent you the proposal <strong>${p.title}</strong> for the project <strong>${project.name}</strong>.</p><p>${isService ? "Price" : "Total"}: <strong>${priceSummary()}</strong>${proposalType === "plan" ? " — choose the term when accepting" : ""} · Valid until ${row.valid_until ?? "—"}</p><p>From the link you can review it, download the attachments, and accept it, ask for changes or reject it.</p>`,
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
            const reachable = i === 0 || p.case_ids.length > 0 || s !== "sources";
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
          hint={L("Optional for a service plan (UE) or on-demand proposal: the cases you pick become the starting backlog and their hours are consumed from the plan; you can also continue without cases. Estimated cases you select move to “Proposal pending” and leave the Arena until the customer answers. Cases in any other status keep their status — for them the proposal is a draft offer; when the customer accepts, their specification is approved (the development plan can then be generated in each case) and they get the agreed budget.",
            "Opcional en una propuesta de plan de servicio (UE) o bajo demanda: los casos que elijas son el backlog inicial y sus horas se consumen del plan; también puedes continuar sin casos. Los casos en estado Estimado que selecciones pasan a “Propuesta pendiente” y salen de la Arena hasta que el cliente responda. Los casos en cualquier otro estado conservan su estado: para ellos la propuesta es una oferta en borrador; cuando el cliente acepta, su especificación queda aprobada (ya se puede generar el plan en cada caso) y reciben el presupuesto acordado.")}>
          <div className="divide-y divide-gray-100">
            {cases.map(c => {
              const h = caseHours(acts[c.id], specHoursOf(c.id));
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
                    <p className="text-xs text-gray-500">{statusLabel(c.status)} · {c.area_sap ?? "—"} · {L("spec", "spec")} {specs[c.id]?.content ? "✓" : "—"} · {L("plan", "plan")} {h.activities ? `${h.activities} ${L("activities", "actividades")}` : "—"}</p>
                  </div>
                  <div className="text-right text-xs whitespace-nowrap">
                    <div className="text-gray-500">{L("Standard", "Estándar")} <b className="text-gray-900">{h.standard} h</b></div>
                    <div className="text-blue-600">Arena <b>{h.arena} h</b></div>
                  </div>
                  {reason && <span className="text-[11px] text-gray-500 w-36 text-right">{reason}</span>}
                  {!reason && (c.status === "estimated" || c.status === "proposal_pending") && on && (
                    <span className="text-[11px] text-amber-600 w-36 text-right leading-tight">
                      {L("→ Proposal pending (leaves the Arena)", "→ Propuesta pendiente (sale de la Arena)")}
                    </span>
                  )}
                  {!reason && !h.activities && c.status !== "estimated" && (
                    <span className="text-[11px] text-amber-600 w-36 text-right leading-tight">
                      {statusLabel(c.status)} — {h.source === "specC" ? L("hours from Spec C (no plan)", "horas de la Spec C (sin plan)")
                        : h.source === "specA" ? L("hours from Spec A (no plan)", "horas de la Spec A (sin plan)")
                        : L("no plan or spec estimate: 0 h", "sin plan ni estimación en la spec: 0 h")}
                    </span>
                  )}
                </label>
              );
            })}
            {cases.length === 0 && <p className="text-sm text-gray-400 py-4">{L("This project has no cases yet.", "Este proyecto aún no tiene casos.")}</p>}
          </div>
          <Footer>
            <span className="text-xs text-gray-500">{selected.size} {L("selected", "seleccionados")}</span>
            <PrimaryBtn busy={busy === "cases"} onClick={applyCases}>{selected.size === 0
              ? L("Continue without cases", "Continuar sin casos")
              : L("Save cases & continue", "Guardar casos y continuar")}</PrimaryBtn>
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
                      <label key={k} title={avail ? "" : L("Not created yet in this case", "Aún no creado en este caso")}
                        className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${avail ? "border-gray-200 cursor-pointer" : "border-dashed border-gray-200 text-gray-400 cursor-not-allowed"}`}>
                        <input type="checkbox" disabled={!avail} checked={!!s[k] && avail} onChange={() => setS({ [k]: !s[k] })} />{label}
                        {!avail && <span className="text-[10px] italic">· {L("not created yet", "aún no creado")}</span>}
                      </label>
                    ))}
                  </div>
                  {opts.slice(1).every(o => !o[2]) && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      {L("This case has no specification or activity plan yet, so the AI will only use the request. Create them from the case (Specification / Plan tabs) for a richer proposal and real hour estimates.",
                         "Este caso aún no tiene especificación ni plan de actividades, así que la IA solo usará la solicitud. Créalos desde el caso (pestañas Especificación / Plan) para una propuesta más completa y estimación real de horas.")}
                    </p>
                  )}
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
        <TermsStep p={p} setP={setP} totals={totals} propCases={propCases} cfg={cfg} L={L} lang={lang} profileRate={ctx.profileRate}
          catalog={catalog} busy={busy === "terms"}
          onBack={() => setStep(propCases.length ? "sources" : "cases")}
          onNext={async () => { setBusy("terms"); try { await save({ commercials: p.commercials, currency: p.currency, language: p.language, totals }); setStep("document"); } catch (e) { setError(e.message); } setBusy(null); }} />
      )}

      {/* 4 · Document */}
      {isDraft && step === "document" && (
        <Card title={L("Proposal document", "Documento de la propuesta")}
          hint={L("The AI writes the text from the chosen material; hours and amounts come from step 3 and are never written by the AI.",
            "La IA redacta el texto con el material elegido; horas e importes vienen del paso 3 y nunca los escribe la IA.")}>
          <div className="flex gap-2 flex-wrap mb-3">
            <PrimaryBtn busy={busy === "generate"} disabled={!isService && propCases.length === 0} onClick={generate}><Sparkles size={14} />{p.content_md ? L("Regenerate with AI", "Regenerar con IA") : L("Generate with AI", "Generar con IA")}</PrimaryBtn>
            {p.html && <button onClick={() => openHtml(p.html)} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Eye size={14} />{L("Open full page", "Abrir página completa")}</button>}
          </div>
          {busy === "generate" && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{L("Reading the case material and writing the proposal… this can take a minute.", "Leyendo el material de los casos y redactando la propuesta… puede tardar un minuto.")}</p>}
          {p.content_md && (
            <div className="grid lg:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{L("Edit text (markdown)", "Editar texto (markdown)")}</p>
                <textarea value={p.content_md} onChange={e => setP({ ...p, content_md: e.target.value })}
                  className="w-full h-[520px] font-mono text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={async () => { setBusy("savedoc"); try { await saveDocument(toMarkers(p.content_md)); } catch (e) { setError(e.message); } setBusy(null); }}
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
          onRebuild={async () => { setBusy("rebuild"); try { await saveDocument(toMarkers(p.content_md)); } catch (e) { setError(e.message); } setBusy(null); }}
          onBack={() => setStep("document")} onSend={send} onWithdraw={withdraw} onPreview={openCustomerPreview} />
      )}


      {/* Sent / answered */}
      {!isDraft && (
        <ProposalStatusView p={p} events={events} L={L} es={es} lang={lang} busy={busy}
          onWithdraw={withdraw} onNewVersion={newVersion} />
      )}

      {/* Presentation */}
      {p.content_md && (!isDraft || step === "document" || step === "send") && (
        <DeckPanel p={p} L={L} busy={busy === "deck"} onGenerate={generateDeck}
          html={p.deck?.slides?.length ? deckHtml(p.deck.slides) : null} />
      )}

      {isDraft && step !== "cases" && (
        <div className="text-right">
          <button onClick={withdraw} className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1"><XCircle size={12} />{L("Discard draft", "Descartar borrador")}</button>
        </div>
      )}
    </div>
  );
}

function DeckPanel({ p, L, busy, onGenerate, html }) {
  const deck = p.deck;
  const stale = deck?.doc_md_len != null && deck.doc_md_len !== (p.content_md ?? "").length;
  const openDeck = print => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    if (print) setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 900);
  };
  return (
    <Card title={L("Presentation for the customer", "Presentación para el cliente")}
      hint={L("Slides made from the proposal document to present it in a meeting. The investment slides use the same computed numbers as the document; the AI never writes prices or hours. The customer also sees the presentation from the proposal link.",
        "Diapositivas creadas a partir del documento de la propuesta para presentarla en una reunión. Las diapositivas de inversión usan los mismos importes calculados del documento; la IA nunca escribe precios ni horas. El cliente también ve la presentación desde el enlace de la propuesta.")}>
      <div className="flex gap-2 flex-wrap mb-3">
        <PrimaryBtn busy={busy} onClick={onGenerate}><Sparkles size={14} />{deck?.slides?.length ? L("Regenerate presentation", "Regenerar presentación") : L("Generate presentation", "Generar presentación")}</PrimaryBtn>
        {html && <>
          <button onClick={() => openDeck(false)} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Presentation size={14} />{L("Present", "Presentar")}</button>
          <button onClick={() => openDeck(true)} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Printer size={14} />{L("Download PDF", "Descargar PDF")}</button>
        </>}
      </div>
      {busy && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{L("Turning the proposal into slides…", "Convirtiendo la propuesta en diapositivas…")}</p>}
      {stale && !busy && <div className="mb-3"><Banner tone="amber">{L("The document changed after the presentation was made. Regenerate it so both say the same.", "El documento cambió después de crear la presentación. Regenérala para que ambos digan lo mismo.")}</Banner></div>}
      {html && (
        <>
          <iframe title="presentation" srcDoc={html} className="w-full aspect-video border border-gray-200 rounded-xl bg-[#0B1220]" sandbox="allow-scripts" />
          <p className="text-[11px] text-gray-400 mt-1">{L("click or use the arrows to move; in “Present”, F is full screen", "clic o flechas para avanzar; en “Presentar”, F es pantalla completa")}{deck.generated_at ? ` · ${new Date(deck.generated_at).toLocaleString()}` : ""}</p>
        </>
      )}
    </Card>
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

const SERVICE_PAYMENT_TERMS = {
  plan: { es: "Plan prepagado: el monto total se paga antes de iniciar el servicio. Horas adicionales: los primeros 5 días del mes siguiente.", en: "Prepaid plan: the full amount is paid before the service starts. Additional hours: within the first 5 days of the following month." },
  on_demand: { es: "Pago mínimo mensual por adelantado; las horas consumidas se pagan los primeros 5 días del mes siguiente.", en: "Monthly minimum paid in advance; the hours consumed are paid within the first 5 days of the following month." },
};

function TermsStep(props) {
  const { p, setP, L, catalog, lang } = props;
  const c = { ...DEFAULT_COMMERCIALS, ...(p.commercials ?? {}) };
  const type = c.proposalType || "cases";
  const choose = t => {
    const patch = { proposalType: t };
    if (t === "plan") { if (!(Number(c.ue) > 0)) patch.ue = 1; if (!c.terms?.length) patch.terms = catalog.terms; }
    const svcTexts = [SERVICE_PAYMENT_TERMS.plan.es, SERVICE_PAYMENT_TERMS.plan.en, SERVICE_PAYMENT_TERMS.on_demand.es, SERVICE_PAYMENT_TERMS.on_demand.en];
    if (t !== "cases" && (!c.paymentTerms || c.paymentTerms === DEFAULT_COMMERCIALS.paymentTerms || svcTexts.includes(c.paymentTerms))) patch.paymentTerms = SERVICE_PAYMENT_TERMS[t][lang === "es" ? "es" : "en"];
    if (t === "cases" && svcTexts.includes(c.paymentTerms)) patch.paymentTerms = DEFAULT_COMMERCIALS.paymentTerms;
    setP(prev => ({ ...prev, commercials: { ...c, ...patch } }));
  };
  const opts = [
    ["cases", L("By cases — hourly rate", "Por casos — tarifa por hora"), L("Price from each case's hours × rate.", "Precio según horas de cada caso × tarifa.")],
    ["plan", L("Service plan (UE)", "Plan de servicio (UE)"), L("Monthly prepaid plans in equivalent units; the customer chooses the term.", "Planes mensuales prepagados en unidades equivalentes; el cliente elige el período.")],
    ["on_demand", L("On demand", "Bajo demanda"), L("Hourly rate with a monthly minimum, billed on consumption.", "Tarifa por hora con mínimo mensual, facturada por consumo.")],
  ];
  const typeSelector = (
    <div className="mb-5">
      <p className="text-xs font-medium text-gray-600 mb-2">{L("Proposal type", "Tipo de propuesta")}</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {opts.map(([k, label, desc]) => (
          <button key={k} type="button" onClick={() => choose(k)}
            className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${type === k ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200 hover:border-blue-300"}`}>
            <span className={`block text-sm font-semibold ${type === k ? "text-blue-700" : "text-gray-900"}`}>{label}</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return type === "cases"
    ? <CaseTermsStep {...props} typeSelector={typeSelector} />
    : <ServiceTermsStep {...props} type={type} typeSelector={typeSelector} />;
}

function ServiceTermsStep({ p, setP, totals, propCases, catalog, L, lang, busy, onBack, onNext, type, typeSelector }) {
  const c = { ...DEFAULT_COMMERCIALS, ...(p.commercials ?? {}) };
  const setC = patch => setP(prev => ({ ...prev, commercials: { ...c, ...patch } }));
  const m = v => fmtMoney(v, p.currency, lang);
  const es = lang === "es";
  const terms = c.terms?.length ? c.terms.map(Number) : catalog.terms;
  const toggleTerm = t => setC({ terms: terms.includes(t) ? terms.filter(x => x !== t) : [...terms, t].sort((a, b) => a - b) });
  const noTerms = type === "plan" && (!terms.length || !totals.options?.length || !(Number(c.ue) > 0));
  return (
    <Card title={L("Commercial terms", "Condiciones comerciales")}
      hint={type === "plan"
        ? L(`Plans from your catalog (1 UE = ${catalog.ueHours} h/month). Offer one or more terms; the customer chooses one when accepting. Rates are edited in the Partner area → Service plans.`,
            `Planes de tu catálogo (1 UE = ${catalog.ueHours} h/mes). Ofrece uno o varios períodos; el cliente elige uno al aceptar. Las tarifas se editan en el área de Partner → Planes de servicio.`)
        : L("On-demand service from your catalog: hourly rate with a monthly minimum.", "Servicio bajo demanda de tu catálogo: tarifa por hora con un pago mínimo mensual.")}>
      {typeSelector}
      <div className="grid md:grid-cols-4 gap-3">
        {type === "plan" && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{L("Equivalent units (UE)", "Unidades equivalentes (UE)")}</span>
              <input type="number" min="0.25" step="0.25" value={c.ue ?? ""} onChange={e => setC({ ue: e.target.value === "" ? "" : Number(e.target.value) })}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{L("or hours per month", "o horas por mes")}</span>
              <input type="number" min="1" step="1" value={c.ue ? Math.round(c.ue * catalog.ueHours * 10) / 10 : ""}
                onChange={e => setC({ ue: e.target.value === "" ? "" : Math.round((Number(e.target.value) / catalog.ueHours) * 10000) / 10000 })}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <div className="md:col-span-2">
              <span className="text-xs font-medium text-gray-600">{L("Terms offered to the customer", "Períodos ofrecidos al cliente")}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {catalog.terms.map(t => (
                  <label key={t} className={`text-xs px-3 py-2 rounded-xl border cursor-pointer ${terms.includes(t) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                    <input type="checkbox" className="mr-1.5" checked={terms.includes(t)} onChange={() => toggleTerm(t)} />{termName(t, es)} ({t} {L(t === 1 ? "month" : "months", t === 1 ? "mes" : "meses")})
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {type === "on_demand" && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">{L("Estimated hours / month (optional)", "Horas estimadas / mes (opcional)")}</span>
            <input type="number" min="0" value={c.onDemandHours ?? ""} onChange={e => setC({ onDemandHours: e.target.value === "" ? "" : Number(e.target.value) })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Currency", "Moneda")}</span>
          <select value={p.currency} onChange={e => setP({ ...p, currency: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            {[...new Set([p.currency, ...COMMON_CURRENCIES])].map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Document language", "Idioma del documento")}</span>
          <select value={p.language} onChange={e => setP({ ...p, language: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="en">English</option><option value="es">Español</option>
          </select>
        </label>
        <Num label={L("Taxes", "Impuestos")} suffix="%" value={c.taxPct} onChange={v => setC({ taxPct: v })} />
        <Num label={L("Valid for", "Vigencia")} suffix={L("days", "días")} value={c.validDays} onChange={v => setC({ validDays: v })} />
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{L("Service start", "Inicio del servicio")}</span>
          <input type="date" value={c.startDate} onChange={e => setC({ startDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="block md:col-span-3">
          <span className="text-xs font-medium text-gray-600">{L("Payment terms", "Condiciones de pago")}</span>
          <input value={c.paymentTerms} onChange={e => setC({ paymentTerms: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="block md:col-span-4">
          <span className="text-xs font-medium text-gray-600">{L("Notes for the AI (optional)", "Notas para la IA (opcional)")}</span>
          <textarea rows={2} value={c.notes} onChange={e => setC({ notes: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder={L("e.g. SAP modules covered, help-desk tool, coordinator on the customer side…", "p. ej. módulos SAP cubiertos, herramienta de mesa de ayuda, coordinador del cliente…")} />
        </label>
      </div>

      <div className="mt-5 overflow-x-auto">
        {type === "plan" ? (
          <>
            <p className="text-sm text-gray-700 mb-2"><b>{totals.bandName}</b> · {totals.ue} UE = <b>{totals.hoursMonth} h</b> {L("per month", "por mes")}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">{L("Term", "Período")}</th>
                  <th className="py-2 pr-3 text-right">{L("Total hours", "Horas totales")}</th>
                  <th className="py-2 pr-3 text-right">{L("Rate / h", "Tarifa / h")}</th>
                  <th className="py-2 pr-3 text-right">{L("Daily rate", "Tarifa diaria")}</th>
                  <th className="py-2 pr-3 text-right">{L("Monthly equivalent", "Equivalente mensual")}</th>
                  <th className="py-2 text-right">{L("Period total", "Total del período")}</th>
                </tr>
              </thead>
              <tbody>
                {(totals.options ?? []).map(o => (
                  <tr key={o.months} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-900">{termName(o.months, es)} · {o.months} {L(o.months === 1 ? "month" : "months", o.months === 1 ? "mes" : "meses")}</td>
                    <td className="py-2 pr-3 text-right">{o.totalHours}</td>
                    <td className="py-2 pr-3 text-right">{m(o.rate)}</td>
                    <td className="py-2 pr-3 text-right text-gray-500">{m(o.dailyRate)}</td>
                    <td className="py-2 pr-3 text-right">{m(o.monthly)}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{m(o.total)}{totals.taxPct ? <span className="block text-[10px] font-normal text-gray-400">+{totals.taxPct}% = {m(o.totalWithTax)}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">{L("Additional hour", "Hora adicional")}: <b>{m(totals.extraHourRate)}</b> · {L("Specialist", "Especialista")} ×{totals.factors?.specialist} · {L("On site", "En sitio")} ×{totals.factors?.onsite}</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-2">{L("Rate", "Tarifa")} <b>{m(totals.rate)}</b>/h ({m(totals.dailyRate)}/{L("day", "día")}) · {L("monthly minimum", "mínimo mensual")} <b>{m(totals.minMonthly)}</b></p>
            <table className="w-full text-sm max-w-md">
              <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100"><th className="py-2 pr-3">{L("Hours / month", "Horas / mes")}</th><th className="py-2 pr-3 text-right">UE</th><th className="py-2 text-right">{L("Monthly amount", "Monto del mes")}</th></tr></thead>
              <tbody>{(totals.examples ?? []).map(e => <tr key={e.hours} className="border-b border-gray-50"><td className="py-2 pr-3">{e.hours}</td><td className="py-2 pr-3 text-right">{e.ue}</td><td className="py-2 text-right">{m(e.amount)}</td></tr>)}</tbody>
            </table>
          </>
        )}
        {propCases.length > 0 && (
          <p className="text-xs text-gray-600 mt-3">
            {L(`${propCases.length} case(s) included as starting backlog: about ${totals.backlogHours} estimated hours`, `${propCases.length} caso(s) incluidos como backlog inicial: unas ${totals.backlogHours} horas estimadas`)}
            {type === "plan" && totals.backlogPctOfFirst != null ? L(` (${totals.backlogPctOfFirst}% of the shortest term).`, ` (${totals.backlogPctOfFirst}% del período más corto).`) : "."}
          </p>
        )}
      </div>
      {noTerms && <div className="mt-3"><Banner tone="amber">{L("Choose a number of UE and at least one term that has a rate in your catalog.", "Indica las UE y al menos un período con tarifa en tu catálogo.")}</Banner></div>}
      <Footer>
        <button onClick={onBack} className="text-sm text-gray-500">{L("Back", "Atrás")}</button>
        <PrimaryBtn busy={busy} disabled={noTerms} onClick={onNext}>{L("Continue", "Continuar")}</PrimaryBtn>
      </Footer>
    </Card>
  );
}

function CaseTermsStep({ p, setP, totals, propCases, cfg, L, lang, profileRate, busy, onBack, onNext, typeSelector }) {
  const c = { ...DEFAULT_COMMERCIALS, ...(p.commercials ?? {}) };
  const setC = patch => setP(prev => ({ ...prev, commercials: { ...c, ...patch } }));
  const profileRateConv = profileRate ? Math.round(fromUsd(profileRate, p.currency, cfg) * 100) / 100 : null;
  // Prefill the proposal rate with the author's profile rate the first time (still editable).
  useEffect(() => {
    if ((c.rateMode === "single" || c.rateMode === "custom") && (c.baseRate == null || c.baseRate === "") && profileRateConv) setC({ baseRate: profileRateConv });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRateConv, c.rateMode]);
  const m = v => fmtMoney(v, p.currency, lang);
  return (
    <Card title={L("Commercial terms", "Condiciones comerciales")}
      hint={L("Both estimates are shown to the customer; the price basis decides which one is charged and becomes each case's budget on approval.",
        "Al cliente se le muestran ambas estimaciones; la base de precio decide cuál se cobra y se convierte en el presupuesto de cada caso al aprobar.")}>
      {typeSelector}
      {propCases.length === 0 && <div className="mb-4"><Banner tone="amber">{L("A proposal by cases needs at least one case. Go back to step 1, or choose a service plan / on demand.", "Una propuesta por casos necesita al menos un caso. Vuelve al paso 1 o elige plan de servicio / bajo demanda.")}</Banner></div>}
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
            <option value="single">{L("One rate for all cases", "Una tarifa para todos los casos")}</option>
            <option value="seniority">{L("By seniority (Settings → AI & Generation → Costs)", "Por seniority (Configuración → IA y Generación → Costos)")}</option>
            <option value="custom">{L("Custom per case", "Personalizada por caso")}</option>
          </select>
        </label>
        {(c.rateMode === "single" || c.rateMode === "custom") && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              {c.rateMode === "single" ? L("Rate per hour", "Tarifa por hora") : L("Default rate per hour", "Tarifa por hora por defecto")} ({p.currency})
            </span>
            <input type="number" min="0" step="0.5" value={c.baseRate ?? ""}
              onChange={e => setC({ baseRate: e.target.value === "" ? null : Number(e.target.value) })}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <span className="block text-[11px] text-gray-400 mt-1">
              {profileRate
                ? L(`From your consultant profile (US$ ${profileRate}/h) — change it for this proposal only.`, `De tu perfil de consultor (US$ ${profileRate}/h) — cámbiala solo para esta propuesta.`)
                : L("No rate in your consultant profile — enter the rate for this proposal.", "Tu perfil de consultor no tiene tarifa: indica la de esta propuesta.")}
              {profileRateConv && c.baseRate !== profileRateConv && (
                <button type="button" onClick={() => setC({ baseRate: profileRateConv })} className="ml-1 text-blue-600 underline">{L("Use profile rate", "Usar la de mi perfil")}</button>
              )}
            </span>
          </label>
        )}
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
                <td className="py-2 pr-3 text-gray-900">{l.title}<span className="text-xs text-gray-400 ml-1">· {l.seniority}</span>{(l.hoursSource === "specC" || l.hoursSource === "specA") && <span className="text-[10px] text-amber-600 ml-1">· {l.hoursSource === "specC" ? "Spec C" : "Spec A"}</span>}</td>
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
        <PrimaryBtn busy={busy} disabled={propCases.length === 0} onClick={onNext}>{L("Continue", "Continuar")}</PrimaryBtn>
      </Footer>
    </Card>
  );
}
function Row({ k, v }) { return <div className="flex justify-between gap-4"><span className="text-gray-500">{k}</span><span className="text-gray-900">{v}</span></div>; }

function SendStep({ p, setP, save, L, lang, busy, setError, attachments, totals, onRebuild, onBack, onSend, onPreview }) {
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
            : <ul className="space-y-1">{attachments.map(a => <li key={a.doc_id} className="text-sm flex items-center gap-2"><Paperclip size={12} className="text-gray-400" /><a href={a.file_url} onClick={docLinkClick(a.file_url, a.file_name)} target="_blank" rel="noreferrer" className="text-blue-600 truncate">{a.file_name}</a><span className="text-xs text-gray-400 truncate">· {a.case_title}</span></li>)}</ul>}
          {staleAttach && <div className="mt-2"><Banner tone="amber">{L("Attachments changed since the document was built.", "Los anexos cambiaron desde que se armó el documento.")} <button onClick={onRebuild} className="underline font-semibold">{L("Rebuild document", "Reconstruir documento")}</button></Banner></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onPreview} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-3 py-2"><ExternalLink size={14} />{L("Preview customer view", "Ver como el cliente")}</button>
            <button onClick={() => openHtml(p.html)} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700"><Eye size={14} />{L("Preview / save as PDF", "Vista previa / guardar PDF")}</button>
          </div>
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
        {p.status === "accepted" && (p.totals?.type === "plan" || p.totals?.type === "on_demand"
          ? <Banner tone="blue">{p.totals.type === "plan"
              ? L(`Accepted — ${p.accepted_option?.months ?? "?"}-month plan (${p.accepted_option?.totalHours ?? "?"} h, ${fmtMoney(p.accepted_option?.total ?? 0, p.currency, lang)}). The service contract is in the project's Service tab.`,
                  `Aceptada — plan de ${p.accepted_option?.months ?? "?"} meses (${p.accepted_option?.totalHours ?? "?"} h, ${fmtMoney(p.accepted_option?.total ?? 0, p.currency, lang)}). El contrato de servicio está en la pestaña Servicio del proyecto.`)
              : L("Accepted — on-demand service. The service contract is in the project's Service tab.", "Aceptada — servicio bajo demanda. El contrato de servicio está en la pestaña Servicio del proyecto.")}</Banner>
          : <Banner tone="blue">{L("Accepted: each case got its budget and is back in Estimated, ready to be assigned.", "Aceptada: cada caso recibió su presupuesto y volvió a Estimado, listo para asignar.")}</Banner>)}
        {p.status === "rejected" && <Banner tone="amber">{L("Rejected: the cases went back to their previous status.", "Rechazada: los casos volvieron a su estado anterior.")}</Banner>}
        {p.decision_note && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-semibold text-amber-800 mb-1">{p.decided_by_name}</p>
            <p className="text-amber-900 whitespace-pre-wrap">{p.decision_note}</p>
          </div>
        )}
        {p.totals?.total != null && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
            {p.totals.type === "plan"
              ? (p.totals.options ?? []).map(o => <Row key={o.months} k={`${termName(o.months, es)} · ${o.totalHours} h`} v={<b>{fmtMoney(o.total, p.currency, lang)}</b>} />)
              : p.totals.type === "on_demand"
                ? <Row k={L("Rate · monthly minimum", "Tarifa · mínimo mensual")} v={<b>{fmtMoney(p.totals.rate, p.currency, lang)}/h · {fmtMoney(p.totals.minMonthly, p.currency, lang)}</b>} />
                : <Row k={L("Total", "Total")} v={<b>{fmtMoney(p.totals.total, p.currency, lang)}</b>} />}
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
