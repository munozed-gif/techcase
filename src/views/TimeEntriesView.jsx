import { useState, useEffect } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, Download } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useProjects } from "../hooks/useCoreHooks.js";
import { useCases } from "../hooks/useCaseHooks.js";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { EmptyState, Input, Select } from "../components/ui.jsx";
import { fmtDate } from "../lib/uiUtils.jsx";
import { ROLE_COLORS } from "../lib/businessConstants.js";

function TimeEntriesView({ auth }) {
  const { t } = useT();
  const { entries, loading, addTimeEntry, approveEntry, deleteEntry } = useTimeEntries();

  // Period
  const _today = new Date();
  const _todayStr = _today.toISOString().slice(0, 10);
  const [period, setPeriod]           = useState("month");
  const [dateFrom, setDateFrom]       = useState(() => new Date(_today.getFullYear(), _today.getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo]           = useState(() => new Date(_today.getFullYear(), _today.getMonth() + 1, 0).toISOString().slice(0, 10));

  // UI state
  const [tab, setTab]                       = useState("raw");
  const [filterConsultant, setFilterConsultant] = useState("");
  const [filterCase, setFilterCase]         = useState("");
  const [pendingOnly, setPendingOnly]       = useState(false);
  const [expandedConsultant, setExpandedConsultant] = useState(null);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState({ case_id: "", date: _todayStr, hours: 1, description: "", is_billable: true });
  const [saving, setSaving]                 = useState(false);
  const [approvingId, setApprovingId]       = useState(null);
  const [cases, setCases]                   = useState([]);
  const [consultantRates, setConsultantRates] = useState({});

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title, estimated_hours, budget").order("title");
      if (auth.isConsultant) {
        const { data: asgn } = await supabase.from("case_assignments").select("case_id").eq("consultant_id", auth.user?.id);
        const ids = (asgn ?? []).map(a => a.case_id);
        if (ids.length) q = q.in("id", ids); else { setCases([]); return; }
      }
      const { data } = await q;
      setCases(data ?? []);
    })();
  }, [auth]);

  useEffect(() => {
    if (auth.isConsultant) return;
    supabase.from("consultant_profiles").select("user_id, hourly_rate").then(({ data }) => {
      const map = {};
      (data ?? []).forEach(p => { map[p.user_id] = p.hourly_rate; });
      setConsultantRates(map);
    });
  }, [auth]);

  function setPeriodPreset(p) {
    setPeriod(p);
    const d = new Date();
    if (p === "week") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setDateFrom(mon.toISOString().slice(0, 10));
      setDateTo(sun.toISOString().slice(0, 10));
    } else if (p === "month") {
      setDateFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
      setDateTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else if (p === "lastmonth") {
      setDateFrom(new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10));
      setDateTo(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10));
    }
  }

  const filtered = entries.filter(e => {
    if (auth.isConsultant && e.consultant_id !== auth.user?.id) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    if (filterConsultant && e.consultant_id !== filterConsultant) return false;
    if (filterCase       && e.case_id        !== filterCase)       return false;
    if (pendingOnly      && e.is_approved)                         return false;
    return true;
  });

  const totalH    = filtered.reduce((s, e) => s + (e.hours ?? 0), 0);
  const billableH = filtered.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
  const pendingCount = filtered.filter(e => !e.is_approved).length;

  // Group by consultant
  const byConsultant = {};
  filtered.forEach(e => {
    const cid = e.consultant_id ?? 'unknown';
    if (!byConsultant[cid]) byConsultant[cid] = { id: cid, name: e.consultant?.full_name ?? 'Unknown', avatarUrl: e.consultant?.avatar_url ?? null, rate: consultantRates[cid], entries: [] };
    byConsultant[cid].entries.push(e);
  });
  const consultantGroups = Object.values(byConsultant);
  const pendingConsultants = consultantGroups.filter(g => g.entries.some(e => !e.is_approved)).length;

  // Group by case
  const byCase = {};
  filtered.forEach(e => {
    const cid = e.case_id ?? 'unknown';
    if (!byCase[cid]) byCase[cid] = { id: cid, title: e.case?.title ?? 'No case', estimatedHours: e.case?.estimated_hours, budget: e.case?.budget, entries: [] };
    byCase[cid].entries.push(e);
  });
  const caseGroups = Object.values(byCase).sort((a, b) =>
    b.entries.reduce((s, e) => s + (e.hours ?? 0), 0) - a.entries.reduce((s, e) => s + (e.hours ?? 0), 0)
  );

  // Dropdown options derived from all entries (not just filtered)
  const consultantOptions = [...new Map(entries.filter(e => e.consultant?.full_name).map(e => [e.consultant_id, e.consultant.full_name])).entries()];
  const caseOptions       = [...new Map(entries.filter(e => e.case?.title).map(e => [e.case_id, e.case.title])).entries()];

  function exportCSV() {
    const rows = [['Date', 'Consultant', 'Case', 'Hours', 'Billable', 'Approved', 'Description']];
    filtered.forEach(e => rows.push([e.date, e.consultant?.full_name ?? '', e.case?.title ?? '', e.hours,
      e.is_billable ? 'Yes' : 'No', e.is_approved ? 'Yes' : 'No', e.description ?? '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `time-entries-${dateFrom}-${dateTo}.csv`,
    });
    a.click();
  }

  async function bulkApprove(consultantId) {
    setApprovingId(consultantId);
    try {
      const pending = byConsultant[consultantId]?.entries.filter(e => !e.is_approved) ?? [];
      for (const e of pending) await approveEntry(e.id, true);
    } finally { setApprovingId(null); }
  }

  async function handleAdd() {
    if (!form.hours || !form.description.trim()) return;
    setSaving(true);
    try {
      await addTimeEntry({ ...form, hours: Number(form.hours) });
      setForm({ case_id: "", date: _todayStr, hours: 1, description: "", is_billable: true });
      setShowForm(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const TABS = [
    { id: "raw",            label: "Log" },
    { id: "by_case",        label: "By Case" },
    { id: "by_consultant",  label: "By Consultant" },
    ...((auth.isAdmin || auth.isManager || auth.isClient) ? [{ id: "budget", label: "Budget vs. Actual" }] : []),
  ];

  const renderRaw = () => {
    if (filtered.length === 0) return <EmptyState Icon={Clock} title={t("time.none")} subtitle={auth.isConsultant ? t("time.log_first") : t("time.none_yet")} />;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_date")}</th>
                {!auth.isConsultant && <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_consultant")}</th>}
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_case")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_hours")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_desc")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_billable")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("time.col_approved")}</th>
                {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                  {!auth.isConsultant && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <PersonAvatar name={e.consultant?.full_name} avatarUrl={e.consultant?.avatar_url} size={28} />
                        <span className="text-gray-700">{e.consultant?.full_name}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-3 text-gray-500">{e.case?.title ?? "—"}</td>
                  <td className="px-5 py-3 font-semibold text-blue-700 tabular-nums">{e.hours}h</td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{e.description}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {e.is_billable ? t("time.billable") : t("time.non_billable")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {e.is_approved
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><Check size={10} className="mr-0.5 inline" />{t("time.approved")}</span>
                      : (auth.isAdmin || auth.isManager)
                        ? <button onClick={() => approveEntry(e.id, true)} className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100">{t("time.approve")}</button>
                        : <span className="text-xs text-gray-400">{t("time.pending")}</span>
                    }
                  </td>
                  {(auth.isAdmin || auth.isManager) && (
                    <td className="px-5 py-3">
                      <button onClick={() => deleteEntry(e.id)} className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-0.5 rounded hover:bg-red-50">{t("action.delete")}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderByCase = () => {
    if (caseGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    return (
      <div className="space-y-4">
        {caseGroups.map(g => {
          const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
          const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
          const pending  = g.entries.filter(e => !e.is_approved).length;
          const burnPct  = g.estimatedHours ? Math.round((total / g.estimatedHours) * 100) : null;
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{g.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {g.entries.length} entr{g.entries.length !== 1 ? 'ies' : 'y'}
                    {pending > 0 && <span className="ml-2 text-amber-600 font-medium">· {pending} pending approval</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-blue-700 text-xl tabular-nums">{total.toFixed(1)}h</div>
                  <div className="text-xs text-gray-400">{billable.toFixed(1)}h billable</div>
                </div>
              </div>
              {g.estimatedHours && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="text-gray-400">vs. estimated {g.estimatedHours}h</span>
                    <span className={`font-semibold ${burnPct > 90 ? "text-red-600" : burnPct > 70 ? "text-amber-600" : "text-green-600"}`}>{burnPct}% used</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${burnPct > 90 ? "bg-red-500" : burnPct > 70 ? "bg-amber-400" : "bg-green-500"}`}
                      style={{ width: `${Math.min(burnPct, 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-2 divide-y divide-gray-50">
                {g.entries.slice(0, 6).map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 text-xs text-gray-500">
                    <span className="truncate max-w-sm">{fmtDate(e.date)}{!auth.isConsultant ? ` · ${e.consultant?.full_name ?? ''}` : ''} · {e.description}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="font-semibold text-gray-700 tabular-nums">{e.hours}h</span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.is_approved ? "bg-green-400" : "bg-amber-400"}`} />
                    </div>
                  </div>
                ))}
                {g.entries.length > 6 && <div className="pt-2 text-xs text-gray-400">+{g.entries.length - 6} more entries</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderByConsultant = () => {
    if (consultantGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    return (
      <div className="space-y-3">
        {consultantGroups.map(g => {
          const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
          const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
          const pending  = g.entries.filter(e => !e.is_approved).length;
          const allOk    = pending === 0;
          const amount   = g.rate ? billable * g.rate : null;
          const isOpen   = expandedConsultant === g.id;

          const byCaseInner = {};
          g.entries.forEach(e => {
            const cid = e.case_id ?? 'x';
            if (!byCaseInner[cid]) byCaseInner[cid] = { title: e.case?.title ?? 'No case', hours: 0, billable: 0 };
            byCaseInner[cid].hours += e.hours ?? 0;
            if (e.is_billable) byCaseInner[cid].billable += e.hours ?? 0;
          });

          return (
            <div key={g.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${
              allOk ? "border-green-200" : pending > 0 ? "border-amber-200" : "border-gray-100"
            }`}>
              {/* Consultant header row */}
              <div className="p-5 flex items-center gap-4 cursor-pointer select-none" onClick={() => setExpandedConsultant(isOpen ? null : g.id)}>
                <PersonAvatar name={g.name} avatarUrl={g.avatarUrl} size={40} className="rounded-2xl" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{g.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {Object.keys(byCaseInner).length} case{Object.keys(byCaseInner).length !== 1 ? 's' : ''} · {g.entries.length} entries
                    {g.rate && <span className="ml-1">· ${g.rate}/h</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 mr-2">
                  <div className="font-bold text-blue-700 text-xl tabular-nums">{total.toFixed(1)}h</div>
                  {amount != null && <div className="text-xs text-green-600 font-semibold">${amount.toLocaleString()}</div>}
                  {allOk
                    ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1 justify-end mt-0.5"><Check size={10} />All approved</span>
                    : <span className="text-xs text-amber-600 font-medium mt-0.5 block">{pending} pending</span>
                  }
                </div>
                {(auth.isAdmin || auth.isManager) && !allOk && (
                  <button onClick={ev => { ev.stopPropagation(); bulkApprove(g.id); }}
                    disabled={approvingId === g.id}
                    className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                    {approvingId === g.id ? "…" : "Approve all"}
                  </button>
                )}
                <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  {/* Hours by case summary */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Hours by case</p>
                  <div className="space-y-1 mb-4">
                    {Object.values(byCaseInner).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate max-w-xs">{c.title}</span>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs text-gray-400 tabular-nums">{c.billable.toFixed(1)}h billable</span>
                          <span className="font-semibold text-gray-900 w-12 text-right tabular-nums">{c.hours.toFixed(1)}h</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Full entry table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          <th className="text-left pb-2 font-semibold">Date</th>
                          <th className="text-left pb-2 font-semibold">Case</th>
                          <th className="text-left pb-2 font-semibold">Description</th>
                          <th className="text-right pb-2 font-semibold">Hours</th>
                          <th className="text-center pb-2 font-semibold">Billable</th>
                          <th className="text-center pb-2 font-semibold">Status</th>
                          {(auth.isAdmin || auth.isManager) && <th className="pb-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.entries.map(e => (
                          <tr key={e.id} className={e.is_approved ? "" : "bg-amber-50/40"}>
                            <td className="py-2 pr-3 whitespace-nowrap text-gray-500 tabular-nums">{fmtDate(e.date)}</td>
                            <td className="py-2 pr-3 text-gray-600 max-w-[130px] truncate">{e.case?.title ?? '—'}</td>
                            <td className="py-2 pr-3 text-gray-500 max-w-[190px] truncate">{e.description}</td>
                            <td className="py-2 pr-3 font-semibold text-blue-700 text-right tabular-nums whitespace-nowrap">{e.hours}h</td>
                            <td className="py-2 pr-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                {e.is_billable ? t("label.yes") : t("label.no")}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-center">
                              {e.is_approved
                                ? <span className="text-green-600 font-bold">✓</span>
                                : (auth.isAdmin || auth.isManager)
                                  ? <button onClick={() => approveEntry(e.id, true)} className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-xs hover:bg-amber-100">{t("action.approve")}</button>
                                  : <span className="text-amber-500">{t("label.pending")}</span>
                              }
                            </td>
                            {(auth.isAdmin || auth.isManager) && (
                              <td className="py-2">
                                <button onClick={() => deleteEntry(e.id)} className="text-red-300 hover:text-red-500">✕</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Payroll total */}
                  {allOk && amount != null && (
                    <div className="mt-4 pt-3 border-t border-green-100 flex items-center justify-between bg-green-50/50 rounded-xl px-3 py-2">
                      <span className="text-sm text-gray-600">Billable total · {billable.toFixed(1)}h @ ${g.rate}/h</span>
                      <span className="font-bold text-green-700 text-base tabular-nums">${amount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBudget = () => {
    if (caseGroups.length === 0) return <EmptyState Icon={Clock} title="No entries" subtitle="No time entries for this period" />;
    const grandTotal    = caseGroups.reduce((s, g) => s + g.entries.reduce((ss, e) => ss + (e.hours ?? 0), 0), 0);
    const grandBillable = caseGroups.reduce((s, g) => s + g.entries.filter(e => e.is_billable).reduce((ss, e) => ss + (e.hours ?? 0), 0), 0);
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Case</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Budget</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Est. Hours</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Logged</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Billable</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase w-36">Burn</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {caseGroups.map(g => {
                const total    = g.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
                const billable = g.entries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);
                const burnPct  = g.estimatedHours ? Math.round((total / g.estimatedHours) * 100) : null;
                const pending  = g.entries.filter(e => !e.is_approved).length;
                return (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{g.title}</div>
                      {pending > 0 && <div className="text-xs text-amber-600 mt-0.5">{pending} pending approval</div>}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{g.budget ? `$${Number(g.budget).toLocaleString()}` : '—'}</td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{g.estimatedHours ? `${g.estimatedHours}h` : '—'}</td>
                    <td className="px-5 py-4 text-right font-bold text-blue-700 tabular-nums">{total.toFixed(1)}h</td>
                    <td className="px-5 py-4 text-right text-gray-600 tabular-nums">{billable.toFixed(1)}h</td>
                    <td className="px-5 py-4">
                      {burnPct != null ? (
                        <div>
                          <div className="text-xs font-semibold mb-1 tabular-nums">
                            <span className={burnPct > 90 ? "text-red-600" : burnPct > 70 ? "text-amber-600" : "text-green-600"}>{burnPct}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${burnPct > 90 ? "bg-red-500" : burnPct > 70 ? "bg-amber-400" : "bg-green-500"}`}
                              style={{ width: `${Math.min(burnPct, 100)}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-gray-400 text-xs">No estimate</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {burnPct == null
                        ? <span className="text-xs text-gray-400">—</span>
                        : burnPct > 100
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Over budget</span>
                          : burnPct > 80
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">At risk</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">On track</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-5 py-3 font-bold text-gray-800" colSpan={3}>Total</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700 tabular-nums">{grandTotal.toFixed(1)}h</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700 tabular-nums">{grandBillable.toFixed(1)}h</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("time.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} · {totalH.toFixed(1)}h total · {billableH.toFixed(1)}h billable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
            <Download size={14} />Export CSV
          </button>
          {auth.isConsultant && (
            <button onClick={() => setShowForm(p => !p)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              {t("time.log")}
            </button>
          )}
        </div>
      </div>

      {/* Pending approval banner */}
      {(auth.isAdmin || auth.isManager) && pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            <strong>{pendingCount}</strong> entr{pendingCount !== 1 ? 'ies' : 'y'} from <strong>{pendingConsultants}</strong> consultant{pendingConsultants !== 1 ? 's' : ''} pending approval in this period
          </span>
          <button onClick={() => { setTab("by_consultant"); setPendingOnly(true); }}
            className="ml-auto text-xs text-amber-700 font-semibold underline whitespace-nowrap">
            Review →
          </button>
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {[
          { key: "week",      label: "This Week" },
          { key: "month",     label: "This Month" },
          { key: "lastmonth", label: "Last Month" },
          { key: "custom",    label: "Custom" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setPeriodPreset(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
              period === key ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-blue-300"
            }`}>
            {label}
          </button>
        ))}
        {period === "custom" && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === tb.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Inline filters (Log + By Consultant tabs) */}
      {(tab === "raw" || tab === "by_consultant") && (
        <div className="flex flex-wrap gap-2 mb-4">
          {!auth.isConsultant && consultantOptions.length > 1 && (
            <select value={filterConsultant} onChange={e => setFilterConsultant(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All consultants</option>
              {consultantOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {caseOptions.length > 1 && (
            <select value={filterCase} onChange={e => setFilterCase(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All cases</option>
              {caseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          )}
          <button onClick={() => setPendingOnly(p => !p)}
            className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
              pendingOnly ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:border-amber-300"
            }`}>
            {pendingOnly ? `Pending only (${filtered.length})` : "Pending only"}
          </button>
        </div>
      )}

      {/* Log time form */}
      {showForm && auth.isConsultant && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t("time.form_title")}</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("label.case")}</label>
            <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">{t("time.select_case")}</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("label.date")} type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <Input label={t("label.hours")} type="number" min="0.25" step="0.25" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
          </div>
          <Textarea label={t("label.description")} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t("time.worked_on")} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-4">
            <input type="checkbox" checked={form.is_billable} onChange={e => setForm(p => ({ ...p, is_billable: e.target.checked }))} className="rounded accent-blue-600" />
            {t("time.billable")}
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("time.saving") : t("action.log_time")}
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === "raw"           && renderRaw()}
      {tab === "by_case"       && renderByCase()}
      {tab === "by_consultant" && renderByConsultant()}
      {tab === "budget"        && renderBudget()}
    </div>
  );
}

export { TimeEntriesView };
