import { useState, useEffect, useCallback } from "react";
import {
  Activity, Briefcase, CheckCircle2, ChevronRight, Clock, DollarSign,
  ExternalLink, LayoutGrid, Loader2, Search, Settings2, Star, Target,
  TrendingUp, User, UserCheck, UserPlus, Users, X, Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { ConsultantProfileView } from "../components/ConsultantProfileView.jsx";
import { PersonAvatar } from "./Projects.jsx";
import { Spinner } from "../components/ProfileComponents.jsx";
import { APP_STATUS_COLORS, PLAN_BADGE, ROLE_TO_PLAN_TYPE } from "../lib/businessConstants.js";
import { fmtDate, cap } from "../lib/uiUtils.jsx";
import { usePlanConfig } from "../hooks/useSystemSettings.jsx";

// ─── Shared data hook ────────────────────────────────────────────────────────
function useHeadhunterData(userId) {
  const [candidates, setCandidates]     = useState([]);
  const [applications, setApplications] = useState([]);
  const [sourcedCases, setSourcedCases] = useState([]);
  const [loading, setLoading]           = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Managed candidates
      const { data: cands } = await supabase
        .from("users")
        .select(`id, full_name, email, avatar_url,
          consultant_profiles(headline, skills, hourly_rate, years_experience, availability_status, work_mode)`)
        .eq("headhunter_id", userId);

      const candidateIds = (cands ?? []).map(c => c.id);
      setCandidates(cands ?? []);

      // 2. Their applications
      if (candidateIds.length > 0) {
        const { data: apps } = await supabase
          .from("applications")
          .select(`id, consultant_id, case_id, status, submitted_at, proposed_rate, cover_letter,
            case:case_id(id, title, status, client:client_id(id, avatar_url, client_profiles(company_name))),
            consultant:consultant_id(id, full_name, avatar_url)`)
          .in("consultant_id", candidateIds)
          .order("submitted_at", { ascending: false });
        setApplications(apps ?? []);
      } else {
        setApplications([]);
      }

      // 3. Cases attributed to this headhunter
      const profile = await supabase.from("users").select("full_name").eq("id", userId).single();
      if (profile?.data?.full_name) {
        const { data: sc } = await supabase
          .from("cases")
          .select("id, title, status, created_at, client:client_id(id, avatar_url, client_profiles(company_name))")
          .eq("is_head_hunter", true)
          .ilike("head_hunter_name", profile.data.full_name);
        setSourcedCases(sc ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { candidates, applications, sourcedCases, loading, refetch: fetch };
}

// ─── Pill component ───────────────────────────────────────────────────────────
function Pill({ children, color = "blue" }) {
  const cls = {
    blue:   "bg-blue-50 text-blue-700 border-blue-100",
    green:  "bg-green-50 text-green-700 border-green-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    amber:  "bg-amber-50 text-amber-700 border-amber-100",
    gray:   "bg-gray-50 text-gray-600 border-gray-100",
  }[color] ?? "bg-gray-50 text-gray-600 border-gray-100";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, icon: Icon, color }) {
  const ring = { blue:"border-blue-100 bg-blue-50", green:"border-green-100 bg-green-50", purple:"border-purple-100 bg-purple-50", amber:"border-amber-100 bg-amber-50" }[color];
  const txt  = { blue:"text-blue-600", green:"text-green-600", purple:"text-purple-600", amber:"text-amber-600" }[color];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${ring}`}>
        <Icon size={20} className={txt} />
      </div>
      <div className="min-w-0">
        <div className={`text-2xl font-black leading-none ${txt}`}>{value}</div>
        <div className="text-sm font-semibold text-gray-700 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function AppBadge({ status }) {
  const map = {
    pending:      { cls: "bg-amber-100 text-amber-800",  label: "Applied" },
    under_review: { cls: "bg-blue-100 text-blue-800",    label: "In Review" },
    accepted:     { cls: "bg-green-100 text-green-800",  label: "Placed" },
    rejected:     { cls: "bg-red-100 text-red-800",      label: "Declined" },
    withdrawn:    { cls: "bg-gray-100 text-gray-600",    label: "Withdrawn" },
  };
  const s = map[status] ?? { cls: "bg-gray-100 text-gray-600", label: cap(status ?? "") };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1.  HEADHUNTER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export function HeadhunterDashboard({ auth, onNavigate }) {
  const { candidates, applications, sourcedCases, loading } = useHeadhunterData(auth.user?.id);
  const planConf   = usePlanConfig(auth);
  const planType   = ROLE_TO_PLAN_TYPE[auth.profile?.role ?? "headhunter"];
  const planKey    = auth.profile?.plan_tier ?? "free";
  const planLabel  = PLAN_BADGE[planKey] ?? cap(planKey);

  const placed     = applications.filter(a => a.status === "accepted");
  const active     = applications.filter(a => a.status === "pending" || a.status === "under_review");
  const successPct = applications.length
    ? Math.round((placed.length / applications.length) * 100)
    : 0;

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner /></div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            Welcome, {auth.profile?.full_name?.split(" ")[0] ?? "Headhunter"} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Your talent placement overview</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${PLAN_BADGE[planKey] ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
            {planLabel} Plan
          </span>
          <span className="text-xs text-gray-400 font-medium">
            {candidates.length} / {planConf?.maxCandidates ?? (planKey === "free" ? 5 : "∞")} candidates
          </span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Candidates" value={candidates.length} sub="in your roster" icon={Users} color="blue" />
        <KpiTile label="Active Applications" value={active.length} sub="pending / in review" icon={Clock} color="amber" />
        <KpiTile label="Placements" value={placed.length} sub="accepted by clients" icon={UserCheck} color="green" />
        <KpiTile label="Success Rate" value={`${successPct}%`} sub={`${applications.length} total apps`} icon={TrendingUp} color="purple" />
      </div>

      {/* Sourced cases + quick actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent candidate applications */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="font-bold text-gray-900 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" /> Recent Applications
            </div>
            <button onClick={() => onNavigate?.("hh-pipeline")}
              className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
              Full pipeline <ChevronRight size={13} />
            </button>
          </div>
          {applications.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <Briefcase size={32} className="mx-auto mb-3 opacity-20" />
              No applications yet. Apply your candidates to open cases in Arena.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {applications.slice(0, 6).map(app => {
                const cand = candidates.find(c => c.id === app.consultant_id);
                const company = app.case?.client?.client_profiles?.[0]?.company_name ?? app.case?.client?.client_profiles?.company_name;
                return (
                  <div key={app.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <PersonAvatar name={app.consultant?.full_name ?? "?"} avatarUrl={app.consultant?.avatar_url} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {app.consultant?.full_name ?? "Consultant"}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {app.case?.title} {company ? `· ${company}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <AppBadge status={app.status} />
                      <span className="text-[10px] text-gray-400">{fmtDate(app.submitted_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-4">
          {/* Sourced cases */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
              <Target size={14} className="text-purple-500" /> Cases Attributed to You
            </div>
            {sourcedCases.length === 0 ? (
              <p className="text-xs text-gray-400">No attributed cases yet.</p>
            ) : (
              <div className="space-y-2">
                {sourcedCases.slice(0, 3).map(c => {
                  const co = c.client?.client_profiles?.[0]?.company_name ?? c.client?.client_profiles?.company_name;
                  return (
                    <div key={c.id} className="text-xs flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "closed" ? "bg-gray-300" : "bg-green-400"}`} />
                      <span className="font-medium text-gray-700 truncate">{c.title}</span>
                      {co && <span className="text-gray-400 flex-shrink-0">· {co}</span>}
                    </div>
                  );
                })}
                {sourcedCases.length > 3 && (
                  <button onClick={() => onNavigate?.("hh-placements")}
                    className="text-xs text-blue-600 hover:underline mt-1">
                    +{sourcedCases.length - 3} more
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="font-bold text-gray-900 text-sm mb-3">Quick Actions</div>
            {[
              { label: "Browse Open Cases",    icon: Target,     view: "arena",         color: "blue" },
              { label: "My Talent Roster",     icon: Users,      view: "hh-candidates", color: "purple" },
              { label: "Placement Pipeline",   icon: LayoutGrid, view: "hh-pipeline",   color: "amber" },
              { label: "Placement History",    icon: UserCheck,  view: "hh-placements", color: "green" },
            ].map(a => (
              <button key={a.view} onClick={() => onNavigate?.(a.view)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-left transition-colors">
                <a.icon size={15} className={`text-${a.color}-500 flex-shrink-0`} />
                <span className="text-sm font-medium text-gray-700">{a.label}</span>
                <ChevronRight size={13} className="text-gray-400 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2.  MY CANDIDATES (Talent Roster)
// ═══════════════════════════════════════════════════════════════════════════════
export function HeadhunterCandidates({ auth }) {
  const { candidates, applications, loading, refetch } = useHeadhunterData(auth.user?.id);
  const [search, setSearch]       = useState("");
  const [profileView, setProfile] = useState(null);
  const [removing, setRemoving]   = useState(null);

  const AVAIL_COLORS = { available: "green", busy: "amber", unavailable: "gray" };

  const filtered = candidates.filter(c =>
    !search ||
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.consultant_profiles?.[0]?.skills?.some(s => s.toLowerCase().includes(search.toLowerCase())) ||
    c.consultant_profiles?.skills?.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  function getProfile(c) {
    return Array.isArray(c.consultant_profiles) ? c.consultant_profiles[0] : c.consultant_profiles;
  }

  function getCandidateApps(candId) {
    return applications.filter(a => a.consultant_id === candId);
  }

  async function removeCandidate(candId) {
    setRemoving(candId);
    await supabase.from("users").update({ headhunter_id: null }).eq("id", candId);
    await refetch();
    setRemoving(null);
  }

  if (profileView) {
    return (
      <div>
        <button onClick={() => setProfile(null)}
          className="mb-4 flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium">
          ← Back to My Roster
        </button>
        <ConsultantProfileView userId={profileView} onBack={() => setProfile(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">My Talent Roster</h1>
          <p className="text-gray-500 text-sm mt-0.5">{candidates.length} managed candidates</p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or skill…"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-56" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Users size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">
            {search ? "No candidates match your search." : "No managed candidates yet."}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Candidates are linked to you when they register or are assigned by an admin.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(c => {
            const prof = getProfile(c);
            const apps = getCandidateApps(c.id);
            const placed = apps.filter(a => a.status === "accepted").length;
            const avail = prof?.availability_status ?? "unknown";
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <PersonAvatar name={c.full_name} avatarUrl={c.avatar_url} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm leading-tight truncate">{c.full_name}</div>
                      {prof?.headline && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">{prof.headline}</div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${avail === "available" ? "bg-green-400" : avail === "busy" ? "bg-amber-400" : "bg-gray-300"}`} />
                        <span className="text-[10px] text-gray-500 font-medium">{cap(avail)}</span>
                        {prof?.hourly_rate && (
                          <span className="text-[10px] text-gray-400 ml-1">${prof.hourly_rate}/h</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setRemoving(removing === c.id ? null : c.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0" title="Remove from roster">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Skills */}
                  {prof?.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {prof.skills.slice(0, 5).map(s => (
                        <Pill key={s} color="blue">{s}</Pill>
                      ))}
                      {prof.skills.length > 5 && (
                        <Pill color="gray">+{prof.skills.length - 5}</Pill>
                      )}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-50 pt-3">
                    <div>
                      <div className="text-xs font-black text-gray-800">{apps.length}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide">Apps</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-green-600">{placed}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide">Placed</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-gray-800">{prof?.years_experience ?? "—"}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide">Yrs exp</div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {removing === c.id ? (
                  <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between">
                    <span className="text-xs text-red-600 font-medium">Remove from your roster?</span>
                    <div className="flex gap-2">
                      <button onClick={() => setRemoving(null)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                      <button onClick={() => removeCandidate(c.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1">
                        {removing === c.id ? <Loader2 size={11} className="animate-spin" /> : null} Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex gap-2">
                    <button onClick={() => setProfile(c.id)}
                      className="flex-1 text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 py-1">
                      <User size={12} /> View Profile
                    </button>
                    {apps.length > 0 && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock size={10} /> {apps.filter(a => a.status === "pending" || a.status === "under_review").length} active
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3.  TALENT PIPELINE (Kanban)
// ═══════════════════════════════════════════════════════════════════════════════
const PIPELINE_COLS = [
  { id: "sourced",      label: "Sourced",    color: "bg-gray-100 text-gray-600",   dot: "bg-gray-400",   border: "border-gray-200" },
  { id: "pending",      label: "Applied",    color: "bg-amber-100 text-amber-800", dot: "bg-amber-400",  border: "border-amber-200" },
  { id: "under_review", label: "In Review",  color: "bg-blue-100 text-blue-800",   dot: "bg-blue-500",   border: "border-blue-200" },
  { id: "accepted",     label: "Placed",     color: "bg-green-100 text-green-800", dot: "bg-green-500",  border: "border-green-200" },
];

export function HeadhunterPipeline({ auth }) {
  const { candidates, applications, loading } = useHeadhunterData(auth.user?.id);

  // Build pipeline items
  function buildItems() {
    const appedIds = new Set(applications.map(a => a.consultant_id));
    // Sourced — candidates with no active applications
    const sourced = candidates
      .filter(c => !appedIds.has(c.id) || applications.filter(a => a.consultant_id === c.id && (a.status === "pending" || a.status === "under_review" || a.status === "accepted")).length === 0)
      .map(c => ({ _type: "sourced", candidateId: c.id, candidateName: c.full_name, avatarUrl: c.avatar_url, caseTitle: null, caseStatus: null, appId: null, status: "sourced", date: null, rate: null }));

    const appItems = applications
      .filter(a => a.status !== "withdrawn" && a.status !== "rejected")
      .map(a => ({
        _type: "application",
        appId: a.id,
        candidateId: a.consultant_id,
        candidateName: a.consultant?.full_name,
        avatarUrl: a.consultant?.avatar_url,
        caseTitle: a.case?.title,
        caseStatus: a.case?.status,
        company: a.case?.client?.client_profiles?.[0]?.company_name ?? a.case?.client?.client_profiles?.company_name,
        status: a.status,
        date: a.submitted_at,
        rate: a.proposed_rate,
      }));

    return [...sourced, ...appItems];
  }

  const items = buildItems();

  function colItems(colId) {
    if (colId === "sourced") return items.filter(i => i.status === "sourced");
    return items.filter(i => i.status === colId);
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Talent Pipeline</h1>
        <p className="text-gray-500 text-sm mt-0.5">Track your candidates through the placement funnel</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {PIPELINE_COLS.map(col => (
          <div key={col.id} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <div className="text-xl font-black text-gray-900">{colItems(col.id).length}</div>
            <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${col.color.split(" ")[1]}`}>{col.label}</div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-4 gap-4 min-h-[400px]">
        {PIPELINE_COLS.map(col => {
          const colList = colItems(col.id);
          return (
            <div key={col.id} className="flex flex-col gap-3">
              {/* Column header */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${col.color} font-bold text-xs uppercase tracking-wider`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                {col.label}
                <span className="ml-auto font-black text-sm">{colList.length}</span>
              </div>

              {/* Cards */}
              {colList.length === 0 ? (
                <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 text-xs py-8">
                  Empty
                </div>
              ) : (
                colList.map((item, idx) => (
                  <div key={item.appId ?? `${item.candidateId}-s`}
                    className={`bg-white rounded-xl border ${col.border} shadow-sm p-3 space-y-2`}>
                    {/* Candidate */}
                    <div className="flex items-center gap-2">
                      <PersonAvatar name={item.candidateName ?? "?"} avatarUrl={item.avatarUrl} size={28} />
                      <span className="text-xs font-bold text-gray-800 leading-tight truncate">{item.candidateName ?? "Consultant"}</span>
                    </div>
                    {/* Case */}
                    {item.caseTitle && (
                      <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 truncate">
                        📋 {item.caseTitle}
                      </div>
                    )}
                    {item.company && (
                      <div className="text-[10px] text-gray-400">🏢 {item.company}</div>
                    )}
                    {/* Meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.rate && <Pill color="blue">${item.rate}/h</Pill>}
                      {item.date && <span className="text-[9px] text-gray-400">{fmtDate(item.date)}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4.  MY PLACEMENTS + COMMISSION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════
export function HeadhunterPlacements({ auth }) {
  const { applications, sourcedCases, loading } = useHeadhunterData(auth.user?.id);
  const [tab, setTab] = useState("placed");

  // Commission settings — persisted per headhunter in localStorage
  const lsKey = `hh_comm_${auth.user?.id}`;
  const [commRate, setCommRate] = useState(() => {
    try { return parseFloat(localStorage.getItem(`${lsKey}_rate`) ?? "15"); } catch { return 15; }
  });
  const [commHours, setCommHours] = useState(() => {
    try { return parseInt(localStorage.getItem(`${lsKey}_hours`) ?? "160", 10); } catch { return 160; }
  });
  const [commStatuses, setCommStatuses] = useState(() => {
    try {
      const s = localStorage.getItem(`${lsKey}_statuses`);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  const placed = applications.filter(a => a.status === "accepted");

  function calcComm(rate) {
    if (!rate) return null;
    return Math.round(rate * commHours * (commRate / 100));
  }

  function getCommStatus(appId) {
    return commStatuses[appId]?.status ?? "pending";
  }

  function toggleCommStatus(appId, amount) {
    const newStatus = getCommStatus(appId) === "paid" ? "pending" : "paid";
    const updated = {
      ...commStatuses,
      [appId]: { status: newStatus, amount, paidAt: newStatus === "paid" ? new Date().toISOString() : null },
    };
    setCommStatuses(updated);
    try { localStorage.setItem(`${lsKey}_statuses`, JSON.stringify(updated)); } catch {}
  }

  function saveCommRate(v) {
    const n = Math.max(1, Math.min(50, parseFloat(v) || 15));
    setCommRate(n);
    try { localStorage.setItem(`${lsKey}_rate`, String(n)); } catch {}
  }

  function saveCommHours(v) {
    const n = Math.max(1, Math.min(720, parseInt(v, 10) || 160));
    setCommHours(n);
    try { localStorage.setItem(`${lsKey}_hours`, String(n)); } catch {}
  }

  const totalComm   = placed.reduce((s, a) => s + (calcComm(a.proposed_rate) ?? 0), 0);
  const paidComm    = placed.filter(a => getCommStatus(a.id) === "paid").reduce((s, a) => s + (calcComm(a.proposed_rate) ?? 0), 0);
  const pendingComm = totalComm - paidComm;
  const paidCount   = placed.filter(a => getCommStatus(a.id) === "paid").length;

  const tabs = [
    { id: "placed",      label: "Placed Candidates", count: placed.length },
    { id: "commissions", label: "Commissions",        count: null },
    { id: "attributed",  label: "Attributed Cases",   count: sourcedCases.length },
  ];

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">My Placements</h1>
        <p className="text-gray-500 text-sm mt-0.5">Track placement outcomes, commissions, and attributed cases</p>
      </div>

      {/* Commission KPI tiles — always visible */}
      <div className="grid grid-cols-3 gap-4">
        <KpiTile label="Total Commissions" value={`$${totalComm.toLocaleString()}`} sub={`at ${commRate}% · ${commHours}h`} icon={DollarSign} color="purple" />
        <KpiTile label="Paid Out" value={`$${paidComm.toLocaleString()}`} sub={`${paidCount} placement${paidCount !== 1 ? "s" : ""}`} icon={CheckCircle2} color="green" />
        <KpiTile label="Pending" value={`$${pendingComm.toLocaleString()}`} sub={`${placed.length - paidCount} placement${placed.length - paidCount !== 1 ? "s" : ""}`} icon={Clock} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            {t.count !== null && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === t.id ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Placed candidates — enhanced with commission columns */}
      {tab === "placed" && (
        placed.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <UserCheck size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">No placements yet.</p>
            <p className="text-gray-400 text-sm mt-1">Accepted applications will appear here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Case</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Commission</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Comm. Status</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {placed.map(app => {
                  const company = app.case?.client?.client_profiles?.[0]?.company_name ?? app.case?.client?.client_profiles?.company_name;
                  const comm    = calcComm(app.proposed_rate);
                  const isPaid  = getCommStatus(app.id) === "paid";
                  return (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <PersonAvatar name={app.consultant?.full_name ?? "?"} avatarUrl={app.consultant?.avatar_url} size={28} />
                          <span className="font-semibold text-gray-800 whitespace-nowrap">{app.consultant?.full_name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{app.case?.title ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{company ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">
                        {app.proposed_rate ? `$${app.proposed_rate}/h` : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {comm != null
                          ? <span className={`font-bold ${isPaid ? "text-green-600" : "text-purple-600"}`}>${comm.toLocaleString()}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {isPaid ? "Paid" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {comm != null && (
                          <button onClick={() => toggleCommStatus(app.id, comm)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
                              isPaid
                                ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                            }`}>
                            {isPaid ? "Mark Pending" : "Mark Paid"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Commissions tab */}
      {tab === "commissions" && (
        <div className="space-y-6">
          {/* Commission settings */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
                <Settings2 size={16} className="text-purple-500" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Commission Settings</div>
                <div className="text-xs text-gray-400">Saved locally in your browser</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Commission Rate</label>
                <div className="flex items-center gap-4">
                  <input type="range" min="1" max="50" step="0.5" value={commRate}
                    onChange={e => saveCommRate(e.target.value)}
                    className="flex-1 accent-purple-600" />
                  <span className="text-xl font-black text-purple-600 w-14 text-right">{commRate}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Typical headhunter fees: 10–25%</p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Billable Hours</label>
                <div className="flex items-center gap-4">
                  <input type="range" min="40" max="720" step="40" value={commHours}
                    onChange={e => saveCommHours(e.target.value)}
                    className="flex-1 accent-purple-600" />
                  <span className="text-xl font-black text-purple-600 w-16 text-right">{commHours}h</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {commHours === 40 ? "1 week" : commHours === 160 ? "1 month (standard)" : `≈ ${(commHours / 160).toFixed(1)} months`}
                </p>
              </div>
            </div>
            <div className="mt-5 p-3 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-700">
              <strong>Formula:</strong> Proposed Rate × {commHours}h × {commRate}% &nbsp;·&nbsp;
              Example: $80/h → <strong>${Math.round(80 * commHours * commRate / 100).toLocaleString()}</strong> commission
            </div>
          </div>

          {/* Earnings breakdown table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                <DollarSign size={16} className="text-purple-500" /> Earnings Breakdown
              </div>
              <span className="text-xs text-gray-400">Rate × {commHours}h × {commRate}%</span>
            </div>
            {placed.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <DollarSign size={28} className="mx-auto mb-2 opacity-20" />
                No placements to show commissions for.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Candidate</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Case</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Commission</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {placed.map(app => {
                    const comm   = calcComm(app.proposed_rate);
                    const isPaid = getCommStatus(app.id) === "paid";
                    const paidAt = commStatuses[app.id]?.paidAt;
                    return (
                      <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <PersonAvatar name={app.consultant?.full_name ?? "?"} avatarUrl={app.consultant?.avatar_url} size={24} />
                            <span className="font-medium text-gray-800 text-xs whitespace-nowrap">{app.consultant?.full_name ?? "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{app.case?.title ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600 font-medium text-right text-xs whitespace-nowrap">
                          {app.proposed_rate ? `$${app.proposed_rate}/h` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {comm != null
                            ? <span className={`text-sm font-black ${isPaid ? "text-green-600" : "text-purple-600"}`}>${comm.toLocaleString()}</span>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleCommStatus(app.id, comm)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer ${isPaid ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}>
                            {isPaid ? "Paid" : "Pending"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {isPaid && paidAt ? fmtDate(paidAt) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-purple-50 border-t border-purple-100">
                    <td colSpan={3} className="px-5 py-3 text-sm font-bold text-purple-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-purple-700">${totalComm.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-green-700">${paidComm.toLocaleString()} paid</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-purple-500">${pendingComm.toLocaleString()} pending</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Attributed cases */}
      {tab === "attributed" && (
        sourcedCases.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Target size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">No attributed cases found.</p>
            <p className="text-gray-400 text-sm mt-1">Cases sourced through you will appear here when flagged by a manager.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sourcedCases.map(c => {
              const company = c.client?.client_profiles?.[0]?.company_name ?? c.client?.client_profiles?.company_name;
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-gray-800 text-sm leading-tight">{c.title}</div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.status === "closed" ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-700"}`}>
                      {cap(c.status)}
                    </span>
                  </div>
                  {company && <div className="text-xs text-gray-500">🏢 {company}</div>}
                  <div className="text-[10px] text-gray-400">Created {fmtDate(c.created_at)}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                      Headhunter sourced
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
