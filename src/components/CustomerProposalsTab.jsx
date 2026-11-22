// Project → Proposals for the project's customer (customer company members / project client user).
// Lists the proposals sent to them and opens each one with the same view and decision as the
// secure link e-mailed to them (ProposalReviewView, embedded).
import { useState, useEffect, useCallback } from "react";
import { FileSignature, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { fmtMoney } from "../lib/costs.js";
import { PROPOSAL_STATUS_META } from "../lib/proposals.js";
import { termName } from "../lib/servicePlans.js";
import ProposalReviewView from "../views/ProposalReviewView.jsx";

export function CustomerProposalsTab({ project, auth }) {
  const { lang } = useT();
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("customer_project_proposals", { p_project: project.id });
    setRows(Array.isArray(data) ? data : []);
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;

  if (open) {
    return (
      <ProposalReviewView token={open.token} embedded defaultName={auth.profile?.full_name ?? ""}
        onBack={() => { setOpen(null); load(); }} onDecided={() => load()} />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><FileSignature size={17} className="text-blue-600" />{L("Proposals", "Propuestas")}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{L(
          "Proposals sent to you for this project. Open one to read it, choose your plan when there are options, and accept, ask for changes or reject.",
          "Propuestas que te enviaron para este proyecto. Abre una para leerla, elegir tu plan cuando hay opciones, y aceptarla, pedir cambios o rechazarla.")}</p>
      </div>
      {rows.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-400">
          {L("No proposals have been sent to you for this project yet.", "Aún no te han enviado propuestas para este proyecto.")}
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(r => {
            const meta = PROPOSAL_STATUS_META[r.status] ?? PROPOSAL_STATUS_META.sent;
            const pending = r.status === "sent" || r.status === "viewed";
            return (
              <button key={r.id} onClick={() => setOpen(r)}
                className="text-left bg-white border border-gray-200 hover:border-blue-300 rounded-2xl p-4 flex items-center gap-4 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><FileSignature size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{r.title}</span>
                    <span className="text-xs text-gray-400">v{r.version}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta[es ? "es" : "en"]}</span>
                    {pending && <span className="text-xs font-semibold text-amber-600">{L("Waiting for your decision", "Pendiente de tu decisión")}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {r.type === "plan" ? `${L("Service plan", "Plan de servicio")} · ${r.hours_month} h/${L("month", "mes")}`
                      : r.type === "on_demand" ? L("On-demand service", "Servicio bajo demanda")
                      : fmtMoney(r.total ?? 0, r.currency, lang)}
                    {r.accepted_option ? ` · ${L("chosen", "elegido")}: ${termName(r.accepted_option.months, es)}` : ""}
                    {r.sent_at ? ` · ${L("sent", "enviada")} ${new Date(r.sent_at).toLocaleDateString(es ? "es" : "en-US")}` : ""}
                    {r.valid_until && pending ? ` · ${L("valid until", "válida hasta")} ${r.valid_until}` : ""}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
