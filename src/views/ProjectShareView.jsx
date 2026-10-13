import { useState, useEffect } from "react";
import { CheckCircle2, Clock, AlertCircle, BarChart2, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { NovaLandingMark } from "./LandingView.jsx";
import { useT } from "../i18n/index.jsx";

const STATUS_COLORS = {
  draft:     "bg-white/10 text-blue-200",
  active:    "bg-blue-500/20 text-blue-300",
  on_hold:   "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300",
  cancelled: "bg-red-500/20 text-red-300",
  assigned:  "bg-indigo-500/20 text-indigo-300",
};

const CASE_STATUS_ICON = {
  completed: <CheckCircle2 size={13} className="text-green-400" />,
  cancelled: <AlertCircle size={13} className="text-red-400" />,
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }

function PlatformName({ name }) {
  const parts = name.split(' ');
  if (parts.length > 1) {
    return <><span style={{ color: '#4F6EF7' }}>{parts[0]}</span> <span className="text-white">{parts.slice(1).join(' ')}</span></>;
  }
  return <span style={{ color: '#4F6EF7' }}>{name}</span>;
}

export default function ProjectShareView({ token }) {
  const { lang, setLang, t } = useT();
  const [project, setProject] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branding, setBranding] = useState({ name: 'Arena', tagline: 'Solutions Platform' });

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [brandRes, projRes] = await Promise.all([
        supabase.from("system_settings").select("key, value").in("key", ["platform_name", "platform_tagline"]),
        supabase.from("projects").select("id, name, description, status, start_date, end_date, area_sap").eq("share_token", token).single(),
      ]);
      if (brandRes.data) {
        const map = Object.fromEntries(brandRes.data.map(r => [r.key, r.value]));
        setBranding({ name: map['platform_name'] || 'Arena', tagline: map['platform_tagline'] || 'Solutions Platform' });
      }
      const proj = projRes.data;
      if (projRes.error || !proj) { setError("Project not found or link is invalid."); setLoading(false); return; }
      setProject(proj);
      const { data: caseRows } = await supabase
        .from("cases").select("id, title, status, priority, progress_pct, area_sap")
        .eq("project_id", proj.id).order("created_at", { ascending: true });
      setCases(caseRows ?? []);
      setLoading(false);
    }
    if (token) load();
  }, [token]);

  const BG = {
    minHeight: "100vh",
    background: "#0B0F1A",
    backgroundImage: "radial-gradient(circle at 70% -10%,rgba(79,110,247,.22) 0%,transparent 65%),linear-gradient(rgba(79,110,247,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.07) 1px,transparent 1px)",
    backgroundSize: "100% 100%,48px 48px,48px 48px",
  };

  if (loading) {
    return (
      <div style={BG} className="flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-800 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={BG} className="flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="text-blue-900 mx-auto mb-3" />
          <p className="text-blue-300">{error ?? "This link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  const total   = cases.length;
  const done    = cases.filter(c => c.status === 'completed').length;
  const active  = cases.filter(c => c.status === 'active' || c.status === 'assigned').length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const avgProg = total > 0 ? Math.round(cases.reduce((s, c) => s + (c.progress_pct ?? 0), 0) / total) : 0;

  return (
    <div style={BG}>
      {/* Header — same as login screen nav */}
      <nav className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <NovaLandingMark size={32} />
        <span className="text-sm font-bold"><PlatformName name={branding.name} /></span>
        <span className="text-white/20 mx-1">·</span>
        <span className="text-sm text-blue-400/70">{t("share.project_status")}</span>
        <button
          onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
          className="ml-auto text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg border border-blue-900 hover:border-blue-700"
          style={{ letterSpacing: '.04em' }}>
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
      </nav>

      {/* Project hero */}
      <div className="text-center pt-10 pb-8 px-4">
        <h1 className="text-2xl font-bold text-white mb-2">{project.name}</h1>
        {project.description && (
          <p className="text-blue-300/70 text-sm max-w-lg mx-auto leading-relaxed">{project.description}</p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-blue-400/60 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLORS[project.status] ?? "bg-white/10 text-blue-200"}`}>
            {cap(project.status)}
          </span>
          {project.area_sap && <span>SAP: {project.area_sap}</span>}
          {project.start_date && <span>Start: {project.start_date}</span>}
          {project.end_date && <span>End: {project.end_date}</span>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("share.total_cases"),       value: total,  icon: <FolderOpen size={16} className="text-blue-400" /> },
            { label: t("share.completed"),         value: done,   icon: <CheckCircle2 size={16} className="text-green-400" /> },
            { label: t("share.in_progress_label"), value: active, icon: <Clock size={16} className="text-amber-400" /> },
          ].map(tile => (
            <div key={tile.label} className="rounded-xl border border-white/10 p-4 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex justify-center mb-1">{tile.icon}</div>
              <p className="text-2xl font-bold text-white">{tile.value}</p>
              <p className="text-[11px] text-blue-400/60 mt-0.5">{tile.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-blue-400" />
            <span className="font-semibold text-sm text-white">{t("share.overall_progress")}</span>
            <span className="ml-auto text-sm font-bold text-blue-300">{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-blue-400/50 mt-2">
            {t("share.progress_summary").replace("{done}", done).replace("{total}", total).replace("{avg}", avgProg)}
          </p>
        </div>

        {/* Cases list */}
        {cases.length > 0 && (
          <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
              <FolderOpen size={13} className="text-blue-400" />
              <span className="text-sm font-semibold text-white">{t("share.cases")}</span>
            </div>
            <div className="divide-y divide-white/5">
              {cases.map(c => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {CASE_STATUS_ICON[c.status] ?? <Clock size={13} className="text-blue-400/50" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{c.title}</p>
                    {c.area_sap && <p className="text-xs text-blue-400/50">{c.area_sap}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.progress_pct > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.progress_pct}%` }} />
                        </div>
                        <span className="text-xs text-blue-300/60">{c.progress_pct}%</span>
                      </div>
                    )}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${STATUS_COLORS[c.status] ?? "bg-white/10 text-blue-200"}`}>
                      {cap(c.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-blue-400/30 pt-2">
          {t("share.powered_by")} <PlatformName name={branding.name} /> · {t("share.read_only")}
        </p>
      </div>
    </div>
  );
}
