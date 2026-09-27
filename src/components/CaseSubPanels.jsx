import { useState, useEffect, Fragment } from "react";
import DOMPurify from "dompurify";
import {
  AlertTriangle, Archive, BarChart2, Check, CheckCircle2, Clock, Code2,
  Download, FileText, Flag, FolderOpen, Inbox, ListChecks, Paperclip, Pause, Play,
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
      <div className="relative flex items-start justify-between">
        <div className={`absolute ${lineTop} ${lineX} h-0.5 z-0`}
          style={{ background: `linear-gradient(to right, #1A4B8C ${progressPct}%, #e5e7eb ${progressPct}%)` }} />
        {flow.map((stage, i) => {
          const done   = curIsTerminal || i < curIdx;
          const active = !curIsTerminal && i === curIdx;
          const Icon   = getStageIcon(stage.key);
          return (
            <div key={stage.key} className="relative z-10 flex flex-col items-center flex-1 gap-1.5">
              <div className={`${circSz} rounded-full flex items-center justify-center transition-all`}
                style={{
                  background: done || active ? stage.color : '#fff',
                  border: !done && !active ? '2px solid #e5e7eb' : 'none',
                  boxShadow: active ? `0 0 0 4px ${stage.color}30` : undefined,
                }}>
                {done
                  ? <Check size={iconSz} color="#fff" />
                  : <Icon size={iconSz} color={active ? '#fff' : '#9ca3af'} />
                }
              </div>
              <div className="text-center px-0.5">
                <div className={`leading-tight font-semibold ${big ? 'text-xs' : 'text-[10px]'}`}
                  style={{ color: active ? stage.color : done ? '#6b7280' : '#9ca3af' }}>
                  {stage.label}
                </div>
              </div>
            </div>
          );
        })}
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

              const lineColor = isDone ? stage.color + '60' : '#e5e7eb';

              return (
                <div key={stage.key} className="flex items-start gap-2">
                  {/* dot + connecting rail */}
                  <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
                    <div style={{
                      width: isCurrent ? 20 : 14,
                      height: isCurrent ? 20 : 14,
                      borderRadius: '50%',
                      background: isDone || isCurrent ? stage.color : undefined,
                      border: isDone || isCurrent ? 'none' : '2px solid #d1d5db',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700,
                      color: isDone || isCurrent ? '#fff' : '#9ca3af',
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
                      color: isCurrent ? stage.color : isDone ? stage.color + 'cc' : '#9ca3af',
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
    const isSelection = (lines[0]||'').toUpperCase().includes('SELECTION');
    let title = '';
    const params=[], cols=[], rows=[];
    let totalRow=null;
    lines.forEach(l => {
      if (/^SCREEN:/i.test(l)) return;
      if (/^TITLE:/i.test(l)) { title=l.replace(/^TITLE:\s*/i,''); return; }
      if (/^PARAM:/i.test(l)) { const p=l.replace(/^PARAM:\s*/i,'').split('|'); params.push({label:(p[0]||'').trim(),value:(p[2]||'').trim(),req:(p[3]||'').trim().toUpperCase()==='R'}); return; }
      if (/^COL:/i.test(l))   { const p=l.replace(/^COL:\s*/i,'').split('|'); cols.push({label:(p[0]||'').trim(),width:parseInt(p[1])||15,align:((p[2]||'L').trim().toUpperCase())}); return; }
      if (/^ROW:/i.test(l))   { rows.push(l.replace(/^ROW:\s*/i,'').split('|').map(v=>v.trim())); return; }
      if (/^TOTAL:/i.test(l)) { totalRow=l.replace(/^TOTAL:\s*/i,'').split('|').map(v=>v.trim()); return; }
    });
    if (!title) title = isSelection ? 'Selection Screen' : 'Report Output';

    const chrome = body => `<div style="border:1px solid #8fa8cc;border-radius:3px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,0.13)">
      <div style="background:#1a3764;color:white;padding:5px 8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:11.5px">${esc(title)}</span>
        <span style="display:flex;gap:2px">
          <span style="background:#5a8aba;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">─</span>
          <span style="background:#5a8aba;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">□</span>
          <span style="background:#b03030;width:16px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;border-radius:2px">×</span>
        </span>
      </div>
      <div style="background:#dde4f0;border-bottom:1px solid #b0bbcc;padding:2px 8px;font-size:10.5px;color:#222;display:flex;gap:14px">
        ${['Sistema','Editar','Pasar a','Favoritos','Extras','Entorno','Ayuda'].map(m=>`<span>${m}</span>`).join('')}
      </div>
      <div style="background:#e4eaf5;border-bottom:1px solid #b0bbcc;padding:3px 8px;display:flex;gap:2px;align-items:center">
        <input style="width:70px;height:18px;border:1px solid #8899bb;font-size:10px;padding:0 4px;background:white" readonly />
        ${[0,1,2,3,4,5].map(i=>`<span style="background:#c8d4e8;border:1px solid #8899bb;width:20px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;${i===2?'margin-left:5px':''}">▶</span>`).join('')}
      </div>
      ${body}
      <div style="background:#dde4f0;border-top:1px solid #b0bbcc;padding:2px 8px;font-size:10px;color:#334;display:flex;justify-content:space-between">
        <span>Sistema: TechCase-DEV &nbsp;|&nbsp; Mandante: 100</span>
        <span style="color:#006600;font-weight:700">● Listo</span>
      </div>
    </div>`;

    if (isSelection) {
      const dp = params.length ? params : [{label:'Sociedad',value:'1000',req:true},{label:'Ejercicio',value:'2024',req:true},{label:'Período de',value:'01',req:false},{label:'Período a',value:'12',req:false}];
      const fields = dp.map(p=>`<div style="display:flex;align-items:center;margin-bottom:7px">
        <span style="color:#cc0000;width:10px;font-weight:bold;font-size:13px">${p.req?'*':''}</span>
        <label style="width:185px;color:#2a3a5a;font-size:11.5px">${esc(p.label)}</label>
        <input value="${esc(p.value)}" style="width:155px;height:21px;border:1px solid #99aabb;border-bottom:2px solid #2855a8;padding:0 6px;font-size:11.5px;color:#001280;background:white" readonly />
        <span style="background:#c8d4e8;border:1px solid #8899bb;width:20px;height:21px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;margin-left:2px;cursor:pointer">▼</span>
      </div>`).join('');
      return chrome(`<div style="background:#f5f7fc;padding:14px 18px">
        <div style="border:1px solid #8899bb;border-radius:2px;padding:16px 18px;background:white;position:relative;margin-bottom:12px">
          <div style="position:absolute;top:-9px;left:12px;background:white;padding:0 6px;font-size:10.5px;font-weight:600;color:#1a3764">Parámetros de selección</div>
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
      const drows = ur.map((row,ri)=>`<tr>${uc.map((c,ci)=>`<td style="padding:4px 8px;font-size:11px;border:1px solid #c8d4e8;text-align:${c.align==='R'?'right':'left'};background:${ri%2===0?'white':'#f0f5fc'}">${esc(row[ci]||'')}</td>`).join('')}</tr>`).join('');
      const trow = `<tr>${uc.map((c,ci)=>`<td style="padding:5px 8px;font-size:11px;font-weight:700;border:1px solid #8899bb;text-align:${c.align==='R'?'right':'left'};background:#d0e4f8;color:#00186a">${esc(ut[ci]||'')}</td>`).join('')}</tr>`;
      return chrome(`<div>
        <div style="background:#e8eff8;border-bottom:1px solid #b0bbcc;padding:3px 8px;display:flex;gap:4px">
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
      out.push(/SCREEN:/i.test(cc) ? renderSapScreen(cc) : `<pre style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;overflow-x:auto;font-size:11px;font-family:monospace;white-space:pre">${esc(cc)}</pre>`);
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
    if ((m=line.match(/^##\s+(.+)/)))   { out.push(`<h2 style="font-size:1.125rem;font-weight:700;margin:1.25rem 0 0.5rem;color:#1A4B8C">${fmt(m[1])}</h2>`); i++; continue; }
    if ((m=line.match(/^#\s+(.+)/)))    { out.push(`<h1 style="font-size:1.25rem;font-weight:800;margin:1.5rem 0 0.5rem;color:#1A4B8C">${fmt(m[1])}</h1>`); i++; continue; }
    if (/^---$/.test(line))             { out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:1rem 0">'); i++; continue; }
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

  if (cfg.include_related_cases && extra.relatedCases?.length) {
    lines.push(`Related Cases (same client & SAP module):`);
    extra.relatedCases.forEach((c, i) => {
      lines.push(`  ${i + 1}. "${c.title}" — ${c.status}${c.area_sap ? ` [${c.area_sap}]` : ''}`);
    });
  }

  if (extra.sapLiveData) {
    const ld = extra.sapLiveData;
    if (ld.systemInfo) lines.push(`SAP Live System: ${ld.systemInfo}`);
    if (ld.components?.length) lines.push(`SAP Live Active Components: ${ld.components.join(', ')}`);
    if (ld.existingSource) {
      lines.push(`Existing ABAP Object Source (${ld.existingObjectName ?? 'current'}):\n\`\`\`abap\n${ld.existingSource.slice(0, 2000)}\n\`\`\``);
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
    merged.prototype_style   = sto.prototype_style   ?? 'fiori';
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

function ProtoPanel({ protoHtmlState, setProtoHtmlState, protoSaved, generatingSpecs, documents, onBack, t }) {
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);

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
      .then(r => r.text())
      .then(html => { setProtoHtmlState(html); })
      .catch(() => setFetchErr('Could not load prototype'))
      .finally(() => setLoading(false));
  }, [protoSaved, protoHtmlState, documents]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{t("spec.proto_node_lbl")}</h3>
        <div className="flex gap-2">
          {protoHtmlState && (
            <button onClick={() => openHtmlInNewTab(protoHtmlState)}
              className="px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
              {t("spec.proto_open_btn")}
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
        <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: 520 }}>
          <iframe
            srcDoc={protoHtmlState}
            title="Interactive Prototype"
            className="w-full h-full border-0"
            sandbox="allow-scripts"
          />
        </div>
      )}
      {!protoHtmlState && !loading && !fetchErr && protoSaved && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
          {t("spec.proto_saved")}
        </div>
      )}
      {!protoSaved && generatingSpecs && (
        <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
          <Spinner /><span className="text-sm">{t("spec.gen_all_loading")}</span>
        </div>
      )}
      {!protoSaved && !generatingSpecs && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
          {t("spec.proto_pending")}
        </div>
      )}
    </div>
  );
}

function SpecificationTab({ caseData, auth, documents, addDocument, deleteDocument, refetchDocuments, onUpdate }) {
  const { t, lang } = useT();
  const ssCtx = useSystemSettings();
  const genModel      = ssCtx.settings["ai_model"]       ?? 'claude-haiku-4-5-20251001';
  const analysisModel = ssCtx.settings["analysis_model"] ?? 'claude-haiku-4-5-20251001';
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
  const [sapCheck, setSapCheck]         = useState(null);
  const [proposalCheck, setProposalCheck] = useState(null);
  const [stepLoading, setStepLoading]   = useState(false);
  const [aiSpecA, setAiSpecA]           = useState(''); // custom dev spec
  const [aiSpecB, setAiSpecB]           = useState(''); // standard SAP spec
  const [aiSpecC, setAiSpecC]           = useState(''); // customer proposal as-is
  const [selectedSpec, setSelectedSpec] = useState(null); // 'a' | 'b' | 'c'
  const [generatingSpecs, setGeneratingSpecs] = useState(false);
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
  const [savedSpecUrls, setSavedSpecUrls] = useState({ a: null, b: null, c: null });
  const [savingDoc, setSavingDoc]         = useState(false);
  const [specHtml, setSpecHtml]           = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [protoSaved, setProtoSaved]       = useState(false);
  const [protoHtmlState, setProtoHtmlState] = useState(null);
  const [viewingProto, setViewingProto]   = useState(false);

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
      const isPdf = lower.endsWith('.pdf') || (doc.file_type ?? '').includes('pdf');
      const isText = lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv');
      if (!isPdf && !isText) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — binary format, cannot extract text]` });
        continue;
      }
      try {
        const resp = await fetch(doc.file_url);
        if (isPdf) {
          const blob = await resp.blob();
          const b64 = await blobToBase64(blob);
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
        } else {
          const text = await resp.text();
          blocks.push({ type: 'text', text: `[Document: ${doc.file_name}]\n${text.slice(0, 8000)}` });
        }
      } catch (_) {
        blocks.push({ type: 'text', text: `[Attached file: ${doc.file_name} — could not be loaded]` });
      }
    }
    return blocks;
  }

  function buildCaseDocHtml(docTitle, eyebrow, metaItems, markdownContent) {
    const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
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
      const closeCode  = () => { if (inCode) { out.push('<pre><code>' + codeLines.map(l => esc(l)).join('\n') + '</code></pre>'); inCode = false; codeLines = []; } };
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
<html lang="es">
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
<button class="print-btn" onclick="window.print()">⬇ Guardar como PDF</button>
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
    const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
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
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── HEADER ──────────────────────────────────────────────────
    doc.setFillColor(...sapBlue);
    doc.rect(0, 0, W, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('SAP  /  Functional Specification  /  ' + (caseData.area_sap ?? 'Module'), L, 11);
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
    doc.text('APPROVAL SIGNATURES', L + 3, y + 5);
    y += 9;
    const sigCols = [L, L + 62, L + 124];
    const sigLabels = ['Functional Analyst', 'ABAP Developer', 'Client / Manager'];
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
      doc.text('Name / Signature / Date', bx + 3, y + 20);
    });

    // ── PAGE NUMBERS ─────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 170, 190);
      doc.text('TechCase  ·  SAP Functional Specification  ·  ' + (caseData.title ?? '').substring(0, 50), L, 290);
      doc.text('Page ' + i + ' of ' + pageCount, R, 290, { align: 'right' });
    }

    return doc.output('blob');
  }

  function buildValidationMarkdown(sap, proposal) {
    if (!sap && !proposal) return '';
    const lines = ['## Analysis Summary\n'];
    if (sap) {
      const coverageLabel = sap.coverage === 'full' ? 'Full — standard SAP covers the requirement' : sap.coverage === 'partial' ? 'Partial — gaps require additional work' : 'None — custom development required';
      lines.push('### SAP Standard Coverage Check');
      lines.push(`**Coverage:** ${coverageLabel}`);
      if (sap.summary) lines.push(`**Summary:** ${sap.summary}`);
      if ((sap.standard_transactions ?? []).length > 0) lines.push(`**Standard Transactions:** ${sap.standard_transactions.join(', ')}`);
      if ((sap.gaps ?? []).length > 0) lines.push('**Gaps identified:**\n' + sap.gaps.map(g => `- ${g}`).join('\n'));
      if (sap.recommendation) lines.push(`**Recommendation:** ${sap.recommendation}`);
      lines.push('');
    }
    if (proposal) {
      const riskMap = { low: 'Low', medium: 'Medium', high: 'High' };
      lines.push('### Proposal Validation');
      lines.push(`**Result:** ${proposal.valid ? 'Valid' : 'Has concerns'}  |  **Risk:** ${riskMap[proposal.risk_level] ?? proposal.risk_level}  |  **Score:** ${proposal.score}/10`);
      if ((proposal.strengths ?? []).length > 0) lines.push('**Strengths:**\n' + proposal.strengths.map(s => `- ${s}`).join('\n'));
      if ((proposal.concerns ?? []).length > 0) lines.push('**Concerns:**\n' + proposal.concerns.map(c => `- ${c}`).join('\n'));
      if (proposal.recommendation) lines.push(`**Recommendation:** ${proposal.recommendation}`);
      lines.push('');
    }
    lines.push('---\n');
    return lines.join('\n');
  }

  async function saveSpecAsDocument(markdown, filePrefix, docNote) {
    setSavingDoc(true);
    try {
      const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
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
      const pdfBlob = await htmlStringToPdfBlob(htmlString);
      const fileName = `${prefix}_${safeName}_${dateStr}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
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
    const content = selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA;
    if (!content) return;
    setDownloadingPdf(true);
    try {
      const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
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
      const pdfBlob = await htmlStringToPdfBlob(htmlString);
      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const prefixMap = { a: 'SpecA_CustomABAP', b: 'SpecB_StandardSAP', c: 'SpecC_PropuestaCliente' };
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${prefixMap[selectedSpec] ?? 'Spec'}_${safeName}_${dateStr}.pdf`;
      const url = URL.createObjectURL(pdfBlob);
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

  async function saveAllSpecsAsDocuments(specA, specB, specC, sap, proposal) {
    setSavingDoc(true);
    try {
      const SPEC_PREFIXES = ['SpecA_CustomABAP', 'SpecB_StandardSAP', 'SpecC_PropuestaCliente', 'Prototype_'];
      if (deleteDocument && documents?.length) {
        const oldDocs = documents.filter(d =>
          d.file_name && SPEC_PREFIXES.some(p => d.file_name.startsWith(p))
        );
        await Promise.all(oldDocs.map(d => deleteDocument(d.id, d.file_url)));
      }

      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const dateStr  = new Date().toISOString().slice(0, 10);
      const dateLong = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
      const valSection = buildValidationMarkdown(sap, proposal);
      const baseMeta = [
        { label: t("spec.label_case_id"),  value: '#' + ((caseData.id ?? '').slice(0, 8) || '—') },
        { label: t("label.sap_area"),      value: caseData.area_sap ?? '—' },
        { label: t("label.priority"),      value: (caseData.priority ?? '—').toUpperCase() },
        { label: t("spec.label_generated"),value: dateLong },
      ];
      const specs = [
        { key: 'a', content: valSection + specA, prefix: 'SpecA_CustomABAP',       note: 'Opción A — Desarrollo Custom ABAP (auto-generated)',      title: 'Opción A — Desarrollo Custom ABAP' },
        { key: 'b', content: valSection + specB, prefix: 'SpecB_StandardSAP',      note: 'Opción B — Configuración SAP Estándar (auto-generated)',  title: 'Opción B — Configuración SAP Estándar' },
        { key: 'c', content: valSection + specC, prefix: 'SpecC_PropuestaCliente', note: 'Opción C — Propuesta del Cliente (auto-generated)',        title: 'Opción C — Propuesta del Cliente' },
      ];
      const newUrls = { a: null, b: null, c: null };
      for (const s of specs) {
        const htmlString = buildCaseDocHtml(
          s.title,
          'SAP Consulting · ' + t("spec.html_title"),
          baseMeta,
          s.content
        );
        const pdfBlob = await htmlStringToPdfBlob(htmlString);
        const fileName = `${s.prefix}_${safeName}_${dateStr}.pdf`;
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
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
          if (nd.selectedSpec)  setSelectedSpec(nd.selectedSpec);
          if (nd.prevMode)      setPrevMode(nd.prevMode);
          if (nd.analysisCustomerContent) setAnalysisCustomerContent(nd.analysisCustomerContent);
        } catch (_) {}
      }
      if (spec.content) restoredStep = 3;
      setAiStep(restoredStep);
      setActiveNode(restoredStep === 3 ? 3 : restoredStep === 2 ? 2 : 0);
      // Detect previously generated prototype from documents list
      const protoDoc = (documents ?? []).find(d => (d.description ?? '').startsWith('[Prototype]') || (d.file_name ?? '').startsWith('Prototype_'));
      if (protoDoc) { setProtoSaved(true); setActiveProfile({ prototype_enabled: true }); }
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

    // Live SAP system check
    if (genCtx.sap_live_check && caseData.client_id) {
      try {
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
        if (sapCfg?.host && sapCfg?.username) {
          const liveData = await sapLiveCheck(sapCfg);
          if (liveData) extra.sapLiveData = liveData;
          // For modification/update cases, try to find existing object in spec/description
          const isModification = /modif|updat|enhanc|extend|fix|correct|adjust/i.test(caseData.title + ' ' + (caseData.description ?? ''));
          if (isModification) {
            const objMatch = (caseData.description ?? '').match(/\b(Z[A-Z0-9_]{1,30}|Y[A-Z0-9_]{1,30})/);
            if (objMatch) {
              const src = await sapFetchSource(sapCfg, 'program', objMatch[0]).catch(() => null);
              if (src) {
                extra.sapLiveData = { ...extra.sapLiveData, existingSource: src, existingObjectName: objMatch[0] };
              } else {
                extra.sapLiveData = { ...extra.sapLiveData, existingObjectMissing: true, existingObjectName: objMatch[0] };
              }
            }
          }
        }
      } catch (_) { /* SAP unreachable — continue without live data */ }
    }

    return buildContextString(caseData, genCtx, extra);
  }

  // ── AI Generate — two specs ─────────────────────────────────

  function buildSpecPrompt(isCustomDev, genProfile, contextStr = '') {
    const sapCtx = sapCheck ? `\nSAP Standard Coverage Analysis: ${sapCheck.coverage} — ${sapCheck.summary}\nGaps: ${(sapCheck.gaps??[]).join('; ')||'none'}\nStandard transactions: ${(sapCheck.standard_transactions??[]).join(', ')||'none'}` : '';
    const propCtx = proposalCheck ? `\nProposal Validation: score ${proposalCheck.score}/10, risk ${proposalCheck.risk_level}\nStrengths: ${(proposalCheck.strengths??[]).join('; ')||'none'}\nConcerns: ${(proposalCheck.concerns??[]).join('; ')||'none'}` : '';

    if (isCustomDev) {
      return `Write Option A: Custom ABAP Development Functional Specification for this case.${sapCtx}${propCtx}

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

IMPORTANT: This spec covers the approach WITHOUT custom ABAP development. It uses only standard SAP transactions, configuration, and possibly SAPscript/Smartform-based standard tools. Reference the standard transactions found in the coverage analysis.

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

  function buildSpecCPrompt(customerContent, genProfile, contextStr = '') {
    return `Write Option C: Customer Proposal As-Is Functional Specification for this case.

This option formalizes EXACTLY what the customer proposed, without any AI alternatives or suggestions. Do NOT add any SAP standard alternatives or custom dev recommendations — this is a direct formalization of the customer's own technical proposal.

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

### 6.1 Selection Screen

\`\`\`
SCREEN:SELECTION
TITLE:Z[TXN] - [Description from customer proposal]
PARAM:[Field label]|[TECH_NAME]|[default]|R
PARAM:[Field label]|[TECH_NAME]||O
\`\`\`

### 6.2 Output / Result

\`\`\`
SCREEN:OUTPUT
TITLE:[Report title per customer proposal] | [filters]
COL:[Column]|[width]|[L or R]
ROW:[val1]|[val2]|[val3]|[val4]|[val5]
TOTAL:||Total|[amount]|
\`\`\`

## 7. Assumptions
1. [assumption based strictly on the customer proposal]

## 8. Next Steps
1. [action item derived from the customer's proposed approach]

Use realistic Z object names matching the customer's described solution for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM/COL values.${buildSectionConstraint('spec_c', genProfile)}${buildGenSuffix(genProfile, lang)}`;
  }

  function buildPrototypePrompt(specA, specB, style) {
    const styleGuide = style === 'wireframe'
      ? `Use a low-fidelity wireframe visual style: white/light-gray backgrounds (#F5F5F5), gray borders (#CCCCCC), dark gray text (#333333), placeholder boxes for images, no gradients or shadows. Label everything clearly. Use a simple sans-serif font.`
      : style === 'branded'
      ? `Use a dark branded theme: background #0B0F1A, card surfaces #1A2235, accent color #4F6EF7 (blue), text white and rgba(255,255,255,0.7), rounded-xl cards, subtle blue glow effects on CTAs.`
      : `Use SAP Fiori visual design: shell bar at top with sapUiGlobalBackground (#F7F7F7), Fiori blue (#0070F2) for primary actions, SAP font "72" fallback to system sans-serif, card-style tiles, standard Fiori list items with separator lines, table with column headers in gray, footer toolbar for actions.`;

    return `You are a UI/UX prototype generator. Generate a SINGLE complete self-contained HTML file that is an interactive multi-screen prototype for this SAP case.

Case: ${caseData.title}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}
Description: ${caseData.description ?? ''}

Spec A (Custom ABAP approach):
${specA.slice(0, 1500)}

Spec B (Standard SAP approach):
${specB.slice(0, 1000)}

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

NAVIGATION — YOU MUST USE THIS EXACT JAVASCRIPT PATTERN, no variations:
<script>
var _cur = 1;
function _show(n) {
  document.querySelectorAll('.screen').forEach(function(s){ s.style.display='none'; });
  var el = document.getElementById('screen'+n);
  if (el) { el.style.display='block'; _cur=n; }
  document.querySelectorAll('.step-dot').forEach(function(d,i){ d.classList.toggle('active', i+1===n); });
}
function _next() { if(_cur<4) _show(_cur+1); }
function _back() { if(_cur>1) _show(_cur-1); }
document.addEventListener('DOMContentLoaded', function(){ _show(1); });
</script>

CRITICAL SCREEN RULES:
- Each screen div MUST have: class="screen" and id="screen1" through "screen4"
- ALL screens start with style="display:none" in their HTML — the JS shows screen1 on load
- Every screen MUST contain substantial visible content (headers, paragraphs, tables, form fields, buttons) — do NOT leave any screen with only a title
- Navigation buttons: use onclick="_next()" and onclick="_back()" — place a prominent "Next" button on every screen except screen4
- Step indicator dots must have class="step-dot"

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
    setSelectedSpec(null);
    try {
      const docBlocks = await buildDocumentBlocks();
      const pdfNames = (documents ?? []).filter(d => (d.file_name ?? '').toLowerCase().endsWith('.pdf') || (d.file_type ?? '').includes('pdf')).map(d => d.file_name);
      const pdfNote = pdfNames.length > 0 ? `\n\n[Reference PDFs attached: ${pdfNames.join(', ')}]` : '';
      // callSpec: try with full document blocks; if the model rejects them (no PDF support), retry text-only
      const callSpec = async (prompt) => {
        const sys = 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.';
        try {
          const content = docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt;
          return await callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content }], max_tokens: 4000 });
        } catch (_) {
          return callClaude({ model: genModel, system: sys, messages: [{ role: 'user', content: prompt + pdfNote }], max_tokens: 4000 });
        }
      };
      const customerContent = analysisCustomerContent || caseData.description || '';
      const contextStr = await buildGenContext();
      const [specA, specB, specC] = await Promise.all([
        callSpec(buildSpecPrompt(true, genProfile, contextStr)),
        callSpec(buildSpecPrompt(false, genProfile, contextStr)),
        callSpec(buildSpecCPrompt(customerContent, genProfile, contextStr)),
      ]);
      setAiSpecA(specA);
      setAiSpecB(specB);
      setAiSpecC(specC);
      setSelectedSpec('a');
      setAiContent(specA);
      setSavedSpecUrls({ a: null, b: null, c: null });
      setActiveProfile(genProfile);
      setProtoSaved(false);
      setProtoHtmlState(null);
      setViewingProto(false);
      const saveStatus = autoSubmit ? 'submitted' : 'draft';
      try {
        await saveSpec({ mode: 'ai', status: saveStatus, content: specA, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA, specB, specC, selectedSpec: 'a', prevMode, analysisCustomerContent: customerContent }), title: caseData.title + t("spec.doc_title_suffix") });
        logEvent('spec.generated', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { model: genModel } });
      } catch (_) {}
      await saveAllSpecsAsDocuments(specA, specB, specC, sapCheck, proposalCheck);

      // Generate interactive prototype if enabled for this profile
      if (genProfile?.prototype_enabled) {
        try {
          const protoStyle = genProfile.prototype_style ?? 'fiori';
          let protoHtml = await callClaude({
            model: genModel,
            system: 'You are an expert UI prototype generator. Output only valid HTML. No markdown, no explanation.',
            messages: [{ role: 'user', content: buildPrototypePrompt(specA, specB, protoStyle) }],
            max_tokens: 8000,
          });
          // Strip markdown code fences the model may add despite instructions
          protoHtml = protoHtml.trim();
          if (protoHtml.startsWith('```')) {
            protoHtml = protoHtml.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
          }
          const safeName = (caseData.title ?? 'Prototype').replace(/[^a-z0-9]/gi, '_');
          const dateStr  = new Date().toISOString().slice(0, 10);
          const fileName = `Prototype_${safeName}_${dateStr}.html`;
          const blob = new Blob([protoHtml], { type: 'text/html' });
          const file = new File([blob], fileName, { type: 'text/html' });
          await addDocument(file, '[Prototype] Interactive prototype (auto-generated)');
          setProtoHtmlState(protoHtml);
          setProtoSaved(true);
          if (refetchDocuments) await refetchDocuments();
        } catch (_) { /* prototype failure is non-fatal */ }
      }

      if (autoSubmit) await refetch();
    } catch (e) {
      setAiError(e.message);
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
        notes: specMode === 'manual' ? manualNotes : (specMode === 'ai' ? JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, selectedSpec, prevMode, analysisCustomerContent }) : null),
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
      const docBlocks = await buildDocumentBlocks();
      const customerCtx = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const prompt = `Analyze this SAP case and determine whether STANDARD SAP functionality covers the requirement — without any custom ABAP development.${docBlocks.length > 0 ? '\n\nThe attached documents contain the detailed requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${customerCtx}

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
      const docBlocks = await buildDocumentBlocks();
      const customerCtx2 = analysisCustomerContent ? `\nCustomer Proposal / Notes:\n${analysisCustomerContent}` : '';
      const prompt = `Validate the proposed custom SAP development for this case.${docBlocks.length > 0 ? '\n\nThe attached documents contain the requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}${customerCtx2}

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
  if (spec && mode === spec.mode && !['draft'].includes(spec.status) && spec.status !== 'rejected') {
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
          <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>
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
            setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setSelectedSpec(null); setAiStep(1);
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
            <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>
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
              <button onClick={() => setWizardStage('objects')} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>
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
              <button onClick={() => setWizardStage('interview')} className="text-xs text-gray-400 hover:text-gray-600">← {t("spec.wiz_interview")}</button>
              <span className="text-sm font-semibold text-gray-700">{t("spec.wiz_compiled")}</span>
            </div>
            {compiledSpec && (
              <button onClick={() => {
                const qaSummary = wizardObjects.map(o => `${o.name} (${o.type}): ${(o.questions ?? []).map(q => `${q.question} → ${q.a}`).join('; ')}`).join('\n');
                setAnalysisCustomerContent(qaSummary || compiledSpec);
                setPrevMode('wizard');
                setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setSelectedSpec(null); setAiStep(1);
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
                setSapCheck(null); setProposalCheck(null); setAiSpecA(''); setAiSpecB(''); setAiSpecC(''); setSelectedSpec(null); setAiStep(1);
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

    // Node statuses
    const sapStatus  = sapCheck      ? 'complete' : stepLoading && aiStep === 1 ? 'running' : 'pending';
    const propStatus = proposalCheck ? 'complete' : stepLoading && aiStep === 2 ? 'running' : sapCheck ? 'pending' : 'locked';
    const genStatus   = (aiSpecA || aiSpecB || aiSpecC) ? 'complete' : generatingSpecs ? 'running' : proposalCheck ? 'pending' : 'locked';
    const protoStatus = protoSaved ? 'complete' : generatingSpecs ? 'running' : 'pending';
    const SUB = [
      { key: 'a', label: t("spec.tab_a"), dot: 'bg-amber-400', content: aiSpecA },
      { key: 'b', label: t("spec.tab_b"), dot: 'bg-green-500', content: aiSpecB },
      { key: 'c', label: t("spec.tab_c"), dot: 'bg-purple-500', content: aiSpecC },
    ];
    const NodeBtn = ({ id, icon: Icon, title, sub, status, isActive, canClick, onClick, children }) => {
      const sc = {
        complete: { ring: 'border-green-400',  bg: 'bg-green-50',   circ: 'bg-green-500',  txt: 'text-green-700',  sub: 'text-green-600' },
        running:  { ring: 'border-blue-400',   bg: 'bg-blue-50',    circ: 'bg-blue-500',   txt: 'text-blue-700',   sub: 'text-blue-500'  },
        pending:  { ring: 'border-gray-300',   bg: 'bg-white',      circ: 'bg-gray-200',   txt: 'text-gray-700',   sub: 'text-gray-400'  },
        locked:   { ring: 'border-gray-200',   bg: 'bg-gray-50',    circ: 'bg-gray-100',   txt: 'text-gray-400',   sub: 'text-gray-300'  },
      }[status] ?? { ring:'border-gray-200', bg:'bg-white', circ:'bg-gray-200', txt:'text-gray-700', sub:'text-gray-400' };
      return (
        <div>
          <button onClick={onClick} disabled={!canClick}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all ${sc.bg} ${isActive ? 'border-blue-500 shadow-md' : sc.ring} ${canClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-not-allowed'}`}>
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${sc.circ}`}>
              {status === 'complete' ? <Check size={14} className="text-white" />
               : status === 'running' ? <Spinner />
               : <Icon size={14} className={status === 'locked' ? 'text-gray-300' : 'text-gray-500'} />}
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
          <button onClick={() => {
            const dest = prevMode ?? null;
            setMode(dest);
            setAiStep(1); setSapCheck(null); setProposalCheck(null); setAiContent('');
            if (!dest) { setPrevMode(null); setAnalysisCustomerContent(''); }
          }} className="text-xs text-gray-400 hover:text-gray-600">← {t("action.back")}</button>
          <span className="text-sm font-semibold text-gray-700">
            {prevMode === 'manual' ? t("spec.ai_mode_manual") : prevMode === 'wizard' ? t("spec.ai_mode_wizard") : t("spec.ai_mode_gen")}
          </span>
        </div>

        {/* 2-column pipeline layout */}
        <div className="flex gap-4 items-start">

          {/* LEFT: Pipeline flow diagram */}
          <div className="w-56 flex-shrink-0">
            <div className="relative space-y-1">
              {/* vertical connector line behind nodes */}
              <div className="absolute left-[23px] top-10 bottom-10 w-0.5 bg-gray-200 z-0 pointer-events-none" />

              {/* Node 0: Documents (AI input) */}
              <NodeBtn id={0} icon={Paperclip}
                title={t("spec.pipeline_docs_lbl")}
                sub={`${(documents??[]).length} ${t("spec.docs_files")}`}
                status="complete"
                isActive={activeNode===0}
                canClick={true}
                onClick={() => setActiveNode(0)}
              />

              {/* Node 1: SAP Verification */}
              <NodeBtn id={1} icon={CheckCircle2}
                title={t("spec.ai_step1_h")}
                sub={sapCheck ? sapCheck.coverage : sapStatus==='running' ? t("spec.checking") : t("spec.pending")}
                status={sapStatus}
                isActive={activeNode===1}
                canClick={true}
                onClick={() => setActiveNode(1)}
              />

              {/* Node 2: Proposal Validation */}
              <NodeBtn id={2} icon={Target}
                title={t("spec.ai_step2_h")}
                sub={proposalCheck ? `Score ${proposalCheck.score}/10` : propStatus==='running' ? t("spec.validating") : propStatus==='locked' ? t("spec.locked") : t("spec.pending")}
                status={propStatus}
                isActive={activeNode===2}
                canClick={propStatus !== 'locked'}
                onClick={() => { if (propStatus !== 'locked') setActiveNode(2); }}
              />

              {/* Node 3: Generate Specification + sub-nodes */}
              <NodeBtn id={3} icon={Sparkles}
                title={t("spec.ai_step3_lbl")}
                sub={genStatus==='complete' ? `${[aiSpecA,aiSpecB,aiSpecC].filter(Boolean).length} ${t("spec.specs_gen")}` : genStatus==='running' ? t("spec.gen_all_loading") : genStatus==='locked' ? t("spec.locked") : t("spec.pending")}
                status={genStatus}
                isActive={activeNode===3}
                canClick={genStatus !== 'locked'}
                onClick={() => { if (genStatus !== 'locked') setActiveNode(3); }}
              >
                {/* Sub-nodes for Spec A / B / C + Prototype */}
                {(aiSpecA || aiSpecB || aiSpecC || activeNode===3) && (
                  <div className="ml-8 mt-1 space-y-1 relative z-10">
                    {SUB.map(s => (
                      <button key={s.key} onClick={() => { setActiveNode(3); setSelectedSpec(s.key); setViewingProto(false); setAiContent(s.content); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border transition-all ${
                          s.content && savedSpecUrls[s.key] ? 'bg-green-50 border-green-200 text-green-700' :
                          s.content ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50' :
                          'bg-gray-50 border-gray-100 text-gray-400'
                        } ${selectedSpec === s.key && activeNode===3 && !viewingProto ? 'ring-2 ring-blue-300' : ''}`}>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                        <span className="truncate font-medium">{s.label}</span>
                        {savedSpecUrls[s.key] && <Check size={10} className="text-green-600 ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                    {/* Prototype sub-node — only when enabled in profile */}
                    {activeProfile?.prototype_enabled && (
                      <button onClick={() => { setActiveNode(3); setViewingProto(true); }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border transition-all ${
                          protoSaved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-400'
                        } ${viewingProto && activeNode===3 ? 'ring-2 ring-blue-300' : ''}`}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-blue-500" />
                        <span className="truncate font-medium">{t("spec.proto_node_lbl")}</span>
                        {protoSaved && <Check size={10} className="text-green-600 ml-auto flex-shrink-0" />}
                      </button>
                    )}
                  </div>
                )}
              </NodeBtn>
            </div>
          </div>

          {/* RIGHT: Content panel */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Error banner */}
            {aiError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{aiError}</div>
            )}

            {/* ── Node 0: Documents ── */}
            {activeNode === 0 && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-blue-800 mb-1">{t("spec.wiz_docs_lbl")}</h3>
                  <p className="text-xs text-blue-600 mb-3">{t("spec.docs_node_desc")}</p>
                  {(documents??[]).length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{t("spec.no_docs_ai")}</p>
                  ) : (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-100">
                          <Paperclip className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="text-xs text-gray-700 font-medium flex-1 truncate">{doc.file_name}</span>
                          <span className="text-xs text-blue-400 flex-shrink-0">({doc.file_size_kb} KB)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setActiveNode(1)}
                    className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                    {t("spec.ai_check_btn")} →
                  </button>
                </div>
              </div>
            )}

            {/* ── Node 1: SAP Verification ── */}
            {activeNode === 1 && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("spec.ai_step1_h")}</h3>
                  <p className="text-xs text-gray-500">{t("spec.ai_step1_desc")}</p>
                </div>

                {!sapCheck && !stepLoading && (
                  <div className="text-center py-4">
                    <button onClick={handleSapCheck}
                      className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.ai_check_btn")}
                    </button>
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
                    <div className="flex gap-3 justify-between items-center pt-1">
                      <button onClick={handleSapCheck} className={`text-xs underline ${cc[2]}`}>{t("spec.rerun_check")}</button>
                      <button onClick={() => setActiveNode(2)}
                        className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                        {t("spec.continue_step2")}
                      </button>
                    </div>
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
                {!proposalCheck && !stepLoading && (
                  <div className="text-center py-4">
                    <button onClick={handleProposalValidation}
                      className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.validate_proposal")}
                    </button>
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
                    <div className="flex gap-3 justify-between items-center pt-1">
                      <button onClick={handleProposalValidation}
                        className={`text-xs underline ${proposalCheck.valid ? 'text-green-700' : 'text-amber-700'}`}>{t("spec.revalidate")}</button>
                      <button onClick={() => setActiveNode(3)}
                        className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                        {t("spec.generate_spec")}
                      </button>
                    </div>
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
                {!aiSpecA && !aiSpecB && !aiSpecC && !generatingSpecs && !viewingProto && (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-7 h-7 text-blue-600" />
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{t("spec.gen_three_desc")}</p>
                    <div className="flex flex-wrap justify-center gap-4 mb-5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/><strong>A</strong> — {t("spec.opt_a")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"/><strong>B</strong> — {t("spec.opt_b")}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block"/><strong>C</strong> — {t("spec.opt_c")}</span>
                    </div>
                    <button onClick={handleGenerateSpecs}
                      className="px-6 py-3 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                      {t("spec.gen_all_three")}
                    </button>
                  </div>
                )}

                {generatingSpecs && !viewingProto && (
                  <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                    <Spinner /><span className="text-sm">{t("spec.gen_all_loading")}</span>
                  </div>
                )}

                {/* Spec tabs + content */}
                {(aiSpecA || aiSpecB || aiSpecC) && !generatingSpecs && !viewingProto && (
                  <div className="space-y-0">
                    <div className="flex border-b border-gray-200">
                      {SUB.map(s => (
                        <button key={s.key} onClick={() => { setSelectedSpec(s.key); setAiContent(s.content); }}
                          className={`flex-1 py-3 px-2 text-sm font-semibold border-b-2 transition-colors text-left flex items-center gap-2 ${selectedSpec === s.key ? 'border-[#1A4B8C] text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                          <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${s.dot}`}>{s.key.toUpperCase()}</span>
                          <span className="truncate">{s.label}</span>
                          {selectedSpec === s.key && <span className="ml-auto text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full flex-shrink-0">{t("spec.selected")}</span>}
                        </button>
                      ))}
                    </div>

                    <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs text-gray-500">
                          {selectedSpec === 'a' ? t("spec.opt_a_long") : selectedSpec === 'b' ? t("spec.opt_b_long") : selectedSpec === 'c' ? t("spec.opt_c_long") : t("spec.select_above")}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setAiEditing(p => !p)}
                            className="px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-white">
                            {aiEditing ? t("spec.preview_lbl") : t("spec.edit_lbl")}
                          </button>
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
                            <button onClick={handleGenerateSpecs}
                              className="px-2.5 py-1 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
                              {t("spec.regen_all")}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-5 max-h-[600px] overflow-y-auto">
                        {aiEditing ? (
                          <textarea
                            value={selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA}
                            onChange={e => {
                              const v = e.target.value;
                              if (selectedSpec === 'b') { setAiSpecB(v); setAiContent(v); }
                              else if (selectedSpec === 'c') { setAiSpecC(v); setAiContent(v); }
                              else { setAiSpecA(v); setAiContent(v); }
                            }}
                            rows={25} className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-y focus:outline-none focus:border-blue-400" />
                        ) : (
                          <div className="text-sm text-gray-800 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize('<div>' + renderMarkdown(selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA) + '</div>') }} />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-3 flex-wrap">
                        {SUB.map(s => (
                          <span key={s.key} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${savedSpecUrls[s.key] ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                            <span className={`w-2 h-2 rounded-full ${savedSpecUrls[s.key] ? 'bg-green-500' : s.dot} opacity-70`} />
                            {s.label} {savedSpecUrls[s.key] ? <><Check size={10} className="inline mr-0.5" />{t("spec.saved")}</> : t("spec.not_saved")}
                          </span>
                        ))}
                        {savingDoc && <span className="text-xs text-blue-600 flex items-center gap-1"><Spinner />&nbsp;{t("spec.saving_pdfs")}</span>}
                      </div>
                      <div className="flex gap-2 items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {selectedSpec ? t("spec.submit_option").replace("{n}", selectedSpec.toUpperCase()).replace("{label}", selectedSpec === 'a' ? t("spec.tab_a") : selectedSpec === 'b' ? t("spec.tab_b") : t("spec.tab_c")) : t("spec.click_tab_select")}
                        </p>
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            const content = selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA;
                            try { await saveSpec({ mode: 'ai', status: 'draft', content, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, specC: aiSpecC, selectedSpec, prevMode, analysisCustomerContent }), title: caseData.title + t("spec.doc_title_suffix") }); await refetch(); } catch (e) { alert(e.message); }
                          }} disabled={!selectedSpec} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40">
                            {t("spec.save_draft")}
                          </button>
                          {(() => {
                            const allSaved = savedSpecUrls.a && savedSpecUrls.b && savedSpecUrls.c;
                            return (
                              <button onClick={() => saveAllSpecsAsDocuments(aiSpecA, aiSpecB, aiSpecC, sapCheck, proposalCheck)}
                                disabled={savingDoc || allSaved || (!aiSpecA && !aiSpecB && !aiSpecC)}
                                className={`flex items-center px-4 py-2 text-sm font-semibold rounded-xl disabled:opacity-40 ${allSaved ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-default' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                {savingDoc ? t("state.saving") : allSaved ? <><Check size={13} className="mr-1.5 inline" />{t("spec.pdf_saved3")}</> : <><Paperclip className="w-4 h-4 mr-1.5" />{t("spec.save_all3")}</>}
                              </button>
                            );
                          })()}
                          {canSubmit && (
                            <button onClick={() => handleSubmit(selectedSpec === 'b' ? aiSpecB : selectedSpec === 'c' ? aiSpecC : aiSpecA, 'ai', [])} disabled={!selectedSpec}
                              className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-40">
                              {t("spec.submit_btn")}
                            </button>
                          )}
                        </div>
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
                    generatingSpecs={generatingSpecs}
                    documents={documents}
                    onBack={() => setViewingProto(false)}
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
