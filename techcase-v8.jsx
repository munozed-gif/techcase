// ============================================================
// TECHCASE v8 — Full Platform with Supabase Backend
// ============================================================
// Setup:
//   npm install @supabase/supabase-js
//   .env.local:
//     REACT_APP_SUPABASE_URL=https://your-project.supabase.co
//     REACT_APP_SUPABASE_ANON_KEY=your-anon-key
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// SUPABASE CLIENT
// ============================================================
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

// ============================================================
// HOOKS
// ============================================================

function useMilestones(caseId) {
  const [milestones, setMilestones] = useState([]);
  const fetchMilestones = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from("case_milestones")
      .select("*").eq("case_id", caseId).order("position");
    setMilestones(data ?? []);
  }, [caseId]);
  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  async function toggleMilestone(id, isDone) {
    await supabase.from("case_milestones")
      .update({ is_done: !isDone, done_at: !isDone ? new Date().toISOString() : null })
      .eq("id", id);
    await fetchMilestones();
  }
  async function addMilestone(title) {
    await supabase.from("case_milestones")
      .insert({ case_id: caseId, title, position: milestones.length + 1 });
    await fetchMilestones();
  }
  return { milestones, toggleMilestone, addMilestone, refetch: fetchMilestones };
}

function useCaseComments(caseId) {
  const [comments, setComments] = useState([]);
  const fetchComments = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from("case_comments")
      .select("*, author:author_id(full_name, avatar_url, role)")
      .eq("case_id", caseId).order("created_at", { ascending: true });
    setComments(data ?? []);
  }, [caseId]);
  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function addComment({ body, hoursLogged = 0, progressUpdate = null, isInternal = false }) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("case_comments").insert({
      case_id: caseId, author_id: user.id, body,
      hours_logged: hoursLogged, progress_update: progressUpdate, is_internal: isInternal,
    });
    if (progressUpdate !== null) {
      await supabase.from("cases").update({ progress_pct: progressUpdate }).eq("id", caseId);
    }
    await fetchComments();
  }
  return { comments, addComment, refetch: fetchComments };
}

function useSlaConfig(clientId) {
  const [sla, setSla] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("sla_configs")
        .select("*").eq("client_id", clientId).single();
      setSla(data);
      setLoading(false);
    })();
  }, [clientId]);
  async function updateSla(updates) {
    const { data, error } = await supabase.from("sla_configs")
      .upsert({ client_id: clientId, ...updates }).select().single();
    if (error) throw error;
    setSla(data);
    return data;
  }
  return { sla, loading, updateSla };
}

function useDbConnections(clientId) {
  const [connections, setConnections] = useState([]);
  const fetchConnections = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("db_connections")
      .select("*").eq("client_id", clientId).order("created_at");
    setConnections(data ?? []);
  }, [clientId]);
  useEffect(() => { fetchConnections(); }, [fetchConnections]);
  async function addConnection(conn) {
    await supabase.from("db_connections").insert({ ...conn, client_id: clientId });
    await fetchConnections();
  }
  async function deleteConnection(id) {
    await supabase.from("db_connections").delete().eq("id", id);
    await fetchConnections();
  }
  return { connections, addConnection, deleteConnection, refetch: fetchConnections };
}

function useClientTeamMembers(clientId) {
  const [members, setMembers] = useState([]);
  const fetchMembers = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("client_team_members")
      .select("*").eq("client_id", clientId).order("created_at");
    setMembers(data ?? []);
  }, [clientId]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  async function addMember(member) {
    await supabase.from("client_team_members").insert({ ...member, client_id: clientId });
    await fetchMembers();
  }
  return { members, addMember, refetch: fetchMembers };
}

function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("users")
      .select("*, consultant_profiles(*), client_profiles(*)")
      .eq("id", userId)
      .single();
    setProfile(data);
    setLoading(false);
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, fullName, role = "consultant") {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return {
    user, profile, loading,
    role: profile?.role ?? null,
    signIn, signUp, signOut,
    isAdmin:      profile?.role === "admin",
    isManager:    profile?.role === "manager",
    isConsultant: profile?.role === "consultant",
    isClient:     profile?.role === "client",
  };
}

function useCases(filters = {}) {
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const filterKey = JSON.stringify(filters);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("cases")
      .select(`
        *,
        client:client_id(id, full_name, email, client_profiles(company_name)),
        manager:manager_id(id, full_name, email),
        case_assignments(consultant_id, time_commitment,
          users:consultant_id(id, full_name, avatar_url)),
        applications(count)
      `)
      .order("created_at", { ascending: false });

    if (filters.status)    query = query.eq("status", filters.status);
    if (filters.priority)  query = query.eq("priority", filters.priority);
    if (filters.search)    query = query.ilike("title", `%${filters.search}%`);

    const { data, error } = await query;
    if (error) setError(error.message);
    else setCases(data ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  useEffect(() => {
    const channel = supabase.channel("cases-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, fetchCases)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchCases]);

  async function createCase(data) {
    const { data: row, error } = await supabase.from("cases").insert(data).select().single();
    if (error) throw error;
    await fetchCases();
    return row;
  }

  async function updateCase(id, updates) {
    const { data: row, error } = await supabase.from("cases").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await fetchCases();
    return row;
  }

  async function deleteCase(id) {
    const { error } = await supabase.from("cases").delete().eq("id", id);
    if (error) throw error;
    await fetchCases();
  }

  return { cases, loading, error, createCase, updateCase, deleteCase, refetch: fetchCases };
}

function useApplications(caseId = null) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("applications")
      .select(`
        *,
        consultant:consultant_id(id, full_name, email, avatar_url,
          consultant_profiles(headline, skills, hourly_rate, years_experience,
            external_occupancy_pct, travel_available)),
        case:case_id(id, title, status)
      `)
      .order("submitted_at", { ascending: false });
    if (caseId) query = query.eq("case_id", caseId);
    const { data } = await query;
    setApplications(data ?? []);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  async function apply({ caseId: cId, coverLetter, proposedRate, timeCommitment }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("applications").insert({
      case_id: cId, consultant_id: user.id,
      cover_letter: coverLetter, proposed_rate: proposedRate,
      time_commitment: timeCommitment,
    }).select().single();
    if (error) throw error;
    await fetchApps();
    return data;
  }

  async function reviewApplication(appId, status, notes) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("applications")
      .update({ status, notes, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", appId).select().single();
    if (error) throw error;
    if (status === "accepted") {
      const app = applications.find(a => a.id === appId);
      if (app) await supabase.from("case_assignments").upsert({
        case_id: app.case_id, consultant_id: app.consultant_id,
        time_commitment: app.time_commitment,
      });
    }
    await fetchApps();
    return data;
  }

  async function withdraw(appId) {
    const { error } = await supabase.from("applications")
      .update({ status: "withdrawn" }).eq("id", appId);
    if (error) throw error;
    await fetchApps();
  }

  return { applications, loading, apply, reviewApplication, withdraw, refetch: fetchApps };
}

function useRatings(consultantId = null) {
  const [ratings, setRatings]     = useState([]);
  const [avgRating, setAvgRating] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!consultantId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("ratings")
        .select("*, rater:rated_by(full_name, avatar_url), case:case_id(title)")
        .eq("consultant_id", consultantId).eq("is_public", true)
        .order("created_at", { ascending: false });
      setRatings(data ?? []);
      const { data: avg } = await supabase.rpc("get_consultant_avg_rating", { p_consultant_id: consultantId });
      setAvgRating(avg);
      setLoading(false);
    })();
  }, [consultantId]);

  async function submitRating({ caseId, score, comment }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("ratings").upsert({
      consultant_id: consultantId, case_id: caseId,
      rated_by: user.id, score, comment,
    }).select().single();
    if (error) throw error;
    const newRatings = [...ratings.filter(r => r.rated_by !== user.id), data];
    setRatings(newRatings);
    const sum = newRatings.reduce((a, r) => a + r.score, 0);
    setAvgRating(parseFloat((sum / newRatings.length).toFixed(2)));
    return data;
  }

  return { ratings, avgRating, loading, submitRating };
}

function useFavorites() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("favorites")
        .select("case_id").eq("consultant_id", user.id);
      setFavorites(data?.map(f => f.case_id) ?? []);
    })();
  }, []);

  function isFavorite(caseId) { return favorites.includes(caseId); }

  async function toggle(caseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (isFavorite(caseId)) {
      await supabase.from("favorites")
        .delete().eq("consultant_id", user.id).eq("case_id", caseId);
      setFavorites(prev => prev.filter(id => id !== caseId));
    } else {
      await supabase.from("favorites").insert({ consultant_id: user.id, case_id: caseId });
      setFavorites(prev => [...prev, caseId]);
    }
  }

  return { favorites, isFavorite, toggle };
}

function useConsultantProfile(consultantId) {
  const [profile, setProfile]       = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading]       = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!consultantId) return;
    setLoading(true);
    const { data } = await supabase.from("consultant_profiles")
      .select(`*, user:id(full_name, email, avatar_url),
        work_authorizations(*), consultant_customers(*), consultant_projects(*),
        case_assignments(time_commitment, case:case_id(id, title, status))`)
      .eq("id", consultantId).single();
    setProfile(data);
    const { data: avail } = await supabase.rpc("get_consultant_availability",
      { p_consultant_id: consultantId });
    setAvailability(avail);
    setLoading(false);
  }, [consultantId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data, error } = await supabase.from("consultant_profiles")
      .update(updates).eq("id", consultantId).select().single();
    if (error) throw error;
    setProfile(prev => ({ ...prev, ...data }));
    return data;
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop();
    const path = `avatars/${consultantId}.${ext}`;
    await supabase.storage.from("profiles").upload(path, file, { upsert: true });
    const { data: { publicUrl } } = supabase.storage.from("profiles").getPublicUrl(path);
    await updateProfile({ photo_url: publicUrl });
    return publicUrl;
  }

  return { profile, availability, loading, updateProfile, uploadPhoto, refetch: fetchProfile };
}

function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("notifications")
        .select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(50);
      setNotifications(data ?? []);
      setUnreadCount(data?.filter(n => !n.is_read).length ?? 0);
    })();
    const channel = supabase.channel("notifications-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" },
        payload => { setNotifications(p => [payload.new, ...p]); setUnreadCount(p => p + 1); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function markRead(id) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(p => Math.max(0, p - 1));
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("notifications").update({ is_read: true })
      .eq("user_id", user.id).eq("is_read", false);
    setNotifications(p => p.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  return { notifications, unreadCount, markRead, markAllRead };
}

function useLeaderboard(entityId = null) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase.from("consultant_profiles").select(`
        id, headline, skills, years_experience, expertise_level, availability_type,
        user:id(full_name, avatar_url),
        ratings(score),
        applications(id, status),
        case_assignments(case_id)
      `);
      if (entityId) query = query.eq("entity_id", entityId);
      const { data } = await query;
      if (!data) { setLoading(false); return; }
      const ranked = data.map(c => {
        const scores = c.ratings?.map(r => r.score) ?? [];
        const avgRating = scores.length
          ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
        return {
          ...c,
          avgRating,
          ratingCount:   scores.length,
          acceptedCases: c.applications?.filter(a => a.status === "accepted").length ?? 0,
          totalApps:     c.applications?.length ?? 0,
        };
      }).sort((a, b) => b.avgRating - a.avgRating || b.acceptedCases - a.acceptedCases);
      setLeaderboard(ranked);
      setLoading(false);
    })();
  }, [entityId]);

  return { leaderboard, loading };
}

// ============================================================
// UTILITIES
// ============================================================
const ROLE_COLORS = {
  admin:      { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  manager:    { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  consultant: { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  client:     { bg: "bg-orange-100", text: "text-orange-800", dot: "bg-orange-500" },
};

const STATUS_COLORS = {
  open:        "bg-emerald-100 text-emerald-800",
  in_progress: "bg-blue-100 text-blue-800",
  on_hold:     "bg-yellow-100 text-yellow-800",
  completed:   "bg-gray-100 text-gray-800",
  cancelled:   "bg-red-100 text-red-800",
};

const PRIORITY_COLORS = {
  low:      "bg-slate-100 text-slate-600",
  medium:   "bg-yellow-100 text-yellow-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const APP_STATUS_COLORS = {
  pending:      "bg-yellow-100 text-yellow-800",
  under_review: "bg-blue-100 text-blue-800",
  accepted:     "bg-green-100 text-green-800",
  rejected:     "bg-red-100 text-red-800",
  withdrawn:    "bg-gray-100 text-gray-600",
};

function fmt(val) { return val?.replace(/_/g, " ") ?? "—"; }
function cap(val) { return val ? val.charAt(0).toUpperCase() + val.slice(1) : ""; }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function stars(n, max = 5) {
  return Array.from({ length: max }, (_, i) => (
    <span key={i} className={i < Math.round(n) ? "text-yellow-400" : "text-gray-300"}>★</span>
  ));
}

// ============================================================
// UI PRIMITIVES
// ============================================================
function Badge({ children, className = "" }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>{children}</span>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
      {action}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        {...props}
      />
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <textarea
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        {...props}
      />
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// AUTH SCREEN
// ============================================================
function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState("signin");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [name, setName]       = useState("");
  const [role, setRole]       = useState("consultant");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await auth.signIn(email, password);
      } else {
        await auth.signUp(email, password, name, role);
      }
      onAuth();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">TechCase</h1>
          <p className="text-gray-500 mt-1">Consultant case management platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            {["signin", "signup"].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  mode === m ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                {m === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <>
              <Input label="Full Name" value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith" />
              <Select label="Role" value={role} onChange={e => setRole(e.target.value)}
                options={[
                  { value: "consultant", label: "Consultant" },
                  { value: "manager",    label: "Manager" },
                  { value: "client",     label: "Client" },
                  { value: "admin",      label: "Admin" },
                ]} />
            </>
          )}

          <Input label="Email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          <Input label="Password" type="password" value={password}
            onChange={e => setPass(e.target.value)} placeholder="••••••••" />

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR NAV
// ============================================================
function Sidebar({ role, activeView, onNav, onSignOut, profile, unreadCount }) {
  const navItems = {
    admin: [
      { id: "dashboard",    icon: "🏠", label: "Dashboard" },
      { id: "cases",        icon: "📋", label: "Cases" },
      { id: "arena",        icon: "⚔️",  label: "Arena" },
      { id: "users",        icon: "👥", label: "Users" },
      { id: "sla",          icon: "📑", label: "SLA Config" },
      { id: "db-connections", icon: "🔌", label: "DB Connections" },
      { id: "team-members", icon: "🤝", label: "Client Teams" },
      { id: "reports",      icon: "📊", label: "Reports" },
    ],
    manager: [
      { id: "dashboard",    icon: "🏠", label: "Dashboard" },
      { id: "cases",        icon: "📋", label: "Cases" },
      { id: "arena",        icon: "⚔️",  label: "Arena" },
      { id: "consultants",  icon: "🧑‍💼", label: "Consultants" },
      { id: "sla",          icon: "📑", label: "SLA Config" },
      { id: "db-connections", icon: "🔌", label: "DB Connections" },
      { id: "team-members", icon: "🤝", label: "Client Teams" },
    ],
    consultant: [
      { id: "dashboard", icon: "🏠", label: "Dashboard" },
      { id: "arena",     icon: "⚔️",  label: "Arena" },
      { id: "my-cases",  icon: "📋", label: "My Cases" },
      { id: "profile",   icon: "👤", label: "My Profile" },
    ],
    client: [
      { id: "dashboard",    icon: "🏠", label: "Dashboard" },
      { id: "cases",        icon: "📋", label: "My Cases" },
      { id: "consultants",  icon: "🧑‍💼", label: "Consultants" },
      { id: "db-connections", icon: "🔌", label: "DB Access" },
      { id: "team-members", icon: "🤝", label: "My Team" },
    ],
  };

  const items = navItems[role] ?? [];

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm font-bold">TC</span>
          </div>
          <div>
            <div className="font-bold text-white">TechCase</div>
            <div className="text-xs text-gray-400 capitalize">{role} Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map(item => (
          <button key={item.id} onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeView === item.id
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}

        {/* Notifications */}
        <button onClick={() => onNav("notifications")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeView === "notifications"
              ? "bg-indigo-600 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
          <span className="text-base">🔔</span>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
            {profile?.full_name?.[0] ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{profile?.full_name ?? "User"}</div>
            <div className="text-xs text-gray-400 truncate">{profile?.email}</div>
          </div>
        </div>
        <button onClick={onSignOut}
          className="w-full text-sm text-gray-400 hover:text-white py-1.5 px-3 rounded-lg hover:bg-gray-800 transition-colors text-left">
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ auth }) {
  const { cases, loading: casesLoading } = useCases();
  const { applications } = useApplications();

  const stats = {
    admin: [
      { label: "Total Cases",     value: cases.length,                                    icon: "📋", color: "indigo" },
      { label: "Open Cases",      value: cases.filter(c => c.status === "open").length,   icon: "🟢", color: "green" },
      { label: "In Progress",     value: cases.filter(c => c.status === "in_progress").length, icon: "🔵", color: "blue" },
      { label: "Applications",    value: applications.length,                             icon: "📝", color: "purple" },
    ],
    manager: [
      { label: "My Cases",        value: cases.filter(c => c.manager_id === auth.user?.id).length, icon: "📋", color: "indigo" },
      { label: "Open",            value: cases.filter(c => c.status === "open").length,   icon: "🟢", color: "green" },
      { label: "Pending Reviews", value: applications.filter(a => a.status === "pending").length, icon: "⏳", color: "yellow" },
    ],
    consultant: [
      { label: "My Applications", value: applications.filter(a => a.consultant_id === auth.user?.id).length, icon: "📝", color: "indigo" },
      { label: "Accepted",        value: applications.filter(a => a.consultant_id === auth.user?.id && a.status === "accepted").length, icon: "✅", color: "green" },
      { label: "Open Cases",      value: cases.filter(c => c.status === "open").length,   icon: "🔓", color: "blue" },
    ],
    client: [
      { label: "My Cases",        value: cases.filter(c => c.client_id === auth.user?.id).length, icon: "📋", color: "indigo" },
      { label: "Active",          value: cases.filter(c => c.client_id === auth.user?.id && c.status === "in_progress").length, icon: "🔵", color: "blue" },
      { label: "Completed",       value: cases.filter(c => c.client_id === auth.user?.id && c.status === "completed").length, icon: "✅", color: "green" },
    ],
  };

  const myStats = stats[auth.role] ?? [];

  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600",
    green:  "bg-green-50 text-green-600",
    blue:   "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    yellow: "bg-yellow-50 text-yellow-600",
  };

  if (casesLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {auth.profile?.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening on the platform today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {myStats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-xl mb-3 ${colorMap[s.color]}`}>
              {s.icon}
            </div>
            <div className="text-3xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Cases */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Recent Cases</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {cases.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-sm">
                  {c.title?.[0]}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{c.title}</div>
                  <div className="text-xs text-gray-400">{fmtDate(c.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={PRIORITY_COLORS[c.priority]}>{cap(c.priority)}</Badge>
                <Badge className={STATUS_COLORS[c.status]}>{cap(fmt(c.status))}</Badge>
              </div>
            </div>
          ))}
          {cases.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">No cases yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CASES VIEW
// ============================================================
function CasesView({ auth }) {
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [selectedCase, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const { isFavorite, toggle }      = useFavorites();

  const { cases, loading, createCase, updateCase, deleteCase } = useCases({
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const displayed = showFavOnly ? cases.filter(c => isFavorite(c.id)) : cases;

  async function handleCreate() {
    setSaving(true);
    try {
      await createCase({
        ...form,
        client_id: auth.isClient ? auth.user?.id : form.client_id,
        manager_id: auth.isManager ? auth.user?.id : form.manager_id,
      });
      setShowCreate(false);
      setForm({});
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleStatusChange(caseId, status) {
    await updateCase(caseId, { status });
    if (selectedCase?.id === caseId) setSelected(prev => ({ ...prev, status }));
  }

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-500 text-sm mt-1">{displayed.length} case{displayed.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            + New Case
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Statuses</option>
          {["open","in_progress","on_hold","completed","cancelled"].map(s => (
            <option key={s} value={s}>{cap(fmt(s))}</option>
          ))}
        </select>
        {auth.isConsultant && (
          <button onClick={() => setShowFavOnly(p => !p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              showFavOnly ? "bg-yellow-50 border-yellow-300 text-yellow-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {showFavOnly ? "★ Saved" : "☆ Saved"}
          </button>
        )}
      </div>

      {/* Cases Grid */}
      {displayed.length === 0 ? (
        <EmptyState icon="📋" title="No cases found" subtitle="Adjust your filters or create a new case" />
      ) : (
        <div className="grid gap-4">
          {displayed.map(c => (
            <div key={c.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer p-5"
              onClick={() => setSelected(c)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{c.title}</h3>
                    <Badge className={STATUS_COLORS[c.status]}>{cap(fmt(c.status))}</Badge>
                    <Badge className={PRIORITY_COLORS[c.priority]}>{cap(c.priority)}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">{c.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    {c.skills_required?.length > 0 && (
                      <span>Skills: {c.skills_required.slice(0, 3).join(", ")}{c.skills_required.length > 3 ? "…" : ""}</span>
                    )}
                    {c.due_date && <span>Due: {fmtDate(c.due_date)}</span>}
                    {c.budget && <span>Budget: ${Number(c.budget).toLocaleString()}</span>}
                    <span>{c.applications?.[0]?.count ?? 0} applicant{c.applications?.[0]?.count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {auth.isConsultant && (
                  <button onClick={e => { e.stopPropagation(); toggle(c.id); }}
                    className="text-xl text-yellow-400 hover:text-yellow-500 transition-colors flex-shrink-0">
                    {isFavorite(c.id) ? "★" : "☆"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Case Detail Modal */}
      <Modal open={!!selectedCase} onClose={() => setSelected(null)}
        title={selectedCase?.title ?? ""} wide>
        {selectedCase && (
          <CaseDetail
            caseData={selectedCase} auth={auth}
            onStatusChange={handleStatusChange}
            onDelete={async () => { await deleteCase(selectedCase.id); setSelected(null); }}
          />
        )}
      </Modal>

      {/* Create Case Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Case">
        <Input label="Title" value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="Case title" />
        <Textarea label="Description" value={form.description ?? ""}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Describe the case requirements…" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={form.status ?? "open"}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            options={["open","in_progress","on_hold"].map(s => ({ value: s, label: cap(fmt(s)) }))} />
          <Select label="Priority" value={form.priority ?? "medium"}
            onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
            options={["low","medium","high","critical"].map(s => ({ value: s, label: cap(s) }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Budget ($)" type="number" value={form.budget ?? ""}
            onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} />
          <Input label="Due Date" type="date" value={form.due_date ?? ""}
            onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
        </div>
        <Input label="Skills Required (comma-separated)" value={form._skills ?? ""}
          onChange={e => setForm(p => ({ ...p, _skills: e.target.value,
            skills_required: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
          placeholder="React, Node.js, PostgreSQL" />
        <div className="flex justify-end gap-3 mt-2">
          <button onClick={() => setShowCreate(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
            {saving ? "Creating…" : "Create Case"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function CaseDetail({ caseData, auth, onStatusChange, onDelete }) {
  const { applications, apply, reviewApplication } = useApplications(caseData.id);
  const { milestones, toggleMilestone, addMilestone } = useMilestones(caseData.id);
  const { comments, addComment } = useCaseComments(caseData.id);
  const [showApply, setShowApply]   = useState(false);
  const [appForm, setAppForm]       = useState({ cover_letter: "", proposed_rate: "", time_commitment: 20 });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab]   = useState("detail");
  const [newMilestone, setNewMilestone] = useState("");
  const [commentForm, setCommentForm]  = useState({ body: "", hoursLogged: 0, progressUpdate: "", isInternal: false });
  const [sendingComment, setSendingComment] = useState(false);
  const [progressPct, setProgressPct] = useState(caseData.progress_pct ?? 0);

  const myApp = applications.find(a => a.consultant_id === auth.user?.id);
  const doneMilestones = milestones.filter(m => m.is_done).length;
  const milestonePct = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;

  async function handleApply() {
    setSubmitting(true);
    try {
      await apply({
        caseId: caseData.id,
        coverLetter: appForm.cover_letter,
        proposedRate: appForm.proposed_rate ? Number(appForm.proposed_rate) : null,
        timeCommitment: Number(appForm.time_commitment),
      });
      setShowApply(false);
    } catch (e) { alert(e.message); }
    setSubmitting(false);
  }

  async function handleAddMilestone() {
    if (!newMilestone.trim()) return;
    await addMilestone(newMilestone.trim());
    setNewMilestone("");
  }

  async function handleComment() {
    if (!commentForm.body.trim()) return;
    setSendingComment(true);
    try {
      await addComment({
        body: commentForm.body,
        hoursLogged: Number(commentForm.hoursLogged) || 0,
        progressUpdate: commentForm.progressUpdate !== "" ? Number(commentForm.progressUpdate) : null,
        isInternal: commentForm.isInternal,
      });
      if (commentForm.progressUpdate !== "") setProgressPct(Number(commentForm.progressUpdate));
      setCommentForm({ body: "", hoursLogged: 0, progressUpdate: "", isInternal: false });
    } catch (e) { alert(e.message); }
    setSendingComment(false);
  }

  const tabs = [
    { id: "detail",     label: "Details" },
    { id: "milestones", label: `Milestones (${doneMilestones}/${milestones.length})` },
    { id: "comments",   label: `Activity (${comments.length})` },
    ...(auth.isAdmin || auth.isManager ? [{ id: "applications", label: `Applications (${applications.length})` }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Overall Progress</span>
          <span className="font-semibold text-gray-800">{progressPct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }} />
        </div>
        {milestones.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">Milestones: {milestonePct}% complete</div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === t.id ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Detail Tab */}
      {activeTab === "detail" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={STATUS_COLORS[caseData.status]}>{cap(fmt(caseData.status))}</Badge>
            <Badge className={PRIORITY_COLORS[caseData.priority]}>{cap(caseData.priority)}</Badge>
            {caseData.parent_case_id && (
              <Badge className="bg-purple-100 text-purple-700">Sub-case</Badge>
            )}
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">{caseData.description || "No description provided."}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {caseData.budget && <div><span className="text-gray-400">Budget: </span><span className="font-medium">${Number(caseData.budget).toLocaleString()}</span></div>}
            {caseData.due_date && <div><span className="text-gray-400">Due: </span><span className="font-medium">{fmtDate(caseData.due_date)}</span></div>}
            {caseData.client?.full_name && <div><span className="text-gray-400">Client: </span><span className="font-medium">{caseData.client.full_name}</span></div>}
            {caseData.manager?.full_name && <div><span className="text-gray-400">Manager: </span><span className="font-medium">{caseData.manager.full_name}</span></div>}
          </div>
          {caseData.skills_required?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Skills Required</div>
              <div className="flex flex-wrap gap-2">
                {caseData.skills_required.map(s => (
                  <span key={s} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Consultant apply section */}
          {auth.isConsultant && caseData.status === "open" && (
            <div className="border-t border-gray-100 pt-4">
              {myApp ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Your application: </span>
                  <Badge className={APP_STATUS_COLORS[myApp.status]}>{cap(myApp.status)}</Badge>
                </div>
              ) : showApply ? (
                <div>
                  <Textarea label="Cover Letter" value={appForm.cover_letter}
                    onChange={e => setAppForm(p => ({ ...p, cover_letter: e.target.value }))}
                    placeholder="Why are you a good fit for this case?" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Proposed Rate ($/hr)" type="number" value={appForm.proposed_rate}
                      onChange={e => setAppForm(p => ({ ...p, proposed_rate: e.target.value }))} />
                    <Input label="Time Commitment (%)" type="number" min="0" max="100"
                      value={appForm.time_commitment}
                      onChange={e => setAppForm(p => ({ ...p, time_commitment: e.target.value }))} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleApply} disabled={submitting}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
                      {submitting ? "Submitting…" : "Submit Application"}
                    </button>
                    <button onClick={() => setShowApply(false)}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowApply(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                  Apply to This Case
                </button>
              )}
            </div>
          )}

          {/* Admin / Manager status controls */}
          {(auth.isAdmin || auth.isManager) && (
            <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2">
              {["open","in_progress","on_hold","completed","cancelled"]
                .filter(s => s !== caseData.status)
                .map(s => (
                  <button key={s} onClick={() => onStatusChange(caseData.id, s)}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                    → {cap(fmt(s))}
                  </button>
                ))}
              {auth.isAdmin && (
                <button onClick={onDelete}
                  className="ml-auto px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Milestones Tab */}
      {activeTab === "milestones" && (
        <div className="space-y-3">
          {milestones.length > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${milestonePct}%` }} />
            </div>
          )}
          {milestones.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer"
              onClick={() => toggleMilestone(m.id, m.is_done)}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                m.is_done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                {m.is_done && <span className="text-white text-xs">✓</span>}
              </div>
              <span className={`text-sm flex-1 ${m.is_done ? "line-through text-gray-400" : "text-gray-800"}`}>
                {m.title}
              </span>
              {m.is_done && m.done_at && (
                <span className="text-xs text-gray-300">{fmtDate(m.done_at)}</span>
              )}
            </div>
          ))}
          {milestones.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No milestones yet. Add one below.</p>
          )}
          {(auth.isAdmin || auth.isManager || auth.isConsultant) && (
            <div className="flex gap-2 mt-4">
              <input value={newMilestone} onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddMilestone()}
                placeholder="Add milestone…"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={handleAddMilestone}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Activity / Comments Tab */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {comments.map(c => (
              <div key={c.id} className={`rounded-xl p-4 text-sm border ${c.is_internal ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-200 text-indigo-700 text-xs flex items-center justify-center font-bold">
                      {c.author?.full_name?.[0] ?? "?"}
                    </div>
                    <span className="font-medium text-gray-900">{c.author?.full_name ?? "Unknown"}</span>
                    {c.is_internal && <Badge className="bg-amber-200 text-amber-800">Internal</Badge>}
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{c.body}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  {c.hours_logged > 0 && <span>⏱ {c.hours_logged}h logged</span>}
                  {c.progress_update !== null && <span>📈 Progress → {c.progress_update}%</span>}
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
            )}
          </div>

          {/* Add comment */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <Textarea label="Comment / Update" value={commentForm.body}
              onChange={e => setCommentForm(p => ({ ...p, body: e.target.value }))}
              placeholder="Add a note, progress update, or comment…" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hours Logged</label>
                <input type="number" min="0" value={commentForm.hoursLogged}
                  onChange={e => setCommentForm(p => ({ ...p, hoursLogged: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Update Progress % (optional)</label>
                <input type="number" min="0" max="100" value={commentForm.progressUpdate}
                  onChange={e => setCommentForm(p => ({ ...p, progressUpdate: e.target.value }))}
                  placeholder="e.g. 75"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            {(auth.isAdmin || auth.isManager) && (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={commentForm.isInternal}
                  onChange={e => setCommentForm(p => ({ ...p, isInternal: e.target.checked }))}
                  className="rounded accent-indigo-600" />
                Internal note (not visible to clients)
              </label>
            )}
            <button onClick={handleComment} disabled={sendingComment}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
              {sendingComment ? "Posting…" : "Post Comment"}
            </button>
          </div>
        </div>
      )}

      {/* Applications Tab */}
      {activeTab === "applications" && (auth.isAdmin || auth.isManager) && (
        <div className="space-y-3">
          {applications.map(app => (
            <div key={app.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm">{app.consultant?.full_name}</div>
                <Badge className={APP_STATUS_COLORS[app.status]}>{cap(app.status)}</Badge>
              </div>
              {app.cover_letter && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{app.cover_letter}</p>}
              <div className="flex gap-3 text-xs text-gray-400 mb-2">
                {app.proposed_rate && <span>💰 ${app.proposed_rate}/hr</span>}
                {app.time_commitment && <span>⏱ {app.time_commitment}% time</span>}
              </div>
              {app.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => reviewApplication(app.id, "accepted")}
                    className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">Accept</button>
                  <button onClick={() => reviewApplication(app.id, "rejected")}
                    className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200">Reject</button>
                  <button onClick={() => reviewApplication(app.id, "under_review")}
                    className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200">Review</button>
                </div>
              )}
            </div>
          ))}
          {applications.length === 0 && <p className="text-sm text-gray-400">No applications yet.</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ARENA (COMPETITIVE BIDDING)
// ============================================================
function ArenaView({ auth }) {
  const [arenaTab, setArenaTab]       = useState("leaderboard");
  const { leaderboard, loading: lbLoading } = useLeaderboard();
  const { cases } = useCases({ status: "open" });
  const { applications } = useApplications();

  const renderLeaderboard = () => {
    if (lbLoading) return <Spinner />;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Rank</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Consultant</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Avg Rating</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Cases Won</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Applications</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leaderboard.map((c, i) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <span className={`font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-gray-300"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                      {c.user?.full_name?.[0]}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{c.user?.full_name}</div>
                      <div className="text-xs text-gray-400">{c.headline ?? `${c.years_experience ?? 0}y experience`}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900">{c.avgRating > 0 ? c.avgRating : "—"}</span>
                    {c.avgRating > 0 && <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>}
                    <span className="text-xs text-gray-400 ml-1">({c.ratingCount})</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-gray-900">{c.acceptedCases}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-gray-600">{c.totalApps}</span>
                </td>
              </tr>
            ))}
            {leaderboard.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No consultants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {leaderboard.map((c, i) => (
        <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              {c.user?.full_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{c.user?.full_name}</div>
              <div className="text-xs text-gray-400">{c.headline ?? "Consultant"}</div>
              {c.avgRating > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {stars(c.avgRating)}
                  <span className="text-xs text-gray-500">{c.avgRating}</span>
                </div>
              )}
            </div>
            <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""}</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span><strong className="text-gray-800">{c.acceptedCases}</strong> won</span>
            <span><strong className="text-gray-800">{c.totalApps}</strong> apps</span>
            <span><strong className="text-gray-800">{c.ratingCount}</strong> ratings</span>
          </div>
          {c.skills?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {c.skills.slice(0, 4).map(s => (
                <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">{s}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderCompare = () => {
    const top3 = leaderboard.slice(0, 3);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map((c, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const appRate = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
          return (
            <div key={c.id} className={`bg-white rounded-2xl border-2 shadow-sm p-6 ${
              i === 0 ? "border-yellow-300" : i === 1 ? "border-gray-300" : "border-orange-300"}`}>
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">{medals[i]}</div>
                <div className="text-3xl font-bold bg-indigo-100 text-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl mb-2">
                  {c.user?.full_name?.[0]}
                </div>
                <div className="font-bold text-gray-900">{c.user?.full_name}</div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Avg Rating</span>
                  <span className="font-semibold">{c.avgRating || "—"} / 5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Win Rate</span>
                  <span className="font-semibold">{appRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cases Won</span>
                  <span className="font-semibold">{c.acceptedCases}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Experience</span>
                  <span className="font-semibold">{c.years_experience ?? 0}y</span>
                </div>
                {/* Bar: avg rating */}
                <div className="pt-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(c.avgRating / 5) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {top3.length < 3 && (
          <div className="col-span-full text-center text-gray-400 py-8 text-sm">
            Need at least 3 consultants to compare
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Arena</h1>
        <p className="text-gray-500 text-sm mt-1">Competitive bidding & consultant rankings</p>
      </div>

      {/* Open cases for consultants */}
      {auth.isConsultant && cases.length > 0 && (
        <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <div className="text-sm font-semibold text-indigo-800 mb-2">
            🔓 {cases.length} open case{cases.length !== 1 ? "s" : ""} available
          </div>
          <div className="flex flex-wrap gap-2">
            {cases.slice(0, 4).map(c => (
              <span key={c.id} className="text-xs bg-white text-indigo-700 border border-indigo-200 rounded-lg px-2 py-1">
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {["leaderboard", "cards", "compare"].map(t => (
          <button key={t} onClick={() => setArenaTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize ${
              arenaTab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "leaderboard" ? "🏆 Leaderboard" : t === "cards" ? "🃏 Cards" : "⚖️ Compare"}
          </button>
        ))}
      </div>

      {arenaTab === "leaderboard" && renderLeaderboard()}
      {arenaTab === "cards"       && renderCards()}
      {arenaTab === "compare"     && renderCompare()}
    </div>
  );
}

// ============================================================
// CONSULTANT PROFILE VIEW
// ============================================================
function ProfileView({ auth }) {
  const { profile, availability, loading, updateProfile, uploadPhoto } = useConsultantProfile(auth.user?.id);
  const { ratings, avgRating } = useRatings(auth.user?.id);
  const [profileTab, setProfileTab] = useState("overview");
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (profile && !editing) setForm({
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      linkedin_url: profile.linkedin_url ?? "",
      hourly_rate: profile.hourly_rate ?? "",
      years_experience: profile.years_experience ?? 0,
      external_occupancy_pct: profile.external_occupancy_pct ?? 0,
      travel_available: profile.travel_available ?? false,
      expertise_level: profile.expertise_level ?? "mid",
      availability_type: profile.availability_type ?? "project_based",
      _skills: profile.skills?.join(", ") ?? "",
    });
  }, [profile, editing]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        ...form,
        skills: form._skills?.split(",").map(s => s.trim()).filter(Boolean) ?? [],
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        years_experience: Number(form.years_experience),
        external_occupancy_pct: Number(form.external_occupancy_pct),
      });
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await uploadPhoto(file); } catch (e) { alert(e.message); }
  }

  if (loading) return <Spinner />;

  // Availability breakdown
  const activeCaseCommitment = profile?.case_assignments
    ?.filter(a => ["open","in_progress"].includes(a.case?.status))
    ?.reduce((sum, a) => sum + (a.time_commitment ?? 0), 0) ?? 0;
  const extOccupancy = profile?.external_occupancy_pct ?? 0;
  const totalUsed = Math.min(100, activeCaseCommitment + extOccupancy);
  const freeAvail = Math.max(0, 100 - totalUsed);

  const tabs = ["overview", "experience", "skills", "ratings"];

  return (
    <div>
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold overflow-hidden">
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="avatar" className="w-full h-full object-cover" />
                : auth.profile?.full_name?.[0]}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-indigo-700">
              +
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{auth.profile?.full_name}</h1>
            <p className="text-gray-500 text-sm">{profile?.headline || "Add a headline…"}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-500">
              {avgRating && (
                <span className="flex items-center gap-1">
                  {stars(avgRating)} <strong className="text-gray-900">{avgRating}</strong>
                  <span className="text-gray-400">({ratings.length} ratings)</span>
                </span>
              )}
              {profile?.hourly_rate && <span>💰 ${profile.hourly_rate}/hr</span>}
              {profile?.travel_available && <span>✈️ Travel available</span>}
              {profile?.expertise_level && (
                <Badge className="bg-violet-100 text-violet-700">{cap(profile.expertise_level)}</Badge>
              )}
              {profile?.availability_type && (
                <Badge className="bg-teal-100 text-teal-700">{cap(fmt(profile.availability_type))}</Badge>
              )}
            </div>
          </div>
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
            {editing ? "Cancel" : "Edit Profile"}
          </button>
        </div>

        {/* Availability bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Availability</span>
            <span className="font-semibold text-gray-800">{freeAvail}% free</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {activeCaseCommitment > 0 && (
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${activeCaseCommitment}%` }}
                title={`Case commitment: ${activeCaseCommitment}%`} />
            )}
            {extOccupancy > 0 && (
              <div className="h-full bg-orange-300 transition-all" style={{ width: `${extOccupancy}%` }}
                title={`External: ${extOccupancy}%`} />
            )}
            <div className="h-full bg-emerald-200 transition-all" style={{ width: `${freeAvail}%` }}
              title={`Available: ${freeAvail}%`} />
          </div>
          <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full inline-block"/>Cases ({activeCaseCommitment}%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-300 rounded-full inline-block"/>External ({extOccupancy}%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-200 rounded-full inline-block"/>Free ({freeAvail}%)</span>
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Edit Profile</h3>
          <Input label="Headline" value={form.headline} onChange={e => setForm(p => ({ ...p, headline: e.target.value }))}
            placeholder="Senior Full-Stack Consultant" />
          <Textarea label="Bio" value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
            placeholder="Tell clients about your background and expertise…" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Hourly Rate ($)" type="number" value={form.hourly_rate}
              onChange={e => setForm(p => ({ ...p, hourly_rate: e.target.value }))} />
            <Input label="Years Experience" type="number" value={form.years_experience}
              onChange={e => setForm(p => ({ ...p, years_experience: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Expertise Level" value={form.expertise_level ?? "mid"}
              onChange={e => setForm(p => ({ ...p, expertise_level: e.target.value }))}
              options={[
                { value: "junior",  label: "Junior" },
                { value: "mid",     label: "Mid-Level" },
                { value: "senior",  label: "Senior" },
                { value: "expert",  label: "Expert / Principal" },
              ]} />
            <Select label="Availability Type" value={form.availability_type ?? "project_based"}
              onChange={e => setForm(p => ({ ...p, availability_type: e.target.value }))}
              options={[
                { value: "full_time",     label: "Full-Time" },
                { value: "part_time",     label: "Part-Time" },
                { value: "contract",      label: "Contract" },
                { value: "project_based", label: "Project-Based" },
              ]} />
          </div>
          <Input label="LinkedIn URL" value={form.linkedin_url}
            onChange={e => setForm(p => ({ ...p, linkedin_url: e.target.value }))}
            placeholder="https://linkedin.com/in/yourprofile" />
          <Input label="Skills (comma-separated)" value={form._skills}
            onChange={e => setForm(p => ({ ...p, _skills: e.target.value }))}
            placeholder="React, Node.js, AWS, PostgreSQL" />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              External Occupancy: {form.external_occupancy_pct}%
            </label>
            <input type="range" min="0" max="100" value={form.external_occupancy_pct}
              onChange={e => setForm(p => ({ ...p, external_occupancy_pct: Number(e.target.value) }))}
              className="w-full accent-indigo-600" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
            <input type="checkbox" checked={form.travel_available}
              onChange={e => setForm(p => ({ ...p, travel_available: e.target.checked }))}
              className="rounded accent-indigo-600" />
            Available for travel
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setProfileTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all capitalize ${
              profileTab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {profileTab === "overview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-3">About</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{profile?.bio || "No bio yet. Edit your profile to add one."}</p>
          {profile?.linkedin_url && (
            <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-sm text-indigo-600 hover:underline">
              🔗 LinkedIn Profile
            </a>
          )}
          {/* Active cases */}
          {profile?.case_assignments?.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Active Cases</h4>
              <div className="space-y-2">
                {profile.case_assignments
                  .filter(a => ["open","in_progress"].includes(a.case?.status))
                  .map(a => (
                    <div key={a.case?.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-xl px-4 py-2">
                      <span className="font-medium text-gray-800">{a.case?.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[a.case?.status]}>{cap(fmt(a.case?.status))}</Badge>
                        <span className="text-gray-400 text-xs">{a.time_commitment}%</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profileTab === "experience" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Past Customers</h3>
          {(profile?.consultant_customers?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">No customers added yet.</p>
          ) : (
            <div className="space-y-3">
              {profile?.consultant_customers?.map(c => (
                <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="font-medium text-gray-900">{c.company_name}</div>
                  {c.role_held && <div className="text-sm text-gray-500">{c.role_held}</div>}
                  {(c.start_date || c.end_date) && (
                    <div className="text-xs text-gray-400 mt-1">
                      {fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : "Present"}
                    </div>
                  )}
                  {c.description && <p className="text-sm text-gray-600 mt-2">{c.description}</p>}
                </div>
              ))}
            </div>
          )}

          <h3 className="font-semibold text-gray-900 mb-4 mt-6">Projects</h3>
          {(profile?.consultant_projects?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">No projects added yet.</p>
          ) : (
            <div className="space-y-3">
              {profile?.consultant_projects?.map(p => (
                <div key={p.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{p.title}</div>
                      {p.client_name && <div className="text-xs text-gray-400">{p.client_name}</div>}
                    </div>
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">View →</a>}
                  </div>
                  {p.description && <p className="text-sm text-gray-600 mt-2">{p.description}</p>}
                  {p.tech_stack?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.tech_stack.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {profileTab === "skills" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Skills</h3>
          {(profile?.skills?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">No skills added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile?.skills?.map(s => (
                <span key={s} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium">{s}</span>
              ))}
            </div>
          )}

          <h3 className="font-semibold text-gray-900 mb-4 mt-6">Work Authorization</h3>
          {(profile?.work_authorizations?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">No work authorizations added.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {profile?.work_authorizations?.map(w => (
                <div key={w.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="text-2xl">{w.country_code === "US" ? "🇺🇸" : w.country_code === "GB" ? "🇬🇧" : "🌐"}</div>
                  <div>
                    <div className="text-sm font-medium">{w.country_name}</div>
                    <div className="text-xs text-gray-400 capitalize">{fmt(w.auth_type)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {profileTab === "ratings" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {avgRating && (
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
              <div className="text-5xl font-bold text-gray-900">{avgRating}</div>
              <div>
                <div className="flex text-yellow-400 text-xl">{stars(avgRating)}</div>
                <div className="text-sm text-gray-500 mt-1">{ratings.length} rating{ratings.length !== 1 ? "s" : ""}</div>
              </div>
            </div>
          )}
          {ratings.length === 0 ? (
            <p className="text-sm text-gray-400">No ratings yet.</p>
          ) : (
            <div className="space-y-4">
              {ratings.map(r => (
                <div key={r.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                        {r.rater?.full_name?.[0]}
                      </div>
                      <span className="text-sm font-medium">{r.rater?.full_name}</span>
                    </div>
                    <div className="flex text-yellow-400">{stars(r.score)}</div>
                  </div>
                  {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                  {r.case?.title && <div className="text-xs text-gray-400 mt-1">On: {r.case.title}</div>}
                  <div className="text-xs text-gray-300 mt-1">{fmtDate(r.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONSULTANTS DIRECTORY (Manager / Client View)
// ============================================================
function ConsultantsView({ auth }) {
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const { leaderboard, loading } = useLeaderboard();

  const filtered = leaderboard.filter(c =>
    !search || c.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.skills?.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consultants</h1>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or skill…"
        className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} onClick={() => setSelected(c)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                {c.user?.full_name?.[0]}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{c.user?.full_name}</div>
                <div className="text-xs text-gray-400">{c.headline ?? `${c.years_experience ?? 0}y exp`}</div>
              </div>
            </div>
            {c.avgRating > 0 && (
              <div className="flex items-center gap-1 text-sm mb-3">
                {stars(c.avgRating)}
                <span className="text-gray-600 ml-1">{c.avgRating}</span>
                <span className="text-gray-400">({c.ratingCount})</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1 mb-2">
              {c.expertise_level && (
                <Badge className="bg-violet-100 text-violet-700">{cap(c.expertise_level)}</Badge>
              )}
              {c.availability_type && (
                <Badge className="bg-teal-100 text-teal-700">{cap(fmt(c.availability_type))}</Badge>
              )}
            </div>
            {c.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.skills.slice(0, 4).map(s => (
                  <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon="🧑‍💼" title="No consultants found" subtitle="Try a different search" />
          </div>
        )}
      </div>

      {/* Consultant Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.user?.full_name ?? ""} wide>
        {selected && <ConsultantDetailModal consultantId={selected.id} auth={auth} />}
      </Modal>
    </div>
  );
}

function ConsultantDetailModal({ consultantId, auth }) {
  const { profile, availability, loading } = useConsultantProfile(consultantId);
  const { ratings, avgRating }             = useRatings(consultantId);
  const [ratingForm, setRatingForm]        = useState({ score: 5, comment: "" });
  const [ratingModal, setRatingModal]      = useState(false);
  const { submitRating }                   = useRatings(consultantId);

  if (loading) return <Spinner />;

  async function handleRate() {
    try {
      await submitRating({ score: ratingForm.score, comment: ratingForm.comment });
      setRatingModal(false);
    } catch(e) { alert(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold">
          {profile?.user?.full_name?.[0]}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{profile?.user?.full_name}</h2>
          <p className="text-gray-500 text-sm">{profile?.headline}</p>
          {avgRating && (
            <div className="flex items-center gap-1 mt-1">{stars(avgRating)}
              <span className="text-sm text-gray-600 ml-1">{avgRating} ({ratings.length})</span>
            </div>
          )}
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setRatingModal(true)}
            className="ml-auto px-4 py-2 text-sm bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl hover:bg-yellow-100">
            ★ Rate
          </button>
        )}
      </div>

      {profile?.bio && <p className="text-sm text-gray-600">{profile.bio}</p>}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {profile?.hourly_rate && <div><span className="text-gray-400">Rate: </span><strong>${profile.hourly_rate}/hr</strong></div>}
        {profile?.years_experience && <div><span className="text-gray-400">Experience: </span><strong>{profile.years_experience}y</strong></div>}
        <div><span className="text-gray-400">Availability: </span><strong className={availability > 30 ? "text-green-600" : "text-orange-500"}>{availability}% free</strong></div>
        {profile?.travel_available && <div>✈️ Travel available</div>}
        {profile?.expertise_level && (
          <div><span className="text-gray-400">Level: </span>
            <Badge className="bg-violet-100 text-violet-700 ml-1">{cap(profile.expertise_level)}</Badge>
          </div>
        )}
        {profile?.availability_type && (
          <div><span className="text-gray-400">Type: </span>
            <Badge className="bg-teal-100 text-teal-700 ml-1">{cap(fmt(profile.availability_type))}</Badge>
          </div>
        )}
      </div>

      {profile?.skills?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {profile.skills.map(s => (
            <span key={s} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">{s}</span>
          ))}
        </div>
      )}

      {ratingModal && (
        <div className="border border-yellow-200 rounded-xl p-4 bg-yellow-50">
          <h4 className="font-semibold text-gray-900 mb-3">Submit Rating</h4>
          <div className="flex gap-2 mb-3">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRatingForm(p => ({ ...p, score: n }))}
                className={`text-2xl ${n <= ratingForm.score ? "text-yellow-400" : "text-gray-300"}`}>★</button>
            ))}
          </div>
          <Textarea label="Comment" value={ratingForm.comment}
            onChange={e => setRatingForm(p => ({ ...p, comment: e.target.value }))}
            placeholder="Share your experience working with this consultant…" />
          <div className="flex gap-2">
            <button onClick={handleRate}
              className="px-4 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-xl hover:bg-yellow-600">
              Submit Rating
            </button>
            <button onClick={() => setRatingModal(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// NOTIFICATIONS VIEW
// ============================================================
function NotificationsView() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon="🔔" title="All caught up!" subtitle="No notifications yet" />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors ${
                n.is_read ? "bg-white border-gray-100" : "bg-indigo-50 border-indigo-100 hover:bg-indigo-100"}`}>
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.is_read ? "bg-gray-200" : "bg-indigo-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">{n.title}</div>
                {n.body && <div className="text-sm text-gray-500 mt-0.5">{n.body}</div>}
                <div className="text-xs text-gray-400 mt-1">{fmtDate(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// USERS ADMIN VIEW
// ============================================================
function UsersView() {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
      setUsers(data ?? []);
      setLoading(false);
    })();
  }, []);

  async function toggleActive(userId, isActive) {
    await supabase.from("users").update({ is_active: !isActive }).eq("id", userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-gray-500 text-sm mt-1">{users.length} total users</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => {
              const rc = ROLE_COLORS[u.role] ?? ROLE_COLORS.consultant;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                        {u.full_name?.[0]}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{u.full_name}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${rc.bg} ${rc.text}`}>{cap(u.role)}</Badge>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? "text-green-700" : "text-gray-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => toggleActive(u.id, u.is_active)}
                      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50">
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// REPORTS VIEW (Admin)
// ============================================================
function ReportsView() {
  const { cases } = useCases();
  const { applications } = useApplications();

  const byStatus = ["open","in_progress","on_hold","completed","cancelled"].map(s => ({
    label: cap(fmt(s)),
    count: cases.filter(c => c.status === s).length,
    color: s === "open" ? "bg-emerald-400" : s === "in_progress" ? "bg-blue-400" :
           s === "on_hold" ? "bg-yellow-400" : s === "completed" ? "bg-gray-300" : "bg-red-300",
  }));

  const totalApps = applications.length;
  const byAppStatus = ["pending","under_review","accepted","rejected","withdrawn"].map(s => ({
    label: cap(fmt(s)),
    count: applications.filter(a => a.status === s).length,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cases by status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">Cases by Status</h2>
          <div className="space-y-3">
            {byStatus.map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`}
                    style={{ width: cases.length ? `${(s.count / cases.length) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Applications by status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">Applications by Status</h2>
          <div className="space-y-3">
            {byAppStatus.map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full transition-all"
                    style={{ width: totalApps ? `${(s.count / totalApps) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SLA CONFIG VIEW (Admin / Manager)
// ============================================================
function SlaView({ auth }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email, client_profiles(company_name)")
        .eq("role", "client")
        .order("full_name");
      setClients(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SLA Configuration</h1>
        <p className="text-gray-500 text-sm mt-1">Service Level Agreement settings per client</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Clients</div>
          <div className="space-y-1">
            {clients.map(c => (
              <button key={c.id} onClick={() => setSelectedClient(c)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  selectedClient?.id === c.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                <div className="text-xs text-gray-400">{c.email}</div>
              </button>
            ))}
            {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No clients found</p>}
          </div>
        </div>

        {/* SLA Detail */}
        <div className="lg:col-span-2">
          {selectedClient
            ? <SlaClientDetail client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>Select a client to view or edit their SLA configuration</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function SlaClientDetail({ client, auth }) {
  const { sla, loading, updateSla } = useSlaConfig(client.id);
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (sla) setForm({
      tier: sla.tier ?? "standard",
      response_time_hours: sla.response_time_hours ?? 24,
      resolution_time_hours: sla.resolution_time_hours ?? 72,
      uptime_guarantee_pct: sla.uptime_guarantee_pct ?? 99,
      dedicated_consultant: sla.dedicated_consultant ?? false,
      priority_support: sla.priority_support ?? false,
      notes: sla.notes ?? "",
    });
    else setForm({
      tier: "standard", response_time_hours: 24, resolution_time_hours: 72,
      uptime_guarantee_pct: 99, dedicated_consultant: false, priority_support: false, notes: "",
    });
  }, [sla]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSla(form);
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  const tierColors = { standard: "bg-gray-100 text-gray-700", premium: "bg-blue-100 text-blue-700", enterprise: "bg-purple-100 text-purple-700" };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{client.email}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
            {editing ? "Cancel" : "Edit SLA"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <Select label="SLA Tier" value={form.tier}
            onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}
            options={[
              { value: "standard",   label: "Standard" },
              { value: "premium",    label: "Premium" },
              { value: "enterprise", label: "Enterprise" },
            ]} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Response Time (hrs)" type="number" value={form.response_time_hours}
              onChange={e => setForm(p => ({ ...p, response_time_hours: Number(e.target.value) }))} />
            <Input label="Resolution Time (hrs)" type="number" value={form.resolution_time_hours}
              onChange={e => setForm(p => ({ ...p, resolution_time_hours: Number(e.target.value) }))} />
            <Input label="Uptime Guarantee (%)" type="number" value={form.uptime_guarantee_pct}
              onChange={e => setForm(p => ({ ...p, uptime_guarantee_pct: Number(e.target.value) }))} />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.dedicated_consultant}
                onChange={e => setForm(p => ({ ...p, dedicated_consultant: e.target.checked }))}
                className="rounded accent-indigo-600" />
              Dedicated Consultant
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.priority_support}
                onChange={e => setForm(p => ({ ...p, priority_support: e.target.checked }))}
                className="rounded accent-indigo-600" />
              Priority Support
            </label>
          </div>
          <Textarea label="Notes" value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Additional SLA terms or notes…" />
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save SLA"}
            </button>
          </div>
        </div>
      ) : sla ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge className={tierColors[sla.tier] ?? tierColors.standard}>{cap(sla.tier)} Tier</Badge>
            {sla.priority_support && <Badge className="bg-orange-100 text-orange-700">Priority Support</Badge>}
            {sla.dedicated_consultant && <Badge className="bg-green-100 text-green-700">Dedicated Consultant</Badge>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{sla.response_time_hours}h</div>
              <div className="text-xs text-gray-500 mt-1">Response Time</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{sla.resolution_time_hours}h</div>
              <div className="text-xs text-gray-500 mt-1">Resolution Time</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{sla.uptime_guarantee_pct}%</div>
              <div className="text-xs text-gray-500 mt-1">Uptime SLA</div>
            </div>
          </div>
          {sla.notes && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-gray-700">
              <div className="font-medium text-yellow-800 mb-1">Notes</div>
              {sla.notes}
            </div>
          )}
          <div className="text-xs text-gray-400">Last updated: {fmtDate(sla.updated_at ?? sla.created_at)}</div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm">No SLA configured for this client.</p>
          {(auth.isAdmin || auth.isManager) && (
            <button onClick={() => setEditing(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
              Configure SLA
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DB CONNECTIONS VIEW (Admin / Manager / Client)
// ============================================================
function DbConnectionsView({ auth }) {
  const [clients, setClients]         = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      let clientId = auth.isClient ? auth.user?.id : null;
      if (clientId) {
        // Client sees their own
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)").eq("id", clientId).single();
        if (data) { setClients([data]); setSelectedClient(data); }
      } else {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)")
          .eq("role", "client").order("full_name");
        setClients(data ?? []);
      }
      setLoadingClients(false);
    })();
  }, [auth]);

  if (loadingClients) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Database Connections</h1>
        <p className="text-gray-500 text-sm mt-1">Manage client database connection details</p>
      </div>

      <div className={`grid gap-6 ${auth.isClient ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        {!auth.isClient && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Clients</div>
            <div className="space-y-1">
              {clients.map(c => (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selectedClient?.id === c.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                  <div className="text-xs text-gray-400">{c.email}</div>
                </button>
              ))}
              {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No clients found</p>}
            </div>
          </div>
        )}

        <div className={auth.isClient ? "" : "lg:col-span-2"}>
          {selectedClient
            ? <DbConnectionsList client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="text-4xl mb-3">🔌</div>
                <p>Select a client to view their database connections</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function DbConnectionsList({ client, auth }) {
  const { connections, addConnection, deleteConnection } = useDbConnections(client.id);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "" });
  const [saving, setSaving]   = useState(false);

  async function handleAdd() {
    if (!form.host || !form.db_name) return;
    setSaving(true);
    try {
      await addConnection(form);
      setForm({ db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "" });
      setShowAdd(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const dbTypeColors = { postgresql: "bg-blue-100 text-blue-700", mysql: "bg-orange-100 text-orange-700", mssql: "bg-red-100 text-red-700", oracle: "bg-red-100 text-red-700", mongodb: "bg-green-100 text-green-700", other: "bg-gray-100 text-gray-700" };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{connections.length} connection{connections.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setShowAdd(p => !p)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700">
            + Add Connection
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Database Type" value={form.db_type}
              onChange={e => setForm(p => ({ ...p, db_type: e.target.value }))}
              options={["postgresql","mysql","mssql","oracle","mongodb","other"].map(t => ({ value: t, label: t.toUpperCase() }))} />
            <Input label="Host / Server" value={form.host}
              onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="db.example.com" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Port" type="number" value={form.port}
              onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} />
            <Input label="Database Name" value={form.db_name}
              onChange={e => setForm(p => ({ ...p, db_name: e.target.value }))} />
            <Input label="Username" value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Access instructions, VPN requirements…" />
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Adding…" : "Add Connection"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {connections.map(conn => (
          <div key={conn.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className={dbTypeColors[conn.db_type] ?? dbTypeColors.other}>{conn.db_type?.toUpperCase()}</Badge>
                <span className="font-mono text-sm text-gray-800">{conn.db_name}</span>
              </div>
              {(auth.isAdmin || auth.isManager) && (
                <button onClick={() => deleteConnection(conn.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-100 hover:bg-red-50">
                  Remove
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 font-mono">
              {conn.username && <span>{conn.username}@</span>}{conn.host}:{conn.port}
            </div>
            {conn.notes && <p className="text-xs text-gray-400 mt-2">{conn.notes}</p>}
          </div>
        ))}
        {connections.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">🔌</div>
            <p className="text-sm">No database connections configured.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CLIENT TEAM MEMBERS VIEW
// ============================================================
function ClientTeamView({ auth }) {
  const [clients, setClients]           = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      let clientId = auth.isClient ? auth.user?.id : null;
      if (clientId) {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)").eq("id", clientId).single();
        if (data) { setClients([data]); setSelectedClient(data); }
      } else {
        const { data } = await supabase.from("users")
          .select("id, full_name, email, client_profiles(company_name)")
          .eq("role", "client").order("full_name");
        setClients(data ?? []);
      }
      setLoadingClients(false);
    })();
  }, [auth]);

  if (loadingClients) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Client Team Members</h1>
        <p className="text-gray-500 text-sm mt-1">Stakeholders and points of contact per client</p>
      </div>

      <div className={`grid gap-6 ${auth.isClient ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        {!auth.isClient && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Clients</div>
            <div className="space-y-1">
              {clients.map(c => (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selectedClient?.id === c.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <div className="font-medium">{c.client_profiles?.company_name ?? c.full_name}</div>
                  <div className="text-xs text-gray-400">{c.email}</div>
                </button>
              ))}
              {clients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No clients</p>}
            </div>
          </div>
        )}

        <div className={auth.isClient ? "" : "lg:col-span-2"}>
          {selectedClient
            ? <ClientTeamList client={selectedClient} auth={auth} />
            : <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <div className="text-4xl mb-3">👥</div>
                <p>Select a client to view their team members</p>
              </div>
          }
        </div>
      </div>
    </div>
  );
}

function ClientTeamList({ client, auth }) {
  const { members, addMember } = useClientTeamMembers(client.id);
  const [showAdd, setShowAdd]  = useState(false);
  const [form, setForm]        = useState({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
  const [saving, setSaving]    = useState(false);

  async function handleAdd() {
    if (!form.full_name || !form.email) return;
    setSaving(true);
    try {
      await addMember(form);
      setForm({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
      setShowAdd(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-gray-900">{client.client_profiles?.company_name ?? client.full_name}</h2>
          <p className="text-sm text-gray-400">{members.length} team member{members.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setShowAdd(p => !p)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700">
            + Add Member
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Jane Smith" />
            <Input label="Email" type="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Role / Title" value={form.role_title}
              onChange={e => setForm(p => ({ ...p, role_title: e.target.value }))} placeholder="IT Manager" />
            <Input label="Phone" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_primary}
              onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))}
              className="rounded accent-indigo-600" />
            Primary contact
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Adding…" : "Add Member"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members.map(m => (
          <div key={m.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                {m.full_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{m.full_name}</span>
                  {m.is_primary && <Badge className="bg-indigo-100 text-indigo-700">Primary</Badge>}
                </div>
                {m.role_title && <div className="text-xs text-gray-500">{m.role_title}</div>}
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              {m.email && <div>📧 {m.email}</div>}
              {m.phone && <div>📞 {m.phone}</div>}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-sm">No team members added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const auth = useAuth();
  const [activeView, setActiveView]   = useState("dashboard");
  const [authed, setAuthed]           = useState(false);
  const { unreadCount }               = useNotifications();

  // Sync authed state with auth session
  useEffect(() => {
    if (!auth.loading) setAuthed(!!auth.user);
  }, [auth.loading, auth.user]);

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed || !auth.user) {
    return <AuthScreen onAuth={() => setAuthed(true)} />;
  }

  async function handleSignOut() {
    await auth.signOut();
    setAuthed(false);
    setActiveView("dashboard");
  }

  function renderView() {
    switch (activeView) {
      case "dashboard":      return <Dashboard auth={auth} />;
      case "cases":          return <CasesView auth={auth} />;
      case "my-cases":       return <CasesView auth={auth} />;
      case "arena":          return <ArenaView auth={auth} />;
      case "profile":        return <ProfileView auth={auth} />;
      case "consultants":    return <ConsultantsView auth={auth} />;
      case "users":          return auth.isAdmin ? <UsersView /> : <Dashboard auth={auth} />;
      case "reports":        return auth.isAdmin ? <ReportsView /> : <Dashboard auth={auth} />;
      case "sla":            return (auth.isAdmin || auth.isManager) ? <SlaView auth={auth} /> : <Dashboard auth={auth} />;
      case "db-connections": return <DbConnectionsView auth={auth} />;
      case "team-members":   return <ClientTeamView auth={auth} />;
      case "notifications":  return <NotificationsView />;
      default:               return <Dashboard auth={auth} />;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        role={auth.role}
        activeView={activeView}
        onNav={setActiveView}
        onSignOut={handleSignOut}
        profile={auth.profile}
        unreadCount={unreadCount}
      />
      <main className="ml-64 p-8 min-h-screen">
        <div className="max-w-5xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
