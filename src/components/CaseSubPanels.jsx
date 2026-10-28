import { useState, useEffect, Fragment } from "react";
import DOMPurify from "dompurify";
import {
  AlertTriangle, Archive, Award, BarChart2, Check, CheckCircle2, ChevronDown, Clock, Code2,
  Copy, Download, ExternalLink, FileText, Flag, FolderOpen, Inbox, Laptop, Link2, ListChecks, Paperclip, Pause, Play,
  RotateCcw, Search, SlidersHorizontal, Sparkles, Star, Target, User,
  UserCheck, Users, Wand2, X, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { usePlanConfig, useSystemSettings, usePermissions } from "../hooks/useSystemSettings.jsx";
import { callClaude, logEvent } from "../lib/utils.js";
import { useCaseDocuments } from "../hooks/useCoreHooks.js";
import { useCaseSpecification } from "../hooks/useNotificationHooks.js";
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

function CaseLifecycleTrack({ stages, currentStatus }) {
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
            <div key={stage.key} className="relative z-10 flex flex-col items-center flex-1 gap-1.5">
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
      if (/^FIELD:/i.test(l)) { const p=l.replace(/^FIELD:\s*/i,'').split('|'); fields.push({label:(p[0]||'').trim(),tech:(p[1]||'').trim(),value:(p[2]||'').trim(),req:(p[3]||'O').trim().toUpperCase()==='R',disp:(p[3]||'O').trim().toUpperCase()==='D'}); return; }
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
      const rows2 = flds.map(f=>`<div style="display:flex;align-items:center;gap:0;margin-bottom:10px"><div style="width:38%;padding-right:12px;text-align:right"><label style="font-size:11.5px;color:#32363a;font-weight:${f.req?'600':'400'}">${esc(f.label)}${f.req?'<span style="color:#bb0000"> *</span>':''}</label></div><div style="width:62%">${f.disp?`<span style="font-size:11.5px;color:#32363a;padding:6px 8px;display:inline-block;border-bottom:1px solid #89919a">${esc(f.value||'—')}</span>`:`<input readonly value="${esc(f.value)}" style="width:90%;max-width:260px;height:30px;border:1px solid #89919a;border-bottom:2px solid #0a6ed1;padding:0 8px;font-size:11.5px;color:#32363a;background:white;border-radius:4px 4px 0 0"/>`}</div></div>`).join('');
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
        <span>Sistema: TechCase-DEV &nbsp;|&nbsp; Mandante: 100</span>
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
    const hdr = head.map(h=>`<th style="background:var(--ad-card,#e8f0fb);border:1px solid var(--ad-b,#c0cde0);padding:6px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--t-text-accent,#1a3764)">${fmt(h)}</th>`).join('');
    const rows = body.map((row,ri)=>`<tr>${head.map((_,i)=>`<td style="border:1px solid var(--ad-b,#d1dce8);padding:5px 10px;font-size:12px;color:var(--ad-text,inherit);background:${ri%2===0?'var(--ad-panel,white)':'var(--ad-card,#f4f7fc)'}">${fmt(row[i]||'')}</td>`).join('')}</tr>`).join('');
    return `<div style="overflow-x:auto;margin:10px 0"><table style="border-collapse:collapse;width:100%"><thead><tr>${hdr}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
      else lines.push(`(binary file — content not extractable as text)`);
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
                <p className="text-sm text-red-400 font-semibold">{t("spec.proto_error")}</p>
                {protoErrorMsg && <p className="text-xs text-red-300 break-all max-w-xs">{protoErrorMsg}</p>}
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

  // Build MCP servers config for spec generation when SAP MCP server is configured and connection is verified
  function buildMcpConfig(overrideUrl) {
    const effectiveMcpUrl = (overrideUrl || sapConnCfg?.mcp_server_url?.trim() || sapMcpServerUrl).trim();
    if (!effectiveMcpUrl || !sapConnCfg || !sapConnTest?.ok) return [];
    try {
      const token = btoa(JSON.stringify({
        host:     sapConnCfg.host,
        username: sapConnCfg.username,
        password: sapConnCfg.password,
        client:   sapConnCfg.client ?? '100',
        ...(sapConnCfg._vpnProxyUrl ? { proxyUrl: sapConnCfg._vpnProxyUrl } : {}),
      }));
      return [{ type: 'url', url: `${effectiveMcpUrl}/mcp`, name: 'techcase-sap', authorization_token: token }];
    } catch { return []; }
  }
  const { spec, loading: specLoading, saveSpec, refetch } = useCaseSpecification(caseData.id, auth.user?.id);

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
  const [activeNode, setActiveNode]     = useState(0);   // 0=docs 1=sap 2=proposal 3=generate
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
  const [compiledCtxLoading, setCompiledCtxLoading] = useState(false);
  const [requestSummary, setRequestSummary]         = useState(null);
  const [requestSummaryLoading, setRequestSummaryLoading] = useState(false);
  const [requestSummaryError, setRequestSummaryError]     = useState(null);
  const [ctxCollapsed, setCtxCollapsed]             = useState(true);
  const [additionalCtx, setAdditionalCtx]           = useState('');
  const [additionalCtxSaving, setAdditionalCtxSaving] = useState(false);

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

  // ── Document helpers ─────────────────────────────────────────
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function buildDocumentBlocks() {
    const blocks = [];
    for (const doc of (documents ?? [])) {
      const lower = (doc.file_name ?? '').toLowerCase();
      const ext = lower.split('.').pop() ?? '';
      const isPdf  = ext === 'pdf' || (doc.file_type ?? '').includes('pdf');
      const isText = ['txt', 'md', 'csv', 'json'].includes(ext);
      const isHtml = ext === 'html' || ext === 'htm';
      // Types the extract-text API can convert to readable text
      const isExtractable = isText || isHtml || ['docx', 'xlsx', 'xls'].includes(ext);

      if (!isPdf && !isExtractable) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — format not extractable as text]` });
        continue;
      }
      try {
        if (isPdf) {
          const resp = await fetch(doc.file_url);
          const blob = await resp.blob();
          const b64 = await blobToBase64(blob);
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
        } else if (isExtractable) {
          // Use server-side extraction so binary formats (docx) are converted to clean text
          const r = await fetch('/api/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: doc.file_url, fileName: doc.file_name }),
          });
          const { text, warning } = await r.json();
          if (text) {
            blocks.push({ type: 'text', text: `[Document: ${doc.file_name}]\n${text}` });
          } else {
            blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — ${warning ?? 'content empty'}]` });
          }
        }
      } catch (_) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — could not be loaded]` });
      }
    }
    return blocks;
  }

  // Builds ALL doc blocks: case docs + project docs + ABAP standards (all as text, capped at 60k chars total)
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
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const r = await fetch('/api/extract-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: doc.url, fileName: doc.name }),
              signal: ctrl.signal,
            });
            clearTimeout(tid);
            const { text } = r.ok ? await r.json() : {};
            if (text) projBlocks.push({ type: 'text', text: `[Project Document: ${doc.name}]\n${text}` });
          } catch (_) {}
        }
      } catch (_) {}
    }
    // Cap total text across all blocks at 60k chars to avoid Vercel payload/timeout limits
    const all = [...abap.blocks, ...projBlocks, ...caseBlocks];
    let totalChars = 0;
    const capped = [];
    for (const block of all) {
      if (block.type === 'text') {
        const remaining = 60000 - totalChars;
        if (remaining <= 0) break;
        const text = block.text.slice(0, remaining);
        capped.push({ ...block, text });
        totalChars += text.length;
      } else {
        capped.push(block); // PDF blocks pass through (only case PDFs remain as blocks)
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
        const r = await fetch('/api/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, fileName: name.endsWith('.pdf') ? name : name + '.pdf' }),
        });
        const { text } = r.ok ? await r.json() : {};
        if (text) blocks.push({ type: 'text', text: `[ABAP Standards Document: ${name}]\n${text}` });
      } catch (_) {}
    }

    const clientStd  = (ssCtx.settings['abap_standards_client']  ?? {})[clientId]  ?? {};
    const projectStd = (ssCtx.settings['abap_standards_project'] ?? {})[projId]    ?? {};
    const caseStd    = (ssCtx.settings['abap_standards_case']    ?? {})[caseId]    ?? {};
    const std = { globalPrefix:'Z', namespacePrefix:'', objectTypePrefixes:{}, ...clientStd, ...projectStd, ...caseStd };

    const lines = [];
    if (std.globalPrefix)     lines.push(`Global object prefix: ${std.globalPrefix}`);
    if (std.namespacePrefix)  lines.push(`Namespace prefix: ${std.namespacePrefix}`);
    const pfx = std.objectTypePrefixes ?? {};
    const pfxParts = Object.entries(pfx).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`);
    if (pfxParts.length) lines.push(`Object type prefixes — ${pfxParts.join(', ')}`);
    if (std.headerTemplate)   lines.push(`Header template:\n${std.headerTemplate}`);
    if (std.changeLogTemplate) lines.push(`Change-log template: ${std.changeLogTemplate}`);
    if (std.authorId)         lines.push(`Default author ID: ${std.authorId}`);

    const contextText = lines.length
      ? `\n\n## Project ABAP Naming & Coding Standards\nApply these conventions to ALL technical objects proposed:\n${lines.join('\n')}`
      : '';

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
          if(/^FIELD:/i.test(l))  { const p=l.replace(/^FIELD:\s*/i,'').split('|'); fields.push({label:(p[0]||'').trim(),tech:(p[1]||'').trim(),value:(p[2]||'').trim(),req:(p[3]||'O').trim().toUpperCase()==='R',disp:(p[3]||'O').trim().toUpperCase()==='D'}); return; }
          if(/^STEP:/i.test(l))   { steps.push(l.replace(/^STEP:\s*/i,'').trim()); return; }
          if(/^COL:/i.test(l))    { const p=l.replace(/^COL:\s*/i,'').split('|'); cols.push({label:(p[0]||'').trim()}); return; }
          if(/^ROW:/i.test(l))    { rows.push(l.replace(/^ROW:\s*/i,'').split('|').map(v=>v.trim())); return; }
        });
        const sapChr = body=>`<div style="border:1px solid #8fa8cc;border-radius:3px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,0.13)"><div style="background:#1a3764;color:white;padding:5px 10px;font-size:11.5px;font-weight:600">${esc(title||'SAP')}</div><div style="background:#dde4f0;border-bottom:1px solid #b0bbcc;padding:2px 8px;font-size:10px;display:flex;gap:12px">${['Sistema','Editar','Pasar a','Extras','Ayuda'].map(m=>`<span>${m}</span>`).join('')}</div>${body}<div style="background:#dde4f0;border-top:1px solid #b0bbcc;padding:2px 8px;font-size:10px;display:flex;justify-content:space-between"><span>TechCase-DEV | 100</span><span style="color:#006600;font-weight:700">● Listo</span></div></div>`;
        if (isConfig || isConfig) {
          const stps = (steps.length ? steps : ['Acceder a la ruta de customizing indicada','Ejecutar la actividad de configuración']).map((s,i)=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f7"><div style="background:#1a3764;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#1a2a4a;line-height:1.5">${esc(s)}</div></div>`).join('');
          return `<div style="border:1px solid #c8d4e8;border-radius:6px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;margin:14px 0"><div style="background:#1a3764;color:white;padding:7px 14px;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:8px"><span style="background:rgba(255,255,255,0.2);border-radius:3px;padding:1px 6px;font-size:9.5px;font-family:monospace">SPRO</span>${esc(title||'Customizing')}</div><div style="background:#f5f7fc;padding:12px 16px">${stps}</div></div>`;
        }
        if (isFiori || isTxn) {
          const flds = (fields.length ? fields : params.length ? params.map(p=>({...p,tech:'',disp:false})) : [{label:'Campo nuevo',value:'',req:true,tech:'ZFIELD',disp:false}]);
          const rows2 = flds.map(f=>`<div style="display:flex;align-items:center;gap:0;margin-bottom:10px"><div style="width:38%;padding-right:12px;text-align:right"><label style="font-size:11.5px;color:#32363a;font-weight:${f.req?'600':'400'}">${esc(f.label)}${f.req?'<span style="color:#bb0000"> *</span>':''}</label></div><div style="width:62%">${f.disp?`<span style="font-size:11.5px;color:#32363a;padding:6px 8px;display:inline-block;border-bottom:1px solid #89919a">${esc(f.value||'—')}</span>`:`<input readonly value="${esc(f.value)}" style="width:90%;max-width:260px;height:30px;border:1px solid #89919a;border-bottom:2px solid #0a6ed1;padding:0 8px;font-size:11.5px;color:#32363a;background:white;border-radius:4px 4px 0 0"/>`}</div></div>`).join('');
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
  <div class="eyebrow">${esc(eyebrow)}</div>
  <h1>${esc(docTitle)}<br><em>${esc(caseData.title)}</em></h1>
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
      doc.text('Sistema: TechCase-DEV  |  Mandante: 100  |  Usuario: CONSULTOR', L+3, sbY+4);
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
      doc.text('TechCase  ·  ' + t('spec.html_title') + '  ·  ' + (caseData.title ?? '').substring(0, 50), L, 290);
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
      lines.push(`**${t('spec.doc_result_lbl')}:** ${safeProposal.valid ? t('spec.doc_valid') : t('spec.doc_has_concerns')}  |  **${t('spec.risk_lbl').replace(/:$/, '')}:** ${safeProposal.risk_level}  |  **${t('spec.score_lbl').replace(/:$/, '')}:** ${safeProposal.score}/10`);
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
        await Promise.all(oldDocs.map(d => deleteDocument(d.id, d.file_url)));
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
  const canApprove = perms.can('approve_specs');
  const canSubmit  = perms.can('submit_specs');
  const planCfg    = usePlanConfig();
  const userPlan   = planCfg.getUserPlan(auth.user?.id ?? '');
  const canDownloadPdf = auth.isAdmin || auth.isManager || userPlan !== 'free';
  const specApproved = spec?.status === 'approved';

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
          if (nd.activeProfile) setActiveProfile(nd.activeProfile);
          if (nd.protoHtml)    { setProtoHtmlState(nd.protoHtml); setProtoSaved(true); setActiveProfile(p => p ?? { prototype_enabled: true }); }
        } catch (_) {}
      }
      if (spec.content) restoredStep = 3;
      setAiStep(restoredStep);
      const restoredNode = (spec.status === 'approved' || spec.status === 'submitted') ? 4
        : restoredStep === 3 ? 3 : restoredStep === 2 ? 2 : 0;
      setActiveNode(restoredNode);
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

Include 2-6 objects. Use realistic Z-names. Types can be: Report, Function Module, Enhancement, BAdI, User Exit, Form, Smartform, Program, Class, Interface, Workflow, Table, View, Transaction — whatever fits.`;
      const sys1 = 'You are an SAP functional consultant. Respond with ONLY a JSON array, no markdown code blocks, no explanation.';
      const raw = await callClaude({
        model: analysisModel, system: sys1,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 800,
      }).catch(_ => callClaude({ model: analysisModel, system: sys1, messages: [{ role: 'user', content: prompt + wizPdfNote }], max_tokens: 800 }));
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
    const raw = await callClaude({
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
      max_tokens: 1000,
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

| # | Object | Type | Description | Hours |
|---|--------|------|-------------|-------|
| 1 | Z[NAME] | [type] | [description] | [h] |
| | | | **Subtotal** | **[total]** |

## 6. Time Estimation

| Phase | Included Objects | Hours |
|-------|-----------------|-------|
| Analysis & Design | [objects] | [h] |
| Development | [objects] | [h] |
| Unit Testing | [objects] | [h] |
| UAT Support | [objects] | [h] |
| **Total** | | **[total]** |

## 7. SAP Screen Prototype

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

Important: Use realistic Z object names, actual SAP table names (BKPF, BSEG, KNA1, MARA, etc.) for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM and COL lines with actual field names and columns relevant to this case — do NOT leave placeholder bracket text.`;

      const _wiz2PdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const wiz2PdfNote = _wiz2PdfNote ? `\n\n[Reference PDFs: ${_wiz2PdfNote}]` : '';
      const sysSpec = 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template provided.';
      const spec = await callClaude({
        model: analysisModel, system: sysSpec,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 4000,
      }).catch(_ => callClaude({ model: analysisModel, system: sysSpec, messages: [{ role: 'user', content: prompt + wiz2PdfNote }], max_tokens: 4000 }));
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
            extra.projectDocs = extracted.filter(d => d.text);
          })
      );
    }

    if (genCtx.include_related_cases && caseData.client_id && caseData.area_sap) {
      const n = genCtx.related_cases_count ?? 3;
      fetches.push(
        supabase.from("cases")
          .select("title, status, area_sap")
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
    if (caseData.client_id) {
      const [{ data: sapCfgRow }, { data: sapProjEnvRow }, { data: sapCaseEnvRow }] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'sap_integration').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_project_env').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'sap_case_env').maybeSingle(),
      ]);
      const clientSapData = (sapCfgRow?.value ?? {})[caseData.client_id] ?? {};
      const sapEnvs = clientSapData.environments ?? (clientSapData.host ? [clientSapData] : []);
      const selectedEnvId = (sapCaseEnvRow?.value ?? {})[caseData.id]
        ?? (sapProjEnvRow?.value ?? {})[caseData.project_id]
        ?? null;
      const sapCfg = selectedEnvId
        ? (sapEnvs.find(e => e.id === selectedEnvId) ?? sapEnvs[0] ?? null)
        : (sapEnvs[0] ?? null);
      // Per-environment toggle overrides the system-level sap_live_check setting
      const envLiveCheck = sapCfg?.liveCheckOnGenerate;
      const shouldLiveCheck = envLiveCheck !== undefined ? envLiveCheck : genCtx.sap_live_check;
      if (shouldLiveCheck) {
        if (!sapCfg?.host || !sapCfg?.username) {
          throw new Error('SAP live check is enabled but no SAP environment is configured for this case. Configure credentials in SAP Integration settings or disable SAP live check.');
        }
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

    return buildContextString(caseData, genCtx, extra);
  }

  // Load additional context per case from Supabase
  useEffect(() => {
    if (!caseData?.id) return;
    supabase.from('system_settings').select('value').eq('key', 'case_additional_ctx').maybeSingle()
      .then(({ data }) => {
        const val = data?.value ?? {};
        setAdditionalCtx(val[caseData.id] ?? '');
      }).catch(() => {});
  }, [caseData?.id]);

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

      const clientEntry = caseData.client_id ? (allSapCfg[caseData.client_id] ?? {}) : {};
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
    const baseCfg = cfgOverride ?? sapConnCfg;
    if (!baseCfg || sapConnTest === 'testing') return;
    setSapConnTest('testing');
    const lsKey = `sap_test_${caseData.id}`;

    // Auto-refresh tunnel URL from vm_tunnel_registry so a restarted cloudflared never
    // requires a manual settings update before the live check or spec generation.
    // In User VPN mode, always use the latest registry URL (laptop's start-local.sh tunnel).
    let resolvedCfg = baseCfg;
    try {
      const { data } = await supabase
        .from('vm_tunnel_registry')
        .select('tunnel_url')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.tunnel_url) {
        const registeredUrl = data.tunnel_url.replace(/\/$/, '');
        const currentUrl = (baseCfg.mcp_server_url?.trim() || sapMcpServerUrl || '').replace(/\/$/, '');
        const isUserVpn = baseCfg.vpn_mode === 'user';
        // User VPN: always apply registry URL (laptop tunnel may differ from env config)
        // Platform VPN: only update when the URL has actually changed
        if (registeredUrl && (isUserVpn || registeredUrl !== currentUrl)) {
          resolvedCfg = { ...baseCfg, mcp_server_url: registeredUrl };
          setSapConnCfg(resolvedCfg);
        }
      }
    } catch { /* registry lookup is best-effort */ }

    const mcpBase = ((resolvedCfg.mcp_server_url?.trim() || sapMcpServerUrl) || '')
      .replace(/\/mcp\/?$/, '').replace(/\/$/, '').trim();
    try {
      if (mcpBase) {
        // Route through MCP server — server-side, bypasses CORS, uses VM's VPN access
        const r = await fetch(`${mcpBase}/sap-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          setSapConnTest(next);
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        } else {
          const status = r?.status;
          const msg = status === 401 ? 'HTTP 401 — Wrong username, password or client (MANDT).'
            : status === 403 ? 'HTTP 403 — User lacks ADT authorizations.'
            : status === 404 ? 'HTTP 404 — ADT service not active (check SICF).'
            : r?.error || `HTTP ${status || 'error'}`;
          const next = { ok: false, message: msg };
          setSapConnTest(next);
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
          setSapConnTest(next);
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
          setSapConnTest(next);
          try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
        }
      }
    } catch (e) {
      const next = { ok: false, message: e.message };
      setSapConnTest(next);
      try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch {}
    }
  }

  useEffect(() => {
    // Load on mount so the node shows correct status without requiring the user to click it
    if (liveCheckEnabled && !sapConnInfo && !sapConnLoading) loadSapConnInfo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeNode === 5 && liveCheckEnabled && !sapConnInfo && !sapConnLoading) {
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

| # | Object | Type | Description | Hours |
|---|--------|------|-------------|-------|
| 1 | Z[NAME] | [type] | [description] | [h] |
| | | | **Subtotal** | **[total]** |

## 6. Time Estimation

| Phase | Included Objects | Hours |
|-------|-----------------|-------|
| Analysis & Design | [objects] | [h] |
| Development | [objects] | [h] |
| Unit Testing | [objects] | [h] |
| UAT Support | [objects] | [h] |
| **Total** | | **[total]** |

## 7. SAP Screen Prototype

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

Use realistic Z object names, actual SAP table names for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM/COL values.${buildSectionConstraint('spec_a', genProfile)}${buildGenSuffix(genProfile, lang)}`;
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

Use real standard SAP transaction codes and configuration objects for ${caseData.area_sap ?? 'the module'}.${buildSectionConstraint('spec_b', genProfile)}${buildGenSuffix(genProfile, lang)}`;
    }
  }

  function buildSpecCPrompt(customerContent, genProfile, contextStr = '', isModCase = false) {
    const modNote = isModCase ? '\nIMPORTANT: This is a MODIFICATION of an existing ABAP object. The existing source code is in context. Reference the existing object name exactly and describe what lines/logic will be changed, not a new development.' : '';
    return `Write Option C: Customer Proposal As-Is Functional Specification for this case.${modNote}

This option formalizes EXACTLY what the customer proposed, without any AI alternatives or suggestions. Do NOT add any SAP standard alternatives or custom dev recommendations — this is a direct formalization of the customer's own technical proposal.

CRITICAL CONSTRAINTS — STRICT AS-IS RULE:
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

| # | Object | Type | Description | Hours |
|---|--------|------|-------------|-------|
| 1 | Z[NAME] | [type] | [description per customer proposal] | [h] |
| | | | **Subtotal** | **[total]** |

## 5. Time Estimation

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

Use realistic Z object names matching the customer's described solution for ${caseData.area_sap ?? 'the module'}. Fill in real field/column values based on the proposal.${buildSectionConstraint('spec_c', genProfile)}${buildGenSuffix(genProfile, lang)}`;
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

| Phase | Hours |
|-------|-------|
| Requirements Analysis | [h] |
| Design | [h] |
| Development | [h] |
| Unit Testing | [h] |
| Functional Testing | [h] |
| **Total** | **[total]** |
${buildSectionConstraint('spec_d', genProfile)}${buildGenSuffix(genProfile, lang)}`;
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

| Phase | Hours |
|-------|-------|
| Requirements Analysis | [h] |
| Design | [h] |
| Development | [h] |
| Unit Testing | [h] |
| Functional Testing | [h] |
| **Total** | **[total — must match Option C total]** |
${buildSectionConstraint('spec_d', genProfile)}${buildGenSuffix(genProfile, lang)}`;
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

  function buildPrototypePrompt(specA, specB, style) {
    const safeA     = sanitizeForJson(specA);
    const safeB     = sanitizeForJson(specB);
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

Spec A (Custom ABAP approach):
${safeA.slice(0, 6000)}

Spec B (Standard SAP approach):
${safeB.slice(0, 4000)}

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
- Disclaimer bar (⚠ non-functional notice), SAP blue shellbar, toolbar with mode + status toggles + Grabar button, tab strip with real SAP tabs, split layout (ALV grid left + detail panel right), F4 modal with search, fields spec table at bottom, toast notifications
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

Spec A (Custom ABAP approach):
${safeA.slice(0, 6000)}

Spec B (Standard SAP approach):
${safeB.slice(0, 4000)}

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
1. Disclaimer bar: ⚠ <b>Prototipo no funcional</b> — simulates [transaction code(s) from spec]. Covers CU1–CU[N] from the spec.
2. Shell bar: background #0854a0, white text, 10px 16px padding, flex space-between. Left: app/module title. Right: transaction code + document number + company name (sample data).
3. Toolbar: background white, border-bottom 1px #b9b9b9, padding 8px 16px, flex row with gap. Include relevant mode toggles (e.g. Display/Change, Create vs Edit vs View, relevant status toggles) as button groups. Include a 💾 Grabar button that triggers a toast.
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
- 💾 Grabar: shows toast "Grabar — simulado. En un caso real, dispara [relevant BAPI/FM from spec]."
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

Spec A (Custom ABAP approach):
${safeA.slice(0, 6000)}

Spec B (Standard SAP approach):
${safeB.slice(0, 4000)}

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

  async function handleGenerateSpecs({ autoSubmit = false, genProfile = null } = {}) {
    if (!genProfile) {
      // Show profile picker modal; actual generation runs after modal confirm
      setPendingGenOpts({ autoSubmit });
      setShowGenModal(true);
      return;
    }
    setGeneratingSpecs(true);
    setAiError(null);
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
      const contextStr = _baseCtx + summaryCtx + additionalCtxStr;
      const hasLiveSap = contextStr.includes('SAP Live System:');
      const isModCase  = contextStr.includes('Existing ABAP Object Source');
      const sysLiveNote = hasLiveSap
        ? ' Use the live SAP system data (release, software components, capabilities) provided in context to write accurate technical details.'
        : '';
      // Refresh tunnel URL from registry before building MCP config so a restarted
      // cloudflared tunnel doesn't cause spec generation to fail with stale URL
      let freshMcpUrl = null;
      try {
        const { data: regRow } = await supabase
          .from('vm_tunnel_registry').select('tunnel_url')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (regRow?.tunnel_url) {
          freshMcpUrl = regRow.tunnel_url.replace(/\/$/, '');
          setSapConnCfg(prev => prev ? { ...prev, mcp_server_url: freshMcpUrl } : prev);
        }
      } catch { /* best-effort */ }
      const _specsStoredPP     = ssCtx.settings['mcp_adt_pipeline_policy'] ?? {};
      const _specsStage        = { use_mcp: true, include_mcp_rules: true, include_capabilities: false, ...(_specsStoredPP.stages?.specs ?? {}) };
      const _allMcpServers     = buildMcpConfig(freshMcpUrl);
      const mcpServers         = _specsStage.use_mcp ? _allMcpServers : [];
      const mcpNote = mcpServers.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
      const mcpRulesNote = (mcpServers.length && _specsStage.include_mcp_rules && sapMcpRules) ? `\n\n${sapMcpRules}` : '';
      const callSpec = async (rawPrompt, extraBlocks = []) => {
        const prompt = sanitizeForJson(rawPrompt);
        const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${sysLiveNote}${mcpNote}${mcpRulesNote}`;
        const allBlocks = [...abap.blocks, ...extraBlocks, ...docBlocks];
        try {
          const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
          return await callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 8000, mcp_servers: mcpServers });
        } catch (e) {
          // If MCP server failed (connection closed / unavailable), retry without MCP
          const isMcpErr = mcpServers.length > 0 && /mcp|connection closed|connection error|listing tools/i.test(e?.message ?? '');
          const fallbackMcp = isMcpErr ? [] : mcpServers;
          return callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content: prompt + pdfNote }], max_tokens: 8000, mcp_servers: fallbackMcp });
        }
      };
      const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
      const abapCtx = sanitizeForJson(abap.contextText);

      // Run all 4 specs independently so each gets its own status/error
      const setSpecStatus = (key, status) => setSpecStatuses(p => ({ ...p, [key]: status }));
      const setSpecError  = (key, msg)    => setSpecErrors(p => ({ ...p, [key]: msg }));

      const runSpec = async (key, promiseFn) => {
        try {
          const result = await promiseFn();
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
      const [specA, specB, specC, specD] = await Promise.all([
        runSpec('a', () => callSpec(buildSpecPrompt(true,  genProfile, genProfile?.spec_a?.technical_objects ? contextStr + abapCtx : contextStr, isModCase))),
        runSpec('b', () => callSpec(buildSpecPrompt(false, genProfile, contextStr, isModCase))),
        specCPromise,
        specCPromise.then(cContent =>
          runSpec('d', () => callSpec(cContent
            ? buildSpecDFromCPrompt(cContent, customerContent, genProfile, contextStr, isModCase)
            : buildSpecDPrompt(customerContent, genProfile, contextStr, isModCase)
          ))
        ),
      ]);

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
      setSelectedSpec(firstKey);
      setAiContent(specA || specB || specC || specD);
      setSavedSpecUrls({ a: null, b: null, c: null, d: null });
      setActiveProfile(genProfile);
      setProtoSaved(false);
      setProtoHtmlState(null);
      setProtoError(false);
      setViewingProto(false);
      const saveStatus = autoSubmit ? 'submitted' : 'draft';
      try {
        await saveSpec({ mode: 'ai', status: saveStatus, content: specA || firstSuccess, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA, specB, specC, specD, selectedSpec: firstKey, prevMode, analysisCustomerContent: customerContent, requestSummary, activeProfile: genProfile }), title: caseData.title + t("spec.doc_title_suffix") });
        logEvent('spec.generated', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { model: genModel } });
      } catch (_) {}
      await saveAllSpecsAsDocuments(specA, specB, specC, specD, sapCheck, proposalCheck);

      // Generate interactive prototype if enabled for this profile
      if (genProfile?.prototype_enabled) {
        setSpecStatus('proto', 'generating');
        try {
          const protoStyle = genProfile.prototype_style ?? 'auto';
          const protoSys = 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.';
          const protoMsgs = [{ role: 'user', content: buildPrototypePrompt(specC || firstSuccess, specC || firstSuccess, protoStyle) }];
          let protoHtml = await callClaude({ model: protoModel, system: protoSys, messages: protoMsgs, max_tokens: 8000 })
            .catch(e => {
              if (e.message?.includes('did not match the expected pattern')) {
                return callClaude({ model: 'claude-haiku-5-5', system: protoSys, messages: protoMsgs, max_tokens: 8000 });
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
    setGeneratingSpecD(true);
    setAiSpecD('');
    try {
      const docBlocks = await buildDocumentBlocks();
      const pdfNames = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name);
      const pdfNote = pdfNames.length > 0 ? `\n\n[Reference PDFs attached: ${pdfNames.join(', ')}]` : '';
      const mcpServersD = buildMcpConfig();
      const mcpNoteD = mcpServersD.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
      const mcpRulesNoteD = mcpServersD.length && sapMcpRules ? `\n\n${sapMcpRules}` : '';
      const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${mcpNoteD}${mcpRulesNoteD}`;
      const callSpec = async (rawPrompt) => {
        const prompt = sanitizeForJson(rawPrompt);
        try {
          const content = docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt;
          return await callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 8000, mcp_servers: mcpServersD });
        } catch (_) {
          return callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content: prompt + pdfNote }], max_tokens: 8000, mcp_servers: mcpServersD });
        }
      };
      const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
      const _baseCtxD = sanitizeForJson(await buildGenContext());
      const contextStr = _baseCtxD + (requestSummary ? `\n\nPRE-ANALYSIS (request summary derived from attached documents):\n${sanitizeForJson(requestSummary)}` : '') + (additionalCtx?.trim() ? `\n\nADDITIONAL CONSIDERATIONS (from consultant):\n${sanitizeForJson(additionalCtx.trim())}` : '');
      const isModCase  = contextStr.includes('Existing ABAP Object Source');
      const specD = await callSpec(
        aiSpecC
          ? buildSpecDFromCPrompt(aiSpecC, customerContent, activeProfile ?? {}, contextStr, isModCase)
          : buildSpecDPrompt(customerContent, activeProfile ?? {}, contextStr, isModCase)
      );
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
          await Promise.all(old.map(d => deleteDocument(d.id, d.file_url)));
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
        await saveSpec({ mode: 'ai', status: spec?.status ?? 'draft', content: aiSpecA || specD, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD, selectedSpec: selectedSpec || 'd', prevMode, analysisCustomerContent, requestSummary, activeProfile }), title: caseData.title + t("spec.doc_title_suffix") });
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
    const mcpServersR = buildMcpConfig();
    const mcpNoteR = mcpServersR.length ? ' You have live SAP access via tools — use sap_read_source to read existing ABAP objects before referencing or modifying them.' : '';
    const mcpRulesNoteR = mcpServersR.length && sapMcpRules ? `\n\n${sapMcpRules}` : '';
    const callSpec = async (rawPrompt, extraBlocks = []) => {
      const prompt = sanitizeForJson(rawPrompt);
      const sys = `You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.${mcpNoteR}${mcpRulesNoteR}`;
      const allBlocks = [...abap.blocks, ...extraBlocks, ...docBlocks];
      try {
        const content = allBlocks.length > 0 ? [...allBlocks, { type: 'text', text: prompt }] : prompt;
        return await callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 8000, mcp_servers: mcpServersR });
      } catch (_) {
        return callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content: prompt + pdfNote }], max_tokens: 8000, mcp_servers: mcpServersR });
      }
    };
    const customerContent = sanitizeForJson(analysisCustomerContent || caseData.description || '');
    const _baseCtxR = sanitizeForJson(await buildGenContext());
    const contextStr = _baseCtxR + (requestSummary ? `\n\nPRE-ANALYSIS (request summary derived from attached documents):\n${sanitizeForJson(requestSummary)}` : '') + (additionalCtx?.trim() ? `\n\nADDITIONAL CONSIDERATIONS (from consultant):\n${sanitizeForJson(additionalCtx.trim())}` : '');
    const abapCtx = sanitizeForJson(abap.contextText);
    const setSpecStatus = (key, status) => setSpecStatuses(p => ({ ...p, [key]: status }));
    const setSpecError  = (key, msg)    => setSpecErrors(p => ({ ...p, [key]: msg }));

    const specMap = {
      a: () => callSpec(buildSpecPrompt(true,  profile, profile?.spec_a?.technical_objects ? contextStr + abapCtx : contextStr)),
      b: () => callSpec(buildSpecPrompt(false, profile, contextStr)),
      c: () => callSpec(buildSpecCPrompt(customerContent, profile, profile?.spec_c?.technical_objects ? contextStr + abapCtx : contextStr)),
      d: () => callSpec(aiSpecC
        ? buildSpecDFromCPrompt(aiSpecC, customerContent, profile, contextStr)
        : buildSpecDPrompt(customerContent, profile, contextStr)),
    };
    const setters = { a: setAiSpecA, b: setAiSpecB, c: setAiSpecC, d: setAiSpecD };
    // Track newly generated values locally so we can persist them after state updates
    const newSpecs = { a: aiSpecA, b: aiSpecB, c: aiSpecC, d: aiSpecD };

    const specKeys = failedKeys.filter(k => k !== 'proto');
    if (mcpServersR.length > 0) {
      // Serialize MCP-backed specs to avoid concurrent tunnel connection failures
      for (const key of specKeys) {
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
        specKeys.map(async key => {
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

    // Persist the updated specs so they survive a logout/reload
    const anyNew = failedKeys.filter(k => k !== 'proto').some(k => newSpecs[k]);
    if (anyNew) {
      try {
        const firstKey = newSpecs.a ? 'a' : newSpecs.b ? 'b' : newSpecs.c ? 'c' : newSpecs.d ? 'd' : (selectedSpec || 'b');
        await saveSpec({
          mode: 'ai', status: spec?.status ?? 'draft',
          content: newSpecs.a || newSpecs.b || newSpecs.c || newSpecs.d,
          objects: [],
          notes: JSON.stringify({ sapCheck, proposalCheck, specA: newSpecs.a, specB: newSpecs.b, specC: newSpecs.c, specD: newSpecs.d, selectedSpec: firstKey, prevMode, analysisCustomerContent, requestSummary, activeProfile: profile }),
          title: caseData.title + t("spec.doc_title_suffix"),
        });
      } catch (_) {}
    }

    // Retry proto if it was also failed
    if (failedKeys.includes('proto') && profile?.prototype_enabled) {
      setSpecStatus('proto', 'generating');
      try {
        const specA = aiSpecA; const specB = aiSpecB;
        const protoSys = 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.';
        const protoMsgs = [{ role: 'user', content: buildPrototypePrompt(specA || aiSpecC, specB || aiSpecD, profile.prototype_style ?? 'auto') }];
        let protoHtml = await callClaude({ model: protoModel, system: protoSys, messages: protoMsgs, max_tokens: 8000 })
          .catch(e => {
            if (e.message?.includes('did not match the expected pattern')) {
              return callClaude({ model: 'claude-haiku-5-5', system: protoSys, messages: protoMsgs, max_tokens: 8000 });
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
    try {
      await saveSpec({
        mode: specMode,
        status: 'submitted',
        content: specContent ?? null,
        objects: specObjects ?? [],
        notes: specMode === 'manual' ? manualNotes : (specMode === 'ai' ? JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD: aiSpecD, selectedSpec, prevMode, analysisCustomerContent, requestSummary, activeProfile }) : null),
        document_ids: specMode === 'manual' ? manualDocIds : [],
        title: caseData.title + t("spec.doc_title_suffix"),
      });
      await refetch();
    } catch (e) { alert(e.message); }
  }

  async function handleSapCheck() {
    setStepLoading(true);
    setAiError(null);
    setSapCheck(null);
    try {
      const docBlocks = await buildAllDocBlocks();
      const customerCtx = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const summaryCtxSap = requestSummary ? `\nRequest Summary (pre-analysis):\n${requestSummary}` : '';
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
"none"    = Custom ABAP development is required — standard SAP cannot satisfy this`;

      const _sapPdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const sapPdfNote = _sapPdfNote ? `\n\n[Reference PDFs: ${_sapPdfNote}]` : '';
      const sysSap = 'You are an SAP senior consultant. Respond ONLY with a valid JSON object, no markdown.';
      const raw = await callClaude({
        model: analysisModel, system: sysSap,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 800,
      }).catch(_ => callClaude({ model: analysisModel, system: sysSap, messages: [{ role: 'user', content: prompt + sapPdfNote }], max_tokens: 800 }));
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { coverage: 'none', summary: raw, standard_transactions: [], gaps: [], recommendation: '' };
      }
      setSapCheck(parsed);
      setActiveNode(1); // show SAP result
      try { await saveSpec({ mode: 'ai', status: 'draft', content: null, objects: [], notes: JSON.stringify({ sapCheck: parsed }), title: caseData.title + t("spec.doc_title_suffix") }); } catch (_) {}
    } catch (e) { setAiError(e.message); }
    setStepLoading(false);
  }

  async function handleProposalValidation() {
    if (!sapCheck) return;
    setStepLoading(true);
    setAiError(null);
    setProposalCheck(null);
    try {
      const docBlocks = await buildAllDocBlocks();
      const customerCtx2 = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const summaryCtxProp = requestSummary ? `\nRequest Summary (pre-analysis):\n${requestSummary}` : '';
      const additionalCtxProp = additionalCtx?.trim() ? `\nAdditional Considerations:\n${additionalCtx.trim()}` : '';
      const prompt = `Validate the proposed custom SAP development for this case.${docBlocks.length > 0 ? '\n\nThe attached documents contain the requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${customerCtx2}${summaryCtxProp}${additionalCtxProp}

Standard SAP coverage analysis already completed:
- Coverage: ${sapCheck.coverage}
- Summary: ${sapCheck.summary}
- Gaps requiring custom dev: ${(sapCheck.gaps ?? []).join('; ') || 'none listed'}

Now validate whether proceeding with custom ABAP development is well-justified, correctly scoped, and technically sound.

Respond with ONLY a valid JSON object, no markdown fences:
{
  "valid": true | false,
  "score": 1-10,
  "risk_level": "low" | "medium" | "high",
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"],
  "recommendation": "2-3 sentences on whether and how to proceed"
}`;

      const _propPdfNote = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name).join(', ');
      const propPdfNote = _propPdfNote ? `\n\n[Reference PDFs: ${_propPdfNote}]` : '';
      const sysProp = 'You are an SAP senior consultant. Validate development proposals. Respond ONLY with a valid JSON object, no markdown.';
      const raw = await callClaude({
        model: analysisModel, system: sysProp,
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 800,
      }).catch(_ => callClaude({ model: analysisModel, system: sysProp, messages: [{ role: 'user', content: prompt + propPdfNote }], max_tokens: 800 }));
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { valid: true, score: 7, risk_level: 'medium', strengths: [], concerns: [], recommendation: raw };
      }
      setProposalCheck(parsed);
      try { await saveSpec({ mode: 'ai', status: 'draft', content: null, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck: parsed }), title: caseData.title + t("spec.doc_title_suffix") }); } catch (_) {}
      setAiStep(3);
      setActiveNode(3); // auto-advance to generate step
    } catch (e) { setAiError(e.message); }
    setStepLoading(false);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await saveSpec({ status: 'approved', approved_by: auth.user?.id, approved_at: new Date().toISOString(), rejected_reason: null });
      await supabase.from('cases').update({ status: 'estimated' }).eq('id', caseData.id);
      logEvent('spec.approved', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, oldValue: { status: 'ai' }, newValue: { status: 'estimated' } });
      await refetch();
      onUpdate?.(caseData.id, { status: 'estimated' });
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
        name:    ssCtx.settings['platform_name']    || 'TechCase',
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
          {!specApproved && <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>}
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
            {!specApproved && <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>}
            <span className="text-sm font-semibold text-gray-700">{t("spec.wiz_step1")}</span>
          </div>

          {(documents ?? []).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">{t("spec.wiz_docs_lbl")}</p>
              <div className="flex flex-col gap-1">
                {documents.map(doc => (
                  <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                    <Paperclip className="w-3 h-3 flex-shrink-0" />
                    <span>{doc.file_name}</span>
                    <span className="text-blue-400">({doc.file_size_kb} KB)</span>
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
                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 flex-shrink-0">
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
        {/* Header + back */}
        <div className="flex items-center gap-2">
          {!specApproved && (
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
            {nodesCollapsed ? '☰ Steps' : '✕ Steps'}
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

              {/* Node 5: Live SAP Connection (only when live check is enabled in settings) */}
              {liveCheckEnabled && (
                <NodeBtn id={5} icon={Zap}
                  title={t("spec.sap_conn_node_lbl")}
                  sub={sapConnLoading ? t("spec.checking")
                    : sapConnInfo?.notFound ? t("spec.sap_conn_not_cfg")
                    : sapConnInfo?.error ? t("spec.sap_conn_not_cfg")
                    : sapConnInfo ? (sapConnInfo.host ?? t("spec.pending"))
                    : t("spec.pending")}
                  status={sapConnLoading ? 'running'
                    : sapConnInfo?.notFound || sapConnInfo?.error ? 'skipped'
                    : sapConnInfo ? 'complete'
                    : 'pending'}
                  isActive={activeNode===5}
                  canClick={true}
                  onClick={() => {
                    setActiveNode(5);
                    if (!sapConnInfo && !sapConnLoading) loadSapConnInfo();
                  }}
                />
              )}

              {/* Node 6: Compiled Context — turns green when analysis results exist */}
              <NodeBtn id={6} icon={Code2}
                title={t("spec.compiled_ctx_lbl") || "Compiled Context"}
                sub={requestSummaryLoading ? (t("spec.checking") || "Analyzing…") : requestSummary ? (t("spec.compiled_ctx_ready") || "Analysis ready") : (t("spec.compiled_ctx_sub") || "Assembled prompt context")}
                status={requestSummaryLoading ? 'running' : (requestSummary || compiledCtxPreview) ? 'complete' : 'pending'}
                isActive={activeNode===6}
                canClick={true}
                onClick={() => setActiveNode(6)}
              />

              {/* Node 1: SAP Verification */}
              <NodeBtn id={1} icon={CheckCircle2}
                title={t("spec.ai_step1_h")}
                sub={sapCheck ? sapCheck.coverage : sapStatus==='running' ? t("spec.checking") : sapStatus==='skipped' ? t("spec.skipped") : t("spec.pending")}
                status={sapStatus}
                isActive={activeNode===1}
                canClick={true}
                onClick={() => setActiveNode(1)}
              />

              {/* Node 2: Proposal Validation */}
              <NodeBtn id={2} icon={Target}
                title={t("spec.ai_step2_h")}
                sub={proposalCheck ? `Score ${proposalCheck.score}/10` : propStatus==='running' ? t("spec.validating") : propStatus==='locked' ? t("spec.locked") : propStatus==='skipped' ? t("spec.skipped") : t("spec.pending")}
                status={propStatus}
                isActive={activeNode===2}
                canClick={propStatus !== 'locked'}
                onClick={() => { if (propStatus !== 'locked') setActiveNode(2); }}
              />

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
            {activeNode === 5 && liveCheckEnabled && (
              <div className="space-y-3">
                <div className="border border-blue-800 rounded-xl p-3 flex items-start gap-2">
                  <Zap className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400">{t("spec.sap_conn_desc")}</p>
                </div>

                {(sapConnLoading || !sapConnInfo) && (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Spinner /><span className="text-sm">{t("spec.checking")}</span>
                  </div>
                )}

                {!sapConnLoading && sapConnInfo?.notFound && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{t("spec.sap_conn_none")}</p>
                  </div>
                )}

                {!sapConnLoading && sapConnInfo?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                    {sapConnInfo.error}
                  </div>
                )}

                {!sapConnLoading && sapConnInfo && !sapConnInfo.notFound && !sapConnInfo.error && (
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
                        <p className="text-xs font-mono text-blue-300 break-all leading-snug">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {!sapConnLoading && sapConnInfo && !sapConnInfo.notFound && !sapConnInfo.error && (
                  <div className="space-y-2">
                    {/* VPN mode badge */}
                    {sapConnCfg?.vpn_mode === 'user' && (
                      <div className="flex items-center gap-1.5 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5">
                        <Laptop className="w-3 h-3 shrink-0" />
                        <span><strong>User VPN mode</strong> — make sure FortiClient is connected and <code className="font-mono">start-local.sh</code> is running on your laptop.</span>
                      </div>
                    )}
                    {/* Test result — only shown after an explicit live test, not the seeded green */}
                    {sapConnTest && sapConnTest !== 'testing' && !sapConnTest.seeded && (
                      <div className={`rounded-xl p-3 flex items-start gap-2 ${sapConnTest.ok ? 'bg-green-950 border border-green-700' : 'bg-red-950 border border-red-700'}`}>
                        {sapConnTest.ok
                          ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${sapConnTest.ok ? 'text-green-400' : 'text-red-400'}`}>
                            {sapConnTest.ok ? t("spec.sap_conn_ok") : t("spec.sap_conn_fail")}
                          </p>
                          {sapConnTest.info && <p className="text-xs text-gray-400 mt-0.5 break-all">{sapConnTest.info}</p>}
                          {sapConnTest.message && <p className="text-xs text-gray-400 mt-0.5 break-all">{sapConnTest.message}</p>}
                        </div>
                      </div>
                    )}

                    {/* Prompt to test if only seeded (no real test run yet) */}
                    {sapConnTest?.seeded && (
                      <p className="text-xs text-gray-500 text-center py-1">Click <strong className="text-gray-300">Test Connection</strong> to retrieve live SAP system data.</p>
                    )}

                    {/* Live data extracted from SAP — shown after a real test */}
                    {sapConnTest && sapConnTest !== 'testing' && sapConnTest.ok && !sapConnTest.seeded && (
                      <div className="rounded-xl overflow-hidden border border-gray-700 divide-y divide-gray-700">
                        {sapConnTest.info && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-1">SAP System</p>
                            <p className="text-xs font-mono text-green-300 break-all leading-snug">{sapConnTest.info}</p>
                          </div>
                        )}
                        {sapConnTest.capabilities?.length > 0 && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-2">ADT Capabilities</p>
                            <div className="flex flex-wrap gap-1">
                              {sapConnTest.capabilities.map((cap, i) => (
                                <span key={i} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700/50 rounded-md px-2 py-0.5">{cap}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {sapConnTest.components?.length > 0 && (
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-none mb-2">Software Components</p>
                            <div className="flex flex-wrap gap-1">
                              {sapConnTest.components.map((comp, i) => (
                                <span key={i} className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded-md px-2 py-0.5 font-mono">{comp}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Action row */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={testSapConnection}
                        disabled={sapConnTest === 'testing'}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          sapConnTest === 'testing'
                            ? 'bg-gray-800 border border-gray-600 text-gray-200'
                            : sapConnTest?.ok
                              ? 'bg-green-900 border border-green-600 text-green-300 hover:bg-green-800'
                              : 'bg-red-900 border border-red-600 text-red-300 hover:bg-red-800'
                        }`}>
                        {sapConnTest === 'testing'
                          ? <><Spinner />{t("spec.sap_conn_testing")}</>
                          : sapConnTest?.ok
                            ? <><CheckCircle2 className="w-3.5 h-3.5" />{t("spec.sap_conn_test_btn")}</>
                            : <><Zap className="w-3.5 h-3.5" />{t("spec.sap_conn_test_btn")}</>}
                      </button>
                      <button onClick={() => setActiveNode(1)}
                        className="px-4 py-2 bg-[#1A4B8C] text-white text-xs font-semibold rounded-xl hover:bg-blue-900">
                        {t("spec.sap_conn_continue")}
                      </button>
                    </div>
                  </div>
                )}

                {!sapConnLoading && sapConnInfo && (sapConnInfo.notFound || sapConnInfo.error) && (
                  <div className="flex justify-end pt-1">
                    <button onClick={() => setActiveNode(1)}
                      className="px-4 py-2 bg-[#1A4B8C] text-white text-xs font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.sap_conn_continue")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Node 4: Approval ── */}
            {activeNode === 4 && (
              <div className="space-y-3">
                {spec?.status === 'approved' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800 text-xs">{t("spec.approved_title")}</p>
                      {spec.approved_at && <p className="text-xs text-green-600 mt-0.5">{t("spec.approved_on").replace("{n}", fmtDate(spec.approved_at))}</p>}
                    </div>
                  </div>
                )}
                {spec?.status === 'submitted' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-800 font-medium">{t("spec.awaiting")}</p>
                  </div>
                )}
                {spec && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-gray-900 text-xs">{spec.title || t("spec.title_fallback")}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${{ submitted:'bg-amber-100 text-amber-700 border border-amber-200', approved:'bg-green-100 text-green-700 border border-green-200', draft:'bg-gray-100 text-gray-600 border border-gray-200' }[spec.status] ?? ''}`}>
                        {t("spec.status_" + spec.status) || cap(spec.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Regenerate is intentionally removed after approval — spec is frozen */}
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
                {/* ── Share with Customer ── */}
                {(() => {
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
                                  : shareStatus === 'changes_requested' ? ('⚠ ' + t("spec.share_status_changes"))
                                  : t("spec.share_link_label")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!hasSpecDocs && !shareToken && (
                            <p className="text-xs text-gray-400">{t("spec.share_no_docs")}</p>
                          )}
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
                })()}

                {spec?.content && (
                  <div className="overflow-y-auto max-h-[520px]">
                    <MarkdownAccordion text={spec.content} />
                  </div>
                )}
                {!spec && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <Award className="w-8 h-8 opacity-40" />
                    <p className="text-xs">{t("spec.approval_pending_desc")}</p>
                  </div>
                )}
              </div>
            )}

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
                              <Paperclip className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
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
                        <div className="flex items-center gap-2 text-xs text-indigo-400 py-1"><Spinner /><span>Loading…</span></div>
                      ) : projDocsForDisplay.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No project documents configured</p>
                      ) : (
                        <div className="space-y-1.5">
                          {projDocsForDisplay.map((doc, i) => {
                            const st = docReadStatus(doc.name ?? doc.file_name, doc.type);
                            return (
                              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-indigo-100">
                                <Paperclip className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
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
                        <div className="flex items-center gap-2 text-xs text-amber-400 py-1"><Spinner /><span>Loading…</span></div>
                      ) : abapDocsForDisplay.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No ABAP standards documents configured for this project</p>
                      ) : (
                        <div className="space-y-1.5">
                          {abapDocsForDisplay.map((doc, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-amber-100">
                              <Paperclip className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
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

                  {!specApproved && (
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

            {/* ── Node 6: Compiled Context Preview ── */}
            {activeNode === 6 && (() => {
              const staticFields = [
                { label: 'Case', value: caseData.title },
                { label: 'SAP Module', value: caseData.area_sap },
                { label: 'Industry', value: caseData.area_industry },
                { label: 'Priority', value: caseData.priority },
                { label: 'Due Date', value: caseData.due_date },
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
                  // Normalise legacy string entries; filter to enabled only
                  const configuredSections = rawSections
                    .map(s => typeof s === 'string' ? { name: s, enabled: true } : s)
                    .filter(s => s.enabled !== false)
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

${sectionBlocks}`;

                  const system = 'You are an SAP functional consultant. Produce a clear, structured analysis in markdown. No code blocks. No preamble. Never say documents are missing — treat all provided blocks as the complete input.';
                  const result = await callClaude({
                    model: analysisModel, system,
                    messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
                    max_tokens: 3000,
                  }).catch(_ => callClaude({ model: analysisModel, system, messages: [{ role: 'user', content: prompt }], max_tokens: 3000 }));

                  // SAP object verification — only when a live SAP MCP connection is available
                  // and pipeline policy allows MCP at the analyze stage
                  const _analyzeStoredPP  = ssCtx.settings['mcp_adt_pipeline_policy'] ?? {};
                  const _analyzeStage     = { use_mcp: true, include_mcp_rules: false, ...(_analyzeStoredPP.stages?.analyze ?? {}) };
                  const _mcpForAnalyze    = buildMcpConfig();
                  const mcpServers        = _analyzeStage.use_mcp ? _mcpForAnalyze : [];
                  const _analyzeRulesNote = _analyzeStage.include_mcp_rules && sapMcpRules ? `\n\n${sapMcpRules}` : '';
                  let fullResult = result;
                  if (mcpServers.length > 0 && result) {
                    try {
                      const sapObjPrompt = `Based on the following analysis of a customer SAP development request, identify every SAP technical object mentioned: custom programs (Z*/Y*), function modules, BAPIs, tables (Z* or standard), classes, enhancement spots, BADIs, transaction codes, and any other named SAP artefacts.

For each identified object, use the available SAP tools to check whether it exists in the system. Then produce a section titled:

## ${h_sap_objects}

With a table or bullet list showing:
- Object name
- Type (program, table, FM, BAPI, class, etc.)
- ✓ Exists / ✗ Not found
- Brief note if relevant (e.g. "enhancement spot already contains 3 implementations")

Only include objects you actually checked. If no technical objects are named in the analysis, write "No named SAP objects found in documents."${_analyzeRulesNote}

Analysis to process:
${result}`;
                      const sapObjResult = await callClaude({
                        model: analysisModel,
                        system: 'You are an SAP consultant with live system access. Use the SAP tools to verify object existence. Be concise.',
                        messages: [{ role: 'user', content: sapObjPrompt }],
                        max_tokens: 2000,
                        mcp_servers: mcpServers,
                      }).catch(() => null);
                      if (sapObjResult) fullResult = result + '\n\n' + sapObjResult;
                    } catch { /* best-effort — proceed without SAP verification */ }
                  }
                  setRequestSummary(fullResult);
                } catch (e) {
                  setRequestSummaryError(e.message);
                } finally {
                  setRequestSummaryLoading(false);
                }
              }

              return (
                <div className="space-y-3">
                  {/* Header */}
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-violet-800 mb-1">{t("spec.compiled_ctx_lbl") || "Compiled Context"}</h3>
                    <p className="text-xs text-violet-500">Organised and assembled information that will be sent to the AI before generating specifications</p>
                  </div>

                  {/* Case metadata */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Case Metadata</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {staticFields.map(f => (
                        <div key={f.label} className="flex gap-2">
                          <span className="text-xs text-gray-400 w-20 flex-shrink-0">{f.label}</span>
                          <span className="text-xs text-gray-700 font-medium">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Request Summary */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Request Summary</h4>
                      {!requestSummaryLoading && (
                        <button onClick={handleAnalyzeRequest}
                          className="px-3 py-1 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {requestSummary ? 'Re-analyze' : 'Analyze'}
                        </button>
                      )}
                      {requestSummaryLoading && (
                        <div className="flex items-center gap-1 text-xs text-violet-500"><Spinner /><span>Analyzing…</span></div>
                      )}
                    </div>
                    {!requestSummary && !requestSummaryLoading && !requestSummaryError && (
                      <p className="text-xs text-gray-400 italic">
                        Click <span className="font-semibold text-violet-600">Analyze</span> to extract a summary of what the customer is requesting and key considerations (reads attached documents).
                      </p>
                    )}
                    {requestSummaryError && (
                      <p className="text-xs text-red-500">{requestSummaryError}</p>
                    )}
                    {requestSummary && !requestSummaryLoading && (
                      <div className="overflow-y-auto max-h-[420px]">
                        <MarkdownAccordion text={requestSummary} defaultAllOpen />
                      </div>
                    )}
                  </div>

                  {/* Compiled context — collapsible */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setCtxCollapsed(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Extra Context (project / SAP / related cases)</h4>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${ctxCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                    {!ctxCollapsed && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
                        <div className="flex justify-end pt-2">
                          {!compiledCtxPreview && !compiledCtxLoading && (
                            <button onClick={handleBuildCtx}
                              className="px-3 py-1 text-xs font-semibold bg-gray-700 text-white rounded-lg hover:bg-gray-800">
                              Fetch Context
                            </button>
                          )}
                          {compiledCtxLoading && (
                            <div className="flex items-center gap-1 text-xs text-gray-500"><Spinner /><span>Building…</span></div>
                          )}
                          {compiledCtxPreview && !compiledCtxLoading && (
                            <button onClick={handleBuildCtx}
                              className="px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                              Refresh
                            </button>
                          )}
                        </div>
                        {!compiledCtxPreview && !compiledCtxLoading && (
                          <p className="text-xs text-gray-400 italic">Project metadata, SAP system info, related cases, and other dynamic context — click Fetch to load.</p>
                        )}
                        {compiledCtxPreview && (
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto bg-gray-50 rounded-lg p-3 border border-gray-100">{compiledCtxPreview}</pre>
                        )}

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

                  {!specApproved && (
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

            {/* ── Node 1: SAP Verification ── */}
            {activeNode === 1 && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("spec.ai_step1_h")}</h3>
                  <p className="text-xs text-gray-500">{t("spec.ai_step1_desc")}</p>
                </div>

                {!sapCheck && !stepLoading && !specApproved && (
                  <div className="text-center py-4">
                    <button onClick={handleSapCheck}
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
                  <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                    <Spinner /><span className="text-sm">{t("spec.checking")}</span>
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
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cc[1]} ${cc[2]} uppercase`}>{sapCheck.coverage}</span>
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
                        <button onClick={handleSapCheck} className={`text-xs underline ${cc[2]}`}>{t("spec.rerun_check")}</button>
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
                    <span>{t("spec.coverage_lbl")} <span className="font-bold uppercase">{sapCheck.coverage}</span></span>
                    <span className="ml-auto opacity-70">{sapCheck.recommendation}</span>
                  </div>
                )}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("spec.ai_step2_h")}</h3>
                  <p className="text-xs text-gray-500">{t("spec.ai_step2_desc")}</p>
                </div>
                {!proposalCheck && !stepLoading && !specApproved && (
                  <div className="text-center py-4">
                    <button onClick={handleProposalValidation}
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
                  <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                    <Spinner /><span className="text-sm">{t("spec.validating")}</span>
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
                        <button onClick={handleProposalValidation}
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
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${riskColor[proposalCheck.risk_level]??riskColor.medium}`}>{t("spec.risk_lbl")} {proposalCheck.risk_level}</span>
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
                        <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
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
                    <button onClick={handleGenerateSpecs}
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
                              onClick={() => {
                                if (specApproved && !window.confirm(t("spec.regen_approved_confirm"))) return;
                                handleGenerateSpecs();
                              }}
                              title={specApproved ? t("spec.regen_approved_tooltip") : undefined}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-blue-50 border ${specApproved ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-blue-200 text-blue-700'}`}>
                              {t("spec.regen_all")}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-5 max-h-[600px] overflow-y-auto">
                        {selectedSpec && specHasFailed(selectedSpec) ? (
                          <div className="flex flex-col items-center py-10 gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                              <span className="text-red-500 text-2xl font-bold">!</span>
                            </div>
                            <p className="text-sm font-semibold text-red-600">Spec {selectedSpec.toUpperCase()} failed to generate</p>
                            {specErrors[selectedSpec] && (
                              <p className="text-xs text-red-400 text-center max-w-xs">{specErrors[selectedSpec]}</p>
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
                            try { await saveSpec({ mode: 'ai', status: 'draft', content, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, specD: aiSpecD, selectedSpec, prevMode, analysisCustomerContent, requestSummary, activeProfile }), title: caseData.title + t("spec.doc_title_suffix") }); await refetch(); } catch (e) { alert(e.message); }
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
                        {canSubmit && (
                          spec?.status === 'submitted' ? (
                            <span className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 font-semibold rounded-lg flex items-center gap-1.5">
                              <Clock size={11} /> {t("spec.awaiting")}
                            </span>
                          ) : spec?.status === 'approved' ? (
                            <span className="px-3 py-1.5 text-xs bg-green-100 text-green-700 border border-green-200 font-semibold rounded-lg flex items-center gap-1.5">
                              <Check size={11} /> {t("spec.status_approved")}
                            </span>
                          ) : (
                            <button onClick={() => handleSubmit(selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA, 'ai', [])} disabled={!selectedSpec}
                              className="px-3 py-1.5 text-xs bg-[#1A4B8C] text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-40">
                              {t("spec.submit_btn")}
                            </button>
                          )
                        )}
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
                    onRegenerate={activeProfile?.prototype_enabled && (aiSpecA || aiSpecB) ? async () => {
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
                        const _protoMsgs = [{ role: 'user', content: buildPrototypePrompt(aiSpecA, aiSpecB, protoStyle) }];
                        let html = await callClaude({ model: resolvedModel, system: _protoSys, messages: _protoMsgs, max_tokens: 8000 })
                          .catch(e => {
                            if (e.message?.includes('did not match the expected pattern')) {
                              return callClaude({ model: 'claude-haiku-5-5', system: _protoSys, messages: _protoMsgs, max_tokens: 8000 });
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
                            await Promise.all(old.map(d => deleteDocument(d.id, d.file_url)));
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
