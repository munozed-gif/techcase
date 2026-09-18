import { useState, useEffect, useMemo, useRef } from "react";
import {
  Building2, Calendar, CalendarDays, CalendarRange, CheckCircle2,
  ChevronDown, ClipboardList, Code2, Download, FolderKanban, FolderOpen,
  Inbox, Layers, ListChecks, PauseCircle, Search, Star, Tag, Trash2,
  UserCheck, Users, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useCases } from "../hooks/useCaseHooks.js";
import { useProjects } from "../hooks/useCoreHooks.js";
import { filterCasesByVisibility, usePlanConfig, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { logEvent } from "../lib/utils.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { EmptyState, Input } from "../components/ui.jsx";
import { fmtDate, fmt, cap, STATUS_LABEL_KEYS, PRIORITY_LABEL_KEYS, WORK_MODE_LABEL_KEYS } from "../lib/uiUtils.jsx";
import { ApplyWizard } from "./ApplyWizard.jsx";
import { CreateCaseWizard } from "../components/CreateCaseWizard.jsx";
import { CaseFeedbackModal } from "../components/RankingComponents.jsx";
import { useFavorites } from "../hooks/useProfileHooks.js";
import { CaseDetail } from "./CaseDetail.jsx";
import { ProjectAvatar } from "./Projects.jsx";
import {
  STATUS_COLORS, CASE_CARD_COLORS, PRIORITY_COLORS, STATUS_CARD_ICONS,
  ROLE_COLORS, PROJECT_TYPES, SAP_AREAS, INDUSTRY_AREAS,
} from "../lib/businessConstants.js";

function CasesView({ auth, initialCaseId }) {
  const { t } = useT();
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("");
  const [periodFilter, setPeriod]     = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedCase, setSelected]   = useState(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [feedbackCase, setFeedbackCase] = useState(null);
  const { isFavorite, toggle }        = useFavorites();
  const [selectedCases, setSelectedCases]     = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkProcessing, setBulkProcessing]   = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen]   = useState(false);

  function selectClient(id) {
    setClientFilter(id);
    setProjectFilter(""); // reset project when client changes
  }

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { cases: _rawCasesCV, loading, createCase, updateCase, deleteCase, refetch, hasMore, loadMore } = useCases({
    search: debouncedSearch || undefined,
    client_id: auth.isClient ? auth.user?.id : undefined,
  });
  const _casesViewVisCfg = useVisibilitySettings();
  const cases = filterCasesByVisibility(_rawCasesCV, auth, _casesViewVisCfg);

  // Open a specific case when navigated from GlobalSearch
  const [initialCaseOpened, setInitialCaseOpened] = useState(false);
  useEffect(() => {
    if (!initialCaseId || initialCaseOpened || loading) return;
    const match = cases.find(c => c.id === initialCaseId);
    if (match) { setSelected(match); setInitialCaseOpened(true); return; }
    if (cases.length > 0) {
      supabase.from('cases').select(`*, client:client_id(id, full_name, email, client_profiles(company_name)), manager:manager_id(id, full_name, email), case_assignments(consultant_id, time_commitment, users:consultant_id(id, full_name, avatar_url)), case_key_users(user_id, area, users:user_id(full_name, email, role)), applications(count)`).eq('id', initialCaseId).single()
        .then(({ data }) => { if (data) { setSelected(data); setInitialCaseOpened(true); } });
    }
  }, [initialCaseId, initialCaseOpened, loading, cases]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consultants and key users see only their linked cases.
  // Headhunters see resource-need cases or cases assigned to them.
  const visibleCases = auth.isConsultant
    ? cases.filter(c => c.case_assignments?.some(a => a.consultant_id === auth.user?.id))
    : auth.isKeyUser
    ? cases.filter(c => c.case_key_users?.some(ku => ku.user_id === auth.user?.id))
    : auth.isHeadhunter
    ? cases.filter(c => c.case_type === "resource_need" || c.head_hunter_id === auth.user?.id)
    : cases;

  // ── Client / Project chip data (admin+manager only) ──────────────────────
  const clientChips = useMemo(() => {
    if (!auth.isAdmin && !auth.isManager) return [];
    const map = new Map();
    visibleCases.forEach(c => {
      if (!c.client_id) return;
      const name = c.client?.client_profiles?.company_name || c.client?.full_name || c.client_name || c.client_id;
      const ts = c.updated_at || c.created_at || '';
      if (!map.has(c.client_id) || ts > map.get(c.client_id).latest) {
        map.set(c.client_id, { id: c.client_id, name, latest: ts, count: 0 });
      }
      map.get(c.client_id).count += 1;
    });
    return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [visibleCases, auth.isAdmin, auth.isManager]);

  const projectChips = useMemo(() => {
    if (!clientFilter) return [];
    const map = new Map();
    visibleCases.filter(c => c.client_id === clientFilter).forEach(c => {
      if (!c.project_id) return;
      const name = c.project?.name || c.project_id;
      if (!map.has(c.project_id)) map.set(c.project_id, { id: c.project_id, name, count: 0 });
      map.get(c.project_id).count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [visibleCases, clientFilter]);

  // ── Filter chain ─────────────────────────────────────────────────────────
  const clientFiltered = clientFilter ? visibleCases.filter(c => c.client_id === clientFilter) : visibleCases;
  const projectFiltered2 = projectFilter ? clientFiltered.filter(c => c.project_id === projectFilter) : clientFiltered;
  const statusFiltered = statusFilter ? projectFiltered2.filter(c => c.status === statusFilter) : projectFiltered2;
  const periodFiltered = (() => {
    if (!periodFilter) return statusFiltered;
    const now = new Date();
    const startOfMonth = (y, m) => new Date(y, m, 1);
    if (periodFilter === "this_month") {
      const start = startOfMonth(now.getFullYear(), now.getMonth());
      return statusFiltered.filter(c => new Date(c.created_at) >= start);
    }
    if (periodFilter === "last_month") {
      const start = startOfMonth(now.getFullYear(), now.getMonth() - 1);
      const end   = startOfMonth(now.getFullYear(), now.getMonth());
      return statusFiltered.filter(c => { const d = new Date(c.created_at); return d >= start && d < end; });
    }
    if (periodFilter === "last_3_months") {
      const start = startOfMonth(now.getFullYear(), now.getMonth() - 2);
      return statusFiltered.filter(c => new Date(c.created_at) >= start);
    }
    return statusFiltered;
  })();
  const displayed = showFavOnly ? periodFiltered.filter(c => isFavorite(c.id)) : periodFiltered;

  async function handleStatusChange(caseId, status, extras = {}) {
    await updateCase(caseId, { status, ...extras });
    const TERMINAL_STATUSES = ["completed", "terminated", "cancelled", "closed", "approved"];
    if (selectedCase?.id === caseId) {
      setSelected({ ...selectedCase, status });
    }
    if (TERMINAL_STATUSES.includes(status) && (auth.isAdmin || auth.isManager || auth.isClient)) {
      const fullCase = cases.find(c => c.id === caseId) ?? selectedCase;
      if (fullCase?.case_assignments?.length) {
        setFeedbackCase({ ...fullCase, status });
      }
    }
  }

  function toggleCaseSelect(id, e) {
    e.stopPropagation();
    setSelectedCases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedCases.size === displayed.length && displayed.length > 0) {
      setSelectedCases(new Set());
    } else {
      setSelectedCases(new Set(displayed.map(c => c.id)));
    }
  }
  async function handleBulkStatusChange(newStatus) {
    setBulkProcessing(true);
    setBulkStatusOpen(false);
    const ids = [...selectedCases];
    try {
      await supabase.from('cases').update({ status: newStatus }).in('id', ids);
      ids.forEach(id => logEvent('case.status_bulk_changed', { entityType: 'case', entityId: id, newValue: newStatus }));
      setSelectedCases(new Set());
      refetch();
    } catch {}
    setBulkProcessing(false);
  }
  function handleBulkExport() {
    const headers = ['ID', 'Title', 'Status', 'Client', 'Created'];
    const rows = [...selectedCases].map(id => {
      const c = cases.find(x => x.id === id);
      if (!c) return [id, '', '', '', ''];
      return [c.id, c.title, c.status, c.client?.full_name ?? c.client_name ?? '', c.created_at?.slice(0,10) ?? ''];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cases.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  async function handleBulkDelete() {
    setBulkProcessing(true);
    const ids = [...selectedCases];
    try {
      await supabase.from('cases').delete().in('id', ids);
      ids.forEach(id => logEvent('case.deleted_bulk', { entityType: 'case', entityId: id }));
      setSelectedCases(new Set());
      setShowDeleteConfirm(false);
      refetch();
    } catch {}
    setBulkProcessing(false);
  }

  if (loading) return <Spinner />;

  if (showCreate) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <CreateCaseWizard
          auth={auth}
          createCase={createCase}
          onComplete={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    );
  }

  if (selectedCase) {
    return (
      <>
        {feedbackCase && (
          <CaseFeedbackModal caseData={feedbackCase} onClose={() => setFeedbackCase(null)} />
        )}
        <CaseDetail
          caseData={selectedCase}
          auth={auth}
          onBack={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDelete={async () => { await deleteCase(selectedCase.id); setSelected(null); }}
          onUpdate={async (id, payload) => {
            await updateCase(id, payload);
            setSelected(prev => ({ ...prev, ...payload }));
          }}
        />
      </>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("cases.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t(displayed.length !== 1 ? "count.case_many" : "count.case_one").replace("{n}", displayed.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            {t("cases.new")}
          </button>
        )}
        {auth.isHeadhunter && (
          <button onClick={() => setShowCreate(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            New Resource Need
          </button>
        )}
      </div>

      {/* Search + saved toggle */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("cases.search")}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {auth.isConsultant && (
          <button onClick={() => setShowFavOnly(p => !p)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              showFavOnly ? "bg-yellow-50 border-yellow-300 text-yellow-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            <Star className={`w-3.5 h-3.5 ${showFavOnly ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} /> {t("cases.saved")}
          </button>
        )}
      </div>

      {/* Client chip row (admin/manager only) */}
      {(auth.isAdmin || auth.isManager) && clientChips.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => selectClient("")}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                !clientFilter
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              <Building2 size={11} /> All clients
              <span className={`ml-1 text-[10px] ${!clientFilter ? "opacity-70" : "text-gray-400"}`}>{visibleCases.length}</span>
            </button>
            {clientChips.map(cl => (
              <button key={cl.id}
                onClick={() => selectClient(cl.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  clientFilter === cl.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700"
                }`}>
                <Building2 size={11} className="flex-shrink-0" />
                <span className="truncate max-w-[120px]">{cl.name}</span>
                <span className={`text-[10px] ${clientFilter === cl.id ? "opacity-70" : "text-gray-400"}`}>{cl.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project chip row (appears when a client is selected) */}
      {(auth.isAdmin || auth.isManager) && clientFilter && projectChips.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none pl-1">
            <span className="flex-shrink-0 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Projects:</span>
            <button
              onClick={() => setProjectFilter("")}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                !projectFilter
                  ? "bg-blue-100 text-blue-700 border-blue-300"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}>
              All projects
            </button>
            {projectChips.map(pr => (
              <button key={pr.id}
                onClick={() => setProjectFilter(f => f === pr.id ? "" : pr.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  projectFilter === pr.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700"
                }`}>
                <FolderKanban size={10} className="flex-shrink-0" />
                <span className="truncate max-w-[140px]">{pr.name}</span>
                <span className={`text-[10px] ${projectFilter === pr.id ? "opacity-70" : "text-gray-400"}`}>{pr.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Status + Period filter buttons ── */}
      {(() => {
        const STATUS_DEFS = [
          { val: "open",           label: t("status.open"),           color: "#16a34a", dark: "#15803d", bg: "#f0fdf4", border: "#86efac", Icon: Inbox },
          { val: "estimated",      label: t("status.estimated"),      color: "#0d9488", dark: "#0f766e", bg: "#f0fdfa", border: "#5eead4", Icon: ClipboardList },
          { val: "assigned",       label: t("status.assigned"),       color: "#7c3aed", dark: "#6d28d9", bg: "#faf5ff", border: "#c4b5fd", Icon: UserCheck },
          { val: "in_progress",    label: t("status.in_progress"),    color: "#2563eb", dark: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", Icon: Zap },
          { val: "on_hold",        label: t("status.on_hold"),        color: "#b45309", dark: "#92400e", bg: "#fffbeb", border: "#fcd34d", Icon: PauseCircle },
          { val: "technical_test", label: t("status.technical_test"), color: "#0891b2", dark: "#0e7490", bg: "#ecfeff", border: "#67e8f9", Icon: Code2 },
          { val: "functional_test",label: t("status.functional_test"),color: "#d97706", dark: "#b45309", bg: "#fffbeb", border: "#fde68a", Icon: ListChecks },
          { val: "user_test",      label: t("status.user_test"),      color: "#ea580c", dark: "#c2410c", bg: "#fff7ed", border: "#fed7aa", Icon: Users },
          { val: "completed",      label: t("status.completed"),      color: "#0d9488", dark: "#0f766e", bg: "#f0fdfa", border: "#5eead4", Icon: CheckCircle2 },
          { val: "cancelled",      label: t("status.cancelled"),      color: "#dc2626", dark: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", Icon: XCircle },
        ]
          .map(s => ({ ...s, count: projectFiltered2.filter(c => c.status === s.val).length }))
          .filter(s => s.count > 0);

        const PERIODS = [
          { val: "",             label: "All time",     Icon: Layers },
          { val: "this_month",   label: "This month",   Icon: CalendarDays },
          { val: "last_month",   label: "Last month",   Icon: Calendar },
          { val: "last_3_months",label: "Last 3 months",Icon: CalendarRange },
        ];

        return (
          <div className="space-y-2 mb-5">
            {/* Status buttons — auto-wrap grid, min 110px per button */}
            {STATUS_DEFS.length > 0 && (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                <button
                  onClick={() => setStatus("")}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border font-semibold transition-all"
                  style={statusFilter === ""
                    ? { background: "#dbeafe", color: "#1d4ed8", borderColor: "#2563eb" }
                    : { background: "#f8fafc", color: "#64748b", borderColor: "#e2e8f0" }}>
                  <Layers size={16} />
                  <span className="text-xs leading-none">All <span className="opacity-70">{projectFiltered2.length}</span></span>
                </button>
                {STATUS_DEFS.map(s => {
                  const active = statusFilter === s.val;
                  const { Icon } = s;
                  return (
                    <button key={s.val}
                      onClick={() => setStatus(f => f === s.val ? "" : s.val)}
                      className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border font-semibold transition-all"
                      style={active
                        ? { background: s.color + "22", color: s.dark, borderColor: s.color }
                        : { background: s.bg, color: s.color, borderColor: s.border }}>
                      <Icon size={16} />
                      <span className="text-xs leading-none text-center px-1 truncate w-full">{s.label} <span className="opacity-70">{s.count}</span></span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Period buttons — full-width, always 4 cols */}
            <div className="grid grid-cols-4 gap-1.5">
              {PERIODS.map(p => {
                const active = periodFilter === p.val;
                const { Icon } = p;
                return (
                  <button key={p.val}
                    onClick={() => setPeriod(f => f === p.val ? "" : p.val)}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border font-semibold transition-all"
                    style={active
                      ? { background: "#dbeafe", color: "#1d4ed8", borderColor: "#2563eb" }
                      : { background: "#f8fafc", color: "#64748b", borderColor: "#e2e8f0" }}>
                    <Icon size={16} />
                    <span className="text-xs leading-none text-center px-1">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Cases Grid */}
      {(auth.isAdmin || auth.isManager) && displayed.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <input type="checkbox"
            checked={selectedCases.size === displayed.length && displayed.length > 0}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer accent-blue-600"
            title={t("bulk.select_all")} />
          <span className="text-xs text-gray-500">{t("bulk.select_all")}</span>
        </div>
      )}
      {displayed.length === 0 ? (
        <EmptyState Icon={FolderOpen} title={t("cases.no_cases")} subtitle={t("cases.no_cases_hint")} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-4 grid gap-3">
          {displayed.map(c => (
            <div key={c.id}
              className="rounded-2xl cursor-pointer transition-all hover:shadow-md p-5"
              style={(() => { const cc = selectedCases.has(c.id) ? { border: '#bfdbfe', bg: '#eff6ff' } : (CASE_CARD_COLORS[c.status] ?? { border: '#e5e7eb', bg: '#ffffff' }); return { border: `1.5px solid ${cc.border}`, backgroundColor: cc.bg }; })()}
              onClick={() => setSelected(c)}>
              {(() => {
                const StatusIcon = STATUS_CARD_ICONS[c.status] ?? Tag;
                const cc = CASE_CARD_COLORS[c.status] ?? { bar: "#9ca3af", bg: "#f9fafb" };
                return (
                  <div className="flex items-center gap-3">
                    {(auth.isAdmin || auth.isManager) && (
                      <div className="self-start pt-1 shrink-0">
                        <input type="checkbox"
                          checked={selectedCases.has(c.id)}
                          onChange={() => {}}
                          onClick={e => toggleCaseSelect(c.id, e)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer accent-blue-600" />
                      </div>
                    )}
                    <ProjectAvatar project={c.project ?? { name: c.client?.client_profiles?.company_name || c.client?.full_name || c.title, client: c.client }} size={40} className="flex-shrink-0 self-start mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{c.title}</h3>
                        {c.priority && <span className="text-xs text-gray-400 font-medium capitalize flex-shrink-0">{PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}</span>}
                      </div>
                      {c.project?.name && (
                        <p className="text-xs text-blue-600 font-medium truncate flex items-center gap-1 mb-1">
                          <FolderKanban size={11} className="flex-shrink-0" />{c.project.name}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 line-clamp-2">{c.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 flex-wrap">
                        {c.skills_required?.length > 0 && (
                          <span>{t("label.skills")}: {c.skills_required.slice(0, 3).join(", ")}{c.skills_required.length > 3 ? "…" : ""}</span>
                        )}
                        {c.due_date && <span>{t("label.due")} {fmtDate(c.due_date)}</span>}
                        {c.budget && <span>{t("label.budget")}: ${Number(c.budget).toLocaleString()}</span>}
                        <span>{t((c.applications?.length ?? 0) !== 1 ? "case.applicants_many" : "case.applicants_one").replace("{n}", c.applications?.length ?? 0)}</span>
                        {c.status === "assigned" && c.start_date && (() => {
                          const d = Math.ceil((new Date(c.start_date + "T00:00:00") - Date.now()) / 86400000);
                          if (d > 3) return null;
                          const late = d < 0;
                          const txt = late ? t("case.start_overdue").replace("{n}", Math.abs(d)) : d === 0 ? t("case.starts_today") : d === 1 ? t("case.starts_tomorrow") : t("case.starts_in").replace("{n}", d);
                          return <span className={`px-2 py-0.5 rounded-lg font-semibold ${late ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{txt}</span>;
                        })()}
                      </div>
                    </div>
                    {/* Right: status square (light tint bg, colored icon) + star */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0 self-center ml-1">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: cc.bar + "33", color: cc.bar }}>
                        <StatusIcon size={22} strokeWidth={2} />
                      </div>
                      {auth.isConsultant && (
                        <button onClick={e => { e.stopPropagation(); toggle(c.id); }}
                          className="transition-colors">
                          <Star className={`w-4 h-4 ${isFavorite(c.id) ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-400"}`} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={loading}
            className="px-5 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {(auth.isAdmin || auth.isManager) && selectedCases.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex-wrap">
          <span className="text-sm font-medium">{t("bulk.selected").replace("{n}", selectedCases.size)}</span>
          <div className="w-px h-5 bg-gray-600" />
          {/* Change Status */}
          <div className="relative">
            <button onClick={() => setBulkStatusOpen(p => !p)} disabled={bulkProcessing}
              className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl px-3 py-1.5 disabled:opacity-50 transition-colors">
              <ChevronDown className="w-3.5 h-3.5" />{t("bulk.change_status")}
            </button>
            {bulkStatusOpen && (
              <div className="absolute bottom-full mb-2 left-0 bg-white text-gray-900 rounded-xl shadow-lg py-1 min-w-[9rem] z-10">
                {["open","in_progress","on_hold","completed","cancelled"].map(s => (
                  <button key={s} onClick={() => handleBulkStatusChange(s)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
                    {STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : cap(fmt(s))}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export CSV */}
          <button onClick={handleBulkExport} disabled={bulkProcessing}
            className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl px-3 py-1.5 disabled:opacity-50 transition-colors">
            <Download className="w-3.5 h-3.5" />{t("bulk.export_csv")}
          </button>
          {/* Delete — admin only */}
          {auth.isAdmin && (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={bulkProcessing}
              className="flex items-center gap-1.5 text-sm bg-red-600 hover:bg-red-500 rounded-xl px-3 py-1.5 disabled:opacity-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />{t("bulk.delete")}
            </button>
          )}
          {bulkProcessing && <span className="text-xs text-gray-300">{t("bulk.processing")}</span>}
          <div className="w-px h-5 bg-gray-600" />
          <button onClick={() => setSelectedCases(new Set())} disabled={bulkProcessing}
            className="text-sm text-gray-300 hover:text-white px-2 disabled:opacity-50">
            {t("bulk.deselect")}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-900 text-lg">{t("bulk.delete_confirm").replace("{n}", selectedCases.size)}</h3>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={bulkProcessing}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
                {t("action.cancel")}
              </button>
              <button onClick={handleBulkDelete} disabled={bulkProcessing}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40">
                {bulkProcessing ? t("bulk.processing") : t("bulk.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export { CasesView };
