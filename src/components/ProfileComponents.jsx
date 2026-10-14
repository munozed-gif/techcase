import { useState, useEffect, useRef, Component } from "react";
import {
  Briefcase, Building2, Check, CheckCircle2, ChevronDown, FileText,
  FolderOpen, Link, Loader2, Pencil, Send, Sparkles, Star, Trash2, Upload,
  User, Users, X, XCircle, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT, LanguageContext } from "../i18n/index.jsx";
import { callClaude, logEvent } from "../lib/utils.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { usePlanConfig, usePlatformBranding } from "../hooks/useSystemSettings.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { Select } from "./ui.jsx";
import { DEFAULT_PLAN_CONFIG, PLAN_BADGE, ROLE_TO_PLAN_TYPE } from "../lib/businessConstants.js";

function Badge({ children, className = "" }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>{children}</span>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function PendingApprovalScreen({ auth }) {
  const { t } = useT();
  const isRejected = auth.profile?.verification_status === 'rejected';
  const rejectionReason = auth.profile?.rejection_reason;
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!auth.user?.id || isRejected) return;
    const channel = supabase.channel(`approval-${auth.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${auth.user.id}` },
        (payload) => { if (payload.new?.verification_status === 'approved') window.location.reload(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth.user?.id, isRejected]);

  async function recheckStatus() {
    setChecking(true);
    const { data } = await supabase.from("users").select("verification_status").eq("id", auth.user?.id).single();
    if (data?.verification_status === 'approved') window.location.reload();
    setChecking(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center space-y-5">
        {isRejected ? (
          <>
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <XCircle size={32} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t("pending.rejected_title")}</h1>
              <p className="text-sm text-gray-500 mt-1">{t("pending.rejected_body")}</p>
            </div>
            {rejectionReason && (
              <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700 text-left">
                <p className="font-medium mb-0.5">Reason provided:</p>
                <p>{rejectionReason}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">If you believe this is a mistake, please contact our team.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t("pending.title")}</h1>
              <p className="text-sm text-gray-500 mt-2">
                {t("pending.subtitle")}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Signed up as</p>
              <p className="text-sm font-semibold text-gray-800">{auth.profile?.full_name || auth.user?.email}</p>
              <p className="text-xs text-gray-500 capitalize">{auth.profile?.role}</p>
            </div>
            <p className="text-xs text-gray-400">This usually takes 1–2 business days.</p>
            <button onClick={recheckStatus} disabled={checking}
              className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50 transition-colors">
              {checking ? "Checking…" : "Check approval status"}
            </button>
          </>
        )}
        {(() => {
          const [confirmLogout, setConfirmLogout] = useState(false);
          return confirmLogout ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-1">Sign out?</span>
              <button onClick={() => supabase.auth.signOut()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                Yes, sign out
              </button>
              <button onClick={() => setConfirmLogout(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmLogout(true)}
              className="w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Sign out
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ── Profile onboarding gate (approved but profile not complete) ───────────────
// ── Resume / LinkedIn AI importer ────────────────────────────
function ConsultantProjectsHierarchy({ projects, onEdit, onDelete, onToggleFeatured }) {
  const [openCompanies, setOpenCompanies] = useState(() => new Set());
  const [openClients,   setOpenClients]   = useState(() => new Set());

  if (!projects?.length) return null;

  const byCompany = {};
  for (const p of projects) {
    const co = p.consulting_company || "Independent / Other";
    const cl = p.client_name        || "—";
    if (!byCompany[co]) byCompany[co] = {};
    if (!byCompany[co][cl]) byCompany[co][cl] = [];
    byCompany[co][cl].push(p);
  }

  useEffect(() => {
    setOpenCompanies(new Set(Object.keys(byCompany)));
    setOpenClients(new Set(
      Object.entries(byCompany).flatMap(([co, clients]) =>
        Object.keys(clients).map(cl => `${co}__${cl}`)
      )
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  function toggleCo(co) {
    setOpenCompanies(prev => { const n = new Set(prev); n.has(co) ? n.delete(co) : n.add(co); return n; });
  }
  function toggleCl(key) {
    setOpenClients(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="space-y-2">
      {Object.entries(byCompany).map(([co, clients]) => {
        const coOpen = openCompanies.has(co);
        const totalProj = Object.values(clients).reduce((s, arr) => s + arr.length, 0);
        return (
          <div key={co} className="border border-gray-200 rounded-2xl overflow-hidden">
            <button onClick={() => toggleCo(co)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900 truncate">{co}</div>
                <div className="text-[11px] text-gray-400">{totalProj} project{totalProj !== 1 ? "s" : ""} · {Object.keys(clients).length} client{Object.keys(clients).length !== 1 ? "s" : ""}</div>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${coOpen ? "rotate-180" : ""}`} />
            </button>

            {coOpen && (
              <div className="divide-y divide-gray-100">
                {Object.entries(clients).map(([cl, projs]) => {
                  const clKey = `${co}__${cl}`;
                  const clOpen = openClients.has(clKey);
                  return (
                    <div key={cl}>
                      <button onClick={() => toggleCl(clKey)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 pl-6 bg-white hover:bg-gray-50 transition-colors text-left">
                        <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-200 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-700 truncate">{cl}</div>
                          <div className="text-[11px] text-gray-400">{projs.length} project{projs.length !== 1 ? "s" : ""}</div>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${clOpen ? "rotate-180" : ""}`} />
                      </button>

                      {clOpen && (
                        <div className="pl-8 pr-4 pb-2 space-y-2">
                          {projs.map(p => (
                            <div key={p.id ?? p.title} className="border border-gray-100 rounded-xl p-3 bg-white">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-gray-900">{p.title}</span>
                                    {p.role && (
                                      <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-semibold rounded-full flex-shrink-0">
                                        {p.role}
                                      </span>
                                    )}
                                  </div>
                                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                                  {p.tech_stack?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {p.tech_stack.map(s => (
                                        <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{s}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {p.url && (
                                    <a href={p.url} target="_blank" rel="noreferrer"
                                      className="text-[11px] text-blue-500 hover:underline mr-1">
                                      View
                                    </a>
                                  )}
                                  {onToggleFeatured && (
                                    <button onClick={() => onToggleFeatured(p)}
                                      title={p.featured ? "Remove from featured" : "Mark as featured"}
                                      className={`p-1 rounded-lg transition-colors ${p.featured ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-amber-400"}`}>
                                      <Star className="w-3.5 h-3.5" fill={p.featured ? "currentColor" : "none"} />
                                    </button>
                                  )}
                                  {onEdit && (
                                    <button onClick={() => onEdit(p)}
                                      className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {onDelete && (
                                    <button onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) onDelete(p.id); }}
                                      className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RESUME_SECTIONS = [
  {
    key: "bio",
    label: "Bio & Headline",
    icon: "User",
    fields: ["full_name", "headline", "bio"],
    schema: `  "full_name": "string or null",\n  "headline": "one-line professional title or null",\n  "bio": "2-3 sentence professional summary or null"`,
  },
  {
    key: "skills",
    label: "Skills",
    icon: "Zap",
    fields: ["skills", "years_experience", "industry", "company_name"],
    schema: `  "skills": ["array of specific technical skills, tools, methodologies"],\n  "years_experience": integer or null,\n  "company_name": "current or most recent employer or null",\n  "industry": "primary industry vertical or null"`,
  },
  {
    key: "experience",
    label: "Work Experience",
    icon: "Briefcase",
    fields: ["work_experience"],
    schema: `  "work_experience": [\n    {\n      "company_name": "employer name",\n      "role_held": "job title",\n      "start_date": "YYYY-MM or null",\n      "end_date": "YYYY-MM or null (null if current)",\n      "description": "brief role description or null"\n    }\n  ]`,
  },
  {
    key: "projects",
    label: "Projects",
    icon: "FolderOpen",
    fields: ["projects"],
    schema: `  "projects": [\n    {\n      "title": "project name",\n      "consulting_company": "the consulting firm or employer through which this project was done or null",\n      "client_name": "end-client company name or null",\n      "role": "the consultant's role on this project or null",\n      "description": "what the project was about",\n      "tech_stack": ["technologies used"],\n      "url": "project URL or null"\n    }\n  ]`,
  },
  {
    key: "contact",
    label: "Contact & Rates",
    icon: "Link",
    fields: ["linkedin_url", "hourly_rate"],
    schema: `  "linkedin_url": "URL string or null",\n  "hourly_rate": integer or null`,
  },
];

function ResumeImporter({ onExtracted }) {
  const [mode, setMode]         = useState("upload");
  const [pasted, setPasted]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");
  const [selected, setSelected] = useState(new Set(RESUME_SECTIONS.map(s => s.key)));
  const [pending, setPending]   = useState(null);
  const fileRef                 = useRef(null);
  const { isDark }              = useTheme();

  function toggleSection(key) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
    setDone(false); setError(""); setPending(null);
  }

  function buildSystem() {
    const active = RESUME_SECTIONS.filter(s => selected.has(s.key));
    const schemaLines = active.map(s => s.schema).join(",\n");
    const notes = [];
    if (selected.has("experience")) notes.push("work_experience should list all past and current jobs.");
    if (selected.has("projects"))   notes.push("projects should list notable professional or personal projects.");
    notes.push("Only populate fields where clear evidence exists in the source.");
    return `You are a professional profile data extractor.\nExtract structured information from the provided resume or profile text.\nReturn ONLY valid JSON — no markdown fences, no explanation — matching exactly:\n{\n${schemaLines}\n}\n${notes.join(" ")}`;
  }

  async function runExtraction(messages) {
    if (selected.size === 0) { setError("Select at least one section to extract."); return; }
    setLoading(true); setError(""); setDone(false); setPending(null);
    try {
      const system = buildSystem();
      const raw = await callClaude({ system, messages, max_tokens: 8192, model: "claude-haiku-5-5" });
      const start = raw.indexOf("{");
      const end   = raw.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON object in response");
      const full = JSON.parse(raw.slice(start, end + 1));
      const allowed = new Set(RESUME_SECTIONS.filter(s => selected.has(s.key)).flatMap(s => s.fields));
      const filtered = Object.fromEntries(Object.entries(full).filter(([k]) => allowed.has(k)));
      setPending(filtered); // show preview instead of saving immediately
    } catch (e) {
      console.error("ResumeImporter extraction error:", e);
      setError("Could not read the content. Try the paste option or fill in manually.");
    }
    setLoading(false);
  }

  function handleConfirm() {
    if (!pending) return;
    onExtracted(pending);
    setPending(null);
    setDone(true);
  }

  function handleDiscard() {
    setPending(null);
    setError("");
  }

  async function handleFile(file) {
    if (!file || file.type !== "application/pdf") { setError("Please select a PDF file."); return; }
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    runExtraction([{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Extract the requested profile information from this resume." }
      ]
    }]);
  }

  function handlePaste() {
    if (!pasted.trim()) return;
    runExtraction([{ role: "user", content: pasted.trim() }]);
  }

  const SectionIcons = { User, Zap, Briefcase, FolderOpen, Link };

  // Build preview rows from extracted data
  function buildPreviewRows(data) {
    const rows = [];
    if (data.full_name || data.headline || data.bio) {
      const parts = [];
      if (data.headline) parts.push(data.headline);
      if (data.bio)      parts.push(`"${data.bio.slice(0, 80)}${data.bio.length > 80 ? "…" : ""}"`);
      rows.push({ label: "Bio & Headline", count: null, detail: parts });
    }
    if (data.skills?.length) {
      rows.push({ label: "Skills", count: data.skills.length, detail: [data.skills.slice(0, 5).join(", ") + (data.skills.length > 5 ? ` +${data.skills.length - 5} more` : "")] });
    }
    if (data.work_experience?.length) {
      rows.push({ label: "Work Experience", count: data.work_experience.length, detail: data.work_experience.slice(0, 4).map(e => `· ${e.company_name}${e.role_held ? ` — ${e.role_held}` : ""}`).concat(data.work_experience.length > 4 ? [`· …${data.work_experience.length - 4} more`] : []) });
    }
    if (data.projects?.length) {
      rows.push({ label: "Projects", count: data.projects.length, detail: data.projects.slice(0, 4).map(p => `· ${p.title}${p.client_name ? ` — ${p.client_name}` : ""}`).concat(data.projects.length > 4 ? [`· …${data.projects.length - 4} more`] : []) });
    }
    if (data.linkedin_url || data.hourly_rate) {
      const parts = [];
      if (data.linkedin_url) parts.push("LinkedIn URL");
      if (data.hourly_rate)  parts.push(`$${data.hourly_rate}/hr`);
      rows.push({ label: "Contact & Rates", count: null, detail: parts });
    }
    return rows;
  }

  return (
    <div className="rounded-2xl border p-4 mb-2"
      style={{borderColor:'var(--t-border)',background:isDark?'rgba(79,110,247,.08)':'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-semibold" style={{color:'var(--t-text)'}}>Fill with AI</span>
        <span className="text-xs ml-1" style={{color:'var(--t-text2)'}}>optional · takes ~5 sec</span>
      </div>

      {/* Preview / confirm step */}
      {pending ? (
        <div className="rounded-2xl border p-4" style={{background:'var(--t-card-bg)',borderColor:'var(--t-border)'}}>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-semibold" style={{color:'var(--t-text)'}}>Found in your resume</span>
          </div>
          <div className="space-y-3 mb-4">
            {buildPreviewRows(pending).map(row => (
              <div key={row.label} className="flex gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{color:'var(--t-text)'}}>{row.label}</span>
                    {row.count !== null && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md"
                        style={{background:'var(--t-tab-inactive)',color:'var(--t-text)'}}>{row.count}</span>
                    )}
                  </div>
                  {row.detail.map((d, i) => (
                    <p key={i} className="text-[11px] mt-0.5 truncate" style={{color:'var(--t-text2)'}}>{d}</p>
                  ))}
                </div>
              </div>
            ))}
            {buildPreviewRows(pending).length === 0 && (
              <p className="text-xs" style={{color:'var(--t-text2)'}}>Nothing useful was found — try pasting the text instead.</p>
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t" style={{borderColor:'var(--t-border)'}}>
            <button onClick={handleConfirm}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />Apply to profile
            </button>
            <button onClick={handleDiscard}
              className="px-4 py-2 text-xs font-semibold rounded-xl transition-colors"
              style={{border:'1px solid var(--t-border)',color:'var(--t-text)',background:'var(--t-tab-inactive)'}}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Section selector */}
          <p className="text-[11px] font-semibold mb-1.5 uppercase tracking-wide" style={{color:'var(--t-text2)'}}>What to extract</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {RESUME_SECTIONS.map(s => {
              const Icon = SectionIcons[s.icon] ?? Sparkles;
              const active = selected.has(s.key);
              return (
                <button key={s.key} onClick={() => toggleSection(s.key)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
                  style={active
                    ? {background:'#2563eb',color:'#fff',borderColor:'#2563eb'}
                    : {background:'var(--t-tab-inactive)',color:'var(--t-text)',borderColor:'var(--t-border)'}}>
                  <Icon className="w-3 h-3" />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Upload / Paste toggle */}
          <div className="flex gap-1 rounded-lg p-0.5 mb-3 w-fit" style={{background:'var(--t-tab-inactive)'}}>
            {[["upload","Upload PDF"],["paste","Paste text"]].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setDone(false); }}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                style={mode===m
                  ? {background:'var(--t-card-bg)',color:'var(--t-text)',boxShadow:'0 1px 3px rgba(0,0,0,.15)'}
                  : {color:'var(--t-text2)'}}>
                {l}
              </button>
            ))}
          </div>

          {mode === "upload" && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); e.target.value=""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-medium transition-all disabled:opacity-50"
                style={{borderColor:'var(--t-border)',color:'var(--t-text)',background:'var(--t-tab-inactive)'}}>
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Reading resume…</>
                  : <><Upload className="w-4 h-4" />Choose PDF resume</>}
              </button>
              <p className="text-[10px] mt-1.5 text-center" style={{color:'var(--t-text2)'}}>PDF only · never stored · read in your browser</p>
            </>
          )}

          {mode === "paste" && (
            <div className="space-y-2">
              <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={4}
                className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                style={{background:'var(--t-card-bg)',border:'1px solid var(--t-border)',color:'var(--t-text)'}}
                placeholder="Paste your LinkedIn About section, bio, CV text, or any professional description…" />
              <button onClick={handlePaste} disabled={loading || !pasted.trim()}
                className="w-full py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {loading
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Extracting…</>
                  : <><Sparkles className="w-3 h-3" />Extract profile info</>}
              </button>
            </div>
          )}
        </>
      )}

      {done && !error && !pending && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          Fields applied — review and adjust below before saving.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function ProfileOnboardingScreen({ auth }) {
  const { t } = useT();
  const branding = usePlatformBranding();
  const [showWizard, setShowWizard] = useState(false);
  const [allDone, setAllDone] = useState(false);

  if (allDone) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("ob.all_set")}</h2>
          <p className="text-gray-500 mb-7">Your profile is complete. Welcome to {branding.platformName}.</p>
          <button onClick={() => auth.refreshProfile()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EAF4FD]">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-gray-900 text-lg">{branding.platformName}</span>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
            {(auth.profile?.full_name ?? "?")[0].toUpperCase()}
          </div>
          <span className="text-sm text-gray-600 hidden sm:block">{auth.profile?.full_name}</span>
          {(() => {
            const [confirmLogout2, setConfirmLogout2] = useState(false);
            return confirmLogout2 ? (
              <div className="flex items-center gap-1.5 ml-3">
                <span className="text-xs text-gray-500">Sign out?</span>
                <button onClick={() => supabase.auth.signOut()}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">Yes</button>
                <button onClick={() => setConfirmLogout2(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmLogout2(true)} className="ml-3 text-xs text-gray-400 hover:text-gray-600">Sign out</button>
            );
          })()}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-5">
        {/* Approval alert */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Account approved</p>
            <p className="text-sm text-green-700 mt-0.5">
              Welcome, {auth.profile?.full_name?.split(" ")[0] ?? "there"}! Your account has been approved by the team.
            </p>
          </div>
        </div>

        {/* Profile completion card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Complete your profile</h2>
              <p className="text-sm text-gray-500 mt-0.5">Takes ~2 min · Required to access the platform</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-7">
            {(auth.profile?.role === "consultant" ? ["Basic info","Professional details"] : ["Basic info"]).map((label, i, arr) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">{i + 1}</div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
                {i < arr.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>

          <button onClick={() => setShowWizard(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
            Set up my profile →
          </button>
        </div>
      </div>

      {showWizard && (
        <ProfileCompleteWizard
          auth={auth}
          onDone={() => { setShowWizard(false); setAllDone(true); }}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

const ROLE_LABELS = {
  consultant:           "Consultant",
  client:               "Client / Company",
  headhunter:           "Headhunter",
  key_user:             "Key User",
  final_user:           "Final User",
  internal_consultant:  "Internal Consultant",
  project_manager:      "Project Manager",
};

function ProfileCompleteWizard({ auth, onDone, onClose }) {
  const { t } = useT();
  const [role,          setRole]          = useState(auth.profile?.role ?? "consultant");
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [step,          setStep]          = useState(1);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  const cpConsRaw = auth.profile?.consultant_profiles;
  const cpCons = Array.isArray(cpConsRaw) ? cpConsRaw[0] : cpConsRaw;
  const cpCliRaw = auth.profile?.client_profiles;
  const cpCli = Array.isArray(cpCliRaw) ? cpCliRaw[0] : cpCliRaw;

  const [fullName,      setFullName]      = useState(auth.profile?.full_name ?? "");
  const [password,      setPassword]      = useState("");
  const [confirmPwd,    setConfirmPwd]    = useState("");
  const [headline,      setHeadline]      = useState(cpCons?.headline ?? "");
  const [bio,           setBio]           = useState(cpCons?.bio ?? "");
  const [skills,        setSkills]        = useState((cpCons?.skills ?? []).join(", "));
  const [yearsExp,      setYearsExp]      = useState(cpCons?.years_experience ?? "");
  const [hourlyRate,    setHourlyRate]    = useState(cpCons?.hourly_rate ?? "");
  const [expertiseLvl,  setExpertiseLvl]  = useState(cpCons?.expertise_level ?? "intermediate");
  const [companyName,   setCompanyName]   = useState(cpCli?.company_name ?? "");
  const [industry,      setIndustry]      = useState(cpCli?.industry ?? "");
  const [website,       setWebsite]       = useState(cpCli?.website ?? "");
  const [specialty,     setSpecialty]     = useState("");
  const [region,        setRegion]        = useState("");

  const [aiFields, setAiFields]           = useState(new Set());
  const [aiExperiences, setAiExperiences] = useState([]);
  const [aiProjects, setAiProjects]       = useState([]);

  function handleAiExtracted(data) {
    const filled = new Set();
    if (data.full_name)          { setFullName(data.full_name); filled.add("full_name"); }
    if (data.headline)           { setHeadline(data.headline); filled.add("headline"); }
    if (data.bio)                { setBio(data.bio); filled.add("bio"); }
    if (data.skills?.length)     { setSkills(data.skills.join(", ")); filled.add("skills"); }
    if (data.years_experience)   { setYearsExp(String(data.years_experience)); filled.add("years_experience"); }
    if (data.hourly_rate)        { setHourlyRate(String(data.hourly_rate)); filled.add("hourly_rate"); }
    if (data.company_name)       { setCompanyName(data.company_name); filled.add("company_name"); }
    if (data.industry)           { setIndustry(data.industry); filled.add("industry"); }
    if (data.work_experience?.length) { setAiExperiences(data.work_experience); filled.add("work_experience"); }
    if (data.projects?.length)        { setAiProjects(data.projects); filled.add("projects"); }
    setAiFields(filled);
  }

  const totalSteps = role === "consultant" ? 2 : 1;

  const pwdOk = password.length >= 6 && password === confirmPwd;
  const canProceed = step === 1
    ? fullName.trim().length > 0 && (role !== "client" || companyName.trim().length > 0) && pwdOk
    : role === "consultant" ? headline.trim().length > 0 : true;

  async function handleFinish() {
    setSaving(true); setError("");

    // Only update password if the user entered one
    if (password.length > 0) {
      if (!pwdOk) { setError("Passwords don't match or are too short (min 6 characters)."); setSaving(false); return; }
      const { error: pwdErr } = await supabase.auth.updateUser({ password });
      if (pwdErr) { setError(pwdErr.message); setSaving(false); return; }
    }

    // Update users table: name + role
    const { error: userErr } = await supabase
      .from("users")
      .update({ full_name: fullName.trim(), role })
      .eq("id", auth.user.id);
    if (userErr) { setError(userErr.message); setSaving(false); return; }

    // Upsert role-specific profile
    if (role === "consultant") {
      const { error: cpErr } = await supabase.from("consultant_profiles").upsert({
        id: auth.user.id,
        headline: headline.trim(),
        bio: bio.trim() || null,
        skills: skills.split(",").map(s => s.trim()).filter(Boolean),
        years_experience: yearsExp ? parseInt(yearsExp, 10) : null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
        expertise_level: expertiseLvl,
        availability_type: 'project_based',
      }, { onConflict: "id" });
      if (cpErr) { setError(cpErr.message); setSaving(false); return; }
      // Insert AI-extracted work experience
      for (const exp of aiExperiences) {
        await supabase.from("consultant_customers").insert({
          consultant_id: auth.user.id,
          company_name: exp.company_name || "",
          role_held:    exp.role_held    || null,
          start_date:   exp.start_date   || null,
          end_date:     exp.end_date     || null,
          description:  exp.description  || null,
        });
      }
      // Auto-create consultant_customers for any consulting_company on projects not already in work experience
      const expNames = new Set(aiExperiences.map(e => (e.company_name || "").toLowerCase()));
      const seen = new Set();
      for (const proj of aiProjects) {
        const co = proj.consulting_company?.trim();
        if (co && !expNames.has(co.toLowerCase()) && !seen.has(co.toLowerCase())) {
          seen.add(co.toLowerCase());
          await supabase.from("consultant_customers").insert({
            consultant_id: auth.user.id,
            company_name:  co,
          });
        }
      }
      // Insert projects
      for (const proj of aiProjects) {
        await supabase.from("consultant_projects").insert({
          consultant_id:      auth.user.id,
          title:              proj.title              || "",
          consulting_company: proj.consulting_company || null,
          client_name:        proj.client_name        || null,
          role:               proj.role               || null,
          description:        proj.description        || null,
          tech_stack:         proj.tech_stack         || [],
          url:                proj.url                || null,
        });
      }
    } else if (role === "client") {
      const { error: cpErr } = await supabase.from("client_profiles").upsert({
        id: auth.user.id,
        company_name: companyName.trim(),
        industry: industry || null,
        website: website.trim() || null,
      }, { onConflict: "id" });
      if (cpErr) { setError(cpErr.message); setSaving(false); return; }
    }

    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-7 pt-7 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Complete your profile</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full flex-1 transition-all ${i < step ? "bg-blue-500" : "bg-gray-200"}`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Step {step} of {totalSteps}</p>
        </div>

        {/* Step content */}
        <div className="px-7 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your full name" />
              </div>

              <div>
                <button type="button" onClick={() => setShowRolePicker(v => !v)}
                  className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                  {showRolePicker ? "▲ Hide" : "Wrong account type? Change it"}
                </button>
                {showRolePicker && (
                  <select value={role} onChange={e => setRole(e.target.value)}
                    className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
              </div>

              {role === "client" && (<>
                <ResumeImporter onExtracted={handleAiExtracted} />
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Company name</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your company" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select industry</option>
                    {["Technology","Finance & Banking","Healthcare","Legal","Manufacturing","Retail & Commerce","Energy & Utilities","Public Sector","Other"].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input value={website} onChange={e => setWebsite(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://yourcompany.com" />
                </div>
              </>)}
              {role === "headhunter" && (<>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Specialty</label>
                  <input value={specialty} onChange={e => setSpecialty(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. SAP talent, Tech recruiting" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Region</label>
                  <input value={region} onChange={e => setRegion(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. LATAM, North America" />
                </div>
              </>)}
              {(role === "key_user" || role === "final_user") && (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">Confirm your name above and you're good to go.</p>
              )}

              {/* Password — required so user can log back in after logout */}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-semibold text-gray-700 mb-0.5">Set your password</label>
                <p className="text-xs text-gray-400 mb-2">Required to log in after you sign out. Minimum 6 characters.</p>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  placeholder="Password (min 6 characters)" />
                <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${confirmPwd && confirmPwd !== password ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                  placeholder="Confirm password" />
                {confirmPwd && confirmPwd !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                )}
              </div>
            </>
          )}

          {step === 2 && role === "consultant" && (
            <>
              <ResumeImporter onExtracted={handleAiExtracted} />
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Professional headline</label>
                <input value={headline} onChange={e => setHeadline(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. SAP FICO Consultant · 10 years" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Skills <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                <input value={skills} onChange={e => setSkills(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="SAP FICO, S/4HANA, Fiori" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Years experience</label>
                  <input type="number" min="0" max="50" value={yearsExp} onChange={e => setYearsExp(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="8" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hourly rate (USD)</label>
                  <input type="number" min="0" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="150" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Expertise level</label>
                <div className="flex gap-2">
                  {["beginner","intermediate","expert"].map(l => (
                    <button key={l} onClick={() => setExpertiseLvl(l)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all capitalize ${expertiseLvl === l ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bio <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Brief professional summary…" />
              </div>
            </>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-7 py-5 flex gap-3 border-t border-gray-100 mt-4">
          {step > 1
            ? <button onClick={() => setStep(s => s - 1)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">← Back</button>
            : <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">{t("ob.later")}</button>
          }
          {step < totalSteps
            ? <button onClick={() => setStep(s => s + 1)} disabled={!canProceed}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">Continue →</button>
            : <button onClick={handleFinish} disabled={saving || !canProceed}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />{t("state.saving")}</> : t("ob.finish")}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <LanguageContext.Consumer>
          {({ t }) => (
            <div className="flex items-center justify-center h-64 p-8">
              <div className="text-center space-y-3 max-w-sm">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{t("error.boundary_title")}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t("error.boundary_desc")}</p>
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  {t("error.boundary_retry")}
                </button>
              </div>
            </div>
          )}
        </LanguageContext.Consumer>
      );
    }
    return this.props.children;
  }
}

function TrustBadge({ level, size = 'sm' }) {
  if (!level || level === 'starter') return null;
  const cfg = {
    silver:   { label: 'Silver',   cls: 'bg-gray-100 text-gray-600 border border-gray-300' },
    gold:     { label: 'Gold',     cls: 'bg-yellow-50 text-yellow-700 border border-yellow-300' },
    platinum: { label: 'Platinum', cls: 'bg-purple-50 text-purple-700 border border-purple-300' },
  }[level] ?? { label: level, cls: 'bg-gray-100 text-gray-500' };
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0 rounded' : 'text-xs px-2 py-0.5 rounded-full';
  return <span className={`inline-flex items-center font-medium ${sz} ${cfg.cls}`}>{cfg.label}</span>;
}

// ============================================================
// TIER PROGRESS BAR
// ============================================================
function TierProgressBar({ ratingsData, currentTier, thresholds }) {
  const { t } = useT();
  const TIER_ORDER = ['starter', 'silver', 'gold', 'platinum'];
  const currentIdx = TIER_ORDER.indexOf(currentTier ?? 'starter');
  const nextTier = TIER_ORDER[currentIdx + 1];

  if (!nextTier) {
    return (
      <div className="flex items-center gap-2 text-purple-700 text-sm font-medium">
        <TrustBadge level="platinum" size="sm" />
        <span>{t('profile.top_tier')}</span>
      </div>
    );
  }

  const nextThresholds = thresholds[nextTier] ?? {};
  const minCases = nextThresholds.cases ?? nextThresholds.min_cases ?? 1;
  const minRating = nextThresholds.min_rating ?? nextThresholds.min_avg_rating ?? 3.5;

  const caseIds = new Set((ratingsData ?? []).map(r => r.case_id));
  const completedRatedCases = caseIds.size;

  const ratingsWithAvg = (ratingsData ?? []).map(r => {
    const vals = Object.values(r.scores ?? {});
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });
  const currentAvg = ratingsWithAvg.length > 0
    ? ratingsWithAvg.reduce((s, v) => s + v, 0) / ratingsWithAvg.length
    : 0;

  const casesPct = Math.min(100, Math.round((completedRatedCases / Math.max(minCases, 1)) * 100));
  const ratingMet = currentAvg >= minRating;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">{t('profile.current_tier')}:</span>
        {currentTier && currentTier !== 'starter'
          ? <TrustBadge level={currentTier} size="sm" />
          : <span className="text-xs text-gray-600 capitalize">{currentTier ?? 'Starter'}</span>}
        <span className="text-gray-300 text-xs">→</span>
        <span className="text-xs text-gray-500 font-medium">{t('profile.next_tier')}:</span>
        <TrustBadge level={nextTier} size="sm" />
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t('profile.completed_cases')}</span>
          <span className="font-semibold">{completedRatedCases} / {minCases}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${casesPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{t('profile.avg_rating')}</span>
        <span className={`font-semibold ${ratingMet ? 'text-green-600' : 'text-gray-700'}`}>
          {currentAvg > 0 ? currentAvg.toFixed(2) : '—'} / {minRating}{ratingMet ? ' ✓' : ''}
        </span>
      </div>
      {completedRatedCases < minCases && (
        <p className="text-xs text-gray-400">
          {t('profile.cases_to_go').replace('{n}', Math.max(0, minCases - completedRatedCases))}
        </p>
      )}
    </div>
  );
}

// ============================================================
// VOUCHING PANEL
// ============================================================
function VouchingPanel({ targetUserId, targetName }) {
  const auth = useAuth();
  const { t } = useT();
  const [vouches, setVouches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const isPlatinum = auth.profile?.trust_level === 'platinum';
  const isSelf = auth.user?.id === targetUserId;

  useEffect(() => {
    if (!targetUserId) return;
    setLoading(true);
    supabase.from('user_vouches')
      .select('id, voucher_id, note, created_at, profiles!voucher_id(full_name)')
      .eq('vouchee_id', targetUserId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setVouches(data ?? []);
        setLoading(false);
      });
  }, [targetUserId]);

  const alreadyVouched = vouches.some(v => v.voucher_id === auth.user?.id);

  async function handleVouch() {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_vouches').insert({
        voucher_id: auth.user.id,
        vouchee_id: targetUserId,
        note: note.trim() || null,
      });
      if (!error) {
        await supabase.rpc('recalculate_trust_level', { p_user_id: targetUserId });
        notify(targetUserId, 'Someone vouched for you', `${auth.profile?.full_name ?? 'A platinum consultant'} vouched for you.`);
        logEvent('vouch.submitted', { entityType: 'user', entityId: targetUserId, entityName: targetName });
        // Refresh vouches
        const { data } = await supabase.from('user_vouches')
          .select('id, voucher_id, note, created_at, profiles!voucher_id(full_name)')
          .eq('vouchee_id', targetUserId)
          .order('created_at', { ascending: false });
        setVouches(data ?? []);
        setNote('');
        setToast(t('vouch.submitted_toast'));
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      // error is fire-and-forget
    }
    setSubmitting(false);
  }

  if (loading) return <div className="py-4 text-center text-gray-400 text-sm"><Spinner /></div>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      {/* Vouch count heading */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">{t('vouch.tab')}</h3>
        <span className="text-xs text-gray-500">{t('vouch.count').replace('{n}', vouches.length)}</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700">{toast}</div>
      )}

      {/* Vouchers list */}
      {vouches.length === 0 ? (
        <p className="text-sm text-gray-400">{t('vouch.none')}</p>
      ) : (
        <div className="space-y-2">
          {vouches.map(v => (
            <div key={v.id} className="flex items-start gap-3 text-sm">
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">
                {(v.profiles?.full_name ?? '?')[0]}
              </div>
              <div className="min-w-0">
                <span className="font-medium text-gray-800">{v.profiles?.full_name ?? '—'}</span>
                {v.note && <p className="text-xs text-gray-500 mt-0.5 truncate">{v.note}</p>}
                <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit vouch — platinum only, not self */}
      {!isSelf && isPlatinum && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">{t('vouch.panel_title')}</p>
          {alreadyVouched ? (
            <p className="text-sm text-green-700">{t('vouch.already_vouched').replace('{name}', targetName ?? '')}</p>
          ) : (
            <>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder={t('vouch.note_ph')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
              />
              <button
                onClick={handleVouch}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
                {submitting ? t('vouch.submitting') : t('vouch.submit')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONSULTANT PROFILE VIEW
// ============================================================
function PlanUsageCard({ auth }) {
  const planCfg    = usePlanConfig();
  const roleType   = ROLE_TO_PLAN_TYPE[auth.profile?.role] ?? null;
  const billingId  = auth.billingUserId;
  const curPlan    = roleType ? planCfg.getUserPlan(billingId) : null;
  const limits     = roleType ? planCfg.getPlanLimits(billingId, roleType, auth.profile?.role) : {};

  const [usage, setUsage]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(null);

  useEffect(() => {
    if (!billingId || !roleType) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const ownId = auth.user?.id;

      if (roleType === 'client') {
        const [{ count: activeCases }, { count: teamCount }] = await Promise.all([
          supabase.from('cases').select('id', { count: 'exact', head: true })
            .eq('client_id', billingId).not('status', 'in', '(closed,completed,cancelled)'),
          supabase.from('client_team_members').select('id', { count: 'exact', head: true })
            .eq('client_id', billingId),
        ]);
        setUsage({ activeCases: activeCases ?? 0, teamCount: teamCount ?? 0 });
      } else if (roleType === 'consultant') {
        const { count: monthlyApps } = await supabase.from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('consultant_id', ownId)
          .gte('created_at', startOfMonth);
        const { count: totalApps } = await supabase.from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('consultant_id', ownId);
        setUsage({ monthlyApps: monthlyApps ?? 0, totalApps: totalApps ?? 0 });
      } else if (roleType === 'headhunter') {
        const { count: candidates } = await supabase.from('users')
          .select('id', { count: 'exact', head: true })
          .eq('headhunter_id', ownId);
        setUsage({ candidates: candidates ?? 0 });
      }
      setLoading(false);
    })();
  }, [billingId, roleType]);

  if (!roleType || !curPlan) return null;

  const planLabel = (planCfg.config[roleType]?.[curPlan] ?? DEFAULT_PLAN_CONFIG[roleType]?.[curPlan])?.label ?? curPlan;

  function UsageBar({ label, used, max, icon: Icon }) {
    if (max === undefined || max === null) return null;
    const unlimited = max === -1;
    const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
    const nearLimit = !unlimited && pct >= 80;
    const atLimit   = !unlimited && used >= max;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-gray-600 font-medium">
            {Icon && <Icon size={13} className="text-gray-400" />}{label}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${atLimit ? 'text-red-600' : nearLimit ? 'text-amber-600' : 'text-gray-500'}`}>
            {unlimited ? <span className="text-green-600">Unlimited</span> : `${used} / ${max}`}
          </span>
        </div>
        {!unlimited && (
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${atLimit ? 'bg-red-500' : nearLimit ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  }

  function FeatureChip({ label, enabled }) {
    return (
      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
        enabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'
      }`}>
        {enabled ? <Check size={11} /> : <X size={11} />}{label}
      </div>
    );
  }

  const UPGRADE_LADDER = {
    client:     { free: 'growth', growth: 'enterprise' },
    consultant: { free: 'pro' },
    headhunter: { free: 'pro', pro: 'agency' },
  };
  const ladder = UPGRADE_LADDER[roleType] ?? {};
  const canUpgrade = !!ladder[curPlan];
  const nextPlanKey = ladder[curPlan] ?? null;

  return (
    <>
      {upgradeModal && (
        <UpgradeModal
          title={upgradeModal.title}
          message={upgradeModal.message}
          roleType={roleType}
          planKey={nextPlanKey ?? 'professional'}
          auth={auth}
          onClose={() => setUpgradeModal(null)}
        />
      )}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Plan header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Your Plan</p>
            <span className={`text-sm px-3 py-1 rounded-full font-semibold capitalize border ${PLAN_BADGE[curPlan] ?? PLAN_BADGE.free}`}>{planLabel}</span>
          </div>
          {canUpgrade && (
            <button
              onClick={() => setUpgradeModal({ title: `Upgrade from ${planLabel}`, message: 'Unlock higher limits and more features.' })}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Zap size={13} />Upgrade
            </button>
          )}
        </div>

        {/* Usage bars */}
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-8 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {roleType === 'client' && usage && (
              <>
                <UsageBar label="Active cases"   used={usage.activeCases} max={limits.maxCases} icon={Briefcase} />
                <UsageBar label="Team members"   used={usage.teamCount}   max={limits.maxTeam}  icon={Users} />
              </>
            )}
            {roleType === 'consultant' && usage && (
              <>
                <UsageBar label="Applications this month" used={usage.monthlyApps} max={limits.maxApps}  icon={Send} />
                <UsageBar label="Total applications"      used={usage.totalApps}   max={-1}              icon={Briefcase} />
              </>
            )}
            {roleType === 'headhunter' && usage && (
              <UsageBar label="Candidates managed" used={usage.candidates} max={limits.maxCandidates} icon={Users} />
            )}
          </div>
        )}

        {/* Feature flags */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Features</p>
          <div className="flex flex-wrap gap-2">
            <FeatureChip label="AI features"   enabled={limits.ai} />
            {roleType === 'client'     && <FeatureChip label="Analytics"       enabled={limits.analytics} />}
            {roleType === 'consultant' && <FeatureChip label="Priority listing" enabled={limits.priority} />}
          </div>
        </div>
      </div>
    </>
  );
}

export { Badge, Spinner, ErrorBoundary, PendingApprovalScreen, ConsultantProjectsHierarchy, RESUME_SECTIONS, ResumeImporter, ProfileOnboardingScreen, ROLE_LABELS, ProfileCompleteWizard, TrustBadge, TierProgressBar, VouchingPanel, PlanUsageCard };
