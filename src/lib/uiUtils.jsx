import { X, Check, RotateCcw } from "lucide-react";
import { useT } from "../i18n/index.jsx";

// Pure UI utility constants, formatters, and SLA editor used across components

const SLA_PRIORITIES = [
  { key: "critical", label: "Critical", dot: "bg-red-500",    badge: "bg-red-50 text-red-700 border border-red-200"         },
  { key: "high",     label: "High",     dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border border-orange-200" },
  { key: "medium",   label: "Medium",   dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border border-yellow-200" },
  { key: "low",      label: "Low",      dot: "bg-slate-400",  badge: "bg-slate-50 text-slate-600 border border-slate-200"    },
];

const SLA_DEFAULT_TYPES = [
  { key: "general",        labelKey: "sla.type_general",   label: "General Information" },
  { key: "problem",        labelKey: "sla.type_problem",   label: "Problem"             },
  { key: "change_request", labelKey: "sla.type_change_req",label: "Change Request"      },
];

function makeDefaultMatrix(keys) {
  const seed = {
    general:        { critical:{response:1,response_unit:"hours",resolution:8,resolution_unit:"hours"}, high:{response:8,response_unit:"hours",resolution:1,resolution_unit:"days"},  medium:{response:1,response_unit:"days",resolution:3,resolution_unit:"days"},  low:{response:3,response_unit:"days",resolution:8,resolution_unit:"days"} },
    problem:        { critical:{response:30,response_unit:"minutes",resolution:2,resolution_unit:"hours"}, high:{response:2,response_unit:"hours",resolution:8,resolution_unit:"hours"}, medium:{response:4,response_unit:"hours",resolution:2,resolution_unit:"days"},  low:{response:8,response_unit:"hours",resolution:5,resolution_unit:"days"} },
    change_request: { critical:{response:30,response_unit:"minutes",resolution:4,resolution_unit:"hours"}, high:{response:8,response_unit:"hours",resolution:1,resolution_unit:"days"},  medium:{response:1,response_unit:"days",resolution:3,resolution_unit:"days"},  low:{response:3,response_unit:"days",resolution:1,resolution_unit:"weeks"} },
  };
  const blank = Object.fromEntries(SLA_PRIORITIES.map(p => [p.key, { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" }]));
  return Object.fromEntries((keys ?? SLA_DEFAULT_TYPES.map(t => t.key)).map(k => [k, seed[k] ?? blank]));
}

const SLA_UNIT_LABELS = { minutes: "min", hours: "h", days: "d", weeks: "wk" };

function SlaMatrixEditor({ caseTypes, matrix, editing, onChangeCaseTypes, onChangeMatrix }) {
  const { t } = useT();
  const UNITS = ["minutes", "hours", "days", "weeks"];

  function setCellField(ctKey, pKey, field, value) {
    onChangeMatrix(prev => ({
      ...prev,
      [ctKey]: { ...(prev[ctKey] ?? {}), [pKey]: { ...(prev[ctKey]?.[pKey] ?? {}), [field]: value } }
    }));
  }

  function addCaseType() {
    const key = `type_${caseTypes.length + 1}`;
    onChangeCaseTypes(prev => [...prev, { key, label: t("sla.new_type_label") }]);
    onChangeMatrix(prev => ({
      ...prev,
      [key]: Object.fromEntries(SLA_PRIORITIES.map(p => [p.key, { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" }]))
    }));
  }

  function removeCaseType(key) {
    onChangeCaseTypes(prev => prev.filter(ct => ct.key !== key));
    onChangeMatrix(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm border-collapse min-w-[500px]">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-500 bg-gray-50 w-28 border-b border-gray-100">
              {t("sla.col_priority")}
            </th>
            {caseTypes.map(ct => (
              <th key={ct.key} className="px-4 py-3 bg-gray-50 border-b border-l border-gray-100 text-center">
                {editing ? (
                  <div className="flex items-center gap-1 min-w-[120px]">
                    <input
                      className="flex-1 text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2 py-1 text-center min-w-0"
                      value={ct.label}
                      onChange={e => onChangeCaseTypes(prev => prev.map(c => c.key === ct.key ? { ...c, label: e.target.value } : c))}
                    />
                    {caseTypes.length > 1 && (
                      <button onClick={() => removeCaseType(ct.key)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-gray-700">{ct.labelKey ? t(ct.labelKey) : ct.label}</span>
                )}
              </th>
            ))}
            {editing && (
              <th className="px-4 py-3 bg-gray-50 border-b border-l border-gray-100">
                <button onClick={addCaseType} className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">{t("sla.add_type")}</button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {SLA_PRIORITIES.map((p, pi) => (
            <tr key={p.key} className={pi % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
              <td className="px-4 py-3 border-b border-gray-100">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${p.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.dot}`} />
                  {t(`priority.${p.key}`)}
                </span>
              </td>
              {caseTypes.map(ct => {
                const cell = matrix?.[ct.key]?.[p.key] ?? { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" };
                return (
                  <td key={ct.key} className="px-4 py-3 border-b border-l border-gray-100">
                    {editing ? (
                      <div className="space-y-2">
                        {[["response", t("sla.col_response")],["resolution", t("sla.col_resolution")]].map(([field, lbl]) => (
                          <div key={field} className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 w-16 shrink-0">{lbl}</span>
                            <input type="number" min="1"
                              className="w-12 text-xs border border-gray-200 rounded-lg px-1.5 py-1 text-center"
                              value={cell[field]}
                              onChange={e => setCellField(ct.key, p.key, field, Number(e.target.value))} />
                            <select
                              className="text-xs border border-gray-200 rounded-lg px-1 py-1 bg-white"
                              value={cell[`${field}_unit`]}
                              onChange={e => setCellField(ct.key, p.key, `${field}_unit`, e.target.value)}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1 text-center">
                        <div className="text-xs flex items-center justify-center gap-1">
                          <RotateCcw size={10} className="text-blue-400" />
                          <span className="font-medium text-gray-800">{cell.response}</span>
                          <span className="text-gray-400">{SLA_UNIT_LABELS[cell.response_unit]}</span>
                        </div>
                        <div className="text-xs flex items-center justify-center gap-1">
                          <Check size={10} className="text-green-500" />
                          <span className="font-medium text-gray-800">{cell.resolution}</span>
                          <span className="text-gray-400">{SLA_UNIT_LABELS[cell.resolution_unit]}</span>
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
              {editing && <td className="border-b border-l border-gray-100" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INVOICE_STATUS_COLORS = {
  draft:   "bg-gray-100 text-gray-600",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function fmt(val) { return val?.replace(/_/g, " ") ?? "—"; }
function cap(val) { return val ? val.charAt(0).toUpperCase() + val.slice(1) : ""; }
const STATUS_LABEL_KEYS = { open:"status.open", estimated:"status.estimated", assigned:"status.assigned", in_progress:"status.in_progress", on_hold:"status.on_hold", completed:"status.completed", cancelled:"status.cancelled", draft:"status.draft", active:"status.active", pending:"status.pending", under_review:"status.under_review", accepted:"status.accepted", rejected:"status.rejected", withdrawn:"status.withdrawn" };
const AVAIL_LABEL_KEYS  = { full_time:"avail.full_time", part_time:"avail.part_time", contract:"avail.contract", project_based:"avail.project" };
const PRIORITY_LABEL_KEYS = { low:"priority.low", medium:"priority.medium", high:"priority.high", critical:"priority.critical" };
const INV_STATUS_LABEL_KEYS  = { draft:"status.draft", sent:"inv.status_sent", paid:"invoices.paid", overdue:"invoices.overdue" };
const WORK_MODE_LABEL_KEYS   = { remote:"cs.work_remote", on_site:"cs.work_onsite", onsite:"cs.work_onsite", hybrid:"cs.work_hybrid" };
const EXPERTISE_LABEL_KEYS   = { junior:"level.junior", mid:"level.mid", senior:"level.senior", expert:"level.expert", lead:"level.expert" };
const ROLE_LABEL_KEYS        = { admin:"auth.role_admin", manager:"auth.role_manager", consultant:"auth.role_consultant", client:"auth.role_client", key_user:"auth.role_key_user" };
const SLA_TIER_LABEL_KEYS    = { standard:"sla.tier_standard", premium:"sla.tier_premium", enterprise:"sla.tier_enterprise" };
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export {
  SLA_PRIORITIES,
  SLA_DEFAULT_TYPES,
  makeDefaultMatrix,
  SLA_UNIT_LABELS,
  SlaMatrixEditor,
  INVOICE_STATUS_COLORS,
  fmt,
  cap,
  STATUS_LABEL_KEYS,
  AVAIL_LABEL_KEYS,
  PRIORITY_LABEL_KEYS,
  INV_STATUS_LABEL_KEYS,
  WORK_MODE_LABEL_KEYS,
  EXPERTISE_LABEL_KEYS,
  ROLE_LABEL_KEYS,
  SLA_TIER_LABEL_KEYS,
  fmtDate,
  timeAgo,
};
