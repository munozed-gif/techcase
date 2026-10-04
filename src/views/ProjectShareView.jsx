import { useState, useEffect } from "react";
import { CheckCircle2, Clock, AlertCircle, BarChart2, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { NovaLogo } from "../components/Sidebar.jsx";

const STATUS_COLORS = {
  draft:     "bg-gray-100 text-gray-600",
  active:    "bg-blue-100 text-blue-700",
  on_hold:   "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  assigned:  "bg-indigo-100 text-indigo-700",
};

const CASE_STATUS_ICON = {
  completed: <CheckCircle2 size={13} className="text-green-600" />,
  cancelled: <AlertCircle size={13} className="text-red-500" />,
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }

export default function ProjectShareView({ token }) {
  const [project, setProject] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branding, setBranding] = useState({ name: 'Arena', logoUrl: null });

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch branding and project in parallel
      const [brandRes, projRes] = await Promise.all([
        supabase.from("system_settings").select("key, value").in("key", ["platform_name", "brand_logo_url"]),
        supabase.from("projects").select("id, name, description, status, start_date, end_date, area_sap, share_token").eq("share_token", token).single(),
      ]);

      if (brandRes.data) {
        const map = Object.fromEntries(brandRes.data.map(r => [r.key, r.value]));
        setBranding({ name: map['platform_name'] || 'Arena', logoUrl: map['brand_logo_url'] || null });
      }

      const proj = projRes.data;
      if (projRes.error || !proj) { setError("Project not found or link is invalid."); setLoading(false); return; }
      setProject(proj);

      const { data: caseRows } = await supabase
        .from("cases")
        .select("id, title, status, priority, progress_pct, area_sap")
        .eq("project_id", proj.id)
        .order("created_at", { ascending: true });
      setCases(caseRows ?? []);
      setLoading(false);
    }
    if (token) load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{error ?? "This link is no longer valid."}</p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-[#0B0F1A] px-6 py-2 flex items-center gap-3">
        <NovaLogo size={32} />
        <span className="text-sm font-semibold text-white">{branding.name}</span>
        <span className="text-gray-600 mx-1">·</span>
        <span className="text-sm text-gray-400">Project Status</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Project header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h1 className="text-xl font-bold text-gray-900 leading-snug">{project.name}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
              {cap(project.status)}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">{project.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            {project.area_sap && <span>SAP Area: <span className="font-medium text-gray-600">{project.area_sap}</span></span>}
            {project.start_date && <span>Start: <span className="font-medium text-gray-600">{project.start_date}</span></span>}
            {project.end_date && <span>End: <span className="font-medium text-gray-600">{project.end_date}</span></span>}
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Cases", value: total, icon: <FolderOpen size={16} className="text-blue-500" /> },
            { label: "Completed", value: done, icon: <CheckCircle2 size={16} className="text-green-500" /> },
            { label: "In Progress", value: active, icon: <Clock size={16} className="text-amber-500" /> },
          ].map(tile => (
            <div key={tile.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <div className="flex justify-center mb-1">{tile.icon}</div>
              <p className="text-2xl font-bold text-gray-900">{tile.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{tile.label}</p>
            </div>
          ))}
        </div>

        {/* Overall progress */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} className="text-blue-600" />
            <span className="font-semibold text-sm text-gray-800">Overall Progress</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-bold text-gray-700 w-10 text-right">{pct}%</span>
          </div>
          <p className="text-xs text-gray-400">{done} of {total} cases completed · avg. {avgProg}% progress across all cases</p>
        </div>

        {/* Cases list */}
        {cases.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                <FolderOpen size={14} className="text-gray-400" />Cases
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {cases.map(c => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {CASE_STATUS_ICON[c.status] ?? <Clock size={13} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                    {c.area_sap && <p className="text-xs text-gray-400">{c.area_sap}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.progress_pct > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${c.progress_pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{c.progress_pct}%</span>
                      </div>
                    )}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {cap(c.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">
          Powered by {branding.name} · Read-only view
        </p>
      </div>
    </div>
  );
}
