import { Menu as _LMenu, X as _LX } from "lucide-react";
import { AlertTriangle as _LAlertTriangle } from "lucide-react";
import { Ico } from "./Ico.jsx";
import { BRAND_MARK_HTML } from "../lib/brand.js";
import { useState, useEffect, useRef, Fragment } from "react";
import DOMPurify from "dompurify";
import { diffSpecs, KIND_LABEL } from "../lib/specDiff.js";
import { applySpecHours, replaceEstimateSection, countMatrixScenarios, readObjects, computeEstimate } from "../lib/specHours.js";
import { activeRules, rulesPromptBlock, checkRules } from "../lib/projectRules.js";
import { normalizeRequirements, parseJsonArray, requirementsPromptBlock, coverageStats, inScope, textHash } from "../lib/requirements.js";
import { RequirementsChecklist, CoveragePanel, SectionHeader } from "./SpecRequirements.jsx";
import { runCaseChecks, blockingIssues } from "../lib/caseChecks.js";
import { CaseChecksPanel } from "./CaseChecksPanel.jsx";
import { normalizeQuestions, questionsPromptBlock, openQuestions, mergeLinkAnswers } from "../lib/questions.js";
import { QuestionsPanel } from "./SpecQuestions.jsx";
import { detectDocLang } from "../lib/docLang.js";
import { SignoffPanel } from "./SpecSignoff.jsx";
import {
  AlertTriangle, Archive, Award, BarChart2, Check, CheckCircle2, ChevronDown, Clock, Code2,
  Copy, Download, ExternalLink, FileText, Flag, FolderOpen, Inbox, Laptop, Link2, ListChecks, Paperclip, Pause, Play,
  RefreshCw, RotateCcw, Search, SlidersHorizontal, Sparkles, Star, Target, User,
  UserCheck, Users, Wand2, X, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { docLinkClick } from "../lib/openDoc.js";
import { bridgeAuthHeaders, resolveVmUrl } from "../lib/bridgeAuth.js";
import { caseEstimationContext } from "../lib/estimationContext.js";
import { SENIORITY_LABEL } from "../lib/estimation.js";
import { sapMcpAuthToken } from "../lib/sapCreds.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { usePlanConfig, useSystemSettings, usePermissions } from "../hooks/useSystemSettings.jsx";
import { callClaude, logEvent, notify, notifyManagers, sendEmailToUser, sendEmailToManagers, buildEmailHtml } from "../lib/utils.js";
import { useCaseDocuments } from "../hooks/useCoreHooks.js";
import { useCaseSpecification } from "../hooks/useNotificationHooks.js";
import { useSpecGenTemplates } from "../hooks/useLifecycleHooks.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Textarea } from "../components/ui.jsx";
import { fmtDate, fmt, cap } from "../lib/uiUtils.jsx";
import {
  GENERATION_CONTEXT_DEFAULTS, GENERATION_PROFILE_DEFAULTS, GEN_DOCS,
} from "../lib/constants.js";
import {
  LIFECYCLE_PRESETS, SAP_AREAS, INDUSTRY_AREAS, PROJECT_TYPES,
  DEFAULT_ACTIVITY_PHASES, ROLE_COLORS,
} from "../lib/businessConstants.js";
import { sapLiveCheck, sapFetchSource, detectSapObjectType } from "../components/SapPanels.jsx";
import AsBuiltSpecPanel from "./AsBuiltSpecPanel.jsx";

function ProjectFieldEditor({ caseData, auth }) {
  const { t } = useT();
  const [projectName, setProjectName] = useState(null);
  const [projectId, setProjectId]     = useState(caseData.project_id ?? null);
  const [open, setOpen]               = useState(false);
  const [options, setOptions]         = useState([]);

  useEffect(() => {
    if (!projectId) { setProjectName(null); return; }
    supabase.from("projects").select("id, name").eq("id", projectId).single()
      .then(({ data }) => setProjectName(data?.name ?? null));
  }, [projectId]);

  async function openDropdown() {
    let q = supabase.from("projects").select("id, name, status").in("status", ["active","completed"]).order("name");
    if (auth.isClient) q = q.eq("client_id", auth.user?.id);
    const { data } = await q;
    setOptions(data ?? []);
    setOpen(true);
  }

  async function select(id) {
    await supabase.from("cases").update({ project_id: id }).eq("id", caseData.id);
    setProjectId(id);
    if (id === null) {
      setProjectName(null);
    } else {
      const found = options.find(o => o.id === id);
      setProjectName(found?.name ?? null);
    }
    setOpen(false);
  }

  const canEdit = auth.isAdmin || auth.isManager || auth.isClient;

  return (
    <div className="flex items-center gap-2 text-sm relative">
      <span className="text-gray-500 w-24 flex-shrink-0">{t("label.project")}</span>
      {projectName ? (
        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">{projectName}</span>
      ) : (
        <span className="text-gray-400 italic text-xs">{t("project.standalone")}</span>
      )}
      {canEdit && (
        <button onClick={openDropdown} className="text-xs text-gray-400 hover:text-blue-600 underline ml-1">
          {t("project.change")}
        </button>
      )}
      {open && (
        <div className="absolute left-24 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-48 max-h-60 overflow-y-auto">
          <button onClick={() => select(null)}
            className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 italic">
            {t("project.standalone_opt")}
          </button>
          {options.map(o => (
            <button key={o.id} onClick={() => select(o.id)}
              className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700">
              {o.name}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-2 text-xs text-gray-400">{t("project.no_projects")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_ICON_MAP = {
  new: Inbox, open: Inbox, confirmed: CheckCircle2, returned: RotateCcw,
  estimated: BarChart2, assigned: UserCheck, in_progress: Play,
  standby: Pause, on_hold: Pause,
  technical_test: Code2, functional_test: Target, user_test: Users,
  adjustments: SlidersHorizontal, approved: Star,
  completed: CheckCircle2, terminated: Archive, cancelled: X,
  screening: Search, shortlisted: Star, sourcing: Search,
};
function getStageIcon(key) { return STAGE_ICON_MAP[key] ?? Flag; }

function CaseLifecycleTrack({ stages, currentStatus, onStageClick }) {
  const { t } = useT();
  const flow      = stages.filter(s => !s.is_terminal);
  const terminals = stages.filter(s => s.is_terminal);
  const curIdx    = flow.findIndex(s => s.key === currentStatus);
  const curIsTerminal = terminals.some(s => s.key === currentStatus);
  const N = flow.length;

  const progressPct = curIsTerminal ? 100
    : N <= 1 ? 0
    : Math.max(0, (curIdx / (N - 1)) * 100);

  const big   = N <= 7;
  const circSz = big ? "w-10 h-10" : "w-8 h-8";
  const iconSz = big ? 15 : 12;
  const lineTop = big ? "top-5" : "top-4";
  const lineX   = big ? "left-5 right-5" : "left-4 right-4";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="overflow-x-auto -mx-1 px-1">
      <div className="relative flex items-start justify-between min-w-[480px]">
        <div className={`absolute ${lineTop} ${lineX} h-0.5 z-0`}
          style={{ background: `linear-gradient(to right, #1A4B8C ${progressPct}%, var(--t-progress-track,#e5e7eb) ${progressPct}%)` }} />
        {flow.map((stage, i) => {
          const done   = curIsTerminal || i < curIdx;
          const active = !curIsTerminal && i === curIdx;
          const Icon   = getStageIcon(stage.key);
          return (
            <div key={stage.key} className="relative z-10 flex flex-col items-center flex-1 gap-1.5"
              onClick={onStageClick ? () => onStageClick(stage.key) : undefined}
              style={onStageClick ? { cursor: 'pointer' } : undefined}>
              <div className={`${circSz} rounded-full flex items-center justify-center transition-all`}
                style={{
                  background: done || active ? stage.color : 'var(--t-card-bg,#fff)',
                  border: !done && !active ? '2px solid var(--t-border,#e5e7eb)' : 'none',
                  boxShadow: active ? `0 0 0 4px ${stage.color}30` : undefined,
                }}>
                {done
                  ? <Check size={iconSz} color="#fff" />
                  : <Icon size={iconSz} color={active ? '#fff' : 'var(--ad-text3,#9ca3af)'} />
                }
              </div>
              <div className="text-center px-0.5">
                <div className={`leading-tight font-semibold ${big ? 'text-xs' : 'text-[10px]'}`}
                  style={{ color: active ? stage.color : done ? 'var(--t-text2,#6b7280)' : 'var(--ad-text3,#9ca3af)' }}>
                  {stage.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
      {terminals.length > 0 && (
        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-gray-100 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">{t("lifecycle.terminal")}</span>
          {terminals.map(s => {
            const isCurr = s.key === currentStatus;
            return (
              <div key={s.key} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: isCurr ? s.color : s.color + '15',
                  border: `1.5px solid ${isCurr ? s.color : s.color + '50'}`,
                  color: isCurr ? '#fff' : s.color,
                }}>
                {isCurr && '● '}{s.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LifecycleFlowDiagram({ stages, currentStatus }) {
  const { t } = useT();
  const activeStages = stages.filter(s => !s.is_terminal);
  const terminalStages = stages.filter(s => s.is_terminal);
  const currentIdx = activeStages.findIndex(s => s.key === currentStatus);
  const isCurrentTerminal = terminalStages.some(s => s.key === currentStatus);

  function getState(stage, idx) {
    if (stage.key === currentStatus) return 'current';
    if (isCurrentTerminal) return 'completed';
    if (currentIdx >= 0 && idx < currentIdx) return 'completed';
    return 'upcoming';
  }

  // 2 columns for 5+ stages to keep the block compact
  const NCOLS = activeStages.length >= 5 ? 2 : 1;
  const colSize = Math.ceil(activeStages.length / NCOLS);
  const cols = [];
  for (let i = 0; i < NCOLS; i++) {
    cols.push({ items: activeStages.slice(i * colSize, (i + 1) * colSize), offset: i * colSize });
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">{t("lifecycle.progress")}</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${NCOLS}, 1fr)`, columnGap: 20 }}>
        {cols.map(({ items, offset }, ci) => (
          <div key={ci}>
            {items.map((stage, i) => {
              const globalIdx = offset + i;
              const state = getState(stage, globalIdx);
              const isCurrent = state === 'current';
              const isDone = state === 'completed';
              const isLast = i === items.length - 1;

              const lineColor = isDone ? stage.color + '60' : 'var(--t-border,#e5e7eb)';

              return (
                <div key={stage.key} className="flex items-start gap-2">
                  {/* dot + connecting rail */}
                  <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
                    <div style={{
                      width: isCurrent ? 20 : 14,
                      height: isCurrent ? 20 : 14,
                      borderRadius: '50%',
                      background: isDone || isCurrent ? stage.color : undefined,
                      border: isDone || isCurrent ? 'none' : '2px solid var(--t-border,#d1d5db)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700,
                      color: isDone || isCurrent ? '#fff' : 'var(--ad-text3,#9ca3af)',
                      flexShrink: 0,
                      boxShadow: isCurrent ? `0 0 0 3px ${stage.color}35` : 'none',
                      marginTop: isCurrent ? -2 : 1,
                      marginBottom: isCurrent ? -2 : 1,
                    }}>
                      {isDone ? <Check size={12} /> : ''}
                    </div>
                    {!isLast && (
                      <div style={{ width: 2, flex: 1, minHeight: 10, background: lineColor }} />
                    )}
                  </div>
                  {/* label row */}
                  <div style={{
                    flex: 1,
                    paddingBottom: isLast ? 0 : 9,
                    ...(isCurrent ? {
                      background: stage.color + '12',
                      borderRadius: 8,
                      padding: '3px 8px',
                      marginTop: -2,
                      marginBottom: isLast ? 0 : 7,
                      marginLeft: -2,
                    } : {}),
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: isCurrent ? 700 : isDone ? 500 : 400,
                      color: isCurrent ? stage.color : isDone ? stage.color + 'cc' : 'var(--ad-text3,#9ca3af)',
                    }}>
                      {stage.label}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        padding: '1px 6px', borderRadius: 20, background: stage.color, color: '#fff',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {t("lifecycle.now")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {terminalStages.length > 0 && (
        <div className="flex items-center gap-2 pt-2 mt-2 border-t border-dashed border-gray-100 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">{t("lifecycle.terminal")}</span>
          {terminalStages.map(s => {
            const isCurr = s.key === currentStatus;
            return (
              <div key={s.key} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: isCurr ? s.color : s.color + '15',
                  border: `1.5px solid ${isCurr ? s.color : s.color + '50'}`,
                  color: isCurr ? '#fff' : s.color,
                }}>
                {isCurr && '● '}{s.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SPECIFICATION TAB
// ============================================================

function renderMarkdown(md) {
  if (!md) return '';

  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code style="background:var(--ad-inner,#f3f4f6);padding:0.1em 0.4em;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>');
  }

  function renderSapScreen(content) {
    const lines = content.split('\n').map(l=>l.trim()).filter(Boolean);
    const typeL = (lines[0]||'').toUpperCase();
    const isSelection = typeL.includes('SELECTION');
    const isFiori     = typeL.includes('FIORI');
    const isTxn       = typeL.includes('TRANSACTION');
    const isConfig    = typeL.includes('CONFIG');
    let title = '';
    const params=[], fields=[], steps=[], cols=[], rows=[];
    let totalRow=null;
    lines.forEach(l => {
      if (/^SCREEN:/i.test(l)) return;
      if (/^TITLE:/i.test(l)) { title=l.replace(/^TITLE:\s*/i,''); return; }
      if (/^PARAM:/i.test(l)) { const p=l.replace(/^PARAM:\s*/i,'').split('|'); params.push({label:(p[0]||'').trim(),value:(p[2]||'').trim(),req:(p[3]||'').trim().toUpperCase()==='R'}); return; }
      if (/^FIELD:/i.test(l)) { const p=l.replace(/^FIELD:\s*/i,'').split('|'); { const _v=(p[2]||'').trim(); const _new=/^new$/i.test(_v); fields.push({label:(p[0]||'').trim(),tech:(p[1]||'').trim(),value:_new?'':_v,isNew:_new,req:(p[3]||'O').trim().toUpperCase()==='R',disp:(p[3]||'O').trim().toUpperCase()==='D'}); } return; }
      if (/^STEP:/i.test(l))  { steps.push(l.replace(/^STEP:\s*/i,'').trim()); return; }
      if (/^COL:/i.test(l))   { const p=l.replace(/^COL:\s*/i,'').split('|'); cols.push({label:(p[0]||'').trim(),width:parseInt(p[1])||15,align:((p[2]||'L').trim().toUpperCase())}); return; }
      if (/^ROW:/i.test(l))   { rows.push(l.replace(/^ROW:\s*/i,'').split('|').map(v=>v.trim())); return; }
      if (/^TOTAL:/i.test(l)) { totalRow=l.replace(/^TOTAL:\s*/i,'').split('|').map(v=>v.trim()); return; }
    });
    if (!title) title = isSelection ? 'Selection Screen' : isFiori || isTxn ? 'SAP Fiori' : isConfig ? 'Customizing' : 'Report Output';

    // ── Fiori / Transaction renderer ──────────────────────────────
    if (isFiori || isTxn) {
      const flds = fields.length ? fields : params.map(p=>({...p,tech:'',disp:false}));
      const typeLabel = isFiori ? 'Fiori App' : 'SAP Transaction';
      const rows2 = flds.map(f=>`<div style="display:flex;align-items:center;gap:0;margin-bottom:10px"><div style="width:38%;padding-right:12px;text-align:right"><label style="font-size:11.5px;color:#32363a;font-weight:${f.req?'600':'400'}">${esc(f.label)}${f.req?'<span style="color:#bb0000"> *</span>':''}${f.isNew?' <span style="font-size:9px;font-weight:600;color:#0f7b3f;background:#e3f6ea;border:1px solid #b5e2c4;border-radius:8px;padding:0 5px;margin-left:4px;vertical-align:middle">nuevo</span>':''}</label></div><div style="width:62%">${f.disp?`<span style="font-size:11.5px;color:#32363a;padding:6px 8px;display:inline-block;border-bottom:1px solid #89919a">${esc(f.value||'—')}</span>`:`<input readonly value="${esc(f.value)}" style="width:90%;max-width:260px;height:30px;border:1px solid #89919a;border-bottom:2px solid #0a6ed1;padding:0 8px;font-size:11.5px;color:#32363a;background:white;border-radius:4px 4px 0 0"/>`}</div></div>`).join('');
      return `<div style="border:1px solid #c8d4e8;border-radius:6px;overflow:hidden;font-family:'72','Noto Sans',Arial,sans-serif;margin:14px 0;box-shadow:0 1px 6px rgba(0,0,0,0.1)"><div style="background:#0a6ed1;color:white;padding:8px 14px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:600">${esc(title)}</span><span style="font-size:10px;background:rgba(255,255,255,0.2);border-radius:10px;padding:2px 8px">${typeLabel}</span></div><div style="background:white;padding:16px 20px"><div style="font-size:10.5px;color:#6a6d70;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;margin-bottom:12px;border-bottom:1px solid #d9d9d9;padding-bottom:6px">Datos</div>${rows2}</div><div style="background:#f5f5f5;border-top:1px solid #d9d9d9;padding:8px 14px;display:flex;gap:8px"><button style="background:#0a6ed1;color:white;border:none;padding:6px 16px;border-radius:4px;font-size:11.5px;font-weight:600;cursor:pointer">Grabar</button><button style="background:white;color:#0a6ed1;border:1px solid #0a6ed1;padding:6px 16px;border-radius:4px;font-size:11.5px;cursor:pointer">Cancelar</button></div></div>`;
    }

    // ── Config / Customizing renderer ─────────────────────────────
    if (isConfig) {
      const stps = (steps.length ? steps : ['Acceder a la ruta de customizing','Ejecutar la actividad de configuración']).map((s,i)=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f7"><div style="background:#1a3764;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#1a2a4a;line-height:1.5">${esc(s)}</div></div>`).join('');
      return `<div style="border:1px solid #c8d4e8;border-radius:6px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;margin:14px 0"><div style="background:#1a3764;color:white;padding:7px 14px;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:8px"><span style="background:rgba(255,255,255,0.2);border-radius:3px;padding:1px 6px;font-size:9.5px;font-family:monospace">SPRO</span>${esc(title||'Customizing')}</div><div style="background:#f5f7fc;padding:12px 16px">${stps}</div></div>`;
    }

    const chrome = body => `<div style="border:1px solid #8fa8cc;border-radius:3px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,0.13)">
      <div style="background:#1a3764;color:white;padding:5px 8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:11.5px">${esc(title)}</span>
        <span style="display:flex;gap:2px">
          <span style="background:#5a8aba;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">─</span>
          <span style="background:#5a8aba;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">□</span>
          <span style="background:#b03030;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">×</span>
        </span>
      </div>
      <div style="background:var(--sap-bar,#dde4f0);border-bottom:1px solid #b0bbcc;padding:2px 8px;font-size:10.5px;color:var(--sap-text,#222);display:flex;gap:14px">
        ${['Sistema','Editar','Pasar a','Favoritos','Extras','Entorno','Ayuda'].map(m=>`<span>${m}</span>`).join('')}
      </div>
      <div style="background:var(--sap-toolbar,#e4eaf5);border-bottom:1px solid #b0bbcc;padding:3px 8px;display:flex;gap:2px;align-items:center">
        <input style="width:70px;height:18px;border:1px solid #8899bb;font-size:10px;padding:0 4px;background:var(--sap-white,white)" readonly />
        ${[0,1,2,3,4,5].map(i=>`<span style="background:#c8d4e8;border:1px solid #8899bb;width:20px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;${i===2?'margin-left:5px':''}">▶</span>`).join('')}
      </div>
      ${body}
      <div style="background:var(--sap-bar,#dde4f0);border-top:1px solid #b0bbcc;padding:2px 8px;font-size:10px;color:var(--sap-text,#334);display:flex;justify-content:space-between">
        <span>Sistema: Arena-DEV &nbsp;|&nbsp; Mandante: 100</span>
        <span style="color:#006600;font-weight:700">● Listo</span>
      </div>
    </div>`;

    if (isSelection) {
      const dp = params.length ? params : [{label:'Sociedad',value:'1000',req:true},{label:'Ejercicio',value:'2024',req:true},{label:'Período de',value:'01',req:false},{label:'Período a',value:'12',req:false}];
      const fields = dp.map(p=>`<div style="display:flex;align-items:center;margin-bottom:7px">
        <span style="color:#cc0000;width:10px;font-weight:bold;font-size:13px">${p.req?'*':''}</span>
        <label style="width:185px;color:var(--sap-label,#2a3a5a);font-size:11.5px">${esc(p.label)}</label>
        <input value="${esc(p.value)}" style="width:155px;height:21px;border:1px solid #99aabb;border-bottom:2px solid #2855a8;padding:0 6px;font-size:11.5px;color:var(--sap-field-text,#001280);background:var(--sap-white,white)" readonly />
        <span style="background:#c8d4e8;border:1px solid #8899bb;width:20px;height:21px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;margin-left:2px;cursor:pointer">▼</span>
      </div>`).join('');
      return chrome(`<div style="background:var(--sap-panel,#f5f7fc);padding:14px 18px">
        <div style="border:1px solid #8899bb;border-radius:2px;padding:16px 18px;background:var(--sap-white,white);position:relative;margin-bottom:12px">
          <div style="position:absolute;top:-9px;left:12px;background:var(--sap-white,white);padding:0 6px;font-size:10.5px;font-weight:600;color:#1a3764">Parámetros de selección</div>
          ${fields}
        </div>
        <div style="display:flex;gap:8px">
          <button style="background:#1a3764;color:white;border:1px solid #0a2244;padding:5px 18px;font-size:11.5px;font-weight:600;cursor:pointer;border-radius:2px">Ejecutar (F8)</button>
          <button style="background:#c8d4e8;color:#222;border:1px solid #8899bb;padding:5px 14px;font-size:11.5px;cursor:pointer;border-radius:2px">Cancelar</button>
          <button style="background:#c8d4e8;color:#222;border:1px solid #8899bb;padding:5px 14px;font-size:11.5px;cursor:pointer;border-radius:2px">Variante</button>
        </div>
      </div>`);
    } else {
      const uc = cols.length ? cols : [{label:'Sociedad',width:10,align:'L'},{label:'Cuenta',width:15,align:'L'},{label:'Descripción',width:35,align:'L'},{label:'Importe ML',width:22,align:'R'},{label:'Moneda',width:10,align:'L'}];
      const ur = rows.length ? rows : [['1000','100000','Activos circulantes','1,500,000.00','EUR'],['1000','200000','Cuentas por cobrar','500,000.00','EUR'],['1000','300000','Inventario','800,000.00','EUR']];
      const ut = totalRow || ['','','Total general','2,800,000.00',''];
      const tw = uc.reduce((s,c)=>s+c.width,0);
      const wp = c=>((c.width/tw)*100).toFixed(1)+'%';
      const hdr = uc.map(c=>`<th style="background:#3a628a;color:white;padding:6px 8px;font-size:11px;font-weight:600;text-align:${c.align==='R'?'right':'left'};border:1px solid #2a4a70;width:${wp(c)}">${esc(c.label)}</th>`).join('');
      const drows = ur.map((row,ri)=>`<tr>${uc.map((c,ci)=>`<td style="padding:4px 8px;font-size:11px;border:1px solid #c8d4e8;text-align:${c.align==='R'?'right':'left'};background:${ri%2===0?'var(--sap-white,white)':'var(--sap-row-alt,#f0f5fc)'}">${esc(row[ci]||'')}</td>`).join('')}</tr>`).join('');
      const trow = `<tr>${uc.map((c,ci)=>`<td style="padding:5px 8px;font-size:11px;font-weight:700;border:1px solid #8899bb;text-align:${c.align==='R'?'right':'left'};background:var(--sap-total,#d0e4f8);color:var(--sap-total-text,#00186a)">${esc(ut[ci]||'')}</td>`).join('')}</tr>`;
      return chrome(`<div>
        <div style="background:var(--sap-toolbar,#e8eff8);border-bottom:1px solid #b0bbcc;padding:3px 8px;display:flex;gap:4px">
          ${['Ordenar','Filtro','Suma','Subtotales','Imprimir','Excel'].map(b=>`<button style="background:#c8d4e8;border:1px solid #8899bb;padding:2px 8px;font-size:10.5px;cursor:pointer;border-radius:2px">${b}</button>`).join('')}
        </div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',Arial,sans-serif">
          <thead><tr>${hdr}</tr></thead>
          <tbody>${drows}${trow}</tbody>
        </table></div>
      </div>`);
    }
  }

  function renderTable(tableLines) {
    const dataRows = tableLines.filter(l=>/\S/.test(l) && !/^\s*\|[-: |]+\|\s*$/.test(l));
    if (dataRows.length < 2) return tableLines.map(l=>`<p>${esc(l)}</p>`).join('');
    const parseRow = r => r.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
    const head = parseRow(dataRows[0]);
    const body = dataRows.slice(1).map(parseRow);
    // Column roles from the header, so each gets a sensible width (see .md-table in index.css).
    const roleOf = (h) => {
      const k = String(h).toLowerCase();
      if (/estado|status|exist|resultado|result/.test(k)) return 'status';
      if (/nota|note|comment|observ|detalle|detail|descrip/.test(k)) return 'note';
      if (/objeto|object|nombre|name/.test(k)) return 'name';
      if (/tipo|type/.test(k)) return 'type';
      return '';
    };
    const roles = head.map(roleOf);
    // ✓ / ✗ / ⚠ status cells become coloured badges.
    const statusCell = (v) => {
      const t = String(v ?? '');
      const cls = /✗|✘|not found|no existe|no encontrad|missing|inexistent/i.test(t) ? 'no'
        : /⚠|warn|parcial|partial|revisar|check/i.test(t) ? 'warn'
        : /✓|✔|exist|found|encontrad|\byes\b|\bs[ií]\b/i.test(t) ? 'ok' : '';
      return cls ? `<span class="md-badge md-badge-${cls}">${fmt(t)}</span>` : fmt(t);
    };
    const hdr = head.map((h,i)=>`<th class="md-col-${roles[i] || 'x'}">${fmt(h)}</th>`).join('');
    const rows = body.map(row=>`<tr>${head.map((_,i)=>`<td class="md-col-${roles[i] || 'x'}">${roles[i]==='status' ? statusCell(row[i]||'') : fmt(row[i]||'')}</td>`).join('')}</tr>`).join('');
    return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${hdr}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      i++;
      const codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++;
      const cc = codeLines.join('\n');
      out.push(/SCREEN:/i.test(cc) ? renderSapScreen(cc) : `<pre style="background:var(--ad-card,#f3f4f6);border:1px solid var(--ad-b,#e5e7eb);border-radius:6px;padding:10px 14px;overflow-x:auto;font-size:11px;font-family:monospace;white-space:pre;color:var(--ad-text,inherit)">${esc(cc)}</pre>`);
      continue;
    }
    if (line.trim().startsWith('|') && line.includes('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tbl.push(lines[i]); i++; }
      out.push(renderTable(tbl));
      continue;
    }
    let m;
    if ((m=line.match(/^####\s+(.+)/))) { out.push(`<h4 style="font-size:0.875rem;font-weight:700;margin:0.75rem 0 0.25rem">${fmt(m[1])}</h4>`); i++; continue; }
    if ((m=line.match(/^###\s+(.+)/)))  { out.push(`<h3 style="font-size:1rem;font-weight:700;margin:1rem 0 0.375rem">${fmt(m[1])}</h3>`); i++; continue; }
    if ((m=line.match(/^##\s+(.+)/)))   { out.push(`<h2 style="font-size:1.125rem;font-weight:700;margin:1.25rem 0 0.5rem;color:var(--t-text-accent,#1A4B8C)">${fmt(m[1])}</h2>`); i++; continue; }
    if ((m=line.match(/^#\s+(.+)/)))    { out.push(`<h1 style="font-size:1.25rem;font-weight:800;margin:1.5rem 0 0.5rem;color:var(--t-text-accent,#1A4B8C)">${fmt(m[1])}</h1>`); i++; continue; }
    if (/^---$/.test(line))             { out.push('<hr style="border:none;border-top:1px solid var(--ad-b,#e5e7eb);margin:1rem 0">'); i++; continue; }
    if ((m=line.match(/^\s*[-*]\s+(.+)/)))  { out.push(`<li style="margin:0.25rem 0 0.25rem 1.25rem;list-style:disc">${fmt(m[1])}</li>`); i++; continue; }
    if ((m=line.match(/^\d+\.\s+(.+)/)))    { out.push(`<li style="margin:0.25rem 0 0.25rem 1.25rem;list-style:decimal">${fmt(m[1])}</li>`); i++; continue; }
    if (!line.trim())                       { out.push('<br>'); i++; continue; }
    out.push(`<span>${fmt(line)}</span><br>`);
    i++;
  }
  return out.join('\n');
}

// ── Generation Context Helper ─────────────────────────────────
function buildContextString(caseData, genCtx = {}, extra = {}) {
  const cfg = { ...GENERATION_CONTEXT_DEFAULTS, ...genCtx };
  const lines = [];

  if (cfg.include_client_info) {
    const co = caseData.client?.client_profiles?.company_name;
    if (co) lines.push(`Client Company: ${co}`);
    const sec = caseData.client?.client_profiles?.industry_sector ?? caseData.area_industry;
    if (sec) lines.push(`Client Sector: ${sec}`);
  }

  if (cfg.include_sap_profile && extra.connection) {
    const m = extra.connection.meta ?? {};
    const sys = [m.sap_product, m.sap_release ? `Release ${m.sap_release}` : null, m.basis_release ? `Basis ${m.basis_release}` : null].filter(Boolean).join(' | ');
    if (sys) lines.push(`SAP System: ${sys}`);
    if (m.system_role) lines.push(`System Role: ${m.system_role}`);
    if (m.language && m.language !== 'EN') lines.push(`System Language: ${m.language}`);
    if (m.components?.length) lines.push(`Active SAP Components: ${m.components.join(', ')}`);
    if (m.transport_route) lines.push(`Transport Route: ${m.transport_route}`);
  }

  if (cfg.include_case_metadata) {
    if (caseData.priority) lines.push(`Priority: ${caseData.priority}`);
    if (caseData.budget) lines.push(`Budget: ${caseData.budget}`);
    if (caseData.due_date) lines.push(`Due Date: ${caseData.due_date}`);
    if (caseData.skills_required?.length) lines.push(`Skills Required: ${caseData.skills_required.join(', ')}`);
  }

  if (cfg.include_project_ctx && extra.project) {
    lines.push(`Project: ${extra.project.name}`);
    if (extra.project.description) lines.push(`Project Description: ${extra.project.description}`);
    if (extra.project.goals) lines.push(`Project Goals: ${extra.project.goals}`);
    if (extra.project.deliverables?.length) lines.push(`Project Deliverables: ${extra.project.deliverables.join('; ')}`);
  }

  if (cfg.include_project_docs && extra.projectDocs?.length) {
    lines.push(`\nProject Reference Documents:`);
    extra.projectDocs.forEach(doc => {
      lines.push(`\n[Document: ${doc.name}${doc.type ? ` — ${doc.type}` : ''}]`);
      if (doc.text) lines.push(doc.text);
      else lines.push(`(file could not be read as text — content not available)`);
    });
    lines.push(`[End of Project Documents]`);
  }

  if (cfg.include_related_cases && extra.relatedCases?.length) {
    lines.push(`Related Cases (same client & SAP module):`);
    extra.relatedCases.forEach((c, i) => {
      lines.push(`  ${i + 1}. "${c.title}" — ${c.status}${c.area_sap ? ` [${c.area_sap}]` : ''}`);
    });
  }

  if (extra.sapLiveData) {
    const ld = extra.sapLiveData;
    if (ld.systemInfo) lines.push(`SAP Live System: ${ld.systemInfo}`);
    if (ld.capabilities?.length) lines.push(`SAP Available Capabilities: ${ld.capabilities.join(', ')}`);
    if (ld.components?.length) lines.push(`SAP Software Components: ${ld.components.join(', ')}`);
    if (ld.existingSource) {
      const typeLabel = ld.existingObjectType ? ` [${ld.existingObjectType}]` : '';
      lines.push(`Existing ABAP Object Source (${ld.existingObjectName ?? 'current'}${typeLabel}):\n\`\`\`abap\n${ld.existingSource.slice(0, 3000)}\n\`\`\``);
    }
    if (ld.existingObjectMissing) lines.push(`Note: Object "${ld.existingObjectName}" was NOT found in SAP — this is a new creation.`);
  }

  return lines.length ? `\n${lines.join('\n')}` : '';
}

// ── Generation Profile Modal ─────────────────────────────────
function buildSectionConstraint(docKey, genProfile) {
  if (!genProfile) return '';
  const docMeta = GEN_DOCS.find(d => d.key === docKey);
  if (!docMeta) return '';
  const enabled = docMeta.sections.filter(s => genProfile[docKey]?.[s.key] !== false).map(s => `- ${s.label}`);
  if (!enabled.length) return '';
  return `\nSECTION CONSTRAINT: Generate ONLY these sections (omit all others):\n${enabled.join('\n')}\n`;
}

const LANG_NAMES = { es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese' };

function buildGenSuffix(genProfile, lang) {
  const parts = [];
  const instr = genProfile?.additional_instructions?.trim();
  if (instr) parts.push(`ADDITIONAL INSTRUCTIONS:\n${instr}`);
  const langName = lang && lang !== 'en' ? LANG_NAMES[lang] ?? null : null;
  if (langName) parts.push(`OUTPUT LANGUAGE: Write the entire document in ${langName}. All headings, labels, descriptions and content must be in ${langName}.`);
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

// Language line for analysis prompts that return JSON: text in the user's language,
// keys and enum values unchanged so the app can still read them.
function jsonLangNote(lang) {
  const langName = lang && lang !== 'en' ? LANG_NAMES[lang] ?? null : null;
  return langName
    ? `\n\nOUTPUT LANGUAGE: Write every human-readable text value (summaries, descriptions, transactions' descriptions, gaps, strengths, concerns, recommendations, purposes) in ${langName}. Keep JSON keys, SAP codes/object names and enum values (e.g. "full", "partial", "none", "low", "medium", "high", true/false) exactly as specified, in English.`
    : '';
}

async function htmlStringToPdfBlob(htmlString) {
  if (!window.html2pdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const parsed = new DOMParser().parseFromString(htmlString, 'text/html');
  const el = document.createElement('div');
  parsed.querySelectorAll('style').forEach(s => el.appendChild(s.cloneNode(true)));
  const body = document.createElement('div');
  body.innerHTML = parsed.body.innerHTML;
  body.querySelectorAll('.print-btn').forEach(b => { b.style.display = 'none'; });
  el.appendChild(body);
  el.style.cssText = 'position:absolute;left:-9999px;top:0;width:860px;background:#fff;';
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 1000));
  try {
    return await window.html2pdf()
      .set({
        margin: 0,
        html2canvas: { scale: 1.5, useCORS: true, allowTaint: true, logging: false, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .toPdf()
      .output('blob');
  } finally {
    document.body.removeChild(el);
  }
}

function MarkdownAccordion({ text, defaultAllOpen = false }) {
  const sections = [];
  if (text) {
    const lines = text.split('\n');
    let current = null;
    for (const line of lines) {
      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h3 = line.match(/^###\s+(.+)/);
      const heading = h3 || h2 || h1;
      if (heading && (h1 ? !h2 && !h3 : true)) {
        if (current) sections.push(current);
        const level = h3 ? 3 : h2 ? 2 : 1;
        current = { title: heading[1], level, body: '' };
      } else {
        if (!current) current = { title: '', level: 0, body: '' };
        current.body += line + '\n';
      }
    }
    if (current) sections.push(current);
  }

  const [open, setOpen] = useState(() => {
    const init = {};
    sections.forEach((_, i) => { init[i] = defaultAllOpen || i === 0; });
    return init;
  });

  if (!sections.length) return null;

  return (
    <div className="space-y-1">
      {sections.map((s, i) => (
        s.title && s.level === 1 ? (
          /* Document title — always visible, never collapsible */
          <div key={i} className="px-1 pb-1">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-snug">{s.title}</h2>
            {s.body.trim() && (
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<div>' + renderMarkdown(s.body) + '</div>') }} />
            )}
          </div>
        ) : s.title ? (
          <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(p => ({ ...p, [i]: !p[i] }))}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left gap-2">
              <span className={`font-semibold text-gray-700 dark:text-gray-200 leading-snug ${s.level === 2 ? 'text-xs' : 'text-xs text-gray-500 dark:text-gray-400'}`}>
                {s.title}
              </span>
              <ChevronDown size={12} className={`text-gray-400 flex-shrink-0 transition-transform duration-150 ${open[i] ? 'rotate-180' : ''}`} />
            </button>
            {open[i] && s.body.trim() && (
              <div className="px-3 py-2.5 text-xs text-gray-800 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-700"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<div>' + renderMarkdown(s.body) + '</div>') }} />
            )}
          </div>
        ) : s.body.trim() ? (
          <div key={i} className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed px-1 py-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<div>' + renderMarkdown(s.body) + '</div>') }} />
        ) : null
      ))}
    </div>
  );
}

function GenerationProfileModal({ onConfirm, onClose, title, outputMode, onOutputModeChange }) {
  const { t } = useT();
  const { settings } = useSystemSettings();
  const stored = settings["generation_profiles"] ?? {};
  const defaultProfileKey = stored.default_profile ?? GENERATION_PROFILE_DEFAULTS.default_profile;
  const [selected, setSelected] = useState(defaultProfileKey);

  function resolveProfile(key) {
    const def = GENERATION_PROFILE_DEFAULTS.profiles[key] ?? {};
    const sto = stored.profiles?.[key] ?? {};
    const merged = { ...def };
    for (const dk of GEN_DOCS.map(d => d.key)) {
      merged[dk] = { ...(def[dk] ?? {}), ...(sto[dk] ?? {}) };
    }
    merged.additional_instructions = sto.additional_instructions ?? def.additional_instructions ?? "";
    merged.prototype_enabled = sto.prototype_enabled ?? false;
    merged.prototype_style   = sto.prototype_style   ?? 'auto';
    return merged;
  }

  const PROFILES = [
    { key: "basic",    icon: Zap,     desc: t("gen.profile_basic_desc") },
    { key: "standard", icon: BarChart2, desc: t("gen.profile_standard_desc") },
    { key: "full",     icon: Sparkles,  desc: t("gen.profile_full_desc") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title ?? t("gen.modal_title")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          {PROFILES.map(({ key, icon: Icon, desc }) => {
            const p = resolveProfile(key);
            const totalSections = GEN_DOCS.reduce((s, d) => s + d.sections.filter(sec => p[d.key]?.[sec.key] !== false).length, 0);
            const isSelected = selected === key;
            return (
              <button key={key} onClick={() => setSelected(key)}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'}`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Icon size={18} className={isSelected ? 'text-blue-600' : 'text-gray-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold text-sm capitalize ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>{t("gen.profile_" + key)}</span>
                    <span className="text-xs text-gray-400">{totalSections} {t("gen.sections")}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  {p.additional_instructions && (
                    <p className="text-xs text-blue-600 mt-1 italic truncate">+ {p.additional_instructions.slice(0, 60)}{p.additional_instructions.length > 60 ? '…' : ''}</p>
                  )}
                </div>
                {isSelected && <Check size={16} className="text-blue-600 flex-shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
        {onOutputModeChange && (
          <div className="px-6 pb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Create items as</p>
            <div className="flex gap-2">
              {[
                { key: 'activities', label: 'Activities', icon: ListChecks },
                { key: 'subcases',   label: 'Sub-cases',  icon: FolderOpen },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => onOutputModeChange(key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${outputMode === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-gray-50'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50">
            {t("action.cancel")}
          </button>
          <button onClick={() => { onConfirm(selected, resolveProfile(selected), outputMode); onClose(); }}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
            <Sparkles size={14} /> {t("gen.generate_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}

function openHtmlInNewTab(htmlString) {
  const blob = new Blob([htmlString], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 60000);
  else { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.click(); }
}

function downloadHtml(htmlString, filename = 'prototype.html') {
  const blob = new Blob([htmlString], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const ZOOM_STEPS = [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1.0];

function ProtoPanel({ protoHtmlState, setProtoHtmlState, protoSaved, protoError, protoErrorMsg, generatingSpecs, isRegeneratingProto, documents, onBack, onRegenerate, t }) {
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);
  const [zoom, setZoom] = useState(0.55);

  useEffect(() => {
    if (protoHtmlState || !protoSaved) return;
    // HTML not in memory — fetch from saved document
    const protoDoc = (documents ?? []).find(d =>
      (d.description ?? '').startsWith('[Prototype]') || (d.file_name ?? '').startsWith('Prototype_')
    );
    if (!protoDoc?.file_url) return;
    setLoading(true);
    setFetchErr(null);
    fetch(protoDoc.file_url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(html => {
        // Reject obviously empty or error-page responses
        if (!html || html.trim().length < 100) throw new Error('Empty prototype');
        setProtoHtmlState(html);
      })
      .catch(() => setFetchErr('Could not load prototype — the file URL may have expired. Try regenerating.'))
      .finally(() => setLoading(false));
  }, [protoSaved, protoHtmlState, documents]);

  const VISIBLE_H = 520;
  const zoomIdx = ZOOM_STEPS.indexOf(zoom);
  const canZoomIn  = zoomIdx < ZOOM_STEPS.length - 1;
  const canZoomOut = zoomIdx > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{t("spec.proto_node_lbl")}</h3>
        <div className="flex items-center gap-2">
          {protoHtmlState && (
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setZoom(ZOOM_STEPS[zoomIdx - 1])} disabled={!canZoomOut}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">−</button>
              <span className="text-xs text-gray-500 px-1 min-w-[34px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(ZOOM_STEPS[zoomIdx + 1])} disabled={!canZoomIn}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">+</button>
            </div>
          )}
          {onRegenerate && protoSaved && (
            <button onClick={onRegenerate} disabled={generatingSpecs}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              {t("spec.proto_regen")}
            </button>
          )}
          {protoHtmlState && (
            <button onClick={() => openHtmlInNewTab(protoHtmlState)}
              className="px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
              {t("spec.proto_open_btn")}
            </button>
          )}
          {protoHtmlState && (
            <button onClick={() => downloadHtml(protoHtmlState, 'prototype.html')}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
              {t("spec.proto_download_btn")}
            </button>
          )}
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 px-2">
            ← {t("action.back")}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
          <Spinner /><span className="text-sm">{t("spec.gen_all_loading")}</span>
        </div>
      )}
      {fetchErr && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{fetchErr}</div>
      )}
      {protoHtmlState && !loading && (
        <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: VISIBLE_H, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: `${100 / zoom}%`,
            height: `${VISIBLE_H / zoom}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}>
            <iframe
              srcDoc={protoHtmlState}
              title="Interactive Prototype"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            />
          </div>
        </div>
      )}
      {!protoHtmlState && !loading && !fetchErr && protoSaved && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
          {t("spec.proto_saved")}
        </div>
      )}
      {!protoSaved && (generatingSpecs || isRegeneratingProto) && (
        <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
          <Spinner /><span className="text-sm">{isRegeneratingProto ? t("spec.proto_generating") : t("spec.gen_all_loading")}</span>
        </div>
      )}
      {!protoSaved && !generatingSpecs && !isRegeneratingProto && (
        <div className={`border rounded-xl p-6 flex flex-col items-center gap-3 text-center ${protoError ? 'bg-red-950 border-red-800' : 'bg-gray-50 border-gray-200'}`}>
          {protoError
            ? <>
                <p className="text-sm text-red-600 dark:text-red-400 font-semibold">{t("spec.proto_error")}</p>
                {protoErrorMsg && <p className="text-xs text-red-700 dark:text-red-300 break-all max-w-xs">{protoErrorMsg}</p>}
              </>
            : <p className="text-sm text-gray-500">{t("spec.proto_pending")}</p>
          }
          {onRegenerate && (
            <button onClick={onRegenerate}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              {protoError ? t("spec.proto_retry") : t("spec.proto_generate")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Calculated hours of a spec: one row per technical object; the consultant can change the complexity
// or set the hours of an object, and the tables of Specs A, C and D are recalculated.
function SpecHoursPanel({ content, opts, overrides, onApply, readOnly, L }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(overrides ?? {});
  useEffect(() => { setDraft(overrides ?? {}); }, [overrides]);
  const { objects } = readObjects(content);
  if (!objects.length) return null;
  const est = computeEstimate(objects, { ...opts, overrides: draft });
  const dirty = JSON.stringify(draft) !== JSON.stringify(overrides ?? {});
  const set = (name, patch) => setDraft(d => {
    const n = { ...d, [name]: { ...(d[name] ?? {}), ...patch } };
    if (n[name].hours === '' || n[name].hours === undefined) delete n[name].hours;
    if (!Object.keys(n[name]).length) delete n[name];
    return n;
  });
  const cxLabel = { low: L('Low', 'Baja'), medium: L('Medium', 'Media'), high: L('High', 'Alta') };
  return (
    <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
        <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        {L('Calculated hours', 'Horas calculadas')}
        <span className="ml-auto font-normal text-gray-500">{L('Standard', 'Estándar')} {est.total.std} h · Arena {est.total.arena} h · {est.scenarios} {L('scenarios', 'escenarios')}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-gray-500">{L('Hours come from the standard hours catalog (Settings → Spec quality) by object type and complexity. Change the complexity or set the hours of an object; the tables of Specs A, C and D are recalculated.', 'Las horas salen del catálogo de horas estándar (Configuración → Calidad de specs) por tipo y complejidad del objeto. Cambie la complejidad o fije las horas de un objeto; se recalculan las tablas de las Specs A, C y D.')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-1 pr-2">{L('Object', 'Objeto')}</th><th className="text-left py-1 pr-2">{L('Type', 'Tipo')}</th>
                <th className="text-left py-1 pr-2">{L('Complexity', 'Complejidad')}</th><th className="text-right py-1 pr-2">{L('Standard h', 'Horas est.')}</th><th className="text-right py-1">Arena h</th>
              </tr></thead>
              <tbody>
                {est.rows.map(r => (
                  <tr key={r.name} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-1 pr-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{r.name}</td>
                    <td className="py-1 pr-2 text-gray-500">{(KIND_LABEL[r.kind] ?? [r.kind, r.kind])[L('en', 'es') === 'es' ? 1 : 0]}</td>
                    <td className="py-1 pr-2">
                      <select disabled={readOnly} value={r.complexity} onChange={e => set(r.name, { complexity: e.target.value })}
                        className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900">
                        {['low', 'medium', 'high'].map(c => <option key={c} value={c}>{cxLabel[c]}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input disabled={readOnly} type="number" min="0" step="0.5" value={draft[r.name]?.hours ?? ''} placeholder={String(r.std)}
                        onChange={e => set(r.name, { hours: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="w-16 px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-right bg-white dark:bg-gray-900" />
                    </td>
                    <td className="py-1 text-right text-gray-600 dark:text-gray-300">{r.arena}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-gray-500">
            {L('Analysis', 'Análisis')} {est.phases.analysis.std} · {L('Development', 'Desarrollo')} {est.phases.dev.std} · {L('Unit tests', 'Pruebas unitarias')} {est.phases.unit.std} · UAT {est.phases.uat.std} → <b>{est.total.std} h</b> ({L('Arena', 'Arena')} {est.total.arena} h)
          </div>
          {!readOnly && (
            <div className="flex justify-end gap-2">
              {Object.keys(draft).length > 0 && <button onClick={() => setDraft({})} className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">{L('Reset to catalog', 'Volver al catálogo')}</button>}
              <button disabled={!dirty} onClick={() => onApply(draft)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{L('Recalculate specs', 'Recalcular specs')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Same look as "Generating specs with your feedback…": a faded button with a spinning ↻ and a
// light-blue banner underneath, shown while a pipeline step (analyze / coverage / validation) runs.
function StepRunning({ button, message }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button disabled
          className="px-4 py-2 bg-blue-600 opacity-40 cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
          <span className="animate-spin inline-block">↻</span> {button}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-800/40 rounded-xl px-3 py-2">
        <span className="animate-spin inline-block">↻</span>
        {message}
      </div>
    </div>
  );
}

function SpecificationTab({ caseData, auth, documents, addDocument, deleteDocument, refetchDocuments, onUpdate }) {
  const { t, lang } = useT();
  const ssCtx = useSystemSettings();
  const genModel       = ssCtx.settings["ai_model"]        ?? 'claude-haiku-5-5';
  const analysisModel  = ssCtx.settings["analysis_model"]  ?? 'claude-haiku-5-5';
  const sapMcpServerUrl = (ssCtx.settings["sap_mcp_server_url"] ?? '').trim();
  const sapMcpRules = (ssCtx.settings["sap_mcp_rules"] ?? '').trim();
  const _protoRaw  = ssCtx.settings["prototype_model"];
  const _SAFE      = 'claude-haiku-5-5';
  const _ALIASES   = { 'claude-haiku-4-5': _SAFE, 'claude-haiku-4-5-20251001': _SAFE, 'claude-haiku-5-5': _SAFE, 'claude-sonnet-4-5': _SAFE, 'claude-sonnet-4-6': _SAFE, 'claude-sonnet-5': _SAFE, 'claude-sonnet-5-5': _SAFE, 'claude-opus-5-5': _SAFE, 'claude-fable-5-1': _SAFE };
  const protoModel = (_protoRaw ? (_ALIASES[_protoRaw] ?? _protoRaw) : null) ?? genModel;
  const liveCheckEnabled = (ssCtx.settings["generation_context"] ?? {}).sap_live_check === true;
  const clientLiveCheckVal = (ssCtx.settings['sap_client_live_check'] ?? {})[caseData.client_id] ?? null;
  const clientPerms = (ssCtx.settings['sap_client_live_check_perms'] ?? {})[caseData.client_id] ?? {};
  const clientAllowsCaseOverride = clientPerms.allowCase !== false;
  const projectAllowsCaseOverride = (ssCtx.settings['sap_project_allow_case_override'] ?? {})[caseData.project_id] !== false;
  const caseOverrideAllowed = clientAllowsCaseOverride && projectAllowsCaseOverride;
  // Effective live check for Node 5 display (without per-case since caseLiveCheck state is loaded async)
  // Resolution: client override > system default
  const effectiveBaseCheck = clientLiveCheckVal !== null ? clientLiveCheckVal : liveCheckEnabled;

  // Build MCP servers config for spec generation when SAP MCP server is configured and connection is verified
  // ABAP ADT environments: the AI's SAP tools go through the ADT bridge's /mcp (it runs the
  // project's VPN and resolves the password from the ticket). Other environments: the SAP MCP
  // server. Only used once the live connection test of this case has passed.
  const lastConnTestRef = useRef(null);

  // Arena estimate for the specs' Time Estimation tables (see lib/estimation.js).
  const [specEstCtx, setSpecEstCtx] = useState(null);
  useEffect(() => {
    let alive = true;
    caseEstimationContext(caseData, ssCtx.settings, { isStaff: auth.isAdmin || auth.isManager })
      .then(c => { if (alive) setSpecEstCtx(c); }).catch(() => {});
    return () => { alive = false; };
  }, [caseData.id, caseData.expected_seniority, caseData.case_assignments?.[0]?.consultant_id, ssCtx.settings?.estimation_factors, ssCtx.settings?.case_sap_live_check, ssCtx.settings?.generation_context]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hours are calculated by the platform after generation (src/lib/specHours.js): the AI only gives
  // each technical object a complexity.
  const specHoursNote = '\nTIME ESTIMATION: do NOT calculate or invent hours. The platform calculates every hour of this section (standard and Arena) from the technical objects (type × complexity), the test-matrix size and the consultant factors, and replaces this table. Keep this heading and the table skeleton below with [h] placeholders.\n';
  const arenaEstNote = (() => {
    const c = specEstCtx; if (!c) return '';
    const f = c.factors;
    const byMode = (mode) => Object.entries(c.policyTypes).filter(([, m]) => ({ auto: 'ai-generate', semi: 'adt-create-only' })[mode] === m).map(([k]) => k.replace(/_/g, ' ')).join(', ');
    const lines = [
      '',
      'TIME ESTIMATION — STANDARD vs ARENA: the hours above are the STANDARD estimate (done by hand by a mid-level SAP consultant); keep them. Add a column "Arena Hours" right after the standard hours column, with the totals, and end the section with one line stating the hours and % saved with Arena. Arena hours = standard hours × implementation factor × seniority factor (round to 0.5 h):',
      c.arenaAvailable
        ? `- Development of objects Arena implements automatically (${byMode('auto')}): × ${f.automation.auto}; objects Arena creates for the consultant to complete (${byMode('semi')}): × ${f.automation.semi}; anything else (configuration, OData, Smartforms, testing, UAT, transports): × ${f.automation.manual}.`
        : `- Arena's automatic SAP implementation is not available for this case: development, testing and UAT stay × ${f.automation.manual}.`,
      c.liveCheck ? `- Analysis & design / requirements (live SAP check verifies objects and the system): × ${f.automation.design}.` : '- Analysis & design: × 1.0 (no live SAP check).',
      `- Consultant seniority: ${SENIORITY_LABEL.en[c.seniority]} → × ${f.seniority[c.seniority]}.`,
      '',
    ];
    return lines.join('\n');
  })();
  async function buildMcpConfig(overrideUrl, { connOk } = {}) {
    if (!sapConnCfg || !(connOk ?? sapConnTest?.ok)) return [];
    const isAdtEnv = ['abap-adt', 'abap-adt-readonly', 'abap-adt-both'].includes(sapConnCfg.mcp_type);
    let effectiveMcpUrl = '';
    if (isAdtEnv) {
      effectiveMcpUrl = (sapConnCfg.adt_mcp_url ?? '').trim();
      if (!effectiveMcpUrl) {
        try {
          const { data: sData } = await supabase.from('system_settings').select('value').eq('key', 'adt_bridge_tunnel_url').maybeSingle();
          effectiveMcpUrl = String(sData?.value ?? '').trim();
        } catch { /* best-effort */ }
      }
    } else {
      effectiveMcpUrl = (overrideUrl || sapConnCfg?.mcp_server_url?.trim() || sapMcpServerUrl || '').trim();
    }
    effectiveMcpUrl = effectiveMcpUrl.replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    if (!effectiveMcpUrl) return [];
    try {
      // Password-less (server-side) environments get a short-lived ticket instead (sapCreds.js).
      const token = await sapMcpAuthToken(sapConnCfg, sapConnCfg._vpnProxyUrl ? { proxyUrl: sapConnCfg._vpnProxyUrl } : {});
      if (!token) return [];
      return [{ type: 'url', url: `${effectiveMcpUrl}/mcp`, name: 'arena-sap', authorization_token: token }];
    } catch { return []; }
  }
  const { spec, loading: specLoading, saveSpec, refetch } = useCaseSpecification(caseData.id, auth.user?.id);
  // Save some AI-analysis results into the spec notes without losing what is already there
  // (request summary, SAP coverage, proposal check, generated specs…).
  async function saveAiNotesPatch(patch) {
    // A manual / wizard spec is never turned into an AI one by an analysis step.
    if (spec?.id && spec.mode && spec.mode !== 'ai') return;
    // Merge into the LATEST notes (notesRef), not the ones loaded with the screen: several steps can
    // save one after another (e.g. "Run all analysis") before the spec is reloaded.
    let cur = notesRef.current;
    if (!cur && spec?.mode === 'ai' && spec?.notes) { try { cur = JSON.parse(spec.notes) ?? {}; } catch { cur = {}; } }
    cur = cur ?? {};
    notesRef.current = { ...cur, ...patch };
    await saveSpec({
      mode: 'ai', status: spec?.status ?? 'draft',
      ...(spec?.id ? {} : { content: null, objects: [] }),
      notes: JSON.stringify(notesRef.current),
      title: spec?.title ?? (caseData.title + t("spec.doc_title_suffix")),
    });
  }

  // Mode selection
  const [mode, setMode] = useState(null); // null | 'manual' | 'wizard' | 'ai'

  // Wizard state
  const [wizardStage, setWizardStage]       = useState('objects'); // 'objects' | 'interview' | 'preview'
  const [wizardObjects, setWizardObjects]   = useState([]);
  const [currentObjIdx, setCurrentObjIdx]  = useState(0);
  const [wizardLoading, setWizardLoading]  = useState(false);
  const [wizardError, setWizardError]      = useState(null);
  const [addObjName, setAddObjName]        = useState('');
  const [addObjType, setAddObjType]        = useState('');
  const [compiledSpec, setCompiledSpec]    = useState('');

  // AI Generate state
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiContent, setAiContent]       = useState('');
  const [aiEditing, setAiEditing]       = useState(false);
  const [aiError, setAiError]           = useState(null);
  const [aiStep, setAiStep]             = useState(1);   // 1 | 2 | 3
  // Selected node survives remounts of this panel (e.g. parent re-render after an analysis save).
  const nodeStoreKey = `specgen_node_${caseData.id}`;
  const readStoredNode = () => { try { const v = sessionStorage.getItem(nodeStoreKey); return v === null ? null : Number(v); } catch { return null; } };
  const [activeNode, setActiveNodeRaw]  = useState(() => readStoredNode() ?? 0);   // 0=docs 1=sap 2=proposal 3=generate 4=approval 5=sap live 6=context
  const setActiveNode = n => {
    setActiveNodeRaw(prev => {
      const next = typeof n === 'function' ? n(prev) : n;
      try { sessionStorage.setItem(nodeStoreKey, String(next)); } catch {}
      return next;
    });
  };
  const nodeRestoredForRef = useRef(readStoredNode() !== null ? 'stored' : null);
  // Spec loaded as empty → a spec created later in this session must not reset the node.
  useEffect(() => { if (!specLoading && !spec && nodeRestoredForRef.current === null) nodeRestoredForRef.current = 'none'; }, [specLoading, spec]);
  const [nodesCollapsed, setNodesCollapsed] = useState(false);
  const [sapCheck, setSapCheck]         = useState(null);
  const [proposalCheck, setProposalCheck] = useState(null);
  const [stepLoading, setStepLoading]   = useState(false);
  const [aiSpecA, setAiSpecA]           = useState(''); // custom dev spec
  const [aiSpecB, setAiSpecB]           = useState(''); // standard SAP spec
  const [aiSpecC, setAiSpecC]           = useState(''); // customer proposal as-is
  const [aiSpecD, setAiSpecD]           = useState(''); // customer specification (non-technical)
  const [selectedSpec, setSelectedSpec] = useState(null); // 'a' | 'b' | 'c' | 'd'
  const [generatingSpecs, setGeneratingSpecs] = useState(false);
  const [specStatuses, setSpecStatuses] = useState({ a: 'idle', b: 'idle', c: 'idle', d: 'idle', proto: 'idle' });
  const [specErrors,   setSpecErrors]   = useState({ a: null,  b: null,  c: null,  d: null,  proto: null });
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisCustomerContent, setAnalysisCustomerContent] = useState('');
  // What each spec lost compared with the version it replaced at the last regeneration.
  const [regenDiff, setRegenDiff] = useState({});
  // Consultant adjustments to the calculated hours ({ [objectName]: { complexity?, hours? } }) and the
  // number of test-matrix scenarios found in the case documents (drives UAT hours).
  const [hoursOverrides, setHoursOverrides] = useState({});
  const [scenarioCount, setScenarioCount] = useState(0);
  const docScenariosRef = useRef(0);
  // When each analysis step last ran and on which documents ({ at, docs }); a step is outdated when
  // the case documents changed since, or a step before it ran again later.
  const [analysisMeta, setAnalysisMeta] = useState({});
  const analyzeRef = useRef(null);            // Analyze lives in the render block; Run all calls it here
  const [runningAll, setRunningAll] = useState(false);
  const [requirements, setRequirements] = useState([]);   // notes.requirements
  const [reqCoverage, setReqCoverage] = useState({});      // notes.reqCoverage: { [specKey]: { at, specHash, items, accepted } }
  const [reqLoading, setReqLoading] = useState(null);      // 'extract' | 'check' | 'fix' | null
  const [reqError, setReqError] = useState(null);
  const [caseChecks, setCaseChecks] = useState(null);       // issues of src/lib/caseChecks.js (notes.caseChecks)
  const [checksResolved, setChecksResolved] = useState({});
  const [checksLoading, setChecksLoading] = useState(false);
  const [questions, setQuestions] = useState([]);           // notes.questions (src/lib/questions.js)
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState(null);
  const [qLinks, setQLinks] = useState([]);                 // spec_question_links of the case
  const [qCopied, setQCopied] = useState(null);
  const [signoff, setSignoff] = useState(null);
  const docLangRef = useRef(null);                          // language of the customer documents (notes.docLang)
  // Specs and questions for the customer are written in the customer's language; analysis stays in the user's.
  const specLang = () => docLangRef.current || lang;
  const MAX_DOC_IMAGES = 16;                                // images per AI call (embedded + attached)             // notes.signoff: { by, name, at, specHash }
  const genGateOverrideRef = useRef(false);
  // Latest AI notes of the spec (kept across quick consecutive saves).
  const notesRef = useRef(null);
  useEffect(() => {
    if (spec?.mode === 'ai' && spec?.notes) { try { notesRef.current = { ...(notesRef.current ?? {}), ...JSON.parse(spec.notes) }; } catch { /* keep */ } }
  }, [spec?.notes, spec?.mode]);
  const [prevMode, setPrevMode]         = useState(null); // 'manual' | 'wizard' | null
  // Generation profile modal
  const [showGenModal, setShowGenModal]   = useState(false);
  const [pendingGenOpts, setPendingGenOpts] = useState(null);

  // Manual state
  const [manualNotes, setManualNotes]     = useState('');
  const [manualDocIds, setManualDocIds]   = useState([]);
  const [manualSaving, setManualSaving]   = useState(false);

  // Approval
  const [rejectReason, setRejectReason]   = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [approving, setApproving]         = useState(false);
  const [savedSpecUrls, setSavedSpecUrls] = useState({ a: null, b: null, c: null, d: null });
  const [savingDoc, setSavingDoc]         = useState(false);
  const [specHtml, setSpecHtml]           = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [protoSaved, setProtoSaved]         = useState(false);
  const [protoHtmlState, setProtoHtmlState] = useState(null);
  const [viewingProto, setViewingProto]     = useState(false);
  const [protoError, setProtoError]         = useState(false);
  const [protoErrorMsg, setProtoErrorMsg]   = useState('');
  const [protoGenerating, setProtoGenerating] = useState(false);
  const [generatingSpecD, setGeneratingSpecD] = useState(false);

  // Compiled context preview (Node 6)
  const [compiledCtxPreview, setCompiledCtxPreview] = useState(null);
  const [compiledCtxExtra,   setCompiledCtxExtra]   = useState(null);
  const [compiledCtxLoading, setCompiledCtxLoading] = useState(false);
  const [docSummaries,       setDocSummaries]       = useState({});
  const [requestSummary, setRequestSummary]         = useState(null);
  const [requestSummaryLoading, setRequestSummaryLoading] = useState(false);
  const [requestSummaryError, setRequestSummaryError]     = useState(null);
  // Collapsed sections of the analysis node, remembered per browser.
  const persisted = (key, def) => { try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch { return def; } };
  const persist = (key, setter) => v => setter(prev => { const next = typeof v === 'function' ? v(prev) : v; try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  // All sections of the analysis page start minimized; each remembers what the user opens.
  const [ctxCollapsed, _setCtxCollapsed]           = useState(() => persisted('genctx2_ctx_collapsed', true));
  const setCtxCollapsed = persist('genctx2_ctx_collapsed', _setCtxCollapsed);
  const [summaryCollapsed, _setSummaryCollapsed]   = useState(() => persisted('genctx2_summary_collapsed', true));
  const setSummaryCollapsed = persist('genctx2_summary_collapsed', _setSummaryCollapsed);
  const [genCtxCollapsed, _setGenCtxCollapsed]     = useState(() => persisted('genctx2_settings_collapsed', true));
  const setGenCtxCollapsed = persist('genctx2_settings_collapsed', _setGenCtxCollapsed);
  const [metaCollapsed, setMetaCollapsed]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('genctx2_casemeta_collapsed') ?? 'true'); } catch { return true; }
  });
  const [additionalCtx, setAdditionalCtx]           = useState('');
  const [additionalCtxSaving, setAdditionalCtxSaving] = useState(false);
  // Per-case SAP live check override: null = use env/global default, true = force on, false = force off
  const [caseLiveCheck, setCaseLiveCheck]           = useState(null);

  // Spec gen template
  const { templates: _sgTmpls, getTemplateStages: _getSgStages } = useSpecGenTemplates();
  const [sgPresetKey, setSgPresetKey] = useState("standard");
  const activeStages = _getSgStages(sgPresetKey);
  function isSgNodeEnabled(nodeType) {
    const s = activeStages.find(st => st.type === nodeType);
    return s?.enabled !== false;
  }
  // Template node labels: a custom label is shown as written; the built-in English default
  // ("SAP Verification"…) is replaced by the translated label for the user's language.
  const SG_DEFAULT_LABELS = ['Documents', 'SAP Connection', 'Compiled Context', 'SAP Verification', 'Proposal Validation', 'Generate Specs', 'Approval'];
  function getSgNodeLabel(nodeType, fallback) {
    const s = activeStages.find(st => st.type === nodeType);
    if (!s?.label || (fallback && SG_DEFAULT_LABELS.includes(s.label))) return fallback ?? s?.label;
    return s.label;
  }
  // Spanish / English for the approval panel's texts.
  const L = (en, es) => (lang === 'es' ? es : en);
  // A spec has sections; a short answer without headings is an interrupted reply (e.g. only
  // "I'll check the SAP system first"), never something to save as the specification.
  const checkSpecText = text => {
    if (!text || (text.length < 1500 && !/^#{1,3}\s|\n#{1,3}\s/.test(text))) {
      throw new Error(L('The AI answer was incomplete (no specification returned). Generate this spec again.', 'La respuesta de la IA llegó incompleta (sin especificación). Vuelva a generar esta especificación.'));
    }
    return text;
  };

  // Approval workflow sub-steps (Node 4)
  const [approvalStep, setApprovalStep]     = useState('generated'); // 'generated'|'checking'|'sending'|'approved'
  const [specFeedback, setSpecFeedback]     = useState(''); // cumulative per-cycle feedback text
  const [genLog, setGenLog]                 = useState([]); // mirrors spec.generation_log

  // Share-with-customer link state
  const [shareToken, setShareToken]         = useState(null); // loaded spec_review_tokens row
  const [shareCreating, setShareCreating]   = useState(false);
  const [shareCopied, setShareCopied]       = useState(false);

  // SAP live connection info node
  const [sapConnInfo, setSapConnInfo]     = useState(null);
  const [sapConnLoading, setSapConnLoading] = useState(false);
  const [sapConnCfg, setSapConnCfg]       = useState(null); // full config incl. password, for test
  const [sapConnTest, setSapConnTest]     = useState(null); // null | 'testing' | { ok, info?, error?, message? }

  // Project docs + ABAP standards — fetched for display in Node 0
  const [projDocsForDisplay, setProjDocsForDisplay]   = useState(null); // null = not loaded yet
  const [abapDocsForDisplay, setAbapDocsForDisplay]   = useState(null);

  useEffect(() => {
    const pid = caseData.project_id;
    if (!pid) { setProjDocsForDisplay([]); setAbapDocsForDisplay([]); return; }
    Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'project_docs').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'sap_integration').maybeSingle(),
    ]).then(([{ data: pd }, { data: si }]) => {
      setProjDocsForDisplay((pd?.value ?? {})[pid] ?? []);
      const projEntry = (si?.value ?? {})[`proj_${pid}`] ?? {};
      const templates = projEntry.abap_templates
        ?? (projEntry.abap_template ? [projEntry.abap_template] : []);
      setAbapDocsForDisplay(
        templates.map(t => typeof t === 'string'
          ? { name: t.split('/').pop().split('?')[0] || 'ABAP Standards', url: t }
          : { name: t.name || t.file_name || t.url?.split('/').pop()?.split('?')[0] || 'ABAP Standards', url: t.url ?? t.file_url })
      );
    }).catch(() => { setProjDocsForDisplay([]); setAbapDocsForDisplay([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData.project_id]);

  // Sync approval step and generation log when spec row changes
  useEffect(() => {
    if (!spec) return;
    if (spec.status === 'approved') setApprovalStep('approved');
    else if (spec.status === 'submitted') setApprovalStep('sending');
    // else keep whatever the user navigated to (don't reset 'checking' on refetch)
    if (Array.isArray(spec.generation_log)) setGenLog(spec.generation_log);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.id, spec?.status]);

  // ── Document helpers ─────────────────────────────────────────
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Text budget per document and in total for one AI call (≈ 4 chars per token). Documents past
  // their share are cut with an explicit "truncated" note, so the AI never reads them as complete.
  const DOC_CHARS_PER_FILE = 120000;
  const DOC_CHARS_TOTAL    = 240000;
  const IMAGE_EXTS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  // Files this platform generated earlier (specs, prototypes, dev plans): never sent to the AI as
  // input — a regeneration must start from the customer's documents only, not from its last output.
  const isGeneratedDoc = doc =>
    /^(Spec[A-D]_|Prototype_|DevPlan_|FuncSpec_|AsBuilt_|Proposal_)/i.test(doc?.file_name ?? '') ||
    /^\[(Prototype|Spec|DevPlan|FuncSpec)/i.test(doc?.description ?? '');

  // Image → base64 JPEG/PNG for the AI, scaled to at most 1568 px (the model's useful size) so a
  // phone photo or screenshot stays well under the request limits.
  async function imageToBlock(url, mediaType) {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const keepPng = mediaType === 'image/png' && scale === 1 && blob.size < 1500000;
    const out = keepPng ? blob : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    return { type: 'image', source: { type: 'base64', media_type: keepPng ? 'image/png' : 'image/jpeg', data: await blobToBase64(out) } };
  }

  async function buildDocumentBlocks() {
    const blocks = [];
    // Customer documents only. Order: specs (Word, PDF, text, images) → spreadsheets (test matrices,
    // templates — often very large). Exact duplicate uploads are skipped.
    const rank = d => /\.(xlsx?|csv)$/i.test(d.file_name ?? '') ? 1 : 0;
    const seen = new Set();
    const docs = [...(documents ?? [])]
      .filter(d => !isGeneratedDoc(d))
      .filter(d => { const k = `${(d.file_name ?? '').toLowerCase()}|${d.file_size_kb ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b));
    let budget = DOC_CHARS_TOTAL;
    let scenarios = 0;
    let imageCount = 0;
    let langSample = '';
    for (const doc of docs) {
      const lower = (doc.file_name ?? '').toLowerCase();
      const ext = lower.split('.').pop() ?? '';
      const isPdf  = ext === 'pdf' || (doc.file_type ?? '').includes('pdf');
      const isText = ['txt', 'md', 'csv', 'json'].includes(ext);
      const isHtml = ext === 'html' || ext === 'htm';
      const imageType = IMAGE_EXTS[ext] ?? ((doc.file_type ?? '').startsWith('image/') ? doc.file_type : null);
      // Types the extract-text API can convert to readable text (doc = Word 97-2003)
      const isExtractable = isText || isHtml || ['docx', 'doc', 'xlsx', 'xls'].includes(ext);
      const label = `[Document: ${doc.file_name}]`;

      if (!isPdf && !isExtractable && !imageType) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — format not extractable as text]` });
        continue;
      }
      try {
        if (imageType) {
          if (imageCount >= MAX_DOC_IMAGES) { blocks.push({ type: 'text', text: `[Attached image: ${doc.file_name} — not included, image limit for this request reached]` }); continue; }
          blocks.push({ type: 'text', text: `${label} (image below)` });
          blocks.push(await imageToBlock(doc.file_url, imageType));
          imageCount++;
        } else if (isPdf) {
          const resp = await fetch(doc.file_url);
          const blob = await resp.blob();
          const b64 = await blobToBase64(blob);
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
        } else if (isExtractable) {
          if (budget <= 2000) {
            blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — not included: the text budget for this request is used up. It exists; do not report its content as missing.]` });
            continue;
          }
          // Server-side extraction converts binary formats (doc, docx, xlsx) to clean text
          // Word documents also return their embedded images (screenshots with test data, SAP screens).
          const wantImages = ext === 'docx' && imageCount < MAX_DOC_IMAGES;
          const r = await fetch('/api/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: doc.file_url, fileName: doc.file_name, maxChars: Math.min(DOC_CHARS_PER_FILE, budget), images: wantImages }),
          });
          const { text, warning, images } = await r.json();
          if (text) {
            blocks.push({ type: 'text', text: `${label}\n${text}` });
            budget -= text.length;
            if (!/^(xlsx?|csv)$/.test(ext) && langSample.length < 20000) langSample += `\n${text.slice(0, 8000)}`;
            if (/^(xlsx?|csv)$/.test(ext)) scenarios += countMatrixScenarios(text);
            const imgs = (images ?? []).slice(0, MAX_DOC_IMAGES - imageCount);
            for (const [i, im] of imgs.entries()) {
              blocks.push({ type: 'text', text: `[Image ${i + 1} of ${imgs.length} embedded in ${doc.file_name}, in document order]` });
              // Same scaling / compression as attached images (keeps the request small).
              try { blocks.push(await imageToBlock(`data:${im.media_type};base64,${im.data}`, im.media_type)); }
              catch { blocks.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }); }
            }
            imageCount += imgs.length;
          } else {
            blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — ${warning ?? 'content empty'}]` });
          }
        }
      } catch (_) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — could not be loaded]` });
      }
    }
    docScenariosRef.current = scenarios;
    setScenarioCount(scenarios);
    const dl = detectDocLang(langSample);
    if (dl && dl !== docLangRef.current) { docLangRef.current = dl; saveAiNotesPatch({ docLang: dl }).catch(() => {}); }
    if (imageCount > 0 || docs.some(d => /\.pdf$/i.test(d.file_name ?? ''))) {
      blocks.unshift({ type: 'text', text: 'NOTE ON SCREENSHOTS: the customer documents include images (screenshots of SAP screens, table extracts, test data). Read them as part of the requirements: take the IDs, document numbers, test data, field values and screen labels they show, and use them as facts (e.g. which order belongs to which delivery, warehouse, plant, movement type, queue, program or transaction). Do not ask the customer for information a screenshot already shows — cite it instead ("según la captura de …"). If a screen looks custom (non-standard labels or layout), say it is probably a Z development and treat the program name as an open point.' });
    }
    return blocks;
  }

  // ── Calculated hours (src/lib/specHours.js) ──────────────────
  const hoursOpts = (overrides = hoursOverrides) => ({
    settings: ssCtx.settings, estCtx: specEstCtx, scenarios: docScenariosRef.current || scenarioCount, overrides, lang: specLang(),
  });
  // ── Freshness of the analysis steps ─────────────────────────
  // Fingerprint of the customer documents (generated Arena files excluded).
  const inputDocsHash = (() => {
    const key = (documents ?? []).filter(d => !isGeneratedDoc(d))
      .map(d => `${d.file_name}|${d.created_at ?? ''}|${d.file_size_kb ?? ''}`).sort().join('\n');
    let h = 5381; for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return `${(h >>> 0).toString(36)}`;
  })();
  const REQUIREMENTS_STEP = true;
  // ── Case checks before Analyze (src/lib/caseChecks.js) ──────
  const checksKey = `${inputDocsHash}|${caseData.project_id ?? ''}`;
  async function runCaseChecksNow() {
    setChecksLoading(true);
    try {
      const docs = (documents ?? []).filter(d => !isGeneratedDoc(d));
      const [proj, sib] = await Promise.all([
        caseData.project_id ? supabase.from('projects').select('id, name, customer_id, client_id').eq('id', caseData.project_id).maybeSingle() : Promise.resolve({ data: null }),
        caseData.project_id ? supabase.from('cases').select('id, title, case_ref, status').eq('project_id', caseData.project_id).neq('id', caseData.id) : Promise.resolve({ data: [] }),
      ]);
      const heads = {};
      await Promise.all(docs.filter(d => /\.(docx?|pdf|xlsx?|txt|md|csv)$/i.test(d.file_name ?? '')).map(async d => {
        try {
          const r = await fetch('/api/extract-text', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: d.file_url, fileName: d.file_name, maxChars: 3000 }) });
          const j = await r.json();
          heads[d.id] = { text: j.text ?? '', total: j.total_chars ?? (j.text ?? '').length, error: j.error ?? null };
        } catch (e) { heads[d.id] = { text: '', total: 0, error: e.message }; }
      }));
      const issues = runCaseChecks({ caseData, documents: docs, project: proj.data, siblings: sib.data ?? [], heads, cutAt: DOC_CHARS_PER_FILE });
      setCaseChecks(issues);
      const resolved = notesRef.current?.caseChecks?.resolved ?? checksResolved;
      try { await saveAiNotesPatch({ caseChecks: { at: new Date().toISOString(), key: checksKey, issues, resolved } }); } catch (_) {}
      return issues;
    } finally { setChecksLoading(false); }
  }
  useEffect(() => {
    if (specLoading) return;
    const stored = notesRef.current?.caseChecks;
    if (stored?.resolved) setChecksResolved(stored.resolved);
    if (stored?.key === checksKey && Array.isArray(stored.issues)) { setCaseChecks(stored.issues); return; }
    runCaseChecksNow().catch(() => {});
  }, [specLoading, checksKey]); // eslint-disable-line react-hooks/exhaustive-deps
  async function setCheckResolved(key, reason) {
    const next = { ...checksResolved };
    if (reason) next[key] = { reason, by: auth.user?.id ?? null, name: auth.profile?.full_name ?? null, at: new Date().toISOString() }; else delete next[key];
    setChecksResolved(next);
    try { await saveAiNotesPatch({ caseChecks: { ...(notesRef.current?.caseChecks ?? {}), issues: caseChecks, resolved: next } }); } catch (_) {}
  }
  async function analyzeAllowed() {
    const issues = caseChecks ?? await runCaseChecksNow();
    const b = blockingIssues(issues, checksResolved);
    if (b.length) {
      setRequestSummaryError(L(`Resolve the case checks before analyzing (${b.length} blocking).`, `Resuelva la revisión del caso antes de analizar (${b.length} bloqueantes).`));
      setActiveNode(6);
      return false;
    }
    return true;
  }
  const ANALYSIS_ORDER = ['summary', 'coverage', 'validation', 'requirements', 'questions'];
  const analysisStepOn = step => step === 'coverage' ? isSgNodeEnabled('sap_verification')
    : step === 'validation' ? isSgNodeEnabled('proposal_validation')
    : step === 'requirements' ? REQUIREMENTS_STEP : true;
  // 'missing' | 'outdated' | 'fresh'
  function analysisState(step, meta = analysisMeta) {
    const m = meta?.[step];
    if (!m?.at) return 'missing';
    if (m.docs !== inputDocsHash) return 'outdated';
    for (const prev of ANALYSIS_ORDER.slice(0, ANALYSIS_ORDER.indexOf(step))) {
      if (analysisStepOn(prev) && meta?.[prev]?.at && meta[prev].at > m.at) return 'outdated';
    }
    return 'fresh';
  }
  const staleAnalysisSteps = (meta = analysisMeta) => ANALYSIS_ORDER.filter(st => analysisStepOn(st) && analysisState(st, meta) !== 'fresh');
  async function markAnalysisStep(step, extraPatch = {}) {
    const next = { ...(notesRef.current?.analysisMeta ?? analysisMeta), [step]: { at: new Date().toISOString(), docs: inputDocsHash } };
    setAnalysisMeta(next);
    try { await saveAiNotesPatch({ ...extraPatch, analysisMeta: next }); } catch (_) {}
    return next;
  }
  const ANALYSIS_STEP_LABEL = {
    summary: L('Analysis summary', 'Resumen del análisis'), coverage: L('Standard coverage check', 'Verificación del estándar'),
    validation: L('Proposal validation', 'Validación de la propuesta'), requirements: L('Requirements checklist', 'Checklist de requerimientos'),
    questions: L('Questions for the customer', 'Preguntas para el cliente'),
  };
  // Run the analysis steps in order, each with the result of the previous one.
  async function handleRunAllAnalysis() {
    if (runningAll) return;
    setRunningAll(true);
    try {
      // Analyze is defined in the summary node's render: show it so the ref holds the current closure.
      setActiveNode(6);
      await new Promise(r => setTimeout(r, 60));
      const summary = await analyzeRef.current?.();
      if (!summary) return;
      let sc = null;
      if (analysisStepOn('coverage')) { sc = await handleSapCheck({ summary }); if (!sc) return; }
      if (analysisStepOn('validation') && sc) { const pc = await handleProposalValidation({ sapCheck: sc, summary }); if (!pc) return; }
      let reqs = requirements;
      if (analysisStepOn('requirements')) { reqs = await handleExtractRequirements({ summary }); if (!reqs) return; }
      await handleExtractQuestions({ summary, reqs });
    } finally { setRunningAll(false); }
  }
  // Status of every analysis step + "Run all analysis", shown on the pipeline nodes.
  function analysisStrip() {
    const steps = ANALYSIS_ORDER.filter(analysisStepOn);
    const stale = steps.filter(st => analysisState(st) !== 'fresh');
    const busy = runningAll || stepLoading || requestSummaryLoading || !!reqLoading || qLoading;
    const running = { summary: requestSummaryLoading, coverage: stepLoading && aiStep === 1, validation: stepLoading && aiStep === 2, requirements: reqLoading === 'extract', questions: qLoading };
    const blockingChecks = blockingIssues(caseChecks, checksResolved);
    const openChecks = (caseChecks ?? []).filter(i => !checksResolved?.[i.key]);
    const fmt = iso => { try { return new Date(iso).toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };
    const rows = [
      { key: 'checks', label: L('Case checks', 'Revisión del caso'),
        status: checksLoading ? 'checking' : !caseChecks ? 'pending' : blockingChecks.length ? 'error' : openChecks.length ? 'warning' : 'ok',
        detail: !caseChecks ? '' : blockingChecks.length ? L(`${blockingChecks.length} to resolve before Analyze`, `${blockingChecks.length} por resolver antes de Analizar`)
          : openChecks.length ? L(`${openChecks.length} warning${openChecks.length === 1 ? '' : 's'}`, `${openChecks.length} advertencia${openChecks.length === 1 ? '' : 's'}`) : L('Documents, project and duplicates checked', 'Documentos, proyecto y duplicados revisados') },
      ...steps.map(st => {
        const state = analysisState(st);
        const at = analysisMeta?.[st]?.at;
        return { key: st, label: ANALYSIS_STEP_LABEL[st],
          status: running[st] ? 'checking' : state === 'fresh' ? 'ok' : state === 'outdated' ? 'warning' : 'pending',
          pill: state === 'outdated' && !running[st] ? L('Outdated', 'Desactualizado') : null,
          detail: state === 'missing' ? '' : state === 'outdated'
            ? L(`Run ${fmt(at)} — the documents or an earlier step changed since`, `Ejecutado ${fmt(at)} — desde entonces cambiaron los documentos o un paso anterior`)
            : L(`Run ${fmt(at)}`, `Ejecutado ${fmt(at)}`) };
      }),
    ];
    const icon = st => st === 'checking' ? <RefreshCw size={14} className="animate-spin text-blue-600 dark:text-blue-400" />
      : st === 'ok' ? <CheckCircle2 size={14} className="text-green-500" />
      : st === 'warning' ? <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
      : st === 'error' ? <XCircle size={14} className="text-red-600 dark:text-red-400" />
      : <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gray-200 dark:border-gray-600" />;
    const pillCls = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none';
    const pill = (st, txt) => st === 'checking' ? <span className={`${pillCls} bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300`}>{L('Running…', 'Ejecutando…')}</span>
      : st === 'ok' ? <span className={`${pillCls} bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300`}>{L('Current', 'Al día')}</span>
      : st === 'warning' ? <span className={`${pillCls} bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300`}>{txt ?? L('Warning', 'Aviso')}</span>
      : st === 'error' ? <span className={`${pillCls} bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300`}>{L('Blocked', 'Bloqueado')}</span>
      : <span className={`${pillCls} bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500`}>{L('Not run', 'Sin ejecutar')}</span>;
    const bg = st => st === 'ok' ? 'border-green-100 dark:border-green-900/40 bg-green-50/40 dark:bg-green-900/10'
      : st === 'error' ? 'border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-900/10'
      : st === 'warning' ? 'border-amber-100 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-900/10'
      : st === 'checking' ? 'border-blue-100 dark:border-blue-800/40 bg-blue-50/20 dark:bg-blue-900/10'
      : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/20';
    const allOk = !stale.length && !blockingChecks.length;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">{L('Analysis pipeline', 'Pipeline de análisis')}</span>
          {allOk && <span className="text-[10px] font-medium text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 size={10} />{L('Ready to generate', 'Listo para generar')}</span>}
          {!specApproved && (
            <button onClick={handleRunAllAnalysis} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              {runningAll ? <><Spinner />{L('Running analysis…', 'Ejecutando análisis…')}</> : <><RefreshCw size={12} />{L('Run all analysis', 'Ejecutar todo el análisis')}</>}
            </button>
          )}
        </div>
        <div className="space-y-1">
          {rows.map((r, idx) => (
            <div key={r.key} className={`rounded-lg border transition-colors ${bg(r.status)}`}>
              <div className="flex items-start gap-2.5 px-3 py-2">
                <div className="shrink-0 mt-0.5">{icon(r.status)}</div>
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-[9px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center leading-none">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{r.label}</span>
                    {pill(r.status, r.pill)}
                  </div>
                  {r.detail && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug break-words">{r.detail}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {!allOk && <p className="text-[11px] text-amber-700 dark:text-amber-400">{L('Specs can be generated once every step is current.', 'Las specs se pueden generar cuando todos los pasos estén al día.')}</p>}
      </div>
    );
  }
  // Generate only on current analysis: blocks (admins may override, recorded in the notes).
  function generationGateOk() {
    const stale = staleAnalysisSteps();
    if (!stale.length) return true;
    const list = stale.map(st => `• ${ANALYSIS_STEP_LABEL[st]} (${analysisState(st) === 'missing' ? L('not run', 'sin ejecutar') : L('outdated', 'desactualizado')})`).join('\n');
    if (auth.isAdmin && (genGateOverrideRef.current || window.confirm(L(`The analysis is not current:\n${list}\n\nGenerate anyway? (admin override, recorded)`, `El análisis no está al día:\n${list}\n\n¿Generar de todos modos? (excepción de administrador, queda registrada)`)))) {
      genGateOverrideRef.current = true;
      saveAiNotesPatch({ genGateOverride: { at: new Date().toISOString(), by: auth.user?.id ?? null, stale } }).catch(() => {});
      return true;
    }
    setAiError(L(`Run the analysis before generating — not current:\n${list}\nUse "Run all analysis".`, `Ejecute el análisis antes de generar — no está al día:\n${list}\nUse "Ejecutar todo el análisis".`));
    return false;
  }

  // Findings of the coverage check and the proposal validation, for the spec prompts.
  function analysisFindingsBlock(sc = sapCheck, pc = proposalCheck) {
    const parts = [];
    if (sc?.gaps?.length) parts.push(`Standard SAP coverage (${sc.coverage ?? '—'}) — gaps that need development:\n${sc.gaps.map(g => `- ${g}`).join('\n')}${sc.recommendation ? `\nRecommendation: ${sc.recommendation}` : ''}`);
    if (pc?.concerns?.length) parts.push(`Proposal validation (score ${pc.score ?? '—'}/10) — concerns:\n${pc.concerns.map(c => `- ${c}`).join('\n')}${pc.recommendation ? `\nRecommendation: ${pc.recommendation}` : ''}`);
    if (!parts.length) return '';
    return `\n\nANALYSIS FINDINGS — address every point in the specification. When a point cannot be resolved from the customer's documents, list it in Assumptions / Next Steps as an open question for the customer (do not silently drop it):\n${parts.join('\n\n')}`;
  }

  // ── Requirement traceability (src/lib/requirements.js) ──────
  const canEditReqs = () => !specApproved && (auth.isAdmin || isCaseOwner);
  const whoAmI = () => ({ by: auth.user?.id ?? null, name: auth.profile?.full_name ?? null });
  async function saveRequirements(next) {
    setRequirements(next);
    try { await saveAiNotesPatch({ requirements: next }); } catch (_) {}
  }
  async function handleExtractRequirements(opts = {}) {
    const summaryIn = opts.summary !== undefined ? opts.summary : requestSummary;
    setReqLoading('extract'); setReqError(null);
    let result = null;
    try {
      const docBlocks = await buildDocumentBlocks();
      const prompt = `List EVERY requirement the customer states for this SAP case, from the attached customer documents (and the case description). One item per distinct requirement — functional rules, fields and data, screens, outputs/reports, integrations, authorizations, validations and error messages, and non-functional needs. Do not merge different requirements into one item and do not invent requirements.
For test matrices (sheets of test scenarios), do NOT list each row: group the scenarios by type and add one item per group with kind "test_scenario" (e.g. "Scenarios 1-12: purchase orders with discount — must ...").

Case: ${caseData.title}
Description: ${caseData.description ?? ''}${analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : ''}${summaryIn ? `\nRequest Summary (pre-analysis):\n${summaryIn}` : ''}

Respond with ONLY a JSON array, no markdown fences:
[{ "source": "document name and section/page/sheet", "text": "the requirement, precise and testable", "kind": "functional" | "data" | "ui" | "report" | "integration" | "authorization" | "test_scenario" | "non_functional" }]${jsonLangNote(lang)}`;
      const raw = await callClaude({ feature: 'spec_requirements', model: analysisModel,
        system: 'You are an SAP senior functional consultant doing requirements traceability. Respond ONLY with a valid JSON array.',
        messages: [{ role: 'user', content: docBlocks.length ? [...docBlocks, { type: 'text', text: prompt }] : prompt }], max_tokens: 12000 });
      const parsed = parseJsonArray(raw, 'requirements');
      if (!parsed) throw new Error(L('The requirements could not be read from the AI answer — run it again.', 'No se pudieron leer los requerimientos de la respuesta de la IA — ejecútelo de nuevo.'));
      // Keep what the consultants added by hand and their out-of-scope decisions (matched by text).
      const prevOut = Object.fromEntries(requirements.filter(r => r.outOfScope && !r.manual).map(r => [r.text.trim().toLowerCase(), r]));
      let next = normalizeRequirements(parsed).map(r => {
        const o = prevOut[r.text.trim().toLowerCase()];
        return o ? { ...r, outOfScope: true, reason: o.reason, by: o.by, at: o.at } : r;
      });
      const manual = requirements.filter(r => r.manual && r.text?.trim());
      next = [...next, ...manual.map((r, i) => ({ ...r, id: `REQ-${String(next.length + i + 1).padStart(2, '0')}` }))];
      setRequirements(next);
      await markAnalysisStep('requirements', { requirements: next });
      result = next;
    } catch (e) { setReqError(e.message); }
    setReqLoading(null);
    return result;
  }
  // ── Questions for the customer (src/lib/questions.js) ───────
  async function saveQuestions(next) {
    setQuestions(next);
    try { await saveAiNotesPatch({ questions: next }); } catch (_) {}
  }
  async function handleExtractQuestions(opts = {}) {
    const summaryIn = opts.summary !== undefined ? opts.summary : requestSummary;
    const reqs = opts.reqs ?? requirements;
    setQLoading(true); setQError(null);
    let result = null;
    try {
      const docBlocks = await buildDocumentBlocks();
      const prompt = `Before a functional specification is written for this SAP case, find what must be asked to the customer:
- CONTRADICTIONS between the documents (or within one): e.g. the spec says one value and the test matrix another;
- AMBIGUITIES: rules or terms that can be read in more than one way;
- MISSING INFORMATION needed to specify a requirement (values, tables, conditions, volumes, users).
Only real, specific points — quote both sides of a contradiction with its source. Do not ask about things the documents answer. For each one propose the assumption the spec will use if the customer does not answer.

Case: ${caseData.title}
Description: ${caseData.description ?? ''}${analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : ''}${summaryIn ? `\nRequest Summary (pre-analysis):\n${summaryIn}` : ''}${(reqs ?? []).length ? `\nRequirements checklist:\n${reqs.filter(r => !r.outOfScope).map(r => `- ${r.id}: ${r.text}`).join('\n')}` : ''}${answeredBlock()}

Respond with ONLY a JSON array (empty if there is nothing to ask), no markdown fences:
[{ "kind": "contradiction" | "ambiguity" | "missing", "text": "the question for the customer, clear and self-contained", "sources": "document / section of each side", "affects": ["REQ-03"], "assumption": "what the spec assumes if not answered" }]${jsonLangNote(specLang())}`;
      const raw = await callClaude({ feature: 'spec_questions', model: analysisModel,
        system: 'You are an SAP senior functional consultant preparing questions for the customer before writing a specification. Respond ONLY with a valid JSON array.',
        messages: [{ role: 'user', content: docBlocks.length ? [...docBlocks, { type: 'text', text: prompt }] : prompt }], max_tokens: 8000 });
      const parsed = parseJsonArray(raw, 'questions');
      if (!parsed) throw new Error(L('The questions could not be read from the AI answer — run it again.', 'No se pudieron leer las preguntas de la respuesta de la IA — ejecútelo de nuevo.'));
      // Keep what is already decided (answered, discarded, added by hand); new questions get new ids.
      const kept = questions.filter(q => q.status === 'answered' || q.status === 'discarded' || q.manual);
      const keptText = new Set(kept.map(q => q.text.trim().toLowerCase()));
      let n = Math.max(0, ...kept.map(q => Number(String(q.id).replace(/\D/g, '')) || 0));
      const fresh = normalizeQuestions(parsed).filter(q => !keptText.has(q.text.toLowerCase()))
        .map(q => ({ ...q, id: `Q-${String(++n).padStart(2, '0')}` }));
      const next = [...kept, ...fresh];
      setQuestions(next);
      await markAnalysisStep('questions', { questions: next });
      result = next;
    } catch (e) { setQError(e.message); }
    setQLoading(false);
    return result;
  }
  function answeredBlock() {
    const a = questions.filter(q => q.status === 'answered' && q.answer);
    return a.length ? `\nAlready answered by the customer (do not ask again):\n${a.map(q => `- ${q.text} → ${q.answer}`).join('\n')}` : '';
  }
  async function loadQuestionLinks() {
    const { data } = await supabase.from('spec_question_links').select('*').eq('case_id', caseData.id).order('created_at', { ascending: false });
    setQLinks(data ?? []);
    return data ?? [];
  }
  useEffect(() => {
    if (specLoading) return;
    loadQuestionLinks().then(links => {
      const base = notesRef.current?.questions ?? [];
      const { questions: merged, changed } = mergeLinkAnswers(base, links);
      if (changed) saveQuestions(merged);
    }).catch(() => {});
  }, [specLoading, caseData.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function sendQuestionsLink() {
    const open = openQuestions(questions);
    if (!open.length) return;
    try {
      const { data, error } = await supabase.from('spec_question_links').insert({
        case_id: caseData.id, case_title: caseData.title ?? '',
        questions: open.map(q => ({ id: q.id, kind: q.kind, text: q.text, sources: q.sources, assumption: q.assumption })),
        platform: { name: ssCtx.settings['platform_name'] || 'Arena Solution Platform', tagline: ssCtx.settings['platform_tagline'] || 'SAP Solutions', lang: specLang() },
      }).select().single();
      if (error) throw error;
      await copyQuestionsLink(data);
      supabase.rpc('spec_questions_notify', { p_link: data.id }).then(() => {}, () => {});   // in-app notice to the customer users
      await loadQuestionLinks();
    } catch (e) { setQError(e.message); }
  }
  async function copyQuestionsLink(l) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/questions/${l.token}`); } catch (_) {}
    setQCopied(l.id); setTimeout(() => setQCopied(null), 2500);
  }
  async function revokeQuestionsLink(l) {
    if (!window.confirm(L('Revoke this link? The customer will not be able to answer with it.', '¿Revocar este enlace? El cliente ya no podrá responder con él.'))) return;
    await supabase.from('spec_question_links').update({ status: 'revoked' }).eq('id', l.id);
    await loadQuestionLinks();
  }
  // Open questions at generation: ask whether to generate on their assumptions (recorded as acknowledged).
  function openQuestionsOk() {
    const open = openQuestions(questions);
    if (!open.length) return true;
    const ok = window.confirm(L(
      `${open.length} questions for the customer are still open:\n${open.slice(0, 8).map(q => `• ${q.id}: ${q.text}`).join('\n')}${open.length > 8 ? '\n…' : ''}\n\nGenerate using their assumptions? They are recorded as acknowledged and listed in the spec as open questions.`,
      `Hay ${open.length} preguntas para el cliente sin responder:\n${open.slice(0, 8).map(q => `• ${q.id}: ${q.text}`).join('\n')}${open.length > 8 ? '\n…' : ''}\n\n¿Generar con sus supuestos? Quedan registradas como aceptadas y listadas en la spec como preguntas abiertas.`));
    if (!ok) return false;
    const at = new Date().toISOString();
    const next = questions.map(q => (q.status === 'open' ? { ...q, status: 'acknowledged', by: auth.user?.id ?? null, name: auth.profile?.full_name ?? null, at } : q));
    setQuestions(next);
    saveAiNotesPatch({ questions: next }).catch(() => {});
    return true;
  }

  // Which generated spec the coverage check and the send gate are about.
  const gateSpecKey = () => (aiSpecC ? 'c' : aiSpecA ? 'a' : null);
  const specText = k => ({ a: aiSpecA, b: aiSpecB, c: aiSpecC, d: aiSpecD })[k];
  async function handleCheckCoverage(key, text, reqs = requirements) {
    const md = text ?? specText(key);
    const list = inScope(reqs);
    if (!md || !list.length) return null;
    setReqLoading('check'); setReqError(null);
    let result = null;
    try {
      const prompt = `Check whether this SAP specification covers each customer requirement.

REQUIREMENTS:
${list.map(r => `- ${r.id}: ${r.text}`).join('\n')}

SPECIFICATION:
${md}

For EACH requirement id answer:
- "covered": the spec explicitly and fully specifies it (where: the section / object that does);
- "partial": it is mentioned but incomplete or ambiguous (note: what is missing);
- "missing": the spec does not address it (an open question listed in the spec counts as "partial").
Respond with ONLY a JSON array, no markdown fences:
[{ "id": "REQ-01", "status": "covered" | "partial" | "missing", "where": "section / object", "note": "what is missing (empty if covered)" }]${jsonLangNote(lang)}`;
      const raw = await callClaude({ feature: 'spec_coverage', model: analysisModel,
        system: 'You are a strict SAP QA reviewer. Only mark a requirement covered when the specification really specifies it. Respond ONLY with a valid JSON array.',
        messages: [{ role: 'user', content: prompt }], max_tokens: 8000 });
      const items = parseJsonArray(raw, 'items');
      if (!items) throw new Error(L('The coverage result could not be read — run it again.', 'No se pudo leer el resultado de la cobertura — ejecútelo de nuevo.'));
      const prev = reqCoverage?.[key]?.accepted ?? {};
      const next = { ...reqCoverage, [key]: { at: new Date().toISOString(), specHash: textHash(md), items: items.map(i => ({ id: String(i.id), status: ['covered', 'partial', 'missing'].includes(i.status) ? i.status : 'missing', where: i.where ?? '', note: i.note ?? '' })), accepted: prev } };
      setReqCoverage(next);
      await saveAiNotesPatch({ reqCoverage: next });
      result = next[key];
    } catch (e) { setReqError(e.message); }
    setReqLoading(null);
    return result;
  }
  async function setGapAccepted(key, gapKey, reason) {
    const cur = reqCoverage?.[key] ?? {};
    const accepted = { ...(cur.accepted ?? {}) };
    if (reason) accepted[gapKey] = { reason, ...whoAmI(), at: new Date().toISOString() }; else delete accepted[gapKey];
    const next = { ...reqCoverage, [key]: { ...cur, accepted } };
    setReqCoverage(next);
    try { await saveAiNotesPatch({ reqCoverage: next }); } catch (_) {}
  }
  function coverageFor(key) {
    const md = specText(key);
    const cov = reqCoverage?.[key];
    const violations = md ? checkRules(md, activeRules(ssCtx.settings, caseData.project_id)) : [];
    return { stats: coverageStats(requirements, cov, violations), checked: !!cov?.at, current: !!cov?.at && cov.specHash === textHash(md), violations };
  }
  // Regenerate the spec closing its open gaps and rule violations, then check it again.
  async function handleFixGaps(key) {
    const md = specText(key);
    const { stats } = coverageFor(key);
    if (!md) return;
    setReqLoading('fix'); setReqError(null);
    try {
      const gaps = stats.openGaps.map(g => `- ${g.id}: ${g.text}${g.note ? ` — missing: ${g.note}` : ''}`);
      const rules = stats.openRules.map(v => `- ${v.text} — ${v.detail}`);
      const docBlocks = await buildDocumentBlocks();
      const prompt = `Below is the current specification. A coverage review found these gaps. Return the COMPLETE corrected specification (same sections, same format, same language) that closes every gap: specify each missing or partial requirement from the attached customer documents, add the objects the project rules require (marked "(regla del proyecto)") to the technical objects table, and keep everything else that is correct. Keep the Complexity column and do not write hours. Update the "Trazabilidad de requerimientos" section. If a requirement truly cannot be resolved from the documents, list it under Assumptions / Next Steps as an open question with its id.
${gaps.length ? `\nREQUIREMENT GAPS:\n${gaps.join('\n')}` : ''}${rules.length ? `\nPROJECT RULE VIOLATIONS:\n${rules.join('\n')}` : ''}${requirementsPromptBlock(requirements)}${questionsPromptBlock(questions)}${rulesPromptBlock(activeRules(ssCtx.settings, caseData.project_id))}

CURRENT SPECIFICATION:
${md}`;
      const raw = await callClaude({ feature: 'spec', model: genModel,
        system: 'You are an SAP functional consultant. Return only the full corrected functional specification in markdown.',
        messages: [{ role: 'user', content: docBlocks.length ? [...docBlocks, { type: 'text', text: sanitizeForJson(prompt) }] : sanitizeForJson(prompt) }], max_tokens: 40000 });
      const fixed = checkSpecText(raw);
      const calc = withCalculatedHours(key === 'c' ? { c: fixed, d: aiSpecD } : { a: fixed });
      const newMd = calc[key];
      const dd = diffSpecs(md, newMd);
      const nextDiff = { ...regenDiff }; if (dd) nextDiff[key] = dd; else delete nextDiff[key];
      setRegenDiff(nextDiff);
      if (key === 'c') { setAiSpecC(newMd); if (calc.d) setAiSpecD(calc.d); } else setAiSpecA(newMd);
      if (selectedSpec === key) setAiContent(newMd);
      setSavedSpecUrls(prev => ({ ...prev, [key]: null, ...(key === 'c' ? { d: null } : {}) }));
      await saveAiNotesPatch({ [key === 'c' ? 'specC' : 'specA']: newMd, ...(key === 'c' && calc.d ? { specD: calc.d } : {}), regenDiff: nextDiff, specGeneratedAt: new Date().toISOString() });
      setReqLoading(null);
      await handleCheckCoverage(key, newMd);
    } catch (e) { setReqError(e.message); setReqLoading(null); }
  }
  // ── Consultant sign-off before anything goes to the customer ─
  const specsHash = () => textHash([aiSpecA, aiSpecB, aiSpecC, aiSpecD].map(x => x ?? '').join('\u0000'));
  function signoffConditions() {
    const key = gateSpecKey();
    const cv = key ? coverageFor(key) : null;
    const genAt = notesRef.current?.specGeneratedAt ?? null;
    const live = questions.filter(q => q.status !== 'discarded');
    const open = live.filter(q => q.status === 'open');
    const late = genAt ? live.filter(q => q.status === 'answered' && q.at && q.at > genAt) : [];
    const pendingLinks = qLinks.filter(l => l.status === 'pending');
    return [
      { key: 'coverage', ok: !!cv && cv.stats.total > 0 && cv.checked && cv.current && cv.stats.openGaps.length === 0,
        label: L('Requirements covered (or gaps accepted)', 'Requerimientos cubiertos (o brechas aceptadas)'),
        detail: !cv ? L('No generated spec', 'No hay spec generada') : !cv.stats.total ? L('No requirements checklist', 'Sin checklist de requerimientos')
          : !cv.checked || !cv.current ? L('Coverage not checked on the current spec', 'Cobertura sin verificar en la spec actual')
          : cv.stats.openGaps.length ? L(`${cv.stats.pct}% — ${cv.stats.openGaps.length} open gaps`, `${cv.stats.pct}% — ${cv.stats.openGaps.length} brechas abiertas`) : `${cv.stats.pct}%` },
      { key: 'rules', ok: !!cv && cv.stats.openRules.length === 0,
        label: L('Project mandatory rules met (or accepted)', 'Reglas obligatorias del proyecto cumplidas (o aceptadas)'),
        detail: cv?.stats.openRules.length ? cv.stats.openRules.map(v => v.text).join(' · ') : '' },
      { key: 'questions', ok: open.length === 0,
        label: L('Customer questions answered or acknowledged', 'Preguntas al cliente respondidas o aceptadas como supuesto'),
        detail: open.length ? L(`${open.length} open${pendingLinks.length ? ' — waiting for the customer' : ''}`, `${open.length} abiertas${pendingLinks.length ? ' — esperando al cliente' : ''}`)
          : live.length ? L(`${live.filter(q => q.status === 'answered').length} answered · ${live.filter(q => q.status === 'acknowledged').length} as assumptions`, `${live.filter(q => q.status === 'answered').length} respondidas · ${live.filter(q => q.status === 'acknowledged').length} como supuesto`) : '' },
      { key: 'answers_in_spec', ok: late.length === 0,
        label: L('The spec includes every answer received', 'La spec incluye todas las respuestas recibidas'),
        detail: late.length ? L(`Answers after the last generation: ${late.map(q => q.id).join(', ')} — regenerate`, `Respuestas posteriores a la última generación: ${late.map(q => q.id).join(', ')} — regenere`) : '' },
    ];
  }
  const signoffValid = () => !!signoff?.at && signoff.specHash === specsHash();
  async function handleSignoff(on) {
    const next = on ? { by: auth.user?.id ?? null, name: auth.profile?.full_name ?? null, at: new Date().toISOString(), specHash: specsHash(), specKey: gateSpecKey(),
      conditions: signoffConditions().map(c => ({ key: c.key, ok: c.ok, detail: c.detail })) } : null;
    setSignoff(next);
    try { await saveAiNotesPatch({ signoff: next }); } catch (_) {}
    if (on) logEvent?.('spec.signed_off', { entityType: 'case', entityId: caseData.id, entityName: caseData.title });
  }
  // Nothing goes to the customer without a current sign-off.
  function sendGateOk() {
    if (!gateSpecKey()) return true;
    if (signoffValid()) return true;
    const pending = signoffConditions().filter(c => !c.ok);
    alert(pending.length
      ? L(`The spec cannot be sent yet:\n${pending.map(c => `• ${c.label}${c.detail ? ` — ${c.detail}` : ''}`).join('\n')}`, `La spec todavía no se puede enviar:\n${pending.map(c => `• ${c.label}${c.detail ? ` — ${c.detail}` : ''}`).join('\n')}`)
      : signoff?.at ? L('The spec changed after the sign-off. Sign it off again before sending it.', 'La spec cambió después de la firma. Fírmela de nuevo antes de enviarla.')
        : L('Sign off the spec before sending it to the customer.', 'Firme la spec antes de enviarla al cliente.'));
    return false;
  }

  // Rewrite the objects table and estimate of Specs A and C with calculated hours; Spec D (derived
  // from C, no objects table) gets C's estimate.
  function withCalculatedHours(specs, overrides) {
    const out = { ...specs };
    let estC = null;
    for (const k of ['a', 'c']) {
      if (!out[k]) continue;
      const r = applySpecHours(out[k], hoursOpts(overrides));
      out[k] = r.md;
      if (k === 'c') estC = r.estimate;
    }
    if (!estC && specs.c === undefined && aiSpecC) estC = applySpecHours(aiSpecC, hoursOpts(overrides)).estimate;
    if (out.d && estC) out.d = replaceEstimateSection(out.d, estC, specLang());
    return out;
  }

  // Builds ALL doc blocks: case docs + project docs + ABAP standards (text capped at DOC_CHARS_TOTAL + 60k)
  async function buildAllDocBlocks() {
    const [caseBlocks, abap] = await Promise.all([
      buildDocumentBlocks(),
      buildAbapStandardsForSpec(),
    ]);
    // Project docs as text blocks
    const projBlocks = [];
    if (caseData.project_id) {
      try {
        const { data } = await supabase.from('system_settings').select('value').eq('key', 'project_docs').maybeSingle();
        const docs = (data?.value ?? {})[caseData.project_id] ?? [];
        for (const doc of docs) {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 20000);
            const r = await fetch('/api/extract-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: doc.url, fileName: doc.name, maxChars: 60000 }),
              signal: ctrl.signal,
            });
            clearTimeout(tid);
            const { text } = r.ok ? await r.json() : {};
            if (text) projBlocks.push({ type: 'text', text: `[Project Document: ${doc.name}]\n${text}` });
          } catch (_) {}
        }
      } catch (_) {}
    }
    // Case documents (the customer's requirement) first, then project documents and ABAP
    // standards. Cap the total text; anything cut is marked so the AI doesn't read it as complete.
    const all = [...caseBlocks, ...projBlocks, ...abap.blocks];
    const CAP = DOC_CHARS_TOTAL + 60000;
    let totalChars = 0;
    const capped = [];
    for (const block of all) {
      if (block.type === 'text') {
        const remaining = CAP - totalChars;
        if (remaining <= 0) {
          const name = block.text.match(/^\[[^\]]*?:\s*([^\]]+)\]/)?.[1];
          if (name) capped.push({ type: 'text', text: `[${name.trim()} — not included: text budget used up. It exists; do not report its content as missing.]` });
          continue;
        }
        const cut = block.text.length > remaining;
        const text = cut ? block.text.slice(0, remaining) + '\n\n[... TRUNCATED here because of the text budget. The rest exists; do not report it as missing.]' : block.text;
        capped.push({ ...block, text });
        totalChars += text.length;
      } else {
        capped.push(block); // PDF and image blocks pass through
      }
    }
    return capped;
  }

  // Returns { blocks, contextText } with ABAP standards as extracted text + naming rules
  async function buildAbapStandardsForSpec() {
    const projId   = caseData.project_id;
    const clientId = caseData.client_id;
    const caseId   = caseData.id;
    const sapIntCfg = ssCtx.settings['sap_integration'] ?? {};
    const rawTemplates = projId
      ? (sapIntCfg[`proj_${projId}`]?.abap_templates ?? (sapIntCfg[`proj_${projId}`]?.abap_template ? [sapIntCfg[`proj_${projId}`].abap_template] : []))
      : [];

    // Extract ABAP standards as text (avoids large base64 PDF blocks that cause Vercel timeouts)
    const blocks = [];
    for (const tmpl of rawTemplates) {
      const url = typeof tmpl === 'string' ? tmpl : (tmpl.url ?? tmpl.file_url);
      const name = typeof tmpl === 'string' ? url.split('/').pop().split('?')[0] : (tmpl.name ?? tmpl.file_name ?? 'ABAP Standards');
      if (!url) continue;
      try {
        const hasExt = /\.[a-z0-9]{2,5}$/i.test(name);
        const r = await fetch('/api/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, fileName: hasExt ? name : name + '.pdf', maxChars: 40000 }),
        });
        const { text } = r.ok ? await r.json() : {};
        if (text) blocks.push({ type: 'text', text: `[ABAP Standards Document: ${name}]\n${text}` });
        else console.warn('[abap-standards] could not extract text from', name, r.status);
      } catch (e) { console.warn('[abap-standards] extract failed for', name, e?.message); }
    }

    const clientStd  = (ssCtx.settings['abap_standards_client']  ?? {})[clientId]  ?? {};
    const projectStd = (ssCtx.settings['abap_standards_project'] ?? {})[projId]    ?? {};
    const caseStd    = (ssCtx.settings['abap_standards_case']    ?? {})[caseId]    ?? {};
    const explicitPrefix = caseStd.globalPrefix || projectStd.globalPrefix || clientStd.globalPrefix;
    const std = { globalPrefix:'Z', namespacePrefix:'', objectTypePrefixes:{}, ...clientStd, ...projectStd, ...caseStd };
    const hasDocs = blocks.length > 0;

    const lines = [];
    // With standards documents attached, the built-in 'Z' default must not compete with them.
    if (std.globalPrefix && (!hasDocs || explicitPrefix)) lines.push(`Global object prefix: ${std.globalPrefix}`);
    if (std.namespacePrefix)  lines.push(`Namespace prefix: ${std.namespacePrefix}`);
    const pfx = std.objectTypePrefixes ?? {};
    const pfxParts = Object.entries(pfx).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`);
    if (pfxParts.length) lines.push(`Object type prefixes — ${pfxParts.join(', ')}`);
    if (std.headerTemplate)   lines.push(`Header template:\n${std.headerTemplate}`);
    if (std.changeLogTemplate) lines.push(`Change-log template: ${std.changeLogTemplate}`);
    if (std.authorId)         lines.push(`Default author ID: ${std.authorId}`);

    const docNames = blocks.map(b => (b.text.match(/^\[ABAP Standards Document: ([^\]]+)\]/) ?? [])[1]).filter(Boolean);
    let contextText = '';
    if (hasDocs) {
      contextText = `\n\n## Project ABAP Naming & Coding Standards (MANDATORY)\n`
        + `The attached ABAP Standards Document(s) (${docNames.join(', ')}) are the AUTHORITATIVE conventions for this project. `
        + `Build EVERY technical object name (tables, structures, data elements, domains, programs, classes, interfaces, CDS views, RAP objects, function groups/modules, transactions, message classes, enhancements, etc.) and every transport request description strictly from the grammars, patterns, component codes and catalogs defined in those documents. `
        + `Do not invent prefixes or use generic names such as Z<MODULE>_… when the documents define a pattern. If a required code (e.g. solution/domain or module code) cannot be derived from the case, use the documents' rules and flag the assumed value.`
        + (lines.length ? `\nAdditional settings — apply only where the documents are silent:\n${lines.join('\n')}` : '');
    } else if (lines.length) {
      contextText = `\n\n## Project ABAP Naming & Coding Standards\nApply these conventions to ALL technical objects proposed:\n${lines.join('\n')}`;
    }

    return { blocks, contextText };
  }

  function buildCaseDocHtml(docTitle, eyebrow, metaItems, markdownContent) {
    const docLocale = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : lang === 'it' ? 'it-IT' : lang === 'nl' ? 'nl-NL' : lang === 'pl' ? 'pl-PL' : 'en-US';
    const date = new Date().toLocaleDateString(docLocale, { year: 'numeric', month: 'long', day: 'numeric' });
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const mdToHtml = md => {
      if (!md) return '';
      const fmt = s => esc(s)
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>');
      const lines = md.split('\n');
      const out = [];
      let inUl = false, inOl = false, inTable = false, inThead = false, inCode = false, codeLines = [];
      const closeList  = () => { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
      const closeTable = () => { if (inTable) { out.push('</tbody></table></div>'); inTable = false; inThead = false; } };
      const renderDocScreen = cc => {
        const ls = cc.split('\n').map(l=>l.trim()).filter(Boolean);
        const typeL = (ls[0]||'').toUpperCase();
        const isSelection = typeL.includes('SELECTION');
        const isOutput    = typeL.includes('OUTPUT');
        const isFiori     = typeL.includes('FIORI');
        const isTxn       = typeL.includes('TRANSACTION');
        const isConfig    = typeL.includes('CONFIG');
        let title=''; const params=[],fields=[],steps=[],cols=[],rows=[];
        ls.forEach(l=>{
          if(/^SCREEN:/i.test(l)) return;
          if(/^TITLE:/i.test(l))  { title=l.replace(/^TITLE:\s*/i,''); return; }
          if(/^PARAM:/i.test(l))  { const p=l.replace(/^PARAM:\s*/i,'').split('|'); params.push({label:(p[0]||'').trim(),value:(p[2]||'').trim(),req:(p[3]||'O').trim().toUpperCase()==='R'}); return; }
          if(/^FIELD:/i.test(l))  { const p=l.replace(/^FIELD:\s*/i,'').split('|'); { const _v=(p[2]||'').trim(); const _new=/^new$/i.test(_v); fields.push({label:(p[0]||'').trim(),tech:(p[1]||'').trim(),value:_new?'':_v,isNew:_new,req:(p[3]||'O').trim().toUpperCase()==='R',disp:(p[3]||'O').trim().toUpperCase()==='D'}); } return; }
          if(/^STEP:/i.test(l))   { steps.push(l.replace(/^STEP:\s*/i,'').trim()); return; }
          if(/^COL:/i.test(l))    { const p=l.replace(/^COL:\s*/i,'').split('|'); cols.push({label:(p[0]||'').trim()}); return; }
          if(/^ROW:/i.test(l))    { rows.push(l.replace(/^ROW:\s*/i,'').split('|').map(v=>v.trim())); return; }
        });
        const sapChr = body=>`<div style="border:1px solid #8fa8cc;border-radius:3px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,0.13)"><div style="background:#1a3764;color:white;padding:5px 10px;font-size:11.5px;font-weight:600">${esc(title||'SAP')}</div><div style="background:#dde4f0;border-bottom:1px solid #b0bbcc;padding:2px 8px;font-size:10px;display:flex;gap:12px">${['Sistema','Editar','Pasar a','Extras','Ayuda'].map(m=>`<span>${m}</span>`).join('')}</div>${body}<div style="background:#dde4f0;border-top:1px solid #b0bbcc;padding:2px 8px;font-size:10px;display:flex;justify-content:space-between"><span>Arena-DEV | 100</span><span style="color:#006600;font-weight:700">● Listo</span></div></div>`;
        if (isConfig || isConfig) {
          const stps = (steps.length ? steps : ['Acceder a la ruta de customizing indicada','Ejecutar la actividad de configuración']).map((s,i)=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f7"><div style="background:#1a3764;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#1a2a4a;line-height:1.5">${esc(s)}</div></div>`).join('');
          return `<div style="border:1px solid #c8d4e8;border-radius:6px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;margin:14px 0"><div style="background:#1a3764;color:white;padding:7px 14px;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:8px"><span style="background:rgba(255,255,255,0.2);border-radius:3px;padding:1px 6px;font-size:9.5px;font-family:monospace">SPRO</span>${esc(title||'Customizing')}</div><div style="background:#f5f7fc;padding:12px 16px">${stps}</div></div>`;
        }
        if (isFiori || isTxn) {
          const flds = (fields.length ? fields : params.length ? params.map(p=>({...p,tech:'',disp:false})) : [{label:'Campo nuevo',value:'',req:true,tech:'ZFIELD',disp:false}]);
          const rows2 = flds.map(f=>`<div style="display:flex;align-items:center;gap:0;margin-bottom:10px"><div style="width:38%;padding-right:12px;text-align:right"><label style="font-size:11.5px;color:#32363a;font-weight:${f.req?'600':'400'}">${esc(f.label)}${f.req?'<span style="color:#bb0000"> *</span>':''}${f.isNew?' <span style="font-size:9px;font-weight:600;color:#0f7b3f;background:#e3f6ea;border:1px solid #b5e2c4;border-radius:8px;padding:0 5px;margin-left:4px;vertical-align:middle">nuevo</span>':''}</label></div><div style="width:62%">${f.disp?`<span style="font-size:11.5px;color:#32363a;padding:6px 8px;display:inline-block;border-bottom:1px solid #89919a">${esc(f.value||'—')}</span>`:`<input readonly value="${esc(f.value)}" style="width:90%;max-width:260px;height:30px;border:1px solid #89919a;border-bottom:2px solid #0a6ed1;padding:0 8px;font-size:11.5px;color:#32363a;background:white;border-radius:4px 4px 0 0"/>`}</div></div>`).join('');
          const typeLabel = isFiori ? 'Fiori App' : 'SAP Transaction';
          return `<div style="border:1px solid #c8d4e8;border-radius:6px;overflow:hidden;font-family:'72','Noto Sans',Arial,sans-serif;margin:14px 0;box-shadow:0 1px 6px rgba(0,0,0,0.1)"><div style="background:#0a6ed1;color:white;padding:8px 14px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:600">${esc(title||typeLabel)}</span><span style="font-size:10px;background:rgba(255,255,255,0.2);border-radius:10px;padding:2px 8px">${typeLabel}</span></div><div style="background:white;padding:16px 20px"><div style="font-size:10.5px;color:#6a6d70;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;margin-bottom:12px;border-bottom:1px solid #d9d9d9;padding-bottom:6px">Datos</div>${rows2}</div><div style="background:#f5f5f5;border-top:1px solid #d9d9d9;padding:8px 14px;display:flex;gap:8px"><button style="background:#0a6ed1;color:white;border:none;padding:6px 16px;border-radius:4px;font-size:11.5px;font-weight:600;cursor:pointer">Grabar</button><button style="background:white;color:#0a6ed1;border:1px solid #0a6ed1;padding:6px 16px;border-radius:4px;font-size:11.5px;cursor:pointer">Cancelar</button></div></div>`;
        }
        if (isSelection || isOutput) {
          if (isSelection) {
            const dp = params.length ? params : [{label:'Sociedad',value:'1000',req:true},{label:'Período',value:'2024',req:false}];
            const flds2 = dp.map(p=>`<div style="display:flex;align-items:center;margin-bottom:7px"><span style="color:#cc0000;width:10px;font-weight:bold">${p.req?'*':''}</span><label style="width:185px;color:#2a3a5a;font-size:11.5px">${esc(p.label)}</label><input value="${esc(p.value)}" readonly style="width:155px;height:21px;border:1px solid #99aabb;border-bottom:2px solid #2855a8;padding:0 6px;font-size:11.5px;color:#001280;background:white"/></div>`).join('');
            return sapChr(`<div style="background:#f5f7fc;padding:14px 18px"><div style="border:1px solid #8899bb;border-radius:2px;padding:16px 18px;background:white;margin-bottom:12px">${flds2}</div><div style="display:flex;gap:8px"><button style="background:#1a3764;color:white;border:1px solid #0a2244;padding:5px 18px;font-size:11.5px;font-weight:600;cursor:pointer">Ejecutar (F8)</button><button style="background:#c8d4e8;color:#222;border:1px solid #8899bb;padding:5px 14px;font-size:11.5px;cursor:pointer">Cancelar</button></div></div>`);
          } else {
            const uc = cols.length ? cols : [{label:'Objeto'},{label:'Descripción'},{label:'Importe'},{label:'Moneda'}];
            const ur = rows.length ? rows : [['Z_OBJ','Ejemplo de objeto','1,000.00','EUR']];
            const hdr2 = uc.map(c=>`<th style="background:#3a628a;color:white;padding:6px 8px;font-size:11px;font-weight:600;text-align:left;border:1px solid #2a4a70">${esc(c.label)}</th>`).join('');
            const drows2 = ur.map((row,ri)=>`<tr>${uc.map((c,ci)=>`<td style="padding:4px 8px;font-size:11px;border:1px solid #c8d4e8;background:${ri%2===0?'white':'#f0f5fc'}">${esc(row[ci]||'')}</td>`).join('')}</tr>`).join('');
            return sapChr(`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>${hdr2}</tr></thead><tbody>${drows2}</tbody></table></div>`);
          }
        }
        return `<pre><code>${codeLines.map(l=>esc(l)).join('\n')}</code></pre>`;
      };
      const closeCode = () => {
        if (!inCode) return;
        const cc = codeLines.join('\n');
        out.push(/SCREEN:/i.test(cc) ? renderDocScreen(cc) : '<pre><code>' + codeLines.map(l=>esc(l)).join('\n') + '</code></pre>');
        inCode = false; codeLines = [];
      };
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith('```')) {
          if (inCode) { closeCode(); }
          else { closeList(); closeTable(); inCode = true; codeLines = []; }
          continue;
        }
        if (inCode) { codeLines.push(raw); continue; }
        const isBullet   = /^[\-\*] /.test(line);
        const isNumbered = /^\d+\. /.test(line);
        const isTableRow = line.startsWith('|');
        const isSep      = isTableRow && line.split('|').slice(1,-1).every(c => /^[-: ]+$/.test(c.trim()));
        if (!isBullet)   { if (inUl) { out.push('</ul>'); inUl = false; } }
        if (!isNumbered) { if (inOl) { out.push('</ol>'); inOl = false; } }
        if (!isTableRow) { closeTable(); }
        if      (line.startsWith('#### ')) { out.push(`<h4>${fmt(line.slice(5))}</h4>`); }
        else if (line.startsWith('### '))  { out.push(`<h3>${fmt(line.slice(4))}</h3>`); }
        else if (line.startsWith('## '))   { out.push(`<h2>${fmt(line.slice(3))}</h2>`); }
        else if (line.startsWith('# '))    { out.push(`<h1>${fmt(line.slice(2))}</h1>`); }
        else if (line === '---')           { out.push('<hr>'); }
        else if (isBullet) {
          if (!inUl) { out.push('<ul>'); inUl = true; }
          out.push(`<li>${fmt(line.slice(2))}</li>`);
        } else if (isNumbered) {
          if (!inOl) { out.push('<ol>'); inOl = true; }
          out.push(`<li>${fmt(line.replace(/^\d+\. /,''))}</li>`);
        } else if (isSep) {
          if (inThead) { out.push('</thead><tbody>'); inThead = false; }
        } else if (isTableRow) {
          const cells = line.split('|').slice(1,-1).map(c => c.trim());
          if (!inTable) {
            out.push('<div class="tbl-wrap"><table><thead>');
            out.push('<tr>' + cells.map(c => `<th>${fmt(c)}</th>`).join('') + '</tr>');
            inTable = true; inThead = true;
          } else {
            out.push('<tr>' + cells.map(c => `<td>${fmt(c)}</td>`).join('') + '</tr>');
          }
        } else if (line.trim()) {
          out.push(`<p>${fmt(line)}</p>`);
        } else {
          out.push('<br>');
        }
      }
      if (inUl) out.push('</ul>');
      if (inOl) out.push('</ol>');
      closeTable();
      closeCode();
      return out.join('\n');
    };
    const metaHtml = (metaItems ?? []).map(m => `<div class="meta-item"><span class="lbl">${esc(m.label)}</span><span class="val">${esc(m.value)}</span></div>`).join('');
    return `<!DOCTYPE html>
<html lang="${lang || 'es'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)} — ${esc(caseData.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#F6F7FB;color:#1A2A4A;font-size:0.9rem;line-height:1.65}
.doc-header{background:#1A2A4A;color:#fff;padding:2.5rem 3rem 2rem}
.doc-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1.5rem;margin-bottom:0}
.eyebrow{font-family:'IBM Plex Mono',monospace;font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:0.5rem}
.doc-header h1{font-family:'DM Serif Display',Georgia,serif;font-size:clamp(1.5rem,3vw,2.3rem);font-weight:400;line-height:1.15;color:#fff;margin-bottom:0.2rem}
.doc-header h1 em{font-style:italic;color:rgba(255,255,255,0.65)}
.meta-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1.2rem;padding-top:1.1rem;border-top:1px solid rgba(255,255,255,0.1)}
.meta-item{display:flex;flex-direction:column;gap:0.15rem}
.lbl{font-family:'IBM Plex Mono',monospace;font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.35)}
.val{font-size:0.8rem;color:rgba(255,255,255,0.8);font-weight:500}
.doc-body{max-width:860px;margin:0 auto;padding:2rem 1.5rem 4rem}
h1{font-family:'DM Serif Display',serif;font-size:1.35rem;font-weight:400;color:#1254A0;margin:1.8rem 0 0.6rem;padding-bottom:0.4rem;border-bottom:2px solid #DDE1EE}
h2{font-family:'IBM Plex Sans',sans-serif;font-size:0.82rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1254A0;margin:1.4rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:1px solid #DDE1EE}
h3{font-size:0.88rem;font-weight:600;color:#1A2A4A;margin:1rem 0 0.35rem}
h4{font-size:0.8rem;font-weight:600;color:#4A5878;margin:0.8rem 0 0.3rem}
p{font-size:0.85rem;color:#2E3D5A;margin-bottom:0.65rem;line-height:1.7}
ul,ol{padding-left:1.4rem;margin-bottom:0.65rem}
li{font-size:0.83rem;color:#2E3D5A;margin-bottom:0.25rem;line-height:1.55}
strong{color:#1A2A4A;font-weight:600}
code{font-family:'IBM Plex Mono',monospace;font-size:0.75em;background:#ECEEF5;color:#D4600A;padding:0.1em 0.35em;border-radius:3px}
hr{border:none;border-top:1px solid #DDE1EE;margin:1.5rem 0}
pre{background:#ECEEF5;border:1px solid #DDE1EE;border-radius:6px;padding:1rem 1.2rem;margin:1rem 0;overflow-x:auto}
pre code{background:none;padding:0;color:#1A2A4A;font-size:0.78rem;line-height:1.6}
.tbl-wrap{overflow-x:auto;margin:1rem 0}
table{width:100%;border-collapse:collapse;font-size:0.78rem;border:1px solid #DDE1EE;border-radius:6px;overflow:hidden}
th{background:#ECEEF5;color:#4A5878;font-weight:600;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;text-align:left;padding:0.55rem 0.8rem;border-bottom:1px solid #DDE1EE}
td{padding:0.55rem 0.8rem;border-bottom:1px solid #DDE1EE;color:#2E3D5A;vertical-align:top}
tr:last-child td{border-bottom:none}
.sig-row{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;margin-top:3rem;padding-top:1.5rem;border-top:2px solid #DDE1EE}
.sig-block .sig-label{font-family:'IBM Plex Mono',monospace;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:#8494B2;margin-bottom:1.8rem}
.sig-block .sig-line{border-top:1px solid #1A2A4A;padding-top:0.4rem;font-size:0.72rem;color:#4A5878}
.print-btn{position:fixed;bottom:1.5rem;right:1.5rem;background:#0056A0;color:#fff;border:none;border-radius:8px;padding:0.65rem 1.2rem;font-family:'IBM Plex Sans',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,86,160,0.35)}
.print-btn:hover{background:#004080}
@media print{.print-btn{display:none}body{background:#fff}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">${t('spec.save_pdf_btn')}</button>
<header class="doc-header">
  <div class="doc-header-top">
    <div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(docTitle)}<br><em>${esc(caseData.title)}</em></h1>
    </div>
    <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0"><svg width="36" height="36" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="og" cx="36%" cy="33%" r="78%"><stop offset="0%" stop-color="#4F6EF7"/><stop offset="100%" stop-color="#0D1F3C"/></radialGradient></defs><circle cx="40" cy="40" r="39" fill="none" stroke="#4F6EF7" stroke-opacity="0.18" stroke-width="1"/><circle cx="40" cy="40" r="28" fill="none" stroke="#4F6EF7" stroke-opacity="0.35" stroke-width="1"/><circle cx="40" cy="40" r="13" fill="url(#og)"/><text x="40" y="46" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="16" fill="#fff">A</text><circle cx="40" cy="1.5" r="3" fill="#4F6EF7"/><circle cx="13" cy="64" r="2.2" fill="#818cf8" opacity="0.8"/><circle cx="68" cy="18" r="2.5" fill="#6366f1"/></svg><div style="line-height:1.25"><div style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.8);white-space:nowrap"><span style="color:#7B9BFF">Arena</span> Solutions Platform${BRAND_MARK_HTML}</div><div style="font-size:0.5rem;color:#93C5FD;letter-spacing:0.06em;white-space:nowrap">Consultant Case Management</div></div></div>
  </div>
  <div class="meta-row">${metaHtml}</div>
</header>
<div class="doc-body">
${mdToHtml(markdownContent)}
<div class="sig-row">
  <div class="sig-block"><div class="sig-label">${t("spec.label_sig_analyst")}</div><div class="sig-line">${t("spec.label_sig_date")}</div></div>
  <div class="sig-block"><div class="sig-label">${t("spec.label_sig_dev")}</div><div class="sig-line">${t("spec.label_sig_date")}</div></div>
  <div class="sig-block"><div class="sig-label">${t("spec.label_sig_client")}</div><div class="sig-line">${t("spec.label_sig_date")}</div></div>
</div>
</div>
</body>
</html>`;
  }

  function buildSpecHtml(markdown) {
    const docLocale2 = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
    const date = new Date().toLocaleDateString(docLocale2, { year: 'numeric', month: 'long', day: 'numeric' });
    return buildCaseDocHtml(
      t("spec.html_title"),
      'SAP Consulting · ' + t("spec.html_title"),
      [
        { label: t("spec.label_case_id"),  value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
        { label: t("label.sap_area"),      value: caseData.area_sap ?? '—' },
        { label: t("label.priority"),      value: (caseData.priority ?? '—').toUpperCase() },
        { label: t("spec.label_generated"),value: date },
      ],
      markdown
    );
  }

  function parseMarkdownNodes(md) {
    const nodes = [];
    const lines = (md ?? '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^#{1,2}\s/.test(line)) {
        nodes.push({ type: 'heading', text: line.replace(/^#+\s+/, '') });
        i++; continue;
      }
      if (/^#{3,}\s/.test(line)) {
        nodes.push({ type: 'subheading', text: line.replace(/^#+\s+/, '') });
        i++; continue;
      }
      if (/^```/.test(line)) {
        i++;
        const codeLines = [];
        while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
        i++;
        if (codeLines.length) nodes.push({ type: 'code', content: codeLines.join('\n') });
        continue;
      }
      if (line.trim().startsWith('|') && line.includes('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++; }
        const dataRows = tableLines.filter(l => !/^\s*\|[-: |]+\|\s*$/.test(l));
        if (dataRows.length > 1) {
          const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/\*\*(.+?)\*\*/g, '$1'));
          nodes.push({ type: 'table', head: parseRow(dataRows[0]), body: dataRows.slice(1).map(parseRow) });
        }
        continue;
      }
      if (/^[-*•]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'));
          i++;
        }
        nodes.push({ type: 'list', ordered: false, items });
        continue;
      }
      if (/^\d+[.)]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+[.)]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'));
          i++;
        }
        nodes.push({ type: 'list', ordered: true, items });
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const textLines = [];
      while (i < lines.length && lines[i].trim() &&
        !/^#/.test(lines[i]) && !/^```/.test(lines[i]) &&
        !lines[i].trim().startsWith('|') &&
        !/^[-*•]\s/.test(lines[i]) && !/^\d+[.)]\s/.test(lines[i])) {
        textLines.push(lines[i].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1'));
        i++;
      }
      if (textLines.length) nodes.push({ type: 'text', content: textLines.join(' ') });
    }
    return nodes;
  }

  async function buildSpecPdf(markdown) {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, L = 12, R = 198;
    const sapBlue = [26, 75, 140];
    const sapLightBlue = [232, 240, 251];
    const _pdfLocale = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
    const date = new Date().toLocaleDateString(_pdfLocale, { year: 'numeric', month: 'long', day: 'numeric' });

    // ── HEADER ──────────────────────────────────────────────────
    doc.setFillColor(...sapBlue);
    doc.rect(0, 0, W, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(t('spec.doc_pdf_breadcrumb') + (caseData.area_sap ?? 'Module'), L, 11);
    doc.setFontSize(16);
    const titleText = (caseData.title ?? 'Case Title');
    doc.text(titleText.length > 65 ? titleText.substring(0, 63) + '...' : titleText, L, 23);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(170, 205, 240);
    const subLine = [caseData.area_sap, caseData.area_industry].filter(Boolean).join('  ·  ');
    if (subLine) doc.text(subLine, L, 33);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(R - 22, 7, 22, 12, 2, 2, 'F');
    doc.setTextColor(...sapBlue);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SAP', R - 17, 16);

    // ── METADATA TABLE ──────────────────────────────────────────
    let y = 50;
    autoTable(doc, {
      startY: y,
      head: [['Requirement ID', 'SAP Module', 'Industry', 'Requested by', 'Due Date', 'Priority']],
      body: [[
        '#' + (caseData.id ?? '').slice(0, 8),
        caseData.area_sap ?? '—',
        caseData.area_industry ?? '—',
        caseData.key_user_email ?? '—',
        caseData.due_date ? new Date(caseData.due_date + 'T00:00:00').toLocaleDateString() : '—',
        (caseData.priority ?? '—').toUpperCase(),
      ]],
      styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [200, 215, 235] },
      headStyles: { fillColor: [50, 100, 170], textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fillColor: sapLightBlue, textColor: [30, 50, 80] },
      theme: 'grid',
      margin: { left: L, right: 12 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── SAP SCREEN RENDERER ──────────────────────────────────────
    function renderSapScreen(startY, content) {
      const allLines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const firstLine = (allLines[0] || '').toUpperCase();
      const isSelection = firstLine.includes('SELECTION') || firstLine.includes('SELECCION');
      const BW = R - L;
      const navy   = [26, 55, 100];
      const midBlue= [55, 95, 160];
      const gray1  = [238, 241, 246];
      const gray2  = [220, 226, 238];
      const bord   = [155, 175, 215];
      const white  = [255, 255, 255];

      let screenTitle = '';
      const params = [];
      const cols   = [];
      const rows   = [];
      let totalRow = null;

      allLines.forEach(line => {
        if (/^SCREEN:/i.test(line)) return;
        if (/^TITLE:/i.test(line)) { screenTitle = line.replace(/^TITLE:\s*/i, ''); return; }
        if (/^PARAM:/i.test(line)) {
          const p = line.replace(/^PARAM:\s*/i, '').split('|');
          params.push({ label: (p[0]||'').trim(), tech: (p[1]||'').trim(), value: (p[2]||'').trim(), req: (p[3]||'').trim().toUpperCase()==='R' });
          return;
        }
        if (/^COL:/i.test(line)) {
          const p = line.replace(/^COL:\s*/i, '').split('|');
          cols.push({ label: (p[0]||'').trim(), width: parseInt(p[1])||15, align: ((p[2]||'L').trim().toUpperCase()) });
          return;
        }
        if (/^ROW:/i.test(line)) { rows.push(line.replace(/^ROW:\s*/i,'').split('|').map(v=>v.trim())); return; }
        if (/^TOTAL:/i.test(line)) { totalRow = line.replace(/^TOTAL:\s*/i,'').split('|').map(v=>v.trim()); return; }
        if (line.includes('|') && !screenTitle) {
          const parts = line.split('|').map(p=>p.trim()).filter(Boolean);
          if (isSelection) params.push({ label: parts[0]||'', tech:'', value: parts[1]||'', req:false });
          else if (cols.length===0) parts.forEach(p=>cols.push({label:p,width:20,align:'L'}));
          else rows.push(parts);
        } else if (!screenTitle && line && !firstLine.startsWith('SCREEN')) {
          screenTitle = line;
        }
      });

      if (!screenTitle) screenTitle = isSelection ? 'Selection Screen' : 'Output Report';
      const fieldsCount  = params.length  || 4;
      const rowsCount    = rows.length    || 5;
      const colsCount    = (cols.length   || 5);
      const estH = isSelection
        ? 24 + fieldsCount * 8 + 20
        : 24 + 7 + rowsCount * 5.5 + (totalRow ? 7 : 0) + 8;
      const screenH = Math.min(Math.max(estH, 70), 190);

      if (startY + screenH > 272) { doc.addPage(); startY = 14; }
      let sy = startY;

      // Outer frame
      doc.setFillColor(...gray2);
      doc.setDrawColor(...bord);
      doc.setLineWidth(0.5);
      doc.rect(L, sy, BW, screenH, 'FD');

      // Title bar
      doc.setFillColor(...navy);
      doc.rect(L, sy, BW, 8, 'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(screenTitle.substring(0,72), L+3, sy+5.5);
      [[200,80,60,'×'], [80,130,200,'□'], [100,100,110,'─']].forEach(([r,g,b,c], i) => {
        const bx = L + BW - 5 - i*7;
        doc.setFillColor(r,g,b); doc.rect(bx-3,sy+1.5,5.5,5,'F');
        doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(6);
        doc.text(c, bx-1.8, sy+5.5);
      });
      sy += 8;

      // Menu bar
      doc.setFillColor(...gray1); doc.rect(L, sy, BW, 5.5, 'F');
      doc.setDrawColor(...bord); doc.setLineWidth(0.2); doc.line(L, sy+5.5, L+BW, sy+5.5);
      doc.setTextColor(20,20,20); doc.setFont('helvetica','normal'); doc.setFontSize(6);
      let mx = L+3;
      ['Sistema','Editar','Pasar a','Favoritos','Extras','Entorno','Ayuda'].forEach(m => {
        doc.text(m, mx, sy+4); mx += doc.getTextWidth(m)+4.5;
      });
      sy += 5.5;

      // Toolbar
      doc.setFillColor(232,237,246); doc.rect(L, sy, BW, 7.5, 'F');
      doc.setDrawColor(...bord); doc.line(L, sy+7.5, L+BW, sy+7.5);
      doc.setFillColor(...white); doc.setDrawColor(120,150,200); doc.setLineWidth(0.3);
      doc.rect(L+2, sy+1.5, 25, 4.5, 'FD');
      let tx = L+29;
      (isSelection ? [0,1,2,3,4] : [0,1,2,3,4,5,6,7,8]).forEach((_, i) => {
        if (i===2||i===5) { doc.setDrawColor(155,175,215); doc.line(tx+1,sy+2,tx+1,sy+6); tx+=3; return; }
        doc.setFillColor(215,224,242); doc.setDrawColor(145,165,210); doc.setLineWidth(0.25);
        doc.rect(tx,sy+1.5,5.5,4.5,'FD');
        doc.setFillColor(60,90,160); doc.rect(tx+1.5,sy+2.5,2.5,2,'F');
        tx += 6.5;
      });
      sy += 7.5;

      // Body background
      const bodyH = screenH - (sy - startY) - 6;
      doc.setFillColor(248, 250, 254); doc.rect(L, sy, BW, bodyH, 'F');

      if (isSelection) {
        // GROUP BOX
        const gx = L+5, gw = BW-10, gy2 = sy+4;
        const gh = Math.min(fieldsCount*8+12, bodyH-18);
        doc.setFillColor(...white); doc.setDrawColor(135,165,215); doc.setLineWidth(0.4);
        doc.rect(gx, gy2, gw, gh, 'FD');
        doc.setFillColor(248,250,254); doc.rect(gx+6, gy2-2.5, 52, 5, 'F');
        doc.setTextColor(30,60,145); doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
        doc.text('Parámetros de selección', gx+7, gy2+0.5);

        let fy = gy2+9;
        const fieldSlots = Math.floor((gh-12)/8);
        const displayParams = params.length ? params.slice(0,fieldSlots) : [
          {label:'Sociedad',tech:'BUKRS',value:'1000',req:true},
          {label:'Ejercicio',tech:'GJAHR',value:'2024',req:true},
          {label:'Período de',tech:'MONAT',value:'01',req:false},
          {label:'Período a',tech:'MONAT2',value:'12',req:false},
        ].slice(0,fieldSlots);

        displayParams.forEach(p => {
          if (p.req) {
            doc.setTextColor(190,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(7);
            doc.text('*', gx+2, fy+3.8);
          }
          doc.setTextColor(40,55,85); doc.setFont('helvetica','normal'); doc.setFontSize(7);
          doc.text(p.label.substring(0,22), gx+6, fy+3.8);
          const fx = gx+58, fw = Math.min(gw-72, 80);
          doc.setFillColor(...white); doc.setDrawColor(135,165,215); doc.setLineWidth(0.3);
          doc.rect(fx, fy, fw, 5.5, 'FD');
          doc.setDrawColor(40,100,215); doc.setLineWidth(0.7);
          doc.line(fx, fy+5.5, fx+fw, fy+5.5); doc.setLineWidth(0.3);
          if (p.value) {
            doc.setTextColor(0,30,120); doc.setFont('helvetica','normal'); doc.setFontSize(7);
            doc.text(p.value.substring(0,16), fx+2, fy+4);
          }
          doc.setFillColor(220,230,248); doc.setDrawColor(125,155,210);
          doc.rect(fx+fw+1, fy, 6, 5.5, 'FD');
          doc.setTextColor(40,80,175); doc.setFont('helvetica','bold'); doc.setFontSize(6);
          doc.text('▼', fx+fw+2, fy+4.2);
          fy += 8;
        });

        const btnY = sy + bodyH - 13;
        [['Ejecutar (F8)', navy, white], ['Cancelar', gray2, [40,40,60]], ['Variante', gray2, [40,40,60]]].forEach(([lbl,bg,fg], i) => {
          const bx = gx + i*37;
          doc.setFillColor(...bg); doc.setDrawColor(100,135,195); doc.setLineWidth(0.4);
          doc.rect(bx, btnY, 34, 7, 'FD');
          doc.setTextColor(...fg); doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
          const tw = doc.getTextWidth(lbl);
          doc.text(lbl, bx+(34-tw)/2, btnY+4.8);
        });

      } else {
        // ALV GRID
        const useCols = cols.length ? cols : [
          {label:'Sociedad',width:10,align:'L'},{label:'Cuenta',width:15,align:'L'},
          {label:'Descripción',width:35,align:'L'},{label:'Importe ML',width:22,align:'R'},{label:'Moneda',width:10,align:'L'},
        ];
        const useRows = rows.length ? rows : [
          ['1000','100000','Activos circulantes','1,500,000.00','EUR'],
          ['1000','200000','Cuentas por cobrar','500,000.00','EUR'],
          ['1000','300000','Inventario','800,000.00','EUR'],
        ];
        const useTotalRow = totalRow || ['','','Total general','2,800,000.00',''];
        const totalW = useCols.reduce((s,c)=>s+c.width,0);
        const uw = BW - 4;
        const getW = c => (c.width/totalW)*uw;
        let gy2 = sy+2;

        useCols.forEach((col, ci) => {
          const cx = L+2 + useCols.slice(0,ci).reduce((s,c)=>s+getW(c),0);
          const cw = getW(col);
          doc.setFillColor(58,98,158); doc.setDrawColor(40,80,140); doc.setLineWidth(0.3);
          doc.rect(cx, gy2, cw-0.3, 6.5, 'FD');
          doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(6);
          const lbl = col.label.substring(0,Math.floor(cw/2.1));
          const tw = doc.getTextWidth(lbl);
          if (col.align==='R') doc.text(lbl, cx+cw-tw-2, gy2+4.5);
          else doc.text(lbl, cx+2, gy2+4.5);
        });
        gy2 += 6.5;

        const rowH = 5.5;
        const maxR = Math.floor((bodyH-6.5-(useTotalRow?7:0)-6)/rowH);
        useRows.slice(0,maxR).forEach((row, ri) => {
          useCols.forEach((col, ci) => {
            const cx = L+2 + useCols.slice(0,ci).reduce((s,c)=>s+getW(c),0);
            const cw = getW(col);
            doc.setFillColor(ri%2===0?255:244, ri%2===0?255:247, ri%2===0?255:253);
            doc.setDrawColor(188,205,232); doc.setLineWidth(0.2);
            doc.rect(cx, gy2, cw-0.3, rowH, 'FD');
            const val = (row[ci]||'').substring(0,Math.floor(cw/2));
            doc.setTextColor(20,38,65); doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
            const tw = doc.getTextWidth(val);
            if (col.align==='R') doc.text(val, cx+cw-tw-2, gy2+4);
            else doc.text(val, cx+2, gy2+4);
          });
          gy2 += rowH;
        });

        useCols.forEach((col, ci) => {
          const cx = L+2 + useCols.slice(0,ci).reduce((s,c)=>s+getW(c),0);
          const cw = getW(col);
          doc.setFillColor(208,226,252); doc.setDrawColor(95,145,215); doc.setLineWidth(0.3);
          doc.rect(cx, gy2, cw-0.3, 6.5, 'FD');
          const val = (useTotalRow[ci]||'').substring(0,Math.floor(cw/2));
          doc.setTextColor(10,30,110); doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
          const tw = doc.getTextWidth(val);
          if (col.align==='R') doc.text(val, cx+cw-tw-2, gy2+4.5);
          else doc.text(val, cx+2, gy2+4.5);
        });
      }

      // Status bar
      const sbY = startY + screenH - 6;
      doc.setFillColor(...gray1); doc.rect(L, sbY, BW, 6, 'F');
      doc.setDrawColor(...bord); doc.setLineWidth(0.3); doc.line(L, sbY, L+BW, sbY);
      doc.setTextColor(40,60,115); doc.setFont('helvetica','normal'); doc.setFontSize(5.5);
      doc.text('Sistema: Arena-DEV  |  Mandante: 100  |  Usuario: CONSULTOR', L+3, sbY+4);
      doc.setTextColor(0,130,0); doc.setFont('helvetica','bold');
      doc.text('● Listo', L+BW-18, sbY+4);

      return startY + screenH + 6;
    }

    // ── CONTENT NODES ────────────────────────────────────────────
    const nodes = parseMarkdownNodes(markdown);
    const chkPage = (h) => { if (y + h > 272) { doc.addPage(); y = 14; } };

    for (const node of nodes) {
      if (node.type === 'heading') {
        chkPage(10);
        doc.setFillColor(...sapBlue);
        doc.rect(L, y, R - L, 7.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(node.text.toUpperCase(), L + 3, y + 5.2);
        y += 9;
      } else if (node.type === 'subheading') {
        chkPage(8);
        doc.setTextColor(...sapBlue);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(node.text, L + 2, y + 4.5);
        y += 7;
      } else if (node.type === 'table') {
        autoTable(doc, {
          startY: y,
          head: [node.head],
          body: node.body,
          styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [200, 215, 235], lineWidth: 0.3 },
          headStyles: { fillColor: sapBlue, textColor: [255,255,255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: sapLightBlue },
          bodyStyles: { textColor: [30, 50, 80] },
          theme: 'grid',
          margin: { left: L, right: 12 },
        });
        y = doc.lastAutoTable.finalY + 6;
      } else if (node.type === 'code') {
        y = renderSapScreen(y, node.content);
      } else if (node.type === 'list') {
        for (let idx = 0; idx < node.items.length; idx++) {
          const prefix = node.ordered ? (idx + 1) + '.  ' : '•  ';
          const wrapped = doc.splitTextToSize(prefix + node.items[idx], R - L - 8);
          const itemH = wrapped.length * 4.5 + 1.5;
          chkPage(itemH);
          doc.setTextColor(30, 50, 80);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.text(wrapped, L + 5, y + 3.5, { lineHeightFactor: 1.35 });
          y += itemH;
        }
        y += 3;
      } else if (node.type === 'text') {
        const wrapped = doc.splitTextToSize(node.content, R - L);
        const textH = wrapped.length * 4.8 + 3;
        chkPage(textH);
        doc.setTextColor(30, 50, 80);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(wrapped, L, y + 3, { lineHeightFactor: 1.4 });
        y += textH;
      }
    }

    // ── SIGNATURE SECTION ───────────────────────────────────────
    chkPage(40);
    y += 8;
    doc.setFillColor(...sapBlue);
    doc.rect(L, y, R - L, 7, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(t('spec.doc_approval_signatures').toUpperCase(), L + 3, y + 5);
    y += 9;
    const sigCols = [L, L + 62, L + 124];
    const sigLabels = [t('spec.label_sig_analyst'), t('spec.label_sig_dev'), t('spec.label_sig_client')];
    sigLabels.forEach((lbl, i) => {
      const bx = sigCols[i], bw = 56;
      doc.setFillColor(...sapLightBlue);
      doc.setDrawColor(...sapBlue);
      doc.setLineWidth(0.3);
      doc.rect(bx, y, bw, 22, 'FD');
      doc.setTextColor(60, 90, 140);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(lbl.toUpperCase(), bx + 3, y + 5);
      doc.setDrawColor(100, 140, 195);
      doc.line(bx + 3, y + 15, bx + bw - 3, y + 15);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 170, 200);
      doc.setFontSize(6.5);
      doc.text(t('spec.doc_name_sig_date'), bx + 3, y + 20);
    });

    // ── PAGE NUMBERS ─────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 170, 190);
      doc.text('Arena Solution Platform  ·  ' + t('spec.html_title') + '  ·  ' + (caseData.title ?? '').substring(0, 50), L, 290);
      doc.text(t('spec.doc_page') + ' ' + i + ' ' + t('spec.doc_of') + ' ' + pageCount, R, 290, { align: 'right' });
    }

    return doc.output('blob');
  }

  function buildValidationMarkdown(sap, proposal) {
    if (!sap && !proposal) return '';
    // Guard: if somehow a stringified JSON was stored, parse it back
    const safeSap      = typeof sap      === 'string' ? (() => { try { return JSON.parse(sap);      } catch { return null; } })() : sap;
    const safeProposal = typeof proposal === 'string' ? (() => { try { return JSON.parse(proposal); } catch { return null; } })() : proposal;
    const safeStr = v => {
      if (!v) return '';
      if (typeof v === 'string') return v.trimStart().startsWith('{') ? '' : v;
      return '';
    };
    const lines = [`## ${t('spec.doc_analysis_summary')}\n`];
    if (safeSap) {
      const coverageLabel = safeSap.coverage === 'full' ? t('spec.doc_coverage_full') : safeSap.coverage === 'partial' ? t('spec.doc_coverage_partial') : t('spec.doc_coverage_none');
      lines.push(`### ${t('spec.doc_sap_coverage_check')}`);
      lines.push(`**${t('spec.coverage_lbl').replace(/\s*—\s*$/, '')}:** ${coverageLabel}`);
      const sumStr = safeStr(safeSap.summary);
      if (sumStr) lines.push(`**${t('spec.doc_summary_lbl')}:** ${sumStr}`);
      if ((safeSap.standard_transactions ?? []).length > 0) lines.push(`**${t('spec.doc_std_transactions')}:** ${safeSap.standard_transactions.join(', ')}`);
      if ((safeSap.gaps ?? []).length > 0) lines.push(`**${t('spec.doc_gaps_identified')}:**\n` + safeSap.gaps.map(g => `- ${g}`).join('\n'));
      const recStr = safeStr(safeSap.recommendation);
      if (recStr) lines.push(`**${t('spec.doc_recommendation_lbl')}:** ${recStr}`);
      lines.push('');
    }
    if (safeProposal) {
      lines.push(`### ${t('spec.doc_proposal_validation')}`);
      lines.push(`**${t('spec.doc_result_lbl')}:** ${safeProposal.valid ? t('spec.doc_valid') : t('spec.doc_has_concerns')}  |  **${t('spec.risk_lbl').replace(/:$/, '')}:** ${({ low: L("low", "bajo"), medium: L("medium", "medio"), high: L("high", "alto") }[safeProposal.risk_level] ?? safeProposal.risk_level)}  |  **${t('spec.score_lbl').replace(/:$/, '')}:** ${safeProposal.score}/10`);
      if ((safeProposal.strengths ?? []).length > 0) lines.push(`**${t('spec.strengths').replace(/:$/, '')}:**\n` + safeProposal.strengths.map(s => `- ${s}`).join('\n'));
      if ((safeProposal.concerns ?? []).length > 0) lines.push(`**${t('spec.concerns').replace(/:$/, '')}:**\n` + safeProposal.concerns.map(c => `- ${c}`).join('\n'));
      const propRec = safeStr(safeProposal.recommendation);
      if (propRec) lines.push(`**${t('spec.doc_recommendation_lbl')}:** ${propRec}`);
      lines.push('');
    }
    lines.push('---\n');
    return lines.join('\n');
  }

  async function saveSpecAsDocument(markdown, filePrefix, docNote) {
    setSavingDoc(true);
    try {
      const _dL = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
      const date = new Date().toLocaleDateString(_dL, { year: 'numeric', month: 'long', day: 'numeric' });
      const htmlString = buildCaseDocHtml(
        t("spec.html_title"),
        'SAP Consulting · ' + t("spec.html_title"),
        [
          { label: t("spec.label_case_id"),   value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
          { label: t("label.sap_area"),        value: caseData.area_sap ?? '—' },
          { label: t("label.priority"),        value: (caseData.priority ?? '—').toUpperCase() },
          { label: t("spec.label_generated"),  value: date },
        ],
        markdown
      );
      setSpecHtml(htmlString);
      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const prefix = filePrefix ?? 'FuncSpec';
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${prefix}_${safeName}_${dateStr}.html`;
      const file = new File([htmlString], fileName, { type: 'text/html' });
      await addDocument(file, docNote ?? 'Auto-generated functional specification');
      setSavedSpecUrls(p => ({ ...p, a: fileName }));
      if (refetchDocuments) await refetchDocuments();
    } catch (e) {
      alert(t("alert.pdf_gen_error") + e.message);
    }
    setSavingDoc(false);
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function handleDownloadSpec() {
    if (!selectedSpec) return;
    const content = selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : selectedSpec === 'd' ? aiSpecD : aiSpecA;
    if (!content) return;
    setDownloadingPdf(true);
    try {
      const _dL2 = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
      const date = new Date().toLocaleDateString(_dL2, { year: 'numeric', month: 'long', day: 'numeric' });
      const htmlString = buildCaseDocHtml(
        t("spec.html_title"),
        'SAP Consulting · ' + t("spec.html_title"),
        [
          { label: t("spec.label_case_id"),  value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
          { label: t("label.sap_area"),       value: caseData.area_sap ?? '—' },
          { label: t("label.priority"),       value: (caseData.priority ?? '—').toUpperCase() },
          { label: t("spec.label_generated"), value: date },
        ],
        content
      );
      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const prefixMap = { a: 'SpecA_CustomABAP', b: 'SpecB_StandardSAP', c: 'SpecC_PropuestaCliente' };
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${prefixMap[selectedSpec] ?? 'Spec'}_${safeName}_${dateStr}.html`;
      const blob = new Blob([htmlString], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert(t("alert.pdf_gen_error") + e.message);
    }
    setDownloadingPdf(false);
  }

  async function saveAllSpecsAsDocuments(specA, specB, specC, specD, sap, proposal) {
    setSavingDoc(true);
    try {
      const SPEC_PREFIXES = ['SpecA_CustomABAP', 'SpecB_StandardSAP', 'SpecC_PropuestaCliente', 'SpecD_EspecCliente', 'Prototype_'];
      if (deleteDocument && documents?.length) {
        const oldDocs = documents.filter(d =>
          d.file_name && SPEC_PREFIXES.some(p => d.file_name.startsWith(p))
        );
        await Promise.all(oldDocs.map(d => deleteDocument(d.id, d.file_url).catch(() => {})));
      }

      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const dateStr  = new Date().toISOString().slice(0, 10);
      const _dL4 = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
      const dateLong = new Date().toLocaleDateString(_dL4, { year: 'numeric', month: 'long', day: 'numeric' });
      const valSection = buildValidationMarkdown(sap, proposal);
      const baseMeta = [
        { label: t("spec.label_case_id"),  value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
        { label: t("label.sap_area"),      value: caseData.area_sap ?? '—' },
        { label: t("label.priority"),      value: (caseData.priority ?? '—').toUpperCase() },
        { label: t("spec.label_generated"),value: dateLong },
      ];
      const specs = [
        { key: 'a', content: valSection + specA, prefix: 'SpecA_CustomABAP',       note: 'ABAP (auto-generated)',                  title: 'ABAP' },
        { key: 'b', content: valSection + specB, prefix: 'SpecB_StandardSAP',      note: 'SAP (auto-generated)',                   title: 'SAP' },
        { key: 'c', content: valSection + specC, prefix: 'SpecC_PropuestaCliente', note: 'Customer (auto-generated)',              title: 'Customer' },
        ...(specD ? [{ key: 'd', content: valSection + specD, prefix: 'SpecD_EspecCliente', note: 'Client Spec (auto-generated)', title: 'Client Spec' }] : []),
      ];
      const newUrls = { a: null, b: null, c: null, d: null };
      for (const s of specs) {
        const htmlString = buildCaseDocHtml(
          s.title,
          'SAP Consulting · ' + t("spec.html_title"),
          baseMeta,
          s.content
        );
        const fileName = `${s.prefix}_${safeName}_${dateStr}.html`;
        const file = new File([htmlString], fileName, { type: 'text/html' });
        await addDocument(file, s.note);
        newUrls[s.key] = fileName;
      }
      setSavedSpecUrls(newUrls);
      if (refetchDocuments) await refetchDocuments();
    } catch (e) {
      alert(t("alert.pdf_save_error") + e.message);
    }
    setSavingDoc(false);
  }

  function openSpecInNewTab() {
    if (!specHtml) return;
    openHtmlInNewTab(specHtml);
  }

  const perms = usePermissions(auth);
  const isCaseOwner = auth.user?.id && (
    caseData.created_by === auth.user.id ||
    (caseData.case_assignments ?? []).some(a => a.consultant_id === auth.user.id && a.is_active !== false)
  );
  const canApprove = perms.can('approve_specs') || isCaseOwner;
  const canSubmit  = perms.can('submit_specs');
  const planCfg    = usePlanConfig();
  const userPlan   = planCfg.getUserPlan(auth.user?.id ?? '');
  const canDownloadPdf = auth.isAdmin || auth.isManager || userPlan !== 'free';
  const specApproved = spec?.status === 'approved';
  // After the first spec has been generated/saved, leaving the current mode (back to the mode
  // chooser, which can discard the generated specs) is reserved for admins.
  const specGenerated = !!(spec?.content || aiSpecA || aiSpecB || aiSpecC || aiSpecD);
  const canLeaveSpecMode = !specApproved && (auth.isAdmin || !specGenerated);

  // Load latest spec review token for this case
  useEffect(() => {
    if (!caseData?.id) return;
    supabase.from('spec_review_tokens')
      .select('*').eq('case_id', caseData.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setShareToken(data); });
  }, [caseData?.id]);

  // Pre-fill from existing spec when mode is selected
  useEffect(() => {
    if (!spec) return;
    if (spec.mode === 'manual') {
      setManualNotes(spec.notes ?? '');
      setManualDocIds(spec.document_ids ?? []);
    } else if (spec.mode === 'ai') {
      setAiContent(spec.content ?? '');
      let restoredStep = 1;
      if (spec.notes) {
        try {
          const nd = JSON.parse(spec.notes);
          if (nd.sapCheck)      { setSapCheck(nd.sapCheck);           restoredStep = 2; }
          if (nd.proposalCheck) { setProposalCheck(nd.proposalCheck); restoredStep = 3; }
          if (nd.specA)         setAiSpecA(nd.specA);
          if (nd.specB)         setAiSpecB(nd.specB);
          if (nd.specC)         setAiSpecC(nd.specC);
          if (nd.specD)         setAiSpecD(nd.specD);
          if (nd.selectedSpec)  setSelectedSpec(nd.selectedSpec);
          if (nd.prevMode)      setPrevMode(nd.prevMode);
          if (nd.analysisCustomerContent) setAnalysisCustomerContent(nd.analysisCustomerContent);
          if (nd.requestSummary) setRequestSummary(nd.requestSummary);
          setRegenDiff(nd.regenDiff ?? {});
          setAnalysisMeta(nd.analysisMeta ?? {});
          setRequirements(Array.isArray(nd.requirements) ? nd.requirements : []);
          setReqCoverage(nd.reqCoverage && typeof nd.reqCoverage === 'object' ? nd.reqCoverage : {});
          setQuestions(Array.isArray(nd.questions) ? nd.questions : []);
          setSignoff(nd.signoff ?? null);
          if (nd.docLang) docLangRef.current = nd.docLang;
          setHoursOverrides(nd.hoursOverrides ?? {});
          if (nd.scenarioCount !== undefined) { setScenarioCount(nd.scenarioCount); docScenariosRef.current = nd.scenarioCount; }
          if (nd.activeProfile) setActiveProfile(nd.activeProfile);
          if (nd.protoHtml)    { setProtoHtmlState(nd.protoHtml); setProtoSaved(true); setActiveProfile(p => p ?? { prototype_enabled: true }); }
        } catch (_) {}
      }
      if (spec.content) restoredStep = 3;
      setAiStep(restoredStep);
      const restoredNode = (spec.status === 'approved' || spec.status === 'submitted') ? 4
        : restoredStep === 3 ? 3 : restoredStep === 2 ? 2 : 0;
      // Only pick the starting node when the spec is first opened; later saves (e.g. the
      // context analysis storing its result) must not throw the user back to Documents.
      // 'none' = spec created during this session; 'stored' = user already picked a node in this tab session
      if (nodeRestoredForRef.current === 'none' || nodeRestoredForRef.current === 'stored') nodeRestoredForRef.current = spec.id;
      if (nodeRestoredForRef.current !== spec.id) {
        nodeRestoredForRef.current = spec.id;
        setActiveNode(restoredNode);
      }
      // Fallback: detect prototype from documents list (legacy storage saves)
      const protoDoc = (documents ?? []).find(d => (d.description ?? '').startsWith('[Prototype]') || (d.file_name ?? '').startsWith('Prototype_'));
      if (protoDoc) { setProtoSaved(true); setActiveProfile(p => p ?? { prototype_enabled: true }); }
    } else if (spec.mode === 'wizard') {
      setWizardObjects(spec.objects ?? []);
      if ((spec.objects ?? []).length > 0) {
        const allAnswered = (spec.objects ?? []).every(o => (o.questions ?? []).every(q => q.a));
        setWizardStage(spec.content ? 'preview' : allAnswered ? 'preview' : 'interview');
        setCompiledSpec(spec.content ?? '');
      }
    }
    setMode(spec.mode);
  }, [spec]);

  // ── WIZARD helpers ──────────────────────────────────────────
  async function suggestObjects() {
    setWizardLoading(true);
    setWizardError(null);
    try {
      const docBlocks = await buildDocumentBlocks();
      const _wizPdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const wizPdfNote = _wizPdfNote ? `\n\n[Reference PDFs: ${_wizPdfNote}]` : '';
      const prompt = `Analyze this SAP support case and suggest the ABAP objects likely needed to implement the solution.${docBlocks.length > 0 ? '\n\nThe attached document(s) above contain the detailed requirements — use them as the primary source.' : ''}

Case title: ${caseData.title}
Case description: ${caseData.description ?? '(no description)'}
SAP area: ${caseData.area_sap ?? 'unknown'}
Industry: ${caseData.area_industry ?? 'unknown'}

Respond with ONLY a JSON array like:
[{"type":"Report","name":"ZMM_RPT_EXAMPLE","purpose":"One-line purpose"},...]

Include 2-6 objects. Use realistic Z-names. Types can be: Report, Function Module, Enhancement, BAdI, User Exit, Form, Smartform, Program, Class, Interface, Workflow, Table, View, Transaction — whatever fits.${jsonLangNote(lang)}`;
      const sys1 = 'You are an SAP functional consultant. Respond with ONLY a JSON array, no markdown code blocks, no explanation.';
      const raw = await callClaude({ feature: 'spec_wizard', 
        model: analysisModel, system: sys1,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 4000,
      }).catch(_ => callClaude({ feature: 'spec_wizard',  model: analysisModel, system: sys1, messages: [{ role: 'user', content: prompt + wizPdfNote }], max_tokens: 4000 }));
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\[[\s\S]*\]/);
        try { parsed = m ? JSON.parse(m[0]) : []; } catch (_2) { parsed = []; }
      }
      setWizardObjects((parsed ?? []).map(o => ({ ...o, questions: [] })));
    } catch (e) {
      setWizardError(e.message);
    }
    setWizardLoading(false);
  }

  async function generateQuestionsForObject(obj) {
    const raw = await callClaude({ feature: 'spec_wizard', 
      model: analysisModel,
      system: 'You are an SAP functional consultant creating a requirements interview. Respond with ONLY a JSON array, no markdown code blocks.',
      messages: [{
        role: 'user',
        content: `Generate specific interview questions for this SAP ABAP object.

Object type: ${obj.type}
Object name: ${obj.name}
Purpose: ${obj.purpose}
Case context: ${caseData.title} — ${caseData.description ?? ''}

Return ONLY a JSON array like:
[{"id":"q1","question":"Question text","type":"text","options":null},...]

For "type" use: "text" for short answers, "multiline" for long descriptions, "select" for predefined choices.
For "select" type include "options": ["Option A","Option B",...].
Generate 4-7 targeted questions relevant to the ${obj.type} type (e.g. for a Report: selection screen parameters, columns, subtotals, output format; for a Function Module: imports, exports, exceptions, tables; for an Enhancement/BAdI: trigger point, what to change, fallback behavior).`,
      }],
      max_tokens: 3000,
    });
    let parsed;
    try { parsed = JSON.parse(raw.trim()); } catch (_) {
      const m = raw.match(/\[[\s\S]*\]/);
      try { parsed = m ? JSON.parse(m[0]) : []; } catch (_2) { parsed = []; }
    }
    return parsed ?? [];
  }

  async function handleStartInterview() {
    if (wizardObjects.length === 0) return;
    setWizardLoading(true);
    setWizardError(null);
    try {
      const first = wizardObjects[0];
      if (!first.questions || first.questions.length === 0) {
        const qs = await generateQuestionsForObject(first);
        setWizardObjects(prev => prev.map((o, i) => i === 0 ? { ...o, questions: qs } : o));
      }
      setCurrentObjIdx(0);
      setWizardStage('interview');
    } catch (e) {
      setWizardError(e.message);
    }
    setWizardLoading(false);
  }

  async function handleNextObject() {
    const next = currentObjIdx + 1;
    if (next >= wizardObjects.length) {
      // All done — compile
      await handleCompileSpec();
      return;
    }
    setWizardLoading(true);
    setWizardError(null);
    try {
      const nextObj = wizardObjects[next];
      if (!nextObj.questions || nextObj.questions.length === 0) {
        const qs = await generateQuestionsForObject(nextObj);
        setWizardObjects(prev => prev.map((o, i) => i === next ? { ...o, questions: qs } : o));
      }
      setCurrentObjIdx(next);
    } catch (e) {
      setWizardError(e.message);
    }
    setWizardLoading(false);
  }

  async function handleCompileSpec() {
    setWizardStage('preview');
    setWizardLoading(true);
    setWizardError(null);
    try {
      const docBlocks = await buildDocumentBlocks();
      const qaSummary = wizardObjects.map(o => {
        const qa = (o.questions ?? []).map(q => `Q: ${q.question}\nA: ${q.a ?? '(not answered)'}`).join('\n');
        return `## Object: ${o.name} (${o.type})\nPurpose: ${o.purpose}\n${qa}`;
      }).join('\n\n---\n\n');

      const prompt = `Write a complete SAP Functional Specification based on this case and the interview answers below.${docBlocks.length > 0 ? '\n\nThe attached document(s) above contain the original requirements — use them as the primary source.' : ''}

Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}
Key User: ${caseData.key_user_email ?? ''}

Interview Q&A per Object:
${qaSummary}

Generate the specification with EXACTLY these sections in order:

## 1. Executive Summary
[2-3 sentence executive overview]

## 2. Scope
- [bullet scope items]

## 3. Pros & Cons

| In Favor | Against |
|----------|---------|
| [pro] | [con] |

## 4. Technical Recommendation
[recommended approach paragraph]

## 5. Technical Objects

| # | Object | Type | Complexity | Description |
|---|--------|------|------------|-------------|
| 1 | Z[NAME] | [type] | [Low / Medium / High] | [description] |

(Complexity is required for every object: Low, Medium or High — in the output language. Do NOT write hours: the platform calculates them from the object type and complexity.)

## 6. Time Estimation
${specHoursNote}

| Phase | Included Objects | Hours |
|-------|-----------------|-------|
| Analysis & Design | [objects] | [h] |
| Development | [objects] | [h] |
| Unit Testing | [objects] | [h] |
| UAT Support | [objects] | [h] |
| **Total** | | **[total]** |

## 7. SAP Screen Prototype

UI TECHNOLOGY: follow what the customer's documents ask for. If the customer requested a Fiori / web / mobile / handheld app (not a classic report), replace 7.1 and 7.2 with the app's screen(s) in this format and skip the selection/output screens:
\`\`\`
SCREEN:FIORI
TITLE:[App ID or Z name] - [App title]
FIELD:[Field label]|[TECH_NAME]|[value or NEW]|[R=required/O=optional/D=display]
\`\`\`

### 7.1 Selection Screen

\`\`\`
SCREEN:SELECTION
TITLE:Z[TXN] - [Description]
PARAM:[Field label]|[TECH_NAME]|[default value]|[R=required or O=optional]
PARAM:[Field label]|[TECH_NAME]|[default value]|R
PARAM:[Field label]|[TECH_NAME]||O
\`\`\`

### 7.2 Output / Result

\`\`\`
SCREEN:OUTPUT
TITLE:[Report Title] | [key filters]
COL:[Column header]|[width 8-35]|[L or R for alignment]
COL:[Column header]|[width]|R
ROW:[val1]|[val2]|[val3]|[val4]|[val5]
ROW:[val1]|[val2]|[val3]|[val4]|[val5]
TOTAL:||Total general|[amount]|
\`\`\`

## 8. Risks & Assumptions
1. [risk or assumption]

## 9. Next Steps
1. [action item]

Important: Use realistic Z object names, actual SAP table names (BKPF, BSEG, KNA1, MARA, etc.) for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM and COL lines with actual field names and columns relevant to this case — do NOT leave placeholder bracket text.${buildGenSuffix(null, lang)}`;

      const _wiz2PdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const wiz2PdfNote = _wiz2PdfNote ? `\n\n[Reference PDFs: ${_wiz2PdfNote}]` : '';
      const sysSpec = 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template provided.';
      const spec = await callClaude({ feature: 'spec_wizard', 
        model: analysisModel, system: sysSpec,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 4000,
      }).catch(_ => callClaude({ feature: 'spec_wizard',  model: analysisModel, system: sysSpec, messages: [{ role: 'user', content: prompt + wiz2PdfNote }], max_tokens: 4000 }));
      setCompiledSpec(spec);
    } catch (e) {
      setWizardError(e.message);
    }
    setWizardLoading(false);
  }

  function updateAnswer(objIdx, qId, value) {
    setWizardObjects(prev => prev.map((o, i) =>
      i === objIdx
        ? { ...o, questions: o.questions.map(q => q.id === qId ? { ...q, a: value } : q) }
        : o
    ));
  }

  // Auto-fetch compiled context when Node 6 opens (if not already loaded)
  useEffect(() => {
    if (activeNode !== 6) return;
    if (compiledCtxPreview || compiledCtxLoading) return;
    setCompiledCtxLoading(true);
    buildGenContext()
      .then(ctx => setCompiledCtxPreview(ctx || '(no additional context enabled)'))
      .catch(e => setCompiledCtxPreview(`Error: ${e.message}`))
      .finally(() => setCompiledCtxLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode]);

  // Auto-summarize project docs once they are fetched (progressive — updates per doc)
  useEffect(() => {
    const docs = compiledCtxExtra?.projectDocs;
    if (!docs?.length) return;
    const unsummarized = docs.filter(d => d.text && !docSummaries[d.name]);
    if (!unsummarized.length) return;
    unsummarized.forEach(doc => {
      callClaude({ feature: 'spec_wizard', 
        model: 'claude-haiku-5-5',
        messages: [{ role: 'user', content: `Summarize this document in 2–3 concise sentences. Focus on what the document is about, its main topic, and any key details relevant to an SAP consulting project. Be specific.\n\nDocument name: ${doc.name}\n\n${doc.text.slice(0, 3000)}` }],
        max_tokens: 200,
      })
        .then(summary => setDocSummaries(prev => ({ ...prev, [doc.name]: summary })))
        .catch(() => setDocSummaries(prev => ({ ...prev, [doc.name]: '(summary unavailable)' })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiledCtxExtra]);

  async function buildGenContext() {
    const genCtx = { ...GENERATION_CONTEXT_DEFAULTS, ...(ssCtx.settings["generation_context"] ?? {}) };
    const extra = {};
    const fetches = [];

    if (genCtx.include_sap_profile && caseData.client_id) {
      fetches.push(
        supabase.from("db_connections")
          .select("*")
          .eq("client_id", caseData.client_id)
          .is("project_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => { if (data) extra.connection = data; })
      );
    }

    if (genCtx.include_project_ctx && caseData.project_id) {
      fetches.push(
        supabase.from("projects")
          .select("name, description, goals, deliverables")
          .eq("id", caseData.project_id)
          .maybeSingle()
          .then(({ data }) => { if (data) extra.project = data; })
      );
    }

    if (genCtx.include_project_docs && caseData.project_id) {
      fetches.push(
        supabase.from("system_settings")
          .select("value")
          .eq("key", "project_docs")
          .maybeSingle()
          .then(async ({ data }) => {
            const allDocs = data?.value ?? {};
            const docs = allDocs[caseData.project_id] ?? [];
            if (!docs.length) return;
            const extracted = await Promise.all(docs.map(async doc => {
              try {
                const r = await fetch("/api/extract-text", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: doc.url, fileName: doc.name }),
                });
                const { text } = await r.json();
                return { name: doc.name, type: doc.type, text: text || "" };
              } catch {
                return { name: doc.name, type: doc.type, text: "" };
              }
            }));
            // Keep unreadable files too, so the panel says which ones the AI could not read
            extra.projectDocs = extracted;
          })
      );
    }

    if (genCtx.include_related_cases && caseData.client_id && caseData.area_sap) {
      const n = genCtx.related_cases_count ?? 3;
      fetches.push(
        supabase.from("cases")
          .select("title, status, area_sap, description")
          .eq("client_id", caseData.client_id)
          .eq("area_sap", caseData.area_sap)
          .neq("id", caseData.id)
          .order("created_at", { ascending: false })
          .limit(n)
          .then(({ data }) => { if (data?.length) extra.relatedCases = data; })
      );
    }

    await Promise.all(fetches);

    // Live SAP system check (hard gate — blocks generation if SAP is unreachable)
    // Resolve the active SAP environment first so its liveCheckOnGenerate toggle can override the system setting
    if (caseData.project_id || caseData.customer_id || caseData.client_id) {
      const [{ data: sapCfgRow }, { data: sapProjEnvRow }, { data: sapCaseEnvRow }] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'sap_integration').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_project_env').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_case_env').maybeSingle(),
      ]);
      // Same chain as the SAP connection panel: the project's own environments first, then the
      // customer's (or the legacy client account's).
      const _allSap = sapCfgRow?.value ?? {};
      const _envsOf = (e) => (e?.environments ?? (e?.host ? [e] : []));
      const _projEnvs = caseData.project_id ? _envsOf(_allSap[`proj_${caseData.project_id}`]) : [];
      const clientSapData = _allSap[caseData.customer_id ?? caseData.client_id] ?? _allSap[caseData.client_id] ?? {};
      const sapEnvs = _projEnvs.length ? _projEnvs : _envsOf(clientSapData);
      const selectedEnvId = (sapCaseEnvRow?.value ?? {})[caseData.id]
        ?? (sapProjEnvRow?.value ?? {})[caseData.project_id]
        ?? null;
      const sapCfg = selectedEnvId
        ? (sapEnvs.find(e => e.id === selectedEnvId) ?? sapEnvs[0] ?? null)
        : (sapEnvs[0] ?? null);
      // Resolution order: template disable > per-case (if allowed) > per-environment > project (if allowed) > client > global
      const envLiveCheck = sapCfg?.liveCheckOnGenerate;
      const projectLiveCheckValGen = (ssCtx.settings['sap_project_live_check'] ?? {})[caseData.project_id] ?? null;
      const clientLiveCheckValGen = (ssCtx.settings['sap_client_live_check'] ?? {})[caseData.client_id] ?? null;
      const clientPermsGen = (ssCtx.settings['sap_client_live_check_perms'] ?? {})[caseData.client_id] ?? {};
      const projectAllowsCaseGen = (ssCtx.settings['sap_project_allow_case_override'] ?? {})[caseData.project_id] !== false;
      const caseAllowedGen = clientPermsGen.allowCase !== false && projectAllowsCaseGen;
      const clientAllowsProjectGen = clientPermsGen.allowProject !== false;
      const shouldLiveCheck = !isSgNodeEnabled("sap_verification") ? false
        : (caseAllowedGen && caseLiveCheck !== null) ? caseLiveCheck
        : envLiveCheck !== undefined ? envLiveCheck
        : (clientAllowsProjectGen && projectLiveCheckValGen !== null) ? projectLiveCheckValGen
        : clientLiveCheckValGen !== null ? clientLiveCheckValGen
        : genCtx.sap_live_check;
      if (shouldLiveCheck) {
        if (!sapCfg?.host || !sapCfg?.username) {
          throw new Error('SAP live check is enabled but no SAP environment is configured for this case. Configure credentials in SAP Integration settings or disable SAP live check.');
        }
        supabase.rpc('log_sap_op', { p_case: caseData.id, p_kind: 'live_check' }).then(() => {}, () => {});
        const liveData = await sapLiveCheck(sapCfg);
        if (liveData?.error !== undefined) {
          const detail = liveData.message ? ` (${liveData.message})` : liveData.error ? ` (HTTP ${liveData.error})` : '';
          throw new Error(`SAP live check failed — cannot generate documents without a live connection.${detail}`);
        }
        extra.sapLiveData = liveData;
        // For modification/update cases, try to fetch existing ABAP object source
        const combinedText = caseData.title + ' ' + (caseData.description ?? '');
        const isModification = /modif|updat|enhanc|extend|fix|correct|adjust/i.test(combinedText);
        if (isModification) {
          const objMatches = [...combinedText.matchAll(/\b([ZY][A-Z0-9_]{1,30})\b/g)]
            .map(m => m[1])
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 3);
          if (objMatches.length) {
            const typeHint = detectSapObjectType(combinedText);
            const typesToTry = typeHint
              ? [typeHint, 'program', 'class', 'function_module', 'table'].filter((v, i, a) => a.indexOf(v) === i)
              : ['program', 'class', 'function_module', 'table'];
            let found = false;
            for (const objName of objMatches) {
              for (const objType of typesToTry) {
                const src = await sapFetchSource(sapCfg, objType, objName).catch(() => null);
                if (src) {
                  extra.sapLiveData = { ...extra.sapLiveData, existingSource: src, existingObjectName: objName, existingObjectType: objType };
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (!found) {
              extra.sapLiveData = { ...extra.sapLiveData, existingObjectMissing: true, existingObjectName: objMatches[0] };
            }
          }
        }
      }
    }

    setCompiledCtxExtra(extra);
    return buildContextString(caseData, genCtx, extra);
  }

  // Load additional context and per-case live check override from Supabase
  useEffect(() => {
    if (!caseData?.id) return;
    Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'case_additional_ctx').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'case_sap_live_check').maybeSingle(),
    ]).then(([{ data: ctxData }, { data: lcData }]) => {
      setAdditionalCtx((ctxData?.value ?? {})[caseData.id] ?? '');
      const lcVal = (lcData?.value ?? {})[caseData.id];
      setCaseLiveCheck(lcVal === undefined ? null : lcVal);
    }).catch(() => {});
  }, [caseData?.id]);

  // Load active spec gen template for this case (project → client → system default)
  useEffect(() => {
    if (!caseData?.id) return;
    (async () => {
      let preset = null;
      try {
        if (caseData.project_id) {
          const { data: proj } = await supabase.from('projects').select('spec_gen_lifecycle').eq('id', caseData.project_id).maybeSingle();
          if (proj?.spec_gen_lifecycle?.preset) preset = proj.spec_gen_lifecycle.preset;
        }
        if (!preset && caseData.client_id) {
          const { data: cp } = await supabase.from('client_profiles').select('spec_gen_lifecycle').eq('id', caseData.client_id).maybeSingle();
          if (cp?.spec_gen_lifecycle?.preset) preset = cp.spec_gen_lifecycle.preset;
        }
        if (!preset) {
          const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'default_spec_gen_config').maybeSingle();
          const cfgPreset = ss?.value?.client?.preset;
          if (cfgPreset) preset = cfgPreset;
        }
      } catch {}
      if (preset) setSgPresetKey(preset);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.id]);

  async function saveCaseLiveCheck(val) {
    if (!caseData?.id) return;
    try {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'case_sap_live_check').maybeSingle();
      const existing = data?.value ?? {};
      const updated = { ...existing, [caseData.id]: val };
      await supabase.from('system_settings').upsert({ key: 'case_sap_live_check', value: updated }, { onConflict: 'key' });
    } catch {}
  }

  async function saveAdditionalCtx(text) {
    if (!caseData?.id) return;
    setAdditionalCtxSaving(true);
    try {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'case_additional_ctx').maybeSingle();
      const existing = data?.value ?? {};
      const updated = { ...existing, [caseData.id]: text };
      await supabase.from('system_settings').upsert({ key: 'case_additional_ctx', value: updated }, { onConflict: 'key' });
    } catch {}
    setAdditionalCtxSaving(false);
  }

  async function loadSapConnInfo() {
    if (sapConnLoading) return;
    setSapConnLoading(true);
    try {
      const [{ data: sapCfgRow }, { data: sapProjEnvRow }, { data: sapCaseEnvRow }] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'sap_integration').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_project_env').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_case_env').maybeSingle(),
      ]);
      const allSapCfg = sapCfgRow?.value ?? {};

      // Inheritance chain: project environments (proj_<id>) → client environments (<client_id>)
      // Project-owned settings use the "proj_<projectId>" key in sap_integration
      const projEntry = caseData.project_id ? (allSapCfg[`proj_${caseData.project_id}`] ?? {}) : {};
      const projEnvs  = projEntry.environments ?? (projEntry.host ? [projEntry] : []);

      const _custKey = caseData.customer_id ?? caseData.client_id;
      const clientEntry = _custKey ? (allSapCfg[_custKey] ?? {}) : {};
      const clientEnvs  = clientEntry.environments ?? (clientEntry.host ? [clientEntry] : []);

      // All available envs: project first, then client as fallback
      const allEnvs = projEnvs.length > 0 ? projEnvs : clientEnvs;

      // Case env selection overrides project selection; both point to an env ID within allEnvs
      const selectedEnvId = (sapCaseEnvRow?.value ?? {})[caseData.id]
        ?? (sapProjEnvRow?.value ?? {})[caseData.project_id]
        ?? null;
      const sapCfg = selectedEnvId
        ? (allEnvs.find(e => e.id === selectedEnvId) ?? allEnvs[0] ?? null)
        : (allEnvs[0] ?? null);

      if (!sapCfg?.host) { setSapConnInfo({ notFound: true }); return; }
      let vpnUrl = sapCfg.proxyUrl?.trim() || null;
      if (!vpnUrl && sapCfg.connectionId) {
        const { data: conn } = await supabase.from('db_connections')
          .select('db_type, meta').eq('id', sapCfg.connectionId).maybeSingle();
        if (conn?.db_type === 'vpn') vpnUrl = conn.meta?.proxy_url?.trim() || null;
      }
      // Store full config (with credentials + proxy) for the test button
      const freshCfg = { ...sapCfg, ...(vpnUrl ? { _vpnProxyUrl: vpnUrl } : {}) };
      setSapConnCfg(freshCfg);
      // Auto-run live test using the same routine as the infrastructure check
      testSapConnection(freshCfg);
      setSapConnInfo({
        host: sapCfg.host,
        username: sapCfg.username,
        client: sapCfg.client,
        type: sapCfg.type ?? 's4hana',
        vpnUrl,
        envName: sapCfg.name ?? sapCfg.label ?? null,
        envCount: allEnvs.length,
      });
    } catch (e) {
      setSapConnInfo({ error: e.message });
    } finally {
      setSapConnLoading(false);
    }
  }

  async function testSapConnection(cfgOverride = null) {
    // Only a settings object counts as an override (never a click event).
    const baseCfg = (cfgOverride && typeof cfgOverride === 'object' && cfgOverride.host) ? cfgOverride : sapConnCfg;
    if (!baseCfg || sapConnTest === 'testing') return null;
    lastConnTestRef.current = null;
    // Counted for the VM cost share of this case (Costs tab).
    supabase.rpc('log_sap_op', { p_case: caseData.id, p_kind: 'connection_test' }).then(() => {}, () => {});
    setSapConnTest('testing');
    const lsKey = `sap_test_${caseData.id}`;

    // Auto-refresh tunnel URL from vm_tunnel_registry so a restarted cloudflared never
    // requires a manual settings update before the live check or spec generation.
    // In User VPN mode, always use the latest registry URL (laptop's start-local.sh tunnel).
    // Same route as Check Infrastructure: in ABAP ADT mode the ADT bridge (it runs the
    // project's VPN and fills in the saved SAP password); otherwise the SAP MCP server.
    // The registry only replaces an empty or temporary (trycloudflare) address.
    let resolvedCfg = baseCfg;
    const isAdtEnv = ['abap-adt', 'abap-adt-readonly', 'abap-adt-both'].includes(baseCfg.mcp_type);
    let mcpBase = '';
    if (isAdtEnv) {
      let adt = (baseCfg.adt_mcp_url ?? '').trim();
      if (!adt) {
        try {
          const { data: sData } = await supabase.from('system_settings').select('value').eq('key', 'adt_bridge_tunnel_url').maybeSingle();
          adt = String(sData?.value ?? '').trim();
        } catch { /* best-effort */ }
      }
      mcpBase = adt.replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    } else {
      const current = (baseCfg.mcp_server_url?.trim() || sapMcpServerUrl || '').replace(/\/mcp\/?$/, '');
      const resolved = baseCfg.vpn_mode === 'user' ? await resolveVmUrl('') || current : await resolveVmUrl(current);
      if (resolved && resolved !== current.replace(/\/$/, '')) {
        resolvedCfg = { ...baseCfg, mcp_server_url: resolved };
        setSapConnCfg(resolvedCfg);
      }
      mcpBase = (resolved || '').replace(/\/mcp\/?$/, '').replace(/\/$/, '').trim();
    }
    try {
      if (mcpBase) {
        // Route through MCP server — server-side, bypasses CORS, uses VM's VPN access
        const r = await fetch(`${mcpBase}/sap-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await bridgeAuthHeaders(mcpBase)) },
          body: JSON.stringify({
            host:     resolvedCfg.host,
            username: resolvedCfg.username,
            password: resolvedCfg.password,
            client:   resolvedCfg.client || '100',
          }),
          signal: AbortSignal.timeout(42000),
        }).then(res => res.json()).catch(e => ({ ok: false, error: e.message }));
        if (r?.ok) {
          const next = {
            ok: true,
            info: r.systemInfo || `Connected (${resolvedCfg.host})`,
            capabilities: r.capabilities ?? [],
            components:   r.components ?? [],
            sid: r.debug?.sid ?? null,
          };
          setSapConnTest(next); lastConnTestRef.current = next;
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        } else {
          const status = r?.status;
          const msg = status === 401 ? 'HTTP 401 — Wrong username, password or client (MANDT).'
            : status === 403 ? 'HTTP 403 — User lacks ADT authorizations.'
            : status === 404 ? 'HTTP 404 — ADT service not active (check SICF).'
            : r?.error || `HTTP ${status || 'error'}`;
          const next = { ok: false, message: msg };
          setSapConnTest(next); lastConnTestRef.current = next;
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        }
      } else {
        // Fallback: direct browser → SAP via sapLiveCheck (CORS-limited, no VPN)
        const result = await sapLiveCheck(sapConnCfg);
        if (result && !result.error) {
          const next = {
            ok: true,
            info: result.systemInfo ?? result.description ?? 'Connected',
            capabilities: result.capabilities ?? [],
            components:   result.components ?? [],
            sid: result.sid ?? null,
          };
          setSapConnTest(next); lastConnTestRef.current = next;
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        } else {
          const status = result?.error;
          const msg = status === 401 ? 'HTTP 401 — Wrong username, password or client (MANDT).'
            : status === 403 ? 'HTTP 403 — User lacks ADT authorizations.'
            : status === 404 ? 'HTTP 404 — ADT service not active (check SICF).'
            : status ? `HTTP ${status} — SAP returned an error.`
            : result?.message ? `Proxy error: ${result.message}`
            : 'Connection failed.';
          const next = { ok: false, message: msg };
          setSapConnTest(next); lastConnTestRef.current = next;
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        }
      }
    } catch (e) {
      const next = { ok: false, message: e.message };
      setSapConnTest(next); lastConnTestRef.current = next;
      try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
    }
    return lastConnTestRef.current;
  }

  useEffect(() => {
    // Load on mount so the node shows correct status without requiring the user to click it
    if (effectiveBaseCheck && !sapConnInfo && !sapConnLoading) loadSapConnInfo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeNode === 5 && effectiveBaseCheck && !sapConnInfo && !sapConnLoading) {
      loadSapConnInfo();
    }
  }, [activeNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Generate — two specs ─────────────────────────────────

  function buildSpecPrompt(isCustomDev, genProfile, contextStr = '', isModCase = false) {
    const sapCtx = sapCheck ? `\nSAP Standard Coverage Analysis: ${sapCheck.coverage} — ${sapCheck.summary}\nGaps: ${(sapCheck.gaps??[]).join('; ')||'none'}\nStandard transactions: ${(sapCheck.standard_transactions??[]).join(', ')||'none'}` : '';
    const propCtx = proposalCheck ? `\nProposal Validation: score ${proposalCheck.score}/10, risk ${proposalCheck.risk_level}\nStrengths: ${(proposalCheck.strengths??[]).join('; ')||'none'}\nConcerns: ${(proposalCheck.concerns??[]).join('; ')||'none'}` : '';
    const modNote = isModCase ? '\nIMPORTANT: This is a MODIFICATION of an existing ABAP object. The existing source code is provided in context. In the Technical Objects table, reference the existing object name and describe what will be CHANGED, not created from scratch. Do not invent a new Z name — use the one from context.' : '';

    if (isCustomDev) {
      return `Write Option A: Custom ABAP Development Functional Specification for this case.${sapCtx}${propCtx}${modNote}

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${contextStr}

IMPORTANT: The Pros & Cons section must reference the step analysis above — use the actual gaps as justification for custom dev, and the proposal strengths/concerns as pros/cons.

Generate with EXACTLY these sections:

## 1. Executive Summary
[2-3 sentence overview of the custom development approach]

## 2. Scope
- [scope items for the custom ABAP solution]

## 3. Pros & Cons

| In Favor | Against |
|----------|---------|
| [use proposal strengths + technical benefits] | [use proposal concerns + development risks] |

## 4. Technical Recommendation
[why custom development is the right approach given the gaps identified]

## 5. Technical Objects

| # | Object | Type | Complexity | Description |
|---|--------|------|------------|-------------|
| 1 | Z[NAME] | [type] | [Low / Medium / High] | [description] |

(Complexity is required for every object: Low, Medium or High — in the output language. Do NOT write hours: the platform calculates them from the object type and complexity.)

## 6. Time Estimation
${specHoursNote}

| Phase | Included Objects | Hours |
|-------|-----------------|-------|
| Analysis & Design | [objects] | [h] |
| Development | [objects] | [h] |
| Unit Testing | [objects] | [h] |
| UAT Support | [objects] | [h] |
| **Total** | | **[total]** |

## 7. SAP Screen Prototype

UI TECHNOLOGY: follow what the customer's documents ask for. If the customer requested a Fiori / web / mobile / handheld app (not a classic report), replace 7.1 and 7.2 with the app's screen(s) in this format and skip the selection/output screens:
\`\`\`
SCREEN:FIORI
TITLE:[App ID or Z name] - [App title]
FIELD:[Field label]|[TECH_NAME]|[value or NEW]|[R=required/O=optional/D=display]
\`\`\`

### 7.1 Selection Screen

\`\`\`
SCREEN:SELECTION
TITLE:Z[TXN] - [Description]
PARAM:[Field label]|[TECH_NAME]|[default]|R
PARAM:[Field label]|[TECH_NAME]||O
\`\`\`

### 7.2 Output / Result

\`\`\`
SCREEN:OUTPUT
TITLE:[Report title] | [filters]
COL:[Column]|[width]|[L or R]
ROW:[val1]|[val2]|[val3]|[val4]|[val5]
TOTAL:||Total|[amount]|
\`\`\`

## 8. Risks & Assumptions
1. [risk based on proposal concerns and development complexity]

## 9. Next Steps
1. [action item to start the custom development]

Use realistic Z object names, actual SAP table names for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM/COL values.${buildSectionConstraint('spec_a', genProfile)}${buildGenSuffix(genProfile, specLang())}`;
    } else {
      return `Write Option B: Standard SAP Configuration Functional Specification for this case.${sapCtx}

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${contextStr}

IMPORTANT: This spec covers the approach WITHOUT custom ABAP development. It uses only standard SAP transactions, configuration, and possibly SAPscript/Smartform-based standard tools. Reference the standard transactions found in the coverage analysis.${isModCase ? ' If existing objects are shown in context, describe how to adjust them via standard config rather than redevelopment.' : ''}

## 1. Executive Summary
[2-3 sentence overview of the standard SAP approach]

## 2. Scope
- [scope items achievable with standard SAP configuration]

## 3. Pros & Cons

| In Favor | Against |
|----------|---------|
| [benefits of standard SAP: no dev cost, SAP support, upgrade safe] | [limitations: not fully tailored, workarounds needed] |

## 4. Technical Recommendation
[recommend using standard SAP with specific configuration; acknowledge limitations]

## 5. Configuration Objects

| # | Object / Transaction | Type | Description | Effort (days) |
|---|---------------------|------|-------------|---------------|
| 1 | [T-code from coverage analysis] | Standard | [what it covers] | [d] |
| | | | **Subtotal** | **[total]** |

## 6. Implementation Timeline

| Phase | Activities | Days |
|-------|-----------|------|
| Configuration | [standard SAP config steps] | [d] |
| Testing | [user acceptance testing] | [d] |
| Training | [end user training] | [d] |
| **Total** | | **[total]** |

## 7. SAP Screen Prototype

### 7.1 Standard Transaction Screen

\`\`\`
SCREEN:SELECTION
TITLE:[Standard T-code] - [Standard description]
PARAM:[Field label]|[TECH_NAME]|[default]|R
PARAM:[Field label]|[TECH_NAME]||O
\`\`\`

### 7.2 Standard Output

\`\`\`
SCREEN:OUTPUT
TITLE:[Standard report title] | [filters]
COL:[Column]|[width]|[L or R]
ROW:[sample val1]|[val2]|[val3]|[val4]|[val5]
TOTAL:||Total|[amount]|
\`\`\`

## 8. Risks & Assumptions
1. [risk: standard SAP may not cover 100% of requirement]

## 9. Next Steps
1. [action item: configure standard SAP]

Use real standard SAP transaction codes and configuration objects for ${caseData.area_sap ?? 'the module'}.${buildSectionConstraint('spec_b', genProfile)}${buildGenSuffix(genProfile, specLang())}`;
    }
  }

  function buildSpecCPrompt(customerContent, genProfile, contextStr = '', isModCase = false) {
    const modNote = isModCase ? '\nIMPORTANT: This is a MODIFICATION of an existing ABAP object. The existing source code is in context. Reference the existing object name exactly and describe what lines/logic will be changed, not a new development.' : '';
    return `Write Option C: Customer Proposal As-Is Functional Specification for this case.${modNote}

This option formalizes EXACTLY what the customer proposed, without any AI alternatives or suggestions. Do NOT add any SAP standard alternatives or custom dev recommendations — this is a direct formalization of the customer's own technical proposal.

CRITICAL CONSTRAINTS — STRICT AS-IS RULE:
- EXCEPTION: the PROJECT MANDATORY RULES listed in the context are part of the customer's requirements. Apply them and add the objects they require (e.g. Fiori maintenance app, authorization objects), marked "(regla del proyecto)".
- Include ONLY what the customer explicitly described. If the customer did not ask for it, do NOT include it — no exceptions.
- Do NOT add objects, screens, transactions, reports, tables, enhancements, user-exits, workflows, notifications, logs, audit trails, or any other element that is not directly stated in the customer's proposal.
- Do NOT suggest improvements, alternatives, or best practices — this document records what was asked, not what could be better.
- INTEGRATION POINT ≠ NEW DEVELOPMENT OBJECT: If the customer mentions that a value or field will be "visible in an existing report", "available in standard reports", or "accessible via existing transaction" — that is only an integration note. Do NOT create a new report program or new report transaction for it. Only create a report object if the customer explicitly asked for a brand-new report to be built.
- AUDIT TABLES: Never add an audit table, change log table, or history table unless the customer explicitly requested one by name or stated they need an audit trail.
- PRIMARY SCREEN PROTOTYPE: First prototype the end-user-facing screen where the user interacts with the new field or functionality (the order entry screen, the billing document screen, the sales order header screen). Admin/maintenance screens (SM30 view maintenance, IMG configuration) are secondary and should only appear as additional prototypes AFTER the main end-user screen. Never skip the end-user screen to show only admin or maintenance screens.

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${contextStr}
Customer Proposal / Notes:
${customerContent || '(see case description above)'}

Generate with EXACTLY these sections:

## 1. Executive Summary
[2-3 sentence overview of the customer's proposed solution exactly as they described it]

## 2. Scope
- [scope items as described by the customer, no additions]

## 3. Customer Proposal Details
[Detailed description of exactly what the customer wants to implement, in their own terms formalized into functional spec language]

## 4. Technical Objects

| # | Object | Type | Complexity | Description |
|---|--------|------|------------|-------------|
| 1 | Z[NAME] | [type] | [Low / Medium / High] | [description per customer proposal] |

(Complexity is required for every object: Low, Medium or High — in the output language. Do NOT write hours: the platform calculates them from the object type and complexity.)

## 5. Time Estimation
${specHoursNote}

| Phase | Included Objects | Hours |
|-------|-----------------|-------|
| Analysis & Design | [objects] | [h] |
| Development | [objects] | [h] |
| Unit Testing | [objects] | [h] |
| UAT Support | [objects] | [h] |
| **Total** | | **[total]** |

## 6. SAP Screen Prototype

Choose the prototype format that matches what the customer proposed:

IF the proposal involves modifying or enhancing an EXISTING transaction screen (adding fields, changing layout, user-exit, etc.):
\`\`\`
SCREEN:TRANSACTION
TITLE:[Existing TCode] - [Brief description of change]
FIELD:[Field label]|[TECH_NAME]|[current value or NEW]|[R=required/O=optional/D=display]
FIELD:[Field label]|[TECH_NAME]||D
\`\`\`

IF the customer asks for a NEW Fiori / web / mobile / handheld app (scanner, tablet, phone, launchpad tile):
\`\`\`
SCREEN:FIORI
TITLE:[App ID or Z name] - [App title]
FIELD:[Field label]|[TECH_NAME]|[value or NEW]|[R=required/O=optional/D=display]
FIELD:[Field label]|[TECH_NAME]||D
\`\`\`

IF the proposal requires a NEW report or list program (customer explicitly asked for a report/list):
\`\`\`
SCREEN:SELECTION
TITLE:Z[TXN] - [Report description]
PARAM:[Field label]|[TECH_NAME]|[default]|R
PARAM:[Field label]|[TECH_NAME]||O

SCREEN:OUTPUT
TITLE:[Report title] | [filters]
COL:[Column]|[width]|[L or R]
ROW:[val1]|[val2]|[val3]
\`\`\`

IF the proposal is a configuration or Customizing change (no screen needed):
\`\`\`
SCREEN:CONFIG
TITLE:[IMG path or TCode]
STEP:[Step description]
STEP:[Step description]
\`\`\`

Use ONLY the format that matches the customer's actual proposal. Never add a report screen if the customer did not ask for one.

## 7. Assumptions
1. [assumption based strictly on the customer proposal]

## 8. Next Steps
1. [action item derived from the customer's proposed approach]

Use realistic Z object names matching the customer's described solution for ${caseData.area_sap ?? 'the module'}. Fill in real field/column values based on the proposal.${buildSectionConstraint('spec_c', genProfile)}${buildGenSuffix(genProfile, specLang())}`;
  }

  function buildSpecDPrompt(customerContent, genProfile, contextStr = '', isModCase = false) {
    const modNote = isModCase ? ' This case involves modifying an existing solution, so frame the document around what will change in the business process, not a new implementation.' : '';
    return `Write a Customer Functional Specification — a clear, non-technical business document for the customer's functional team to review and approve.${modNote}

Do NOT include ABAP objects, Z-program names, function modules, table names, configuration keys, or any SAP technical implementation detail. Write entirely in business language.

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${contextStr}
Customer Proposal / Notes:
${customerContent || '(see case description above)'}

Generate with EXACTLY these sections:

## 1. Executive Summary
[2-3 sentences summarizing the business need and solution in plain language]

## 2. Context

| Field | Value |
|-------|-------|
| Module | [SAP module name] |
| Affected Screens | [screen/transaction names the user touches] |
| Area | [business area] |
| Usage Frequency | [how often the feature will be used] |

## 3. Actors & Permissions

| Actor | Can |
|-------|-----|
| [business role] | [what this role can do with the feature] |

## 4. Scope
**Includes:**
- [business capability included]

**Excludes:**
- [what is explicitly out of scope, stated in business terms]

## 5. Screen Behavior

| Screen | What the user sees / does |
|--------|--------------------------|
| [screen name] | [description of user interaction] |

## 6. Business Rules
- [business rule in functional terms, no code]

## 7. Acceptance Criteria
1. [testable acceptance criterion a business user can verify]

## 8. Time Estimation
${specHoursNote}

| Phase | Hours |
|-------|-------|
| Requirements Analysis | [h] |
| Design | [h] |
| Development | [h] |
| Unit Testing | [h] |
| Functional Testing | [h] |
| **Total** | **[total]** |
${buildSectionConstraint('spec_d', genProfile)}${buildGenSuffix(genProfile, specLang())}`;
  }

  // Doc D sourced from Doc C: non-technical business language translation of the customer proposal
  function buildSpecDFromCPrompt(specCContent, customerContent, genProfile, contextStr = '', isModCase = false) {
    const modNote = isModCase ? ' This case involves modifying an existing solution, so frame the document around what will change in the business process, not a new implementation.' : '';
    return `Write a Customer Functional Specification — a clear, non-technical business document for the customer's functional team to review and approve.${modNote}

This document is a business-language version of the following Customer Proposal (Option C) that was already written for this case:

--- CUSTOMER PROPOSAL (OPTION C) ---
${specCContent}
--- END CUSTOMER PROPOSAL ---

Original customer notes for reference:
${customerContent || '(see case description above)'}

Your task:
- Keep EXACTLY the same scope and requirements as Option C above — do NOT add or remove any requirement, object, or functionality
- The time estimates must match the totals from Option C
- Remove ALL technical implementation details: no ABAP program names, no Z-object names, no function modules, no table names, no configuration keys, no SAP internal identifiers
- Rewrite entirely in plain business language that a non-technical functional user or manager can read, understand, and approve without SAP technical knowledge
- Section 5 (Screen Behavior) should describe what the user SEES and DOES, not how it is implemented

Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? ''}${contextStr ? '\n' + contextStr : ''}

Generate with EXACTLY these sections:

## 1. Executive Summary
[2-3 sentences summarizing the business need and solution in plain language, consistent with Option C]

## 2. Context

| Field | Value |
|-------|-------|
| Module | [SAP module name] |
| Affected Screens | [screen/transaction names the user touches] |
| Area | [business area] |
| Usage Frequency | [how often the feature will be used] |

## 3. Actors & Permissions

| Actor | Can |
|-------|-----|
| [business role] | [what this role can do with the feature] |

## 4. Scope
**Includes:**
- [business capability included — must match Option C scope]

**Excludes:**
- [what is explicitly out of scope]

## 5. Screen Behavior

| Screen | What the user sees / does |
|--------|--------------------------|
| [screen name] | [description of user interaction in business terms] |

## 6. Business Rules
- [business rule in functional terms, no code]

## 7. Acceptance Criteria
1. [testable acceptance criterion a business user can verify]

## 8. Time Estimation
${specHoursNote}

| Phase | Hours |
|-------|-------|
| Requirements Analysis | [h] |
| Design | [h] |
| Development | [h] |
| Unit Testing | [h] |
| Functional Testing | [h] |
| **Total** | **[total — must match Option C total]** |
${buildSectionConstraint('spec_d', genProfile)}${buildGenSuffix(genProfile, specLang())}`;
  }

  // Strip lone surrogates (WebKit regex-replace throws on them) AND null bytes / ASCII
  // control chars (Anthropic API rejects strings containing them).
  // TAB (0x09), LF (0x0A), CR (0x0D) are kept — they're valid in JSON strings.
  function sanitizeForJson(s) {
    const str = s ?? '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      // Drop lone surrogates
      if (c >= 0xD800 && c <= 0xDFFF) continue;
      // Drop null byte and non-printable control chars (except TAB/LF/CR)
      if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) continue;
      out += str[i];
    }
    return out;
  }

  // Prototype source: the customer proposal (Spec C) is the primary document — it is what the
  // customer reviews — with the platform proposal (Spec A) as technical reference. Falls back to
  // Spec A when no Spec C exists. All generation paths (first run, retry, Regenerate) use this.
  function prototypeSources(c = aiSpecC, a = aiSpecA, d = aiSpecD) {
    if (c) return { primary: c, reference: a || '', primaryLabel: 'Customer proposal (Spec C)', refLabel: 'Platform proposal (Spec A)' };
    if (a) return { primary: a, reference: '', primaryLabel: 'Platform proposal (Spec A)', refLabel: '' };
    return { primary: d || '', reference: '', primaryLabel: 'Client spec (Spec D)', refLabel: '' };
  }

  function extractSpecScreens(md) {
    const blocks = [];
    const re = /```[a-z]*\n([\s\S]*?)```/gi;
    let m;
    while ((m = re.exec(md ?? '')) !== null) { if (/^\s*SCREEN:/im.test(m[1])) blocks.push(m[1].trim()); }
    return blocks;
  }

  // The customer's documents decide the UI technology. The template's prototype style is only a
  // default: a spec that defines a Fiori screen, or customer requirements asking for a Fiori /
  // mobile / handheld app, switch a forced SAP GUI style to Fiori (and vice versa for GUI).
  const FIORI_SIGNAL = /\b(fiori|sapui5|ui5|handheld|hand-held|m[oó]vil|mobile|tablet|smartphone|celular|esc[aá]ner|scanner|launchpad|aplicaci[oó]n web|web app|responsive)\b/i;
  function resolvePrototypeStyle(style, primary, customerText) {
    const specScreens = extractSpecScreens(primary).join('\n');
    const wantsFiori = /SCREEN:\s*FIORI/i.test(specScreens) || FIORI_SIGNAL.test(customerText ?? '') || FIORI_SIGNAL.test(specScreens);
    if (style === 'sapgui' && wantsFiori) return 'fiori';
    return style;
  }

  function buildPrototypePrompt(src, styleIn) {
    const { primary, reference, primaryLabel, refLabel } = src;
    const customerText = [requestSummary, analysisCustomerContent].filter(Boolean).join('\n\n');
    const style = resolvePrototypeStyle(styleIn, primary, customerText);
    if (style !== styleIn) console.info('[Prototype] style', styleIn, '→', style, '(customer documents / spec ask for a Fiori app)');
    const customerNote = customerText
      ? `\n\nCUSTOMER REQUIREMENTS (summarised from the customer's own documents — their requested UI technology, device and layout take priority over any default style):\n${sanitizeForJson(customerText).slice(0, 4000)}`
      : '';
    const screens = extractSpecScreens(primary);
    const screensNote = customerNote + (screens.length
      ? `\n\nSCREENS TO REPRODUCE — authoritative definition from the PRIMARY spec (${screens.length} screen${screens.length > 1 ? 's' : ''}). Format: TITLE = window title; FIELD:label|technical name|value|R(required)/O(optional)/D(display only); a value of NEW means a new custom field (render it empty, mark it as new). PARAM = selection parameter, COL/ROW = output list.\n${screens.map((b, i) => `--- Screen ${i + 1} ---\n${b}`).join('\n')}\n\nThe prototype's main view MUST be exactly these screen(s), with these fields in this order and this title. Do NOT add list/ALV tables, tabs, side panels, extra screens or extra fields that are not defined here or explicitly described in the PRIMARY spec's text. If the spec describes a Fiori / handheld app, build a Fiori-style, mobile-width screen.`
      : '');
    const safeA     = sanitizeForJson(primary ?? '');
    const safeB     = sanitizeForJson(reference ?? '');
    const safeTitle = sanitizeForJson(caseData.title);
    const safeSap   = sanitizeForJson(caseData.area_sap);
    const safeInd   = sanitizeForJson(caseData.area_industry);
    const safeDesc  = sanitizeForJson(caseData.description);
    if (style === 'auto') {
      return `You are a SAP prototype generator. Before generating the prototype, you must analyze the case and decide which visual style to use. Read the signals below carefully.

Case: ${safeTitle}
SAP Module: ${safeSap}
Industry: ${safeInd}
Description: ${safeDesc}

PRIMARY SPEC — ${primaryLabel} (the prototype must reproduce THIS document's screens):
${safeA.slice(0, 9000)}
${safeB ? `
REFERENCE SPEC — ${refLabel} (technical background only — where it differs from the primary spec, the PRIMARY spec wins):
${safeB.slice(0, 3000)}` : ''}

FIDELITY RULES (mandatory):
- Recreate the screen prototypes defined in the PRIMARY spec (section "Prototipo de Pantalla" / "Screen Prototype" and its sub-sections) as the prototype's screens: same transaction / app code and title, same fields with the same labels, order, required markers and sample values, same buttons and tabs.
- Use exactly the object, transaction and app names that appear in the PRIMARY spec. Never invent different names.
- You may add interactivity, navigation between those screens, messages and realistic sample data, but do not add screens or fields that the PRIMARY spec does not describe.${screensNote}

STEP 1 — CHOOSE THE STYLE using these rules (apply the FIRST rule that matches):

Rule 1 → SAP GUI style
  Apply when: the spec involves modifying or extending an EXISTING SAP GUI transaction (classic T-codes like VA02, ME21N, MM01, MB51, IW32, SM30, SE38…), OR the solution approach is Custom ABAP Tier 3 (dialog programs, ALV reports, BAdi/user-exit implementations that change a GUI screen), OR the primary user interaction happens INSIDE an existing SAP GUI screen (adding a field, a tab, a column to an ALV).
  Signals: T-code names, ALV, dialog, screen painter, BAdI, enhancement spot, user exit, /DBE/, /VSS/, VBAP, VBAK, EKPO, MARA, AUFK…

Rule 2 → SAP Fiori style
  Apply when: the solution is a NEW Fiori app, Fiori Elements page, OData V2/V4 service, BTP extension, or Launchpad tile. The user works in a browser, not SAP GUI.
  Signals: OData, CDS view, Fiori tile, F-number, BTP, CAP, SAPUI5, Fiori Elements, smart table, smart form…

Rule 3 → Wireframe style
  Apply when: the process is entirely NEW with no existing SAP screen to extend, OR the audience is non-technical (business stakeholder, end-user training), OR the SAP technology layer is undecided.

STEP 2 — ADD A COMMENT at the very top of the generated HTML (inside <!-- -->):
  <!-- Prototype style: [chosen style] | Reason: [one sentence explaining which rule matched and why] -->

STEP 3 — GENERATE the full prototype using EXACTLY the style chosen in Step 1.

SAP GUI STYLE spec:
- Background #f3f2f1, panel #ffffff, borders #b9b9b9, panel headers #dfe4e8, accent #0854a0 / light #e6f0fa, text #22282f
- Disclaimer bar (non-functional notice, inline SVG warning icon — never emojis), SAP blue shellbar, toolbar with mode + status toggles + Grabar button, tab strip with real SAP tabs, split layout (ALV grid left + detail panel right), F4 modal with search, fields spec table at bottom, toast notifications
- Full blocking logic: isBlocked() = view mode OR status closed; advisory box shows lock reason; F4 button hidden when blocked
- render() calls renderAlv() + renderDetail() on every state change

SAP Fiori STYLE spec:
- Background #F7F7F7, shell bar #354A5E, Fiori blue #0070F2, font "72"/system, cards with border-radius 8px and 1px #D9D9D9 border, footer toolbar sticky
- 4 screens with step-dot navigation: (1) Overview card + metadata grid + KPI tiles + Iniciar button, (2) Table with status badges, (3) Form with 2-column grid layout + section titles in blue uppercase, (4) Success box + operation summary
- Navigation JS: _show(n), _next(), _back() with step-dot highlight and breadcrumb update

WIREFRAME STYLE spec:
- Background #F5F5F5, white panels, all borders #CCCCCC, text #333333, no shadows, no gradients, no color accents except one #4A90D9 blue for CTAs
- 4 screens with same step-dot navigation as Fiori but monochrome
- Placeholder boxes [IMAGE], [MAP], [CHART] where visuals would go; all labels in gray uppercase

ALL styles: single self-contained HTML file, ALL CSS and JS inline, no external dependencies, no fetch calls.

OUTPUT: Return ONLY the complete HTML document starting with <!DOCTYPE html>. No explanation, no markdown fences, no text before or after the HTML.`;
    }

    if (style === 'sapgui') {
      return `You are a SAP GUI prototype generator. Generate a SINGLE complete self-contained HTML file that simulates a classic SAP GUI screen for this SAP case. The prototype must look and behave like real SAP GUI — not Fiori, not a wizard.

Case: ${safeTitle}
SAP Module: ${safeSap}
Industry: ${safeInd}
Description: ${safeDesc}

PRIMARY SPEC — ${primaryLabel} (the prototype must reproduce THIS document's screens):
${safeA.slice(0, 9000)}
${safeB ? `
REFERENCE SPEC — ${refLabel} (technical background only — where it differs from the primary spec, the PRIMARY spec wins):
${safeB.slice(0, 3000)}` : ''}

FIDELITY RULES (mandatory):
- Recreate the screen prototypes defined in the PRIMARY spec (section "Prototipo de Pantalla" / "Screen Prototype" and its sub-sections) as the prototype's screens: same transaction / app code and title, same fields with the same labels, order, required markers and sample values, same buttons and tabs.
- Use exactly the object, transaction and app names that appear in the PRIMARY spec. Never invent different names.
- You may add interactivity, navigation between those screens, messages and realistic sample data, but do not add screens or fields that the PRIMARY spec does not describe.${screensNote}

VISUAL STYLE — SAP GUI (classic):
- Background: #f3f2f1 (SAP off-white)
- Panel/card background: #ffffff
- Borders: #b9b9b9
- Panel headers: #dfe4e8
- Accent / SAP blue: #0854a0
- Accent light: #e6f0fa
- Text: #22282f, muted: #6b7280
- Font: -apple-system, "Segoe UI", Arial, sans-serif, 13px
- Buttons: flat, 3px border-radius, border #b9b9b9, background #fafafa; primary = #0854a0 text white; active = #e6f0fa border #0854a0 text #0854a0 font-weight 600
- Inputs: border 1px #b9b9b9, border-radius 3px, padding 5px 7px, 12.5px font; readonly = background #f2f2f2
- Tables (ALV): border-collapse collapse, th background #eef1f3, th/td padding 6px 8px, td border-bottom 1px #eee, row hover background #e6f0fa, selected row outline 1px #0854a0 background #e6f0fa
- Badges: display inline-block, padding 1px 6px, border-radius 3px, font-size 11px font-weight 600
- Warning disclaimer bar at top: background #fff4ce, border-bottom 2px #d29200, padding 8px 16px, font-size 12px

REQUIRED STRUCTURE (in this order):
1. Disclaimer bar: <b>Prototipo no funcional</b> — simulates [transaction code(s) from spec]. Covers CU1–CU[N] from the spec.
2. Shell bar: background #0854a0, white text, 10px 16px padding, flex space-between. Left: app/module title. Right: transaction code + document number + company name (sample data).
3. Toolbar: background white, border-bottom 1px #b9b9b9, padding 8px 16px, flex row with gap. Include relevant mode toggles (e.g. Display/Change, Create vs Edit vs View, relevant status toggles) as button groups. Include a Grabar (save) button with an inline SVG disk icon (never emojis) that triggers a toast.
4. Tab strip: tabs relevant to the SAP transaction (use real tab names from the spec such as Cabecera, Ítem, Piezas, Condiciones, etc.). The relevant tab is active (color #0854a0, border-bottom 3px #0854a0, font-weight 600).
5. Main content area (flex row, gap 14px, padding 14px 16px):
   - LEFT: ALV grid panel (flex 1.3, min-width 460px). Panel with gray header. Table with real columns from the spec. At least 3–5 realistic sample data rows. Clicking a row highlights it and updates the right detail panel.
   - RIGHT: Detail panel (flex 1, min-width 340px). Shows fields for the selected row. Use field-row layout: label (width 140px) + input or select. Highlight the KEY field from the spec with a colored border box (border 1px #0854a0, background #e6f0fa, border-radius 4px, padding 10px, relative position with a small tag label). Show lock state when blocked (border #c0392b, background #fdecea, tag background #c0392b).
6. Fields reference table: below the main content, show a spec table with columns: Campo | Tabla-campo técnico | Tipo | Obligatorio | F4 | Validación — populated with real fields from the spec.
7. F4 modal (if spec mentions value help / F4 / search help): fixed overlay, modal with search input + results table. Clicking a row assigns the value and closes the modal.
8. Toast notification: fixed bottom center, dark background, shows on Grabar and on F4 pick.

JAVASCRIPT REQUIREMENTS:
- Mode toggles update button active states and re-render detail panel (blocked/unblocked field state)
- Status toggles update button active states and re-render detail panel
- ALV row click: update selected row index, re-render both ALV (highlight) and detail panel
- isBlocked() function: returns true when in view/display mode OR when status indicates closed/completed
- F4 button in detail panel: opens modal; modal search input filters the list; clicking a row assigns the value, closes modal, shows toast, re-renders
- Grabar (icono de disco en SVG inline, sin emojis): shows toast "Grabar — simulado. En un caso real, dispara [relevant BAPI/FM from spec]."
- render() calls renderAlv() and renderDetail() — called on every state change
- document.addEventListener('DOMContentLoaded', () => render())

ALL CSS and JavaScript must be inline in the single HTML file — no external dependencies, no fetch calls, no external URLs.

OUTPUT: Return ONLY the complete HTML document starting with <!DOCTYPE html>. No explanation, no markdown fences, no text before or after the HTML.`;
    }

    const styleGuide = style === 'wireframe'
      ? `Use a low-fidelity wireframe visual style: white/light-gray backgrounds (#F5F5F5), gray borders (#CCCCCC), dark gray text (#333333), placeholder boxes for images, no gradients or shadows. Label everything clearly. Use a simple sans-serif font.`
      : style === 'branded'
      ? `Use a dark branded theme: background #0B0F1A, card surfaces #1A2235, accent color #4F6EF7 (blue), text white and rgba(255,255,255,0.7), rounded-xl cards, subtle blue glow effects on CTAs.`
      : `Use SAP Fiori visual design: shell bar at top with sapUiGlobalBackground (#F7F7F7), Fiori blue (#0070F2) for primary actions, SAP font "72" fallback to system sans-serif, card-style tiles, standard Fiori list items with separator lines, table with column headers in gray, footer toolbar for actions.`;

    return `You are a UI/UX prototype generator. Generate a SINGLE complete self-contained HTML file that is an interactive multi-screen prototype for this SAP case.

Case: ${safeTitle}
SAP Module: ${safeSap}
Industry: ${safeInd}
Description: ${safeDesc}

PRIMARY SPEC — ${primaryLabel} (the prototype must reproduce THIS document's screens):
${safeA.slice(0, 9000)}
${safeB ? `
REFERENCE SPEC — ${refLabel} (technical background only — where it differs from the primary spec, the PRIMARY spec wins):
${safeB.slice(0, 3000)}` : ''}

FIDELITY RULES (mandatory):
- Recreate the screen prototypes defined in the PRIMARY spec (section "Prototipo de Pantalla" / "Screen Prototype" and its sub-sections) as the prototype's screens: same transaction / app code and title, same fields with the same labels, order, required markers and sample values, same buttons and tabs.
- Use exactly the object, transaction and app names that appear in the PRIMARY spec. Never invent different names.
- You may add interactivity, navigation between those screens, messages and realistic sample data, but do not add screens or fields that the PRIMARY spec does not describe.${screensNote}

REQUIREMENTS:
1. Generate 4 screens: Overview, Main Process Screen, Detail/Form Screen, Confirmation/Result Screen
2. Each screen has a header with the app title and a breadcrumb/step indicator showing which screen you're on
3. The content of each screen must reflect the ACTUAL SAP process described in the spec — use real SAP field names, transaction codes, and table column headers from the spec
4. ${styleGuide}
5. ALL CSS and JavaScript must be inline in the single HTML file — no external dependencies, no fetch calls, no external URLs
6. Screen 1 (Overview): key case metadata, a process summary card, and a "Start Process" primary button
7. Screen 2 (Main List/Transaction): SAP-style table with realistic sample data rows OR an input form with real field names
8. Screen 3 (Detail/Form): detail view or configuration form with real SAP parameters
9. Screen 4 (Confirmation): success state with key output data and action buttons (Save, Back to Overview)

NAVIGATION JAVASCRIPT — copy this block EXACTLY inside a <script> tag just before </body>:
var _cur=1;
function _show(n){document.querySelectorAll('.screen').forEach(function(s){s.style.display='none';});var el=document.getElementById('screen'+n);if(el){el.style.display='block';_cur=n;}document.querySelectorAll('.step-dot').forEach(function(d,i){d.style.background=i+1===n?'#0070F2':'#ccc';});}
function _next(){if(_cur<4)_show(_cur+1);}
function _back(){if(_cur>1)_show(_cur-1);}
document.addEventListener('DOMContentLoaded',function(){_show(1);});

CRITICAL HTML STRUCTURE — follow exactly:
1. The 4 screen divs: <div class="screen" id="screen1" style="display:none"> ... </div> (same for screen2/3/4)
2. Step dots row (place it OUTSIDE the screen divs, always visible):
   <div style="display:flex;gap:12px;justify-content:center;padding:16px;">
     <span class="step-dot" onclick="_show(1)" style="width:36px;height:36px;border-radius:50%;background:#0070F2;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;">1</span>
     <span class="step-dot" onclick="_show(2)" style="width:36px;height:36px;border-radius:50%;background:#ccc;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;">2</span>
     <span class="step-dot" onclick="_show(3)" style="width:36px;height:36px;border-radius:50%;background:#ccc;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;">3</span>
     <span class="step-dot" onclick="_show(4)" style="width:36px;height:36px;border-radius:50%;background:#ccc;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;">4</span>
   </div>
3. Every screen MUST have a content area with REAL data: tables with rows, form fields with labels and inputs, paragraphs of information — NO empty screens
4. Screen 1: overview with a summary card + metadata list + "Iniciar →" button (onclick="_next()")
5. Screen 2: a table with at least 4 real data rows from the spec, plus a "Siguiente →" button
6. Screen 3: a form with at least 5 labeled input fields from the spec, plus "Guardar →" and "← Volver" buttons
7. Screen 4: success confirmation with a summary of what was done, "Nueva Operación" button (onclick="_show(1)") and "← Volver" button

OUTPUT: Return ONLY the complete HTML document starting with <!DOCTYPE html>. No explanation, no markdown fences, no text before or after the HTML.`;
  }

  async function handleGenerateSpecs({ autoSubmit = false, genProfile = null, fromApprovalReview = false } = {}) {
    if (!genProfile || fromApprovalReview) {
      genGateOverrideRef.current = false;
      if (!generationGateOk()) return;
      if (!openQuestionsOk()) return;
    }
    if (!genProfile) {
      // Show profile picker modal; actual generation runs after modal confirm
      setPendingGenOpts({ autoSubmit, fromApprovalReview });
      setShowGenModal(true);
      return;
    }
    setGeneratingSpecs(true);
    setAiError(null);
    // Keep the versions being replaced, to report what the new ones drop.
    const prevSpecs = { a: aiSpecA, b: aiSpecB, c: aiSpecC, d: aiSpecD };
    setAiSpecA('');
    setAiSpecB('');
    setAiSpecC('');
    setAiSpecD('');
    setSelectedSpec(null);
    setSpecStatuses({ a: 'generating', b: 'generating', c: 'generating', d: 'generating', proto: 'idle' });
    setSpecErrors({ a: null, b: null, c: null, d: null, proto: null });
    try {
      const docBlocks = await buildDocumentBlocks();
      const pdfNames = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name);
      const pdfNote = pdfNames.length > 0 ? `\n\n[Reference PDFs attached: ${pdfNames.join(', ')}]` : '';

      const needsAbap = genProfile?.spec_a?.technical_objects || genProfile?.spec_c?.technical_objects;
      const abap = needsAbap ? await buildAbapStandardsForSpec() : { blocks: [], contextText: '' };

      const genCtxResult = await buildGenContext();
      const _baseCtx = sanitizeForJson(genCtxResult);
      const summaryCtx = requestSummary ? `\n\nPRE-ANALYSIS (request summary derived from attached documents):\n${sanitizeForJson(requestSummary)}` : '';
      const additionalCtxStr = additionalCtx?.trim() ? `\n\nADDITIONAL CONSIDERATIONS (from consultant):\n${sanitizeForJson(additionalCtx.trim())}` : '';
      const reviewFeedbackStr = specFeedback?.trim() ? `\n\nREVIEW FEEDBACK (apply to this generation — cumulative notes from previous review rounds):\n${sanitizeForJson(specFeedback.trim())}` : '';
      const contextStr = _baseCtx + summaryCtx + additionalCtxStr + reviewFeedbackStr + rulesPromptBlock(activeRules(ssCtx.settings, caseData.project_id)) + analysisFindingsBlock() + requirementsPromptBlock(requirements) + questionsPromptBlock(questions);
      const hasLiveSap = contextStr.includes('SAP Live System:');
      const isModCase  = contextStr.includes('Existing ABAP Object Source');
      const sysLiveNote = hasLiveSap
        ? ' Use the live SAP system data (release, software components, capabilities) provided in context to write accurate technical details.'
        : '';
      // Refresh tunnel URL from registry before building MCP config so a restarted
      // cloudflared tunnel doesn't cause spec generation to fail with stale URL
      let freshMcpUrl = null;
      {
        const current = (sapConnCfg?.mcp_server_url?.trim() || sapMcpServerUrl || '').replace(/\/mcp\/?$/, '').replace(/\/$/, '');
        const resolved = await resolveVmUrl(current);
        if (resolved && resolved !== current) {
          freshMcpUrl = resolved;
          setSapConnCfg(prev => prev ? { ...prev, mcp_server_url: freshMcpUrl } : prev);
        }
      }
      const _specsStoredPP     = ssCtx.settings['mcp_adt_pipeline_policy'] ?? {};
      const _specsStage        = { use_mcp: true, include_mcp_rules: true, include_capabilities: false, ...(_specsStoredPP.stages?.specs ?? {}) };
      const _allMcpServers     = await buildMcpConfig(freshMcpUrl);
      const mcpServers         = _specsStage.use_mcp ? _allMcpServers : [];
      const mcpNote = mcpServers.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
      const mcpRulesNote = (mcpServers.length && _specsStage.include_mcp_rules && sapMcpRules) ? `\n\n${sapMcpRules}` : '';
      const callSpec = async (rawPrompt, extraBlocks = []) => {
        const prompt = sanitizeForJson(rawPrompt);
        const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${sysLiveNote}${mcpNote}${mcpRulesNote}`;
        const allBlocks = [...abap.blocks, ...extraBlocks, ...docBlocks];
        try {
          const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
          return await callClaude({ feature: 'spec',  model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: mcpServers });
        } catch (e) {
          // Retry with EVERYTHING the first try had (documents, ABAP standards, context). Only the
          // live SAP tools are dropped, and only when they were what failed.
          if (e?.code === 'ai_limit_reached') throw e;
          const isMcpErr = mcpServers.length > 0 && /mcp|connection closed|connection error|listing tools/i.test(e?.message ?? '');
          const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
          const sysRetry = isMcpErr ? sys.replace(mcpNote, '').replace(mcpRulesNote, '') : sys;
          return callClaude({ feature: 'spec',  model: genModel, system: sysRetry, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: isMcpErr ? [] : mcpServers });
        }
      };
      const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
      const abapCtx = sanitizeForJson(abap.contextText);

      // Run all 4 specs independently so each gets its own status/error
      const setSpecStatus = (key, status) => setSpecStatuses(p => ({ ...p, [key]: status }));
      const setSpecError  = (key, msg)    => setSpecErrors(p => ({ ...p, [key]: msg }));

      const runSpec = async (key, promiseFn) => {
        try {
          const result = checkSpecText(await promiseFn());
          setSpecStatus(key, 'done');
          return result;
        } catch (e) {
          setSpecStatus(key, 'error');
          setSpecError(key, e.message);
          return null;
        }
      };

      // C must finish before D so D can use C's output as its source
      const specCPromise = runSpec('c', () => callSpec(buildSpecCPrompt(customerContent, genProfile, genProfile?.spec_c?.technical_objects ? contextStr + abapCtx : contextStr, isModCase)));
      let [specA, specB, specC, specD] = await Promise.all([
        runSpec('a', () => callSpec(buildSpecPrompt(true,  genProfile, genProfile?.spec_a?.technical_objects ? contextStr + abapCtx : contextStr, isModCase))),
        runSpec('b', () => callSpec(buildSpecPrompt(false, genProfile, contextStr, isModCase))),
        specCPromise,
        // D is written from C: without C it is not generated (marked failed so "Retry failed" picks it up).
        specCPromise.then(cContent => {
          if (!cContent) { setSpecStatus('d', 'error'); setSpecError('d', L('Requires Spec C, which was not generated. It is generated when Spec C is retried.', 'Requiere la Spec C, que no se generó. Se generará al reintentar la Spec C.')); return null; }
          return runSpec('d', () => callSpec(buildSpecDFromCPrompt(cContent, customerContent, genProfile, contextStr, isModCase)));
        }),
      ]);
      ({ a: specA, b: specB, c: specC, d: specD } = withCalculatedHours({ a: specA, b: specB, c: specC, d: specD }));

      if (specA) { setAiSpecA(specA); }
      if (specB) { setAiSpecB(specB); }
      if (specC) { setAiSpecC(specC); }
      if (specD) { setAiSpecD(specD); }

      const firstSuccess = specA || specB || specC || specD;
      if (!firstSuccess) {
        setAiError('All specifications failed to generate. Check errors above.');
        setGeneratingSpecs(false);
        return;
      }

      const firstKey = specA ? 'a' : specB ? 'b' : specC ? 'c' : 'd';
      const newDiff = {};
      for (const [k, v] of Object.entries({ a: specA, b: specB, c: specC, d: specD })) {
        const dd = v ? diffSpecs(prevSpecs[k], v) : null;
        if (dd) newDiff[k] = dd;
      }
      setRegenDiff(newDiff);
      setSelectedSpec(firstKey);
      setAiContent(specA || specB || specC || specD);
      setSavedSpecUrls({ a: null, b: null, c: null, d: null });
      setActiveProfile(genProfile);
      setProtoSaved(false);
      setProtoHtmlState(null);
      setProtoError(false);
      setViewingProto(false);
      const saveStatus = autoSubmit ? 'submitted' : 'draft';
      const newLogEntry = {
        iteration: (genLog.length + 1),
        timestamp: new Date().toISOString(),
        feedback: specFeedback?.trim() || null,
        specs: [specA && 'A', specB && 'B', specC && 'C', specD && 'D'].filter(Boolean),
      };
      const updatedLog = [...genLog, newLogEntry];
      try {
        await saveSpec({ mode: 'ai', status: saveStatus, content: specA || firstSuccess, objects: [], notes: JSON.stringify({ ...(notesRef.current ?? {}), specGeneratedAt: new Date().toISOString(), sapCheck, proposalCheck, specA, specB, specC, specD, selectedSpec: firstKey, prevMode, analysisCustomerContent: customerContent, requestSummary, activeProfile: genProfile, regenDiff: newDiff , hoursOverrides, scenarioCount: docScenariosRef.current }), title: caseData.title + t("spec.doc_title_suffix"), generation_log: updatedLog });
        setGenLog(updatedLog);
        if ((specC || specA) && inScope(requirements).length) handleCheckCoverage(specC ? 'c' : 'a', specC || specA);
        logEvent('spec.generated', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { model: genModel } });
      } catch (e) {
        // Never lose a generated spec silently — the text is still on screen, so say it wasn't stored.
        console.error('[spec] save failed', e);
        setAiError(`The specification was generated but could not be saved: ${e?.message || e}. Copy it before leaving this page and try again.`);
      }
      if (fromApprovalReview) setApprovalStep('sending');
      await saveAllSpecsAsDocuments(specA, specB, specC, specD, sapCheck, proposalCheck);

      // Generate interactive prototype if enabled for this profile — only from Spec C.
      if (genProfile?.prototype_enabled && !specC) {
        setSpecStatus('proto', 'error'); setSpecError('proto', L('Requires Spec C, which was not generated. It is generated when Spec C is retried.', 'Requiere la Spec C, que no se generó. Se generará al reintentar la Spec C.')); setProtoError(true);
      }
      if (genProfile?.prototype_enabled && specC) {
        setSpecStatus('proto', 'generating');
        try {
          const protoStyle = genProfile.prototype_style ?? 'auto';
          const protoSys = 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.';
          const protoMsgs = [{ role: 'user', content: buildPrototypePrompt(prototypeSources(specC, specA, specD), protoStyle) }];
          let protoHtml = await callClaude({ feature: 'prototype',  model: protoModel, system: protoSys, messages: protoMsgs, max_tokens: 40000 })
            .catch(e => {
              if (e.message?.includes('did not match the expected pattern')) {
                return callClaude({ feature: 'prototype',  model: 'claude-haiku-5-5', system: protoSys, messages: protoMsgs, max_tokens: 40000 });
              }
              throw e;
            });
          if (!protoHtml) throw new Error('Empty prototype response');
          protoHtml = sanitizeForJson(protoHtml).trim();
          if (protoHtml.startsWith('```')) {
            const firstNl = protoHtml.indexOf('\n');
            if (firstNl !== -1) protoHtml = protoHtml.slice(firstNl + 1);
            const lastFence = protoHtml.lastIndexOf('```');
            if (lastFence !== -1) protoHtml = protoHtml.slice(0, lastFence).trimEnd();
          }
          setProtoHtmlState(protoHtml);
          setSpecStatus('proto', 'done');
          try {
            const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
            const dateStr = new Date().toISOString().slice(0, 10);
            const protoFile = new File([protoHtml], `Prototype_${safeName}_${dateStr}.html`, { type: 'text/html' });
            await addDocument(protoFile, '[Prototype] Interactive Prototype');
            if (refetchDocuments) await refetchDocuments();
            setProtoSaved(true);
            // Update any existing share token to include the prototype
            if (shareToken?.id) {
              try {
                const { data: protoDoc } = await supabase
                  .from('case_documents').select('id')
                  .eq('case_id', caseData.id).like('file_name', 'Prototype_%')
                  .order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (protoDoc?.id) {
                  const updatedDocIds = { ...(shareToken.doc_ids ?? {}), proto: protoDoc.id };
                  await supabase.from('spec_review_tokens').update({ doc_ids: updatedDocIds }).eq('id', shareToken.id);
                  setShareToken(p => p ? { ...p, doc_ids: updatedDocIds } : p);
                }
              } catch (_) {}
            }
          } catch (saveErr) {
            console.warn('Prototype save failed:', saveErr?.message);
            setProtoError(true);
          }
        } catch (e) {
          setSpecStatus('proto', 'error');
          setSpecError('proto', e.message);
          setProtoError(true);
          console.error('Prototype generation failed:', e?.message);
        }
      }

      if (autoSubmit) await refetch();
    } catch (e) {
      setAiError(e.message);
    }
    setGeneratingSpecs(false);
  }

  // ── Standalone Spec D generation (for cases that already have A/B/C) ─────
  async function handleGenerateSpecD() {
    if (generatingSpecD) return;
    // Spec D is written from Spec C: generate C first.
    if (!aiSpecC) { setAiError(L('Spec D is written from Spec C — generate Spec C first.', 'La Spec D se redacta a partir de la Spec C — genere primero la Spec C.')); return; }
    setGeneratingSpecD(true);
    setAiSpecD('');
    try {
      const docBlocks = await buildDocumentBlocks();
      const pdfNames = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name);
      const pdfNote = pdfNames.length > 0 ? `\n\n[Reference PDFs attached: ${pdfNames.join(', ')}]` : '';
      const mcpServersD = await buildMcpConfig();
      const mcpNoteD = mcpServersD.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
      const mcpRulesNoteD = mcpServersD.length && sapMcpRules ? `\n\n${sapMcpRules}` : '';
      const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${mcpNoteD}${mcpRulesNoteD}`;
      const callSpec = async (rawPrompt) => {
        const prompt = sanitizeForJson(rawPrompt);
        try {
          const content = docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt;
          return await callClaude({ feature: 'spec',  model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: mcpServersD });
        } catch (e) {
          // Retry with the same documents; drop the live SAP tools only if they failed.
          if (e?.code === 'ai_limit_reached') throw e;
          const isMcpErr = mcpServersD.length > 0 && /mcp|connection closed|connection error|listing tools/i.test(e?.message ?? '');
          const content = docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt;
          const sysRetry = isMcpErr ? sys.replace(mcpNoteD, '').replace(mcpRulesNoteD, '') : sys;
          return callClaude({ feature: 'spec',  model: genModel, system: sysRetry, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: isMcpErr ? [] : mcpServersD });
        }
      };
      const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
      const _baseCtxD = sanitizeForJson(await buildGenContext());
      const contextStr = _baseCtxD + (requestSummary ? `\n\nPRE-ANALYSIS (request summary derived from attached documents):\n${sanitizeForJson(requestSummary)}` : '') + (additionalCtx?.trim() ? `\n\nADDITIONAL CONSIDERATIONS (from consultant):\n${sanitizeForJson(additionalCtx.trim())}` : '') + rulesPromptBlock(activeRules(ssCtx.settings, caseData.project_id)) + analysisFindingsBlock() + requirementsPromptBlock(requirements) + questionsPromptBlock(questions);
      const isModCase  = contextStr.includes('Existing ABAP Object Source');
      let specD = await callSpec(buildSpecDFromCPrompt(aiSpecC, customerContent, activeProfile ?? {}, contextStr, isModCase));
      checkSpecText(specD);
      specD = withCalculatedHours({ d: specD }).d;
      const dD = diffSpecs(aiSpecD, specD);
      const nextDiff = { ...regenDiff };
      if (dD) nextDiff.d = dD; else delete nextDiff.d;
      setRegenDiff(nextDiff);
      setAiSpecD(specD);
      setSelectedSpec('d');
      setAiContent(specD);
      setSavedSpecUrls(prev => ({ ...prev, d: null }));
      // Save as document
      try {
        const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const _dL3 = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : lang === 'de' ? 'de-DE' : 'en-US';
        const dateLong = new Date().toLocaleDateString(_dL3, { year: 'numeric', month: 'long', day: 'numeric' });
        const baseMeta = [
          { label: t("spec.label_case_id"), value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
          { label: t("label.sap_area"),     value: caseData.area_sap ?? '—' },
          { label: t("label.priority"),     value: (caseData.priority ?? '—').toUpperCase() },
          { label: t("spec.label_generated"), value: dateLong },
        ];
        if (deleteDocument && documents?.length) {
          const old = documents.filter(d => (d.file_name ?? '').startsWith('SpecD_EspecCliente'));
          await Promise.all(old.map(d => deleteDocument(d.id, d.file_url).catch(() => {})));
        }
        const htmlString = buildCaseDocHtml('Client Spec', 'SAP Consulting · ' + t("spec.html_title"), baseMeta, specD);
        const fileName = `SpecD_EspecCliente_${safeName}_${dateStr}.html`;
        const file = new File([htmlString], fileName, { type: 'text/html' });
        await addDocument(file, 'Client Spec (auto-generated)');
        setSavedSpecUrls(prev => ({ ...prev, d: fileName }));
        if (refetchDocuments) await refetchDocuments();
      } catch (saveErr) { console.warn('Spec D doc save failed:', saveErr?.message); }
      // Persist in spec notes
      try {
        await saveSpec({ mode: 'ai', status: spec?.status ?? 'draft', content: aiSpecA || specD, objects: [], notes: JSON.stringify({ ...(notesRef.current ?? {}), specGeneratedAt: new Date().toISOString(), sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD, selectedSpec: selectedSpec || 'd', prevMode, analysisCustomerContent, requestSummary, activeProfile, regenDiff: nextDiff , hoursOverrides, scenarioCount: docScenariosRef.current }), title: caseData.title + t("spec.doc_title_suffix") });
      } catch (_) {}
    } catch (e) {
      console.error('Spec D generation error:', e?.message);
    } finally {
      setGeneratingSpecD(false);
    }
  }

  // ── Retry only the failed specs ──────────────────────────────
  async function handleRetryFailed() {
    const anyExists = !!(aiSpecA || aiSpecB || aiSpecC || aiSpecD);
    const specContent = { a: aiSpecA, b: aiSpecB, c: aiSpecC, d: aiSpecD };
    const failedKeys = ['a', 'b', 'c', 'd', 'proto'].filter(key =>
      specStatuses[key] === 'error' ||
      (key !== 'proto' && !specContent[key] && anyExists)
    );
    if (!failedKeys.length) return;
    // If activeProfile was lost (page reload), try to restore from saved spec notes
    const profile = activeProfile ?? (() => {
      try { return JSON.parse(spec?.notes ?? '{}').activeProfile ?? null; } catch { return null; }
    })();
    if (!profile) return;
    setGeneratingSpecs(true);
    // Pre-seed statuses so already-completed specs show 'done' during the retry run
    setSpecStatuses({
      a: aiSpecA ? 'done' : 'idle',
      b: aiSpecB ? 'done' : 'idle',
      c: aiSpecC ? 'done' : 'idle',
      d: aiSpecD ? 'done' : 'idle',
      proto: protoSaved ? 'done' : 'idle',
    });
    const docBlocks = await buildDocumentBlocks();
    const pdfNames = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name);
    const pdfNote = pdfNames.length > 0 ? `\n\n[Reference PDFs attached: ${pdfNames.join(', ')}]` : '';
    const needsAbap = profile?.spec_a?.technical_objects || profile?.spec_c?.technical_objects;
    const abap = needsAbap ? await buildAbapStandardsForSpec() : { blocks: [], contextText: '' };
    const mcpServersR = await buildMcpConfig();
    const mcpNoteR = mcpServersR.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
    const mcpRulesNoteR = mcpServersR.length && sapMcpRules ? `\n\n${sapMcpRules}` : '';
    const callSpec = async (rawPrompt, extraBlocks = []) => {
      const prompt = sanitizeForJson(rawPrompt);
      const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${mcpNoteR}${mcpRulesNoteR}`;
      const allBlocks = [...abap.blocks, ...extraBlocks, ...docBlocks];
      try {
        const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
        return await callClaude({ feature: 'spec',  model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: mcpServersR });
      } catch (e) {
        // Retry with the same documents; drop the live SAP tools only if they failed.
        if (e?.code === 'ai_limit_reached') throw e;
        const isMcpErr = mcpServersR.length > 0 && /mcp|connection closed|connection error|listing tools/i.test(e?.message ?? '');
        const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
        const sysRetry = isMcpErr ? sys.replace(mcpNoteR, '').replace(mcpRulesNoteR, '') : sys;
        return callClaude({ feature: 'spec',  model: genModel, system: sysRetry, messages: [{ role: 'user', content }], max_tokens: 40000, mcp_servers: isMcpErr ? [] : mcpServersR });
      }
    };
    const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
    const _baseCtxR = sanitizeForJson(await buildGenContext());
    const contextStr = _baseCtxR + (requestSummary ? `\n\nPRE-ANALYSIS (request summary derived from attached documents):\n${sanitizeForJson(requestSummary)}` : '') + (additionalCtx?.trim() ? `\n\nADDITIONAL CONSIDERATIONS (from consultant):\n${sanitizeForJson(additionalCtx.trim())}` : '') + rulesPromptBlock(activeRules(ssCtx.settings, caseData.project_id)) + analysisFindingsBlock() + requirementsPromptBlock(requirements) + questionsPromptBlock(questions);
    const abapCtx = sanitizeForJson(abap.contextText);
    const setSpecStatus = (key, status) => setSpecStatuses(p => ({ ...p, [key]: status }));
    const setSpecError  = (key, msg)    => setSpecErrors(p => ({ ...p, [key]: msg }));

    const specMapRaw = {
      a: () => callSpec(buildSpecPrompt(true,  profile, profile?.spec_a?.technical_objects ? contextStr + abapCtx : contextStr)),
      b: () => callSpec(buildSpecPrompt(false, profile, contextStr)),
      c: () => callSpec(buildSpecCPrompt(customerContent, profile, profile?.spec_c?.technical_objects ? contextStr + abapCtx : contextStr)),
      // D is written from C (the one just retried, if C was retried too).
      d: () => callSpec(buildSpecDFromCPrompt(newSpecs.c, customerContent, profile, contextStr)),
    };
    const specMap = Object.fromEntries(Object.entries(specMapRaw).map(([k, fn]) => [k, async () => checkSpecText(await fn())]));
    const setters = { a: setAiSpecA, b: setAiSpecB, c: setAiSpecC, d: setAiSpecD };
    // Track newly generated values locally so we can persist them after state updates
    const newSpecs = { a: aiSpecA, b: aiSpecB, c: aiSpecC, d: aiSpecD };

    const specKeys = failedKeys.filter(k => k !== 'proto');
    // D and the prototype need Spec C: C first; D runs after it, only if C exists.
    const runD = specKeys.includes('d');
    const firstKeys = specKeys.filter(k => k !== 'd');
    const markNeedsC = key => { setSpecStatus(key, 'error'); setSpecError(key, L('Requires Spec C, which was not generated. It is generated when Spec C is retried.', 'Requiere la Spec C, que no se generó. Se generará al reintentar la Spec C.')); };
    if (mcpServersR.length > 0) {
      // Serialize MCP-backed specs to avoid concurrent tunnel connection failures
      for (const key of firstKeys) {
        setSpecStatus(key, 'generating');
        setSpecError(key, null);
        try {
          const result = await specMap[key]();
          if (result) {
            newSpecs[key] = result;
            setters[key](result);
            if (!selectedSpec || selectedSpec === key) { setSelectedSpec(key); setAiContent(result); }
            setSpecStatus(key, 'done');
          }
        } catch (e) {
          setSpecStatus(key, 'error');
          setSpecError(key, e.message);
        }
      }
    } else {
      await Promise.all(
        firstKeys.map(async key => {
          setSpecStatus(key, 'generating');
          setSpecError(key, null);
          try {
            const result = await specMap[key]();
            if (result) {
              newSpecs[key] = result;
              setters[key](result);
              if (!selectedSpec || selectedSpec === key) { setSelectedSpec(key); setAiContent(result); }
              setSpecStatus(key, 'done');
            }
          } catch (e) {
            setSpecStatus(key, 'error');
            setSpecError(key, e.message);
          }
        })
      );
    }

    if (runD) {
      if (!newSpecs.c) markNeedsC('d');
      else {
        setSpecStatus('d', 'generating'); setSpecError('d', null);
        try {
          const result = await specMap.d();
          if (result) { newSpecs.d = result; setAiSpecD(result); if (!selectedSpec || selectedSpec === 'd') { setSelectedSpec('d'); setAiContent(result); } setSpecStatus('d', 'done'); }
        } catch (e) { setSpecStatus('d', 'error'); setSpecError('d', e.message); }
      }
    }

    // Calculated hours on the retried specs (Spec D follows Spec C's estimate).
    {
      const retried = Object.fromEntries(failedKeys.filter(k => k !== 'proto' && newSpecs[k]).map(k => [k, newSpecs[k]]));
      if (retried.d && !retried.c) retried.c = newSpecs.c;   // D needs C's estimate
      const calc = withCalculatedHours(retried);
      for (const k of Object.keys(retried)) if (calc[k] && calc[k] !== newSpecs[k]) { newSpecs[k] = calc[k]; setters[k](calc[k]); }
    }
    // Persist the updated specs so they survive a logout/reload
    const anyNew = failedKeys.filter(k => k !== 'proto').some(k => newSpecs[k]);
    if (anyNew) {
      try {
        const firstKey = newSpecs.a ? 'a' : newSpecs.b ? 'b' : newSpecs.c ? 'c' : newSpecs.d ? 'd' : (selectedSpec || 'b');
        await saveSpec({
          mode: 'ai', status: spec?.status ?? 'draft',
          content: newSpecs.a || newSpecs.b || newSpecs.c || newSpecs.d,
          objects: [],
          notes: JSON.stringify({ ...(notesRef.current ?? {}), specGeneratedAt: new Date().toISOString(), sapCheck, proposalCheck, specA: newSpecs.a, specB: newSpecs.b, specC: newSpecs.c, specD: newSpecs.d, selectedSpec: firstKey, prevMode, analysisCustomerContent, requestSummary, activeProfile: profile, regenDiff , hoursOverrides, scenarioCount: docScenariosRef.current }),
          title: caseData.title + t("spec.doc_title_suffix"),
        });
      } catch (_) {}
    }

    // Retry proto if it was also failed — only from Spec C.
    if (failedKeys.includes('proto') && profile?.prototype_enabled && !newSpecs.c) markNeedsC('proto');
    if (failedKeys.includes('proto') && profile?.prototype_enabled && newSpecs.c) {
      setSpecStatus('proto', 'generating');
      try {
        const specA = aiSpecA; const specB = aiSpecB;
        const protoSys = 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.';
        const protoMsgs = [{ role: 'user', content: buildPrototypePrompt(prototypeSources(newSpecs?.c || aiSpecC, newSpecs?.a || aiSpecA, newSpecs?.d || aiSpecD), profile.prototype_style ?? 'auto') }];
        let protoHtml = await callClaude({ feature: 'prototype',  model: protoModel, system: protoSys, messages: protoMsgs, max_tokens: 40000 })
          .catch(e => {
            if (e.message?.includes('did not match the expected pattern')) {
              return callClaude({ feature: 'prototype',  model: 'claude-haiku-5-5', system: protoSys, messages: protoMsgs, max_tokens: 40000 });
            }
            throw e;
          });
        if (!protoHtml) throw new Error('Empty prototype response');
        protoHtml = sanitizeForJson(protoHtml).trim();
        if (protoHtml.startsWith('```')) {
          const firstNl = protoHtml.indexOf('\n');
          if (firstNl !== -1) protoHtml = protoHtml.slice(firstNl + 1);
          const lastFence = protoHtml.lastIndexOf('```');
          if (lastFence !== -1) protoHtml = protoHtml.slice(0, lastFence).trimEnd();
        }
        setProtoHtmlState(protoHtml);
        setProtoError(false);
        setSpecStatus('proto', 'done');
        try {
          const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
          const dateStr = new Date().toISOString().slice(0, 10);
          const protoFile = new File([protoHtml], `Prototype_${safeName}_${dateStr}.html`, { type: 'text/html' });
          await addDocument(protoFile, '[Prototype] Interactive Prototype');
          if (refetchDocuments) await refetchDocuments();
          setProtoSaved(true);
          if (shareToken?.id) {
            try {
              const { data: protoDoc } = await supabase
                .from('case_documents').select('id')
                .eq('case_id', caseData.id).like('file_name', 'Prototype_%')
                .order('created_at', { ascending: false }).limit(1).maybeSingle();
              if (protoDoc?.id) {
                const updatedDocIds = { ...(shareToken.doc_ids ?? {}), proto: protoDoc.id };
                await supabase.from('spec_review_tokens').update({ doc_ids: updatedDocIds }).eq('id', shareToken.id);
                setShareToken(p => p ? { ...p, doc_ids: updatedDocIds } : p);
              }
            } catch (_) {}
          }
        } catch (_) { setProtoError(true); }
      } catch (e) {
        setSpecStatus('proto', 'error');
        setSpecError('proto', e.message);
        setProtoError(true);
      }
    }
    setGeneratingSpecs(false);
  }

  // ── Approval helpers ─────────────────────────────────────────
  async function handleSubmit(specContent, specMode, specObjects) {
    if (specMode === 'ai' && !sendGateOk()) return;
    try {
      await saveSpec({
        mode: specMode,
        status: 'submitted',
        content: specContent ?? null,
        objects: specObjects ?? [],
        notes: specMode === 'manual' ? manualNotes : (specMode === 'ai' ? JSON.stringify({ ...(notesRef.current ?? {}), sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD: aiSpecD, selectedSpec, prevMode, analysisCustomerContent, requestSummary, activeProfile, regenDiff , hoursOverrides, scenarioCount: docScenariosRef.current }) : null),
        document_ids: specMode === 'manual' ? manualDocIds : [],
        title: caseData.title + t("spec.doc_title_suffix"),
      });
      await refetch();
    } catch (e) { alert(e.message); }
  }

  async function handleSapCheck(opts = {}) {
    const summaryIn = opts.summary !== undefined ? opts.summary : requestSummary;
    let result = null;
    setAiStep(1);             // drives the "running" spinner on the step and in its panel
    setActiveNode(1);
    setStepLoading(true);
    setAiError(null);
    setSapCheck(null);
    setProposalCheck(null);   // built on the previous coverage result — run it again after this
    try {
      const docBlocks = await buildAllDocBlocks();
      const customerCtx = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const summaryCtxSap = summaryIn ? `\nRequest Summary (pre-analysis):\n${summaryIn}` : '';
      const additionalCtxSap = additionalCtx?.trim() ? `\nAdditional Considerations:\n${additionalCtx.trim()}` : '';
      const prompt = `Analyze this SAP case and determine whether STANDARD SAP functionality covers the requirement — without any custom ABAP development.${docBlocks.length > 0 ? '\n\nThe attached documents (case files, project reference docs, and ABAP standards) contain the detailed requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${customerCtx}${summaryCtxSap}${additionalCtxSap}

Respond with ONLY a valid JSON object, no markdown fences:
{
  "coverage": "full" | "partial" | "none",
  "summary": "2-3 sentences explaining coverage level",
  "standard_transactions": ["T001 - description", "F.01 - description"],
  "gaps": ["Gap 1 that requires custom dev", "Gap 2"],
  "recommendation": "One sentence recommending the approach"
}

coverage meanings:
"full"    = Standard SAP configuration / standard transactions fully satisfy the requirement
"partial" = Standard SAP covers most of it; some custom development still needed
"none"    = Custom ABAP development is required — standard SAP cannot satisfy this

Keep it concise: at most 8 standard_transactions and 8 gaps, each under 25 words.${jsonLangNote(lang)}`;

      const _sapPdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const sapPdfNote = _sapPdfNote ? `\n\n[Reference PDFs: ${_sapPdfNote}]` : '';
      const sysSap = 'You are an SAP senior consultant. Respond ONLY with a valid JSON object, no markdown.';
      const raw = await callClaude({ feature: 'sap_coverage', 
        model: analysisModel, system: sysSap,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 4000,
      }).catch(_ => callClaude({ feature: 'sap_coverage',  model: analysisModel, system: sysSap, messages: [{ role: 'user', content: prompt + sapPdfNote }], max_tokens: 4000 }));
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { coverage: 'none', summary: raw, standard_transactions: [], gaps: [], recommendation: '' };
      }
      setSapCheck(parsed);
      setAiStep(2);
      setActiveNode(1); // show SAP result
      await markAnalysisStep('coverage', { sapCheck: parsed, proposalCheck: null });
      result = parsed;
    } catch (e) { setAiError(e.message); }
    setStepLoading(false);
    return result;
  }

  async function handleProposalValidation(opts = {}) {
    const sc = opts.sapCheck !== undefined ? opts.sapCheck : sapCheck;
    const summaryIn = opts.summary !== undefined ? opts.summary : requestSummary;
    if (!sc) return null;
    let result = null;
    setAiStep(2);             // drives the "running" spinner on the step and in its panel
    setActiveNode(2);
    setStepLoading(true);
    setAiError(null);
    setProposalCheck(null);
    try {
      const docBlocks = await buildAllDocBlocks();
      const customerCtx2 = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const summaryCtxProp = summaryIn ? `\nRequest Summary (pre-analysis):\n${summaryIn}` : '';
      const additionalCtxProp = additionalCtx?.trim() ? `\nAdditional Considerations:\n${additionalCtx.trim()}` : '';
      const prompt = `Validate the proposed custom SAP development for this case.${docBlocks.length > 0 ? '\n\nThe attached documents contain the requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${customerCtx2}${summaryCtxProp}${additionalCtxProp}

Standard SAP coverage analysis already completed:
- Coverage: ${sc.coverage}
- Summary: ${sc.summary}
- Gaps requiring custom dev: ${(sc.gaps ?? []).join('; ') || 'none listed'}

Now validate whether proceeding with custom ABAP development is well-justified, correctly scoped, and technically sound.

Respond with ONLY a valid JSON object, no markdown fences:
{
  "valid": true | false,
  "score": 1-10,
  "risk_level": "low" | "medium" | "high",
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommendation": "2-3 sentences on whether and how to proceed"
}${jsonLangNote(lang)}`;

      const _propPdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const propPdfNote = _propPdfNote ? `\n\n[Reference PDFs: ${_propPdfNote}]` : '';
      const sysProp = 'You are an SAP senior consultant. Validate development proposals. Respond ONLY with a valid JSON object, no markdown.';
      const raw = await callClaude({ feature: 'proposal_validation', 
        model: analysisModel, system: sysProp,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 4000,
      }).catch(_ => callClaude({ feature: 'proposal_validation',  model: analysisModel, system: sysProp, messages: [{ role: 'user', content: prompt + propPdfNote }], max_tokens: 4000 }));
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { valid: true, score: 7, risk_level: 'medium', strengths: [], concerns: [], recommendation: raw };
      }
      setProposalCheck(parsed);
      await markAnalysisStep('validation', { sapCheck: sc, proposalCheck: parsed });
      result = parsed;
      setAiStep(3);
      setActiveNode(3); // auto-advance to generate step
    } catch (e) { setAiError(e.message); }
    setStepLoading(false);
    return result;
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await saveSpec({ status: 'approved', approved_by: auth.user?.id, approved_at: new Date().toISOString(), rejected_reason: null });
      // Which spec was approved (the development plan is built from it — System settings → Spec quality).
      if (gateSpecKey()) saveAiNotesPatch({ approvedSpec: gateSpecKey() }).catch(() => {});
      await supabase.from('cases').update({ status: 'estimated' }).eq('id', caseData.id);
      logEvent('spec.approved', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, oldValue: { status: 'ai' }, newValue: { status: 'estimated' } });
      await refetch();
      onUpdate?.(caseData.id, { status: 'estimated' });

      // Notify + email for records
      const caseTitle   = caseData.title ?? 'a case';
      const approverName = auth.profile?.full_name ?? 'A manager';
      const notifTitle  = 'Spec approved';
      const notifBody   = `The functional spec for "${caseTitle}" was approved by ${approverName}.`;
      const emailHtml   = buildEmailHtml({
        title:    notifTitle,
        bodyHtml: `<p>The functional specification for <strong>${caseTitle}</strong> has been <strong>approved</strong> by ${approverName}.</p><p>The case has been moved to Estimated status.</p>`,
        footerNote: 'This is an automatic record of the spec approval.',
      });
      // Notify all managers as a record
      notifyManagers(notifTitle, notifBody, 'spec_approved').catch(() => {});
      sendEmailToManagers('Spec approved — ' + caseTitle, emailHtml).catch(() => {});
      // Notify the case creator / owner
      if (caseData.created_by && caseData.created_by !== auth.user?.id) {
        notify(caseData.created_by, notifTitle, notifBody, 'spec_approved').catch(() => {});
        sendEmailToUser(caseData.created_by, 'Spec approved — ' + caseTitle, emailHtml, 'spec_approved').catch(() => {});
      }
      // Notify the linked client
      if (caseData.client_id) {
        const clientHtml = buildEmailHtml({
          title:    'Your spec has been approved',
          bodyHtml: `<p>The functional specification for <strong>${caseTitle}</strong> has been officially approved.</p><p>Your project is now moving forward to the next stage.</p>`,
          footerNote: 'You are receiving this as the client linked to this case.',
        });
        notify(caseData.client_id, 'Spec approved', `The spec for "${caseTitle}" has been approved.`, 'spec_approved').catch(() => {});
        sendEmailToUser(caseData.client_id, 'Spec approved — ' + caseTitle, clientHtml, 'spec_approved').catch(() => {});
      }
    } catch (e) { alert(e.message); }
    setApproving(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setApproving(true);
    try {
      await saveSpec({ status: 'rejected', rejected_reason: rejectReason, approved_by: null, approved_at: null });
      setShowRejectInput(false);
      setRejectReason('');
      await refetch();
    } catch (e) { alert(e.message); }
    setApproving(false);
  }

  async function createShareLink() {
    if (!sendGateOk()) return;
    const PREFIXES = { a: 'SpecA_', b: 'SpecB_', c: 'SpecC_', d: 'SpecD_', proto: 'Prototype_' };
    const docIds = {};
    for (const [key, prefix] of Object.entries(PREFIXES)) {
      const doc = (documents ?? []).find(d => d.file_name?.startsWith(prefix));
      if (doc) docIds[key] = doc.id;
    }
    if (Object.keys(docIds).length === 0) {
      alert(t('spec.share_no_docs'));
      return;
    }
    setShareCreating(true);
    try {
      let createdBy = null;
      try { const { data: { user } } = await supabase.auth.getUser(); createdBy = user?.id ?? null; } catch (_) {}
      const platformMeta = {
        name:    ssCtx.settings['platform_name']    || 'Arena Solution Platform',
        tagline: ssCtx.settings['platform_tagline'] || 'SAP Solutions',
      };
      const { data, error } = await supabase
        .from('spec_review_tokens')
        .insert({ case_id: caseData.id, doc_ids: { ...docIds, _platform: platformMeta }, case_title: caseData.title ?? '', created_by: createdBy })
        .select().single();
      if (error) throw error;
      setShareToken(data);
      const url = `${window.location.origin}/review/${data.token}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (e) { alert(e.message); }
    setShareCreating(false);
  }

  async function copyShareLink() {
    if (!shareToken?.token) return;
    if (!sendGateOk()) return;
    const url = `${window.location.origin}/review/${shareToken.token}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 3000);
  }

  // ── Loading state ────────────────────────────────────────────
  if (specLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Spinner />
        <span className="ml-3 text-sm">{t("label.loading")}</span>
      </div>
    );
  }

  // ── Spec already exists — show it ───────────────────────────
  if (spec && mode === spec.mode && mode !== 'ai' && !['draft'].includes(spec.status) && spec.status !== 'rejected') {
    const statusColors = {
      submitted: 'bg-amber-100 text-amber-700 border border-amber-200',
      approved:  'bg-green-100 text-green-700 border border-green-200',
      rejected:  'bg-red-100 text-red-700 border border-red-200',
      draft:     'bg-gray-100 text-gray-600 border border-gray-200',
    };
    return (
      <div className="space-y-4">
        <AsBuiltSpecPanel caseData={caseData} auth={auth} spec={spec} refetch={refetch}
          addDocument={addDocument} refetchDocuments={refetchDocuments} canApprove={perms.can('approve_asbuilt_spec')}
          genModel={genModel} buildCaseDocHtml={buildCaseDocHtml} />
        {/* Status banner */}
        {spec.status === 'approved' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800 text-sm">{t("spec.approved_title")}</p>
              {spec.approved_at && <p className="text-xs text-green-600 mt-0.5">{t("spec.approved_on").replace("{n}", fmtDate(spec.approved_at))}</p>}
            </div>
          </div>
        )}
        {spec.status === 'submitted' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">{t("spec.awaiting")}</p>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-900 text-sm">{spec.title || t("spec.title_fallback")}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[spec.status]}`}>
              {t("spec.status_" + spec.status) || cap(spec.status)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {spec.mode === 'ai' && spec.status === 'approved' &&
              perms.can('regen_specs') && (
              <button onClick={() => handleGenerateSpecs({ autoSubmit: true })} disabled={generatingSpecs}
                className="px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                {generatingSpecs ? t("state.generating") : t("spec.regen_btn")}
              </button>
            )}
            {spec.status === 'submitted' && canApprove && (
              <Fragment>
                <button onClick={handleApprove} disabled={approving}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {approving ? t("state.saving") : t("spec.approve_btn")}
                </button>
                <button onClick={() => setShowRejectInput(p => !p)}
                  className="px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  {t("spec.reject_btn")}
                </button>
              </Fragment>
            )}
          </div>
        </div>

        {showRejectInput && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <label className="block text-xs font-semibold text-red-700">{t("spec.reject_reason")}</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="w-full border border-red-200 rounded-lg p-2 text-sm resize-none" rows={3}
              placeholder={t("spec.ph_rejection")} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRejectInput(false)} className="px-3 py-1.5 text-xs text-gray-500">{t("action.cancel")}</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || approving}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {t("spec.confirm_reject")}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {spec.content && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-800 leading-relaxed overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<p style="margin:0.5rem 0">' + renderMarkdown(spec.content) + '</p>') }} />
        )}
        {spec.mode === 'wizard' && !spec.content && (spec.objects ?? []).length > 0 && (
          <div className="space-y-3">
            {(spec.objects ?? []).map((o, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{o.type}</span>
                  <span className="font-mono text-sm font-semibold text-gray-900">{o.name}</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{o.purpose}</p>
                <div className="space-y-2">
                  {(o.questions ?? []).filter(q => q.a).map(q => (
                    <div key={q.id} className="text-xs">
                      <span className="font-semibold text-gray-700">{q.question}: </span>
                      <span className="text-gray-600">{q.a}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {spec.mode === 'manual' && (
          <div>
            {spec.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap">{spec.notes}</p>}
            {(spec.document_ids ?? []).length > 0 && (
              <p className="text-xs text-gray-500 mt-2">{spec.document_ids.length} document(s) attached</p>
            )}
          </div>
        )}
        {showGenModal && (
          <GenerationProfileModal
            onConfirm={(profileKey, resolvedProfile) => { setShowGenModal(false); handleGenerateSpecs({ ...(pendingGenOpts ?? {}), genProfile: resolvedProfile }); }}
            onClose={() => setShowGenModal(false)}
          />
        )}
      </div>
    );
  }

  // ── Mode selection ───────────────────────────────────────────
  if (!mode) {
    return (
      <div className="space-y-4">
        {spec && spec.status === 'rejected' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-800">{t("spec.rejected_title")}</p>
            {spec.rejected_reason && <p className="text-xs text-red-600 mt-1">{spec.rejected_reason}</p>}
            <p className="text-xs text-gray-500 mt-2">{t("spec.rejected_hint")}</p>
          </div>
        )}
        {spec && spec.status === 'draft' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700">{t("spec.draft_exists")}</p>
          </div>
        )}
        <p className="text-sm font-semibold text-gray-700">{t("spec.choose_mode")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: 'manual', Icon: Paperclip, titleKey: 'spec.mode_manual', descKey: 'spec.mode_manual_desc' },
            { key: 'wizard', Icon: Wand2,     titleKey: 'spec.mode_wizard', descKey: 'spec.mode_wizard_desc' },
            { key: 'ai',     Icon: Sparkles,  titleKey: 'spec.mode_ai',     descKey: 'spec.mode_ai_desc'     },
          ].map(card => (
            <button key={card.key} onClick={() => setMode(card.key)}
              className="text-left p-5 border-2 border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/40 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                <card.Icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="font-bold text-gray-900 text-sm mb-1 group-hover:text-blue-700">{t(card.titleKey)}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{t(card.descKey)}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Manual mode ──────────────────────────────────────────────
  if (mode === 'manual') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {canLeaveSpecMode && <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>}
          <span className="text-sm font-semibold text-gray-700">{t("spec.manual_title")}</span>
        </div>

        {documents.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("spec.attach_docs")}</p>
            <div className="space-y-2">
              {documents.map(doc => (
                <label key={doc.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={manualDocIds.includes(doc.id)}
                    onChange={e => setManualDocIds(prev => e.target.checked ? [...prev, doc.id] : prev.filter(id => id !== doc.id))}
                    className="rounded" />
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate">{doc.file_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("spec.scope_notes")}</label>
          <textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} rows={8}
            placeholder={t("spec.ph_description")}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-y focus:outline-none focus:border-blue-400" />
        </div>

        <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100">
          <button disabled={manualSaving} onClick={async () => {
            setManualSaving(true);
            try {
              await saveSpec({ mode: 'manual', status: 'draft', notes: manualNotes, document_ids: manualDocIds, title: caseData.title + t("spec.doc_title_suffix") });
              await refetch();
            } catch (e) { alert(e.message); }
            setManualSaving(false);
          }} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {manualSaving ? t("spec.saving_draft") : t("spec.save_draft")}
          </button>
          <button disabled={!manualNotes.trim()} onClick={() => {
            setAnalysisCustomerContent(manualNotes);
            setPrevMode('manual');
            setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setAiSpecD(''); setSelectedSpec(null); setAiStep(1);
            setMode('ai');
          }} className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-40">
            {t("spec.validate_gen")}
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard mode ──────────────────────────────────────────────
  if (mode === 'wizard') {
    // Stage 1: object suggestion
    if (wizardStage === 'objects') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {canLeaveSpecMode && <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>}
            <span className="text-sm font-semibold text-gray-700">{t("spec.wiz_step1")}</span>
          </div>

          {(documents ?? []).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">{t("spec.wiz_docs_lbl")}</p>
              <div className="flex flex-col gap-1">
                {documents.map(doc => (
                  <a key={doc.id} href={doc.file_url} onClick={docLinkClick(doc.file_url, doc.file_name)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                    <Paperclip className="w-3 h-3 flex-shrink-0" />
                    <span>{doc.file_name}</span>
                    <span className="text-blue-600 dark:text-blue-400">({doc.file_size_kb} KB)</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {(documents ?? []).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              {t("spec.no_docs_wiz")}
            </div>
          )}

          {wizardObjects.length === 0 && !wizardLoading && (
            <button onClick={suggestObjects}
              className="w-full py-10 border-2 border-dashed border-blue-200 rounded-2xl text-blue-600 hover:bg-blue-50 text-sm font-semibold transition-all">
              {t("spec.wiz_analyze")}
            </button>
          )}

          {wizardLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Spinner />
              <span className="text-sm">{t("spec.wiz_analyzing")}</span>
            </div>
          )}

          {wizardError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{wizardError}</div>
          )}

          {wizardObjects.length > 0 && (
            <Fragment>
              <div className="space-y-2">
                {wizardObjects.map((obj, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                    <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex-shrink-0">{obj.type}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm font-semibold text-gray-900">{obj.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{obj.purpose}</span>
                    </div>
                    <button onClick={() => setWizardObjects(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-600 dark:text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add object row */}
              <div className="flex items-center gap-2">
                <input value={addObjName} onChange={e => setAddObjName(e.target.value)}
                  placeholder={t("spec.ph_obj_name")}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                <input value={addObjType} onChange={e => setAddObjType(e.target.value)}
                  placeholder={t("spec.ph_obj_type")}
                  className="w-36 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                <button onClick={() => {
                  if (!addObjName.trim()) return;
                  setWizardObjects(prev => [...prev, { name: addObjName.trim(), type: addObjType.trim() || 'Object', purpose: '', questions: [] }]);
                  setAddObjName(''); setAddObjType('');
                }} className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 flex-shrink-0">
                  {t("spec.wiz_add")}
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button onClick={handleStartInterview} disabled={wizardObjects.length === 0 || wizardLoading}
                  className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                  {t("spec.wiz_start_intv")}
                </button>
              </div>
            </Fragment>
          )}
        </div>
      );
    }

    // Stage 2: per-object interview
    if (wizardStage === 'interview') {
      const curObj = wizardObjects[currentObjIdx];
      const allCurrentAnswered = (curObj?.questions ?? []).every(q => q.a?.trim());

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!specApproved && <button onClick={() => setWizardStage('objects')} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>}
              <span className="text-sm font-semibold text-gray-700">{t("spec.wiz_interview")}</span>
            </div>
            <span className="text-xs text-gray-400">{t("spec.obj_n_of").replace("{n}", currentObjIdx + 1).replace("{total}", wizardObjects.length)}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentObjIdx + 1) / wizardObjects.length) * 100}%` }} />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">{curObj?.type}</span>
              <span className="font-mono text-sm font-bold text-gray-900">{curObj?.name}</span>
            </div>
            {curObj?.purpose && <p className="text-xs text-blue-700">{curObj.purpose}</p>}
          </div>

          {wizardLoading && (
            <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
              <Spinner />
              <span className="text-sm">{t("spec.wiz_gen_qs").replace("{n}", curObj?.type ?? "")}</span>
            </div>
          )}

          {wizardError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{wizardError}</div>
          )}

          {!wizardLoading && (curObj?.questions ?? []).length > 0 && (
            <div className="space-y-4">
              {(curObj.questions ?? []).map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">{q.question}</label>
                  {q.type === 'select' && Array.isArray(q.options) ? (
                    <select value={q.a ?? ''} onChange={e => updateAnswer(currentObjIdx, q.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      <option value="">{t("spec.select_option")}</option>
                      {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : q.type === 'multiline' ? (
                    <textarea value={q.a ?? ''} onChange={e => updateAnswer(currentObjIdx, q.id, e.target.value)}
                      rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y focus:outline-none focus:border-blue-400"
                      placeholder={t("spec.ph_detail")} />
                  ) : (
                    <input type="text" value={q.a ?? ''} onChange={e => updateAnswer(currentObjIdx, q.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      placeholder={t("spec.ph_answer")} />
                  )}
                </div>
              ))}

              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <button onClick={() => { setCurrentObjIdx(p => Math.max(0, p - 1)); }} disabled={currentObjIdx === 0}
                  className="px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-30">
                  {t("spec.wiz_prev")}
                </button>
                <button onClick={handleNextObject} disabled={!allCurrentAnswered || wizardLoading}
                  className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                  {currentObjIdx === wizardObjects.length - 1 ? t("spec.wiz_compile") : t("spec.wiz_next_obj")}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Stage 3: preview
    if (wizardStage === 'preview') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {!specApproved && <button onClick={() => setWizardStage('interview')} className="text-xs text-gray-400 hover:text-gray-600">← {t("spec.wiz_interview")}</button>}
              <span className="text-sm font-semibold text-gray-700">{t("spec.wiz_compiled")}</span>
            </div>
            {compiledSpec && (
              <button onClick={() => {
                const qaSummary = wizardObjects.map(o => `${o.name} (${o.type}): ${(o.questions ?? []).map(q => `${q.question} → ${q.a}`).join('; ')}`).join('\n');
                setAnalysisCustomerContent(qaSummary || compiledSpec);
                setPrevMode('wizard');
                setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setAiSpecD(''); setSelectedSpec(null); setAiStep(1);
                setMode('ai');
              }} className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900">
                {t("spec.validate_gen")}
              </button>
            )}
          </div>

          {wizardLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Spinner />
              <span className="text-sm">{t("spec.compiling")}</span>
            </div>
          )}

          {wizardError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{wizardError}</div>
          )}

          {!wizardLoading && compiledSpec && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-800 leading-relaxed overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<p style="margin:0.5rem 0">' + renderMarkdown(compiledSpec) + '</p>') }} />
          )}

          {!wizardLoading && compiledSpec && (
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
              <button onClick={async () => {
                try {
                  await saveSpec({ mode: 'wizard', status: 'draft', content: compiledSpec, objects: wizardObjects, title: caseData.title + t("spec.doc_title_suffix") });
                  await refetch();
                } catch (e) { alert(e.message); }
              }} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">
                {t("spec.save_draft")}
              </button>
              <button onClick={() => saveSpecAsDocument(compiledSpec)} disabled={savingDoc}
                className="flex items-center px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50">
                {savingDoc ? t("spec.saving_draft") : <><Paperclip className="w-4 h-4 mr-1.5" />{t("spec.save_to_docs")}</>}
              </button>
              <button onClick={() => {
                const qaSummary = wizardObjects.map(o => `${o.name} (${o.type}): ${(o.questions ?? []).map(q => `${q.question} → ${q.a}`).join('; ')}`).join('\n');
                setAnalysisCustomerContent(qaSummary || compiledSpec);
                setPrevMode('wizard');
                setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setAiSpecD(''); setSelectedSpec(null); setAiStep(1);
                setMode('ai');
              }} className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900">
                {t("spec.validate_gen")}
              </button>
            </div>
          )}
        </div>
      );
    }
  }

  // ── AI Generate mode ─────────────────────────────────────────
  if (mode === 'ai') {
    const coverageColor = { full: ['bg-green-50','border-green-200','text-green-700','text-green-800'], partial: ['bg-amber-50','border-amber-200','text-amber-700','text-amber-800'], none: ['bg-red-50','border-red-200','text-red-700','text-red-800'] };
    const riskColor = { low: 'text-green-700 bg-green-50', medium: 'text-amber-700 bg-amber-50', high: 'text-red-700 bg-red-50' };
    const cc = coverageColor[sapCheck?.coverage] ?? coverageColor.none;

    // Filter out AI-generated output docs from the input document list
    const inputDocs = (documents ?? []).filter(doc => {
      const name = doc.file_name ?? '';
      const desc = doc.description ?? '';
      return !/^(SpecA_|SpecB_|SpecC_|SpecD_|Prototype_|DevPlan_|FuncSpec_)/i.test(name) &&
             !/^\[(Prototype|Spec|DevPlan|FuncSpec)/i.test(desc);
    });

    // Node statuses
    const specsExist = !!(aiSpecA || aiSpecB || aiSpecC || aiSpecD);
    const sapStatus  = sapCheck      ? 'complete' : stepLoading && aiStep === 1 ? 'running' : specsExist ? 'skipped' : 'pending';
    const propStatus = proposalCheck ? 'complete' : stepLoading && aiStep === 2 ? 'running' : specsExist ? 'skipped' : sapCheck ? 'pending' : 'locked';
    const genStatus   = specsExist ? 'complete' : generatingSpecs ? 'running' : proposalCheck ? 'pending' : 'locked';
    const protoStatus = protoSaved ? 'complete' : generatingSpecs ? 'running' : 'pending';
    const SUB = [
      { key: 'a', label: t("spec.tab_a"), dot: 'bg-amber-400',  content: aiSpecA },
      { key: 'b', label: t("spec.tab_b"), dot: 'bg-green-500',  content: aiSpecB },
      { key: 'c', label: t("spec.tab_c"), dot: 'bg-purple-500', content: aiSpecC },
      { key: 'd', label: t("spec.tab_d"), dot: 'bg-teal-500',   content: aiSpecD },
    ];
    // A spec is "failed" if: generation was attempted (some specs exist OR specStatuses has error)
    // but this specific spec is empty. Derived from data so it survives page reloads.
    const anySpecExists = !!(aiSpecA || aiSpecB || aiSpecC || aiSpecD);
    const specHasFailed = (key) =>
      specStatuses[key] === 'error' ||
      (!SUB.find(s => s.key === key)?.content && anySpecExists && !generatingSpecs);
    const NodeBtn = ({ id, icon: Icon, title, sub, status, isActive, canClick, onClick, children }) => {
      const sc = {
        complete: { ring: 'border-green-400',  bg: 'bg-green-50',   circ: 'bg-green-500',  txt: 'text-green-700',  sub: 'text-green-600' },
        running:  { ring: 'border-blue-400',   bg: 'bg-blue-50',    circ: 'bg-blue-500',   txt: 'text-blue-700',   sub: 'text-blue-500'  },
        pending:  { ring: 'border-gray-300',   bg: 'bg-white',      circ: 'bg-gray-200',   txt: 'text-gray-700',   sub: 'text-gray-400'  },
        skipped:  { ring: 'border-amber-200',  bg: 'bg-amber-50',   circ: 'bg-amber-300',  txt: 'text-amber-700',  sub: 'text-amber-500' },
        locked:   { ring: 'border-gray-200',   bg: 'bg-gray-50',    circ: 'bg-gray-100',   txt: 'text-gray-400',   sub: 'text-gray-300'  },
      }[status] ?? { ring:'border-gray-200', bg:'bg-white', circ:'bg-gray-200', txt:'text-gray-700', sub:'text-gray-400' };
      return (
        <div>
          <button onClick={onClick} disabled={!canClick}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all ${sc.bg} ${isActive ? 'border-blue-500 shadow-md' : sc.ring} ${canClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-not-allowed'}`}>
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${sc.circ}`}>
              {status === 'running' ? <Spinner />
               : <Icon size={14} className={status === 'complete' ? 'text-white' : status === 'locked' ? 'text-gray-300' : 'text-gray-500'} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-tight truncate ${sc.txt}`}>{title}</p>
              <p className={`text-xs truncate mt-0.5 ${sc.sub}`}>{sub}</p>
            </div>
          </button>
          {children}
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <AsBuiltSpecPanel caseData={caseData} auth={auth} spec={spec} refetch={refetch}
          addDocument={addDocument} refetchDocuments={refetchDocuments} canApprove={perms.can('approve_asbuilt_spec')}
          genModel={genModel} buildCaseDocHtml={buildCaseDocHtml} />
        {/* Header + back */}
        <div className="flex items-center gap-2">
          {canLeaveSpecMode && (
            <button onClick={() => {
              const dest = prevMode ?? null;
              setMode(dest);
              setAiStep(1); setSapCheck(null); setProposalCheck(null); setAiContent('');
              if (!dest) { setPrevMode(null); setAnalysisCustomerContent(''); }
            }} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>
          )}
          <span className="text-sm font-semibold text-gray-700 flex-1">
            {prevMode === 'manual' ? t("spec.ai_mode_manual") : prevMode === 'wizard' ? t("spec.ai_mode_wizard") : t("spec.ai_mode_gen")}
          </span>
          {/* Mobile: toggle steps panel */}
          <button
            className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-lg border text-xs"
            style={{borderColor:'var(--t-border)',color:'var(--t-text2)',background:'var(--t-card-bg)'}}
            onClick={() => setNodesCollapsed(v => !v)}
          >
            {nodesCollapsed ? <_LMenu size={12} /> : <_LX size={12} />} Steps
          </button>
        </div>

        {/* 2-column pipeline layout */}
        <div className="flex gap-4 items-start">

          {/* LEFT: Pipeline flow diagram */}
          <div className={`w-56 flex-shrink-0 ${nodesCollapsed ? 'hidden sm:block' : ''}`}>
            <div className="relative space-y-1">
              {/* vertical connector line behind nodes */}
              <div className="absolute left-[23px] top-10 bottom-10 w-0.5 bg-gray-200 z-0 pointer-events-none" />

              {/* Node 0: Documents (AI input) */}
              <NodeBtn id={0} icon={Paperclip}
                title={t("spec.pipeline_docs_lbl")}
                sub={`${inputDocs.length} ${t("spec.docs_files")}`}
                status="complete"
                isActive={activeNode===0}
                canClick={true}
                onClick={() => setActiveNode(0)}
              />

              {/* Node 5: Live SAP Connection — always visible so the per-case override is reachable */}
              <NodeBtn id={5} icon={Zap}
                title={t("spec.sap_conn_node_lbl")}
                sub={!effectiveBaseCheck && caseLiveCheck !== true ? 'Disabled (override here)'
                  : sapConnLoading ? t("spec.checking")
                  : sapConnInfo?.notFound ? t("spec.sap_conn_not_cfg")
                  : sapConnInfo?.error ? t("spec.sap_conn_not_cfg")
                  : sapConnInfo ? (sapConnInfo.host ?? t("spec.pending"))
                  : t("spec.pending")}
                status={!effectiveBaseCheck && caseLiveCheck !== true ? 'skipped'
                  : sapConnLoading ? 'running'
                  : sapConnInfo?.notFound || sapConnInfo?.error ? 'skipped'
                  : sapConnInfo ? 'complete'
                  : 'pending'}
                isActive={activeNode===5}
                canClick={true}
                onClick={() => {
                  setActiveNode(5);
                  if (liveCheckEnabled && !sapConnInfo && !sapConnLoading) loadSapConnInfo();
                }}
              />

              {/* Node 6: Compiled Context — the analysis, with its checks as sub-items (like the specs under Generate) */}
              <NodeBtn id={6} icon={Code2}
                title={t("spec.compiled_ctx_lbl") || "Compiled Context"}
                sub={requestSummaryLoading ? (t("spec.checking") || "Analyzing…") : requestSummary ? (t("spec.compiled_ctx_ready") || "Analysis ready") : (t("spec.compiled_ctx_sub") || "Assembled prompt context")}
                status={requestSummaryLoading ? 'running' : (requestSummary || compiledCtxPreview) ? 'complete' : 'pending'}
                isActive={activeNode===6}
                canClick={true}
                onClick={() => setActiveNode(6)}
              >
                {(() => {
                  const openQ = openQuestions(questions).length;
                  const subs = [
                    isSgNodeEnabled("sap_verification") && {
                      node: 1, label: getSgNodeLabel("sap_verification", L('Standard coverage', 'Cobertura estándar')), dot: 'bg-emerald-500',
                      state: sapStatus === 'running' ? 'running' : sapCheck ? (analysisState('coverage') === 'outdated' ? 'outdated' : 'done') : 'pending',
                      hint: sapCheck ? ({ full: L('Full', 'Total'), partial: L('Partial', 'Parcial'), none: L('None', 'Ninguna') }[sapCheck.coverage] ?? '') : '',
                    },
                    isSgNodeEnabled("proposal_validation") && {
                      node: 2, label: getSgNodeLabel("proposal_validation", L('Proposal validation', 'Validación de la propuesta')), dot: 'bg-amber-500',
                      state: propStatus === 'running' ? 'running' : proposalCheck ? (analysisState('validation') === 'outdated' ? 'outdated' : 'done') : propStatus === 'locked' ? 'locked' : 'pending',
                      hint: proposalCheck ? `${proposalCheck.score}/10` : '',
                    },
                    {
                      node: 7, label: L('Customer questions', 'Preguntas al cliente'), dot: 'bg-blue-500',
                      state: qLoading ? 'running' : !questions.length ? 'pending' : openQ ? 'open' : 'done',
                      hint: questions.length ? (openQ ? `${openQ} ${L('open', 'abiertas')}` : L('answered', 'respondidas')) : '',
                    },
                  ].filter(Boolean);
                  return (
                    <div className="ml-8 mt-1 space-y-1 relative z-10">
                      {subs.map(x => {
                        const cls = x.state === 'done' ? 'bg-green-50 border-green-200 text-green-700'
                          : x.state === 'outdated' || x.state === 'open' ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : x.state === 'running' ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-gray-50 border-gray-100 text-gray-400';
                        return (
                          <button key={x.node} disabled={x.state === 'locked'} onClick={() => setActiveNode(x.node)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-50 ${cls} ${activeNode === x.node ? 'ring-2 ring-blue-300' : ''}`}>
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${x.dot}`} />
                            <span className="truncate font-medium">{x.label}</span>
                            {x.state === 'running' ? <RefreshCw size={10} className="ml-auto animate-spin flex-shrink-0" />
                              : x.hint ? <span className="ml-auto text-[10px] flex-shrink-0">{x.hint}</span>
                              : x.state === 'done' ? <Check size={10} className="text-green-600 ml-auto flex-shrink-0" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </NodeBtn>

              {/* Node 3: Generate Specification + sub-nodes */}
              <NodeBtn id={3} icon={Sparkles}
                title={t("spec.ai_step3_lbl")}
                sub={genStatus==='complete' ? `${[aiSpecA,aiSpecB,aiSpecC,aiSpecD].filter(Boolean).length} ${t("spec.specs_gen")}` : genStatus==='running' ? t("spec.gen_all_loading") : genStatus==='locked' ? t("spec.locked") : t("spec.pending")}
                status={genStatus}
                isActive={activeNode===3}
                canClick={genStatus !== 'locked'}
                onClick={() => { if (genStatus !== 'locked') setActiveNode(3); }}
              >
                {/* Sub-nodes for Spec A / B / C + Prototype */}
                {(aiSpecA || aiSpecB || aiSpecC || activeNode===3 || specApproved) && (
                  <div className="ml-8 mt-1 space-y-1 relative z-10">
                    {SUB.map(s => {
                      const hasError = specHasFailed(s.key);
                      return (
                        <button key={s.key} onClick={() => { setActiveNode(3); setSelectedSpec(s.key); setViewingProto(false); setAiContent(s.content); }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border transition-all ${
                            hasError    ? 'bg-red-50 border-red-300 text-red-600'
                            : s.content ? 'bg-green-50 border-green-200 text-green-700'
                            :             'bg-gray-50 border-gray-100 text-gray-400'
                          } ${selectedSpec === s.key && activeNode===3 && !viewingProto ? 'ring-2 ring-blue-300' : ''}`}>
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${hasError ? 'bg-red-500' : s.dot}`} />
                          <span className="truncate font-medium">{s.label}</span>
                          {s.content  && <Check size={10} className="text-green-600 ml-auto flex-shrink-0" />}
                          {hasError    && <span className="ml-auto text-red-500 font-bold text-xs">!</span>}
                        </button>
                      );
                    })}
                    {/* Prototype sub-node — only when enabled in profile */}
                    {activeProfile?.prototype_enabled && (
                      <button onClick={() => { setActiveNode(3); setViewingProto(true); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border transition-all ${
                          protoSaved ? 'bg-green-50 border-green-200 text-green-700'
                          : protoError ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                        } ${viewingProto && activeNode===3 ? 'ring-2 ring-blue-300' : ''}`}>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${protoError ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <span className="truncate font-medium">{t("spec.proto_node_lbl")}</span>
                        {protoSaved && <Check size={10} className="text-green-600 ml-auto flex-shrink-0" />}
                        {protoError && !protoSaved && <span className="ml-auto text-red-500 text-xs">!</span>}
                      </button>
                    )}
                  </div>
                )}
              </NodeBtn>

              {/* Node 4: Approval */}
              {(() => {
                const approvalStatus = spec?.status === 'approved' ? 'complete'
                  : spec?.status === 'submitted' ? 'running'
                  : genStatus === 'complete' ? 'pending'
                  : 'locked';
                const approvalSub = spec?.status === 'approved' ? t("spec.status_approved")
                  : spec?.status === 'submitted' ? t("spec.awaiting")
                  : approvalStatus === 'locked' ? t("spec.locked")
                  : t("spec.pending");
                return (
                  <NodeBtn id={4} icon={Award}
                    title={t("spec.approval_node_lbl")}
                    sub={approvalSub}
                    status={approvalStatus}
                    isActive={activeNode===4}
                    canClick={approvalStatus !== 'locked'}
                    onClick={() => { if (approvalStatus !== 'locked') setActiveNode(4); }}
                  />
                );
              })()}
            </div>
          </div>

          {/* RIGHT: Content panel */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Error banner */}
            {aiError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{aiError}</div>
            )}

            {/* ── Node 5: Live SAP Connection ── */}
            {activeNode === 5 && (
              <div className="space-y-3">
                {(effectiveBaseCheck || caseLiveCheck === true) && (
                  <div className="border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-transparent rounded-xl p-3 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600 dark:text-gray-400">{t("spec.sap_conn_desc")}</p>
                  </div>
                )}
                {!(effectiveBaseCheck || caseLiveCheck === true) && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-start gap-2 opacity-60">
                    <Zap className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-500">SAP live check is currently disabled. Enable it in System Settings or the client/project SAP tab, or set the override below to "Enabled" for this case.</p>
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && (sapConnLoading || !sapConnInfo) && (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Spinner /><span className="text-sm">{t("spec.checking")}</span>
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && !sapConnLoading && sapConnInfo?.notFound && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{t("spec.sap_conn_none")}</p>
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && !sapConnLoading && sapConnInfo?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                    {sapConnInfo.error}
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && !sapConnLoading && sapConnInfo && !sapConnInfo.notFound && !sapConnInfo.error && (
                  <div className="rounded-xl overflow-hidden border border-gray-200 divide-y divide-gray-200">
                    {[
                      { label: t("spec.sap_conn_host"),    value: sapConnInfo.host },
                      { label: t("spec.sap_conn_user"),    value: sapConnInfo.username },
                      { label: t("spec.sap_conn_mandant"), value: sapConnInfo.client },
                      { label: t("spec.sap_conn_type"),    value: (sapConnInfo.type ?? '').toUpperCase() },
                      { label: t("spec.sap_conn_vpn"),     value: sapConnInfo.vpnUrl || null },
                      { label: t("spec.sap_conn_env"),     value: sapConnInfo.envName || null },
                    ].filter(r => r.value).map(({ label, value }, i) => (
                      <div key={i} className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-1">{label}</p>
                        <p className="text-xs font-mono text-blue-700 dark:text-blue-300 break-all leading-snug">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && !sapConnLoading && sapConnInfo && !sapConnInfo.notFound && !sapConnInfo.error && (
                  <div className="space-y-2">
                    {/* VPN mode badge */}
                    {sapConnCfg?.vpn_mode === 'user' && (
                      <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5">
                        <Laptop className="w-3 h-3 shrink-0" />
                        <span><strong>User VPN mode</strong> — make sure FortiClient is connected and <code className="font-mono">start-local.sh</code> is running on your laptop.</span>
                      </div>
                    )}
                    {/* Test result — only shown after an explicit live test, not the seeded green */}
                    {sapConnTest && sapConnTest !== 'testing' && !sapConnTest.seeded && (
                      <div className={`rounded-xl p-3 flex items-start gap-2 ${sapConnTest.ok ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-700' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-700'}`}>
                        {sapConnTest.ok
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${sapConnTest.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {sapConnTest.ok ? t("spec.sap_conn_ok") : t("spec.sap_conn_fail")}
                          </p>
                          {sapConnTest.info && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 break-all">{sapConnTest.info}</p>}
                          {sapConnTest.message && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 break-all">{sapConnTest.message}</p>}
                        </div>
                      </div>
                    )}

                    {/* Prompt to test if only seeded (no real test run yet) */}
                    {sapConnTest?.seeded && (
                      <p className="text-xs text-gray-500 text-center py-1">Click <strong className="text-gray-700 dark:text-gray-300">Test Connection</strong> to retrieve live SAP system data.</p>
                    )}

                    {/* Live data extracted from SAP — shown after a real test */}
                    {sapConnTest && sapConnTest !== 'testing' && sapConnTest.ok && !sapConnTest.seeded && (
                      <div className="rounded-xl overflow-hidden border border-gray-200 divide-y divide-gray-200 dark:border-gray-700 dark:divide-gray-700">
                        {sapConnTest.info && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-1">SAP System</p>
                            <p className="text-xs font-mono text-green-700 dark:text-green-300 break-all leading-snug">{sapConnTest.info}</p>
                          </div>
                        )}
                        {sapConnTest.capabilities?.length > 0 && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-2">ADT Capabilities</p>
                            <div className="flex flex-wrap gap-1">
                              {sapConnTest.capabilities.map((cap, i) => (
                                <span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 rounded-md px-2 py-0.5">{cap}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {sapConnTest.components?.length > 0 && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-2">Software Components</p>
                            <div className="flex flex-wrap gap-1">
                              {sapConnTest.components.map((comp, i) => (
                                <span key={i} className="text-xs bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 rounded-md px-2 py-0.5 font-mono">{comp}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Action row */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => testSapConnection()}
                        disabled={sapConnTest === 'testing'}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          sapConnTest === 'testing'
                            ? 'bg-gray-100 border border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
                            : sapConnTest?.ok
                              ? 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-800'
                              : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 dark:bg-red-900 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-800'
                        }`}>
                        {sapConnTest === 'testing'
                          ? <><Spinner />{t("spec.sap_conn_testing")}</>
                          : sapConnTest?.ok
                            ? <><CheckCircle2 className="w-3.5 h-3.5" />{t("spec.sap_conn_test_btn")}</>
                            : <><Zap className="w-3.5 h-3.5" />{t("spec.sap_conn_test_btn")}</>}
                      </button>
                      <button onClick={() => setActiveNode(6)}
                        className="px-4 py-2 bg-[#1A4B8C] text-white text-xs font-semibold rounded-xl hover:bg-blue-900">
                        {t("spec.continue_ctx")}
                      </button>
                    </div>
                  </div>
                )}

                {(effectiveBaseCheck || caseLiveCheck === true) && !sapConnLoading && sapConnInfo && (sapConnInfo.notFound || sapConnInfo.error) && (
                  <div className="flex justify-end pt-1">
                    <button onClick={() => setActiveNode(6)}
                      className="px-4 py-2 bg-[#1A4B8C] text-white text-xs font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.continue_ctx")}
                    </button>
                  </div>
                )}

                {/* Per-case SAP live check override — only shown if allowed by client + project */}
                {caseOverrideAllowed ? (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-1">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      SAP Live Check (this case)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">Override the system/client/project live check setting for this case only.</p>
                    <div className="flex gap-2">
                      {[
                        { val: null,  label: 'Default',  desc: 'Use inherited setting' },
                        { val: true,  label: 'Enabled',  desc: 'Always run live check for this case' },
                        { val: false, label: 'Disabled', desc: 'Skip live check for this case' },
                      ].map(opt => (
                        <button key={String(opt.val)}
                          onClick={() => { setCaseLiveCheck(opt.val); saveCaseLiveCheck(opt.val); }}
                          title={opt.desc}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                            ${caseLiveCheck === opt.val
                              ? opt.val === false ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-500 text-amber-700 dark:text-amber-300'
                                : opt.val === true  ? 'bg-green-50 dark:bg-green-900/60 border-green-500 text-green-700 dark:text-green-300'
                                : 'bg-blue-50 dark:bg-blue-900/60 border-blue-500 text-blue-700 dark:text-blue-300'
                              : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {caseLiveCheck !== null && (
                      <p className="text-[10px] text-gray-500 mt-1.5">
                        {caseLiveCheck ? '✓ Live SAP check forced ON for this case' : <><Ico i={_LAlertTriangle} />Live SAP check forced OFF for this case</>}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-1">
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      Case-level override is not permitted. Enable it in the client or project SAP settings.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Node 4: Approval workflow ── */}
            {activeNode === 4 && (() => {
              const STEPS = [
                { key: 'generated', label: L('Spec Generated', 'Spec generada'),        icon: <Sparkles size={13} /> },
                { key: 'checking',  label: L('Checking Spec', 'Revisión de la spec'),   icon: <Search size={13} />   },
                { key: 'sending',   label: L('Send for Approval', 'Enviar a aprobación'), icon: <Flag size={13} />     },
                { key: 'approved',  label: L('Approved', 'Aprobada'),                    icon: <Award size={13} />    },
              ];
              const stepIdx = { generated: 0, checking: 1, sending: 2, approved: 3 }[approvalStep] ?? 0;

              // ── Share section (reused in sending + approved steps) ──
              const ShareSection = () => {
                const hasSpecDocs = (documents ?? []).some(d =>
                  d.file_name && ['SpecA_','SpecB_','SpecC_','SpecD_','Prototype_'].some(p => d.file_name.startsWith(p))
                );
                const shareUrl = shareToken ? `${window.location.origin}/review/${shareToken.token}` : null;
                const shareStatus = shareToken?.status;
                return (
                  <div className="border border-dashed border-blue-200 dark:border-blue-800 rounded-xl p-3 bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{t("spec.share_btn")}</p>
                          {shareToken && (
                            <p className={`text-xs mt-0.5 ${shareStatus === 'approved' ? 'text-green-600' : shareStatus === 'changes_requested' ? 'text-amber-600' : 'text-blue-600'}`}>
                              {shareStatus === 'approved' ? ('✓ ' + t("spec.share_status_approved"))
                                : shareStatus === 'changes_requested' ? t("spec.share_status_changes")
                                : t("spec.share_link_label")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {!hasSpecDocs && !shareToken && <p className="text-xs text-gray-400">{t("spec.share_no_docs")}</p>}
                        {shareUrl && (
                          <input readOnly value={shareUrl}
                            className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 w-52 truncate cursor-pointer"
                            onClick={copyShareLink} title={shareUrl} />
                        )}
                        {shareUrl && (
                          <button onClick={copyShareLink}
                            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${shareCopied ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                            {shareCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {shareCopied ? t("spec.share_link_copied") : t("spec.share_copy_link")}
                          </button>
                        )}
                        {(hasSpecDocs || shareToken) && (
                          <button onClick={createShareLink} disabled={shareCreating}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                            {shareCreating ? <span className="animate-spin inline-block">↻</span> : <ExternalLink className="w-3 h-3" />}
                            {shareToken ? t("spec.share_new_link") : (shareCreating ? t("spec.share_creating") : t("spec.share_btn"))}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-4">

                  {/* ── Roadmap stepper ── */}
                  <div className="bg-gray-100 dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm px-4 py-3">
                    <div className="flex items-start overflow-x-auto gap-0 pb-0.5">
                      {STEPS.map((s, i) => {
                        const done   = i < stepIdx;
                        const active = i === stepIdx;
                        const canNav = spec && (s.key !== 'approved' || spec?.status === 'approved');
                        return (
                          <button key={s.key}
                            onClick={() => canNav && setApprovalStep(s.key)}
                            disabled={!canNav}
                            className="flex flex-col items-center flex-1 min-w-[52px] relative disabled:cursor-not-allowed">
                            {i > 0 && (
                              <div className={`absolute top-[15px] right-1/2 w-full h-0.5 ${done ? 'bg-blue-500' : 'bg-gray-300 dark:bg-white/15'}`} />
                            )}
                            <div className={`w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center relative z-10 transition-all
                              ${active ? 'border-blue-500 bg-blue-500/20 text-blue-500'
                              : done   ? 'border-green-500 bg-green-500/20 text-green-500'
                                       : 'border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-400 dark:text-white/30'}`}>
                              {done ? <Check size={12} /> : s.icon}
                            </div>
                            <span className={`text-[9px] font-bold mt-1 uppercase tracking-wider text-center leading-tight
                              ${active ? 'text-blue-500' : done ? 'text-green-500' : 'text-gray-400 dark:text-white/30'}`}>
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── No spec yet ── */}
                  {!spec && (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                      <Award className="w-8 h-8 opacity-40" />
                      <p className="text-xs">{t("spec.approval_pending_desc")}</p>
                    </div>
                  )}

                  {/* ── Step 1: Spec Generated (log) ── */}
                  {spec && approvalStep === 'generated' && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> {L("Generation Log", "Historial de generación")}
                          </p>
                          <span className="text-[10px] text-gray-400">{genLog.length} {L(genLog.length !== 1 ? 'runs' : 'run', genLog.length !== 1 ? 'ejecuciones' : 'ejecución')}</span>
                        </div>
                        {genLog.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-gray-400">{L("No generation runs recorded yet.", "Aún no hay generaciones registradas.")}</div>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {[...genLog].reverse().map((entry, ri) => {
                              const idx = genLog.length - ri;
                              const ts = new Date(entry.timestamp);
                              const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                              const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              return (
                                <div key={ri} className="px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[11px] font-semibold text-blue-600">{L("Iteration", "Iteración")} {idx}</span>
                                    <span className="text-[10px] text-gray-400">{dateStr} · {timeStr}</span>
                                  </div>
                                  {entry.specs?.length > 0 && (
                                    <div className="flex gap-1 flex-wrap mb-1">
                                      {entry.specs.map(s => (
                                        <span key={s} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium border border-blue-100">Spec {s}</span>
                                      ))}
                                    </div>
                                  )}
                                  {entry.feedback && (
                                    <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2">"{entry.feedback}"</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {spec.content && (
                        <div className="overflow-y-auto max-h-[320px]">
                          <MarkdownAccordion text={spec.content} />
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button onClick={() => setApprovalStep('checking')}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
                          {L("Review & Refine →", "Revisar y ajustar →")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Step 2: Checking Spec ── */}
                  {spec && approvalStep === 'checking' && (
                    <div className="space-y-3">
                      {spec.status === 'approved' && (
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-xs text-green-700 dark:text-green-400 font-medium">{L("This spec has been approved — regeneration is locked.", "Esta spec ya fue aprobada — no se puede volver a generar.")}</p>
                        </div>
                      )}
                      <div className={`rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-800/40 dark:bg-[#0d1b2e] overflow-hidden ${spec.status === 'approved' ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500 opacity-70" />
                          <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{L("What do you want to change or add to the next generation?", "¿Qué quieres cambiar o agregar en la próxima generación?")}</p>
                        </div>
                        <textarea
                          value={specFeedback}
                          onChange={e => setSpecFeedback(e.target.value)}
                          rows={6}
                          placeholder={L("e.g. Add more detail to the authorization concept in Spec A. In Spec B, include the RFC function module names. Remove section 4 from Spec C…", "p. ej. Más detalle del concepto de autorizaciones en la Spec A. En la Spec B, incluir los módulos de función RFC. Quitar la sección 4 de la Spec C…")}
                          className="w-full bg-transparent px-3 py-2 text-xs text-gray-800 placeholder-gray-400 dark:text-gray-200 dark:placeholder-gray-600 resize-none focus:outline-none font-mono leading-relaxed"
                        />
                        <div className="px-3 pb-2 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" />
                          <span className="text-[10px] text-gray-500">{L("Feedback accumulates across iterations — Claude sees the full history", "Los comentarios se acumulan entre iteraciones — Claude ve todo el historial")}</span>
                        </div>
                      </div>
                      {genLog.length > 0 && (
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                          <span className="font-semibold text-gray-500">{L("Last run:", "Última ejecución:")}</span>
                          {L("Iteration", "Iteración")} {genLog.length} · {new Date(genLog[genLog.length-1]?.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                          {genLog[genLog.length-1]?.specs?.length > 0 && ` · Spec ${genLog[genLog.length-1].specs.join(', ')}`}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => setApprovalStep('generated')}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          {L("← Back to log", "← Volver al historial")}
                        </button>
                        <button
                          onClick={() => handleGenerateSpecs({ genProfile: activeProfile, fromApprovalReview: true })}
                          disabled={generatingSpecs || spec.status === 'approved'}
                          title={spec.status === 'approved' ? L('Spec is approved — regeneration is locked', 'La spec está aprobada — no se puede volver a generar') : undefined}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
                          {generatingSpecs ? <><span className="animate-spin inline-block">↻</span> {L('Generating…', 'Generando…')}</> : L('↻ Generate Again', '↻ Generar de nuevo')}
                        </button>
                      </div>
                      {generatingSpecs && (
                        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-800/40 rounded-xl px-3 py-2">
                          <span className="animate-spin inline-block">↻</span>
                          {L("Generating specs with your feedback — this may take a minute…", "Generando las specs con tus comentarios — puede tardar un minuto…")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Step 3: Sending for Approval ── */}
                  {spec && approvalStep === 'sending' && (
                    <div className="space-y-3">
                      {spec.status === 'approved' ? (
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-green-800 dark:text-green-300">{t("spec.approved_title")}</p>
                            {spec.approved_at && <p className="text-xs text-green-600 mt-0.5">{t("spec.approved_on").replace("{n}", fmtDate(spec.approved_at))}</p>}
                          </div>
                        </div>
                      ) : spec.status === 'submitted' ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <p className="text-xs text-amber-800 font-medium">{t("spec.awaiting")}</p>
                        </div>
                      ) : (
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{spec.title || t("spec.title_fallback")}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 capitalize">{spec.status}</span>
                          </div>
                          {genLog.length > 0 && (
                            <p className="text-[11px] text-gray-500">
                              {L(`${genLog.length} generation run${genLog.length !== 1 ? 's' : ''} completed`, `${genLog.length} generación(es) completada(s)`)}
                              {genLog[genLog.length-1]?.feedback ? L(' · includes your review feedback', ' · incluye tus comentarios') : ''}
                            </p>
                          )}
                        </div>
                      )}

                      <ShareSection />

                      {/* Approve / reject for managers */}
                      {spec.status === 'submitted' && canApprove && (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={handleApprove} disabled={approving}
                            className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                            {approving ? t("state.saving") : t("spec.approve_btn")}
                          </button>
                          <button onClick={() => setShowRejectInput(p => !p)}
                            className="px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                            {t("spec.reject_btn")}
                          </button>
                        </div>
                      )}
                      {showRejectInput && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                          <label className="block text-xs font-semibold text-red-700">{t("spec.reject_reason")}</label>
                          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            className="w-full border border-red-200 rounded-lg p-2 text-xs resize-none" rows={3}
                            placeholder={t("spec.ph_rejection")} />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowRejectInput(false)} className="px-3 py-1.5 text-xs text-gray-500">{t("action.cancel")}</button>
                            <button onClick={handleReject} disabled={!rejectReason.trim() || approving}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                              {t("spec.confirm_reject")}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button onClick={() => setApprovalStep('checking')}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          {L("← Back to review", "← Volver a la revisión")}
                        </button>
                        {spec.status !== 'submitted' && spec.status !== 'approved' && (
                          <button
                            onClick={async () => {
                              try {
                                await saveSpec({ status: 'submitted' });
                                logEvent('spec.submitted', { entityType: 'case', entityId: caseData.id, entityName: caseData.title });

                                const caseTitle = caseData.title ?? 'a case';
                                const notifTitle = 'Spec submitted for approval';
                                const notifBody  = `The functional spec for "${caseTitle}" has been submitted and is awaiting your approval.`;
                                const emailHtml  = buildEmailHtml({
                                  title:    notifTitle,
                                  bodyHtml: `<p>The functional specification for <strong>${caseTitle}</strong> has been submitted for approval.</p><p>Please review it and approve or request changes.</p>`,
                                  footerNote: 'You are receiving this because you are a platform manager.',
                                });
                                // Notify + email all managers
                                notifyManagers(notifTitle, notifBody, 'spec_submitted').catch(() => {});
                                sendEmailToManagers('Spec submitted for approval — ' + caseTitle, emailHtml).catch(() => {});

                                // Notify + email the linked client if one exists
                                if (caseData.client_id) {
                                  const clientEmailHtml = buildEmailHtml({
                                    title:    'Your spec is ready for review',
                                    bodyHtml: `<p>The functional specification for <strong>${caseTitle}</strong> has been submitted for your approval.</p><p>Please log in to review and sign off on the spec.</p>`,
                                    footerNote: 'You are receiving this as the client linked to this case.',
                                  });
                                  notify(caseData.client_id, 'Spec ready for your approval', notifBody, 'spec_submitted').catch(() => {});
                                  sendEmailToUser(caseData.client_id, 'Spec submitted for approval — ' + caseTitle, clientEmailHtml, 'spec_submitted').catch(() => {});
                                }
                              } catch (_) {}
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
                            {L("Send for Approval →", "Enviar a aprobación →")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Step 4: Approved ── */}
                  {spec && approvalStep === 'approved' && (
                    <div className="space-y-3">
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-green-800 text-sm">{t("spec.approved_title")}</p>
                          {spec.approved_at && <p className="text-xs text-green-600 mt-0.5">{t("spec.approved_on").replace("{n}", fmtDate(spec.approved_at))}</p>}
                          {genLog.length > 0 && (
                            <p className="text-xs text-green-500 mt-1">{L(`${genLog.length} generation iteration${genLog.length !== 1 ? 's' : ''} to reach approval`, `${genLog.length} iteración(es) hasta la aprobación`)}</p>
                          )}
                        </div>
                      </div>
                      <ShareSection />
                      {spec.content && (
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                            <span className="group-open:hidden">▶ {L(`Show generation log (${genLog.length} runs)`, `Ver historial de generación (${genLog.length})`)}</span>
                            <span className="hidden group-open:inline">▼ {L("Hide generation log", "Ocultar historial de generación")}</span>
                          </summary>
                          <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {genLog.length === 0 ? (
                              <div className="px-3 py-3 text-xs text-gray-400 text-center">{L("No log entries.", "Sin registros.")}</div>
                            ) : (
                              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {genLog.map((entry, i) => (
                                  <div key={i} className="px-3 py-2">
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                      <span className="text-[11px] font-semibold text-blue-600">{L("Iteration", "Iteración")} {entry.iteration ?? (i + 1)}</span>
                                      <span className="text-[10px] text-gray-400">{new Date(entry.timestamp).toLocaleString()}</span>
                                    </div>
                                    {entry.specs?.length > 0 && <div className="flex gap-1 flex-wrap mb-0.5">{entry.specs.map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">Spec {s}</span>)}</div>}
                                    {entry.feedback && <p className="text-[11px] text-gray-500 italic">"{entry.feedback}"</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}

            {/* ── Node 0: Documents ── */}
            {activeNode === 0 && (() => {
              function docReadStatus(fileName, fileType) {
                const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
                if (ext === 'pdf' || (fileType ?? '').includes('pdf'))
                  return { label: 'PDF — native read', color: 'bg-blue-100 text-blue-700' };
                if (['txt','md','csv','json'].includes(ext))
                  return { label: 'Plain text', color: 'bg-green-100 text-green-700' };
                if (ext === 'html' || ext === 'htm')
                  return { label: 'HTML → text', color: 'bg-green-100 text-green-700' };
                if (ext === 'docx')
                  return { label: 'Word → text', color: 'bg-green-100 text-green-700' };
                if (ext === 'xlsx' || ext === 'xls')
                  return { label: 'Excel → text', color: 'bg-green-100 text-green-700' };
                return { label: 'Not extractable', color: 'bg-amber-100 text-amber-700' };
              }
              return (
                <div className="space-y-3">
                  {/* Case documents */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-blue-800 mb-1">Case Documents</h3>
                    <p className="text-xs text-blue-500 mb-3">Files attached directly to this case</p>
                    {inputDocs.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{t("spec.no_docs_ai")}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {inputDocs.map(doc => {
                          const st = docReadStatus(doc.file_name, doc.file_type);
                          return (
                            <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-100">
                              <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              <span className="text-xs text-gray-700 font-medium flex-1 min-w-0 truncate">{doc.file_name}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{doc.file_size_kb} KB</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.color}`}>{st.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Project documents */}
                  {caseData.project_id && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-indigo-800 mb-1">Project Documents</h3>
                      <p className="text-xs text-indigo-500 mb-3">Reference docs configured for this project</p>
                      {projDocsForDisplay === null ? (
                        <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 py-1"><Spinner /><span>Loading…</span></div>
                      ) : projDocsForDisplay.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No project documents configured</p>
                      ) : (
                        <div className="space-y-1.5">
                          {projDocsForDisplay.map((doc, i) => {
                            const st = docReadStatus(doc.name ?? doc.file_name, doc.type);
                            return (
                              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-indigo-100">
                                <Paperclip className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                                <span className="text-xs text-gray-700 font-medium flex-1 min-w-0 truncate">{doc.name ?? doc.file_name}</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.color}`}>{st.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ABAP Standards */}
                  {caseData.project_id && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-amber-800 mb-1">ABAP Standards Documents</h3>
                      <p className="text-xs text-amber-600 mb-3">Naming conventions &amp; coding standards — sent as context when generating technical specs</p>
                      {abapDocsForDisplay === null ? (
                        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 py-1"><Spinner /><span>Loading…</span></div>
                      ) : abapDocsForDisplay.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No ABAP standards documents configured for this project</p>
                      ) : (
                        <div className="space-y-1.5">
                          {abapDocsForDisplay.map((doc, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-amber-100">
                              <Paperclip className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                              <span className="text-xs text-gray-700 font-medium flex-1 min-w-0 truncate">{doc.name}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">PDF — native read</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  {(() => {
                    const abapCount = abapDocsForDisplay?.length ?? 0;
                    const total = inputDocs.length + (projDocsForDisplay?.length ?? 0) + abapCount;
                    const hasUnreadable = inputDocs.some(d => docReadStatus(d.file_name, d.file_type).label === 'Not extractable');
                    return (
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-xs text-gray-600">
                          <span className="font-semibold">{total} document{total !== 1 ? 's' : ''}</span> will be read by Claude during generation.
                          {hasUnreadable && (
                            <span className="text-amber-600 ml-1">Some files cannot be extracted — only supported formats are sent.</span>
                          )}
                        </span>
                      </div>
                    );
                  })()}

                  {!specApproved && !sapCheck && (
                    <div className="flex justify-end">
                      <button onClick={() => setActiveNode((effectiveBaseCheck || caseLiveCheck === true) ? 5 : 6)}
                        className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                        {(effectiveBaseCheck || caseLiveCheck === true) ? t("spec.continue_sap_conn") : t("spec.continue_ctx")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Node 6: Compiled Context Preview ── */}
            {activeNode === 6 && (() => {
              const clientCompany = caseData.client?.client_profiles?.company_name ?? caseData.client?.name ?? null;
              const assignedConsultant = (caseData.case_assignments ?? []).find(a => a.is_active !== false)?.profiles?.full_name ?? null;
              const staticFields = [
                { label: t("gen.ctx_meta_case")     || 'Case',       value: caseData.title },
                { label: t("gen.ctx_meta_client")   || 'Client',     value: clientCompany },
                { label: t("gen.ctx_meta_sap")      || 'SAP Module', value: caseData.area_sap },
                { label: t("gen.ctx_meta_industry") || 'Industry',   value: caseData.area_industry },
                { label: t("gen.ctx_meta_status")   || 'Status',     value: caseData.status ? cap(caseData.status.replace(/_/g, ' ')) : null },
                { label: t("gen.ctx_meta_priority") || 'Priority',   value: caseData.priority ? cap(caseData.priority) : null },
                { label: t("gen.ctx_meta_budget")   || 'Budget',     value: caseData.budget },
                { label: t("gen.ctx_meta_duedate")  || 'Due Date',   value: caseData.due_date },
                { label: t("gen.ctx_meta_skills")   || 'Skills',     value: caseData.skills_required?.length ? caseData.skills_required.join(', ') : null },
                { label: t("gen.ctx_meta_consult")  || 'Consultant', value: assignedConsultant },
              ].filter(f => f.value);

              const customerContent = analysisCustomerContent || caseData.description || '';

              async function handleBuildCtx() {
                setCompiledCtxLoading(true);
                try {
                  const ctx = await buildGenContext();
                  setCompiledCtxPreview(ctx || '(no additional context)');
                } catch (e) {
                  setCompiledCtxPreview(`Error: ${e.message}`);
                } finally {
                  setCompiledCtxLoading(false);
                }
              }

              async function handleAnalyzeRequest() {
                let analyzeResult = null;
                if (!(await analyzeAllowed())) return null;
                setRequestSummaryLoading(true);
                setRequestSummaryError(null);
                try {
                  // Use buildAllDocBlocks to include case + project docs (not just case docs)
                  // This ensures project documents like VSS_Order.pdf are also analysed
                  const docBlocks = await buildAllDocBlocks();
                  const langName = lang === 'es' ? 'Spanish' : lang === 'fr' ? 'French' : lang === 'pt' ? 'Portuguese' : lang === 'de' ? 'German' : 'English';
                  const h_sap_objects = lang === 'es' ? 'Objetos SAP en el Sistema'
                    : lang === 'fr' ? 'Objets SAP dans le Système'
                    : lang === 'pt' ? 'Objetos SAP no Sistema'
                    : lang === 'de' ? 'SAP-Objekte im System'
                    : 'SAP Objects in System';
                  const docNote = docBlocks.length > 0
                    ? `IMPORTANT: All ${docBlocks.length} document(s) listed are already provided above as content blocks. Any email, message, or document that mentions "attached files", "see attached", or "adjunto" is referring to the other documents already included in this analysis. Do not say that documents are missing or not received — they are all here.`
                    : 'No documents attached.';

                  // Read generation_context fresh from Supabase to avoid stale cached settings
                  const { data: freshCtxRow } = await supabase
                    .from('system_settings').select('value').eq('key', 'generation_context').maybeSingle();
                  const freshCtx = freshCtxRow?.value ?? {};
                  const genCtxNow = { ...GENERATION_CONTEXT_DEFAULTS, ...freshCtx };
                  const rawSections = genCtxNow.request_summary_sections?.length
                    ? genCtxNow.request_summary_sections
                    : GENERATION_CONTEXT_DEFAULTS.request_summary_sections;
                  // Normalise legacy string entries; filter to enabled only. The live SAP check
                  // section (kind 'sap_live') is not written by the text model — it comes from the
                  // SAP step below; when the list has no such entry it is on by default.
                  const normSections = rawSections.map(s => typeof s === 'string' ? { name: s, enabled: true } : s);
                  const sapLiveSection = normSections.find(s => s.kind === 'sap_live') ?? { name: '', enabled: true, kind: 'sap_live' };
                  const configuredSections = normSections
                    .filter(s => s.enabled !== false && s.kind !== 'sap_live')
                    .map(s => s.name);

                  const sectionBlocks = configuredSections.map(sec => `## ${sec}\nList 3–6 bullet points relevant to this section based on the case content above. Be specific — use module names, transaction codes, field names, business process names, and actual terminology from the source material. Keep each bullet to 1–2 lines. Use the section heading exactly as written above — do not translate it.`).join('\n\n');

                  const prompt = `You are an SAP functional consultant analyzing a customer development request.

Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}

Customer Notes / Description:
${customerContent || '(see attached documents)'}

${docNote}

Based on ALL the information above and the document content provided, produce a structured analysis in ${langName} with the following sections. Use only bullet points — do not use sub-headings (###) inside sections.

${sapLiveSection.enabled !== false ? 'Note: the existence of SAP objects in the live SAP system is checked in a separate step that runs after this analysis and is appended below it. Do not write anything about the SAP connection, system access, or whether objects were verified in the system.' : ''}

${sectionBlocks}`;

                  const system = 'You are an SAP functional consultant. Produce a clear, structured analysis in markdown. No code blocks. No preamble. Never say documents are missing — treat all provided blocks as the complete input.';
                  const result = await callClaude({ feature: 'context_analyze', 
                    model: analysisModel, system,
                    messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
                    max_tokens: 3000,
                  }).catch(_ => callClaude({ feature: 'context_analyze',  model: analysisModel, system, messages: [{ role: 'user', content: prompt }], max_tokens: 3000 }));

                  // SAP object verification — only when a live SAP MCP connection is available
                  // and pipeline policy allows MCP at the analyze stage
                  const _analyzeStoredPP  = ssCtx.settings['mcp_adt_pipeline_policy'] ?? {};
                  const _analyzeStage     = { use_mcp: true, include_mcp_rules: false, ...(_analyzeStoredPP.stages?.analyze ?? {}) };
                  // Live SAP check: make sure the case's SAP connection was tested in this session
                  // (after a reload it hasn't been), so the step is never skipped silently.
                  const wantSapLive = sapLiveSection.enabled !== false && _analyzeStage.use_mcp && (effectiveBaseCheck || caseLiveCheck === true) && caseLiveCheck !== false;
                  const sapHeading = (sapLiveSection.name && !/^SAP Objects in the System/i.test(sapLiveSection.name)) ? sapLiveSection.name : h_sap_objects;
                  let sapSkipReason = null;
                  let connOk = sapConnTest?.ok === true;
                  if (wantSapLive && !connOk) {
                    if (!sapConnCfg) sapSkipReason = lang === 'es' ? 'no hay un ambiente SAP configurado para este caso o proyecto' : 'no SAP environment is set up for this case or project';
                    else {
                      const r = await testSapConnection();
                      connOk = r?.ok === true;
                      if (!connOk) sapSkipReason = (lang === 'es' ? 'la conexión SAP falló: ' : 'the SAP connection failed: ') + (r?.message ?? '');
                    }
                  }
                  const _mcpForAnalyze    = wantSapLive && connOk ? await buildMcpConfig(undefined, { connOk }) : [];
                  if (wantSapLive && connOk && !_mcpForAnalyze.length) sapSkipReason = lang === 'es' ? 'no se pudo preparar el acceso SAP del ambiente' : "the environment's SAP access could not be prepared";
                  const mcpServers        = _analyzeStage.use_mcp ? _mcpForAnalyze : [];
                  const _analyzeRulesNote = _analyzeStage.include_mcp_rules && sapMcpRules ? `\n\n${sapMcpRules}` : '';
                  let fullResult = result;
                  if (mcpServers.length > 0 && result) {
                    try {
                      const sapObjPrompt = `Based on the following analysis of a customer SAP development request, identify the SAP technical objects that matter for THIS requirement and check them in the live system:
- objects named in the customer's request or documents (programs, function modules, BAPIs, tables, structures, classes, CDS views, enhancement spots / BAdIs, transactions, Fiori apps, OData services);
- custom objects (Z*, Y* or a /NAMESPACE/ prefix) mentioned anywhere in the analysis;
- the specific standard objects the solution would read from or extend (e.g. the BAPI, table or business transaction it builds on).
Do NOT check generic development or administration tools that every SAP system has (SE11, SE16, SE24, SE37, SE38, SE80, SE09, SE10, SE93, SCI, ATC, SU01, SU21, SU24, PFCG, STMS, SM30, SM37, SICF, SEGW, /IWFND/*) unless the customer's request is specifically about them.

For each object, use the available SAP tools to check whether it exists in the system. Then produce a section titled:

## ${sapHeading}

Use a markdown table with exactly these columns: Object | Type | Status | Note. Status is "✓ Exists" or "✗ Not found". Keep Type to 1–3 words. Write each Note in ${langName}, under 15 words (e.g. what it is, or what was searched).
Only include objects you actually checked. If no relevant objects are named, write one line saying so.${_analyzeRulesNote}

Analysis to process:
${result}`;
                      const sapObjResult = await callClaude({ feature: 'sap_live_check', 
                        model: analysisModel,
                        system: 'You are an SAP consultant with live system access. Use the SAP tools to verify object existence. Be concise.',
                        messages: [{ role: 'user', content: sapObjPrompt }],
                        max_tokens: 2000,
                        mcp_servers: mcpServers,
                      }).catch(() => null);
                      if (sapObjResult) fullResult = result + '\n\n' + sapObjResult;
                      else sapSkipReason = lang === 'es' ? 'la consulta a SAP no devolvió resultado' : 'the SAP query returned no result';
                    } catch (e) { sapSkipReason = e?.message || 'error'; }
                  }
                  if (wantSapLive && sapSkipReason && result) {
                    fullResult = result + `\n\n## ${sapHeading}\n⚠ ${lang === 'es' ? 'Verificación en vivo no realizada' : 'Live check not run'}: ${sapSkipReason}. ${lang === 'es' ? 'Revise "Conexión SAP en Vivo" y vuelva a analizar.' : 'Check "Live SAP Connection" and analyze again.'}`;
                  }
                  setRequestSummary(fullResult);
                  // The coverage check and the proposal validation were built on the previous summary:
                  // clear them so they are run again (in order) before generating.
                  setSapCheck(null); setProposalCheck(null);
                  await markAnalysisStep('summary', { requestSummary: fullResult, sapCheck: null, proposalCheck: null });
                  analyzeResult = fullResult;
                } catch (e) {
                  setRequestSummaryError(e.message);
                } finally {
                  setRequestSummaryLoading(false);
                }
                return analyzeResult;
              }
              analyzeRef.current = handleAnalyzeRequest;

              const gc = { ...GENERATION_CONTEXT_DEFAULTS, ...(ssCtx.settings["generation_context"] ?? {}) };
              const ctxItems = [
                { key: 'include_client_info',   label: t("gen.ctx_client_info")    || 'Client Info' },
                { key: 'include_sap_profile',   label: t("gen.ctx_sap_profile")    || 'SAP Profile' },
                { key: 'include_case_metadata', label: t("gen.ctx_case_metadata")  || 'Case Metadata' },
                { key: 'include_project_ctx',   label: t("gen.ctx_project_ctx")    || 'Project' },
                { key: 'include_project_docs',  label: t("gen.ctx_project_docs")   || 'Project Docs' },
                { key: 'include_related_cases', label: t("gen.ctx_related_cases")  || 'Related Cases' },
                { key: 'sap_live_check',        label: t("gen.ctx_sap_live_check") || 'Live SAP' },
              ];

              return (
                <div className="space-y-3">
                  {/* Header */}
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-violet-800 mb-1">{t("spec.compiled_ctx_lbl") || "Compiled Context"}</h3>
                    <p className="text-xs text-violet-500">Organised and assembled information that will be sent to the AI before generating specifications</p>
                  </div>

                  {/* Generation Context active settings */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <SectionHeader Icon={SlidersHorizontal} title={t("gen.context_title") || "Generation Context"}
                      detail={`${ctxItems.filter(i => gc[i.key]).length} / ${ctxItems.length} ${L('active', 'activos')}`}
                      open={!genCtxCollapsed} onToggle={() => setGenCtxCollapsed(v => !v)} />
                    {!genCtxCollapsed && <div className="flex flex-wrap gap-1.5 mt-3">
                      {ctxItems.map(({ key, label }) => (
                        <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${gc[key] ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                          {gc[key] ? <Check size={9} className="text-indigo-500" /> : <X size={9} />}
                          {label}
                        </span>
                      ))}
                    </div>}
                  </div>

                  {/* Case metadata — collapsible */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-4">
                      <SectionHeader Icon={FileText} title={L('Case metadata', 'Datos del caso')}
                        open={!metaCollapsed} onToggle={() => {
                          const next = !metaCollapsed;
                          setMetaCollapsed(next);
                          try { localStorage.setItem('genctx2_casemeta_collapsed', JSON.stringify(next)); } catch {}
                        }} />
                    </div>
                    {!metaCollapsed && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3">
                          {staticFields.map(f => (
                            <div key={f.label} className="flex gap-2">
                              <span className="text-xs text-gray-400 w-20 flex-shrink-0">{f.label}</span>
                              <span className="text-xs text-gray-700 font-medium">{f.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <CaseChecksPanel issues={caseChecks} resolved={checksResolved} loading={checksLoading} L={L}
                    canEdit={!specApproved && (auth.isAdmin || isCaseOwner)} needsProject={!caseData.project_id}
                    onRecheck={() => runCaseChecksNow()} onResolve={setCheckResolved} onUnresolve={k => setCheckResolved(k, null)}
                    onRemoveDoc={deleteDocument ? async (i) => {
                      const doc = (documents ?? []).find(d => i.key.endsWith(d.id));
                      if (!doc || !window.confirm(L(`Remove "${doc.file_name}" from this case?`, `¿Quitar "${doc.file_name}" de este caso?`))) return;
                      await deleteDocument(doc.id, doc.file_url);
                      if (refetchDocuments) await refetchDocuments();
                    } : null}
                    onLinkProject={async (pid) => { await onUpdate?.(caseData.id, { project_id: pid }); }} />
                  {analysisStrip()}
                  <RequirementsChecklist requirements={requirements} onChange={saveRequirements}
                    onExtract={() => handleExtractRequirements()} loading={reqLoading === 'extract'} error={reqError}
                    canEdit={canEditReqs()} state={analysisState('requirements')} L={L} lang={lang} who={auth.user?.id ?? null} />
                  {/* Questions for the customer (also its own node) */}
                  <QuestionsPanel questions={questions} onChange={saveQuestions} onExtract={() => handleExtractQuestions()}
                      loading={qLoading} error={qError} canEdit={canEditReqs()} state={analysisState('questions')} L={L} lang={lang}
                      who={{ id: auth.user?.id ?? null, name: auth.profile?.full_name ?? null }} links={qLinks}
                      onSendLink={sendQuestionsLink} onCopyLink={copyQuestionsLink} onRevokeLink={revokeQuestionsLink} copiedId={qCopied} />
                  {/* AI Request Summary */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className={summaryCollapsed ? '' : 'mb-2'}>
                      <SectionHeader Icon={FileText} title={L('Request summary', 'Resumen de la solicitud')}
                        pill={requestSummaryLoading ? L('Analyzing…', 'Analizando…') : requestSummary ? L('Ready', 'Listo') : L('Not run', 'Sin ejecutar')}
                        pillTone={requestSummaryLoading ? 'running' : requestSummary ? 'ok' : 'muted'}
                        open={!summaryCollapsed} onToggle={() => setSummaryCollapsed(v => !v)}
                        actions={[{ Icon: requestSummary ? RefreshCw : Sparkles, title: requestSummary ? L('Analyze again', 'Volver a analizar') : L('Analyze', 'Analizar'),
                          onClick: () => handleAnalyzeRequest(), loading: requestSummaryLoading, disabled: specApproved && !auth.isAdmin, primary: true }]} />
                    </div>
                    {requestSummaryLoading && (
                      <StepRunning button={L('Analyzing…', 'Analizando…')}
                        message={L('Analyzing the request and the case documents — this may take a minute…', 'Analizando la solicitud y los documentos del caso — puede tardar un minuto…')} />
                    )}
                    {!summaryCollapsed && !requestSummary && !requestSummaryLoading && !requestSummaryError && (
                      <p className="text-xs text-gray-400 italic">
                        Click <span className="font-semibold text-violet-600">Analyze</span> to extract a summary of what the customer is requesting and key considerations (reads attached documents).
                      </p>
                    )}
                    {requestSummaryError && (
                      <p className="text-xs text-red-500">{requestSummaryError}</p>
                    )}
                    {!summaryCollapsed && requestSummary && !requestSummaryLoading && (
                      <div className="overflow-y-auto max-h-[420px]">
                        <MarkdownAccordion text={requestSummary} defaultAllOpen />
                      </div>
                    )}
                  </div>

                  {/* Compiled context — collapsible */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-4">
                      <SectionHeader Icon={Code2} title={L('Compiled AI context', 'Contexto compilado para la IA')}
                        pill={compiledCtxLoading ? L('Loading…', 'Cargando…') : compiledCtxPreview ? L('Ready', 'Listo') : L('Not loaded', 'Sin cargar')}
                        pillTone={compiledCtxLoading ? 'running' : compiledCtxPreview ? 'ok' : 'muted'}
                        open={!ctxCollapsed} onToggle={() => setCtxCollapsed(v => !v)}
                        actions={[{ Icon: RefreshCw, title: compiledCtxPreview ? L('Refresh the context', 'Actualizar el contexto') : L('Load the context', 'Cargar el contexto'),
                          onClick: () => handleBuildCtx(), loading: compiledCtxLoading, primary: true }]} />
                    </div>
                    {!ctxCollapsed && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
                        {compiledCtxLoading && (
                          <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400"><Spinner /><span>Loading context from enabled sources…</span></div>
                        )}
                        {!compiledCtxPreview && !compiledCtxLoading && (
                          <div className="pt-3">
                            <p className="text-xs text-gray-400 italic mb-2">Context from Client Info, SAP Profile, Project, Related Cases — based on your Generation Context settings.</p>
                            <button onClick={handleBuildCtx}
                              className="px-3 py-1 text-xs font-semibold bg-gray-700 text-white rounded-lg hover:bg-gray-800">
                              Load Context
                            </button>
                          </div>
                        )}
                        {compiledCtxPreview && !compiledCtxLoading && (() => {
                          // Build a display-only version: exclude full doc content and related cases (shown below as cards)
                          const gcDisp = { ...GENERATION_CONTEXT_DEFAULTS, ...(ssCtx.settings["generation_context"] ?? {}) };
                          const textOnly = buildContextString(caseData, gcDisp, {
                            ...(compiledCtxExtra ?? {}),
                            projectDocs:   undefined,
                            relatedCases:  undefined,
                          }).trim();

                          const docs    = compiledCtxExtra?.projectDocs   ?? [];
                          const related = compiledCtxExtra?.relatedCases  ?? [];

                          return (
                            <div className="mt-3 space-y-2">
                              {/* Text-based context lines */}
                              {textOnly ? (
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3 border border-gray-100">{textOnly}</pre>
                              ) : null}

                              {/* Project Documents — checklist */}
                              {gcDisp.include_project_docs && (
                                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Project Documents</p>
                                  {docs.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">{L('This project has no reference documents. Add them in the project (Documents tab) to give the AI project-wide context.', 'Este proyecto no tiene documentos de referencia. Agrégalos en el proyecto (pestaña Documentos) para dar contexto general a la IA.')}</p>
                                  ) : (
                                    <ul className="space-y-3">
                                      {docs.map((d, i) => {
                                        const summary = docSummaries[d.name];
                                        return (
                                          <li key={i} className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                              {d.text
                                                ? <Check size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                                : <AlertTriangle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />}
                                              <span className="text-xs font-semibold text-gray-700">{d.name}</span>
                                              {d.type && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1">{d.type}</span>}
                                              <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{d.text ? `${Math.round(d.text.length / 1000)}k chars` : L('could not be read — not sent to the AI', 'no se pudo leer — no se envía a la IA')}</span>
                                            </div>
                                            <div className="ml-4 text-[11px] text-gray-500 leading-snug">
                                              {summary
                                                ? summary
                                                : d.text
                                                  ? <span className="flex items-center gap-1 text-gray-400 italic"><Spinner /><span>Summarizing…</span></span>
                                                  : <span className="text-gray-400 italic">Binary file — content not extractable as text</span>
                                              }
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              )}

                              {/* Related Cases — card list */}
                              {gcDisp.include_related_cases && (
                                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Related Cases</p>
                                  {related.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No related cases found for this client & SAP module.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {related.map((c, i) => (
                                        <li key={i} className="flex flex-col gap-0.5 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-700">{c.title}</span>
                                            {c.area_sap && <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1">{c.area_sap}</span>}
                                            <span className={`ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${c.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : c.status === 'cancelled' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>{cap(c.status ?? '')}</span>
                                          </div>
                                          {c.description && (
                                            <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{c.description}</p>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Additional Considerations — persisted per case */}
                        <div className="pt-1 border-t border-gray-100 mt-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            Additional Considerations
                          </label>
                          <p className="text-xs text-gray-400 mb-2">Extra notes or constraints sent to the AI before generating specs. Saved automatically per case.</p>
                          <textarea
                            value={additionalCtx}
                            onChange={e => setAdditionalCtx(e.target.value)}
                            onBlur={e => saveAdditionalCtx(e.target.value)}
                            rows={4}
                            placeholder="e.g. This customer uses a custom pricing engine in SD. Do not suggest standard condition types. The Go-Live is fixed for Q1 2027…"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs resize-y focus:outline-none focus:border-indigo-400 bg-white"
                          />
                          {additionalCtxSaving && <p className="text-[10px] text-gray-400 mt-0.5">Saving…</p>}
                        </div>

                      </div>
                    )}
                  </div>

                  {!specApproved && !sapCheck && (
                    <div className="flex justify-end">
                      <button onClick={() => setActiveNode(1)}
                        className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                        {t("spec.ai_check_btn")} →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Node 7: Questions for the customer (sub-item of the analysis) ── */}
            {activeNode === 7 && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1">
                  <div className="text-sm font-semibold text-gray-800">{L('Questions for the customer', 'Preguntas para el cliente')}</div>
                  <p>{L('Contradictions, ambiguities and missing information found in the documents. Send the open ones to the customer: they get a link to answer without logging in, and the customer users of the case also see them in the app, in My reviews. Answers come back here automatically and are used when generating; open questions become stated assumptions in the spec.',
                        'Contradicciones, ambigüedades e información faltante encontradas en los documentos. Envíe las abiertas al cliente: recibe un enlace para responder sin iniciar sesión, y los usuarios del cliente en el caso también las ven en la aplicación, en Mis revisiones. Las respuestas vuelven aquí solas y se usan al generar; las preguntas abiertas quedan como supuestos en la spec.')}</p>
                </div>
                  <QuestionsPanel questions={questions} onChange={saveQuestions} onExtract={() => handleExtractQuestions()}
                    loading={qLoading} error={qError} canEdit={canEditReqs()} state={analysisState('questions')} L={L} lang={lang}
                    who={{ id: auth.user?.id ?? null, name: auth.profile?.full_name ?? null }} links={qLinks}
                    onSendLink={sendQuestionsLink} onCopyLink={copyQuestionsLink} onRevokeLink={revokeQuestionsLink} copiedId={qCopied} />
              </div>
            )}

            {/* ── Node 1: SAP Verification ── */}
            {activeNode === 1 && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("spec.ai_step1_h")}</h3>
                  <p className="text-xs text-gray-500">{t("spec.ai_step1_desc")}</p>
                </div>

                {!sapCheck && !stepLoading && !specApproved && (
                  <div className="text-center py-4">
                    <button onClick={() => handleSapCheck()}
                      className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.ai_check_btn")}
                    </button>
                  </div>
                )}
                {!sapCheck && !stepLoading && specApproved && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} className="flex-shrink-0" />
                    <span>{t("spec.skipped")}</span>
                  </div>
                )}

                {stepLoading && aiStep === 1 && (
                  <StepRunning button={L('Checking…', 'Verificando…')}
                    message={L('Checking standard SAP coverage against the case documents — this may take a minute…', 'Verificando la cobertura del estándar SAP con los documentos del caso — puede tardar un minuto…')} />
                )}

                {sapCheck && !stepLoading && !specApproved && (
                  <div className="flex justify-end">
                    <button onClick={() => handleSapCheck()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                      <RefreshCw size={12} />{L('Run again', 'Volver a ejecutar')}
                    </button>
                  </div>
                )}
                {sapCheck && !stepLoading && (
                  <div className={`border rounded-xl p-4 space-y-3 ${cc[0]} ${cc[1]}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${cc[3]}`}>
                        {sapCheck.coverage === 'full' ? <><Check size={11} className="inline mr-1 text-emerald-600" />{t("spec.sap_full")}</> :
                         sapCheck.coverage === 'partial' ? <><AlertTriangle size={11} className="inline mr-1 text-amber-500" />{t("spec.sap_partial")}</> :
                         <><X size={11} className="inline mr-1 text-red-500" />{t("spec.sap_none")}</>}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cc[1]} ${cc[2]} uppercase`}>{({ full: L("Full", "Total"), partial: L("Partial", "Parcial"), none: L("None", "Ninguna") }[sapCheck.coverage] ?? sapCheck.coverage)}</span>
                    </div>
                    <p className={`text-sm ${cc[2]}`}>{sapCheck.summary}</p>
                    {(sapCheck.standard_transactions ?? []).length > 0 && (
                      <div>
                        <p className={`text-xs font-semibold mb-1 ${cc[3]}`}>{t("spec.sap_txns")}</p>
                        <ul className={`text-xs space-y-0.5 ${cc[2]}`}>
                          {sapCheck.standard_transactions.map((tx, i) => <li key={i} className="flex gap-1"><span>•</span><span>{tx}</span></li>)}
                        </ul>
                      </div>
                    )}
                    {(sapCheck.gaps ?? []).length > 0 && (
                      <div>
                        <p className={`text-xs font-semibold mb-1 ${cc[3]}`}>{t("spec.sap_gaps")}</p>
                        <ul className={`text-xs space-y-0.5 ${cc[2]}`}>
                          {sapCheck.gaps.map((g, i) => <li key={i} className="flex gap-1"><span>→</span><span>{g}</span></li>)}
                        </ul>
                      </div>
                    )}
                    {sapCheck.recommendation && (
                      <p className={`text-xs italic border-t pt-2 ${cc[1]} ${cc[2]}`}>{sapCheck.recommendation}</p>
                    )}
                    {!specApproved && (
                      <div className="flex gap-3 justify-between items-center pt-1">
                        <button onClick={() => handleSapCheck()} className={`text-xs underline ${cc[2]}`}>{t("spec.rerun_check")}</button>
                        <button onClick={() => setActiveNode(2)}
                          className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                          {t("spec.continue_step2")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Node 2: Proposal Validation ── */}
            {activeNode === 2 && (
              <div className="space-y-4">
                {sapCheck && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${cc[0]} ${cc[1]} ${cc[2]}`}>
                    <span className="font-semibold">{t("spec.step1_badge")}</span>
                    <span>{t("spec.coverage_lbl")} <span className="font-bold uppercase">{({ full: L("Full", "Total"), partial: L("Partial", "Parcial"), none: L("None", "Ninguna") }[sapCheck.coverage] ?? sapCheck.coverage)}</span></span>
                    <span className="ml-auto opacity-70">{sapCheck.recommendation}</span>
                  </div>
                )}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("spec.ai_step2_h")}</h3>
                  <p className="text-xs text-gray-500">{t("spec.ai_step2_desc")}</p>
                </div>
                {!proposalCheck && !stepLoading && !specApproved && (
                  <div className="text-center py-4">
                    <button onClick={() => handleProposalValidation()}
                      className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.validate_proposal")}
                    </button>
                  </div>
                )}
                {!proposalCheck && !stepLoading && specApproved && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} className="flex-shrink-0" />
                    <span>{t("spec.skipped")}</span>
                  </div>
                )}
                {stepLoading && aiStep === 2 && (
                  <StepRunning button={L('Validating…', 'Validando…')}
                    message={L('Validating the proposal against the documents and the coverage check — this may take a minute…', 'Validando la propuesta con los documentos y la verificación del estándar — puede tardar un minuto…')} />
                )}
                {proposalCheck && !stepLoading && !specApproved && sapCheck && (
                  <div className="flex justify-end">
                    <button onClick={() => handleProposalValidation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                      <RefreshCw size={12} />{L('Run again', 'Volver a ejecutar')}
                    </button>
                  </div>
                )}
                {proposalCheck && !stepLoading && (
                  <div className={`border rounded-xl p-4 space-y-3 ${proposalCheck.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`text-sm font-bold ${proposalCheck.valid ? 'text-green-800' : 'text-amber-800'}`}>
                        {proposalCheck.valid ? <><Check size={11} className="inline mr-1 text-green-700" />{t("spec.proposal_valid")}</> : <><AlertTriangle size={11} className="inline mr-1 text-amber-800" />{t("spec.proposal_warn")}</>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${riskColor[proposalCheck.risk_level] ?? riskColor.medium}`}>
                          {t("spec.risk_lbl")} {proposalCheck.risk_level ?? 'medium'}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                          {t("spec.score_lbl")} {proposalCheck.score}/10
                        </span>
                      </div>
                    </div>
                    {(proposalCheck.strengths ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-700 mb-1">{t("spec.strengths")}</p>
                        <ul className="text-xs text-green-700 space-y-0.5">
                          {proposalCheck.strengths.map((s, i) => <li key={i} className="flex gap-1"><Check size={11} /><span>{s}</span></li>)}
                        </ul>
                      </div>
                    )}
                    {(proposalCheck.concerns ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-700 mb-1">{t("spec.concerns")}</p>
                        <ul className="text-xs text-amber-700 space-y-0.5">
                          {proposalCheck.concerns.map((c, i) => <li key={i} className="flex gap-1"><AlertTriangle size={11} /><span>{c}</span></li>)}
                        </ul>
                      </div>
                    )}
                    {proposalCheck.recommendation && (
                      <p className={`text-xs italic border-t pt-2 ${proposalCheck.valid ? 'border-green-200 text-green-700' : 'border-amber-200 text-amber-700'}`}>
                        {proposalCheck.recommendation}
                      </p>
                    )}
                    {!specApproved && (
                      <div className="flex gap-3 justify-between items-center pt-1">
                        <button onClick={() => handleProposalValidation()}
                          className={`text-xs underline ${proposalCheck.valid ? 'text-green-700' : 'text-amber-700'}`}>{t("spec.revalidate")}</button>
                        <button onClick={() => setActiveNode(3)}
                          className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                          {t("spec.generate_spec")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Node 3: Generate Specification ── */}
            {activeNode === 3 && (
              <div className="space-y-4">
                {/* Analysis accordion */}
                {(sapCheck || proposalCheck) && !viewingProto && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => setAnalysisOpen(p => !p)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700">
                      <span>{t("spec.analysis_results")}</span>
                      <span className="text-gray-400 text-xs">{analysisOpen ? t("spec.hide") : t("spec.show")}</span>
                    </button>
                    {analysisOpen && (
                      <div className="p-4 space-y-4 border-t border-gray-200">
                        {sapCheck && (
                          <div className={`border rounded-xl p-3 space-y-2 ${cc[0]} ${cc[1]}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500 uppercase">{t("spec.ai_step1_h")}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase ${cc[1]} ${cc[2]}`}>{sapCheck.coverage}</span>
                            </div>
                            <p className={`text-xs ${cc[2]}`}>{sapCheck.summary}</p>
                            {(sapCheck.standard_transactions??[]).length > 0 && (
                              <div>
                                <p className={`text-xs font-semibold mb-0.5 ${cc[3]}`}>{t("spec.sap_txns_short")}</p>
                                <ul className={`text-xs space-y-0.5 ${cc[2]}`}>{sapCheck.standard_transactions.map((tx,i)=><li key={i} className="flex gap-1"><span>•</span><span>{tx}</span></li>)}</ul>
                              </div>
                            )}
                            {(sapCheck.gaps??[]).length > 0 && (
                              <div>
                                <p className={`text-xs font-semibold mb-0.5 ${cc[3]}`}>{t("spec.sap_gaps_short")}</p>
                                <ul className={`text-xs space-y-0.5 ${cc[2]}`}>{sapCheck.gaps.map((g,i)=><li key={i} className="flex gap-1"><span>→</span><span>{g}</span></li>)}</ul>
                              </div>
                            )}
                            {sapCheck.recommendation && <p className={`text-xs italic border-t pt-1 ${cc[1]} ${cc[2]}`}>{sapCheck.recommendation}</p>}
                          </div>
                        )}
                        {proposalCheck && (
                          <div className={`border rounded-xl p-3 space-y-2 ${proposalCheck.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-500 uppercase">{t("spec.ai_step2_h")}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${proposalCheck.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                {proposalCheck.valid ? t("spec.prop_valid") : t("spec.prop_concerns")}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${riskColor[proposalCheck.risk_level]??riskColor.medium}`}>{t("spec.risk_lbl")} {({ low: L("low", "bajo"), medium: L("medium", "medio"), high: L("high", "alto") }[proposalCheck.risk_level] ?? proposalCheck.risk_level)}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 font-bold">{t("spec.score_lbl")} {proposalCheck.score}/10</span>
                            </div>
                            {(proposalCheck.strengths??[]).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-green-700 mb-0.5">{t("spec.strengths")}</p>
                            <ul className="text-xs text-green-700 space-y-0.5">{proposalCheck.strengths.map((s,i)=><li key={i} className="flex gap-1"><Check size={11} /><span>{s}</span></li>)}</ul>
                              </div>
                            )}
                            {(proposalCheck.concerns??[]).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-amber-700 mb-0.5">{t("spec.concerns")}</p>
                                <ul className="text-xs text-amber-700 space-y-0.5">{proposalCheck.concerns.map((c,i)=><li key={i} className="flex gap-1"><AlertTriangle size={11} /><span>{c}</span></li>)}</ul>
                              </div>
                            )}
                            {proposalCheck.recommendation && <p className={`text-xs italic border-t pt-1 ${proposalCheck.valid ? 'border-green-200 text-green-700' : 'border-amber-200 text-amber-700'}`}>{proposalCheck.recommendation}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Generate button */}
                {!aiSpecA && !aiSpecB && !aiSpecC && !generatingSpecs && !viewingProto && !specApproved && (
                  <div className="text-center py-6">
                    {/* Warning when analysis steps were skipped */}
                    {!sapCheck && !proposalCheck && (
                      <div className="mb-4 text-left bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                        <_LAlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-800">{t("spec.skipped_warning_title")}</p>
                          <p className="text-xs text-amber-700 mt-0.5">{t("spec.skipped_warning_desc")}</p>
                          <button onClick={() => setActiveNode(1)}
                            className="mt-1.5 text-xs font-semibold text-amber-700 underline underline-offset-2">
                            {t("spec.run_step1_link")} →
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-7 h-7 text-blue-600" />
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{t("spec.gen_three_desc")}</p>
                    <div className="flex flex-wrap justify-center gap-4 mb-5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/><strong>A</strong> — {t("spec.opt_a")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"/><strong>B</strong> — {t("spec.opt_b")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block"/><strong>C</strong> — {t("spec.opt_c")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block"/><strong>D</strong> — {t("spec.opt_d")}</span>
                      {activeProfile?.prototype_enabled && (
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/>+ {t("spec.opt_proto")}</span>
                      )}
                    </div>
                    <button onClick={() => handleGenerateSpecs()}
                      className="px-6 py-3 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.gen_all_three")}
                    </button>
                  </div>
                )}

                {generatingSpecs && !viewingProto && (
                  <div className="py-8 px-4 space-y-3">
                    <p className="text-xs text-gray-500 text-center mb-4">{t("spec.gen_all_loading")}</p>
                    {[
                      { key: 'a', label: t("spec.opt_a"), dot: 'bg-amber-400' },
                      { key: 'b', label: t("spec.opt_b"), dot: 'bg-green-400' },
                      { key: 'c', label: t("spec.opt_c"), dot: 'bg-purple-400' },
                      { key: 'd', label: t("spec.opt_d"), dot: 'bg-teal-500' },
                      ...(activeProfile?.prototype_enabled ? [{ key: 'proto', label: t("spec.opt_proto"), dot: 'bg-blue-500' }] : []),
                    ].map(({ key, label, dot }) => {
                      const st = specStatuses[key];
                      const err = specErrors[key];
                      return (
                        <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                          st === 'done'      ? 'border-green-200 bg-green-50'
                          : st === 'error'   ? 'border-red-200 bg-red-50'
                          : st === 'generating' ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-200 bg-gray-50'
                        }`}>
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                          <span className="font-semibold text-xs uppercase tracking-wide min-w-[2rem] flex-shrink-0">{key.toUpperCase()}</span>
                          <span className="text-gray-600 flex-1 truncate">{label}</span>
                          <span className="flex-shrink-0 flex items-center gap-1.5">
                            {st === 'generating' && <><div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin flex-shrink-0" /><span className="text-xs text-blue-600">Generating…</span></>}
                            {st === 'done'       && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check size={13}/>Done</span>}
                            {st === 'error'      && <span className="text-xs text-red-600 font-semibold" title={err}>Failed</span>}
                            {st === 'idle'       && <span className="text-xs text-gray-400">Waiting…</span>}
                          </span>
                        </div>
                      );
                    })}
                    {Object.values(specErrors).some(Boolean) && (
                      <div className="mt-2 space-y-1">
                        {Object.entries(specErrors).filter(([,v]) => v).map(([k, msg]) => (
                          <p key={k} className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                            <strong>{k.toUpperCase()}:</strong> {msg}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Retry Failed banner — shown after generation when some specs are missing */}
                {!generatingSpecs && !viewingProto && anySpecExists && SUB.some(s => specHasFailed(s.key)) && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-red-700">
                        {SUB.filter(s => specHasFailed(s.key)).map(s => s.key.toUpperCase()).join(', ')} failed to generate
                      </p>
                      {Object.entries(specErrors).filter(([,v]) => v).map(([k, msg]) => (
                        <p key={k} className="text-xs text-red-500 mt-0.5"><strong>{k.toUpperCase()}:</strong> {msg}</p>
                      ))}
                    </div>
                    <button onClick={handleRetryFailed}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
                      Retry Failed
                    </button>
                  </div>
                )}

                {/* Spec tabs + content */}
                {(aiSpecA || aiSpecB || aiSpecC || aiSpecD || (specApproved && spec?.content)) && !generatingSpecs && !viewingProto && (
                  <div className="space-y-0">
                    <div className="flex border-b border-gray-200">
                      {SUB.map(s => {
                        const hasError = specHasFailed(s.key);
                        return (
                        <button key={s.key} onClick={() => { setSelectedSpec(s.key); setAiContent(s.content); }}
                          className={`flex-1 py-3 px-2 text-sm font-semibold border-b-2 transition-colors text-left flex items-center gap-2 ${
                            selectedSpec === s.key
                              ? hasError ? 'border-red-400 text-red-600 bg-red-50' : 'border-[#1A4B8C] text-blue-600 bg-blue-50'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                          }`}>
                          <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${hasError ? 'bg-red-500' : s.dot}`}>{hasError ? '!' : s.key.toUpperCase()}</span>
                          <span className="truncate">{s.label}</span>
                          {!hasError && regenDiff?.[s.key] && (
                            <span title={L('This version dropped content the previous one had', 'Esta versión perdió contenido que tenía la anterior')}
                              className="text-amber-500 flex-shrink-0"><AlertTriangle size={13} /></span>
                          )}
                          <span className="ml-auto flex-shrink-0">
                            {hasError
                              ? <span className="text-xs text-red-500 font-semibold">Failed</span>
                              : savedSpecUrls[s.key]
                              ? <Check size={13} className="text-green-500" />
                              : <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />}
                          </span>
                        </button>
                        );
                      })}
                    </div>

                    <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs text-gray-500">
                          {selectedSpec === 'a' ? t("spec.opt_a_long") : selectedSpec === 'b' ? t("spec.opt_b_long") : selectedSpec === 'c' ? t("spec.opt_c_long") : selectedSpec === 'd' ? t("spec.opt_d_long") : t("spec.select_above")}
                        </span>
                        <div className="flex gap-2">
                          {!specApproved && (
                            <button onClick={() => setAiEditing(p => !p)}
                              className="px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-white">
                              {aiEditing ? t("spec.preview_lbl") : t("spec.edit_lbl")}
                            </button>
                          )}
                          {canDownloadPdf ? (
                            <button onClick={handleDownloadSpec} disabled={!selectedSpec || downloadingPdf}
                              className="px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-white disabled:opacity-40 flex items-center gap-1">
                              {downloadingPdf ? <><Spinner />&nbsp;PDF…</> : <><Download size={12} />PDF</>}
                            </button>
                          ) : (
                            <span title="Upgrade to download PDFs" className="px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-400 rounded-lg flex items-center gap-1 cursor-not-allowed opacity-50">
                              <Download size={12} />PDF
                            </span>
                          )}
                          {perms.can('regen_specs') && (
                            <button
                              onClick={() => { if (!specApproved) handleGenerateSpecs(); }}
                              disabled={specApproved}
                              title={specApproved ? t("spec.regen_approved_tooltip") : undefined}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                              {t("spec.regen_all")}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-5 max-h-[600px] overflow-y-auto">
                        {selectedSpec && !specHasFailed(selectedSpec) && gateSpecKey() && (
                          <SignoffPanel conditions={signoffConditions()} signoff={signoff} valid={signoffValid()} L={L}
                            canSign={!specApproved && (auth.isAdmin || isCaseOwner)} onSign={() => handleSignoff(true)} onUndo={() => handleSignoff(false)} />
                        )}
                        {selectedSpec && !specHasFailed(selectedSpec) && regenDiff?.[selectedSpec] && (() => {
                          const dd = regenDiff[selectedSpec];
                          const kindName = k => (KIND_LABEL[k] ?? [k, k])[lang === 'es' ? 1 : 0];
                          const h = dd.hours;
                          return (
                            <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                              <div className="flex items-start gap-2">
                                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                <div className="flex-1 font-semibold">
                                  {L('This regeneration dropped content the previous version had — review it before approving.', 'Esta regeneración perdió contenido que tenía la versión anterior — revísela antes de aprobar.')}
                                </div>
                                {!specApproved && (
                                  <button onClick={async () => {
                                      const next = { ...regenDiff }; delete next[selectedSpec]; setRegenDiff(next);
                                      try { await saveAiNotesPatch({ regenDiff: next , hoursOverrides, scenarioCount: docScenariosRef.current }); } catch (_) {}
                                    }}
                                    className="flex-shrink-0 px-2 py-0.5 rounded-md border border-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-semibold">
                                    {L('Reviewed', 'Revisado')}
                                  </button>
                                )}
                              </div>
                              {dd.droppedKinds?.length > 0 && (
                                <div><span className="font-semibold">{L('Object types no longer included', 'Tipos de objeto que ya no aparecen')}:</span> {dd.droppedKinds.map(kindName).join(', ')}</div>
                              )}
                              {dd.droppedObjects?.length > 0 && (
                                <div><span className="font-semibold">{L('Objects removed', 'Objetos eliminados')}:</span> {dd.droppedObjects.map(o => `${o.name}${o.type ? ` (${o.type})` : ''}`).join(' · ')}</div>
                              )}
                              {dd.prevCount > dd.nextCount && !(dd.droppedObjects?.length) && (
                                <div><span className="font-semibold">{L('Technical objects', 'Objetos técnicos')}:</span> {dd.prevCount} → {dd.nextCount}</div>
                              )}
                              {dd.droppedIds?.length > 0 && (
                                <div><span className="font-semibold">{L('SAP objects no longer mentioned', 'Objetos SAP que ya no se mencionan')}:</span> {dd.droppedIds.join(', ')}</div>
                              )}
                              {h && h.changePct !== null && Math.abs(h.changePct) >= 20 && (
                                <div><span className="font-semibold">{L('Estimated hours', 'Horas estimadas')}:</span> {h.prev.standard} → {h.next.standard} h {L('standard', 'estándar')} ({h.changePct > 0 ? '+' : ''}{h.changePct}%) · Arena {h.prev.arena} → {h.next.arena} h</div>
                              )}
                            </div>
                          );
                        })()}
                        {(selectedSpec === 'a' || selectedSpec === 'c') && !specHasFailed(selectedSpec) && (() => {
                          const k = selectedSpec;
                          const cv = coverageFor(k);
                          const ok2 = k === 'a' ? 'c' : 'a';
                          const otherText = specText(ok2);
                          const ocv = otherText && !specHasFailed(ok2) ? coverageFor(ok2) : null;
                          const other = ocv?.checked ? { label: `Spec ${ok2.toUpperCase()}`, pct: ocv.stats.pct, covered: ocv.stats.covered, total: ocv.stats.total, checked: true, current: ocv.current,
                            onOpen: () => { setSelectedSpec(ok2); setAiContent(otherText); } } : null;
                          return (
                            <>
                              <CoveragePanel stats={cv.stats} checked={cv.checked} current={cv.current} ruleViolations={cv.violations}
                                specLabel={`Spec ${k.toUpperCase()}`} questions={questions} other={other}
                                loading={reqLoading} canEdit={canEditReqs()} L={L}
                                onCheck={() => handleCheckCoverage(k)} onFix={() => handleFixGaps(k)}
                                onAccept={(gk, reason) => setGapAccepted(k, gk, reason)} onUnaccept={gk => setGapAccepted(k, gk, null)} />
                              {reqError && <p className="mb-3 text-xs text-red-500">{reqError}</p>}
                            </>
                          );
                        })()}
                        {(selectedSpec === 'a' || selectedSpec === 'c') && !specHasFailed(selectedSpec) && (
                          <SpecHoursPanel
                            content={selectedSpec === 'a' ? aiSpecA : aiSpecC}
                            opts={hoursOpts()} overrides={hoursOverrides} readOnly={specApproved} L={L}
                            onApply={async (next) => {
                              const calc = withCalculatedHours({ a: aiSpecA, c: aiSpecC, d: aiSpecD }, next);
                              setHoursOverrides(next);
                              if (calc.a) setAiSpecA(calc.a);
                              if (calc.c) setAiSpecC(calc.c);
                              if (calc.d) setAiSpecD(calc.d);
                              const shown = selectedSpec === 'a' ? calc.a : calc.c;
                              if (shown) setAiContent(shown);
                              setSavedSpecUrls(prev => ({ ...prev, a: null, c: null, d: null }));
                              try { await saveAiNotesPatch({ specA: calc.a ?? aiSpecA, specC: calc.c ?? aiSpecC, specD: calc.d ?? aiSpecD, hoursOverrides: next }); } catch (_) {}
                            }} />
                        )}
                        {selectedSpec && specHasFailed(selectedSpec) ? (
                          <div className="flex flex-col items-center py-10 gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                              <span className="text-red-500 text-2xl font-bold">!</span>
                            </div>
                            <p className="text-sm font-semibold text-red-600">Spec {selectedSpec.toUpperCase()} failed to generate</p>
                            {specErrors[selectedSpec] && (
                              <p className="text-xs text-red-600 dark:text-red-400 text-center max-w-xs">{specErrors[selectedSpec]}</p>
                            )}
                            <button onClick={handleRetryFailed}
                              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700">
                              Retry Failed Specs
                            </button>
                          </div>
                        ) : selectedSpec === 'd' && !aiSpecD && !generatingSpecD ? (
                          <div className="flex flex-col items-center py-10 gap-3">
                            <p className="text-sm text-gray-500">{t("spec.d_empty_hint")}</p>
                            <button onClick={handleGenerateSpecD}
                              className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                              {t("spec.gen_d_btn")}
                            </button>
                          </div>
                        ) : selectedSpec === 'd' && generatingSpecD ? (
                          <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                            <Spinner /><span className="text-sm">{t("spec.gen_all_loading")}</span>
                          </div>
                        ) : (
                          (() => {
                            const specText = selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : selectedSpec === 'd' ? aiSpecD : aiSpecA;
                            const displayText = specText || (specApproved ? spec?.content ?? '' : '');
                            return aiEditing && !specApproved ? (
                              <textarea
                                value={specText}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (selectedSpec === 'b') { setAiSpecB(v); setAiContent(v); }
                                  else if (selectedSpec === 'c') { setAiSpecC(v); setAiContent(v); }
                                  else if (selectedSpec === 'd') { setAiSpecD(v); setAiContent(v); }
                                  else { setAiSpecA(v); setAiContent(v); }
                                }}
                                rows={25} className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-y focus:outline-none focus:border-blue-400" />
                            ) : (
                              <MarkdownAccordion text={displayText} />
                            );
                          })()
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 items-center justify-between pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        {selectedSpec ? t("spec.submit_option").replace("{n}", selectedSpec.toUpperCase()).replace("{label}", selectedSpec === 'a' ? t("spec.tab_a") : selectedSpec === 'b' ? t("spec.tab_b") : selectedSpec === 'c' ? t("spec.tab_c") : t("spec.tab_d")) : t("spec.click_tab_select")}
                      </p>
                      <div className="flex gap-2 flex-shrink-0">
                        {!specApproved && (
                          <button onClick={async () => {
                            const content = selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : selectedSpec === 'd' ? aiSpecD : aiSpecA;
                            try { await saveSpec({ mode: 'ai', status: 'draft', content, objects: [], notes: JSON.stringify({ ...(notesRef.current ?? {}), sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD: aiSpecD, selectedSpec, prevMode, analysisCustomerContent, requestSummary, activeProfile, regenDiff , hoursOverrides, scenarioCount: docScenariosRef.current }), title: caseData.title + t("spec.doc_title_suffix") }); await refetch(); } catch (e) { alert(e.message); }
                          }} disabled={!selectedSpec} className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                            {t("spec.save_draft")}
                          </button>
                        )}
                        {!specApproved && (() => {
                          const allSaved = savedSpecUrls.a && savedSpecUrls.b && savedSpecUrls.c && (!aiSpecD || savedSpecUrls.d);
                          return (
                            <button onClick={() => saveAllSpecsAsDocuments(aiSpecA, aiSpecB, aiSpecC, aiSpecD, sapCheck, proposalCheck)}
                              disabled={savingDoc || allSaved || (!aiSpecA && !aiSpecB && !aiSpecC && !aiSpecD)}
                              className={`flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 ${allSaved ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-default' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                              {savingDoc ? t("state.saving") : allSaved ? <><Check size={11} className="mr-1 inline" />{t("spec.pdf_saved3")}</> : <><Paperclip className="w-3 h-3 mr-1" />{t("spec.save_all3")}</>}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Prototype Preview ── */}
                {viewingProto && activeProfile?.prototype_enabled && (
                  <ProtoPanel
                    protoHtmlState={protoHtmlState}
                    setProtoHtmlState={setProtoHtmlState}
                    protoSaved={protoSaved}
                    protoError={protoError}
                    protoErrorMsg={protoErrorMsg}
                    generatingSpecs={generatingSpecs}
                    isRegeneratingProto={protoGenerating}
                    documents={documents}
                    onBack={() => setViewingProto(false)}
                    onRegenerate={activeProfile?.prototype_enabled && (aiSpecC || aiSpecA || aiSpecD) ? async () => {
                      setProtoHtmlState(null);
                      setProtoSaved(false);
                      setProtoError(false);
                      setProtoErrorMsg('');
                      setProtoGenerating(true);
                      const protoStyle = activeProfile.prototype_style ?? 'auto';
                      const resolvedModel = protoModel;
                      console.log('[Prototype] using model:', resolvedModel);
                      try {
                        const _protoSys = 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.';
                        const _protoMsgs = [{ role: 'user', content: buildPrototypePrompt(prototypeSources(), protoStyle) }];
                        let html = await callClaude({ feature: 'prototype',  model: resolvedModel, system: _protoSys, messages: _protoMsgs, max_tokens: 40000 })
                          .catch(e => {
                            if (e.message?.includes('did not match the expected pattern')) {
                              return callClaude({ feature: 'prototype',  model: 'claude-haiku-5-5', system: _protoSys, messages: _protoMsgs, max_tokens: 40000 });
                            }
                            throw e;
                          });
                        if (!html) throw new Error('Model returned empty response');
                        html = sanitizeForJson(html).trim();
                        if (html.startsWith('```')) {
                          const firstNl = html.indexOf('\n');
                          if (firstNl !== -1) html = html.slice(firstNl + 1);
                          const lastFence = html.lastIndexOf('```');
                          if (lastFence !== -1) html = html.slice(0, lastFence).trimEnd();
                        }
                        setProtoHtmlState(html);
                        try {
                          if (deleteDocument && documents?.length) {
                            const old = documents.filter(d => (d.description ?? '').startsWith('[Prototype]') || (d.file_name ?? '').startsWith('Prototype_'));
                            await Promise.all(old.map(d => deleteDocument(d.id, d.file_url).catch(() => {})));
                          }
                          const safeName = (caseData.title ?? 'Case').replace(/[^a-z0-9]/gi, '_');
                          const dateStr = new Date().toISOString().slice(0, 10);
                          const protoFile = new File([html], `Prototype_${safeName}_${dateStr}.html`, { type: 'text/html' });
                          await addDocument(protoFile, '[Prototype] Interactive Prototype');
                          if (refetchDocuments) await refetchDocuments();
                          setProtoSaved(true);
                          if (shareToken?.id) {
                            try {
                              const { data: protoDoc } = await supabase
                                .from('case_documents').select('id')
                                .eq('case_id', caseData.id).like('file_name', 'Prototype_%')
                                .order('created_at', { ascending: false }).limit(1).maybeSingle();
                              if (protoDoc?.id) {
                                const updatedDocIds = { ...(shareToken.doc_ids ?? {}), proto: protoDoc.id };
                                await supabase.from('spec_review_tokens').update({ doc_ids: updatedDocIds }).eq('id', shareToken.id);
                                setShareToken(p => p ? { ...p, doc_ids: updatedDocIds } : p);
                              }
                            } catch (_) {}
                          }
                        } catch (saveErr) { console.warn('Prototype save failed:', saveErr?.message); setProtoError(true); setProtoErrorMsg(`Save failed: ${saveErr?.message}`); }
                      } catch (e) { setProtoError(true); setProtoErrorMsg(`[model: ${resolvedModel}] ${e?.message || 'Unknown error'}`); console.error('Prototype generation error:', resolvedModel, e?.message); }
                      finally { setProtoGenerating(false); }
                    } : null}
                    t={t}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        {showGenModal && (
          <GenerationProfileModal
            onConfirm={(profileKey, resolvedProfile) => { setShowGenModal(false); handleGenerateSpecs({ ...(pendingGenOpts ?? {}), genProfile: resolvedProfile }); }}
            onClose={() => setShowGenModal(false)}
          />
        )}
      </div>
    );
  }

  return null;
}

export { ProjectFieldEditor, STAGE_ICON_MAP, getStageIcon, CaseLifecycleTrack, LifecycleFlowDiagram, renderMarkdown, buildContextString, buildSectionConstraint, buildGenSuffix, GenerationProfileModal, openHtmlInNewTab, SpecificationTab, htmlStringToPdfBlob };
