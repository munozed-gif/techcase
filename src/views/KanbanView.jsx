import { useState } from "react";
import { FolderKanban, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useCases } from "../hooks/useCaseHooks.js";
import { useProjects } from "../hooks/useCoreHooks.js";
import { filterCasesByVisibility, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { logEvent } from "../lib/utils.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { PRIORITY_LABEL_KEYS, STATUS_LABEL_KEYS, cap, fmtDate } from "../lib/uiUtils.jsx";
import { CASE_CARD_COLORS, LIFECYCLE_PRESETS, PRIORITY_COLORS, STATUS_COLORS } from "../lib/businessConstants.js";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { CaseDetail } from "./CaseDetail.jsx";
import { PersonAvatar, ProjectAvatar } from "./Projects.jsx";

const PRIORITY_DOT = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#6b7280" };

function KanbanCard({ c, cardSize, cols, canMove, movingId, onSelect, onMove }) {
  const priority1 = cap(c.priority)?.[0] ?? "?";
  const company   = c.client?.client_profiles?.company_name;
  const project   = c.project ?? { name: company || c.client?.full_name || c.title, client: c.client };

  const MoveSelect = canMove ? (
    <div className="mt-2 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
      <select disabled={movingId === c.id}
        value={c.status}
        onChange={e => onMove(c.id, e.target.value)}
        className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
        {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
      </select>
    </div>
  ) : null;

  if (cardSize === "s") {
    return (
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-2 py-1.5 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-1.5 min-w-0"
        onClick={() => onSelect(c)}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIORITY_DOT[c.priority] ?? "#6b7280" }} />
        <span className="text-xs text-gray-800 font-medium truncate flex-1 min-w-0">{c.title}</span>
      </div>
    );
  }

  if (cardSize === "l") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onSelect(c)}>
        <div className="flex items-start gap-2 mb-2">
          <ProjectAvatar project={project} size={36} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <span className="font-semibold text-sm text-gray-900 line-clamp-3 flex-1 break-words">{c.title}</span>
              <Badge className={`${PRIORITY_COLORS[c.priority]} flex-shrink-0 text-xs ml-1`}>{priority1}</Badge>
            </div>
            {company && <div className="text-xs text-gray-400 mt-0.5 truncate">{company}</div>}
          </div>
        </div>
        {c.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">{c.description}</p>}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1">
            {(c.case_assignments ?? []).slice(0, 4).map((a, i) => (
              <PersonAvatar key={i} name={a.users?.full_name} avatarUrl={a.users?.avatar_url} size={26} className="border-2 border-white" />
            ))}
          </div>
          {c.due_date && <span className="text-xs text-gray-400">{fmtDate(c.due_date)}</span>}
        </div>
        {canMove && (
          <div className="mt-3 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
            <select disabled={movingId === c.id} value={c.status} onChange={e => onMove(c.id, e.target.value)}
              className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
              {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  // Medium (default)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(c)}>
      <div className="flex items-start gap-2 mb-1">
        <ProjectAvatar project={project} size={32} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="font-medium text-sm text-gray-900 line-clamp-2 flex-1 break-words">{c.title}</span>
            <Badge className={`${PRIORITY_COLORS[c.priority]} flex-shrink-0 text-xs`}>{priority1}</Badge>
          </div>
          {company && <div className="text-xs text-gray-400 mt-0.5 truncate">{company}</div>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex -space-x-1">
          {(c.case_assignments ?? []).slice(0, 3).map((a, i) => (
            <PersonAvatar key={i} name={a.users?.full_name} avatarUrl={a.users?.avatar_url} size={24} className="border-2 border-white" />
          ))}
        </div>
        {c.due_date && <span className="text-xs text-gray-400">{fmtDate(c.due_date)}</span>}
      </div>
      {canMove && (
        <div className="mt-2 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
          <select disabled={movingId === c.id} value={c.status} onChange={e => onMove(c.id, e.target.value)}
            className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
            {cols.map(col2 => <option key={col2.key} value={col2.key}>{col2.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ============================================================
// V9: KANBAN VIEW
// ============================================================
function KanbanView({ auth }) {
  const { t } = useT();
  const { cases: _rawCasesKB, loading, updateCase } = useCases();
  const _kanbanVisCfg = useVisibilitySettings();
  const cases = filterCasesByVisibility(_rawCasesKB, auth, _kanbanVisCfg);
  const { templates: lcTemplates } = useLifecycleTemplates();
  const [selectedCase, setSelectedCase]       = useState(null);
  const [movingId, setMovingId]               = useState(null);
  const [moveError, setMoveError]             = useState(null);
  const [cardSize, setCardSize]               = useState("m"); // "s" | "m" | "l"
  const [kanbanProject, setKanbanProject]     = useState(""); // "" = all

  const filteredCases = cases.filter(c => {
    if (auth.isClient)     return c.client_id === auth.user?.id;
    if (auth.isConsultant) return c.case_assignments?.some(a => a.consultant_id === auth.user?.id);
    if (auth.isKeyUser)    return c.case_key_users?.some(ku => ku.user_id === auth.user?.id);
    return true;
  });

  // Unique projects for the filter bar
  const kanbanProjects = (() => {
    const seen = new Set();
    const list = [];
    filteredCases.forEach(c => {
      if (c.project_id && !seen.has(c.project_id)) {
        seen.add(c.project_id);
        list.push({ id: c.project_id, name: c.project?.name || c.client?.client_profiles?.company_name || "Project" });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const boardCases = kanbanProject ? filteredCases.filter(c => c.project_id === kanbanProject) : filteredCases;

  // Build a stage catalog from all known presets + custom DB templates
  const stageCatalog = {};
  Object.values(LIFECYCLE_PRESETS).forEach(preset =>
    preset.stages.forEach(s => { stageCatalog[s.key] = s; })
  );
  lcTemplates.forEach(tpl =>
    (tpl.stages ?? []).forEach(s => { stageCatalog[s.key] = s; })
  );

  // Derive columns from statuses actually present in visible (project-filtered) cases
  const usedKeys = [...new Set(boardCases.map(c => c.status).filter(Boolean))];
  const kanbanCols = usedKeys
    .map(key => stageCatalog[key] ?? { key, label: cap(key.replace(/_/g, " ")), color: "#9ca3af", is_terminal: false })
    .sort((a, b) => (a.is_terminal ? 1 : 0) - (b.is_terminal ? 1 : 0));

  async function handleMove(caseId, newStatus) {
    if (newStatus === cases.find(c => c.id === caseId)?.status) return;
    setMovingId(caseId);
    setMoveError(null);
    try { await updateCase(caseId, { status: newStatus }); }
    catch (e) { setMoveError(e.message); }
    setMovingId(null);
  }

  if (loading) return <Spinner />;

  if (selectedCase) {
    return (
      <CaseDetail
        caseData={selectedCase}
        auth={auth}
        onBack={() => setSelectedCase(null)}
        onStatusChange={async (id, status, extras = {}) => {
          await updateCase(id, { status, ...extras });
          setSelectedCase(prev => ({ ...prev, status }));
        }}
        onDelete={async () => { await updateCase(selectedCase.id, { status: "cancelled" }); setSelectedCase(null); }}
        onUpdate={async (id, payload) => {
          await updateCase(id, payload);
          setSelectedCase(prev => ({ ...prev, ...payload }));
        }}
      />
    );
  }

  const canMove = auth.isAdmin || auth.isManager;

  // Column header height varies by size
  const colHeaderPy = cardSize === "s" ? "pt-2 pb-1" : "pt-4 pb-2";
  const colPadding  = cardSize === "s" ? "p-1.5" : "p-3";
  const colGap      = cardSize === "s" ? "space-y-1" : "space-y-2";
  const colMinH     = cardSize === "s" ? "min-h-12" : "min-h-20";
  const colRadius   = cardSize === "s" ? "rounded-xl" : "rounded-2xl";
  const borderTop   = cardSize === "s" ? "3px" : "4px";

  return (
    <div>
      {moveError && (
        <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="ml-3 text-red-400 hover:text-red-600 font-bold leading-none">×</button>
        </div>
      )}
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("kanban.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("kanban.subtitle")} · {t("kanban.case_count").replace("{n}", boardCases.length)}</p>
        </div>
        {/* Size toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {[["s","S"],["m","M"],["l","L"]].map(([val, label]) => (
            <button key={val}
              onClick={() => setCardSize(val)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${cardSize === val ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Project filter bar ── */}
      {kanbanProjects.length > 1 && (
        <div className="mb-4 -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-2 pb-1" style={{ width: "max-content" }}>
            <button
              onClick={() => setKanbanProject("")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                kanbanProject === "" ? "bg-gray-800 text-white border-gray-800 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}>
              <FolderKanban size={14} />
              {t("kanban.all_projects")}
              <span className="opacity-60 text-xs ml-0.5">{filteredCases.length}</span>
            </button>
            {kanbanProjects.map(p => (
              <button key={p.id}
                onClick={() => setKanbanProject(id => id === p.id ? "" : p.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                  kanbanProject === p.id ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}>
                <FolderOpen size={14} />
                {p.name}
                <span className="opacity-60 text-xs ml-0.5">{filteredCases.filter(c => c.project_id === p.id).length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {kanbanCols.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          {t("kanban.no_cases")}
        </div>
      ) : (
        <div className="grid items-start"
          style={{
            gap: cardSize === "s" ? "8px" : "12px",
            gridTemplateColumns: `repeat(${kanbanCols.length}, minmax(0, 1fr))`,
          }}>
          {kanbanCols.map(col => {
            const colCases = boardCases.filter(c => c.status === col.key);
            return (
              <div key={col.key} className={`${colRadius} border border-gray-100 shadow-sm overflow-hidden`}
                style={{ borderTop: `${borderTop} solid ${col.color}`, background: col.color + "0d" }}>
                <div className={`px-3 ${colHeaderPy} flex items-center justify-between`}>
                  <span className={`font-semibold ${cardSize === "s" ? "text-xs" : "text-sm"} truncate`} style={{ color: col.color }}>{col.label}</span>
                  <span className={`${cardSize === "s" ? "text-[10px]" : "text-xs"} text-gray-400 bg-white rounded-full px-1.5 py-0.5 border border-gray-100 flex-shrink-0 ml-1`}>{colCases.length}</span>
                </div>
                <div className={`${colPadding} ${colGap} ${colMinH} flex flex-col`}>
                  {colCases.map(c => (
                    <KanbanCard key={c.id} c={c}
                      cardSize={cardSize} cols={kanbanCols}
                      canMove={canMove} movingId={movingId}
                      onSelect={setSelectedCase} onMove={handleMove} />
                  ))}
                  {colCases.length === 0 && (
                    <div className="text-center py-4 text-gray-300 text-xs">{t("kanban.empty_col")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { PRIORITY_DOT, KanbanCard, KanbanView };
