// ============================================================
// TECHCASE v9 — Invoices, Kanban, Documents & Time Tracking
// ============================================================
// New in v9 (over v8):
//   - Invoice & Billing Management
//   - Case Document Attachments (Supabase Storage bucket: case-documents)
//   - Time Entries with manager approval workflow
//   - Kanban Board View (visual case pipeline)
//   - Enhanced Reports (hours, revenue, conversion)
//
// New DB tables needed:
//   invoices (id, case_id, client_id, consultant_id, invoice_number,
//             amount, status[draft/sent/paid/overdue], issue_date,
//             due_date, notes, created_at)
//   time_entries (id, case_id, consultant_id, date, hours,
//                 description, is_billable, is_approved,
//                 approved_by, created_at)
//   case_documents (id, case_id, uploaded_by, file_name, file_url,
//                   file_type, file_size_kb, notes, created_at)
// ============================================================

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard, FolderOpen, LayoutGrid, Target, Receipt, Clock,
  Users, UserCheck, Settings, Database, Handshake, BarChart2, User,
  Building2, Bell, FileText, DollarSign, Flag, CheckCircle2, PenLine,
  Briefcase, Globe, Rocket, Zap, Phone, SlidersHorizontal, Check,
  Activity, Inbox, ClipboardList,
  Mail, TrendingUp, Link, Plane, Heart, Star, Trash2, Paperclip,
  FileImage, Trophy, Layers,
  MapPin, UsersRound, GraduationCap, MessageSquare, X,
  Play, Pause, RotateCcw, Archive, Search,
  Wand2, Download, Sparkles,
} from "lucide-react";

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
    if (!isInternal) {
      notifyCaseParticipants(caseId, user?.id, "New comment on case", body.length > 100 ? body.slice(0, 97) + "…" : body);
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
      .upsert({ client_id: clientId, ...updates }, { onConflict: "client_id" }).select().single();
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
    const { error } = await supabase.from("db_connections").insert({ ...conn, client_id: clientId });
    if (error) throw error;
    await fetchConnections();
  }
  async function deleteConnection(id) {
    await supabase.from("db_connections").delete().eq("id", id);
    await fetchConnections();
  }
  return { connections, addConnection, deleteConnection, refetch: fetchConnections };
}

function useSubCases(parentCaseId) {
  const [subCases, setSubCases] = useState([]);
  const [loading, setLoading]   = useState(true);

  const fetchSubCases = useCallback(async () => {
    if (!parentCaseId) { setLoading(false); return; }
    const { data } = await supabase
      .from("cases")
      .select(`
        *,
        client:client_id(id, full_name, client_profiles(company_name)),
        manager:manager_id(id, full_name)
      `)
      .eq("parent_case_id", parentCaseId)
      .order("created_at");
    setSubCases(data ?? []);
    setLoading(false);
  }, [parentCaseId]);

  useEffect(() => { fetchSubCases(); }, [fetchSubCases]);

  async function createSubCase(data) {
    const { data: row, error } = await supabase
      .from("cases")
      .insert({ ...data, parent_case_id: parentCaseId })
      .select().single();
    if (error) throw error;
    await fetchSubCases();
    return row;
  }

  return { subCases, loading, createSubCase, refetch: fetchSubCases };
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
    const { error } = await supabase.from("client_team_members").insert({ ...member, client_id: clientId });
    if (error) throw error;
    await fetchMembers();
  }
  return { members, addMember, refetch: fetchMembers };
}


// ============================================================
// V9 NEW HOOKS
// ============================================================

function useInvoices(filters = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const filterKey = JSON.stringify(filters);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select(`*, client:client_id(id, full_name, client_profiles(company_name)),
               case:case_id(id, title), consultant:consultant_id(id, full_name)`)
      .order("created_at", { ascending: false });
    if (filters.client_id) query = query.eq("client_id", filters.client_id);
    if (filters.status)    query = query.eq("status", filters.status);
    if (filters.case_id)   query = query.eq("case_id", filters.case_id);
    const { data } = await query;
    setInvoices(data ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  async function createInvoice(data) {
    const { data: row, error } = await supabase.from("invoices").insert(data).select().single();
    if (error) throw error;
    await fetchInvoices();
    return row;
  }

  async function updateInvoice(id, updates) {
    const { data: row, error } = await supabase.from("invoices").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await fetchInvoices();
    return row;
  }

  async function deleteInvoice(id) {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
    await fetchInvoices();
  }

  return { invoices, loading, createInvoice, updateInvoice, deleteInvoice, refetch: fetchInvoices };
}

function useProjects(filters = {}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const filterKey = JSON.stringify(filters);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("projects")
      .select(`*, client:client_id(id, full_name, client_profiles(company_name)), cases(id, status)`)
      .order("created_at", { ascending: false });
    if (filters.client_id) q = q.eq("client_id", filters.client_id);
    if (filters.status)    q = q.eq("status", filters.status);
    const { data } = await q;
    setProjects(data ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  async function createProject(data) {
    const { data: row, error } = await supabase.from("projects").insert(data).select().single();
    if (error) throw error;
    await fetchProjects();
    return row;
  }

  async function updateProject(id, updates) {
    const { data: row, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await fetchProjects();
    return row;
  }

  async function closeProject(id, newStatus) {
    // Cascade: close all non-terminal cases in this project
    await supabase.from("cases")
      .update({ status: newStatus })
      .eq("project_id", id)
      .not("status", "in", `(completed,cancelled)`);
    const { data: row, error } = await supabase.from("projects").update({ status: newStatus }).eq("id", id).select().single();
    if (error) throw error;
    await fetchProjects();
    return row;
  }

  async function deleteProject(id) {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    await fetchProjects();
  }

  return { projects, loading, createProject, updateProject, closeProject, deleteProject, refetch: fetchProjects };
}

function useTimeEntries(caseId = null) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("time_entries")
      .select(`*, consultant:consultant_id(id, full_name, avatar_url),
               case:case_id(id, title), approver:approved_by(full_name)`)
      .order("date", { ascending: false });
    if (caseId) query = query.eq("case_id", caseId);
    const { data } = await query;
    setEntries(data ?? []);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function addTimeEntry(data) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("time_entries")
      .insert({ ...data, consultant_id: user.id }).select().single();
    if (error) throw error;
    await fetchEntries();
    return row;
  }

  async function approveEntry(id, approved) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("time_entries")
      .update({ is_approved: approved, approved_by: approved ? user.id : null }).eq("id", id);
    if (error) throw error;
    await fetchEntries();
  }

  async function deleteEntry(id) {
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) throw error;
    await fetchEntries();
  }

  return { entries, loading, addTimeEntry, approveEntry, deleteEntry, refetch: fetchEntries };
}

function useCaseDocuments(caseId) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading]     = useState(true);

  const fetchDocs = useCallback(async () => {
    if (!caseId) { setLoading(false); return; }
    const { data } = await supabase.from("case_documents")
      .select("*, uploader:uploaded_by(full_name)")
      .eq("case_id", caseId).order("created_at", { ascending: false });
    setDocuments(data ?? []);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function addDocument(file, notes = "") {
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${caseId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("case-documents").upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from("case-documents").getPublicUrl(path);
    const ext = file.name.split(".").pop();
    const { error } = await supabase.from("case_documents").insert({
      case_id: caseId, uploaded_by: user.id,
      file_name: file.name, file_url: publicUrl,
      file_type: file.type || ext,
      file_size_kb: Math.round(file.size / 1024),
      notes,
    });
    if (error) throw error;
    await fetchDocs();
    return publicUrl;
  }

  async function deleteDocument(id, fileUrl) {
    if (fileUrl) {
      const pathPart = fileUrl.split("/case-documents/")[1];
      if (pathPart) await supabase.storage.from("case-documents").remove([pathPart]);
    }
    await supabase.from("case_documents").delete().eq("id", id);
    await fetchDocs();
  }

  return { documents, loading, addDocument, deleteDocument, refetch: fetchDocs };
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
    let { data } = await supabase
      .from("users")
      .select("*, consultant_profiles(*), client_profiles(*)")
      .eq("id", userId)
      .single();

    if (!data) {
      // Trigger may have failed — try creating the public.users row client-side
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata ?? {};
        await supabase.from("users").insert({
          id: user.id,
          email: user.email,
          full_name: meta.full_name || user.email.split("@")[0],
          role: meta.role || "consultant",
        });
        const { data: retry } = await supabase
          .from("users")
          .select("*, consultant_profiles(*), client_profiles(*)")
          .eq("id", userId)
          .single();
        data = retry;
      }
    }

    setProfile(data ?? null);
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
    isKeyUser:    profile?.role === "key_user",
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
        case_key_users(user_id, area, users:user_id(full_name, email)),
        applications(count)
      `)
      .order("created_at", { ascending: false });

    if (filters.status)    query = query.eq("status", filters.status);
    if (filters.priority)  query = query.eq("priority", filters.priority);
    if (filters.search)    query = query.ilike("title", `%${filters.search}%`);
    if (filters.client_id) query = query.eq("client_id", filters.client_id);

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
    notifyManagers("New case created", `Case "${row.title}" has been submitted and needs review.`);
    return row;
  }

  async function updateCase(id, updates) {
    const { data: row, error } = await supabase.from("cases").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await fetchCases();
    if (updates.status) {
      const { data: { user } } = await supabase.auth.getUser();
      notifyCaseParticipants(id, user?.id, "Case status updated", `Case status changed to "${updates.status}".`);
    }
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
    notifyManagers("New application received", `A consultant applied to a case. Review in the applications section.`);
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
      if (app) {
        await supabase.from("case_assignments").upsert({
          case_id: app.case_id, consultant_id: app.consultant_id,
          time_commitment: app.time_commitment,
        });
        notify(app.consultant_id, "Application accepted", "Your application has been accepted. You are now assigned to the case.");
      }
    } else if (status === "rejected") {
      const app = applications.find(a => a.id === appId);
      if (app) notify(app.consultant_id, "Application not selected", "Your application was reviewed but was not selected for this case.");
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

function useFollowedClients() {
  const [followed, setFollowed] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("followed_clients")
        .select("client_user_id").eq("consultant_id", user.id);
      setFollowed(data?.map(f => f.client_user_id) ?? []);
    })();
  }, []);

  function isFollowing(clientUserId) { return !!clientUserId && followed.includes(clientUserId); }

  async function toggle(clientUserId) {
    if (!clientUserId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (isFollowing(clientUserId)) {
      await supabase.from("followed_clients")
        .delete().eq("consultant_id", user.id).eq("client_user_id", clientUserId);
      setFollowed(prev => prev.filter(id => id !== clientUserId));
    } else {
      await supabase.from("followed_clients")
        .insert({ consultant_id: user.id, client_user_id: clientUserId });
      setFollowed(prev => [...prev, clientUserId]);
    }
  }

  return { followed, isFollowing, toggle };
}

function useConsultantProfile(consultantId, profileId) {
  const [profile, setProfile]       = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [profileError, setProfileError] = useState(null);

  const resolvedId = profileId ?? consultantId;

  const fetchProfile = useCallback(async () => {
    if (!resolvedId) return;
    setLoading(true);
    setProfileError(null);

    // Avoid the case_assignments nested join — it requires a FK from case_assignments
    // to consultant_profiles which may not exist. Fetch core + safe related tables only.
    const { data, error } = await supabase.from("consultant_profiles")
      .select(`*, work_authorizations(*), consultant_customers(*), consultant_projects(*)`)
      .eq("id", resolvedId)
      .maybeSingle();

    if (error) {
      setProfileError(error.message);
      console.error("fetchProfile error:", error.message);
    } else {
      setProfile(data ?? null);
    }

    const { data: avail } = await supabase.rpc("get_consultant_availability",
      { p_consultant_id: resolvedId });
    setAvailability(avail);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data: updated, error } = await supabase.from("consultant_profiles")
      .update(updates).eq("id", resolvedId).select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      // No row exists yet — insert for first time
      const { error: ie } = await supabase.from("consultant_profiles")
        .insert({ id: resolvedId, ...updates });
      if (ie) throw new Error(`Profile create failed: ${ie.message}`);
    }
    await fetchProfile();
  }

  async function addCustomer(data) {
    const { error } = await supabase.from("consultant_customers")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function addProject(data) {
    const { error } = await supabase.from("consultant_projects")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function addWorkAuth(data) {
    const { error } = await supabase.from("work_authorizations")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop();
    const path = `avatars/${consultantId}.${ext}`;
    await supabase.storage.from("profiles").upload(path, file, { upsert: true });
    const { data: { publicUrl } } = supabase.storage.from("profiles").getPublicUrl(path);
    await updateProfile({ photo_url: publicUrl });
    return publicUrl;
  }

  return { profile, availability, loading, profileError, updateProfile, uploadPhoto, addCustomer, addProject, addWorkAuth, refetch: fetchProfile };
}

// ── Notification helpers ─────────────────────────────────────
async function notify(userId, title, body) {
  if (!userId) return;
  try { await supabase.from("notifications").insert({ user_id: userId, title, body, is_read: false }); } catch (_) {}
}
async function notifyManagers(title, body) {
  try {
    const { data } = await supabase.from("users").select("id").in("role", ["admin","manager"]).eq("is_active", true);
    if (!data?.length) return;
    await supabase.from("notifications").insert(data.map(u => ({ user_id: u.id, title, body, is_read: false })));
  } catch (_) {}
}
async function notifyCaseParticipants(caseId, excludeUserId, title, body) {
  try {
    const { data: c } = await supabase.from("cases")
      .select("client_id, case_key_users(user_id), case_assignments(consultant_id)").eq("id", caseId).single();
    if (!c) return;
    const ids = new Set();
    if (c.client_id && c.client_id !== excludeUserId) ids.add(c.client_id);
    (c.case_key_users ?? []).forEach(ku => { if (ku.user_id !== excludeUserId) ids.add(ku.user_id); });
    (c.case_assignments ?? []).forEach(a => { if (a.consultant_id !== excludeUserId) ids.add(a.consultant_id); });
    if (!ids.size) return;
    await supabase.from("notifications").insert([...ids].map(uid => ({ user_id: uid, title, body, is_read: false })));
  } catch (_) {}
}
// ─────────────────────────────────────────────────────────────

// ── Claude API helper ────────────────────────────────────────
async function callClaude({ system, messages, max_tokens = 2048, model = 'claude-haiku-4-5-20251001' }) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens, model }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Claude API error'); }
  const data = await res.json();
  return data.content[0].text;
}
// ─────────────────────────────────────────────────────────────

// ── Case Specification hook ──────────────────────────────────
function useCaseSpecification(caseId, userId) {
  const [spec, setSpec]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSpec = useCallback(async () => {
    if (!caseId) { setLoading(false); return; }
    const { data } = await supabase.from("case_specifications")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSpec(data ?? null);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchSpec(); }, [fetchSpec]);

  async function saveSpec(payload) {
    if (spec?.id) {
      const { data, error } = await supabase.from("case_specifications")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", spec.id)
        .select()
        .single();
      if (error) throw error;
      setSpec(data);
      return data;
    } else {
      const { data, error } = await supabase.from("case_specifications")
        .insert({ ...payload, case_id: caseId, created_by: userId })
        .select()
        .single();
      if (error) throw error;
      setSpec(data);
      return data;
    }
  }

  return { spec, loading, saveSpec, refetch: fetchSpec };
}
// ─────────────────────────────────────────────────────────────

// Lightweight hook used only in App for the sidebar badge — separate channel name
function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let ch;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase.from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_read", false);
      setUnreadCount(count ?? 0);
      ch = supabase.channel(`notif-badge-${user.id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => setUnreadCount(p => p + 1))
        .subscribe();
    })();
    return () => { if (ch) supabase.removeChannel(ch); };
  }, []);

  return unreadCount;
}

// Full hook used only inside NotificationsView
function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    let ch;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from("notifications")
        .select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(50);
      setNotifications(data ?? []);
      setUnreadCount((data ?? []).filter(n => !n.is_read).length);
      setLoading(false);
      ch = supabase.channel(`notif-view-${user.id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          payload => { setNotifications(p => [payload.new, ...p]); setUnreadCount(p => p + 1); })
        .subscribe();
    })();
    return () => { if (ch) supabase.removeChannel(ch); };
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

  return { notifications, unreadCount, loading, markRead, markAllRead };
}

function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 1. Fetch all consultant profiles
      const { data: profiles } = await supabase
        .from("consultant_profiles")
        .select("id, headline, skills, years_experience, expertise_level, availability_type, hourly_rate");

      if (!profiles?.length) { setLoading(false); return; }

      const ids = profiles.map(p => p.id);

      // 2. Fetch users, ratings, applications keyed by consultant user-id in parallel
      const [{ data: usersData }, { data: ratingsData }, { data: appsData }] = await Promise.all([
        supabase.from("users").select("id, full_name, avatar_url").in("id", ids),
        supabase.from("ratings").select("consultant_id, score").in("consultant_id", ids),
        supabase.from("applications").select("consultant_id, status").in("consultant_id", ids),
      ]);

      const ranked = profiles.map(c => {
        const scores      = (ratingsData ?? []).filter(r => r.consultant_id === c.id).map(r => r.score);
        const apps        = (appsData    ?? []).filter(a => a.consultant_id === c.id);
        const avgRating   = scores.length
          ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
        return {
          ...c,
          user:          (usersData ?? []).find(u => u.id === c.id) ?? null,
          avgRating,
          ratingCount:   scores.length,
          acceptedCases: apps.filter(a => a.status === "accepted").length,
          totalApps:     apps.length,
        };
      }).sort((a, b) => b.avgRating - a.avgRating || b.acceptedCases - a.acceptedCases);

      setLeaderboard(ranked);
      setLoading(false);
    })();
  }, []);

  return { leaderboard, loading };
}

// ============================================================
// UTILITIES
// ============================================================
const ROLE_COLORS = {
  admin:      { bg: "bg-violet-100", text: "text-violet-800", dot: "bg-violet-500" },
  manager:    { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  consultant: { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  client:     { bg: "bg-orange-100", text: "text-orange-800", dot: "bg-orange-500" },
};

const SAP_AREAS = [
  "SAP S/4HANA", "SAP BW / Analytics", "SAP FICO", "SAP MM/SD",
  "SAP HCM", "SAP Basis / Infrastructure", "SAP Fiori / UI5",
  "SAP Integration (CPI/PI)", "Other SAP",
];
const INDUSTRY_AREAS = [
  "Technology", "Finance & Banking", "Healthcare", "Legal",
  "Manufacturing", "Retail & Commerce", "Energy & Utilities", "Public Sector", "Other",
];

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


const LIFECYCLE_PRESETS = {
  short: {
    name: "Short",
    subtitle: "4 stages",
    description: "Simple flow for straightforward consulting requests.",
    stages: [
      { key: "open",        label: "New Request", color: "#60A5FA", is_terminal: false },
      { key: "in_progress", label: "Active",      color: "#1E40AF", is_terminal: false },
      { key: "completed",   label: "Done",        color: "#374151", is_terminal: true  },
      { key: "cancelled",   label: "Cancelled",   color: "#6B7280", is_terminal: true  },
    ],
  },
  standard: {
    name: "Standard",
    subtitle: "5 stages",
    description: "Default consulting flow with an On Hold pause state.",
    stages: [
      { key: "open",        label: "Open",        color: "#93C5FD", is_terminal: false },
      { key: "in_progress", label: "In Progress", color: "#2563EB", is_terminal: false },
      { key: "on_hold",     label: "On Hold",     color: "#1D4ED8", is_terminal: false },
      { key: "completed",   label: "Completed",   color: "#374151", is_terminal: true  },
      { key: "cancelled",   label: "Cancelled",   color: "#6B7280", is_terminal: true  },
    ],
  },
  large: {
    name: "Large",
    subtitle: "7 stages",
    description: "Full consulting pipeline from sourcing through placement.",
    stages: [
      { key: "open",        label: "Sourcing",    color: "#93C5FD", is_terminal: false },
      { key: "screening",   label: "Screening",   color: "#60A5FA", is_terminal: false },
      { key: "shortlisted", label: "Shortlisted", color: "#3B82F6", is_terminal: false },
      { key: "in_progress", label: "In Progress", color: "#1D4ED8", is_terminal: false },
      { key: "on_hold",     label: "Negotiation", color: "#1E40AF", is_terminal: false },
      { key: "completed",   label: "Placed",      color: "#374151", is_terminal: true  },
      { key: "cancelled",   label: "Closed Lost", color: "#6B7280", is_terminal: true  },
    ],
  },
};

function getLifecycleStages(lifecycle, templates) {
  function resolvePreset(preset) {
    if (templates?.length) {
      const tmpl = templates.find(t => t.key === preset);
      if (tmpl) return tmpl.stages;
    }
    return LIFECYCLE_PRESETS[preset]?.stages ?? LIFECYCLE_PRESETS.standard.stages;
  }
  if (!lifecycle) return resolvePreset("standard");
  if (lifecycle.preset && lifecycle.preset !== "custom") return resolvePreset(lifecycle.preset);
  return lifecycle.stages?.length ? lifecycle.stages : resolvePreset("standard");
}

function useLifecycleTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loadingTmpl, setLoadingTmpl] = useState(true);

  async function fetchTemplates() {
    setLoadingTmpl(true);
    const { data } = await supabase.from("lifecycle_templates")
      .select("*").eq("is_active", true).order("sort_order");
    setTemplates(data ?? []);
    setLoadingTmpl(false);
  }

  useEffect(() => { fetchTemplates(); }, []);

  function getTemplateStages(preset) {
    const tmpl = templates.find(t => t.key === preset);
    if (tmpl) return tmpl.stages;
    return LIFECYCLE_PRESETS[preset]?.stages ?? LIFECYCLE_PRESETS.standard.stages;
  }

  return { templates, loadingTmpl, fetchTemplates, getTemplateStages };
}

const SLA_PRIORITIES = [
  { key: "critical", label: "Critical", dot: "bg-red-500",    badge: "bg-red-50 text-red-700 border border-red-200"         },
  { key: "high",     label: "High",     dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border border-orange-200" },
  { key: "medium",   label: "Medium",   dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border border-yellow-200" },
  { key: "low",      label: "Low",      dot: "bg-slate-400",  badge: "bg-slate-50 text-slate-600 border border-slate-200"    },
];

const SLA_DEFAULT_TYPES = [
  { key: "general",        label: "General Information" },
  { key: "problem",        label: "Problem"             },
  { key: "change_request", label: "Change Request"      },
];

function makeDefaultMatrix(keys) {
  const seed = {
    general:        { critical:{response:1,response_unit:"hours",resolution:8,resolution_unit:"hours"}, high:{response:8,response_unit:"hours",resolution:1,resolution_unit:"days"},  medium:{response:1,response_unit:"days",resolution:3,resolution_unit:"days"},  low:{response:3,response_unit:"days",resolution:8,resolution_unit:"days"} },
    problem:        { critical:{response:30,response_unit:"minutes",resolution:2,resolution_unit:"hours"}, high:{response:2,response_unit:"hours",resolution:8,resolution_unit:"hours"}, medium:{response:4,response_unit:"hours",resolution:2,resolution_unit:"days"},  low:{response:8,response_unit:"hours",resolution:5,resolution_unit:"days"} },
    change_request: { critical:{response:30,response_unit:"minutes",resolution:4,resolution_unit:"hours"}, high:{response:8,response_unit:"hours",resolution:1,resolution_unit:"days"},  medium:{response:1,response_unit:"days",resolution:3,resolution_unit:"days"},  low:{response:3,response_unit:"days",resolution:1,resolution_unit:"weeks"} },
  };
  const blank = Object.fromEntries(SLA_PRIORITIES.map(p => [p.key, { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" }]));
  return Object.fromEntries((keys ?? SLA_DEFAULT_TYPES.map(t => t.key)).map(k => [k, seed[k] ?? blank]));
}

const SLA_UNIT_LABELS = { minutes: "min", hours: "h", days: "d", weeks: "wk" };

function SlaMatrixEditor({ caseTypes, matrix, editing, onChangeCaseTypes, onChangeMatrix }) {
  const UNITS = ["minutes", "hours", "days", "weeks"];

  function setCellField(ctKey, pKey, field, value) {
    onChangeMatrix(prev => ({
      ...prev,
      [ctKey]: { ...(prev[ctKey] ?? {}), [pKey]: { ...(prev[ctKey]?.[pKey] ?? {}), [field]: value } }
    }));
  }

  function addCaseType() {
    const key = `type_${caseTypes.length + 1}`;
    onChangeCaseTypes(prev => [...prev, { key, label: "New Type" }]);
    onChangeMatrix(prev => ({
      ...prev,
      [key]: Object.fromEntries(SLA_PRIORITIES.map(p => [p.key, { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" }]))
    }));
  }

  function removeCaseType(key) {
    onChangeCaseTypes(prev => prev.filter(ct => ct.key !== key));
    onChangeMatrix(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm border-collapse min-w-[500px]">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-500 bg-gray-50 w-28 border-b border-gray-100">
              Priority
            </th>
            {caseTypes.map(ct => (
              <th key={ct.key} className="px-4 py-3 bg-gray-50 border-b border-l border-gray-100 text-center">
                {editing ? (
                  <div className="flex items-center gap-1 min-w-[120px]">
                    <input
                      className="flex-1 text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2 py-1 text-center min-w-0"
                      value={ct.label}
                      onChange={e => onChangeCaseTypes(prev => prev.map(c => c.key === ct.key ? { ...c, label: e.target.value } : c))}
                    />
                    {caseTypes.length > 1 && (
                      <button onClick={() => removeCaseType(ct.key)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-gray-700">{ct.label}</span>
                )}
              </th>
            ))}
            {editing && (
              <th className="px-4 py-3 bg-gray-50 border-b border-l border-gray-100">
                <button onClick={addCaseType} className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">+ Add</button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {SLA_PRIORITIES.map((p, pi) => (
            <tr key={p.key} className={pi % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
              <td className="px-4 py-3 border-b border-gray-100">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${p.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.dot}`} />
                  {p.label}
                </span>
              </td>
              {caseTypes.map(ct => {
                const cell = matrix?.[ct.key]?.[p.key] ?? { response:4, response_unit:"hours", resolution:1, resolution_unit:"days" };
                return (
                  <td key={ct.key} className="px-4 py-3 border-b border-l border-gray-100">
                    {editing ? (
                      <div className="space-y-2">
                        {[["response","Response"],["resolution","Resolution"]].map(([field, lbl]) => (
                          <div key={field} className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 w-16 shrink-0">{lbl}</span>
                            <input type="number" min="1"
                              className="w-12 text-xs border border-gray-200 rounded-lg px-1.5 py-1 text-center"
                              value={cell[field]}
                              onChange={e => setCellField(ct.key, p.key, field, Number(e.target.value))} />
                            <select
                              className="text-xs border border-gray-200 rounded-lg px-1 py-1 bg-white"
                              value={cell[`${field}_unit`]}
                              onChange={e => setCellField(ct.key, p.key, `${field}_unit`, e.target.value)}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1 text-center">
                        <div className="text-xs flex items-center justify-center gap-1">
                          <span className="text-blue-400">↩</span>
                          <span className="font-medium text-gray-800">{cell.response}</span>
                          <span className="text-gray-400">{SLA_UNIT_LABELS[cell.response_unit]}</span>
                        </div>
                        <div className="text-xs flex items-center justify-center gap-1">
                          <span className="text-green-500">✓</span>
                          <span className="font-medium text-gray-800">{cell.resolution}</span>
                          <span className="text-gray-400">{SLA_UNIT_LABELS[cell.resolution_unit]}</span>
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
              {editing && <td className="border-b border-l border-gray-100" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INVOICE_STATUS_COLORS = {
  draft:   "bg-gray-100 text-gray-600",
  sent:    "bg-blue-100 text-blue-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
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
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ Icon: IconComp, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex justify-center">
        {IconComp && <IconComp className="w-8 h-8 text-gray-300" />}
      </div>
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
      {label && <label className="block text-sm font-medium text-[#1C3557] mb-1">{label}</label>}
      <input
        className="w-full bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
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
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
  const [mode, setMode]         = useState("signin");
  // Sign-in fields
  const [siEmail, setSiEmail]   = useState("");
  const [siPass,  setSiPass]    = useState("");
  // Sign-up wizard
  const [step, setStep]         = useState(0);
  const [email, setEmail]       = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode]         = useState("");
  const [role, setRole]         = useState("");
  const [name, setName]         = useState("");
  const [password, setPass]     = useState("");
  const [confirmPass, setConf]  = useState("");
  // Consultant-specific
  const [headline, setHeadline]       = useState("");
  const [skills, setSkills]           = useState("");
  const [yearsExp, setYearsExp]       = useState("");
  const [hourlyRate, setHourly]       = useState("");
  const [expertiseLevel, setExpertise]= useState("mid");
  // Client-specific
  const [companyName, setCompany]     = useState("");
  const [industry, setIndustry]       = useState("");
  // Key-user detection (set after OTP verify)
  const [keyUserCompany, setKeyUserCompany] = useState(null);

  const [error, setError]   = useState("");
  const [loading, setLoad]  = useState(false);
  const auth = useAuth();

  const SIGNUP_STEPS = [
    { id: "verify",  label: "Verify",  Icon: Mail },
    { id: "role",    label: "Role",    Icon: User },
    { id: "profile", label: "Profile", Icon: FileText },
  ];

  function switchMode(m) { setMode(m); setError(""); setStep(0); setCodeSent(false); setCode(""); }

  // ── Sign in ──────────────────────────────────────────────────
  async function handleSignIn() {
    setError(""); setLoad(true);
    try { await auth.signIn(siEmail, siPass); onAuth(null); }
    catch (e) { setError(e.message); }
    setLoad(false);
  }

  // ── Step 0a: send OTP ─────────────────────────────────────────
  async function sendCode() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(""); setLoad(true);
    try {
      // signUp is the correct API for new account creation.
      // A random temp password is used here; the real password is set in Step 2.
      const tempPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + "1!";
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password: tempPass,
      });
      if (err) {
        console.error("sendCode error:", err);
        // Extract a readable message — guard against Supabase returning "{}" as message
        const raw = err.message || err.error_description || err.msg || "";
        const isUseless = !raw || raw === "{}" || raw === "[object Object]";
        const msg = isUseless
          ? (err.status ? `Auth error ${err.status} — check Supabase configuration.` : "Could not send code — check your Supabase settings and try again.")
          : raw;
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists"))
          setError("This email already has an account — use Sign In instead.");
        else if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many"))
          setError("Too many requests — please wait a minute and try again.");
        else if (msg.toLowerCase().includes("signup") || msg.toLowerCase().includes("disabled"))
          setError("Sign-ups are disabled. Go to Supabase → Authentication → Settings and turn off \"Disable sign-ups\".");
        else if (msg.toLowerCase().includes("smtp") || msg.toLowerCase().includes("email"))
          setError("Email delivery error. Ensure custom SMTP is configured in Supabase → Authentication → SMTP Settings.");
        else
          setError(msg);
      } else if (!data?.user || data.user.identities?.length === 0) {
        // Supabase returns an empty identities array when the email already exists
        setError("This email already has an account — use Sign In instead.");
      } else {
        setCodeSent(true);
        setCode("");
      }
    } catch (e) {
      console.error("sendCode exception:", e);
      setError(e?.message || e?.toString() || "Unexpected error — please try again.");
    }
    setLoad(false);
  }

  // ── Step 0b: verify OTP ───────────────────────────────────────
  async function verifyCode() {
    if (code.length < 4) { setError("Enter the verification code from your email."); return; }
    setError(""); setLoad(true);
    // type:'signup' matches the token sent by signUp
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code, type: "signup",
    });
    if (err) {
      setError(err.message || "Invalid or expired code — try resending.");
      setLoad(false);
      return;
    }
    // Check if this user already completed their profile
    const { data: existing } = await supabase
      .from("users").select("role").eq("id", data.user?.id).maybeSingle();
    if (existing?.role) { onAuth(null); return; } // returning user → dashboard
    // Detect if this email is pre-registered as a key user on any case
    const { data: kuCases } = await supabase
      .from("cases")
      .select("key_user_email, client:client_id(client_profiles(company_name))")
      .eq("key_user_email", email.trim())
      .limit(1);
    if (kuCases?.length > 0) {
      const cp = kuCases[0].client?.client_profiles;
      setKeyUserCompany((Array.isArray(cp) ? cp[0]?.company_name : cp?.company_name) ?? "a company");
    } else {
      setKeyUserCompany(null);
    }
    setStep(1);
    setLoad(false);
  }

  // ── Step 1: role chosen ───────────────────────────────────────
  function selectRole(r) { setRole(r); setError(""); setStep(2); }

  // ── Step 2: create account ────────────────────────────────────
  async function createAccount() {
    if (!name.trim()) { setError("Enter your full name."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPass) { setError("Passwords don't match."); return; }
    if (role === "consultant" && !headline.trim()) { setError("Enter a professional headline."); return; }
    if (role === "client" && !companyName.trim()) { setError("Enter your company name."); return; }
    if (role === "key_user" && !keyUserCompany) { setError("Your email is not registered as a Key User for any company."); return; }
    setError(""); setLoad(true);
    try {
      await supabase.auth.updateUser({
        password,
        data: { full_name: name.trim(), role },
      });
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("users").upsert(
        { id: user.id, email: user.email, full_name: name.trim(), role },
        { onConflict: "id" }
      );
      if (role === "consultant") {
        const skillsArr = skills.split(",").map(s => s.trim()).filter(Boolean);
        await supabase.from("consultant_profiles").upsert({
          id: user.id,
          headline: headline.trim(),
          skills: skillsArr,
          years_experience: yearsExp ? parseInt(yearsExp, 10) : null,
          hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
          expertise_level: expertiseLevel,
        }, { onConflict: "id" });
      }
      if (role === "client") {
        await supabase.from("client_profiles").upsert({
          id: user.id,
          company_name: companyName.trim(),
          industry: industry || null,
        }, { onConflict: "id" });
      }
      if (role === "key_user") {
        // Link this user to all cases where their email was pre-registered as key user
        const { data: matchingCases } = await supabase.from("cases")
          .select("id").eq("key_user_email", user.email);
        if (matchingCases?.length) {
          await supabase.from("case_key_users").insert(
            matchingCases.map(c => ({ case_id: c.id, user_id: user.id }))
          ).onConflict("case_id,user_id").ignore();
        }
      }
      onAuth(role);
    } catch (e) { setError(e.message); }
    setLoad(false);
  }

  const logo = (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center mb-4">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <polygon points="40,4 74,22 74,58 40,76 6,58 6,22" fill="#1A4B8C" stroke="#5B9BD5" strokeWidth="3"/>
          <circle cx="40" cy="40" r="22" fill="#153A6E"/>
          <text x="40" y="46" textAnchor="middle" fill="#93C5FD" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">TC</text>
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-[#1C3557]">TechCase</h1>
      <p className="text-blue-500 mt-1">Consultant case management platform</p>
    </div>
  );

  const tabs = (
    <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
      {[["signin", "Sign In"], ["signup", "Create Account"]].map(([m, label]) => (
        <button key={m} onClick={() => switchMode(m)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            mode === m ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  const errorBox = error && (
    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
  );

  return (
    <div className="min-h-screen bg-[#D0E8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {logo}

        {/* ── SIGN IN ── */}
        {mode === "signin" && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {tabs}
            <Input label="Email" type="email" value={siEmail}
              onChange={e => setSiEmail(e.target.value)} placeholder="you@company.com" />
            <Input label="Password" type="password" value={siPass}
              onChange={e => setSiPass(e.target.value)} placeholder="••••••••" />
            {errorBox}
            <button onClick={handleSignIn} disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 mt-2">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        )}

        {/* ── SIGN UP WIZARD ── */}
        {mode === "signup" && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {tabs}

            {/* Step progress */}
            <div className="flex items-center mb-8 relative">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
              {SIGNUP_STEPS.map((s, i) => (
                <div key={s.id} className="relative z-10 flex flex-col items-center flex-1 gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 transition-all ${
                    i < step  ? "bg-emerald-500 text-white ring-emerald-100"
                    : i === step ? "bg-[#1C3557] text-white ring-blue-200"
                                 : "bg-gray-100 text-gray-400 ring-gray-200"}`}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${i === step ? "text-[#1C3557]" : i < step ? "text-emerald-600" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Step 0 — Email verification */}
            {step === 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Verify your email</h2>
                <p className="text-sm text-gray-500 mb-5">We'll send a verification code to confirm it's you.</p>
                <Input label="Email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
                {!codeSent ? (
                  <button onClick={sendCode} disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                    {loading ? "Sending…" : "Send Verification Code →"}
                  </button>
                ) : (
                  <>
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                      <Mail className="w-4 h-4 inline-block mr-1" />Code sent to <strong>{email}</strong> — check your inbox.
                    </div>
                    <Input label="Verification Code" value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Enter code from email" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={sendCode} disabled={loading}
                        className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-xl text-sm transition-colors">
                        Resend
                      </button>
                      <button onClick={verifyCode} disabled={loading || code.length < 4}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                        {loading ? "Verifying…" : "Verify →"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 1 — Role selection */}
            {step === 1 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">What brings you here?</h2>
                <p className="text-sm text-gray-500 mb-5">Choose your account type to get the right experience.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { role: "consultant", Icon: Briefcase, label: "Consultant",       desc: "I offer expertise and work on cases" },
                    { role: "client",     Icon: Building2, label: "Company / Client", desc: "I post cases and hire consultants" },
                  ].map(opt => (
                    <button key={opt.role} onClick={() => selectRole(opt.role)}
                      className="flex flex-col items-center gap-2 p-5 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl transition-all text-center group">
                      <opt.Icon className="w-8 h-8 text-blue-600 group-hover:text-blue-700" />
                      <span className="font-semibold text-gray-900 text-sm group-hover:text-blue-700">{opt.label}</span>
                      <span className="text-xs text-gray-500 leading-snug">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                {/* Key User — only selectable if email is pre-registered */}
                <button
                  onClick={() => keyUserCompany && selectRole("key_user")}
                  disabled={!keyUserCompany}
                  className={`w-full mt-3 flex items-center gap-4 p-4 border-2 rounded-2xl transition-all text-left
                    ${keyUserCompany
                      ? "border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 cursor-pointer"
                      : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                  <UserCheck className={`w-8 h-8 flex-shrink-0 ${keyUserCompany ? "text-blue-600" : "text-gray-400"}`} />
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${keyUserCompany ? "text-blue-700" : "text-gray-500"}`}>Key User</div>
                    <div className="text-xs text-gray-500 mt-0.5">I'm the primary contact at a client company working on assigned cases</div>
                    {keyUserCompany
                      ? <div className="text-xs text-blue-600 font-semibold mt-1">Linked to <span className="font-bold">{keyUserCompany}</span></div>
                      : <div className="text-xs text-amber-600 mt-1">Your email isn't registered as a Key User for any company</div>
                    }
                  </div>
                </button>
              </div>
            )}

            {/* Step 2 — Profile details */}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  {role === "consultant" ? "Build your consultant profile"
                    : role === "key_user" ? "Complete your Key User account"
                    : "Set up your company profile"}
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  {role === "consultant"
                    ? "Help clients find you with the right details."
                    : role === "key_user"
                    ? `You'll have access to cases from ${keyUserCompany ?? "your company"}.`
                    : "Tell consultants about your company."}
                </p>
                {role === "key_user" && keyUserCompany && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4">
                    <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm text-blue-700 font-medium">{keyUserCompany}</span>
                  </div>
                )}

                {/* ── Common fields ── */}
                <Input label="Full Name" value={name}
                  onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
                <Input label="Password" type="password" value={password}
                  onChange={e => setPass(e.target.value)} placeholder="At least 6 characters" />
                <Input label="Confirm Password" type="password" value={confirmPass}
                  onChange={e => setConf(e.target.value)} placeholder="••••••••" />

                {/* ── Consultant fields ── */}
                {role === "consultant" && (<>
                  <div className="border-t border-gray-100 my-4" />
                  <Input label="Professional Headline" value={headline}
                    onChange={e => setHeadline(e.target.value)}
                    placeholder="e.g. SAP FICO Consultant · 8 yrs" />
                  <Input label="Skills (comma-separated)" value={skills}
                    onChange={e => setSkills(e.target.value)}
                    placeholder="e.g. SAP, FICO, Finance, ERP" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Years of Experience" type="number" value={yearsExp}
                      onChange={e => setYearsExp(e.target.value)} placeholder="8" />
                    <Input label="Hourly Rate (USD)" type="number" value={hourlyRate}
                      onChange={e => setHourly(e.target.value)} placeholder="150" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expertise Level</label>
                    <select value={expertiseLevel} onChange={e => setExpertise(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                      <option value="junior">Junior</option>
                      <option value="mid">Mid-Level</option>
                      <option value="senior">Senior</option>
                      <option value="expert">Expert / Principal</option>
                    </select>
                  </div>
                </>)}

                {/* ── Client fields ── */}
                {role === "client" && (<>
                  <div className="border-t border-gray-100 my-4" />
                  <Input label="Company Name" value={companyName}
                    onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" />
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <select value={industry} onChange={e => setIndustry(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                      <option value="">Select industry…</option>
                      <option value="technology">Technology</option>
                      <option value="finance">Finance & Banking</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="manufacturing">Manufacturing</option>
                      <option value="retail">Retail & E-commerce</option>
                      <option value="energy">Energy & Utilities</option>
                      <option value="logistics">Logistics & Supply Chain</option>
                      <option value="professional_services">Professional Services</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </>)}

                <button onClick={createAccount} disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 mt-2">
                  {loading ? "Creating account…" : "Create Account →"}
                </button>
                <button onClick={() => setStep(1)}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {errorBox}
          </div>
        )}
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
      { id: "dashboard",      Icon: LayoutDashboard, label: "Dashboard" },
      { id: "projects",       Icon: Layers,          label: "Projects" },
      { id: "cases",          Icon: FolderOpen,      label: "Cases" },
      { id: "kanban",         Icon: LayoutGrid,      label: "Kanban" },
      { id: "arena",          Icon: Target,          label: "Arena" },
      { id: "invoices",       Icon: Receipt,         label: "Invoices" },
      { id: "time",           Icon: Clock,           label: "Time Entries" },
      { id: "users",          Icon: Users,           label: "Users" },
      { id: "sla",            Icon: Settings,        label: "SLA Config" },
      { id: "db-connections", Icon: Database,        label: "DB Connections" },
      { id: "team-members",   Icon: Handshake,       label: "Client Teams" },
      { id: "lifecycle",      Icon: TrendingUp,      label: "Lifecycle" },
      { id: "reports",        Icon: BarChart2,       label: "Reports" },
    ],
    manager: [
      { id: "dashboard",      Icon: LayoutDashboard, label: "Dashboard" },
      { id: "projects",       Icon: Layers,          label: "Projects" },
      { id: "cases",          Icon: FolderOpen,      label: "Cases" },
      { id: "kanban",         Icon: LayoutGrid,      label: "Kanban" },
      { id: "arena",          Icon: Target,          label: "Arena" },
      { id: "invoices",       Icon: Receipt,         label: "Invoices" },
      { id: "time",           Icon: Clock,           label: "Time Entries" },
      { id: "consultants",    Icon: UserCheck,       label: "Consultants" },
      { id: "sla",            Icon: Settings,        label: "SLA Config" },
      { id: "db-connections", Icon: Database,        label: "DB Connections" },
      { id: "team-members",   Icon: Handshake,       label: "Client Teams" },
      { id: "lifecycle",      Icon: TrendingUp,      label: "Lifecycle" },
    ],
    consultant: [
      { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard" },
      { id: "arena",     Icon: Target,          label: "Arena" },
      { id: "kanban",    Icon: LayoutGrid,      label: "Kanban" },
      { id: "my-cases",  Icon: FolderOpen,      label: "My Cases" },
      { id: "time",      Icon: Clock,           label: "Time Entries" },
      { id: "profile",   Icon: User,            label: "My Profile" },
    ],
    client: [
      { id: "dashboard",      Icon: LayoutDashboard, label: "Dashboard" },
      { id: "projects",       Icon: Layers,          label: "Projects" },
      { id: "cases",          Icon: FolderOpen,      label: "My Cases" },
      { id: "kanban",         Icon: LayoutGrid,      label: "Kanban" },
      { id: "invoices",       Icon: Receipt,         label: "Invoices" },
      { id: "consultants",    Icon: UserCheck,       label: "Consultants" },
      { id: "client-profile", Icon: Building2,       label: "Company Profile" },
    ],
  };

  const items = navItems[role] ?? [];

  return (
    <aside className="w-64 bg-[#1C3557] text-white flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-6 border-b border-blue-900">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <polygon points="18,2 33,10 33,26 18,34 3,26 3,10" fill="#1A4B8C" stroke="#5B9BD5" strokeWidth="2"/>
            <circle cx="18" cy="18" r="9" fill="#153A6E"/>
            <text x="18" y="22" textAnchor="middle" fill="#93C5FD" fontSize="9" fontWeight="bold" fontFamily="Arial">TC</text>
          </svg>
          <div>
            <div className="font-bold text-white">TechCase</div>
            <div className="text-xs text-blue-300 capitalize">{role} Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map(item => (
          <button key={item.id} onClick={() => onNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeView === item.id
                ? "bg-blue-600 text-white shadow-md"
                : "text-blue-200 hover:bg-blue-900 hover:text-white"}`}>
            <item.Icon className="w-[18px] h-[18px] flex-shrink-0" />
            {item.label}
          </button>
        ))}

        {/* Notifications */}
        <button onClick={() => onNav("notifications")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeView === "notifications"
              ? "bg-blue-600 text-white shadow-md"
              : "text-blue-200 hover:bg-blue-900 hover:text-white"}`}>
          <Bell className="w-[18px] h-[18px] flex-shrink-0" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-blue-900">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
            {profile?.full_name?.[0] ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{profile?.full_name ?? "User"}</div>
            <div className="text-xs text-blue-300 truncate">{profile?.email}</div>
          </div>
        </div>
        <button onClick={onSignOut}
          className="w-full text-sm text-blue-300 hover:text-white py-1.5 px-3 rounded-lg hover:bg-blue-900 transition-colors text-left">
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
  const [applyingToCase, setApplying]   = useState(null);
  const [activeTab, setActiveTab]       = useState(null);
  const [availTab, setAvailTab]         = useState("all");
  const [filterSap, setFilterSap]       = useState("");
  const [filterIndustry, setFilterInd]  = useState("");
  const [filterStartFrom, setStartFrom] = useState("");
  const { isFollowing, toggle: toggleFollow } = useFollowedClients();

  // Pre-compute filtered sets
  const myApplications   = applications.filter(a => a.consultant_id === auth.user?.id);
  const appliedCaseIds   = new Set(myApplications.map(a => a.case_id));
  const assignedCaseIds  = new Set(
    cases.flatMap(c => c.case_assignments ?? [])
      .filter(a => a.consultant_id === auth.user?.id)
      .map(a => a.case_id ?? a.id)
  );
  const availableCases   = cases.filter(c => c.status === "open" && !appliedCaseIds.has(c.id) && !assignedCaseIds.has(c.id));

  const filteredAvailable = availableCases.filter(c => {
    if (filterSap       && c.area_sap      !== filterSap)      return false;
    if (filterIndustry  && c.area_industry !== filterIndustry) return false;
    if (filterStartFrom && c.start_date    && c.start_date < filterStartFrom) return false;
    return true;
  });
  const followingCases = filteredAvailable.filter(c => isFollowing(c.client_id));
  const otherCases     = filteredAvailable.filter(c => !isFollowing(c.client_id));
  const assignedCases    = cases.filter(c => c.case_assignments?.some(a => a.consultant_id === auth.user?.id));
  const myCases          = cases.filter(c => c.client_id === auth.user?.id);
  const managedCases     = cases.filter(c => c.manager_id === auth.user?.id);

  // Stat tiles — each carries its pre-filtered items and type for the list panel
  const statDefs = {
    admin: [
      { id: "total",    label: "Total Cases",  Icon: FolderOpen,    color: "blue",   type: "cases",        items: cases },
      { id: "open",     label: "Open Cases",   Icon: Inbox,         color: "green",  type: "cases",        items: cases.filter(c => c.status === "open") },
      { id: "progress", label: "In Progress",  Icon: Activity,      color: "blue",   type: "cases",        items: cases.filter(c => c.status === "in_progress") },
      { id: "apps",     label: "Applications", Icon: ClipboardList, color: "purple", type: "applications", items: applications },
    ],
    manager: [
      { id: "mycases",  label: "My Cases",       Icon: FolderOpen,    color: "blue",   type: "cases",        items: managedCases },
      { id: "open",     label: "Open Cases",      Icon: Inbox,         color: "green",  type: "cases",        items: cases.filter(c => c.status === "open") },
      { id: "pending",  label: "Pending Reviews", Icon: Clock,         color: "yellow", type: "applications", items: applications.filter(a => a.status === "pending") },
    ],
    consultant: [
      { id: "myapps",   label: "My Applications", Icon: ClipboardList, color: "blue",  type: "applications", items: myApplications },
      { id: "accepted", label: "Accepted",         Icon: CheckCircle2,  color: "green", type: "applications", items: myApplications.filter(a => a.status === "accepted") },
      { id: "open",     label: "Open Cases",       Icon: Inbox,         color: "blue",  type: "cases",        items: availableCases },
    ],
    client: [
      { id: "mycases",   label: "My Cases",  Icon: FolderOpen,   color: "blue",  type: "cases", items: myCases },
      { id: "active",    label: "Active",    Icon: Activity,     color: "blue",  type: "cases", items: myCases.filter(c => c.status === "in_progress") },
      { id: "completed", label: "Completed", Icon: CheckCircle2, color: "green", type: "cases", items: myCases.filter(c => c.status === "completed") },
    ],
  };

  const myStats    = statDefs[auth.role] ?? [];
  const activeStat = myStats.find(s => s.id === activeTab);

  const colorMap = {
    blue:   { icon: "bg-blue-50 text-blue-600", ring: "ring-blue-400 bg-blue-50" },
    green:  { icon: "bg-green-50 text-green-600",   ring: "ring-green-400 bg-green-50" },
    blue:   { icon: "bg-blue-50 text-blue-600",     ring: "ring-blue-400 bg-blue-50" },
    purple: { icon: "bg-sky-50 text-sky-600", ring: "ring-sky-400 bg-sky-50" },
    yellow: { icon: "bg-yellow-50 text-yellow-600", ring: "ring-yellow-400 bg-yellow-50" },
  };

  if (casesLoading) return <Spinner />;

  if (applyingToCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <ApplyWizard
          caseData={applyingToCase}
          auth={auth}
          onComplete={() => setApplying(null)}
          onCancel={() => setApplying(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {auth.profile?.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening on the platform today.</p>
      </div>

      {/* Clickable stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {myStats.map(s => {
          const isActive = activeTab === s.id;
          return (
            <button key={s.id}
              onClick={() => setActiveTab(t => t === s.id ? null : s.id)}
              className={`text-left bg-white rounded-2xl p-6 shadow-sm border transition-all ${
                isActive ? `ring-2 ${colorMap[s.color].ring} border-transparent` : "border-gray-100 hover:shadow-md hover:border-gray-200"
              }`}>
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${colorMap[s.color].icon}`}>
                <s.Icon className="w-5 h-5" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{s.items.length}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              {isActive && <div className="text-xs text-gray-400 mt-1.5 font-medium">▲ showing list</div>}
            </button>
          );
        })}
      </div>

      {/* Filtered list panel — shown when a stat tile is active */}
      {activeStat && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <activeStat.Icon className="w-5 h-5 text-gray-500" />
              <h2 className="text-base font-bold text-gray-900">{activeStat.label}</h2>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">{activeStat.items.length}</span>
            </div>
            <button onClick={() => setActiveTab(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕ Close</button>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {activeStat.items.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Nothing here yet.</div>
            )}

            {/* Case rows */}
            {activeStat.type === "cases" && activeStat.items.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                    {c.title?.[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{c.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      {c.due_date && <span>Due: {fmtDate(c.due_date)}</span>}
                      {c.budget && <span>${Number(c.budget).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <Badge className={PRIORITY_COLORS[c.priority]}>{cap(c.priority)}</Badge>
                  <Badge className={STATUS_COLORS[c.status]}>{cap(fmt(c.status))}</Badge>
                  {activeStat.id === "open" && auth.isConsultant && !appliedCaseIds.has(c.id) && (
                    <button onClick={() => setApplying(c)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
                      Apply →
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Application rows */}
            {activeStat.type === "applications" && activeStat.items.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                    {(a.case?.title ?? a.consultant?.full_name ?? "?")?.[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {a.case?.title ?? "Unknown case"}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      {a.consultant?.full_name && <span>{a.consultant.full_name}</span>}
                      {a.proposed_rate && <span>${a.proposed_rate}/hr</span>}
                      {a.time_commitment && <span>{a.time_commitment}% time</span>}
                      {a.submitted_at && <span>{fmtDate(a.submitted_at)}</span>}
                    </div>
                  </div>
                </div>
                <Badge className={APP_STATUS_COLORS[a.status]}>{cap(a.status)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Default content when no stat tile is active */}
      {!activeTab && (
        <>
          {/* Available Cases — consultants only */}
          {auth.isConsultant && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Available Cases</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Open cases you can apply to</p>
                </div>
                <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-lg">
                  {filteredAvailable.length} open
                </span>
              </div>

              {/* Filters */}
              <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2 bg-gray-50/50">
                <select value={filterSap} onChange={e => setFilterSap(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All SAP Areas</option>
                  {SAP_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterIndustry} onChange={e => setFilterInd(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Industries</option>
                  {INDUSTRY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input type="date" value={filterStartFrom} onChange={e => setStartFrom(e.target.value)}
                  title="Start date from"
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {(filterSap || filterIndustry || filterStartFrom) && (
                  <button onClick={() => { setFilterSap(""); setFilterInd(""); setStartFrom(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2">✕ Clear</button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                {[
                  { id: "all",       label: "All Cases",    count: filteredAvailable.length },
                  { id: "following", label: "⭐ Following",  count: followingCases.length },
                ].map(t => (
                  <button key={t.id} onClick={() => setAvailTab(t.id)}
                    className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                      availTab === t.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}>
                    {t.label}
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t.count}</span>
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="divide-y divide-gray-50">
                {(() => {
                  const list = availTab === "following" ? followingCases : filteredAvailable;
                  if (list.length === 0) {
                    return (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        {availTab === "following"
                          ? "No cases from companies you follow yet. Click ♡ on any case card to follow that company."
                          : "No open cases available right now."}
                      </div>
                    );
                  }
                  return list.map(c => {
                    const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
                    const following   = isFollowing(c.client_id);
                    return (
                      <div key={c.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Title + badges */}
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{c.title}</span>
                              <Badge className={PRIORITY_COLORS[c.priority]}>{cap(c.priority)}</Badge>
                              {c.area_sap      && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{c.area_sap}</span>}
                              {c.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium">{c.area_industry}</span>}
                            </div>
                            {/* Company + follow button */}
                            {companyName && (
                              <div className="flex items-center gap-1 mb-1.5">
                                <span className="text-xs text-gray-500 font-medium">{companyName}</span>
                                <button onClick={e => { e.stopPropagation(); toggleFollow(c.client_id); }}
                                  title={following ? "Unfollow this company" : "Follow this company"}
                                  className={`text-base leading-none transition-colors ${following ? "text-rose-500 hover:text-rose-400" : "text-gray-300 hover:text-rose-400"}`}>
                                  <Heart className={`w-4 h-4 ${following ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                                </button>
                              </div>
                            )}
                            {c.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{c.description}</p>}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                              {c.start_date && <span>Starts: {fmtDate(c.start_date)}</span>}
                              {c.due_date   && <span>Due: {fmtDate(c.due_date)}</span>}
                              {c.budget     && <span>Budget: ${Number(c.budget).toLocaleString()}</span>}
                              {c.skills_required?.length > 0 && (
                                <span>Skills: {c.skills_required.slice(0, 3).join(", ")}{c.skills_required.length > 3 ? "…" : ""}</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => setApplying(c)}
                            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                            Apply →
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Recent / Assigned Cases */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {auth.isConsultant ? "My Assigned Cases" : "Recent Cases"}
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {(auth.isConsultant ? assignedCases : cases.slice(0, 5)).map(c => (
                <div key={c.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm">
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
              {cases.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No cases yet</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// CREATE CASE WIZARD
// ============================================================

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const SLA_PRESETS = [
  { value: "standard", label: "Standard — 30 days", days: 30 },
  { value: "express",  label: "Express — 14 days",  days: 14 },
  { value: "critical", label: "Critical — 7 days",  days: 7 },
  { value: "custom",   label: "Custom date",         days: null },
];

const CREATE_CASE_STEPS = [
  { id: "project",        label: "Project",      Icon: Layers,         desc: "Link to a project" },
  { id: "basics",         label: "Case Info",    Icon: FileText,       desc: "Title & description" },
  { id: "scope",          label: "Scope",        Icon: DollarSign,     desc: "Budget, dates & skills" },
  { id: "arrangement",    label: "Work",         Icon: MapPin,         desc: "Remote, on-site or hybrid" },
  { id: "roles",          label: "Roles",        Icon: UsersRound,     desc: "Key user & head hunters" },
  { id: "qualifications", label: "Requirements", Icon: GraduationCap,  desc: "Certifications & languages" },
  { id: "interview",      label: "Interview",    Icon: MessageSquare,  desc: "Evaluation preferences" },
  { id: "milestones",     label: "Milestones",   Icon: Flag,           desc: "Key deliverables" },
  { id: "review",         label: "Review",       Icon: CheckCircle2,   desc: "Confirm & create" },
];

const PROJECT_STEPS = [
  { id: "basics",       label: "Basics",       Icon: FileText,          desc: "Name & description" },
  { id: "scope",        label: "Scope",        Icon: DollarSign,        desc: "Budget & timeline" },
  { id: "objectives",   label: "Objectives",   Icon: Target,            desc: "Goals & deliverables" },
  { id: "team",         label: "Team",         Icon: Users,             desc: "Contacts & headcount" },
  { id: "requirements", label: "Requirements", Icon: SlidersHorizontal, desc: "Skills & preferences" },
  { id: "review",       label: "Review",       Icon: CheckCircle2,      desc: "Confirm & create" },
];

const EXPRESS_STEP_IDS = [0, 1, 2, 4, 8];
const EXPRESS_CASE_STEPS = CREATE_CASE_STEPS.filter((_, i) => EXPRESS_STEP_IDS.includes(i));

function CreateCaseWizard({ auth, createCase, onComplete, onSave, onCancel, initialData = null, initialProjectId = null }) {
  const isEdit = !!initialData;
  const [mode, setMode]     = useState(isEdit ? "advanced" : null);
  const [step, setSt]       = useState(initialProjectId ? 1 : 0);
  const [creating, setCreating] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [wizardProjects, setWizardProjects]         = useState([]);

  const [basics, setBasics] = useState({ title: initialData?.title ?? "", description: initialData?.description ?? "", priority: initialData?.priority ?? "medium", area_sap: initialData?.area_sap ?? "", area_industry: initialData?.area_industry ?? "", is_confidential: initialData?.is_confidential ?? false, nda_required: initialData?.nda_required ?? false });
  const [scope, setScope]   = useState({ budget: initialData?.budget ?? "", start_date: initialData?.start_date ?? "", due_date: initialData?.due_date ?? daysFromNow(30), sla: "standard", _skills: (initialData?.skills_required ?? []).join(", "), client_id: auth.isClient ? auth.user?.id : (initialData?.client_id ?? "") });

  // Step 3: Work Arrangement
  const [arrangement, setArr] = useState({ work_mode: initialData?.work_mode ?? "remote", work_location: initialData?.work_location ?? "", travel_required: initialData?.travel_required ?? false });

  // Step 4: Roles & People
  const [roles, setRoles] = useState({ key_user_email: initialData?.key_user_email ?? "", is_head_hunter: initialData?.is_head_hunter ?? false, head_hunter_name: initialData?.head_hunter_name ?? "" });
  const [keyUsers, setKeyUsers]     = useState([]);   // { user_id, full_name, email, area }
  const [kuSearch, setKuSearch]     = useState("");
  const [kuResults, setKuResults]   = useState([]);
  const [kuSearching, setKuSearching] = useState(false);

  // Step 5: Qualifications
  const [quals, setQuals] = useState({ certifications_required: initialData?.certifications_required ?? [], min_years_experience: initialData?.min_years_experience ?? "", languages_required: initialData?.languages_required ?? [], security_clearance: initialData?.security_clearance ?? false });
  const [certInput, setCertInput] = useState("");
  const [langInput, setLangInput] = useState("");

  // Step 6: Interview
  const [interview, setIntv] = useState({ interview_required: initialData?.interview_required ?? false, interview_format: initialData?.interview_format ?? "video", interview_rounds: initialData?.interview_rounds ?? 1, technical_assessment: initialData?.technical_assessment ?? false });
  const [milestones, setMs] = useState([]);
  const [mlForm, setMlForm] = useState({ title: "", due_date: "", description: "" });
  const [clients, setClients] = useState([]);
  const [startConfirmed, setStartConfirmed] = useState(false);
  const [keyUserClientId, setKeyUserClientId] = useState(null);
  const [canConfirmOnCreate, setCanConfirmOnCreate] = useState(false);

  useEffect(() => {
    if (auth.isAdmin || auth.isManager) {
      supabase.from("users")
        .select("id, full_name, client_profiles(company_name)")
        .eq("role", "client")
        .then(({ data }) => setClients(data ?? []));
    }
  }, []);

  useEffect(() => {
    let q = supabase.from("projects").select("id, name, status, area_sap").eq("status", "active").order("name");
    if (auth.isClient) q = q.eq("client_id", auth.user?.id);
    q.then(({ data }) => setWizardProjects(data ?? []));
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.isKeyUser || !auth.user?.id) return;
    supabase.from("case_key_users").select("case:case_id(client_id)").eq("user_id", auth.user.id).limit(1)
      .then(({ data }) => { if (data?.[0]?.case?.client_id) setKeyUserClientId(data[0].case.client_id); });
  }, [auth.isKeyUser, auth.user?.id]);

  useEffect(() => {
    if (!isEdit || !initialData?.id) return;
    supabase.from("case_key_users")
      .select("user_id, area, users:user_id(full_name, email)")
      .eq("case_id", initialData.id)
      .then(({ data }) => {
        if (data) setKeyUsers(data.map(r => ({
          user_id: r.user_id,
          full_name: r.users?.full_name ?? "",
          email: r.users?.email ?? "",
          area: r.area ?? "",
        })));
      });
  }, [isEdit, initialData?.id]);

  useEffect(() => {
    if (isEdit || !auth.role) return;
    if (auth.isAdmin) { setCanConfirmOnCreate(true); return; }
    supabase.from("lifecycle_templates").select("stages")
      .then(({ data }) => {
        const can = (data ?? []).some(t =>
          t.stages?.some(s =>
            s.key === "confirmed" &&
            (!s.allowed_roles?.length || s.allowed_roles.includes(auth.role))
          )
        );
        setCanConfirmOnCreate(can);
      });
  }, [auth.role, auth.isAdmin, isEdit]);

  const expressIdx = EXPRESS_STEP_IDS.indexOf(step);
  const isLast = mode === "express"
    ? step === EXPRESS_STEP_IDS[EXPRESS_STEP_IDS.length - 1]
    : step === CREATE_CASE_STEPS.length - 1;

  function nextStep() {
    if (mode === "express") {
      const next = EXPRESS_STEP_IDS[expressIdx + 1];
      if (next !== undefined) setSt(next);
    } else {
      setSt(s => s + 1);
    }
  }
  function prevStep() {
    if (mode === "express") {
      if (expressIdx === 0) { onCancel(); return; }
      setSt(EXPRESS_STEP_IDS[expressIdx - 1]);
    } else {
      if (step === 0) { onCancel(); return; }
      setSt(s => s - 1);
    }
  }

  function applyDefaults(d) {
    if (!d) return;
    setBasics(p => ({
      ...p,
      priority:        d.priority        ?? p.priority,
      area_sap:        d.area_sap        ?? p.area_sap,
      area_industry:   d.area_industry   ?? p.area_industry,
      is_confidential: d.is_confidential ?? p.is_confidential,
      nda_required:    d.nda_required    ?? p.nda_required,
      description:     d.description     ?? p.description,
    }));
    setScope(p => ({
      ...p,
      sla:     d.sla     ?? p.sla,
      budget:  d.budget  ?? p.budget,
      _skills: d.skills  ?? p._skills,
      due_date: d.sla ? daysFromNow(SLA_PRESETS.find(s => s.value === d.sla)?.days ?? 30) : p.due_date,
    }));
    setArr(p => ({
      ...p,
      work_mode:       d.work_mode       ?? p.work_mode,
      travel_required: d.travel_required ?? p.travel_required,
      work_location:   d.work_location   ?? p.work_location,
    }));
    setQuals(p => ({
      ...p,
      min_years_experience: d.min_years_experience  ?? p.min_years_experience,
      languages_required:   d.languages_required    ?? p.languages_required,
      security_clearance:   d.security_clearance    ?? p.security_clearance,
    }));
    setIntv(p => ({
      ...p,
      interview_required:   d.interview_required   ?? p.interview_required,
      interview_format:     d.interview_format     ?? p.interview_format,
      interview_rounds:     d.interview_rounds     ?? p.interview_rounds,
      technical_assessment: d.technical_assessment ?? p.technical_assessment,
    }));
  }

  async function selectMode(m) {
    setMode(m);
    if (m === "express" && auth.isClient && auth.user?.id) {
      const { data } = await supabase.from("client_profiles")
        .select("case_defaults").eq("id", auth.user.id).single();
      applyDefaults(data?.case_defaults);
    }
  }

  async function searchKeyUsers(q) {
    setKuSearch(q);
    if (!q.trim()) { setKuResults([]); return; }
    setKuSearching(true);

    // Determine the client this case belongs to
    const clientId = auth.isClient ? auth.user?.id
      : auth.isKeyUser ? keyUserClientId
      : scope.client_id || null;

    let eligibleIds = null; // null = no restriction (no client selected)

    if (clientId) {
      // Only show key users already linked to one of this client's cases
      const { data: cCases } = await supabase.from("cases").select("id").eq("client_id", clientId);
      const cIds = (cCases ?? []).map(c => c.id);
      if (!cIds.length) {
        setKuResults([]);
        setKuSearching(false);
        return;
      }
      const { data: kuData } = await supabase.from("case_key_users").select("user_id").in("case_id", cIds);
      eligibleIds = [...new Set((kuData ?? []).map(r => r.user_id))];
      if (!eligibleIds.length) {
        setKuResults([]);
        setKuSearching(false);
        return;
      }
    }

    let query = supabase.from("users")
      .select("id, full_name, email")
      .eq("role", "key_user")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);

    if (eligibleIds) query = query.in("id", eligibleIds);

    const { data } = await query;
    setKuResults((data ?? []).filter(u => !keyUsers.some(ku => ku.user_id === u.id)));
    setKuSearching(false);
  }
  function addKeyUser(u) {
    setKeyUsers(p => [...p, { user_id: u.id, full_name: u.full_name, email: u.email, area: "" }]);
    setKuSearch(""); setKuResults([]);
  }
  function removeKeyUser(uid) { setKeyUsers(p => p.filter(ku => ku.user_id !== uid)); }
  function updateKuArea(uid, area) { setKeyUsers(p => p.map(ku => ku.user_id === uid ? { ...ku, area } : ku)); }

  async function handleCreate() {
    setCreating(true);
    try {
      const { _skills, client_id, sla, ...rest } = scope;
      const payload = {
        ...basics,
        status: startConfirmed ? "confirmed" : "open",
        area_sap:      basics.area_sap || null,
        area_industry: basics.area_industry || null,
        is_confidential: basics.is_confidential,
        nda_required: basics.nda_required,
        ...rest,
        start_date: rest.start_date || null,
        due_date: rest.due_date || null,
        budget: scope.budget ? Number(scope.budget) : null,
        skills_required: _skills.split(",").map(s => s.trim()).filter(Boolean),
        client_id:  auth.isClient  ? auth.user?.id : auth.isKeyUser ? keyUserClientId : client_id || null,
        manager_id: auth.isManager ? auth.user?.id : null,
        project_id: selectedProjectId || null,
        ...arrangement,
        ...roles,
        certifications_required: quals.certifications_required.length ? quals.certifications_required : null,
        min_years_experience: quals.min_years_experience ? parseInt(quals.min_years_experience, 10) : null,
        languages_required: quals.languages_required.length ? quals.languages_required : null,
        security_clearance: quals.security_clearance,
        ...interview,
      };
      if (isEdit) {
        await onSave(payload);
        if (initialData?.id) {
          await supabase.from("case_key_users").delete().eq("case_id", initialData.id);
          if (keyUsers.length > 0) {
            await supabase.from("case_key_users").insert(
              keyUsers.map(ku => ({ case_id: initialData.id, user_id: ku.user_id, area: ku.area || null }))
            );
          }
        }
        onComplete();
      } else {
        const newCase = await createCase(payload);
        if (newCase?.id) {
          const kuRows = [...keyUsers];
          if (auth.isKeyUser && !kuRows.some(ku => ku.user_id === auth.user?.id)) {
            kuRows.push({ user_id: auth.user?.id, area: null });
          }
          if (kuRows.length > 0) {
            await supabase.from("case_key_users").insert(
              kuRows.map(ku => ({ case_id: newCase.id, user_id: ku.user_id, area: ku.area || null }))
            ).onConflict("case_id,user_id").ignore();
          }
          if (milestones.length > 0) {
            await supabase.from("case_milestones").insert(
              milestones.map(m => ({ ...m, due_date: m.due_date || null, case_id: newCase.id }))
            );
          }
        }
        onComplete(newCase?.id);
      }
    } catch (e) { alert(e.message); }
    setCreating(false);
  }

  function addMilestone() {
    if (!mlForm.title.trim()) return;
    setMs(p => [...p, mlForm]);
    setMlForm({ title: "", due_date: "", description: "" });
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? "Edit Case" : "New Case"}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {mode === null ? "Choose how to create this case." : mode === "express" ? "Express — fill only the key fields." : "Advanced — full control over every setting."}
          </p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          ✕ Cancel
        </button>
      </div>

      {/* ── Mode selection ── */}
      {mode === null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">How do you want to create this case?</h2>
          <p className="text-sm text-gray-400 text-center mb-8">You can always edit all fields after creation.</p>
          <div className="grid grid-cols-2 gap-5">
            <button onClick={() => selectMode("express")}
              className="group text-left border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mb-4 transition-colors">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">Express</div>
              <div className="text-sm text-gray-500 leading-relaxed">Fill only the key fields. Everything else is pre-filled from your company defaults. <span className="font-medium text-blue-600">3 steps.</span></div>
            </button>
            <button onClick={() => selectMode("advanced")}
              className="group text-left border-2 border-gray-200 hover:border-[#1A4B8C] hover:bg-blue-50/50 rounded-2xl p-6 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-[#1A4B8C]/10 flex items-center justify-center mb-4 transition-colors">
                <Settings className="w-6 h-6 text-gray-600 group-hover:text-[#1A4B8C]" />
              </div>
              <div className="font-bold text-gray-900 text-base mb-1">Advanced</div>
              <div className="text-sm text-gray-500 leading-relaxed">Full control over every field and setting. <span className="font-medium text-gray-700">9 steps.</span></div>
            </button>
          </div>
        </div>
      )}

      {mode !== null && <>
      <OnboardingRoadmap
        steps={mode === "express" ? EXPRESS_CASE_STEPS : CREATE_CASE_STEPS}
        current={mode === "express" ? expressIdx : step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Project ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Select a Project</h2>
            <p className="text-sm text-gray-500 mb-5">Link this case to one of your active projects, or create it as a standalone case.</p>
            {wizardProjects.length === 0 ? (
              <div className="text-sm text-gray-400 italic bg-gray-50 rounded-xl p-4">
                No active projects — this case will be created as standalone.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {wizardProjects.map(p => (
                  <button key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`text-left border-2 rounded-xl p-4 transition-colors ${
                      selectedProjectId === p.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                    }`}>
                    <div className="font-semibold text-gray-900 text-sm">{p.name}</div>
                    {p.area_sap && (
                      <span className="mt-1 inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{p.area_sap}</span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedProjectId(null)}
                  className={`text-left border-2 rounded-xl p-4 transition-colors ${
                    selectedProjectId === null
                      ? "border-gray-400 bg-gray-100"
                      : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}>
                  <div className="font-semibold text-gray-500 text-sm">Standalone (no project)</div>
                  <div className="text-xs text-gray-400 mt-1">Not linked to any project</div>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Case Info ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Case Information</h2>
            <p className="text-sm text-gray-500 mb-5">Describe what this case is about.</p>
            <Input label="Title *" value={basics.title}
              onChange={e => setBasics(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. SAP S/4HANA Migration" />
            {mode === "express" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Priority" value={basics.priority}
                    onChange={e => setBasics(p => ({ ...p, priority: e.target.value }))}
                    options={["low","medium","high","critical"].map(s => ({ value: s, label: cap(s) }))} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SAP Area</label>
                    <select value={basics.area_sap}
                      onChange={e => setBasics(p => ({ ...p, area_sap: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— None / Not applicable —</option>
                      {SAP_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Other fields (description, industry, visibility, interview, qualifications, milestones) will be filled from your <strong>company defaults</strong>. You can edit them in the case after creation.</span>
                </div>
              </>
            ) : (
              <>
                <Textarea label="Description" value={basics.description}
                  onChange={e => setBasics(p => ({ ...p, description: e.target.value }))}
                  placeholder="Describe the requirements, objectives and deliverables…" />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Priority" value={basics.priority}
                    onChange={e => setBasics(p => ({ ...p, priority: e.target.value }))}
                    options={["low","medium","high","critical"].map(s => ({ value: s, label: cap(s) }))} />
                  <div className="flex items-end pb-1">
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-full">
                      Status: <span className="font-semibold text-blue-600">Open</span> (set automatically)
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SAP Area</label>
                    <select value={basics.area_sap}
                      onChange={e => setBasics(p => ({ ...p, area_sap: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— None / Not applicable —</option>
                      {SAP_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <select value={basics.area_industry}
                      onChange={e => setBasics(p => ({ ...p, area_industry: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Select industry —</option>
                      {INDUSTRY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4 mt-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Visibility</p>
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input type="checkbox" checked={basics.is_confidential}
                      onChange={e => setBasics(p => ({ ...p, is_confidential: e.target.checked }))}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700 font-medium">Private case</span>
                    <span className="text-xs text-gray-400">— hidden from public arena; only invited consultants can see it</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={basics.nda_required}
                      onChange={e => setBasics(p => ({ ...p, nda_required: e.target.checked }))}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700 font-medium">NDA required</span>
                    <span className="text-xs text-gray-400">— consultants must sign an NDA before viewing full details</span>
                  </label>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 2: Scope ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Scope & Budget</h2>
            <p className="text-sm text-gray-500 mb-5">
              {mode === "express" ? "Key scope fields — the rest come from your company defaults." : "Set the budget, timeline and required expertise."}
            </p>
            {(auth.isAdmin || auth.isManager) && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select value={scope.client_id}
                  onChange={e => setScope(p => ({ ...p, client_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.client_profiles?.company_name || c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "express" ? (
              <>
                <Input label="Skills Required (comma-separated)" value={scope._skills}
                  onChange={e => setScope(p => ({ ...p, _skills: e.target.value }))}
                  placeholder="SAP S/4HANA, ABAP, Fiori" />
                <div className="mt-2 mb-1">
                  <p className="text-sm font-medium text-gray-700 mb-2">Work Mode</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "remote", label: "Remote",  desc: "Fully remote" },
                      { value: "onsite", label: "On-site", desc: "At client location" },
                      { value: "hybrid", label: "Hybrid",  desc: "Mixed" },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setArr(p => ({ ...p, work_mode: opt.value }))}
                        className={`text-left p-3 border-2 rounded-xl transition-all ${
                          arrangement.work_mode === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {(arrangement.work_mode === "onsite" || arrangement.work_mode === "hybrid") && (
                  <Input label="Location (City, Country)" value={arrangement.work_location}
                    onChange={e => setArr(p => ({ ...p, work_location: e.target.value }))}
                    placeholder="e.g. Toronto, Canada" />
                )}
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Budget, SLA, start date, interview preferences and qualification requirements will be filled from your <strong>company defaults</strong>.</span>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Budget ($)" type="number" value={scope.budget}
                    onChange={e => setScope(p => ({ ...p, budget: e.target.value }))}
                    placeholder="e.g. 50000" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SLA / Timeline</label>
                    <select value={scope.sla}
                      onChange={e => {
                        const preset = SLA_PRESETS.find(p => p.value === e.target.value);
                        setScope(p => ({ ...p, sla: e.target.value, due_date: preset?.days ? daysFromNow(preset.days) : p.due_date }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {SLA_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                {scope.sla === "custom" ? (
                  <Input label="Custom Due Date" type="date" value={scope.due_date}
                    onChange={e => setScope(p => ({ ...p, due_date: e.target.value }))} />
                ) : (
                  <p className="text-xs text-gray-400 -mt-1 mb-2">
                    Calculated due date: <span className="font-semibold text-gray-700">{fmtDate(scope.due_date)}</span>
                  </p>
                )}
                <Input label="Expected Start Date" type="date" value={scope.start_date}
                  onChange={e => setScope(p => ({ ...p, start_date: e.target.value }))} />
                <Input label="Skills Required (comma-separated)" value={scope._skills}
                  onChange={e => setScope(p => ({ ...p, _skills: e.target.value }))}
                  placeholder="SAP S/4HANA, ABAP, Fiori" />
              </>
            )}
          </>
        )}

        {/* ── Step 3: Work Arrangement ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Work Arrangement</h2>
            <p className="text-sm text-gray-500 mb-5">Tell consultants where and how this engagement is delivered.</p>

            {/* Work mode — 3 option cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Work Mode *</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "remote",  label: "Remote",   desc: "Fully remote, any location" },
                  { value: "onsite",  label: "On-site",  desc: "Required at client location" },
                  { value: "hybrid",  label: "Hybrid",   desc: "Mix of remote and on-site" },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setArr(p => ({ ...p, work_mode: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      arrangement.work_mode === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Location — shown for onsite/hybrid */}
            {(arrangement.work_mode === "onsite" || arrangement.work_mode === "hybrid") && (
              <Input label="Location (City, Country)" value={arrangement.work_location}
                onChange={e => setArr(p => ({ ...p, work_location: e.target.value }))}
                placeholder="e.g. Toronto, Canada" />
            )}

            {/* Travel */}
            <label className="flex items-center gap-3 cursor-pointer mt-2">
              <input type="checkbox" checked={arrangement.travel_required}
                onChange={e => setArr(p => ({ ...p, travel_required: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">Travel required</span>
              <span className="text-xs text-gray-400">— consultant may need to travel during the engagement</span>
            </label>
          </>
        )}

        {/* ── Step 4: Roles & People ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Roles &amp; People</h2>
            <p className="text-sm text-gray-500 mb-5">Specify the key contacts and whether this case is managed through a Head Hunter.</p>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Key Users</p>
            <p className="text-xs text-gray-400 mb-3">Internal contacts at the client working directly with consultants. Select registered Key User accounts and assign their area.</p>

            {/* Added key users */}
            {keyUsers.length > 0 && (
              <div className="space-y-2 mb-3">
                {keyUsers.map(ku => (
                  <div key={ku.user_id} className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                    <UserCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{ku.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">{ku.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input value={ku.area} onChange={e => updateKuArea(ku.user_id, e.target.value)}
                        placeholder="Area…"
                        className="text-xs border border-violet-200 rounded-lg px-2 py-1 bg-white w-28 focus:outline-none focus:ring-1 focus:ring-violet-400" />
                      <button type="button" onClick={() => updateKuArea(ku.user_id, "All Areas")}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border transition-colors flex-shrink-0 ${ku.area === "All Areas" ? "bg-violet-600 text-white border-violet-600" : "text-violet-500 border-violet-300 hover:bg-violet-50"}`}>
                        All
                      </button>
                      <button type="button" onClick={() => removeKeyUser(ku.user_id)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none ml-1">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search registered key users */}
            <div className="relative mb-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input value={kuSearch} onChange={e => searchKeyUsers(e.target.value)}
                  placeholder="Search registered Key Users by name or email…"
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none min-w-0" />
                {kuSearching && <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
              </div>
              {kuResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {kuResults.map(u => (
                    <button key={u.id} type="button" onClick={() => addKeyUser(u)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 text-left transition-colors border-b border-gray-50 last:border-0">
                      <UserCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{u.full_name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {kuSearch.trim() && !kuSearching && kuResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 px-4 py-3 text-sm text-gray-400">
                  No Key Users registered for this customer match "{kuSearch}"
                </div>
              )}
            </div>

            {/* Invitation email — pre-registers an email so they can sign up as key_user */}
            <Input label="Invite by Email (optional)" value={roles.key_user_email}
              onChange={e => setRoles(p => ({ ...p, key_user_email: e.target.value }))}
              placeholder="e.g. m.santos@company.com — lets them register as Key User" />

            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Head Hunter</p>
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input type="checkbox" checked={roles.is_head_hunter}
                  onChange={e => setRoles(p => ({ ...p, is_head_hunter: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm text-gray-700 font-medium">This case is managed through a Head Hunter</span>
              </label>
              {roles.is_head_hunter && (
                <Input label="Head Hunter Name / Agency" value={roles.head_hunter_name}
                  onChange={e => setRoles(p => ({ ...p, head_hunter_name: e.target.value }))}
                  placeholder="e.g. TechTalent Agency" />
              )}
            </div>
          </>
        )}

        {/* ── Step 5: Qualifications / Requirements ── */}
        {step === 5 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Requirements</h2>
            <p className="text-sm text-gray-500 mb-5">Define the qualifications, certifications, and experience the consultant must have.</p>

            {/* Min years experience */}
            <Input label="Minimum Years of Experience" type="number" value={quals.min_years_experience}
              onChange={e => setQuals(p => ({ ...p, min_years_experience: e.target.value }))}
              placeholder="e.g. 5" />

            {/* Certifications */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Required Certifications</label>
              <div className="flex gap-2">
                <input value={certInput} onChange={e => setCertInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && certInput.trim()) {
                      e.preventDefault();
                      setQuals(p => ({ ...p, certifications_required: [...p.certifications_required, certInput.trim()] }));
                      setCertInput("");
                    }
                  }}
                  placeholder="e.g. SAP Certified FICO — press Enter to add"
                  className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" />
                <button type="button" onClick={() => {
                  if (certInput.trim()) {
                    setQuals(p => ({ ...p, certifications_required: [...p.certifications_required, certInput.trim()] }));
                    setCertInput("");
                  }
                }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">+ Add</button>
              </div>
              {quals.certifications_required.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {quals.certifications_required.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg">
                      {c}
                      <button type="button" onClick={() => setQuals(p => ({ ...p, certifications_required: p.certifications_required.filter((_, j) => j !== i) }))}
                        className="text-blue-400 hover:text-blue-700 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Languages */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Required Languages</label>
              <div className="flex gap-2">
                <input value={langInput} onChange={e => setLangInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && langInput.trim()) {
                      e.preventDefault();
                      setQuals(p => ({ ...p, languages_required: [...p.languages_required, langInput.trim()] }));
                      setLangInput("");
                    }
                  }}
                  placeholder="e.g. English, French — press Enter to add"
                  className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" />
                <button type="button" onClick={() => {
                  if (langInput.trim()) {
                    setQuals(p => ({ ...p, languages_required: [...p.languages_required, langInput.trim()] }));
                    setLangInput("");
                  }
                }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">+ Add</button>
              </div>
              {quals.languages_required.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {quals.languages_required.map((l, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-lg">
                      {l}
                      <button type="button" onClick={() => setQuals(p => ({ ...p, languages_required: p.languages_required.filter((_, j) => j !== i) }))}
                        className="text-green-400 hover:text-green-700 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Security clearance */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={quals.security_clearance}
                onChange={e => setQuals(p => ({ ...p, security_clearance: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">Security clearance required</span>
            </label>
          </>
        )}

        {/* ── Step 6: Interview Preferences ── */}
        {step === 6 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Interview Preferences</h2>
            <p className="text-sm text-gray-500 mb-5">Define how you&apos;d like to evaluate consultants before selecting one.</p>

            <label className="flex items-center gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={interview.interview_required}
                onChange={e => setIntv(p => ({ ...p, interview_required: e.target.checked }))}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">Interview required before selection</span>
            </label>

            {interview.interview_required && (
              <>
                {/* Format */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">Interview Format</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "phone",     label: "Phone Call",  desc: "Audio call only" },
                      { value: "video",     label: "Video Call",  desc: "Teams, Zoom or similar" },
                      { value: "in_person", label: "In Person",   desc: "Face to face meeting" },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setIntv(p => ({ ...p, interview_format: opt.value }))}
                        className={`text-left p-4 border-2 rounded-xl transition-all ${
                          interview.interview_format === opt.value
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rounds */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">Number of Rounds</p>
                  <div className="flex gap-3">
                    {[1, 2, 3].map(n => (
                      <button key={n} type="button"
                        onClick={() => setIntv(p => ({ ...p, interview_rounds: n }))}
                        className={`w-12 h-12 rounded-xl border-2 font-bold text-sm transition-all ${
                          interview.interview_rounds === n
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Technical assessment */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={interview.technical_assessment}
                    onChange={e => setIntv(p => ({ ...p, technical_assessment: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700 font-medium">Technical assessment required</span>
                  <span className="text-xs text-gray-400">— coding test, case study, or skills evaluation</span>
                </label>
              </>
            )}
          </>
        )}

        {/* ── Step 7: Milestones ── */}
        {step === 7 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Milestones</h2>
            <p className="text-sm text-gray-500 mb-5">Define key deliverables. You can skip and add them later from the case detail.</p>
            {milestones.length > 0 && (
              <div className="space-y-2 mb-5">
                {milestones.map((m, i) => (
                  <div key={i} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{m.title}</div>
                      {m.due_date && <div className="text-xs text-gray-400 mt-0.5">{fmtDate(m.due_date)}</div>}
                      {m.description && <div className="text-xs text-gray-400">{m.description}</div>}
                    </div>
                    <button onClick={() => setMs(p => p.filter((_, j) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-600 ml-4">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className={milestones.length > 0 ? "border-t border-gray-100 pt-5" : ""}>
              {milestones.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Another</p>
              )}
              <Input label="Milestone Title" value={mlForm.title}
                onChange={e => setMlForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Discovery & Requirements" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Due Date" type="date" value={mlForm.due_date}
                  onChange={e => setMlForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <Textarea label="Notes (optional)" value={mlForm.description}
                onChange={e => setMlForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={addMilestone} disabled={!mlForm.title.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                + Add Milestone
              </button>
            </div>
          </>
        )}

        {/* ── Step 8: Review ── */}
        {step === 8 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Review & Create</h2>
            <p className="text-sm text-gray-500 mb-5">Confirm everything looks right.</p>
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Case Info</p>
                <p className="font-semibold text-gray-900 text-base">{basics.title}</p>
                {basics.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{basics.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className={PRIORITY_COLORS[basics.priority]}>{cap(basics.priority)}</Badge>
                  <Badge className={STATUS_COLORS[startConfirmed ? "confirmed" : "open"]}>{startConfirmed ? "Confirmed" : "Open"}</Badge>
                  {basics.area_sap && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{basics.area_sap}</span>}
                  {basics.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs">{basics.area_industry}</span>}
                </div>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Scope</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {scope.start_date && (
                    <div><span className="text-gray-400">Starts:</span> <span className="font-medium ml-1">{fmtDate(scope.start_date)}</span></div>
                  )}
                  {scope.budget && (
                    <div><span className="text-gray-400">Budget:</span> <span className="font-medium ml-1">${Number(scope.budget).toLocaleString()}</span></div>
                  )}
                  {scope.due_date && (
                    <div>
                      <span className="text-gray-400">Due:</span>
                      <span className="font-medium ml-1">{fmtDate(scope.due_date)}</span>
                      {scope.sla !== "custom" && (
                        <span className="ml-1 text-xs text-blue-500">({SLA_PRESETS.find(p => p.value === scope.sla)?.label})</span>
                      )}
                    </div>
                  )}
                </div>
                {scope._skills && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {scope._skills.split(",").map(s => s.trim()).filter(Boolean).map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{s}</span>
                    ))}
                  </div>
                )}
                {!scope.budget && !scope.due_date && !scope._skills && (
                  <p className="text-sm text-gray-400 italic">No scope details added.</p>
                )}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Milestones {milestones.length > 0 ? `(${milestones.length})` : ""}
                </p>
                {milestones.length === 0
                  ? <p className="text-sm text-gray-400 italic">No milestones — can be added after creation.</p>
                  : <ul className="space-y-1.5">
                      {milestones.map((m, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />
                          <span className="font-medium">{m.title}</span>
                          {m.due_date && <span className="text-gray-400 text-xs">— {fmtDate(m.due_date)}</span>}
                        </li>
                      ))}
                    </ul>}
              </div>

              {/* Work & Requirements summary */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Work &amp; Requirements</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div><span className="text-gray-400">Work mode:</span> <span className="font-medium ml-1 capitalize">{arrangement.work_mode}</span></div>
                  {arrangement.work_location && <div><span className="text-gray-400">Location:</span> <span className="font-medium ml-1">{arrangement.work_location}</span></div>}
                  {arrangement.travel_required && <div className="col-span-2 text-xs text-amber-600 font-semibold">Travel required</div>}
                  {quals.min_years_experience && <div><span className="text-gray-400">Min exp:</span> <span className="font-medium ml-1">{quals.min_years_experience} yrs</span></div>}
                  {quals.security_clearance && <div className="col-span-2 text-xs text-red-600 font-semibold">Security clearance required</div>}
                </div>
                {quals.certifications_required.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {quals.certifications_required.map((c, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{c}</span>)}
                  </div>
                )}
                {quals.languages_required.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {quals.languages_required.map((l, i) => <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs">{l}</span>)}
                  </div>
                )}
              </div>

              {/* Interview summary */}
              {interview.interview_required && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Interview</p>
                  <div className="text-sm flex flex-wrap gap-3">
                    <span className="capitalize">{interview.interview_format?.replace("_", " ")}</span>
                    <span>· {interview.interview_rounds} round{interview.interview_rounds > 1 ? "s" : ""}</span>
                    {interview.technical_assessment && <span>· Technical assessment</span>}
                  </div>
                </div>
              )}

            </div>
            {/* Create as Confirmed — shown to any role with confirmed-stage permission */}
            {canConfirmOnCreate && !isEdit && (
              <label className="flex items-center gap-3 cursor-pointer p-4 border-2 border-blue-100 bg-blue-50 rounded-xl mt-4">
                <input type="checkbox" checked={startConfirmed} onChange={e => setStartConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <div>
                  <span className="text-sm font-semibold text-blue-800">Create as Confirmed</span>
                  <p className="text-xs text-blue-600 mt-0.5">Skip the New stage — case starts directly in Confirmed status</p>
                </div>
              </label>
            )}
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 flex items-center justify-between mt-4">
        <button onClick={prevStep}
          className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
          {step === 0 ? "✕ Cancel" : "← Back"}
        </button>
        <div className="flex items-center gap-3">
          {step === 7 && mode !== "express" && (
            <button onClick={nextStep} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">
              Skip
            </button>
          )}
          {!isLast ? (
            <button onClick={nextStep}
              disabled={step === 1 && !basics.title.trim()}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
              Continue →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating}
              className={`px-7 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md ${startConfirmed ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}>
              {creating
                ? (isEdit ? "Saving…" : "Creating…")
                : isEdit ? "✓ Save Changes"
                : startConfirmed ? "✓ Create Confirmed"
                : "✓ Create Case"}
            </button>
          )}
        </div>
      </div>
      </>}
    </div>
  );
}

// ============================================================
// APPLY WIZARD
// ============================================================

const APPLY_STEPS = [
  { id: "brief",  label: "Case Brief",  Icon: FileText,  desc: "What you're applying for" },
  { id: "pitch",  label: "Your Pitch",  Icon: PenLine,   desc: "Why you're the right fit" },
  { id: "terms",  label: "Terms",       Icon: Briefcase, desc: "Rate & availability" },
  { id: "review", label: "Review",      Icon: CheckCircle2, desc: "Confirm & submit" },
];

function ApplyWizard({ caseData, auth, onComplete, onCancel }) {
  const [step, setSt]           = useState(0);
  const [submitting, setSubmit] = useState(false);
  const [pitch, setPitch]       = useState({ cover_letter: "" });
  const [terms, setTerms]       = useState({ proposed_rate: "", time_commitment: 20 });

  const isLast = step === APPLY_STEPS.length - 1;

  async function handleSubmit() {
    setSubmit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("applications").insert({
        case_id: caseData.id,
        consultant_id: user.id,
        cover_letter: pitch.cover_letter || null,
        proposed_rate: terms.proposed_rate ? Number(terms.proposed_rate) : null,
        time_commitment: Number(terms.time_commitment),
      });
      if (error) throw error;
      onComplete();
    } catch (e) { alert(e.message); }
    setSubmit(false);
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apply to Case</h1>
          <p className="text-gray-500 text-sm mt-0.5 truncate max-w-sm">{caseData.title}</p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          ✕ Cancel
        </button>
      </div>

      <OnboardingRoadmap steps={APPLY_STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">

        {/* Step 0 — Case Brief */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Case Brief</h2>
            <p className="text-sm text-gray-500 mb-5">Review the case details before you apply.</p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-gray-900 text-base">{caseData.title}</span>
                  <Badge className={PRIORITY_COLORS[caseData.priority]}>{cap(caseData.priority)}</Badge>
                </div>
                {caseData.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{caseData.description}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {caseData.budget && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">Budget</div>
                    <div className="font-semibold text-gray-800">${Number(caseData.budget).toLocaleString()}</div>
                  </div>
                )}
                {caseData.due_date && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">Due Date</div>
                    <div className="font-semibold text-gray-800">{fmtDate(caseData.due_date)}</div>
                  </div>
                )}
                {caseData.client?.client_profiles?.company_name && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-0.5">Client</div>
                    <div className="font-semibold text-gray-800">{caseData.client.client_profiles.company_name}</div>
                  </div>
                )}
              </div>
              {caseData.skills_required?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Skills Required</div>
                  <div className="flex flex-wrap gap-2">
                    {caseData.skills_required.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 1 — Your Pitch */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Your Pitch</h2>
            <p className="text-sm text-gray-500 mb-5">Tell the client why you're the right consultant for this case.</p>
            <Textarea label="Cover Letter" value={pitch.cover_letter}
              onChange={e => setPitch(p => ({ ...p, cover_letter: e.target.value }))}
              placeholder={`Hi, I'm interested in "${caseData.title}".\n\nI have experience with ${(caseData.skills_required ?? []).slice(0, 2).join(" and ") || "the required technologies"} and believe I can deliver strong results because…`} />
            <p className="text-xs text-gray-400 mt-1">Tip: mention specific past projects, technologies you've mastered, and your approach to this type of work.</p>
          </>
        )}

        {/* Step 2 — Terms */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Your Terms</h2>
            <p className="text-sm text-gray-500 mb-5">Set your proposed rate and how much of your time you'd dedicate to this case.</p>
            <Input label="Proposed Rate ($/hr)" type="number" value={terms.proposed_rate}
              onChange={e => setTerms(p => ({ ...p, proposed_rate: e.target.value }))}
              placeholder="e.g. 150" />
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Time Commitment — <span className="text-blue-600 font-bold">{terms.time_commitment}%</span> of your available time
              </label>
              <input type="range" min="10" max="100" step="10"
                value={terms.time_commitment}
                onChange={e => setTerms(p => ({ ...p, time_commitment: Number(e.target.value) }))}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>10%</span><span>50%</span><span>100%</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {terms.time_commitment <= 25 && "Part-time — a few hours per week alongside other engagements."}
                {terms.time_commitment > 25 && terms.time_commitment <= 60 && "Half-time — significant focus on this case with room for others."}
                {terms.time_commitment > 60 && terms.time_commitment < 100 && "Mostly dedicated — this case would be your primary engagement."}
                {terms.time_commitment === 100 && "Full-time — this would be your sole engagement during the case."}
              </p>
            </div>
          </>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Review & Submit</h2>
            <p className="text-sm text-gray-500 mb-5">Confirm your application before sending it.</p>
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Applying To</p>
                <p className="font-semibold text-gray-900">{caseData.title}</p>
                {caseData.client?.client_profiles?.company_name && (
                  <p className="text-sm text-gray-500 mt-0.5">{caseData.client.client_profiles.company_name}</p>
                )}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your Pitch</p>
                {pitch.cover_letter
                  ? <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{pitch.cover_letter}</p>
                  : <p className="text-sm text-gray-400 italic">No cover letter — you can add one to strengthen your application.</p>}
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Terms</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Proposed Rate</div>
                    <div className="font-semibold text-gray-900">
                      {terms.proposed_rate ? `$${Number(terms.proposed_rate).toLocaleString()}/hr` : <span className="text-gray-400 italic">Not specified</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Time Commitment</div>
                    <div className="font-semibold text-gray-900">{terms.time_commitment}%</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky nav */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : onCancel()}
          className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
          {step === 0 ? "✕ Cancel" : "← Back"}
        </button>
        {!isLast ? (
          <button onClick={() => setSt(s => s + 1)}
            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-md">
            Continue →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
            {submitting ? "Submitting…" : "✓ Submit Application"}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PROJECTS FEATURE
// ============================================================

const PROJECT_STATUS_COLORS = {
  draft:     "bg-gray-100 text-gray-600",
  active:    "bg-blue-100 text-blue-700",
  on_hold:   "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function CreateProjectWizard({ auth, createProject, onSave, onComplete, onCancel, clients = [], initialData = null }) {
  const isEdit = !!initialData;
  const [step, setSt] = useState(0);
  const [creating, setCreating] = useState(false);

  // Step 0: Basics
  const [basics, setBasics] = useState({ name: initialData?.name ?? "", description: initialData?.description ?? "", status: initialData?.status ?? "draft" });
  // Step 1: Scope
  const [scopeData, setScopeData] = useState({ total_budget: initialData?.total_budget ?? "", start_date: initialData?.start_date ?? "", end_date: initialData?.end_date ?? "", area_sap: initialData?.area_sap ?? "", industry: initialData?.industry ?? "", client_id: auth.isClient ? auth.user?.id : (initialData?.client_id ?? "") });
  // Step 2: Objectives
  const [objectives, setObj] = useState({ objectives: initialData?.objectives ?? "", deliverables: initialData?.deliverables ?? [], success_criteria: initialData?.success_criteria ?? "", out_of_scope: initialData?.out_of_scope ?? "" });
  const [delivInput, setDelivInput] = useState("");
  // Step 3: Team
  const [team, setTeam] = useState({ stakeholder_name: initialData?.stakeholder_name ?? "", stakeholder_email: initialData?.stakeholder_email ?? "", billing_contact_name: initialData?.billing_contact_name ?? "", billing_contact_email: initialData?.billing_contact_email ?? "", expected_consultants: initialData?.expected_consultants ?? "" });
  // Step 4: Requirements
  const [reqs, setReqs] = useState({ skills_required: initialData?.skills_required ?? [], work_mode: initialData?.work_mode ?? "remote", compliance_notes: initialData?.compliance_notes ?? "", priority: initialData?.priority ?? "medium" });
  const [skillInput, setSkillInput] = useState("");

  const isLast = step === PROJECT_STEPS.length - 1;

  async function handleCreate() {
    setCreating(true);
    try {
      const payload = {
        ...basics,
        ...scopeData,
        client_id: auth.isClient ? auth.user?.id : (scopeData.client_id || null),
        total_budget: scopeData.total_budget ? Number(scopeData.total_budget) : null,
        start_date: scopeData.start_date || null,
        end_date: scopeData.end_date || null,
        area_sap: scopeData.area_sap || null,
        industry: scopeData.industry || null,
        objectives: objectives.objectives || null,
        deliverables: objectives.deliverables.length ? objectives.deliverables : null,
        success_criteria: objectives.success_criteria || null,
        out_of_scope: objectives.out_of_scope || null,
        ...team,
        expected_consultants: team.expected_consultants ? parseInt(team.expected_consultants, 10) : null,
        ...reqs,
        skills_required: reqs.skills_required.length ? reqs.skills_required : null,
      };
      if (isEdit) {
        await onSave(payload);
      } else {
        await createProject({ ...payload, created_by: auth.user?.id });
      }
      onComplete();
    } catch (e) { alert(e.message); }
    setCreating(false);
  }

  function addDeliverable() {
    const val = delivInput.trim();
    if (!val) return;
    setObj(p => ({ ...p, deliverables: [...p.deliverables, val] }));
    setDelivInput("");
  }

  function addSkill() {
    const val = skillInput.trim();
    if (!val) return;
    setReqs(p => ({ ...p, skills_required: [...p.skills_required, val] }));
    setSkillInput("");
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? "Edit Project" : "New Project"}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{isEdit ? "Update your project details across each section." : "Walk through each step to set up your project."}</p>
        </div>
        <button onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100">
          ✕ Cancel
        </button>
      </div>

      <OnboardingRoadmap steps={PROJECT_STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Basics ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Project Basics</h2>
            <p className="text-sm text-gray-500 mb-5">Give your project a name and description.</p>
            <Input label="Project Name *" value={basics.name}
              onChange={e => setBasics(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. SAP S/4HANA Transformation" />
            <Textarea label="Description" value={basics.description}
              onChange={e => setBasics(p => ({ ...p, description: e.target.value }))}
              placeholder="Project objectives and scope…" />

            {/* Status cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "draft",  label: "Draft",  desc: "Not yet active" },
                  { value: "active", label: "Active", desc: "In progress now" },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setBasics(p => ({ ...p, status: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      basics.status === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority cards */}
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-700 mb-2">Priority</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "low",      label: "Low",      cls: "border-slate-300 bg-slate-50 text-slate-700",    sel: "border-slate-500 bg-slate-100 text-slate-800" },
                  { value: "medium",   label: "Medium",   cls: "border-yellow-300 bg-yellow-50 text-yellow-700", sel: "border-yellow-500 bg-yellow-100 text-yellow-800" },
                  { value: "high",     label: "High",     cls: "border-orange-300 bg-orange-50 text-orange-700", sel: "border-orange-500 bg-orange-100 text-orange-800" },
                  { value: "critical", label: "Critical", cls: "border-red-300 bg-red-50 text-red-700",          sel: "border-red-500 bg-red-100 text-red-800" },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setReqs(p => ({ ...p, priority: opt.value }))}
                    className={`p-3 border-2 rounded-xl text-xs font-semibold transition-all ${
                      reqs.priority === opt.value ? opt.sel : opt.cls}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: Scope ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Scope &amp; Budget</h2>
            <p className="text-sm text-gray-500 mb-5">Define the budget, timeline, and domain.</p>
            {(auth.isAdmin || auth.isManager) && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select value={scopeData.client_id}
                  onChange={e => setScopeData(p => ({ ...p, client_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.client_profiles?.company_name || c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Input label="Budget ($)" type="number" value={scopeData.total_budget}
              onChange={e => setScopeData(p => ({ ...p, total_budget: e.target.value }))}
              placeholder="e.g. 200000" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" value={scopeData.start_date}
                onChange={e => setScopeData(p => ({ ...p, start_date: e.target.value }))} />
              <Input label="End Date" type="date" value={scopeData.end_date}
                onChange={e => setScopeData(p => ({ ...p, end_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SAP Area</label>
                <select value={scopeData.area_sap}
                  onChange={e => setScopeData(p => ({ ...p, area_sap: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— None —</option>
                  {SAP_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <select value={scopeData.industry}
                  onChange={e => setScopeData(p => ({ ...p, industry: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select industry —</option>
                  {INDUSTRY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Objectives ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Objectives &amp; Deliverables</h2>
            <p className="text-sm text-gray-500 mb-5">Define what this project aims to achieve.</p>
            <Textarea label="Project Objectives" value={objectives.objectives}
              onChange={e => setObj(p => ({ ...p, objectives: e.target.value }))}
              placeholder="What is this project trying to achieve?" />

            {/* Deliverables tag input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Deliverables</label>
              <div className="flex gap-2">
                <input value={delivInput}
                  onChange={e => setDelivInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && delivInput.trim()) {
                      e.preventDefault();
                      addDeliverable();
                    }
                  }}
                  placeholder="e.g. Migration Report — press Enter to add"
                  className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" />
                <button type="button" onClick={addDeliverable}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">+ Add</button>
              </div>
              {objectives.deliverables.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {objectives.deliverables.map((d, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg">
                      {d}
                      <button type="button"
                        onClick={() => setObj(p => ({ ...p, deliverables: p.deliverables.filter((_, j) => j !== i) }))}
                        className="text-blue-400 hover:text-blue-700 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Textarea label="Success Criteria" value={objectives.success_criteria}
              onChange={e => setObj(p => ({ ...p, success_criteria: e.target.value }))}
              placeholder="How will you measure success?" />
            <Textarea label="Out of Scope (optional)" value={objectives.out_of_scope}
              onChange={e => setObj(p => ({ ...p, out_of_scope: e.target.value }))}
              placeholder="What is explicitly excluded from this project?" />
          </>
        )}

        {/* ── Step 3: Team ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Team &amp; Contacts</h2>
            <p className="text-sm text-gray-500 mb-5">Identify key stakeholders and billing contacts.</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stakeholder</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Input label="Stakeholder Name" value={team.stakeholder_name}
                onChange={e => setTeam(p => ({ ...p, stakeholder_name: e.target.value }))}
                placeholder="e.g. Anna Müller" />
              <Input label="Stakeholder Email" value={team.stakeholder_email}
                onChange={e => setTeam(p => ({ ...p, stakeholder_email: e.target.value }))}
                placeholder="e.g. a.muller@company.com" />
            </div>
            <div className="border-t border-gray-100 pt-5 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Billing Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Billing Contact Name" value={team.billing_contact_name}
                  onChange={e => setTeam(p => ({ ...p, billing_contact_name: e.target.value }))}
                  placeholder="e.g. Carlos Reyes" />
                <Input label="Billing Contact Email" value={team.billing_contact_email}
                  onChange={e => setTeam(p => ({ ...p, billing_contact_email: e.target.value }))}
                  placeholder="e.g. c.reyes@company.com" />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-5">
              <Input label="Expected Number of Consultants (optional)" type="number" value={team.expected_consultants}
                onChange={e => setTeam(p => ({ ...p, expected_consultants: e.target.value }))}
                placeholder="e.g. 3" />
            </div>
          </>
        )}

        {/* ── Step 4: Requirements ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Requirements</h2>
            <p className="text-sm text-gray-500 mb-5">Specify skills, work mode, and compliance notes.</p>

            {/* Skills tag input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Skills Required</label>
              <div className="flex gap-2">
                <input value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && skillInput.trim()) {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="e.g. SAP S/4HANA — press Enter to add"
                  className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" />
                <button type="button" onClick={addSkill}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">+ Add</button>
              </div>
              {reqs.skills_required.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {reqs.skills_required.map((s, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg">
                      {s}
                      <button type="button"
                        onClick={() => setReqs(p => ({ ...p, skills_required: p.skills_required.filter((_, j) => j !== i) }))}
                        className="text-gray-400 hover:text-gray-700 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Work Mode cards */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Work Mode</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "remote",  label: "Remote",   desc: "Fully remote" },
                  { value: "onsite",  label: "On-site",  desc: "At client location" },
                  { value: "hybrid",  label: "Hybrid",   desc: "Mix of both" },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setReqs(p => ({ ...p, work_mode: opt.value }))}
                    className={`text-left p-4 border-2 rounded-xl transition-all ${
                      reqs.work_mode === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Textarea label="Compliance / Regulatory Notes (optional)" value={reqs.compliance_notes}
              onChange={e => setReqs(p => ({ ...p, compliance_notes: e.target.value }))}
              placeholder="GDPR, ISO, NDA requirements, etc." />
          </>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Review &amp; Create</h2>
            <p className="text-sm text-gray-500 mb-5">Confirm everything looks right before creating.</p>
            <div className="space-y-4">
              {/* Basics card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Basics</p>
                <p className="font-semibold text-gray-900 text-base">{basics.name || <span className="italic text-gray-400">Untitled</span>}</p>
                {basics.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{basics.description}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className={PRIORITY_COLORS[reqs.priority]}>{cap(reqs.priority)}</Badge>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[basics.status] ?? "bg-gray-100 text-gray-600"}`}>{cap(basics.status)}</span>
                </div>
              </div>

              {/* Scope card */}
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Scope</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  {scopeData.total_budget && (
                    <div><span className="text-gray-400">Budget:</span> <span className="font-medium ml-1">${Number(scopeData.total_budget).toLocaleString()}</span></div>
                  )}
                  {scopeData.start_date && (
                    <div><span className="text-gray-400">Start:</span> <span className="font-medium ml-1">{fmtDate(scopeData.start_date)}</span></div>
                  )}
                  {scopeData.end_date && (
                    <div><span className="text-gray-400">End:</span> <span className="font-medium ml-1">{fmtDate(scopeData.end_date)}</span></div>
                  )}
                  {scopeData.area_sap && (
                    <div><span className="text-gray-400">SAP Area:</span> <span className="font-medium ml-1">{scopeData.area_sap}</span></div>
                  )}
                  {scopeData.industry && (
                    <div><span className="text-gray-400">Industry:</span> <span className="font-medium ml-1">{scopeData.industry}</span></div>
                  )}
                </div>
                {!scopeData.total_budget && !scopeData.start_date && !scopeData.end_date && (
                  <p className="text-sm text-gray-400 italic">No scope details added.</p>
                )}
              </div>

              {/* Objectives card — only if any filled */}
              {(objectives.objectives || objectives.deliverables.length > 0 || objectives.success_criteria) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Objectives</p>
                  {objectives.objectives && <p className="text-sm text-gray-700 mb-3 leading-relaxed">{objectives.objectives}</p>}
                  {objectives.deliverables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {objectives.deliverables.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{d}</span>
                      ))}
                    </div>
                  )}
                  {objectives.success_criteria && <p className="text-xs text-gray-500 mt-1">{objectives.success_criteria}</p>}
                </div>
              )}

              {/* Team card — only if any filled */}
              {(team.stakeholder_name || team.billing_contact_name || team.expected_consultants) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Team</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {team.stakeholder_name && (
                      <div><span className="text-gray-400">Stakeholder:</span> <span className="font-medium ml-1">{team.stakeholder_name}</span></div>
                    )}
                    {team.stakeholder_email && (
                      <div><span className="text-gray-400">Email:</span> <span className="font-medium ml-1">{team.stakeholder_email}</span></div>
                    )}
                    {team.billing_contact_name && (
                      <div><span className="text-gray-400">Billing:</span> <span className="font-medium ml-1">{team.billing_contact_name}</span></div>
                    )}
                    {team.expected_consultants && (
                      <div><span className="text-gray-400">Consultants:</span> <span className="font-medium ml-1">{team.expected_consultants}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Requirements card — only if any skills */}
              {(reqs.skills_required.length > 0 || reqs.compliance_notes) && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Requirements</p>
                  <div className="text-sm mb-2">
                    <span className="text-gray-400">Work mode:</span> <span className="font-medium ml-1 capitalize">{reqs.work_mode}</span>
                  </div>
                  {reqs.skills_required.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {reqs.skills_required.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{s}</span>
                      ))}
                    </div>
                  )}
                  {reqs.compliance_notes && <p className="text-xs text-gray-500">{reqs.compliance_notes}</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 shadow-xl rounded-2xl px-6 py-4 flex items-center justify-between mt-4">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : onCancel()}
          className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium">
          {step === 0 ? "✕ Cancel" : "← Back"}
        </button>
        <div className="flex items-center gap-3">
          {(step === 2 || step === 3) && (
            <button onClick={() => setSt(s => s + 1)}
              className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">
              Skip
            </button>
          )}
          {!isLast ? (
            <button onClick={() => setSt(s => s + 1)}
              disabled={step === 0 && !basics.name.trim()}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
              Continue →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-colors shadow-md">
              {creating ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "✓ Save Changes" : "✓ Create Project")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ project, auth, onBack, onUpdate, onClose, clients = [] }) {
  const { createCase } = useCases({});
  const [projCases, setProjCases] = useState([]);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [showEditWizard, setShowEditWizard] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [unassignedCases, setUnassignedCases] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [projLcMode, setProjLcMode] = useState(project.case_lifecycle?.preset ?? "standard");
  const [savingProjLc, setSavingProjLc] = useState(false);
  const [clientLcConfig, setClientLcConfig] = useState(null);
  const { templates: lcTemplates2, getTemplateStages: getProjTmplStages } = useLifecycleTemplates();

  useEffect(() => {
    if (!project?.id) return;
    supabase.from("cases")
      .select("*, case_assignments(consultant_id, users(full_name))")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setProjCases(data ?? []));
  }, [project?.id]);

  useEffect(() => {
    if (!project?.client_id) return;
    supabase.from("client_profiles")
      .select("case_lifecycle")
      .eq("id", project.client_id)
      .single()
      .then(({ data }) => setClientLcConfig(data?.case_lifecycle ?? null));
  }, [project?.client_id]);

  async function handleStatusChange(newStatus) {
    const terminal = ["completed", "cancelled"];
    if (terminal.includes(newStatus)) {
      const openCount = project.cases?.filter(c => !terminal.includes(c.status)).length ?? 0;
      if (openCount > 0) {
        const verb = newStatus === "completed" ? "complete" : "cancel";
        const ok = window.confirm(
          `This will also ${verb} ${openCount} case(s) linked to this project. Continue?`
        );
        if (!ok) return;
      }
      await onClose(project.id, newStatus);
    } else {
      await onUpdate(project.id, { status: newStatus });
    }
  }

  async function handleAssignCase(caseId) {
    await supabase.from("cases").update({ project_id: project.id }).eq("id", caseId);
    const { data } = await supabase.from("cases")
      .select("*, case_assignments(consultant_id, users(full_name))")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    setProjCases(data ?? []);
    setShowAssign(false);
  }

  async function handleRemoveCase(caseId) {
    await supabase.from("cases").update({ project_id: null }).eq("id", caseId);
    setProjCases(prev => prev.filter(c => c.id !== caseId));
  }

  async function openAssignModal() {
    let q = supabase.from("cases").select("id, title, status")
      .is("project_id", null)
      .order("created_at", { ascending: false });
    if (project.client_id) q = q.eq("client_id", project.client_id);
    const { data } = await q;
    setUnassignedCases(data ?? []);
    setShowAssign(true);
  }

  const canEdit = auth.isAdmin || auth.isManager || auth.isClient || auth.isKeyUser;

  async function handleSaveProjLc() {
    setSavingProjLc(true);
    try {
      await onUpdate(project.id, { case_lifecycle: { preset: projLcMode } });
    } catch (e) { alert(e.message); }
    setSavingProjLc(false);
  }

  const projectTabs = [
    { id: "overview",     label: "Overview",      icon: BarChart2,         count: null },
    { id: "objectives",   label: "Objectives",    icon: Target,            count: null },
    { id: "team",         label: "Team",          icon: Users,             count: null },
    { id: "requirements", label: "Requirements",  icon: SlidersHorizontal, count: null },
    { id: "cases",        label: "Cases",         icon: FolderOpen,        count: projCases.length },
    ...(canEdit ? [{ id: "lifecycle", label: "Lifecycle", icon: TrendingUp, count: null }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          ← Projects
        </button>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
              {cap(fmt(project.status))}
            </span>
            {canEdit && (
              <select
                value={project.status}
                onChange={e => handleStatusChange(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {["draft","active","on_hold","completed","cancelled"].map(s => (
                  <option key={s} value={s}>{cap(fmt(s))}</option>
                ))}
              </select>
            )}
            {canEdit && (
              <button onClick={() => setShowEditWizard(true)}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5">
                Edit
              </button>
            )}
          </div>
        </div>
        {(auth.isAdmin || auth.isManager) && project.client?.client_profiles?.company_name && (
          <p className="text-sm text-gray-500 mb-2">
            Client: <span className="font-medium text-gray-700">{project.client.client_profiles.company_name}</span>
          </p>
        )}
        {project.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{project.description}</p>
        )}
      </div>

      {/* Icon Tiles */}
      <div className="flex flex-wrap gap-2">
        {projectTabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all min-w-[80px] ${
                isActive
                  ? "bg-[#1A4B8C] border-[#1A4B8C] text-white shadow-md"
                  : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isActive ? "bg-white/20" : "bg-gray-100"}`}>
                <Icon size={14} className={isActive ? "text-white" : "text-gray-500"} />
              </div>
              <span className="text-xs font-medium">{t.label}</span>
              {t.count !== null && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            {project.priority && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Priority</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PRIORITY_COLORS[project.priority] ?? "bg-gray-100 text-gray-600"}`}>{cap(project.priority)}</span>
              </div>
            )}
            {project.work_mode && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Work Mode</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700">{cap(project.work_mode)}</span>
              </div>
            )}
            {project.expected_consultants && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Consultants needed</span>
                <span className="font-medium text-gray-900">{project.expected_consultants}</span>
              </div>
            )}
            {project.total_budget && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Budget</span>
                <span className="font-medium text-gray-900">${Number(project.total_budget).toLocaleString()}</span>
              </div>
            )}
            {project.start_date && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Start</span>
                <span className="font-medium text-gray-900">{fmtDate(project.start_date)}</span>
              </div>
            )}
            {project.end_date && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">End</span>
                <span className="font-medium text-gray-900">{fmtDate(project.end_date)}</span>
              </div>
            )}
            {project.area_sap && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">SAP Area</span>
                <span className="font-medium text-gray-900">{project.area_sap}</span>
              </div>
            )}
            {project.industry && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Industry</span>
                <span className="font-medium text-gray-900">{project.industry}</span>
              </div>
            )}
            {!project.total_budget && !project.start_date && !project.end_date && !project.area_sap && !project.industry && !project.priority && !project.work_mode && !project.expected_consultants && (
              <p className="text-sm text-gray-400 col-span-3">No overview data yet. Edit the project to add details.</p>
            )}
          </div>
        )}

        {/* Objectives */}
        {activeTab === "objectives" && (
          <div className="space-y-4">
            {project.objectives && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Goals</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.objectives}</p>
              </div>
            )}
            {project.deliverables?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Deliverables</p>
                <div className="flex flex-wrap gap-2">
                  {project.deliverables.map((d, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg">{d}</span>
                  ))}
                </div>
              </div>
            )}
            {project.success_criteria && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Success Criteria</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.success_criteria}</p>
              </div>
            )}
            {project.out_of_scope && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Out of Scope</p>
                <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap italic">{project.out_of_scope}</p>
              </div>
            )}
            {!project.objectives && !project.deliverables?.length && !project.success_criteria && !project.out_of_scope && (
              <p className="text-sm text-gray-400">No objectives defined yet. Edit the project to add them.</p>
            )}
          </div>
        )}

        {/* Team & Contacts */}
        {activeTab === "team" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {(project.stakeholder_name || project.stakeholder_email) && (
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Key Stakeholder</p>
                {project.stakeholder_name && <p className="font-medium text-gray-900">{project.stakeholder_name}</p>}
                {project.stakeholder_email && <p className="text-gray-500 text-xs mt-0.5">{project.stakeholder_email}</p>}
              </div>
            )}
            {(project.billing_contact_name || project.billing_contact_email) && (
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Billing Contact</p>
                {project.billing_contact_name && <p className="font-medium text-gray-900">{project.billing_contact_name}</p>}
                {project.billing_contact_email && <p className="text-gray-500 text-xs mt-0.5">{project.billing_contact_email}</p>}
              </div>
            )}
            {!project.stakeholder_name && !project.stakeholder_email && !project.billing_contact_name && !project.billing_contact_email && (
              <p className="text-sm text-gray-400">No team contacts defined yet. Edit the project to add them.</p>
            )}
          </div>
        )}

        {/* Requirements */}
        {activeTab === "requirements" && (
          <div className="space-y-4">
            {project.skills_required?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Skills Required</p>
                <div className="flex flex-wrap gap-2">
                  {project.skills_required.map((s, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {project.compliance_notes && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Compliance / Regulatory</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.compliance_notes}</p>
              </div>
            )}
            {!project.skills_required?.length && !project.compliance_notes && (
              <p className="text-sm text-gray-400">No requirements defined yet. Edit the project to add them.</p>
            )}
          </div>
        )}

        {/* Cases */}
        {activeTab === "cases" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-900">
                {projCases.length} case{projCases.length !== 1 ? "s" : ""} in this project
              </span>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button onClick={openAssignModal}
                    className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-4 py-2">
                    + Assign existing
                  </button>
                  <button onClick={() => setShowCreateCase(true)}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2">
                    + New Case
                  </button>
                </div>
              )}
            </div>
            {projCases.length === 0 ? (
              <EmptyState Icon={FolderOpen} title="No cases yet" subtitle="Create a new case or assign an existing one using the buttons above." />
            ) : (
              <div className="space-y-2">
                {projCases.map(c => {
                  const consultant = c.case_assignments?.[0]?.users?.full_name;
                  return (
                    <div key={c.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-gray-900 truncate">{c.title}</span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {cap(fmt(c.status))}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${PRIORITY_COLORS[c.priority] ?? ""}`}>
                          {cap(c.priority)}
                        </span>
                        {consultant && (
                          <span className="text-xs text-gray-400 hidden sm:inline">{consultant}</span>
                        )}
                      </div>
                      {canEdit && (
                        <button onClick={() => handleRemoveCase(c.id)}
                          className="text-xs text-red-400 hover:text-red-600 ml-4 flex-shrink-0">
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Lifecycle */}
        {activeTab === "lifecycle" && canEdit && (() => {
          const projOverrideAllowed = clientLcConfig?.allow_project_override ?? true;
          const tmplList = lcTemplates2.length ? lcTemplates2 : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }));
          const previewStages = getProjTmplStages(projLcMode);
          const previewActive = previewStages.filter(s => !s.is_terminal);
          const previewTerminal = previewStages.filter(s => s.is_terminal);
          return (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                <span className="font-semibold text-gray-700">Lifecycle source:</span>
                {project.case_lifecycle
                  ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">This project</span>
                  : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold">Company profile (inherited)</span>}
                {!projOverrideAllowed && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-1">
                    🔒 Override locked by company settings
                  </span>
                )}
              </div>

              {!projOverrideAllowed ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                  The company profile does not allow projects to choose a different lifecycle template. Contact your company admin to enable this.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {tmplList.map(tmpl => {
                      const isSelected = projLcMode === tmpl.key;
                      const active = tmpl.stages.filter(s => !s.is_terminal);
                      return (
                        <button key={tmpl.key} onClick={() => setProjLcMode(tmpl.key)}
                          className={`text-left p-3 rounded-xl border-2 transition-all ${
                            isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-sm text-gray-900">{tmpl.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{tmpl.subtitle}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {active.map((s, i) => (
                              <span key={s.key} className="flex items-center gap-1">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: s.color + "22", color: s.color }}>{s.label}</span>
                                {i < active.length - 1 && <span className="text-gray-300 text-[10px]">›</span>}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Flow Preview</p>
                    <div className="flex items-center flex-wrap gap-2">
                      {previewActive.map((s, i) => (
                        <span key={s.key} className="flex items-center gap-2">
                          <span className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                            style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                          {i < previewActive.length - 1 && <span className="text-gray-300 text-sm">→</span>}
                        </span>
                      ))}
                      {previewTerminal.length > 0 && (
                        <span className="flex items-center gap-2">
                          <span className="text-gray-300 text-sm">→</span>
                          {previewTerminal.map(s => (
                            <span key={s.key} className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                              style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <button onClick={handleSaveProjLc} disabled={savingProjLc}
                      className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                      {savingProjLc ? "Saving…" : "Save Lifecycle"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}

      </div>

      {/* Edit project wizard */}
      {showEditWizard && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateProjectWizard
            auth={auth}
            initialData={project}
            clients={clients}
            onSave={async (payload) => {
              const updated = await onUpdate(project.id, payload);
              return updated;
            }}
            onComplete={() => setShowEditWizard(false)}
            onCancel={() => setShowEditWizard(false)}
          />
        </div>
      )}

      {/* Create case wizard (pre-linked to this project) */}
      {showCreateCase && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateCaseWizard
            auth={auth}
            createCase={createCase}
            initialProjectId={project.id}
            onComplete={async () => {
              setShowCreateCase(false);
              const { data } = await supabase.from("cases")
                .select("*, case_assignments(consultant_id, users(full_name))")
                .eq("project_id", project.id)
                .order("created_at", { ascending: false });
              setProjCases(data ?? []);
            }}
            onCancel={() => setShowCreateCase(false)}
          />
        </div>
      )}

      {/* Assign case modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Assign case to project</h2>
              <button onClick={() => setShowAssign(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-2">
              {unassignedCases.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No unassigned cases available.</p>
              ) : unassignedCases.map(c => (
                <button key={c.id} onClick={() => handleAssignCase(c.id)}
                  className="w-full text-left border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                  <div className="font-medium text-gray-900 text-sm">{c.title}</div>
                  <span className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-lg ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {cap(fmt(c.status))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectsView({ auth }) {
  const clientFilter = auth.isClient ? { client_id: auth.user?.id } : {};
  const { projects, loading, createProject, updateProject, closeProject } = useProjects(clientFilter);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate]     = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [clients, setClients]           = useState([]);

  useEffect(() => {
    if (auth.isAdmin || auth.isManager) {
      supabase.from("users")
        .select("id, full_name, client_profiles(company_name)")
        .eq("role", "client")
        .then(({ data }) => setClients(data ?? []));
    }
  }, []);

  const displayed = statusFilter
    ? projects.filter(p => p.status === statusFilter)
    : projects;

  if (loading) return <Spinner />;

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        auth={auth}
        clients={clients}
        onBack={() => setSelectedProject(null)}
        onUpdate={async (id, updates) => {
          const updated = await updateProject(id, updates);
          setSelectedProject(updated);
          return updated;
        }}
        onClose={async (id, newStatus) => {
          const updated = await closeProject(id, newStatus);
          setSelectedProject(updated);
        }}
      />
    );
  }

  if (showCreate) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <CreateProjectWizard
          auth={auth}
          createProject={createProject}
          clients={clients}
          onComplete={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-1">{displayed.length} project{displayed.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm transition-colors">
            + New Project
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[["", "All"], ["draft", "Draft"], ["active", "Active"], ["on_hold", "On Hold"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(([val, label]) => (
          <button key={val} onClick={() => setStatusFilter(val)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              statusFilter === val
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {displayed.length === 0 ? (
        <EmptyState
          Icon={Layers}
          title="No projects yet"
          subtitle="Group related cases into a project to track them together."
          action={
            (auth.isAdmin || auth.isManager || auth.isClient) && (
              <button onClick={() => setShowCreate(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm mt-2">
                + Create your first project
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map(p => {
            const totalCases     = p.cases?.length ?? 0;
            const openCases      = p.cases?.filter(c => !["completed","cancelled"].includes(c.status)).length ?? 0;
            const completedCases = p.cases?.filter(c => c.status === "completed").length ?? 0;
            const company        = p.client?.client_profiles?.company_name ?? p.client?.full_name;
            return (
              <div key={p.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer p-5"
                onClick={() => setSelectedProject(p)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 truncate">{p.name}</h3>
                  <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-lg ${PROJECT_STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {cap(fmt(p.status))}
                  </span>
                </div>
                {(auth.isAdmin || auth.isManager) && company && (
                  <p className="text-xs text-gray-500 mb-2">{company}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                  <span>Cases: {totalCases} total · {openCases} open · {completedCases} done</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                  <span>Budget: {p.total_budget ? `$${Number(p.total_budget).toLocaleString()}` : "—"}</span>
                  {p.area_sap && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg">{p.area_sap}</span>}
                  {p.industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg">{p.industry}</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {p.start_date || p.end_date
                    ? `${p.start_date ? fmtDate(p.start_date) : "?"} → ${p.end_date ? fmtDate(p.end_date) : "?"}`
                    : "No dates set"}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ============================================================
// CASES VIEW
// ============================================================
function CasesView({ auth }) {
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedCase, setSelected]   = useState(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [filterProjects, setFilterProjects] = useState([]);
  const { isFavorite, toggle }        = useFavorites();

  useEffect(() => {
    let q = supabase.from("projects").select("id, name, status").order("name");
    if (auth.isClient) q = q.eq("client_id", auth.user?.id);
    q.then(({ data }) => setFilterProjects(data ?? []));
  }, [auth.user?.id]);

  const { cases, loading, createCase, updateCase, deleteCase } = useCases({
    status: statusFilter || undefined,
    search: search || undefined,
    client_id: auth.isClient ? auth.user?.id : undefined,
  });

  // Consultants and key users see only their linked cases.
  const visibleCases = auth.isConsultant
    ? cases.filter(c => c.case_assignments?.some(a => a.consultant_id === auth.user?.id))
    : auth.isKeyUser
    ? cases.filter(c => c.case_key_users?.some(ku => ku.user_id === auth.user?.id))
    : cases;
  const projectFiltered = projectFilter
    ? visibleCases.filter(c => c.project_id === projectFilter)
    : visibleCases;
  const displayed = showFavOnly ? projectFiltered.filter(c => isFavorite(c.id)) : projectFiltered;

  async function handleStatusChange(caseId, status, extras = {}) {
    await updateCase(caseId, { status, ...extras });
    if (selectedCase?.id === caseId) setSelected(prev => ({ ...prev, status }));
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
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-500 text-sm mt-1">{displayed.length} case{displayed.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager || auth.isClient || auth.isKeyUser) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            + New Case
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          {["open","in_progress","on_hold","completed","cancelled"].map(s => (
            <option key={s} value={s}>{cap(fmt(s))}</option>
          ))}
        </select>
        {filterProjects.length > 0 && (
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Projects</option>
            {filterProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {auth.isConsultant && (
          <button onClick={() => setShowFavOnly(p => !p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              showFavOnly ? "bg-yellow-50 border-yellow-300 text-yellow-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            <Star className={`w-3.5 h-3.5 ${showFavOnly ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} /> Saved
          </button>
        )}
      </div>

      {/* Cases Grid */}
      {displayed.length === 0 ? (
        <EmptyState Icon={FolderOpen} title="No cases found" subtitle="Adjust your filters or create a new case" />
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
                    <Star className={`w-4 h-4 ${isFavorite(c.id) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function ProjectFieldEditor({ caseData, auth }) {
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
      <span className="text-gray-500 w-24 flex-shrink-0">Project</span>
      {projectName ? (
        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">{projectName}</span>
      ) : (
        <span className="text-gray-400 italic text-xs">Standalone</span>
      )}
      {canEdit && (
        <button onClick={openDropdown} className="text-xs text-gray-400 hover:text-blue-600 underline ml-1">
          change
        </button>
      )}
      {open && (
        <div className="absolute left-24 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-48 max-h-60 overflow-y-auto">
          <button onClick={() => select(null)}
            className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 italic">
            Standalone (no project)
          </button>
          {options.map(o => (
            <button key={o.id} onClick={() => select(o.id)}
              className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700">
              {o.name}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-2 text-xs text-gray-400">No projects available</div>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_ICON_MAP = {
  new: Inbox, open: Inbox, confirmed: CheckCircle2, returned: RotateCcw,
  estimated: BarChart2, assigned: UserCheck, in_progress: Play,
  standby: Pause, on_hold: Pause, functional_test: Target,
  user_test: Users, adjustments: SlidersHorizontal, approved: Star,
  completed: CheckCircle2, terminated: Archive, cancelled: X,
  screening: Search, shortlisted: Star, sourcing: Search,
};
function getStageIcon(key) { return STAGE_ICON_MAP[key] ?? Flag; }

function CaseLifecycleTrack({ stages, currentStatus }) {
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
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">Terminal</span>
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
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Lifecycle Progress</p>
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
                      {isDone ? '✓' : ''}
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
                        Now
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
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">Terminal</span>
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
      .replace(/`(.+?)`/g,'<code style="background:#f3f4f6;padding:0.1em 0.4em;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>');
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
    const hdr = head.map(h=>`<th style="background:#e8f0fb;border:1px solid #c0cde0;padding:6px 10px;text-align:left;font-size:12px;font-weight:600;color:#1a3764">${fmt(h)}</th>`).join('');
    const rows = body.map((row,ri)=>`<tr>${head.map((_,i)=>`<td style="border:1px solid #d1dce8;padding:5px 10px;font-size:12px;background:${ri%2===0?'white':'#f4f7fc'}">${fmt(row[i]||'')}</td>`).join('')}</tr>`).join('');
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

function SpecificationTab({ caseData, auth, documents, addDocument, refetchDocuments }) {
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
  const [sapCheck, setSapCheck]         = useState(null);
  const [proposalCheck, setProposalCheck] = useState(null);
  const [stepLoading, setStepLoading]   = useState(false);
  const [aiSpecA, setAiSpecA]           = useState(''); // custom dev spec
  const [aiSpecB, setAiSpecB]           = useState(''); // standard SAP spec
  const [selectedSpec, setSelectedSpec] = useState(null); // 'a' | 'b'
  const [generatingSpecs, setGeneratingSpecs] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Manual state
  const [manualNotes, setManualNotes]     = useState('');
  const [manualDocIds, setManualDocIds]   = useState([]);
  const [manualSaving, setManualSaving]   = useState(false);

  // Approval
  const [rejectReason, setRejectReason]   = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [approving, setApproving]         = useState(false);
  const [savedSpecUrl, setSavedSpecUrl]   = useState(null);
  const [savingDoc, setSavingDoc]         = useState(false);
  const [specHtml, setSpecHtml]           = useState(null);

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

  function buildSpecHtml(markdown) {
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const bodyHtml = renderMarkdown(markdown);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Functional Specification — ${caseData.title}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;max-width:900px;margin:0 auto;padding:40px}
  .print-bar{position:fixed;top:0;left:0;right:0;background:#1A4B8C;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-size:13px}
  .print-bar button{background:#fff;color:#1A4B8C;border:none;padding:7px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px}
  .print-bar span{opacity:.85}
  .doc-wrap{margin-top:52px}
  .doc-header{background:#1A4B8C;color:#fff;margin:-40px -40px 32px;padding:32px 40px}
  .doc-header h1{margin:0 0 6px;font-size:22px;font-weight:800}
  .doc-header .sub{font-size:13px;opacity:.8}
  .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#f0f4fa;border-left:4px solid #1A4B8C;padding:16px;border-radius:0 6px 6px 0;margin-bottom:32px}
  .meta-item label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:3px}
  .meta-item span{font-size:13px;font-weight:600}
  h1{font-size:18px;font-weight:800;color:#1A4B8C;border-bottom:2px solid #1A4B8C;padding-bottom:6px;margin:28px 0 12px}
  h2{font-size:15px;font-weight:700;color:#1A4B8C;border-bottom:1px solid #d1d5db;padding-bottom:4px;margin:24px 0 10px}
  h3{font-size:13px;font-weight:700;color:#374151;margin:18px 0 8px}
  h4{font-size:12px;font-weight:700;color:#6b7280;margin:14px 0 6px}
  p{margin:8px 0;line-height:1.65}
  ul,ol{margin:8px 0 8px 24px}
  li{margin:4px 0;line-height:1.6}
  code{background:#f3f4f6;padding:2px 5px;border-radius:3px;font-family:Consolas,monospace;font-size:12px}
  hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
  strong{font-weight:700}
  em{font-style:italic}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px}
  th{background:#e8f0fb;border:1px solid #d1d5db;padding:7px 10px;text-align:left;font-weight:700;color:#374151}
  td{border:1px solid #d1d5db;padding:7px 10px}
  .footer{margin-top:48px;border-top:2px solid #e5e7eb;padding-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .sig label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:20px}
  .sig .line{border-top:1px solid #374151;padding-top:4px;font-size:11px;color:#6b7280}
  @media print{.print-bar{display:none!important}.doc-wrap{margin-top:0}body{padding:20px}.doc-header{margin:-20px -20px 24px;padding:24px 20px}}
</style>
</head>
<body>
<div class="print-bar">
  <span>SAP Functional Specification — ${caseData.title}</span>
  <button onclick="window.print()">⬇ Save as PDF</button>
</div>
<div class="doc-wrap">
<div class="doc-header">
  <h1>SAP Functional Specification</h1>
  <div class="sub">${caseData.title}</div>
</div>
<div class="meta-grid">
  <div class="meta-item"><label>Case ID</label><span>#${(caseData.id ?? '').slice(0, 8) || '—'}</span></div>
  <div class="meta-item"><label>SAP Area</label><span>${caseData.area_sap ?? '—'}</span></div>
  <div class="meta-item"><label>Priority</label><span>${caseData.priority ?? '—'}</span></div>
  <div class="meta-item"><label>Generated</label><span>${date}</span></div>
</div>
<p style="margin:0.5rem 0">${bodyHtml}</p>
<div class="footer">
  <div class="sig"><label>Functional Analyst</label><div class="line">Signature / Date</div></div>
  <div class="sig"><label>ABAP Developer</label><div class="line">Signature / Date</div></div>
  <div class="sig"><label>Client Approval</label><div class="line">Signature / Date</div></div>
</div>
</div>
</body>
</html>`;
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

  async function saveSpecAsDocument(markdown) {
    setSavingDoc(true);
    try {
      const safeName = (caseData.title ?? 'Spec').replace(/[^a-z0-9]/gi, '_');
      const fileName = `FuncSpec_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const pdfBlob = await buildSpecPdf(markdown);
      setSpecHtml(pdfBlob);
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await addDocument(file, 'Auto-generated functional specification');
      setSavedSpecUrl(fileName);
      if (refetchDocuments) await refetchDocuments();
    } catch (e) {
      alert('Could not generate PDF: ' + e.message);
    }
    setSavingDoc(false);
  }

  function openSpecInNewTab() {
    if (!specHtml) return;
    const url = URL.createObjectURL(specHtml);
    const win = window.open(url, '_blank');
    if (win) setTimeout(() => URL.revokeObjectURL(url), 60000);
    else { const a = document.createElement('a'); a.href = url; a.download = 'FuncSpec.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }

  const canApprove = auth.isAdmin || auth.isManager || auth.isConsultant;
  const canSubmit  = auth.isClient || auth.isKeyUser || auth.isAdmin || auth.isManager || auth.isConsultant;

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
          if (nd.selectedSpec)  setSelectedSpec(nd.selectedSpec);
        } catch (_) {}
      }
      if (spec.content) restoredStep = 3;
      setAiStep(restoredStep);
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
      const prompt = `Analyze this SAP support case and suggest the ABAP objects likely needed to implement the solution.${docBlocks.length > 0 ? '\n\nThe attached document(s) above contain the detailed requirements — use them as the primary source.' : ''}

Case title: ${caseData.title}
Case description: ${caseData.description ?? '(no description)'}
SAP area: ${caseData.area_sap ?? 'unknown'}
Industry: ${caseData.area_industry ?? 'unknown'}

Respond with ONLY a JSON array like:
[{"type":"Report","name":"ZMM_RPT_EXAMPLE","purpose":"One-line purpose"},...]

Include 2-6 objects. Use realistic Z-names. Types can be: Report, Function Module, Enhancement, BAdI, User Exit, Form, Smartform, Program, Class, Interface, Workflow, Table, View, Transaction — whatever fits.`;
      const raw = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are an SAP functional consultant. Respond with ONLY a JSON array, no markdown code blocks, no explanation.',
        messages: [{
          role: 'user',
          content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt,
        }],
        max_tokens: 800,
      });
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\[[\s\S]*\]/);
        parsed = m ? JSON.parse(m[0]) : [];
      }
      setWizardObjects((parsed ?? []).map(o => ({ ...o, questions: [] })));
    } catch (e) {
      setWizardError(e.message);
    }
    setWizardLoading(false);
  }

  async function generateQuestionsForObject(obj) {
    const raw = await callClaude({
      model: 'claude-haiku-4-5-20251001',
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
      parsed = m ? JSON.parse(m[0]) : [];
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

      const spec = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template provided.',
        messages: [{
          role: 'user',
          content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt,
        }],
        max_tokens: 4000,
      });
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

  // ── AI Generate — two specs ─────────────────────────────────
  function buildSpecPrompt(isCustomDev) {
    const sapCtx = sapCheck ? `\nSAP Standard Coverage Analysis: ${sapCheck.coverage} — ${sapCheck.summary}\nGaps: ${(sapCheck.gaps??[]).join('; ')||'none'}\nStandard transactions: ${(sapCheck.standard_transactions??[]).join(', ')||'none'}` : '';
    const propCtx = proposalCheck ? `\nProposal Validation: score ${proposalCheck.score}/10, risk ${proposalCheck.risk_level}\nStrengths: ${(proposalCheck.strengths??[]).join('; ')||'none'}\nConcerns: ${(proposalCheck.concerns??[]).join('; ')||'none'}` : '';

    if (isCustomDev) {
      return `Write Option A: Custom ABAP Development Functional Specification for this case.${sapCtx}${propCtx}

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}

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

Use realistic Z object names, actual SAP table names for ${caseData.area_sap ?? 'the module'}. Fill in real PARAM/COL values.`;
    } else {
      return `Write Option B: Standard SAP Configuration Functional Specification for this case.${sapCtx}

Case: ${caseData.title}
Description: ${caseData.description ?? '(none)'}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}

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

Use real standard SAP transaction codes and configuration objects for ${caseData.area_sap ?? 'the module'}.`;
    }
  }

  async function handleGenerateSpecs() {
    setGeneratingSpecs(true);
    setAiError(null);
    setAiSpecA('');
    setAiSpecB('');
    setSelectedSpec(null);
    try {
      const docBlocks = await buildDocumentBlocks();
      const msgContent = (prompt) => docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt;
      const [specA, specB] = await Promise.all([
        callClaude({ model: 'claude-haiku-4-5-20251001', system: 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.', messages: [{ role: 'user', content: msgContent(buildSpecPrompt(true)) }], max_tokens: 4000 }),
        callClaude({ model: 'claude-haiku-4-5-20251001', system: 'You are an SAP functional consultant. Write a professional structured functional specification in markdown exactly following the section template.', messages: [{ role: 'user', content: msgContent(buildSpecPrompt(false)) }], max_tokens: 4000 }),
      ]);
      setAiSpecA(specA);
      setAiSpecB(specB);
      setSelectedSpec('a');
      setAiContent(specA);
      try {
        await saveSpec({ mode: 'ai', status: 'draft', content: specA, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA, specB, selectedSpec: 'a' }), title: caseData.title + ' — Functional Spec' });
      } catch (_) {}
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
        notes: specMode === 'manual' ? manualNotes : (specMode === 'ai' ? JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, selectedSpec }) : null),
        document_ids: specMode === 'manual' ? manualDocIds : [],
        title: caseData.title + ' — Functional Spec',
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
      const prompt = `Analyze this SAP case and determine whether STANDARD SAP functionality covers the requirement — without any custom ABAP development.${docBlocks.length > 0 ? '\n\nThe attached documents contain the detailed requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}

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

      const raw = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are an SAP senior consultant. Respond ONLY with a valid JSON object, no markdown.',
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 800,
      });
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { coverage: 'none', summary: raw, standard_transactions: [], gaps: [], recommendation: '' };
      }
      setSapCheck(parsed);
      try { await saveSpec({ mode: 'ai', status: 'draft', content: null, objects: [], notes: JSON.stringify({ sapCheck: parsed }), title: caseData.title + ' — Functional Spec' }); } catch (_) {}
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
      const prompt = `Validate the proposed custom SAP development for this case.${docBlocks.length > 0 ? '\n\nThe attached documents contain the requirements.' : ''}

Case: ${caseData.title}
Description: ${caseData.description ?? ''}
SAP Module: ${caseData.area_sap ?? ''}
Industry: ${caseData.area_industry ?? ''}

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

      const raw = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are an SAP senior consultant. Validate development proposals. Respond ONLY with a valid JSON object, no markdown.',
        messages: [{ role: 'user', content: docBlocks.length > 0 ? [...docBlocks, { type: 'text', text: prompt }] : prompt }],
        max_tokens: 800,
      });
      let parsed;
      try { parsed = JSON.parse(raw.trim()); } catch (_) {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { valid: true, score: 7, risk_level: 'medium', strengths: [], concerns: [], recommendation: raw };
      }
      setProposalCheck(parsed);
      try { await saveSpec({ mode: 'ai', status: 'draft', content: null, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck: parsed }), title: caseData.title + ' — Functional Spec' }); } catch (_) {}
      setAiStep(3);
    } catch (e) { setAiError(e.message); }
    setStepLoading(false);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await saveSpec({ status: 'approved', approved_by: auth.user?.id, approved_at: new Date().toISOString(), rejected_reason: null });
      await refetch();
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
        <span className="ml-3 text-sm">Loading specification…</span>
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
              <p className="font-semibold text-green-800 text-sm">Specification Approved</p>
              {spec.approved_at && <p className="text-xs text-green-600 mt-0.5">Approved on {fmtDate(spec.approved_at)}</p>}
            </div>
          </div>
        )}
        {spec.status === 'submitted' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">Submitted — awaiting approval</p>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-900 text-sm">{spec.title || 'Functional Specification'}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[spec.status]}`}>
              {spec.status.charAt(0).toUpperCase() + spec.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {spec.mode === 'ai' && spec.status === 'approved' && (auth.isAdmin || auth.isManager) && (
              <button onClick={() => { setMode('ai'); setAiContent(spec.content ?? ''); setAiGenerating(false); }}
                className="px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
                Re-generate
              </button>
            )}
            {spec.status === 'submitted' && canApprove && (
              <Fragment>
                <button onClick={handleApprove} disabled={approving}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {approving ? 'Saving…' : 'Approve'}
                </button>
                <button onClick={() => setShowRejectInput(p => !p)}
                  className="px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  Reject
                </button>
              </Fragment>
            )}
          </div>
        </div>

        {showRejectInput && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <label className="block text-xs font-semibold text-red-700">Rejection reason</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="w-full border border-red-200 rounded-lg p-2 text-sm resize-none" rows={3}
              placeholder="Explain why the spec is being rejected…" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRejectInput(false)} className="px-3 py-1.5 text-xs text-gray-500">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || approving}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                Confirm Rejection
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {spec.content && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-800 leading-relaxed overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: '<p style="margin:0.5rem 0">' + renderMarkdown(spec.content) + '</p>' }} />
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
      </div>
    );
  }

  // ── Mode selection ───────────────────────────────────────────
  if (!mode) {
    return (
      <div className="space-y-4">
        {spec && spec.status === 'rejected' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-800">Specification Rejected</p>
            {spec.rejected_reason && <p className="text-xs text-red-600 mt-1">{spec.rejected_reason}</p>}
            <p className="text-xs text-gray-500 mt-2">Choose a mode below to create a new version.</p>
          </div>
        )}
        {spec && spec.status === 'draft' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700">A draft spec exists. Select its mode below to continue editing, or start fresh with another mode.</p>
          </div>
        )}
        <p className="text-sm font-semibold text-gray-700">How would you like to create the functional specification?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: 'manual', Icon: Paperclip, title: 'Manual', desc: 'Attach documents and write the scope manually.' },
            { key: 'wizard', Icon: Wand2,     title: 'Wizard', desc: 'AI-guided interview per ABAP object. Drill down into every field and parameter.' },
            { key: 'ai',     Icon: Sparkles,  title: 'AI Generate', desc: 'Claude reads your case and writes the full functional spec automatically.' },
          ].map(card => (
            <button key={card.key} onClick={() => setMode(card.key)}
              className="text-left p-5 border-2 border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/40 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                <card.Icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="font-bold text-gray-900 text-sm mb-1 group-hover:text-blue-700">{card.title}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
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
          <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          <span className="text-sm font-semibold text-gray-700">Manual Specification</span>
        </div>

        {documents.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attach Documents</p>
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
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scope / Notes</label>
          <textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} rows={8}
            placeholder="Describe the scope, requirements, and any important notes for this functional specification…"
            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-y focus:outline-none focus:border-blue-400" />
        </div>

        <div className="flex items-center gap-3 justify-end pt-2 border-t border-gray-100">
          <button disabled={manualSaving} onClick={async () => {
            setManualSaving(true);
            try {
              await saveSpec({ mode: 'manual', status: 'draft', notes: manualNotes, document_ids: manualDocIds, title: caseData.title + ' — Functional Spec' });
              await refetch();
            } catch (e) { alert(e.message); }
            setManualSaving(false);
          }} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {manualSaving ? 'Saving…' : 'Save Draft'}
          </button>
          {canSubmit && (
            <button disabled={manualSaving} onClick={() => handleSubmit(null, 'manual', [])}
              className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              Submit for Approval
            </button>
          )}
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
            <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
            <span className="text-sm font-semibold text-gray-700">Wizard — Step 1: ABAP Objects</span>
          </div>

          {(documents ?? []).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Documents Claude will read:</p>
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
              No documents attached. Upload files in the <span className="font-semibold">Documents</span> tab to help Claude understand the requirements.
            </div>
          )}

          {wizardObjects.length === 0 && !wizardLoading && (
            <button onClick={suggestObjects}
              className="w-full py-10 border-2 border-dashed border-blue-200 rounded-2xl text-blue-600 hover:bg-blue-50 text-sm font-semibold transition-all">
              Analyze case and suggest ABAP objects →
            </button>
          )}

          {wizardLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Spinner />
              <span className="text-sm">Analyzing your case requirements…</span>
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
                  placeholder="Object name (e.g. ZMM_RPT_001)"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                <input value={addObjType} onChange={e => setAddObjType(e.target.value)}
                  placeholder="Type (e.g. Report)"
                  className="w-36 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                <button onClick={() => {
                  if (!addObjName.trim()) return;
                  setWizardObjects(prev => [...prev, { name: addObjName.trim(), type: addObjType.trim() || 'Object', purpose: '', questions: [] }]);
                  setAddObjName(''); setAddObjType('');
                }} className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 flex-shrink-0">
                  + Add
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button onClick={handleStartInterview} disabled={wizardObjects.length === 0 || wizardLoading}
                  className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                  Start Interview →
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
              <button onClick={() => setWizardStage('objects')} className="text-xs text-gray-400 hover:text-gray-600">← Objects</button>
              <span className="text-sm font-semibold text-gray-700">Interview</span>
            </div>
            <span className="text-xs text-gray-400">Object {currentObjIdx + 1} of {wizardObjects.length}</span>
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
              <span className="text-sm">Generating questions for this {curObj?.type}…</span>
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
                      <option value="">Select an option…</option>
                      {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : q.type === 'multiline' ? (
                    <textarea value={q.a ?? ''} onChange={e => updateAnswer(currentObjIdx, q.id, e.target.value)}
                      rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y focus:outline-none focus:border-blue-400"
                      placeholder="Describe in detail…" />
                  ) : (
                    <input type="text" value={q.a ?? ''} onChange={e => updateAnswer(currentObjIdx, q.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      placeholder="Your answer…" />
                  )}
                </div>
              ))}

              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <button onClick={() => { setCurrentObjIdx(p => Math.max(0, p - 1)); }} disabled={currentObjIdx === 0}
                  className="px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-30">
                  ← Prev
                </button>
                <button onClick={handleNextObject} disabled={!allCurrentAnswered || wizardLoading}
                  className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                  {currentObjIdx === wizardObjects.length - 1 ? 'Compile Specification →' : 'Next Object →'}
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
              <button onClick={() => setWizardStage('interview')} className="text-xs text-gray-400 hover:text-gray-600">← Interview</button>
              <span className="text-sm font-semibold text-gray-700">Compiled Specification</span>
            </div>
            {canSubmit && compiledSpec && (
              <button onClick={() => handleSubmit(compiledSpec, 'wizard', wizardObjects)}
                className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900">
                Submit for Approval
              </button>
            )}
          </div>

          {wizardLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Spinner />
              <span className="text-sm">Compiling specification…</span>
            </div>
          )}

          {wizardError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{wizardError}</div>
          )}

          {!wizardLoading && compiledSpec && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-800 leading-relaxed overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: '<p style="margin:0.5rem 0">' + renderMarkdown(compiledSpec) + '</p>' }} />
          )}

          {!wizardLoading && compiledSpec && (
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
              <button onClick={async () => {
                try {
                  await saveSpec({ mode: 'wizard', status: 'draft', content: compiledSpec, objects: wizardObjects, title: caseData.title + ' — Functional Spec' });
                  await refetch();
                } catch (e) { alert(e.message); }
              }} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">
                Save Draft
              </button>
              {savedSpecUrl ? (
                <button onClick={openSpecInNewTab}
                  className="flex items-center px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700">
                  <Download className="w-4 h-4 mr-1.5" />Open PDF
                </button>
              ) : (
                <button onClick={() => saveSpecAsDocument(compiledSpec)} disabled={savingDoc}
                  className="flex items-center px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50">
                  {savingDoc ? 'Saving…' : <><Paperclip className="w-4 h-4 mr-1.5" />Save to Documents</>}
                </button>

              )}
              {canSubmit && (
                <button onClick={() => handleSubmit(compiledSpec, 'wizard', wizardObjects)}
                  className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900">
                  Submit for Approval
                </button>
              )}
            </div>
          )}
        </div>
      );
    }
  }

  // ── AI Generate mode ─────────────────────────────────────────
  if (mode === 'ai') {
    const STEPS = [
      { n: 1, label: 'SAP Standard Check' },
      { n: 2, label: 'Proposal Validation' },
      { n: 3, label: 'Generate Spec' },
    ];
    const coverageColor = { full: ['bg-green-50','border-green-200','text-green-700','text-green-800'], partial: ['bg-amber-50','border-amber-200','text-amber-700','text-amber-800'], none: ['bg-red-50','border-red-200','text-red-700','text-red-800'] };
    const riskColor = { low: 'text-green-700 bg-green-50', medium: 'text-amber-700 bg-amber-50', high: 'text-red-700 bg-red-50' };
    const cc = coverageColor[sapCheck?.coverage] ?? coverageColor.none;

    return (
      <div className="space-y-5">
        {/* Header + back */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setMode(null); setAiStep(1); setSapCheck(null); setProposalCheck(null); setAiContent(''); }}
            className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          <span className="text-sm font-semibold text-gray-700">AI Generate</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center">
          {STEPS.map((step, idx) => (
            <Fragment key={step.n}>
              <div className="flex flex-col items-center min-w-0">
                <button
                  onClick={() => { if (step.n <= aiStep) setAiStep(step.n); }}
                  disabled={step.n > aiStep}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    aiStep > step.n  ? 'bg-green-500 border-green-500 text-white' :
                    aiStep === step.n ? 'bg-[#1A4B8C] border-[#1A4B8C] text-white' :
                    'bg-white border-gray-300 text-gray-400 cursor-not-allowed'
                  }`}>
                  {aiStep > step.n ? '✓' : step.n}
                </button>
                <span className={`text-xs mt-1 font-medium text-center leading-tight ${
                  aiStep === step.n ? 'text-[#1A4B8C]' : aiStep > step.n ? 'text-green-600' : 'text-gray-400'
                }`}>{step.label}</span>
              </div>
              {idx < 2 && (
                <div className={`flex-1 h-0.5 mx-2 mb-5 rounded ${aiStep > step.n ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </Fragment>
          ))}
        </div>

        {/* Documents panel (always visible) */}
        {(documents ?? []).length > 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">Documents Claude will read:</p>
            <div className="flex flex-col gap-1">
              {documents.map(doc => (
                <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
                  <Paperclip className="w-3 h-3" /><span>{doc.file_name}</span>
                  <span className="text-blue-400">({doc.file_size_kb} KB)</span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            No documents attached. Upload files in the <span className="font-semibold">Documents</span> tab for better results.
          </div>
        )}

        {/* Error */}
        {aiError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{aiError}</div>
        )}

        {/* ── STEP 1: SAP Standard Check ── */}
        {aiStep === 1 && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Step 1 — SAP Standard Coverage Check</h3>
              <p className="text-xs text-gray-500">Claude will analyze whether standard SAP configuration and transactions can cover this requirement before recommending custom development.</p>
            </div>

            {!sapCheck && !stepLoading && (
              <div className="text-center py-4">
                <button onClick={handleSapCheck}
                  className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                  Check SAP Standard Coverage
                </button>
              </div>
            )}

            {stepLoading && (
              <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                <Spinner /><span className="text-sm">Checking SAP standard functionality…</span>
              </div>
            )}

            {sapCheck && !stepLoading && (
              <div className={`border rounded-xl p-4 space-y-3 ${cc[0]} ${cc[1]}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${cc[3]}`}>
                    {sapCheck.coverage === 'full' ? '✓ Fully covered by SAP standard' :
                     sapCheck.coverage === 'partial' ? '⚠ Partially covered — gaps exist' :
                     '✗ Custom ABAP development required'}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cc[1]} ${cc[2]} uppercase`}>{sapCheck.coverage}</span>
                </div>
                <p className={`text-sm ${cc[2]}`}>{sapCheck.summary}</p>

                {(sapCheck.standard_transactions ?? []).length > 0 && (
                  <div>
                    <p className={`text-xs font-semibold mb-1 ${cc[3]}`}>Standard SAP transactions available:</p>
                    <ul className={`text-xs space-y-0.5 ${cc[2]}`}>
                      {sapCheck.standard_transactions.map((t, i) => <li key={i} className="flex gap-1"><span>•</span><span>{t}</span></li>)}
                    </ul>
                  </div>
                )}

                {(sapCheck.gaps ?? []).length > 0 && (
                  <div>
                    <p className={`text-xs font-semibold mb-1 ${cc[3]}`}>Gaps requiring custom development:</p>
                    <ul className={`text-xs space-y-0.5 ${cc[2]}`}>
                      {sapCheck.gaps.map((g, i) => <li key={i} className="flex gap-1"><span>→</span><span>{g}</span></li>)}
                    </ul>
                  </div>
                )}

                {sapCheck.recommendation && (
                  <p className={`text-xs italic border-t pt-2 ${cc[1]} ${cc[2]}`}>{sapCheck.recommendation}</p>
                )}

                <div className="flex gap-3 justify-between items-center pt-1">
                  <button onClick={handleSapCheck} className={`text-xs underline ${cc[2]}`}>Re-run check</button>
                  <button onClick={() => setAiStep(2)}
                    className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                    Continue to Proposal Validation →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Proposal Validation ── */}
        {aiStep === 2 && (
          <div className="space-y-4">
            {/* Step 1 summary badge */}
            {sapCheck && (
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${cc[0]} ${cc[1]} ${cc[2]}`}>
                <span className="font-semibold">Step 1:</span>
                <span>Coverage — <span className="font-bold uppercase">{sapCheck.coverage}</span></span>
                <span className="ml-auto opacity-70">{sapCheck.recommendation}</span>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Step 2 — Proposal Validation</h3>
              <p className="text-xs text-gray-500">Claude will validate whether the custom development proposal is technically justified, correctly scoped, and low-risk before writing the spec.</p>
            </div>

            {!proposalCheck && !stepLoading && (
              <div className="text-center py-4">
                <button onClick={handleProposalValidation}
                  className="px-6 py-2.5 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                  Validate Proposal
                </button>
              </div>
            )}

            {stepLoading && (
              <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
                <Spinner /><span className="text-sm">Validating proposal…</span>
              </div>
            )}

            {proposalCheck && !stepLoading && (
              <div className={`border rounded-xl p-4 space-y-3 ${proposalCheck.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className={`text-sm font-bold ${proposalCheck.valid ? 'text-green-800' : 'text-amber-800'}`}>
                    {proposalCheck.valid ? '✓ Proposal is valid' : '⚠ Proposal has concerns'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${riskColor[proposalCheck.risk_level] ?? riskColor.medium}`}>
                      Risk: {proposalCheck.risk_level ?? 'medium'}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                      Score: {proposalCheck.score}/10
                    </span>
                  </div>
                </div>

                {(proposalCheck.strengths ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1">Strengths:</p>
                    <ul className="text-xs text-green-700 space-y-0.5">
                      {proposalCheck.strengths.map((s, i) => <li key={i} className="flex gap-1"><span>✓</span><span>{s}</span></li>)}
                    </ul>
                  </div>
                )}

                {(proposalCheck.concerns ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">Concerns:</p>
                    <ul className="text-xs text-amber-700 space-y-0.5">
                      {proposalCheck.concerns.map((c, i) => <li key={i} className="flex gap-1"><span>⚠</span><span>{c}</span></li>)}
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
                    className={`text-xs underline ${proposalCheck.valid ? 'text-green-700' : 'text-amber-700'}`}>Re-validate</button>
                  <button onClick={() => setAiStep(3)}
                    className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                    Generate Functional Specification →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Generate & Choose Spec ── */}
        {aiStep === 3 && (
          <div className="space-y-4">

            {/* Analysis results accordion */}
            {(sapCheck || proposalCheck) && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setAnalysisOpen(p => !p)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700">
                  <span>Analysis Results from Steps 1 & 2</span>
                  <span className="text-gray-400 text-xs">{analysisOpen ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {analysisOpen && (
                  <div className="p-4 space-y-4 border-t border-gray-200">

                    {/* Step 1 full result */}
                    {sapCheck && (
                      <div className={`border rounded-xl p-3 space-y-2 ${cc[0]} ${cc[1]}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-500 uppercase">Step 1 — SAP Standard Coverage</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase ${cc[1]} ${cc[2]}`}>{sapCheck.coverage}</span>
                        </div>
                        <p className={`text-xs ${cc[2]}`}>{sapCheck.summary}</p>
                        {(sapCheck.standard_transactions??[]).length > 0 && (
                          <div>
                            <p className={`text-xs font-semibold mb-0.5 ${cc[3]}`}>Standard transactions:</p>
                            <ul className={`text-xs space-y-0.5 ${cc[2]}`}>{sapCheck.standard_transactions.map((t,i)=><li key={i} className="flex gap-1"><span>•</span><span>{t}</span></li>)}</ul>
                          </div>
                        )}
                        {(sapCheck.gaps??[]).length > 0 && (
                          <div>
                            <p className={`text-xs font-semibold mb-0.5 ${cc[3]}`}>Gaps requiring custom dev:</p>
                            <ul className={`text-xs space-y-0.5 ${cc[2]}`}>{sapCheck.gaps.map((g,i)=><li key={i} className="flex gap-1"><span>→</span><span>{g}</span></li>)}</ul>
                          </div>
                        )}
                        {sapCheck.recommendation && <p className={`text-xs italic border-t pt-1 ${cc[1]} ${cc[2]}`}>{sapCheck.recommendation}</p>}
                      </div>
                    )}

                    {/* Step 2 full result */}
                    {proposalCheck && (
                      <div className={`border rounded-xl p-3 space-y-2 ${proposalCheck.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-500 uppercase">Step 2 — Proposal Validation</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${proposalCheck.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                            {proposalCheck.valid ? 'Valid' : 'Concerns'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${riskColor[proposalCheck.risk_level]??riskColor.medium}`}>Risk: {proposalCheck.risk_level}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 font-bold">Score: {proposalCheck.score}/10</span>
                        </div>
                        {(proposalCheck.strengths??[]).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 mb-0.5">Strengths:</p>
                            <ul className="text-xs text-green-700 space-y-0.5">{proposalCheck.strengths.map((s,i)=><li key={i} className="flex gap-1"><span>✓</span><span>{s}</span></li>)}</ul>
                          </div>
                        )}
                        {(proposalCheck.concerns??[]).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-amber-700 mb-0.5">Concerns:</p>
                            <ul className="text-xs text-amber-700 space-y-0.5">{proposalCheck.concerns.map((c,i)=><li key={i} className="flex gap-1"><span>⚠</span><span>{c}</span></li>)}</ul>
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
            {!aiSpecA && !aiSpecB && !generatingSpecs && (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-7 h-7 text-blue-600" />
                </div>
                <p className="text-sm text-gray-600 mb-2">Claude will generate <strong>two specifications</strong> based on the analysis:</p>
                <div className="flex justify-center gap-4 mb-5 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/><strong>Option A</strong> — Custom ABAP development (with pros &amp; cons)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"/><strong>Option B</strong> — Standard SAP configuration</span>
                </div>
                <button onClick={handleGenerateSpecs}
                  className="px-6 py-3 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900">
                  Generate Both Specifications
                </button>
              </div>
            )}

            {generatingSpecs && (
              <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <Spinner /><span className="text-sm">Claude is generating both specifications simultaneously…</span>
              </div>
            )}

            {/* Spec selector tabs */}
            {(aiSpecA || aiSpecB) && !generatingSpecs && (
              <div className="space-y-0">
                {/* Tab bar */}
                <div className="flex border-b border-gray-200">
                  <button onClick={() => { setSelectedSpec('a'); setAiContent(aiSpecA); }}
                    className={`flex-1 py-3 px-4 text-sm font-semibold border-b-2 transition-colors text-left flex items-center gap-2 ${selectedSpec === 'a' ? 'border-[#1A4B8C] text-[#1A4B8C] bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                    <span className="w-5 h-5 rounded-full bg-amber-400 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">A</span>
                    <span>Custom ABAP Development</span>
                    {selectedSpec === 'a' && <span className="ml-auto text-xs font-semibold text-[#1A4B8C] bg-blue-100 px-2 py-0.5 rounded-full">Selected</span>}
                  </button>
                  <button onClick={() => { setSelectedSpec('b'); setAiContent(aiSpecB); }}
                    className={`flex-1 py-3 px-4 text-sm font-semibold border-b-2 transition-colors text-left flex items-center gap-2 ${selectedSpec === 'b' ? 'border-[#1A4B8C] text-[#1A4B8C] bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                    <span className="w-5 h-5 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">B</span>
                    <span>Standard SAP Configuration</span>
                    {selectedSpec === 'b' && <span className="ml-auto text-xs font-semibold text-[#1A4B8C] bg-blue-100 px-2 py-0.5 rounded-full">Selected</span>}
                  </button>
                </div>

                {/* Tab content */}
                <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
                  {/* Edit toggle row */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs text-gray-500">
                      {selectedSpec === 'a' ? 'Option A: Custom ABAP Development Specification' : selectedSpec === 'b' ? 'Option B: Standard SAP Configuration Specification' : 'Select an option above'}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setAiEditing(p => !p)}
                        className="px-2.5 py-1 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-white">
                        {aiEditing ? 'Preview' : 'Edit'}
                      </button>
                      <button onClick={handleGenerateSpecs}
                        className="px-2.5 py-1 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
                        Re-generate both
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 max-h-[600px] overflow-y-auto">
                    {aiEditing ? (
                      <textarea value={selectedSpec === 'b' ? aiSpecB : aiSpecA}
                        onChange={e => { if (selectedSpec === 'b') { setAiSpecB(e.target.value); setAiContent(e.target.value); } else { setAiSpecA(e.target.value); setAiContent(e.target.value); } }}
                        rows={25} className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono resize-y focus:outline-none focus:border-blue-400" />
                    ) : (
                      <div className="text-sm text-gray-800 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: '<div>' + renderMarkdown(selectedSpec === 'b' ? aiSpecB : aiSpecA) + '</div>' }} />
                    )}
                  </div>
                </div>

                {/* Action bar */}
                <div className="flex gap-3 items-center justify-between pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    {selectedSpec ? `Submitting: Option ${selectedSpec.toUpperCase()} — ${selectedSpec === 'a' ? 'Custom ABAP' : 'Standard SAP'}` : 'Click a tab to select which spec to submit'}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      const content = selectedSpec === 'b' ? aiSpecB : aiSpecA;
                      try { await saveSpec({ mode: 'ai', status: 'draft', content, objects: [], notes: JSON.stringify({ sapCheck, proposalCheck, specA: aiSpecA, specB: aiSpecB, selectedSpec }), title: caseData.title + ' — Functional Spec' }); await refetch(); } catch (e) { alert(e.message); }
                    }} disabled={!selectedSpec} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40">
                      Save Draft
                    </button>
                    {savedSpecUrl ? (
                      <button onClick={openSpecInNewTab}
                        className="flex items-center px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700">
                        <Download className="w-4 h-4 mr-1.5" />Open PDF
                      </button>
                    ) : (
                      <button onClick={() => saveSpecAsDocument(selectedSpec === 'b' ? aiSpecB : aiSpecA)} disabled={!selectedSpec || savingDoc}
                        className="flex items-center px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-40">
                        {savingDoc ? 'Saving…' : <><Paperclip className="w-4 h-4 mr-1.5" />Save PDF</>}
                      </button>
                    )}
                    {canSubmit && (
                      <button onClick={() => handleSubmit(selectedSpec === 'b' ? aiSpecB : aiSpecA, 'ai', [])} disabled={!selectedSpec}
                        className="px-4 py-2 text-sm bg-[#1A4B8C] text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-40">
                        Submit for Approval
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function CaseDetail({ caseData, auth, onStatusChange, onDelete, onApply, onUpdate, onBack }) {
  const { applications, apply, reviewApplication } = useApplications(caseData.id);
  const { milestones, toggleMilestone, addMilestone } = useMilestones(caseData.id);
  const { comments, addComment } = useCaseComments(caseData.id);
  const { subCases, createSubCase } = useSubCases(caseData.id);
  const { documents, addDocument, deleteDocument, refetch: refetchDocuments } = useCaseDocuments(caseData.id);
  const { entries: timeEntries, addTimeEntry, approveEntry } = useTimeEntries(caseData.id);

  const [activeTab, setActiveTab]   = useState("detail");
  const [newMilestone, setNewMilestone] = useState("");
  const [commentForm, setCommentForm]  = useState({ body: "", hoursLogged: 0, progressUpdate: "", isInternal: false });
  const [sendingComment, setSendingComment] = useState(false);
  const [progressPct, setProgressPct] = useState(caseData.progress_pct ?? 0);
  const [showSubCaseForm, setShowSubCaseForm] = useState(false);
  const [subCaseForm, setSubCaseForm] = useState({ title: "", description: "", priority: "medium", status: "open" });
  const [savingSubCase, setSavingSubCase] = useState(false);
  const [selectedSubCase, setSelectedSubCase] = useState(null);
  // V9 Document state
  const docFileRef = useRef();
  const [docNotes, setDocNotes]         = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showDocForm, setShowDocForm]   = useState(false);
  const [pendingDocFile, setPendingDocFile] = useState(null);
  // V9 Time entry state
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm]         = useState({ date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true });
  const [savingTime, setSavingTime]     = useState(false);

  const [showEditWizard, setShowEditWizard] = useState(false);
  const [clientLifecycle, setClientLifecycle] = useState(null);
  const [cancelModal, setCancelModal] = useState(null); // { caseId, isSubCase }
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [projectLifecycle, setProjectLifecycle] = useState(null);
  const [lcMode, setLcMode] = useState(caseData.case_lifecycle?.preset ?? "standard");
  const [savingLc, setSavingLc] = useState(false);
  const { templates: caseLcTemplates, getTemplateStages: getCaseTmplStages } = useLifecycleTemplates();

  useEffect(() => {
    if (!caseData.client_id) return;
    supabase.from("client_profiles")
      .select("case_lifecycle")
      .eq("id", caseData.client_id)
      .single()
      .then(({ data }) => setClientLifecycle(data?.case_lifecycle ?? null));
  }, [caseData.client_id]);

  useEffect(() => {
    if (!caseData.project_id) return;
    supabase.from("projects")
      .select("case_lifecycle")
      .eq("id", caseData.project_id)
      .single()
      .then(({ data }) => setProjectLifecycle(data?.case_lifecycle ?? null));
  }, [caseData.project_id]);

  const effectiveLifecycle = caseData.case_lifecycle ?? projectLifecycle ?? clientLifecycle;
  const lifecycleStages = getLifecycleStages(effectiveLifecycle);
  const isTerminalStatus = lifecycleStages.find(s => s.key === caseData.status)?.is_terminal
    ?? ["completed","cancelled"].includes(caseData.status);
  const canEditCase = onUpdate && !isTerminalStatus
    && (auth.isAdmin || auth.isManager || (auth.isClient && caseData.client_id === auth.user?.id));

  async function handleSaveCaseLc() {
    setSavingLc(true);
    try {
      await onUpdate(caseData.id, { case_lifecycle: { preset: lcMode } });
    } catch (e) { alert(e.message); }
    setSavingLc(false);
  }

  const CANCEL_REASONS = [
    "Client withdrew the request",
    "Budget constraints",
    "Timeline not feasible",
    "Requirements changed",
    "Duplicate case",
    "No suitable candidate found",
    "Project completed differently",
    "Other",
  ];

  function initCancelModal(caseId, isSubCase = false) {
    setCancelReason("");
    setCancelNotes("");
    setCancelModal({ caseId, isSubCase });
  }

  async function confirmCancellation() {
    if (!cancelReason || !cancelNotes.trim()) return;
    if (cancelModal.isSubCase) {
      await supabase.from("cases")
        .update({ status: "cancelled", cancellation_reason: cancelReason, cancellation_notes: cancelNotes || null })
        .eq("id", cancelModal.caseId);
      setSelectedSubCase(prev => ({ ...prev, status: "cancelled" }));
    } else {
      await onStatusChange(cancelModal.caseId, "cancelled", {
        cancellation_reason: cancelReason,
        cancellation_notes: cancelNotes || null,
      });
    }
    setCancelModal(null);
  }

  const myApp = applications.find(a => a.consultant_id === auth.user?.id);
  const doneMilestones = milestones.filter(m => m.is_done).length;
  const milestonePct = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;
  const canAddSubCase = (auth.isAdmin || auth.isManager || auth.isClient) &&
    !["completed", "cancelled"].includes(caseData.status);

  const canDelete =
    caseData.status === "open" &&
    (auth.isAdmin || auth.isManager || (auth.isClient && caseData.client_id === auth.user?.id));

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

  async function handleCreateSubCase() {
    if (!subCaseForm.title.trim()) return;
    setSavingSubCase(true);
    try {
      await createSubCase({
        ...subCaseForm,
        client_id: caseData.client_id,
        manager_id: caseData.manager_id,
      });
      setSubCaseForm({ title: "", description: "", priority: "medium", status: "open" });
      setShowSubCaseForm(false);
    } catch (e) { alert(e.message); }
    setSavingSubCase(false);
  }

  const totalTimeHours = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);

  async function handleDocUpload() {
    if (!pendingDocFile) return;
    setUploadingDoc(true);
    try {
      await addDocument(pendingDocFile, docNotes);
      setPendingDocFile(null); setDocNotes(""); setShowDocForm(false);
    } catch (e) { alert(e.message); }
    setUploadingDoc(false);
  }

  async function handleTimeLog() {
    if (!timeForm.hours || !timeForm.description.trim()) return;
    setSavingTime(true);
    try {
      await addTimeEntry({ ...timeForm, case_id: caseData.id, hours: Number(timeForm.hours) });
      setTimeForm({ date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true });
      setShowTimeForm(false);
    } catch (e) { alert(e.message); }
    setSavingTime(false);
  }

  async function handleDelete() {
    const blockers = [];
    if (applications.length > 0) blockers.push(`${applications.length} application(s)`);
    if (timeEntries.length > 0)  blockers.push(`${timeEntries.length} time entr${timeEntries.length === 1 ? "y" : "ies"}`);
    if (documents.length > 0)    blockers.push(`${documents.length} document(s)`);
    if (subCases.length > 0)     blockers.push(`${subCases.length} sub-case(s)`);
    if (blockers.length > 0) {
      alert(`Cannot delete: this case has ${blockers.join(", ")}.\n\nRemove them first, or change the status to "Cancelled" instead.`);
      return;
    }
    if (!window.confirm(`Permanently delete "${caseData.title}"? This cannot be undone.`)) return;
    try { await onDelete(); } catch (e) { alert(e.message); }
  }

  const tabs = [
    { id: "detail",     label: "Details",      icon: ClipboardList, count: null },
    { id: "milestones", label: "Milestones",   icon: Flag,          count: `${doneMilestones}/${milestones.length}` },
    { id: "comments",   label: "Activity",     icon: MessageSquare, count: comments.length },
    { id: "subcases",   label: "Sub-cases",    icon: Layers,        count: subCases.length },
    { id: "documents",  label: "Docs",         icon: Paperclip,     count: documents.length },
    { id: "time",       label: "Time",         icon: Clock,         count: `${totalTimeHours.toFixed(1)}h` },
    ...(auth.isAdmin || auth.isManager ? [{ id: "applications", label: "Applications", icon: Users, count: applications.length }] : []),
    ...(auth.isAdmin || auth.isManager || auth.isClient ? [{ id: "lifecycle", label: "Lifecycle", icon: TrendingUp, count: null }] : []),
    { id: "spec", label: "Spec", icon: FileText, count: null },
  ];

  return (
    <div className="space-y-4">

      {/* Full-page header — only when rendered outside a modal */}
      {onBack && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <button onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
            ← Cases
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{caseData.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {(() => {
                  const stage = lifecycleStages.find(s => s.key === caseData.status);
                  return stage
                    ? <span className="px-2 py-0.5 text-xs font-semibold rounded-lg" style={{ backgroundColor: stage.color + "22", color: stage.color }}>{stage.label}</span>
                    : <Badge className={STATUS_COLORS[caseData.status] ?? "bg-gray-100 text-gray-600"}>{cap(fmt(caseData.status))}</Badge>;
                })()}
                <Badge className={PRIORITY_COLORS[caseData.priority]}>{cap(caseData.priority)}</Badge>
                {caseData.is_confidential && <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">Private</span>}
                {caseData.nda_required && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">NDA</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEditCase && (
                <button onClick={() => setShowEditWizard(true)}
                  className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5">
                  Edit
                </button>
              )}
            </div>
          </div>
          {caseData.description && (
            <p className="text-sm text-gray-600 leading-relaxed mt-3">{caseData.description}</p>
          )}
        </div>
      )}

      {/* Lifecycle Track */}
      <CaseLifecycleTrack stages={lifecycleStages} currentStatus={caseData.status} />

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Overall Progress</span>
          <span className="font-semibold text-gray-800">{progressPct}%</span>
        </div>
        <div className="h-2.5 bg-blue-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }} />
        </div>
        {milestones.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">Milestones: {milestonePct}% complete</div>
        )}
      </div>

      {/* Next Steps — big action buttons */}
      {onStatusChange && (() => {
        const curStage = lifecycleStages.find(s => s.key === caseData.status);
        if (!curStage || curStage.is_terminal) return null;
        const allowedNext  = curStage.allowed_next?.length  ? curStage.allowed_next  : null;
        const allowedRoles = curStage.allowed_roles?.length ? curStage.allowed_roles : null;
        const canChange = auth.isAdmin || !allowedRoles || allowedRoles.includes(auth.role);
        if (!canChange) return null;
        const validNext = allowedNext
          ? lifecycleStages.filter(s => allowedNext.includes(s.key))
          : lifecycleStages.filter(s => s.key !== caseData.status);
        if (!validNext.length) return null;

        const NEXT_META = {
          open:        { Icon: FolderOpen,   desc: "Re-open this case for further action" },
          evaluation:  { Icon: Search,       desc: "Move into the evaluation phase" },
          confirmed:   { Icon: CheckCircle2, desc: "Confirm and move this case forward" },
          planning:    { Icon: Target,       desc: "Begin planning the work" },
          in_progress: { Icon: Play,         desc: "Start active work on this case" },
          review:      { Icon: Activity,     desc: "Send for review before closing" },
          closed:      { Icon: Archive,      desc: "Mark as successfully completed" },
          cancelled:   { Icon: X,            desc: "Stop work and close this case" },
          new:         { Icon: Inbox,        desc: "Mark as a new incoming request" },
          user_test:   { Icon: Users,        desc: "Send for user testing and sign-off" },
          returned:    { Icon: RotateCcw,    desc: "Return for rework or additional input" },
          resolved:    { Icon: CheckCircle2, desc: "Mark this case as fully resolved" },
        };

        return (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Next Steps</p>
            <div className={`grid gap-3 ${validNext.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
              {validNext.map(s => {
                const { Icon, desc } = NEXT_META[s.key] ?? { Icon: Zap, desc: "Move to this stage" };
                const isCancelled = s.key === "cancelled";
                const color = isCancelled ? "#EF4444" : s.color;
                return (
                  <button key={s.key}
                    onClick={() => isCancelled ? initCancelModal(caseData.id) : onStatusChange(caseData.id, s.key)}
                    className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl border-2 text-left transition-all hover:shadow-md active:scale-[0.98] bg-white ${
                      isCancelled
                        ? "border-red-100 hover:border-red-300 hover:bg-red-50"
                        : "border-gray-100 hover:border-blue-200 hover:bg-blue-50/30"
                    }`}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: color + "22" }}>
                      <Icon className="w-6 h-6" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{s.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
                    </div>
                    <span className="text-gray-300 text-xl flex-shrink-0">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Icon Tiles */}
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all min-w-[80px] ${
                  isActive
                    ? "bg-[#1A4B8C] border-[#1A4B8C] text-white shadow-md"
                    : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  isActive ? "bg-white/20" : "bg-gray-100"}`}>
                  <Icon size={14} className={isActive ? "text-white" : "text-gray-500"} />
                </div>
                <span className="text-xs font-medium">{t.label}</span>
                {t.count !== null && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

      {/* Detail Tab */}
      {activeTab === "detail" && (
        <div className="space-y-4">
          {/* Badges row with optional Edit button */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {showEditWizard && (() => {
                const stage = lifecycleStages.find(s => s.key === caseData.status);
                return stage
                  ? <span className="px-2 py-0.5 text-xs font-semibold rounded-lg" style={{ backgroundColor: stage.color + "22", color: stage.color }}>{stage.label}</span>
                  : <Badge className={STATUS_COLORS[caseData.status] ?? "bg-gray-100 text-gray-600"}>{cap(fmt(caseData.status))}</Badge>;
              })()}
              {showEditWizard && <Badge className={PRIORITY_COLORS[caseData.priority]}>{cap(caseData.priority)}</Badge>}
              {caseData.parent_case_id && (
                <Badge className="bg-violet-100 text-blue-700">Sub-case</Badge>
              )}
              {caseData.is_confidential && (
                <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">Private case</span>
              )}
              {caseData.nda_required && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">NDA required</span>
              )}
            </div>
            {canEditCase && (
              <button onClick={() => setShowEditWizard(true)}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-3 py-1.5 flex-shrink-0">
                Edit
              </button>
            )}
          </div>

          {showEditWizard && (
            <p className="text-gray-700 text-sm leading-relaxed">{caseData.description || "No description provided."}</p>
          )}

          {/* Overview card */}
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overview</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              {caseData.budget && <div><span className="text-gray-400">Budget: </span><span className="font-medium">${Number(caseData.budget).toLocaleString()}</span></div>}
              {caseData.due_date && <div><span className="text-gray-400">Due: </span><span className="font-medium">{fmtDate(caseData.due_date)}</span></div>}
              {caseData.start_date && <div><span className="text-gray-400">Starts: </span><span className="font-medium">{fmtDate(caseData.start_date)}</span></div>}
              {caseData.client?.full_name && <div><span className="text-gray-400">Client: </span><span className="font-medium">{caseData.client.full_name}</span></div>}
              {caseData.manager?.full_name && <div><span className="text-gray-400">Manager: </span><span className="font-medium">{caseData.manager.full_name}</span></div>}
              {caseData.area_sap && <div><span className="text-gray-400">SAP Area: </span><span className="font-medium">{caseData.area_sap}</span></div>}
              {caseData.area_industry && <div><span className="text-gray-400">Industry: </span><span className="font-medium">{caseData.area_industry}</span></div>}
            </div>
            <div className="mt-3">
              <ProjectFieldEditor caseData={caseData} auth={auth} />
            </div>
          </div>

          {/* Skills */}
          {caseData.skills_required?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Skills Required</div>
              <div className="flex flex-wrap gap-2">
                {caseData.skills_required.map(s => (
                  <span key={s} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Work Arrangement card */}
          {caseData.work_mode && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Work Arrangement</p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">{caseData.work_mode}</span>
                {caseData.work_location && <span className="text-sm text-gray-600">{caseData.work_location}</span>}
                {caseData.travel_required && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold">Travel required</span>
                )}
              </div>
            </div>
          )}

          {/* Roles & Contacts card */}
          {((caseData.case_key_users?.length > 0) || caseData.key_user_email || caseData.is_head_hunter) && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Roles &amp; Contacts</p>
              <div className="space-y-3 text-sm">
                {caseData.case_key_users?.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-400 mb-1.5">Key Users</div>
                    <div className="space-y-1.5">
                      {caseData.case_key_users.map(ku => (
                        <div key={ku.user_id} className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 text-xs truncate">{ku.users?.full_name ?? "—"}</div>
                            <div className="text-[10px] text-gray-400 truncate">{ku.users?.email}</div>
                          </div>
                          {ku.area && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded flex-shrink-0">{ku.area}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {caseData.key_user_email && !caseData.case_key_users?.length && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Key User (invited)</div>
                    <div className="text-xs text-gray-500">{caseData.key_user_email}</div>
                  </div>
                )}
                {caseData.is_head_hunter && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Head Hunter</div>
                    <div className="font-medium">{caseData.head_hunter_name || "Yes"}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Qualifications card */}
          {(caseData.certifications_required?.length > 0 || caseData.languages_required?.length > 0 ||
            caseData.min_years_experience || caseData.security_clearance) && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Requirements</p>
              <div className="space-y-2 text-sm">
                {caseData.min_years_experience && (
                  <div className="text-gray-700">{caseData.min_years_experience} years minimum experience</div>
                )}
                {caseData.security_clearance && (
                  <span className="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">Security clearance required</span>
                )}
                {caseData.certifications_required?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {caseData.certifications_required.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs">{c}</span>
                    ))}
                  </div>
                )}
                {caseData.languages_required?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {caseData.languages_required.map((l, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs">{l}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interview card */}
          {caseData.interview_required && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Interview</p>
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">
                  {caseData.interview_format?.replace("_", " ")}
                </span>
                <span className="text-gray-600">{caseData.interview_rounds} round{caseData.interview_rounds > 1 ? "s" : ""}</span>
                {caseData.technical_assessment && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">Technical assessment</span>
                )}
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
              ) : onApply ? (
                <button onClick={onApply}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm">
                  Apply to This Case →
                </button>
              ) : null}
            </div>
          )}

          {/* Status transition buttons — role + allowed_next aware */}
          {onStatusChange && (() => {
            const curStage = lifecycleStages.find(s => s.key === caseData.status);
            const allowedNext  = curStage?.allowed_next?.length  ? curStage.allowed_next  : null;
            const allowedRoles = curStage?.allowed_roles?.length ? curStage.allowed_roles : null;
            const canChange = auth.isAdmin || !allowedRoles || allowedRoles.includes(auth.role);
            if (!canChange) return null;
            const validNext = allowedNext
              ? lifecycleStages.filter(s => allowedNext.includes(s.key))
              : lifecycleStages.filter(s => s.key !== caseData.status && !curStage?.is_terminal);
            if (!validNext.length) return null;
            return (
              <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2">
                {validNext.map(s => (
                  <button key={s.key}
                    onClick={() => s.key === "cancelled" ? initCancelModal(caseData.id) : onStatusChange(caseData.id, s.key)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors hover:opacity-90"
                    style={{ borderColor: s.color + "55", color: s.color, backgroundColor: s.color + "12" }}>
                    → {s.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Delete — visible to creator (client) or admin/manager when case is Open with no dependencies */}
          {canDelete && (
            <div className="border-t border-red-50 pt-4 mt-2">
              <button onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4 mr-1" /> Delete Case
              </button>
              <p className="text-xs text-gray-400 mt-1.5">
                Only available while the case is <strong>Open</strong> and has no applications, time entries, documents, or sub-cases.
              </p>
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
                {m.is_done && <Check className="w-3 h-3 text-white" />}
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
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleAddMilestone}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
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
                    <div className="w-6 h-6 rounded-full bg-blue-200 text-blue-700 text-xs flex items-center justify-center font-bold">
                      {c.author?.full_name?.[0] ?? "?"}
                    </div>
                    <span className="font-medium text-gray-900">{c.author?.full_name ?? "Unknown"}</span>
                    {c.is_internal && <Badge className="bg-amber-200 text-amber-800">Internal</Badge>}
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{c.body}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  {c.hours_logged > 0 && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3 inline-block" /> {c.hours_logged}h logged</span>}
                  {c.progress_update !== null && <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 inline-block" /> Progress → {c.progress_update}%</span>}
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Update Progress % (optional)</label>
                <input type="number" min="0" max="100" value={commentForm.progressUpdate}
                  onChange={e => setCommentForm(p => ({ ...p, progressUpdate: e.target.value }))}
                  placeholder="e.g. 75"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {(auth.isAdmin || auth.isManager) && (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={commentForm.isInternal}
                  onChange={e => setCommentForm(p => ({ ...p, isInternal: e.target.checked }))}
                  className="rounded accent-blue-600" />
                Internal note (not visible to clients)
              </label>
            )}
            <button onClick={handleComment} disabled={sendingComment}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
              {sendingComment ? "Posting…" : "Post Comment"}
            </button>
          </div>
        </div>
      )}

      {/* Sub-cases Tab */}
      {activeTab === "subcases" && (
        <div className="space-y-3">
          {/* Header row with add button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {subCases.length === 0
                ? "No sub-cases yet."
                : `${subCases.length} sub-case${subCases.length !== 1 ? "s" : ""}`}
            </p>
            {canAddSubCase && !showSubCaseForm && (
              <button onClick={() => setShowSubCaseForm(true)}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                + New Sub-case
              </button>
            )}
          </div>

          {/* Create sub-case form */}
          {showSubCaseForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-gray-900 text-sm">New Sub-case</h4>
              <Input label="Title" value={subCaseForm.title}
                onChange={e => setSubCaseForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Sub-case title…" />
              <Textarea label="Description" value={subCaseForm.description}
                onChange={e => setSubCaseForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What needs to be done in this sub-case?" />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Priority" value={subCaseForm.priority}
                  onChange={e => setSubCaseForm(p => ({ ...p, priority: e.target.value }))}
                  options={["low","medium","high","critical"].map(s => ({ value: s, label: cap(s) }))} />
                <Select label="Initial Status" value={subCaseForm.status}
                  onChange={e => setSubCaseForm(p => ({ ...p, status: e.target.value }))}
                  options={["open","in_progress"].map(s => ({ value: s, label: cap(fmt(s)) }))} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSubCaseForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleCreateSubCase} disabled={savingSubCase}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingSubCase ? "Creating…" : "Create Sub-case"}
                </button>
              </div>
            </div>
          )}

          {/* Sub-case list */}
          <div className="space-y-2">
            {subCases.map(sc => (
              <div key={sc.id}
                className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedSubCase(sc)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{sc.title}</span>
                      <Badge className={STATUS_COLORS[sc.status]}>{cap(fmt(sc.status))}</Badge>
                      <Badge className={PRIORITY_COLORS[sc.priority]}>{cap(sc.priority)}</Badge>
                    </div>
                    {sc.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{sc.description}</p>
                    )}
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                      {sc.due_date && <span>Due: {fmtDate(sc.due_date)}</span>}
                      {sc.progress_pct > 0 && <span>Progress: {sc.progress_pct}%</span>}
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm flex-shrink-0">›</span>
                </div>
                {sc.progress_pct > 0 && (
                  <div className="h-1 bg-gray-100 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${sc.progress_pct}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Inline sub-case detail */}
          {selectedSubCase && (
            <div className="border-2 border-blue-200 rounded-2xl p-5 mt-3">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-gray-900">{selectedSubCase.title}</h4>
                <button onClick={() => setSelectedSubCase(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <CaseDetail
                caseData={selectedSubCase}
                auth={auth}
                onStatusChange={(id, status) => {
                  if (status === "cancelled") { initCancelModal(id, true); return; }
                  supabase.from("cases").update({ status }).eq("id", id)
                    .then(() => setSelectedSubCase(prev => ({ ...prev, status })));
                }}
                onDelete={async () => {
                  await supabase.from("cases").delete().eq("id", selectedSubCase.id);
                  setSelectedSubCase(null);
                }}
              />
            </div>
          )}
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
                {app.proposed_rate && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${app.proposed_rate}/hr</span>}
                {app.time_commitment && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{app.time_commitment}% time</span>}
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

      {/* V9 Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">{documents.length} document{documents.length !== 1 ? "s" : ""}</div>
            <button onClick={() => setShowDocForm(p => !p)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
              + Upload
            </button>
          </div>
          {showDocForm && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input ref={docFileRef} type="file"
                  onChange={e => setPendingDocFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
              <Textarea label="Notes (optional)" value={docNotes}
                onChange={e => setDocNotes(e.target.value)} placeholder="Description of this document…" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowDocForm(false); setPendingDocFile(null); setDocNotes(""); }}
                  className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
                <button onClick={handleDocUpload} disabled={!pendingDocFile || uploadingDoc}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {uploadingDoc ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="flex-shrink-0">
                  {doc.file_type?.includes("pdf") ? <FileText className="w-4 h-4 text-red-400" /> : doc.file_type?.includes("image") ? <FileImage className="w-4 h-4 text-blue-400" /> : <Paperclip className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="font-medium text-sm text-blue-600 hover:underline truncate block">{doc.file_name}</a>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {doc.file_size_kb ? `${doc.file_size_kb} KB · ` : ""}
                    {doc.uploader?.full_name ?? "Unknown"} · {fmtDate(doc.created_at)}
                  </div>
                  {doc.notes && <p className="text-xs text-gray-500 mt-0.5">{doc.notes}</p>}
                </div>
                {(auth.isAdmin || auth.isManager) && (
                  <button onClick={() => deleteDocument(doc.id, doc.file_url)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-50 flex-shrink-0">
                    Remove
                  </button>
                )}
              </div>
            ))}
            {documents.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Paperclip className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">No documents uploaded yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* V9 Time Entries Tab */}
      {activeTab === "time" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">
              Total: <span className="text-blue-600">{totalTimeHours.toFixed(1)}h</span>
              {" · "}Billable: <span className="text-green-600">{timeEntries.filter(e => e.is_billable).reduce((s, e) => s + e.hours, 0).toFixed(1)}h</span>
            </div>
            {auth.isConsultant && (
              <button onClick={() => setShowTimeForm(p => !p)}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                + Log Time
              </button>
            )}
          </div>
          {showTimeForm && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date" type="date" value={timeForm.date}
                  onChange={e => setTimeForm(p => ({ ...p, date: e.target.value }))} />
                <Input label="Hours" type="number" min="0.25" step="0.25" value={timeForm.hours}
                  onChange={e => setTimeForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
              <Textarea label="Description" value={timeForm.description}
                onChange={e => setTimeForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What did you work on?" />
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={timeForm.is_billable}
                  onChange={e => setTimeForm(p => ({ ...p, is_billable: e.target.checked }))}
                  className="rounded accent-blue-600" />
                Billable
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowTimeForm(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
                <button onClick={handleTimeLog} disabled={savingTime}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {savingTime ? "Saving…" : "Log Time"}
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Date</th>
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Consultant</th>
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Hours</th>
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Description</th>
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Billable</th>
                  <th className="pb-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {timeEntries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="py-2 text-gray-600">{fmtDate(e.date)}</td>
                    <td className="py-2 text-gray-700">{e.consultant?.full_name ?? "—"}</td>
                    <td className="py-2 font-semibold text-blue-700">{e.hours}h</td>
                    <td className="py-2 text-gray-500 max-w-xs truncate">{e.description}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {e.is_billable ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="py-2">
                      {e.is_approved
                        ? <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> Approved</span>
                        : (auth.isAdmin || auth.isManager)
                          ? <button onClick={() => approveEntry(e.id, true)}
                              className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100">
                              Approve
                            </button>
                          : <span className="text-xs text-gray-400">Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {timeEntries.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Clock className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">No time entries logged yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lifecycle Tab */}
      {/* Spec Tab */}
      {activeTab === "spec" && (
        <SpecificationTab caseData={caseData} auth={auth} documents={documents} addDocument={addDocument} refetchDocuments={refetchDocuments} />
      )}

      {activeTab === "lifecycle" && (auth.isAdmin || auth.isManager || auth.isClient) && (() => {
        const caseOverrideAllowed = clientLifecycle?.allow_case_override ?? true;
        const tmplList = caseLcTemplates.length ? caseLcTemplates : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }));
        const inheritedPreset = caseData.case_lifecycle?.preset ?? projectLifecycle?.preset ?? clientLifecycle?.preset ?? "standard";
        const previewStages = getCaseTmplStages(lcMode);
        const previewActive = previewStages.filter(s => !s.is_terminal);
        const previewTerminal = previewStages.filter(s => s.is_terminal);
        const inheritedStages = getCaseTmplStages(inheritedPreset);
        return (
          <div className="space-y-5">
            <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Lifecycle source:</span>
              {caseData.case_lifecycle
                ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">This case</span>
                : projectLifecycle
                ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">Project</span>
                : clientLifecycle
                ? <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold">Company profile</span>
                : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold">Default (Standard)</span>}
              {!caseOverrideAllowed && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">🔒 Override locked</span>
              )}
            </div>

            {!caseOverrideAllowed ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                The company profile does not allow cases to choose a different lifecycle template.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {tmplList.map(tmpl => {
                    const isSelected = lcMode === tmpl.key;
                    const active = tmpl.stages.filter(s => !s.is_terminal);
                    return (
                      <button key={tmpl.key} onClick={() => setLcMode(tmpl.key)}
                        className={`text-left p-3 rounded-xl border-2 transition-all ${
                          isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-gray-900">{tmpl.name}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{tmpl.subtitle}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {active.map((s, i) => (
                            <span key={s.key} className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: s.color + "22", color: s.color }}>{s.label}</span>
                              {i < active.length - 1 && <span className="text-gray-300 text-[10px]">›</span>}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {lcMode !== (caseData.case_lifecycle?.preset ?? projectLifecycle?.preset ?? clientLifecycle?.preset ?? "standard") && (
                  <LifecycleFlowDiagram stages={previewStages} currentStatus={null} />
                )}

                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <button onClick={handleSaveCaseLc} disabled={savingLc}
                    className="px-4 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
                    {savingLc ? "Saving…" : "Save Lifecycle"}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

        </div>
      </div>

      {showEditWizard && (
        <div className="fixed top-0 bottom-0 right-0 left-64 z-50 bg-[#EAF4FD] overflow-y-auto p-6">
          <CreateCaseWizard
            auth={auth}
            initialData={caseData}
            onSave={async (payload) => { await onUpdate(caseData.id, payload); }}
            onComplete={() => setShowEditWizard(false)}
            onCancel={() => setShowEditWizard(false)}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// ARENA (COMPETITIVE BIDDING)
// ============================================================
function ArenaView({ auth }) {
  const [arenaTab, setArenaTab]         = useState("cases");
  const [applyingToCase, setApplying]   = useState(null);
  const { leaderboard, loading: lbLoading } = useLeaderboard();
  const { cases, loading: casesLoading }    = useCases();
  const { applications }                    = useApplications();

  const openCases       = cases.filter(c => c.status === "open");
  const myApplications  = applications.filter(a => a.consultant_id === auth.user?.id);
  const appliedCaseIds  = new Set(myApplications.map(a => a.case_id));

  const renderCases = () => {
    if (casesLoading) return <Spinner />;
    if (openCases.length === 0) return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        No open cases available right now.
      </div>
    );
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {openCases.map(c => {
          const companyName  = c.client?.client_profiles?.company_name || c.client?.full_name;
          const alreadyApplied = appliedCaseIds.has(c.id);
          const appCount     = c.applications?.[0]?.count ?? 0;
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900 text-sm leading-snug">{c.title}</h3>
                <Badge className={PRIORITY_COLORS[c.priority]}>{cap(c.priority)}</Badge>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {c.area_sap      && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{c.area_sap}</span>}
                {c.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium">{c.area_industry}</span>}
              </div>
              {companyName && <p className="text-xs text-blue-600 font-medium mb-1">{companyName}</p>}
              {c.description && <p className="text-xs text-gray-400 line-clamp-2 mb-3">{c.description}</p>}
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-3">
                {c.start_date && <span>Starts: {fmtDate(c.start_date)}</span>}
                {c.due_date   && <span>Due: {fmtDate(c.due_date)}</span>}
                {c.budget     && <span>Budget: ${Number(c.budget).toLocaleString()}</span>}
              </div>
              {c.skills_required?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {c.skills_required.slice(0, 3).map(s => (
                    <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400">{appCount} applicant{appCount !== 1 ? "s" : ""}</span>
                {auth.isConsultant && (
                  alreadyApplied
                    ? <span className="text-xs text-green-600 font-semibold">✓ Applied</span>
                    : <button onClick={() => setApplying(c)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors">
                        Apply →
                      </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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
                  {i === 0 ? <span className="font-bold text-yellow-500">#1</span>
                    : i === 1 ? <span className="font-bold text-gray-400">#2</span>
                    : i === 2 ? <span className="font-bold text-amber-600">#3</span>
                    : <span className="font-bold text-gray-300">{`#${i + 1}`}</span>}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
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
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
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
            {i === 0 ? <span className="font-bold text-yellow-500 text-sm">#1</span>
              : i === 1 ? <span className="font-bold text-gray-400 text-sm">#2</span>
              : i === 2 ? <span className="font-bold text-amber-600 text-sm">#3</span>
              : null}
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span><strong className="text-gray-800">{c.acceptedCases}</strong> won</span>
            <span><strong className="text-gray-800">{c.totalApps}</strong> apps</span>
            <span><strong className="text-gray-800">{c.ratingCount}</strong> ratings</span>
          </div>
          {c.skills?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {c.skills.slice(0, 4).map(s => (
                <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
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
          const appRate = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
          return (
            <div key={c.id} className={`bg-white rounded-2xl border-2 shadow-sm p-6 ${
              i === 0 ? "border-yellow-300" : i === 1 ? "border-gray-300" : "border-orange-300"}`}>
              <div className="text-center mb-4">
                <div className="mb-2 flex justify-center">
                  {i === 0 ? <span className="font-bold text-2xl text-yellow-500">#1</span>
                    : i === 1 ? <span className="font-bold text-2xl text-gray-400">#2</span>
                    : <span className="font-bold text-2xl text-amber-600">#3</span>}
                </div>
                <div className="text-3xl font-bold bg-blue-100 text-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl mb-2">
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
                    <div className="h-full bg-blue-500 rounded-full transition-all"
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

  if (applyingToCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <ApplyWizard
          caseData={applyingToCase}
          auth={auth}
          onComplete={() => setApplying(null)}
          onCancel={() => setApplying(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arena</h1>
          <p className="text-gray-500 text-sm mt-1">Open cases & consultant rankings</p>
        </div>
        {openCases.length > 0 && (
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-xl">
            {openCases.length} open case{openCases.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[
          { id: "cases",       label: "Open Cases" },
          { id: "leaderboard", label: "Leaderboard" },
          { id: "cards",       label: "Cards" },
          { id: "compare",     label: "Compare" },
        ].map(t => (
          <button key={t.id} onClick={() => setArenaTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              arenaTab === t.id ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {arenaTab === "cases"       && renderCases()}
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
  // Extract the real consultant_profiles id from auth (useAuth already fetched it via FK join)
  const cpRaw = auth.profile?.consultant_profiles;
  const realProfileId = Array.isArray(cpRaw) ? cpRaw[0]?.id : cpRaw?.id;
  const { profile, availability, loading, profileError, updateProfile, uploadPhoto, addCustomer, addProject, addWorkAuth } =
    useConsultantProfile(auth.user?.id, realProfileId);
  const { ratings, avgRating } = useRatings(auth.user?.id);
  const [profileTab, setProfileTab] = useState("overview");
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (!editing) setForm({
      headline: profile?.headline ?? "",
      bio: profile?.bio ?? "",
      linkedin_url: profile?.linkedin_url ?? "",
      hourly_rate: profile?.hourly_rate ?? "",
      years_experience: profile?.years_experience ?? 0,
      external_occupancy_pct: profile?.external_occupancy_pct ?? 0,
      travel_available: profile?.travel_available ?? false,
      expertise_level: profile?.expertise_level ?? "mid",
      availability_type: profile?.availability_type ?? "project_based",
      _skills: profile?.skills?.join(", ") ?? "",
    });
  }, [profile, editing]);

  async function handleSave() {
    setSaving(true);
    try {
      const { _skills, ...profileData } = form;
      await updateProfile({
        ...profileData,
        skills: _skills?.split(",").map(s => s.trim()).filter(Boolean) ?? [],
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        years_experience: Number(form.years_experience) || 0,
        external_occupancy_pct: Number(form.external_occupancy_pct) || 0,
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

  const [custForm, setCustForm] = useState({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" });
  const [projForm, setProjForm] = useState({ title: "", client_name: "", url: "", description: "", _tech: "" });
  const [authForm, setAuthForm] = useState({ country_name: "", country_code: "", auth_type: "citizen" });
  const [savingExp, setSavingExp] = useState(false);

  if (loading) return <Spinner />;


  // Availability breakdown
  const activeCaseCommitment = 0; // case_assignments removed from join; RPC provides totals
  const extOccupancy = profile?.external_occupancy_pct ?? 0;
  const totalUsed = Math.min(100, activeCaseCommitment + extOccupancy);
  const freeAvail = Math.max(0, 100 - totalUsed);

  const tabs = [
    { id: "overview",   label: "Overview",   icon: User },
    { id: "experience", label: "Experience", icon: Briefcase },
    { id: "skills",     label: "Skills",     icon: GraduationCap },
    { id: "ratings",    label: "Ratings",    icon: Star },
  ];

  async function handleAddCustomer() {
    setSavingExp(true);
    try { await addCustomer(custForm); setCustForm({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" }); }
    catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleAddProject() {
    setSavingExp(true);
    try {
      const { _tech, ...rest } = projForm;
      await addProject({ ...rest, tech_stack: _tech.split(",").map(s => s.trim()).filter(Boolean) });
      setProjForm({ title: "", client_name: "", url: "", description: "", _tech: "" });
    } catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  async function handleAddWorkAuth() {
    setSavingExp(true);
    try { await addWorkAuth(authForm); setAuthForm({ country_name: "", country_code: "", auth_type: "citizen" }); }
    catch (e) { alert(e.message); }
    setSavingExp(false);
  }

  return (
    <div>
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold overflow-hidden">
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="avatar" className="w-full h-full object-cover" />
                : auth.profile?.full_name?.[0]}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-700">
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
              {profile?.hourly_rate && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${profile.hourly_rate}/hr</span>}
              {profile?.travel_available && <span className="flex items-center gap-1"><Plane className="w-3 h-3" />Travel available</span>}
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
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
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
              className="w-full accent-blue-600" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
            <input type="checkbox" checked={form.travel_available}
              onChange={e => setForm(p => ({ ...p, travel_available: e.target.checked }))}
              className="rounded accent-blue-600" />
            Available for travel
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Icon Tiles */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = profileTab === t.id;
          return (
            <button key={t.id} onClick={() => setProfileTab(t.id)}
              className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all min-w-[80px] ${
                isActive
                  ? "bg-[#1A4B8C] border-[#1A4B8C] text-white shadow-md"
                  : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isActive ? "bg-white/20" : "bg-gray-100"}`}>
                <Icon size={14} className={isActive ? "text-white" : "text-gray-500"} />
              </div>
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {profileTab === "overview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-3">About</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{profile?.bio || "No bio yet. Edit your profile to add one."}</p>
          {profile?.linkedin_url && (
            <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-sm text-blue-600 hover:underline">
              <Link className="w-3.5 h-3.5 mr-1" /> LinkedIn Profile
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
        <div className="space-y-6">
          {/* Past Customers */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Past Customers</h3>
            {(profile?.consultant_customers?.length ?? 0) === 0
              ? <p className="text-sm text-gray-400 mb-4">No customers added yet.</p>
              : <div className="space-y-3 mb-4">
                  {profile.consultant_customers.map(c => (
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
                </div>}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Customer</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Company Name" value={custForm.company_name} onChange={e => setCustForm(p => ({ ...p, company_name: e.target.value }))} />
                <Input label="Role Held" value={custForm.role_held} onChange={e => setCustForm(p => ({ ...p, role_held: e.target.value }))} />
                <Input label="Start Date" type="date" value={custForm.start_date} onChange={e => setCustForm(p => ({ ...p, start_date: e.target.value }))} />
                <Input label="End Date" type="date" value={custForm.end_date} onChange={e => setCustForm(p => ({ ...p, end_date: e.target.value }))} placeholder="Leave blank if current" />
              </div>
              <Textarea label="Description" value={custForm.description} onChange={e => setCustForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddCustomer} disabled={savingExp || !custForm.company_name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {savingExp ? "Saving…" : "+ Add Customer"}
              </button>
            </div>
          </div>

          {/* Projects */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Projects</h3>
            {(profile?.consultant_projects?.length ?? 0) === 0
              ? <p className="text-sm text-gray-400 mb-4">No projects added yet.</p>
              : <div className="space-y-3 mb-4">
                  {profile.consultant_projects.map(p => (
                    <div key={p.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{p.title}</div>
                          {p.client_name && <div className="text-xs text-gray-400">{p.client_name}</div>}
                        </div>
                        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View →</a>}
                      </div>
                      {p.description && <p className="text-sm text-gray-600 mt-2">{p.description}</p>}
                      {p.tech_stack?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tech_stack.map(s => <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{s}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Project</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Title" value={projForm.title} onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))} />
                <Input label="Client Name" value={projForm.client_name} onChange={e => setProjForm(p => ({ ...p, client_name: e.target.value }))} />
                <Input label="URL" value={projForm.url} onChange={e => setProjForm(p => ({ ...p, url: e.target.value }))} />
                <Input label="Tech Stack (comma-separated)" value={projForm._tech} onChange={e => setProjForm(p => ({ ...p, _tech: e.target.value }))} />
              </div>
              <Textarea label="Description" value={projForm.description} onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddProject} disabled={savingExp || !projForm.title}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {savingExp ? "Saving…" : "+ Add Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileTab === "skills" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Skills</h3>
            {(profile?.skills?.length ?? 0) === 0
              ? <p className="text-sm text-gray-400 mb-4">No skills added yet.</p>
              : <div className="flex flex-wrap gap-2 mb-4">{profile.skills.map(s => (
                  <span key={s} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">{s}</span>
                ))}</div>}
            <div className="flex gap-2 mt-2">
              <input id="new-skill-input" placeholder="Add a skill…"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button disabled={savingExp} onClick={async () => {
                const input = document.getElementById("new-skill-input");
                const val = input?.value?.trim();
                if (!val) return;
                setSavingExp(true);
                try {
                  const current = profile?.skills ?? [];
                  if (!current.includes(val)) await updateProfile({ skills: [...current, val] });
                  input.value = "";
                } catch (e) { alert(e.message); }
                setSavingExp(false);
              }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {savingExp ? "…" : "+ Add"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Work Authorization</h3>
            {(profile?.work_authorizations?.length ?? 0) === 0
              ? <p className="text-sm text-gray-400 mb-4">No work authorizations added.</p>
              : <div className="grid grid-cols-2 gap-3 mb-4">
                  {profile.work_authorizations.map(w => (
                    <div key={w.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                      <div className="text-2xl">{w.country_code === "US" ? "🇺🇸" : w.country_code === "GB" ? "🇬🇧" : "🌐"}</div>
                      <div>
                        <div className="text-sm font-medium">{w.country_name}</div>
                        <div className="text-xs text-gray-400 capitalize">{fmt(w.auth_type)}</div>
                      </div>
                    </div>
                  ))}
                </div>}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Authorization</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Country Name" value={authForm.country_name} onChange={e => setAuthForm(p => ({ ...p, country_name: e.target.value }))} />
                <Input label="Country Code" value={authForm.country_code} onChange={e => setAuthForm(p => ({ ...p, country_code: e.target.value.toUpperCase() }))} placeholder="US" />
                <Select label="Auth Type" value={authForm.auth_type} onChange={e => setAuthForm(p => ({ ...p, auth_type: e.target.value }))}
                  options={[{ value: "citizen", label: "Citizen" }, { value: "permanent_resident", label: "Permanent Resident" }, { value: "work_visa", label: "Work Visa" }, { value: "other", label: "Other" }]} />
              </div>
              <button onClick={handleAddWorkAuth} disabled={savingExp || !authForm.country_name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {savingExp ? "Saving…" : "+ Add Authorization"}
              </button>
            </div>
          </div>
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
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
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
        className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} onClick={() => setSelected(c)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
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
                  <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState Icon={UserCheck} title="No consultants found" subtitle="Try a different search" />
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
        <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
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
        {profile?.travel_available && <div className="flex items-center gap-1"><Plane className="w-3 h-3 inline-block mr-0.5" /> Travel available</div>}
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
            <span key={s} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">{s}</span>
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

      {/* Cancellation reason modal */}
    {cancelModal && (
      <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && setCancelModal(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-500 font-bold text-lg leading-none">✕</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Why is this case being cancelled?</h3>
              <p className="text-sm text-gray-500 mt-0.5">Select a reason — this helps track patterns across cases.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {CANCEL_REASONS.map(r => (
              <label key={r}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors select-none ${
                  cancelReason === r ? "border-red-300 bg-red-50" : "border-gray-100 hover:bg-gray-50"
                }`}>
                <input type="radio" name="cxReason" value={r}
                  checked={cancelReason === r}
                  onChange={() => setCancelReason(r)}
                  className="accent-red-500 flex-shrink-0" />
                <span className={`text-sm ${cancelReason === r ? "font-semibold text-red-700" : "text-gray-700"}`}>{r}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Explanation <span className="text-red-400">*</span>
            </p>
            <textarea value={cancelNotes} onChange={e => setCancelNotes(e.target.value)}
              rows={3} placeholder="Explain why this case is being cancelled…"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-100 resize-none text-gray-800 placeholder:text-gray-400 bg-white" />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => setCancelModal(null)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              Keep Case
            </button>
            <button onClick={confirmCancellation} disabled={!cancelReason || !cancelNotes.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Confirm Cancellation
            </button>
          </div>
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
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : notifications.length === 0 ? (
        <EmptyState Icon={Bell} title="All caught up!" subtitle="Notifications will appear here when cases are updated, applications change status, or you receive messages." />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-colors ${
                n.is_read ? "bg-white border-gray-100" : "bg-blue-50 border-blue-100 hover:bg-blue-100"}`}>
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.is_read ? "bg-gray-200" : "bg-blue-500"}`} />
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
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", role: "manager", password: "" });
  const [adding, setAdding]   = useState(false);
  const [addError, setAddError] = useState("");

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    setUsers(data ?? []);
  }

  useEffect(() => {
    (async () => { await loadUsers(); setLoading(false); })();
  }, []);

  async function toggleActive(userId, isActive) {
    await supabase.from("users").update({ is_active: !isActive }).eq("id", userId);
    setUsers(p => p.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
  }

  async function handleCreateUser() {
    setAddError("");
    if (!addForm.full_name || !addForm.email || !addForm.password) {
      setAddError("Name, email and password are required."); return;
    }
    setAdding(true);
    try {
      // Use a separate client with no session persistence so the admin stays logged in
      const tmpClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || "",
        import.meta.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { persistSession: false } }
      );
      const { error } = await tmpClient.auth.signUp({
        email: addForm.email,
        password: addForm.password,
        options: { data: { full_name: addForm.full_name, role: addForm.role } },
      });
      await tmpClient.auth.signOut();
      if (error) throw error;
      await loadUsers();
      setShowAdd(false);
      setAddForm({ full_name: "", email: "", role: "manager", password: "" });
    } catch (e) {
      setAddError(e.message || JSON.stringify(e));
    }
    setAdding(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">{users.length} total users</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(""); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
          + Add User
        </button>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create User Account</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
              This form creates Manager and Admin accounts. Consultant and Client users self-register.
            </div>
            <Input label="Full Name" value={addForm.full_name}
              onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
              placeholder="Jane Smith" />
            <Input label="Email" type="email" value={addForm.email}
              onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
              placeholder="jane@company.com" />
            <Select label="Role" value={addForm.role}
              onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
              options={[
                { value: "manager",    label: "Manager" },
                { value: "admin",      label: "Admin" },
                { value: "consultant", label: "Consultant" },
                { value: "client",     label: "Client" },
              ]} />
            <Input label="Temporary Password" type="password" value={addForm.password}
              onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Min. 6 characters" />
            {addError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{addError}</div>
            )}
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button onClick={handleCreateUser} disabled={adding}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {adding ? "Creating…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
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
  const { invoices } = useInvoices();
  const { entries: timeEntries } = useTimeEntries();

  const byStatus = ["open","in_progress","on_hold","completed","cancelled"].map(s => ({
    label: cap(fmt(s)),
    count: cases.filter(c => c.status === s).length,
    color: s === "open" ? "bg-emerald-400" : s === "in_progress" ? "bg-blue-400" :
           s === "on_hold" ? "bg-yellow-400" : s === "completed" ? "bg-gray-300" : "bg-red-300",
  }));

  const totalApps = applications.length;
  const acceptedApps = applications.filter(a => a.status === "accepted").length;
  const conversionRate = totalApps > 0 ? Math.round((acceptedApps / totalApps) * 100) : 0;

  const byAppStatus = ["pending","under_review","accepted","rejected","withdrawn"].map(s => ({
    label: cap(fmt(s)),
    count: applications.filter(a => a.status === s).length,
  }));

  const totalInvoiced    = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalPaid        = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOutstanding = invoices.filter(i => ["sent","overdue"].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalHours       = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
  const billableHours    = timeEntries.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Platform analytics overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Cases",     value: cases.length,                     Icon: FolderOpen },
          { label: "Conversion Rate", value: `${conversionRate}%`,             Icon: Target },
          { label: "Hours Logged",    value: `${totalHours.toFixed(0)}h`,      Icon: Clock },
          { label: "Revenue (Paid)",  value: `$${totalPaid.toLocaleString()}`, Icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="mb-2"><s.Icon className="w-5 h-5 text-gray-400" /></div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
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
                  <div className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: totalApps ? `${(s.count / totalApps) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue overview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">Revenue Overview</h2>
          <div className="space-y-4">
            {[
              { label: "Total Invoiced",  value: totalInvoiced,    color: "bg-blue-400" },
              { label: "Paid",            value: totalPaid,         color: "bg-green-400" },
              { label: "Outstanding",     value: totalOutstanding,  color: "bg-orange-400" },
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">${s.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`}
                    style={{ width: totalInvoiced ? `${(s.value / totalInvoiced) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 text-sm text-gray-500">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} total ·{" "}
              {invoices.filter(i => i.status === "overdue").length} overdue
            </div>
          </div>
        </div>

        {/* Time tracking */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5">Time Tracking</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{totalHours.toFixed(1)}h</div>
              <div className="text-xs text-blue-500 mt-1">Total Logged</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{billableHours.toFixed(1)}h</div>
              <div className="text-xs text-green-500 mt-1">Billable</div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            <div className="flex justify-between mb-1">
              <span>Approved entries</span>
              <span className="font-medium">{timeEntries.filter(e => e.is_approved).length} / {timeEntries.length}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full"
                style={{ width: timeEntries.length ? `${(timeEntries.filter(e => e.is_approved).length / timeEntries.length) * 100}%` : "0%" }} />
            </div>
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
                  selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
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
                <div className="mb-3 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ tier: "standard", uptime_guarantee_pct: 99, dedicated_consultant: false, priority_support: false, notes: "" });
  const [caseTypes, setCaseTypes] = useState(SLA_DEFAULT_TYPES);
  const [matrix, setMatrix]       = useState(() => makeDefaultMatrix());

  useEffect(() => {
    const m = sla?.sla_matrix;
    setForm({
      tier:                 sla?.tier                 ?? "standard",
      uptime_guarantee_pct: sla?.uptime_guarantee_pct ?? 99,
      dedicated_consultant: sla?.dedicated_consultant ?? false,
      priority_support:     sla?.priority_support     ?? false,
      notes:                sla?.notes                ?? "",
    });
    const cts = m?.case_types ?? SLA_DEFAULT_TYPES;
    setCaseTypes(cts);
    setMatrix(m?.matrix ?? makeDefaultMatrix(cts.map(t => t.key)));
  }, [sla]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSla({ ...form, sla_matrix: { case_types: caseTypes, matrix } });
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  const tierColors = { standard: "bg-gray-100 text-gray-700", premium: "bg-blue-100 text-blue-700", enterprise: "bg-violet-100 text-violet-700" };

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

      {/* Header fields */}
      {editing ? (
        <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Select label="SLA Tier" value={form.tier}
              onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}
              options={[{ value:"standard", label:"Standard" },{ value:"premium", label:"Premium" },{ value:"enterprise", label:"Enterprise" }]} />
            <Input label="Uptime Guarantee (%)" type="number" value={form.uptime_guarantee_pct}
              onChange={e => setForm(p => ({ ...p, uptime_guarantee_pct: Number(e.target.value) }))} />
          </div>
          <div className="flex gap-6">
            {[["dedicated_consultant","Dedicated Consultant"],["priority_support","Priority Support"]].map(([k,lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      ) : sla ? (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Badge className={tierColors[sla.tier] ?? tierColors.standard}>{cap(sla.tier)} Tier</Badge>
          {sla.uptime_guarantee_pct && <Badge className="bg-gray-100 text-gray-700">{sla.uptime_guarantee_pct}% Uptime</Badge>}
          {sla.priority_support    && <Badge className="bg-orange-100 text-orange-700">Priority Support</Badge>}
          {sla.dedicated_consultant && <Badge className="bg-green-100 text-green-700">Dedicated Consultant</Badge>}
          <span className="text-xs text-gray-400 ml-auto">Updated {fmtDate(sla.updated_at ?? sla.created_at)}</span>
        </div>
      ) : null}

      {/* Legend */}
      {!editing && sla && (
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <span><span className="text-blue-400 mr-1">↩</span>Initial Response</span>
          <span><span className="text-green-500 mr-1">✓</span>Resolution</span>
        </div>
      )}

      {/* Matrix */}
      {(sla || editing) ? (
        <SlaMatrixEditor caseTypes={caseTypes} matrix={matrix} editing={editing}
          onChangeCaseTypes={setCaseTypes} onChangeMatrix={setMatrix} />
      ) : (
        <div className="text-center py-8 text-gray-400">
          <div className="mb-2 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
          <p className="text-sm">No SLA configured for this client.</p>
          {(auth.isAdmin || auth.isManager) && (
            <button onClick={() => setEditing(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
              Configure SLA
            </button>
          )}
        </div>
      )}

      {/* Notes + actions */}
      {editing ? (
        <div className="mt-5 space-y-4">
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Additional SLA terms or notes…" />
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save SLA"}
            </button>
          </div>
        </div>
      ) : sla?.notes ? (
        <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-gray-700">
          <div className="font-medium text-yellow-800 mb-1">Notes</div>
          {sla.notes}
        </div>
      ) : null}
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
                    selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
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
                <div className="mb-3 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
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
            className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
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
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
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
            <div className="mb-2 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
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
                    selectedClient?.id === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
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
                <div className="mb-3 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
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
            className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
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
              className="rounded accent-blue-600" />
            Primary contact
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Adding…" : "Add Member"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members.map(m => (
          <div key={m.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                {m.full_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{m.full_name}</span>
                  {m.is_primary && <Badge className="bg-blue-100 text-blue-700">Primary</Badge>}
                </div>
                {m.role_title && <div className="text-xs text-gray-500">{m.role_title}</div>}
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              {m.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{m.email}</div>}
              {m.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{m.phone}</div>}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">
            <div className="mb-2 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
            <p className="text-sm">No team members added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ============================================================
// LIFECYCLE SETTINGS VIEW (admin/manager global page)
// ============================================================
function LifecycleSettingsView({ auth }) {
  const { templates, loadingTmpl, fetchTemplates } = useLifecycleTemplates();
  const [selected, setSelected] = useState(null);
  const [editStages, setEditStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [viewTmpl, setViewTmpl] = useState(null);

  function startEdit(tmpl) { setSelected(tmpl); setEditStages(tmpl.stages.map(s => ({ ...s }))); }
  function cancelEdit() { setSelected(null); setEditStages([]); }
  function addStage() {
    setEditStages(p => [...p, { key: `s${Date.now()}`, label: "New Stage", color: "#6b7280", is_terminal: false, allowed_next: [], allowed_roles: [] }]);
  }
  function removeStage(i) { setEditStages(p => p.filter((_, j) => j !== i)); }
  function moveStage(i, d) { setEditStages(p => { const n = [...p]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; }); }
  function updateStage(i, u) { setEditStages(p => p.map((s, j) => j === i ? { ...s, ...u } : s)); }

  function toggleRole(i, role) {
    const cur = editStages[i].allowed_roles ?? [];
    updateStage(i, { allowed_roles: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] });
  }
  function toggleNext(i, key) {
    const cur = editStages[i].allowed_next ?? [];
    updateStage(i, { allowed_next: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase.from("lifecycle_templates")
        .update({ stages: editStages, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (error) throw error;
      await fetchTemplates();
      setSelected(null);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  useEffect(() => {
    if (!templates.length) return;
    if (viewTmpl) {
      const fresh = templates.find(t => t.id === viewTmpl.id);
      if (fresh) setViewTmpl(fresh);
    } else {
      setViewTmpl(templates[0]);
    }
  }, [templates]);

  if (loadingTmpl) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  const ROLES = [
    { key: "manager",    label: "Manager",    color: "#1d4ed8", bg: "#dbeafe" },
    { key: "consultant", label: "Consultant", color: "#065f46", bg: "#d1fae5" },
    { key: "client",     label: "Client",     color: "#92400e", bg: "#fef3c7" },
    { key: "key_user",   label: "Key User",   color: "#5b21b6", bg: "#ede9fe" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Lifecycle Templates</h2>
        <p className="text-sm text-gray-500 mt-1">
          Define stages, transitions, and which roles can move a case to each next stage. Admin always has full access.
        </p>
      </div>

      {selected ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{selected.name}</h3>
              <p className="text-sm text-gray-500">{selected.description}</p>
            </div>
            <button onClick={cancelEdit} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Stages &amp; Transitions</p>
            {editStages.map((stage, idx) => (
              <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                {/* Row 1: color, label, type, controls */}
                <div className="flex items-center gap-2">
                  <input type="color" value={stage.color}
                    onChange={e => updateStage(idx, { color: e.target.value })}
                    className="w-7 h-7 rounded-lg cursor-pointer border border-gray-200 p-0.5 bg-white flex-shrink-0" />
                  <input type="text" value={stage.label}
                    onChange={e => updateStage(idx, { label: e.target.value })}
                    className="flex-1 text-sm font-medium bg-transparent border-0 focus:outline-none text-gray-800 min-w-0"
                    placeholder="Stage name" />
                  <select value={stage.is_terminal ? "terminal" : "active"}
                    onChange={e => updateStage(idx, { is_terminal: e.target.value === "terminal", ...(e.target.value === "terminal" ? { allowed_next: [], allowed_roles: [] } : {}) })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none flex-shrink-0">
                    <option value="active">Active</option>
                    <option value="terminal">Terminal</option>
                  </select>
                  <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-5 text-center flex-shrink-0">↑</button>
                  <button onClick={() => moveStage(idx, 1)} disabled={idx === editStages.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-5 text-center flex-shrink-0">↓</button>
                  <button onClick={() => removeStage(idx)}
                    className="text-red-300 hover:text-red-500 w-5 text-center flex-shrink-0 text-base leading-none">×</button>
                </div>

                {/* Row 2: roles + allowed_next (only for active stages) */}
                {!stage.is_terminal && (
                  <div className="pl-9 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">Roles</span>
                      {ROLES.map(r => {
                        const on = (stage.allowed_roles ?? []).includes(r.key);
                        return (
                          <button key={r.key} onClick={() => toggleRole(idx, r.key)}
                            className="text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors"
                            style={on
                              ? { backgroundColor: r.bg, color: r.color, borderColor: r.bg }
                              : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                            {r.label}
                          </button>
                        );
                      })}
                      {!(stage.allowed_roles ?? []).length && (
                        <span className="text-[10px] text-gray-400 italic">no restriction — any role</span>
                      )}
                    </div>
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0 pt-0.5">Next →</span>
                      <div className="flex flex-wrap gap-1">
                        {editStages.filter((_, j) => j !== idx).map(s => {
                          const on = (stage.allowed_next ?? []).includes(s.key);
                          return (
                            <button key={s.key} onClick={() => toggleNext(idx, s.key)}
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold border transition-colors"
                              style={on
                                ? { backgroundColor: s.color + "22", color: s.color, borderColor: s.color + "55" }
                                : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                              {s.label || s.key}
                            </button>
                          );
                        })}
                        {!(stage.allowed_next ?? []).length && (
                          <span className="text-[10px] text-gray-400 italic">no restriction — any stage</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addStage} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add Stage</button>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex" style={{ minHeight: 420 }}>
          {/* Left sidebar — template list */}
          <div className="w-44 flex-shrink-0 border-r border-gray-100 flex flex-col py-2">
            {templates.map(tmpl => (
              <button key={tmpl.id} onClick={() => setViewTmpl(tmpl)}
                className={`text-left px-4 py-3 transition-colors ${viewTmpl?.id === tmpl.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <div className={`font-semibold text-sm ${viewTmpl?.id === tmpl.id ? "text-blue-700" : "text-gray-800"}`}>{tmpl.name}</div>
                <div className="text-xs text-gray-400 mt-0.5 leading-tight">{tmpl.description}</div>
              </button>
            ))}
          </div>

          {/* Right panel — vertical flow */}
          {viewTmpl && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-lg">{viewTmpl.name} Lifecycle</h3>
                    {viewTmpl.subtitle && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{viewTmpl.subtitle}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{viewTmpl.description}</p>
                </div>
                <button onClick={() => startEdit(viewTmpl)}
                  className="flex-shrink-0 ml-4 px-4 py-1.5 bg-[#1A4B8C] hover:bg-blue-900 text-white text-sm font-semibold rounded-xl">
                  ✎ Edit Stages
                </button>
              </div>

              <div className="max-w-md">
                {viewTmpl.stages.map((s, i) => (
                  <Fragment key={s.key}>
                    {i > 0 && (
                      <div className="ml-[18px] flex flex-col" style={{ gap: 0 }}>
                        <div className="w-px h-4 bg-gray-200 self-start ml-px" />
                        <div className="self-start ml-[-3px]" style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #d1d5db" }} />
                      </div>
                    )}
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold text-gray-900 text-sm flex-1">{s.label}</span>
                      {s.is_terminal ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          Terminal
                        </span>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          {(s.allowed_roles ?? []).length === 0
                            ? <span className="text-[10px] text-gray-400 italic">Any role</span>
                            : (s.allowed_roles ?? []).map(r => {
                                const rm = ROLES.find(x => x.key === r);
                                if (!rm) return null;
                                return (
                                  <span key={r} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: rm.bg, color: rm.color }}>
                                    {rm.label}
                                  </span>
                                );
                              })}
                        </div>
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// CLIENT PROFILE VIEW
// ============================================================
const CASE_DEFAULTS_EMPTY = {
  priority: "medium", area_sap: "", area_industry: "", is_confidential: false, nda_required: false,
  description: "", sla: "standard", budget: "", work_mode: "remote", skills: "",
  travel_required: false, work_location: "", min_years_experience: "",
  languages_required: [], security_clearance: false, interview_required: false,
  interview_format: "video", interview_rounds: 1, technical_assessment: false,
};

function CaseDefaultsPanel({ profile, updateProfile }) {
  const [form, setForm]   = useState(CASE_DEFAULTS_EMPTY);
  const [saving, setSaving] = useState(false);
  const [langInput, setLangInput] = useState("");

  useEffect(() => {
    const d = profile?.case_defaults ?? {};
    setForm({
      priority:             d.priority             ?? "medium",
      area_sap:             d.area_sap             ?? "",
      area_industry:        d.area_industry        ?? "",
      is_confidential:      d.is_confidential      ?? false,
      nda_required:         d.nda_required         ?? false,
      description:          d.description          ?? "",
      sla:                  d.sla                  ?? "standard",
      budget:               d.budget               ?? "",
      work_mode:            d.work_mode            ?? "remote",
      skills:               d.skills               ?? "",
      travel_required:      d.travel_required      ?? false,
      work_location:        d.work_location        ?? "",
      min_years_experience: d.min_years_experience ?? "",
      languages_required:   d.languages_required   ?? [],
      security_clearance:   d.security_clearance   ?? false,
      interview_required:   d.interview_required   ?? false,
      interview_format:     d.interview_format     ?? "video",
      interview_rounds:     d.interview_rounds     ?? 1,
      technical_assessment: d.technical_assessment ?? false,
    });
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try { await updateProfile({ case_defaults: form }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  function addLang(val) {
    const v = val.trim();
    if (!v || form.languages_required.includes(v)) return;
    setForm(p => ({ ...p, languages_required: [...p.languages_required, v] }));
    setLangInput("");
  }

  const sectionHdr = txt => (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{txt}</p>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <h2 className="font-bold text-gray-900">Case Defaults</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          These values pre-fill every field when a case is created in <span className="font-medium text-blue-600">Express mode</span>.
        </p>
      </div>

      {/* Case Info defaults */}
      <div>
        {sectionHdr("Case Information")}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Default Priority" value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              options={["low","medium","high","critical"].map(v => ({ value: v, label: cap(v) }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default SAP Area</label>
              <select value={form.area_sap} onChange={e => setForm(p => ({ ...p, area_sap: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— None —</option>
                {SAP_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Industry</label>
            <select value={form.area_industry} onChange={e => setForm(p => ({ ...p, area_industry: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— None —</option>
              {INDUSTRY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <Textarea label="Default Description Template" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Default description or template shown when a case is created…" />
          <div className="flex gap-6">
            {[["is_confidential","Private cases by default"],["nda_required","NDA required by default"]].map(([k,lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Scope defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr("Scope")}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default SLA</label>
              <select value={form.sla} onChange={e => setForm(p => ({ ...p, sla: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SLA_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Input label="Default Budget ($)" type="number" value={form.budget}
              onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="e.g. 50000" />
          </div>
          <Input label="Default Skills (comma-separated)" value={form.skills}
            onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
            placeholder="SAP S/4HANA, ABAP, Fiori" />
        </div>
      </div>

      {/* Work arrangement defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr("Work Arrangement")}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "remote", label: "Remote",  desc: "Fully remote" },
              { value: "onsite", label: "On-site", desc: "At client location" },
              { value: "hybrid", label: "Hybrid",  desc: "Mixed" },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => setForm(p => ({ ...p, work_mode: opt.value }))}
                className={`text-left p-3 border-2 rounded-xl transition-all ${form.work_mode === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {(form.work_mode === "onsite" || form.work_mode === "hybrid") && (
            <Input label="Default Location" value={form.work_location}
              onChange={e => setForm(p => ({ ...p, work_location: e.target.value }))} placeholder="e.g. Toronto, Canada" />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.travel_required} onChange={e => setForm(p => ({ ...p, travel_required: e.target.checked }))} className="rounded accent-blue-600" />
            Travel required by default
          </label>
        </div>
      </div>

      {/* Qualifications defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr("Qualifications")}
        <div className="space-y-3">
          <Input label="Min Years of Experience" type="number" value={form.min_years_experience}
            onChange={e => setForm(p => ({ ...p, min_years_experience: e.target.value }))} placeholder="e.g. 3" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Languages</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.languages_required.map(l => (
                <span key={l} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {l}
                  <button onClick={() => setForm(p => ({ ...p, languages_required: p.languages_required.filter(x => x !== l) }))}
                    className="hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
            </div>
            <input value={langInput} onChange={e => setLangInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLang(langInput); } }}
              placeholder="Type a language and press Enter"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.security_clearance} onChange={e => setForm(p => ({ ...p, security_clearance: e.target.checked }))} className="rounded accent-blue-600" />
            Security clearance required by default
          </label>
        </div>
      </div>

      {/* Interview defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr("Interview")}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.interview_required} onChange={e => setForm(p => ({ ...p, interview_required: e.target.checked }))} className="rounded accent-blue-600" />
            Interview required by default
          </label>
          {form.interview_required && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Default Format</p>
                <div className="grid grid-cols-3 gap-2">
                  {[["phone","Phone"],["video","Video"],["in_person","In Person"]].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm(p => ({ ...p, interview_format: v }))}
                      className={`py-2 text-xs font-medium border-2 rounded-xl transition-all ${form.interview_format === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Default Rounds</p>
                <div className="flex gap-2">
                  {[1,2,3].map(n => (
                    <button key={n} type="button" onClick={() => setForm(p => ({ ...p, interview_rounds: n }))}
                      className={`w-10 h-10 rounded-xl border-2 text-sm font-bold transition-all ${form.interview_rounds === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.technical_assessment} onChange={e => setForm(p => ({ ...p, technical_assessment: e.target.checked }))} className="rounded accent-blue-600" />
                Technical assessment required by default
              </label>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : "Save Defaults"}
        </button>
      </div>
    </div>
  );
}

function useClientProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data: updated, error } = await supabase
      .from("client_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      const { error: ie } = await supabase
        .from("client_profiles")
        .insert({ id: userId, ...updates });
      if (ie) throw new Error(`Profile create failed: ${ie.message}`);
    }
    await fetchProfile();
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}

function ClientProfileView({ auth }) {
  const { profile, loading, updateProfile } = useClientProfile(auth.user?.id);
  const { sla, updateSla }                  = useSlaConfig(auth.user?.id);
  const { connections, addConnection, deleteConnection } = useDbConnections(auth.user?.id);
  const { members, addMember }              = useClientTeamMembers(auth.user?.id);

  const [tab, setTab]         = useState("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);

  // DB connection form
  const [showAddConn, setShowAddConn] = useState(false);
  const [connForm, setConnForm] = useState({ db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "" });
  const [savingConn, setSavingConn] = useState(false);

  // Team member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
  const [savingMember, setSavingMember] = useState(false);

  // SLA edit
  const [slaEditing, setSlaEditing]   = useState(false);
  const [slaForm, setSlaForm]         = useState({ tier: "standard", uptime_guarantee_pct: 99, dedicated_consultant: false, priority_support: false, notes: "" });
  const [slaCaseTypes, setSlaCaseTypes] = useState(SLA_DEFAULT_TYPES);
  const [slaMatrix, setSlaMatrix]     = useState(() => makeDefaultMatrix());
  const [savingSla, setSavingSla]     = useState(false);

  // Lifecycle config
  const { templates: lcTemplates, getTemplateStages } = useLifecycleTemplates();
  const [lifecycleMode, setLifecycleMode]       = useState("standard");
  const [allowProjOverride, setAllowProjOverride] = useState(true);
  const [allowCaseOverride, setAllowCaseOverride] = useState(true);
  const [savingLifecycle, setSavingLifecycle]   = useState(false);

  useEffect(() => {
    if (!editing) setForm({
      company_name:          profile?.company_name ?? "",
      industry:              profile?.industry ?? "",
      company_size:          profile?.company_size ?? "",
      founded_year:          profile?.founded_year ?? "",
      hq_location:           profile?.hq_location ?? "",
      website:               profile?.website ?? "",
      description:           profile?.description ?? "",
      contact_name:          profile?.contact_name ?? "",
      contact_title:         profile?.contact_title ?? "",
      contact_email:         profile?.contact_email ?? "",
      contact_phone:         profile?.contact_phone ?? "",
      linkedin_url:          profile?.linkedin_url ?? "",
      budget:                profile?.budget ?? "",
      _categories:           profile?.preferred_categories?.join(", ") ?? "",
      notes:                 profile?.notes ?? "",
    });
  }, [profile, editing]);

  useEffect(() => {
    if (sla && !slaEditing) {
      const m = sla.sla_matrix;
      setSlaForm({
        tier:                 sla.tier                 ?? "standard",
        uptime_guarantee_pct: sla.uptime_guarantee_pct ?? 99,
        dedicated_consultant: sla.dedicated_consultant ?? false,
        priority_support:     sla.priority_support     ?? false,
        notes:                sla.notes                ?? "",
      });
      const cts = m?.case_types ?? SLA_DEFAULT_TYPES;
      setSlaCaseTypes(cts);
      setSlaMatrix(m?.matrix ?? makeDefaultMatrix(cts.map(t => t.key)));
    }
  }, [sla, slaEditing]);

  async function handleSave() {
    setSaving(true);
    try {
      const { _categories, ...profileData } = form;
      await updateProfile({
        ...profileData,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        preferred_categories: _categories
          ? _categories.split(",").map(s => s.trim()).filter(Boolean)
          : [],
      });
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleSaveSla() {
    setSavingSla(true);
    try {
      await updateSla({ ...slaForm, sla_matrix: { case_types: slaCaseTypes, matrix: slaMatrix } });
      setSlaEditing(false);
    } catch (e) { alert(e.message); }
    setSavingSla(false);
  }

  useEffect(() => {
    if (profile?.case_lifecycle) {
      const lc = profile.case_lifecycle;
      setLifecycleMode(lc.preset ?? "standard");
      setAllowProjOverride(lc.allow_project_override ?? true);
      setAllowCaseOverride(lc.allow_case_override ?? true);
    }
  }, [profile]);

  async function handleSaveLifecycle() {
    setSavingLifecycle(true);
    try {
      await updateProfile({ case_lifecycle: {
        preset: lifecycleMode,
        allow_project_override: allowProjOverride,
        allow_case_override: allowCaseOverride,
      }});
    } catch (e) { alert(e.message); }
    setSavingLifecycle(false);
  }

  async function handleAddConn() {
    if (!connForm.host || !connForm.db_name) return;
    setSavingConn(true);
    try {
      await addConnection(connForm);
      setConnForm({ db_type: "postgresql", host: "", port: 5432, db_name: "", username: "", notes: "" });
      setShowAddConn(false);
    } catch (e) { alert(e.message); }
    setSavingConn(false);
  }

  async function handleAddMember() {
    if (!memberForm.full_name || !memberForm.email) return;
    setSavingMember(true);
    try {
      await addMember(memberForm);
      setMemberForm({ full_name: "", email: "", role_title: "", phone: "", is_primary: false });
      setShowAddMember(false);
    } catch (e) { alert(e.message); }
    setSavingMember(false);
  }

  if (loading) return <Spinner />;

  const tierColors = { standard: "bg-gray-100 text-gray-700", premium: "bg-blue-100 text-blue-700", enterprise: "bg-violet-100 text-blue-700" };
  const dbTypeColors = { postgresql: "bg-blue-100 text-blue-700", mysql: "bg-orange-100 text-orange-700", mssql: "bg-red-100 text-red-700", mongodb: "bg-green-100 text-green-700", other: "bg-gray-100 text-gray-700" };

  const tabs = [
    { id: "overview",     label: "Overview",     icon: Building2,         count: null },
    { id: "sla",          label: "SLA Config",   icon: SlidersHorizontal, count: null },
    { id: "connections",  label: "Connections",  icon: Database,          count: connections.length },
    { id: "team",         label: "Team",         icon: Users,             count: members.length },
    { id: "lifecycle",    label: "Lifecycle",    icon: TrendingUp,        count: null },
    { id: "defaults",     label: "Defaults",     icon: ClipboardList,     count: null },
  ];

  return (
    <div>
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {profile?.company_name?.[0] ?? auth.profile?.full_name?.[0] ?? "C"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {profile?.company_name || auth.profile?.full_name || "My Company"}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {[profile?.industry, profile?.hq_location].filter(Boolean).join(" · ") || "Edit your company profile below"}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {profile?.company_size && <Badge className="bg-gray-100 text-gray-600">{profile.company_size}</Badge>}
              {profile?.founded_year && <Badge className="bg-gray-100 text-gray-600">Est. {profile.founded_year}</Badge>}
              {profile?.budget && <Badge className="bg-green-100 text-green-700"><DollarSign className="w-3 h-3 inline mr-0.5" />{profile.budget}</Badge>}
            </div>
          </div>
          <button onClick={() => setEditing(p => !p)}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 flex-shrink-0">
            {editing ? "Cancel" : "Edit Profile"}
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-5">Edit Company Profile</h3>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Company Name" value={form.company_name}
              onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
            <Input label="Industry" value={form.industry}
              onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
              placeholder="e.g. Financial Services" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Company Size" value={form.company_size}
              onChange={e => setForm(p => ({ ...p, company_size: e.target.value }))}
              placeholder="e.g. 500–1,000 employees" />
            <Input label="Founded Year" type="number" value={form.founded_year}
              onChange={e => setForm(p => ({ ...p, founded_year: e.target.value }))} />
            <Input label="Headquarters" value={form.hq_location}
              onChange={e => setForm(p => ({ ...p, hq_location: e.target.value }))}
              placeholder="City, Country" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Website" value={form.website}
              onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
              placeholder="https://yourcompany.com" />
            <Input label="LinkedIn" value={form.linkedin_url}
              onChange={e => setForm(p => ({ ...p, linkedin_url: e.target.value }))}
              placeholder="https://linkedin.com/company/..." />
          </div>
          <Textarea label="Description" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What does your company do?" />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-1">Primary Contact</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Name" value={form.contact_name}
              onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            <Input label="Contact Title" value={form.contact_title}
              onChange={e => setForm(p => ({ ...p, contact_title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Email" type="email" value={form.contact_email}
              onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            <Input label="Contact Phone" value={form.contact_phone}
              onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-1">Consulting Preferences</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Annual Budget" value={form.budget}
              onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}
              placeholder="e.g. $500K annual consulting" />
            <Input label="Preferred Categories (comma-separated)" value={form._categories}
              onChange={e => setForm(p => ({ ...p, _categories: e.target.value }))}
              placeholder="Cloud, AI, ERP" />
          </div>
          <Textarea label="Internal Notes" value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Special requirements, vetting notes…" />

          <div className="flex justify-end gap-3 mt-2">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </div>
      )}

      {/* Icon Tiles */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all min-w-[80px] ${
                isActive
                  ? "bg-[#1A4B8C] border-[#1A4B8C] text-white shadow-md"
                  : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isActive ? "bg-white/20" : "bg-gray-100"}`}>
                <Icon size={14} className={isActive ? "text-white" : "text-gray-500"} />
              </div>
              <span className="text-xs font-medium">{t.label}</span>
              {t.count !== null && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {tab === "overview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          {profile?.description && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</div>
              <p className="text-gray-700 text-sm leading-relaxed">{profile.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {profile?.industry     && <div><span className="text-gray-400">Industry: </span><strong>{profile.industry}</strong></div>}
            {profile?.company_size && <div><span className="text-gray-400">Size: </span><strong>{profile.company_size}</strong></div>}
            {profile?.founded_year && <div><span className="text-gray-400">Founded: </span><strong>{profile.founded_year}</strong></div>}
            {profile?.hq_location  && <div><span className="text-gray-400">HQ: </span><strong>{profile.hq_location}</strong></div>}
            {profile?.budget       && <div><span className="text-gray-400">Budget: </span><strong>{profile.budget}</strong></div>}
          </div>

          <div className="flex gap-3 flex-wrap">
            {profile?.website && (
              <a href={profile.website} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Globe className="w-3.5 h-3.5 mr-1" /> Website
              </a>
            )}
            {profile?.linkedin_url && (
              <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Link className="w-3.5 h-3.5 mr-1" /> LinkedIn
              </a>
            )}
          </div>

          {profile?.preferred_categories?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preferred Consulting Areas</div>
              <div className="flex flex-wrap gap-2">
                {profile.preferred_categories.map(c => (
                  <span key={c} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Primary Contact</div>
            {profile?.contact_name ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                  {profile.contact_name[0]}
                </div>
                <div className="text-sm space-y-0.5">
                  <div className="font-semibold text-gray-900">{profile.contact_name}</div>
                  {profile.contact_title && <div className="text-gray-500">{profile.contact_title}</div>}
                  <div className="flex gap-4 text-gray-400 text-xs">
                    {profile.contact_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{profile.contact_email}</span>}
                    {profile.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{profile.contact_phone}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No contact set. Edit profile to add one.</p>
            )}
          </div>

          {profile?.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm">
              <div className="font-medium text-amber-800 mb-1">Notes</div>
              <p className="text-gray-700">{profile.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* SLA TAB */}
      {tab === "sla" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">SLA Configuration</h2>
              <p className="text-sm text-gray-400 mt-0.5">Service level targets by priority and case type</p>
            </div>
            <button onClick={() => setSlaEditing(p => !p)}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">
              {slaEditing ? "Cancel" : "Edit SLA"}
            </button>
          </div>

          {/* Header fields */}
          {slaEditing ? (
            <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <Select label="SLA Tier" value={slaForm.tier}
                  onChange={e => setSlaForm(p => ({ ...p, tier: e.target.value }))}
                  options={[{ value:"standard", label:"Standard" },{ value:"premium", label:"Premium" },{ value:"enterprise", label:"Enterprise" }]} />
                <Input label="Uptime Guarantee (%)" type="number" value={slaForm.uptime_guarantee_pct}
                  onChange={e => setSlaForm(p => ({ ...p, uptime_guarantee_pct: Number(e.target.value) }))} />
              </div>
              <div className="flex gap-6">
                {[["dedicated_consultant","Dedicated Consultant"],["priority_support","Priority Support"]].map(([k,lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={slaForm[k]} onChange={e => setSlaForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
          ) : sla ? (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <Badge className={tierColors[sla.tier] ?? tierColors.standard}>{cap(sla.tier)} Tier</Badge>
              {sla.uptime_guarantee_pct && <Badge className="bg-gray-100 text-gray-700">{sla.uptime_guarantee_pct}% Uptime</Badge>}
              {sla.priority_support    && <Badge className="bg-orange-100 text-orange-700">Priority Support</Badge>}
              {sla.dedicated_consultant && <Badge className="bg-green-100 text-green-700">Dedicated Consultant</Badge>}
            </div>
          ) : null}

          {/* Legend */}
          {!slaEditing && sla && (
            <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
              <span><span className="text-blue-400 mr-1">↩</span>Initial Response</span>
              <span><span className="text-green-500 mr-1">✓</span>Resolution</span>
            </div>
          )}

          {/* Matrix */}
          {(sla || slaEditing) ? (
            <SlaMatrixEditor caseTypes={slaCaseTypes} matrix={slaMatrix} editing={slaEditing}
              onChangeCaseTypes={setSlaCaseTypes} onChangeMatrix={setSlaMatrix} />
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="mb-2 flex justify-center"><FileText className="w-8 h-8 text-gray-300" /></div>
              <p className="text-sm mb-4">No SLA configured yet.</p>
              <button onClick={() => setSlaEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                Configure SLA
              </button>
            </div>
          )}

          {/* Notes + actions */}
          {slaEditing ? (
            <div className="mt-5 space-y-4">
              <Textarea label="Notes" value={slaForm.notes} onChange={e => setSlaForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional SLA terms…" />
              <div className="flex justify-end gap-3">
                <button onClick={() => setSlaEditing(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button onClick={handleSaveSla} disabled={savingSla}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingSla ? "Saving…" : "Save SLA"}
                </button>
              </div>
            </div>
          ) : sla?.notes ? (
            <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-gray-700">
              <div className="font-medium text-yellow-800 mb-1">Notes</div>
              {sla.notes}
            </div>
          ) : null}
        </div>
      )}

      {/* DB CONNECTIONS TAB */}
      {tab === "connections" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">Database Connections</h2>
              <p className="text-sm text-gray-400 mt-0.5">{connections.length} connection{connections.length !== 1 ? "s" : ""} configured</p>
            </div>
            <button onClick={() => setShowAddConn(p => !p)}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
              + Add Connection
            </button>
          </div>

          {showAddConn && (
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Database Type" value={connForm.db_type}
                  onChange={e => setConnForm(p => ({ ...p, db_type: e.target.value }))}
                  options={["postgresql","mysql","mssql","oracle","mongodb","other"].map(t => ({ value: t, label: t.toUpperCase() }))} />
                <Input label="Host / Server" value={connForm.host}
                  onChange={e => setConnForm(p => ({ ...p, host: e.target.value }))} placeholder="db.example.com" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Port" type="number" value={connForm.port}
                  onChange={e => setConnForm(p => ({ ...p, port: Number(e.target.value) }))} />
                <Input label="Database Name" value={connForm.db_name}
                  onChange={e => setConnForm(p => ({ ...p, db_name: e.target.value }))} />
                <Input label="Username" value={connForm.username}
                  onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} />
              </div>
              <Textarea label="Notes" value={connForm.notes}
                onChange={e => setConnForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="VPN requirements, access instructions…" />
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddConn(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button onClick={handleAddConn} disabled={savingConn}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingConn ? "Adding…" : "Add Connection"}
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
                    <span className="font-mono text-sm font-semibold text-gray-800">{conn.db_name}</span>
                  </div>
                  <button onClick={() => deleteConnection(conn.id)}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-100 hover:bg-red-50">
                    Remove
                  </button>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {conn.username && <span>{conn.username}@</span>}{conn.host}:{conn.port}
                </div>
                {conn.notes && <p className="text-xs text-gray-400 mt-2">{conn.notes}</p>}
              </div>
            ))}
            {connections.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Database className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">No database connections yet. Add one above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAM TAB */}
      {tab === "team" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-900">Team Members</h2>
              <p className="text-sm text-gray-400 mt-0.5">Stakeholders and points of contact</p>
            </div>
            <button onClick={() => setShowAddMember(p => !p)}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700">
              + Add Member
            </button>
          </div>

          {showAddMember && (
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Full Name" value={memberForm.full_name}
                  onChange={e => setMemberForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Jane Smith" />
                <Input label="Email" type="email" value={memberForm.email}
                  onChange={e => setMemberForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Role / Title" value={memberForm.role_title}
                  onChange={e => setMemberForm(p => ({ ...p, role_title: e.target.value }))} placeholder="IT Manager" />
                <Input label="Phone" value={memberForm.phone}
                  onChange={e => setMemberForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={memberForm.is_primary}
                  onChange={e => setMemberForm(p => ({ ...p, is_primary: e.target.checked }))}
                  className="rounded accent-blue-600" />
                Primary contact
              </label>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddMember(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button onClick={handleAddMember} disabled={savingMember}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {savingMember ? "Adding…" : "Add Member"}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {members.map(m => (
              <div key={m.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                    {m.full_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{m.full_name}</span>
                      {m.is_primary && <Badge className="bg-blue-100 text-blue-700">Primary</Badge>}
                    </div>
                    {m.role_title && <div className="text-xs text-gray-500">{m.role_title}</div>}
                  </div>
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  {m.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" />{m.email}</div>}
                  {m.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{m.phone}</div>}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400">
                <div className="mb-2 flex justify-center"><Users className="w-8 h-8 text-gray-300" /></div>
                <p className="text-sm">No team members added yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIFECYCLE TAB */}
      {tab === "lifecycle" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Case Lifecycle</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Choose the lifecycle template for cases under your account. Stage sequences are managed by your TechCase administrator.
            </p>
          </div>

          {/* Template preset cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(lcTemplates.length ? lcTemplates : Object.entries(LIFECYCLE_PRESETS).map(([k, v]) => ({ key: k, ...v }))).map(tmpl => {
              const isSelected = lifecycleMode === tmpl.key;
              const active = tmpl.stages.filter(s => !s.is_terminal);
              return (
                <button key={tmpl.key} onClick={() => setLifecycleMode(tmpl.key)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected ? "border-[#1A4B8C] bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-900">{tmpl.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{tmpl.subtitle}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{tmpl.description}</p>
                  <div className="flex flex-wrap gap-1 items-center">
                    {active.map((s, i) => (
                      <span key={s.key} className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: s.color + "22", color: s.color }}>{s.label}</span>
                        {i < active.length - 1 && <span className="text-gray-300 text-[10px]">›</span>}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Flow preview */}
          {(() => {
            const stages = getTemplateStages(lifecycleMode);
            const active = stages.filter(s => !s.is_terminal);
            const terminal = stages.filter(s => s.is_terminal);
            return (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Flow Preview</p>
                <div className="flex items-center flex-wrap gap-2">
                  {active.map((s, i) => (
                    <span key={s.key} className="flex items-center gap-2">
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                        style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                      {i < active.length - 1 && <span className="text-gray-300 text-sm">→</span>}
                    </span>
                  ))}
                  {terminal.length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="text-gray-300 text-sm">→</span>
                      {terminal.map(s => (
                        <span key={s.key} className="px-3 py-1.5 text-xs font-semibold rounded-xl"
                          style={{ backgroundColor: s.color + "20", color: s.color }}>{s.label}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Override toggles */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Override Permissions</p>
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium text-gray-700">Allow projects to change template</p>
                <p className="text-xs text-gray-400">Projects under your account can pick a different lifecycle template</p>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-4 ${allowProjOverride ? "bg-[#1A4B8C]" : "bg-gray-200"}`}
                onClick={() => setAllowProjOverride(p => !p)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allowProjOverride ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium text-gray-700">Allow cases to change template</p>
                <p className="text-xs text-gray-400">Individual cases can pick a different lifecycle template</p>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-4 ${allowCaseOverride ? "bg-[#1A4B8C]" : "bg-gray-200"}`}
                onClick={() => setAllowCaseOverride(p => !p)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allowCaseOverride ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleSaveLifecycle} disabled={savingLifecycle}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {savingLifecycle ? "Saving…" : "Save Lifecycle"}
            </button>
          </div>
        </div>
      )}

      {tab === "defaults" && (
        <CaseDefaultsPanel profile={profile} updateProfile={updateProfile} />
      )}
    </div>
  );
}

// ============================================================
// V9: INVOICES VIEW
// ============================================================
function InvoicesView({ auth }) {
  const clientFilter = auth.isClient ? { client_id: auth.user?.id } : {};
  const { invoices, loading, createInvoice, updateInvoice, deleteInvoice } = useInvoices(clientFilter);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "" });
  const [saving, setSaving]             = useState(false);
  const [cases, setCases]               = useState([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title, client_id").order("title");
      if (auth.isClient) q = q.eq("client_id", auth.user?.id);
      const { data } = await q;
      setCases(data ?? []);
    })();
  }, [auth]);

  const displayed = statusFilter ? invoices.filter(i => i.status === statusFilter) : invoices;
  const totalBilled      = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalPaid        = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOutstanding = invoices.filter(i => ["sent","overdue"].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0);

  async function handleCreate() {
    setSaving(true);
    try {
      await createInvoice({
        ...form,
        amount: Number(form.amount),
        client_id: auth.isClient ? auth.user?.id : form.client_id,
        invoice_number: form.invoice_number || `INV-${Date.now()}`,
      });
      setShowCreate(false);
      setForm({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "" });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            + New Invoice
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Billed",  value: `$${totalBilled.toLocaleString()}`,      color: "bg-blue-50 text-blue-700" },
          { label: "Paid",          value: `$${totalPaid.toLocaleString()}`,         color: "bg-green-50 text-green-700" },
          { label: "Outstanding",   value: `$${totalOutstanding.toLocaleString()}`,  color: "bg-orange-50 text-orange-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Case</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Due Date</th>
              {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {displayed.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-sm text-gray-700">{inv.invoice_number || `INV-${inv.id?.slice(0,8)}`}</td>
                <td className="px-5 py-4">
                  <div className="font-medium text-gray-900">{inv.client?.client_profiles?.company_name ?? inv.client?.full_name ?? "—"}</div>
                </td>
                <td className="px-5 py-4 text-gray-500">{inv.case?.title ?? "—"}</td>
                <td className="px-5 py-4 font-semibold text-gray-900">${(inv.amount ?? 0).toLocaleString()}</td>
                <td className="px-5 py-4">
                  <Badge className={INVOICE_STATUS_COLORS[inv.status] ?? INVOICE_STATUS_COLORS.draft}>{cap(inv.status)}</Badge>
                </td>
                <td className="px-5 py-4 text-gray-500">{fmtDate(inv.due_date)}</td>
                {(auth.isAdmin || auth.isManager) && (
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      {inv.status === "draft" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "sent" })}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100 hover:bg-blue-100">
                          Send
                        </button>
                      )}
                      {inv.status === "sent" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "paid" })}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-100 hover:bg-green-100">
                          Mark Paid
                        </button>
                      )}
                      {(inv.status === "sent" || inv.status === "draft") && (
                        <button onClick={() => updateInvoice(inv.id, { status: "overdue" })}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded border border-red-100 hover:bg-red-100">
                          Overdue
                        </button>
                      )}
                      <button onClick={() => deleteInvoice(inv.id)}
                        className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded border border-gray-100 hover:bg-gray-100">
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">No invoices found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Invoice">
        <Input label="Invoice Number" value={form.invoice_number}
          onChange={e => setForm(p => ({ ...p, invoice_number: e.target.value }))}
          placeholder="INV-2024-001" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount ($)" type="number" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          <Select label="Status" value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            options={["draft","sent","paid","overdue"].map(s => ({ value: s, label: cap(s) }))} />
        </div>
        <Input label="Due Date" type="date" value={form.due_date}
          onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Case</label>
          <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">— Select case (optional) —</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <Textarea label="Notes" value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Payment terms, line items…" />
        <div className="flex justify-end gap-3 mt-2">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// V9: KANBAN VIEW
// ============================================================
const KANBAN_COLUMNS = [
  { id: "open",        label: "Open",        headerColor: "border-t-emerald-400", bg: "bg-emerald-50/50" },
  { id: "in_progress", label: "In Progress",  headerColor: "border-t-blue-400",   bg: "bg-blue-50/50" },
  { id: "on_hold",     label: "On Hold",      headerColor: "border-t-yellow-400", bg: "bg-yellow-50/50" },
  { id: "completed",   label: "Completed",    headerColor: "border-t-gray-300",   bg: "bg-gray-50/50" },
];

function KanbanView({ auth }) {
  const { cases, loading, updateCase } = useCases();
  const [selectedCase, setSelectedCase] = useState(null);
  const [movingId, setMovingId]         = useState(null);

  const filteredCases = cases.filter(c => {
    if (auth.isClient)     return c.client_id === auth.user?.id;
    if (auth.isConsultant) return c.case_assignments?.some(a => a.consultant_id === auth.user?.id);
    if (auth.isKeyUser)    return c.case_key_users?.some(ku => ku.user_id === auth.user?.id);
    return true;
  });

  async function handleMove(caseId, newStatus) {
    if (newStatus === cases.find(c => c.id === caseId)?.status) return;
    setMovingId(caseId);
    try { await updateCase(caseId, { status: newStatus }); }
    catch (e) { alert(e.message); }
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kanban Board</h1>
        <p className="text-gray-500 text-sm mt-1">Visual case pipeline · {filteredCases.length} cases</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {KANBAN_COLUMNS.map(col => {
          const colCases = filteredCases.filter(c => c.status === col.id);
          return (
            <div key={col.id} className={`rounded-2xl border-t-4 ${col.headerColor} ${col.bg} border border-gray-100 shadow-sm`}>
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <span className="font-semibold text-gray-800 text-sm">{col.label}</span>
                <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-100">{colCases.length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-20">
                {colCases.map(c => (
                  <div key={c.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedCase(c)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-900 line-clamp-2 flex-1">{c.title}</span>
                      <Badge className={`${PRIORITY_COLORS[c.priority]} flex-shrink-0 text-xs`}>{cap(c.priority)?.[0]}</Badge>
                    </div>
                    {c.client?.client_profiles?.company_name && (
                      <div className="text-xs text-gray-400 mb-2">{c.client.client_profiles.company_name}</div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex -space-x-1">
                        {(c.case_assignments ?? []).slice(0, 3).map((a, i) => (
                          <div key={i} className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center border-2 border-white font-bold">
                            {a.users?.full_name?.[0] ?? "?"}
                          </div>
                        ))}
                      </div>
                      {c.due_date && <span className="text-xs text-gray-400">{fmtDate(c.due_date)}</span>}
                    </div>
                    {(auth.isAdmin || auth.isManager) && (
                      <div className="mt-2 pt-2 border-t border-gray-50" onClick={e => e.stopPropagation()}>
                        <select disabled={movingId === c.id}
                          value={c.status}
                          onChange={e => handleMove(c.id, e.target.value)}
                          className="w-full text-xs border border-gray-100 rounded-lg px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50">
                          {KANBAN_COLUMNS.map(col2 => (
                            <option key={col2.id} value={col2.id}>{col2.label}</option>
                          ))}
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
                {colCases.length === 0 && (
                  <div className="text-center py-6 text-gray-300 text-xs">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ============================================================
// V9: TIME ENTRIES VIEW
// ============================================================
function TimeEntriesView({ auth }) {
  const { entries, loading, addTimeEntry, approveEntry, deleteEntry } = useTimeEntries();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ case_id: "", date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true });
  const [saving, setSaving]     = useState(false);
  const [cases, setCases]       = useState([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title").order("title");
      if (auth.isConsultant) {
        const { data: assignments } = await supabase.from("case_assignments")
          .select("case_id").eq("consultant_id", auth.user?.id);
        const ids = (assignments ?? []).map(a => a.case_id);
        if (ids.length) q = q.in("id", ids); else { setCases([]); return; }
      }
      const { data } = await q;
      setCases(data ?? []);
    })();
  }, [auth]);

  const filtered = entries.filter(e => {
    if (auth.isConsultant && e.consultant_id !== auth.user?.id) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    return true;
  });

  const totalH    = filtered.reduce((s, e) => s + (e.hours ?? 0), 0);
  const billableH = filtered.filter(e => e.is_billable).reduce((s, e) => s + (e.hours ?? 0), 0);

  async function handleAdd() {
    if (!form.hours || !form.description.trim()) return;
    setSaving(true);
    try {
      await addTimeEntry({ ...form, hours: Number(form.hours) });
      setForm({ case_id: "", date: new Date().toISOString().slice(0, 10), hours: 1, description: "", is_billable: true });
      setShowForm(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Entries</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} entries · {totalH.toFixed(1)}h total · {billableH.toFixed(1)}h billable
          </p>
        </div>
        {auth.isConsultant && (
          <button onClick={() => setShowForm(p => !p)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            + Log Time
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="self-center text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            Clear
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Log Time Entry</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Case</label>
            <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— Select case —</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <Input label="Hours" type="number" min="0.25" step="0.25" value={form.hours}
              onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
          </div>
          <Textarea label="Description" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Describe what you worked on…" />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-4">
            <input type="checkbox" checked={form.is_billable}
              onChange={e => setForm(p => ({ ...p, is_billable: e.target.checked }))}
              className="rounded accent-blue-600" />
            Billable
          </label>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Log Time"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState Icon={Clock} title="No time entries" subtitle={auth.isConsultant ? "Log your first entry above" : "No entries logged yet"} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                {!auth.isConsultant && <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Consultant</th>}
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Case</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Hours</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Billable</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Approved</th>
                {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                  {!auth.isConsultant && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">
                          {e.consultant?.full_name?.[0]}
                        </div>
                        <span className="text-gray-700">{e.consultant?.full_name}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-3 text-gray-500">{e.case?.title ?? "—"}</td>
                  <td className="px-5 py-3 font-semibold text-blue-700">{e.hours}h</td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{e.description}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.is_billable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {e.is_billable ? "Billable" : "Non-billable"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {e.is_approved
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Approved</span>
                      : (auth.isAdmin || auth.isManager)
                        ? <button onClick={() => approveEntry(e.id, true)}
                            className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100">
                            Approve
                          </button>
                        : <span className="text-xs text-gray-400">Pending</span>
                    }
                  </td>
                  {(auth.isAdmin || auth.isManager) && (
                    <td className="px-5 py-3">
                      <button onClick={() => deleteEntry(e.id)}
                        className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-0.5 rounded hover:bg-red-50">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONSULTANT ONBOARDING WIZARD
// ============================================================

const ONBOARDING_STEPS = [
  { id: "basics",    label: "Basic Info",          Icon: User,      desc: "Headline, bio & rates" },
  { id: "workauth",  label: "Work Authorization",  Icon: Globe,     desc: "Countries you can work in" },
  { id: "customers", label: "Past Customers",      Icon: Briefcase, desc: "Employer & client history" },
  { id: "projects",  label: "Projects",            Icon: Rocket,    desc: "Portfolio & past work" },
  { id: "skills",    label: "Skills",              Icon: Zap,       desc: "Technical expertise" },
];

function OnboardingRoadmap({ steps, current }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
      <div className="relative flex items-start justify-between">
        {/* Connector line behind circles */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200 z-0" />
        {steps.map((s, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center flex-1 gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                done   ? "bg-emerald-500 text-white shadow"
                       : active ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-100"
                                : "bg-white border-2 border-gray-200 text-gray-400"}`}>
                {done ? <Check className="w-4 h-4" /> : <s.Icon className="w-4 h-4" />}
              </div>
              <div className="text-center px-1">
                <div className={`text-xs font-semibold leading-tight ${
                  active ? "text-blue-600" : done ? "text-emerald-600" : "text-gray-400"}`}>
                  {s.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Mini progress bar */}
      <div className="mt-5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${(current / (steps.length - 1)) * 100}%` }} />
      </div>
      <p className="text-xs text-gray-400 text-right mt-1">
        Step {current + 1} of {steps.length}
      </p>
    </div>
  );
}

function ConsultantOnboardingView({ auth, onComplete }) {
  const { profile, loading, updateProfile, addCustomer, addProject, addWorkAuth } =
    useConsultantProfile(auth.user?.id);

  const [step, setSt]    = useState(0);
  const [saving, setSaving] = useState(false);

  const [basicsForm, setBasicsForm] = useState({
    headline: "", bio: "", linkedin_url: "",
    hourly_rate: "", years_experience: 0,
    external_occupancy_pct: 0, travel_available: false,
    expertise_level: "mid", availability_type: "project_based",
  });
  const [authForm, setAuthForm]   = useState({ country_name: "", country_code: "", auth_type: "citizen" });
  const [custForm, setCustForm]   = useState({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" });
  const [projForm, setProjForm]   = useState({ title: "", client_name: "", url: "", description: "", _tech: "" });
  const [skillInput, setSkillInput] = useState("");

  useEffect(() => {
    if (profile) {
      setBasicsForm(f => ({
        ...f,
        headline:               profile.headline               ?? f.headline,
        bio:                    profile.bio                    ?? f.bio,
        linkedin_url:           profile.linkedin_url           ?? f.linkedin_url,
        hourly_rate:            profile.hourly_rate            ?? f.hourly_rate,
        years_experience:       profile.years_experience       ?? f.years_experience,
        external_occupancy_pct: profile.external_occupancy_pct ?? f.external_occupancy_pct,
        travel_available:       profile.travel_available       ?? f.travel_available,
        expertise_level:        profile.expertise_level        ?? f.expertise_level,
        availability_type:      profile.availability_type      ?? f.availability_type,
      }));
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  const total  = ONBOARDING_STEPS.length;
  const isLast = step === total - 1;

  async function saveBasics() {
    setSaving(true);
    try {
      await updateProfile({
        ...basicsForm,
        hourly_rate:            basicsForm.hourly_rate ? Number(basicsForm.hourly_rate) : null,
        years_experience:       Number(basicsForm.years_experience) || 0,
        external_occupancy_pct: Number(basicsForm.external_occupancy_pct) || 0,
      });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleNext() {
    if (step === 0) await saveBasics();
    if (!isLast) setSt(s => s + 1);
    else onComplete();
  }

  function skip() {
    if (!isLast) setSt(s => s + 1);
    else onComplete();
  }

  async function handleAddWorkAuth() {
    if (!authForm.country_name) return;
    setSaving(true);
    try { await addWorkAuth(authForm); setAuthForm({ country_name: "", country_code: "", auth_type: "citizen" }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddCustomer() {
    if (!custForm.company_name) return;
    setSaving(true);
    try { await addCustomer(custForm); setCustForm({ company_name: "", role_held: "", start_date: "", end_date: "", description: "" }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddProject() {
    if (!projForm.title) return;
    setSaving(true);
    try {
      const { _tech, ...rest } = projForm;
      await addProject({ ...rest, tech_stack: _tech.split(",").map(s => s.trim()).filter(Boolean) });
      setProjForm({ title: "", client_name: "", url: "", description: "", _tech: "" });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleAddSkill() {
    const val = skillInput.trim();
    if (!val) return;
    setSaving(true);
    try {
      const current = profile?.skills ?? [];
      if (!current.includes(val)) await updateProfile({ skills: [...current, val] });
      setSkillInput("");
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-xl font-bold">TC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
        <p className="text-gray-500 mt-1 text-sm">Help clients find and evaluate you — takes about 5 minutes.</p>
      </div>

      <OnboardingRoadmap steps={ONBOARDING_STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Basic Info ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Basic Information</h2>
            <p className="text-sm text-gray-500 mb-5">This is the first thing clients see about you.</p>
            <Input label="Professional Headline *" value={basicsForm.headline}
              onChange={e => setBasicsForm(p => ({ ...p, headline: e.target.value }))}
              placeholder="Senior SAP Consultant & Solution Architect" />
            <Textarea label="Bio" value={basicsForm.bio}
              onChange={e => setBasicsForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="Tell clients about your background and expertise…" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Hourly Rate ($)" type="number" value={basicsForm.hourly_rate}
                onChange={e => setBasicsForm(p => ({ ...p, hourly_rate: e.target.value }))} />
              <Input label="Years of Experience" type="number" value={basicsForm.years_experience}
                onChange={e => setBasicsForm(p => ({ ...p, years_experience: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Expertise Level" value={basicsForm.expertise_level}
                onChange={e => setBasicsForm(p => ({ ...p, expertise_level: e.target.value }))}
                options={[
                  { value: "junior", label: "Junior" },
                  { value: "mid",    label: "Mid-Level" },
                  { value: "senior", label: "Senior" },
                  { value: "lead",   label: "Lead / Principal" },
                ]} />
              <Select label="Availability Type" value={basicsForm.availability_type}
                onChange={e => setBasicsForm(p => ({ ...p, availability_type: e.target.value }))}
                options={[
                  { value: "full_time",     label: "Full-Time" },
                  { value: "part_time",     label: "Part-Time" },
                  { value: "contract",      label: "Contract" },
                  { value: "project_based", label: "Project-Based" },
                ]} />
            </div>
            <Input label="LinkedIn URL" value={basicsForm.linkedin_url}
              onChange={e => setBasicsForm(p => ({ ...p, linkedin_url: e.target.value }))}
              placeholder="https://linkedin.com/in/yourprofile" />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                External Occupancy: {basicsForm.external_occupancy_pct}%
              </label>
              <input type="range" min="0" max="100" value={basicsForm.external_occupancy_pct}
                onChange={e => setBasicsForm(p => ({ ...p, external_occupancy_pct: Number(e.target.value) }))}
                className="w-full accent-blue-600" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={basicsForm.travel_available}
                onChange={e => setBasicsForm(p => ({ ...p, travel_available: e.target.checked }))}
                className="rounded accent-blue-600" />
              Available for travel
            </label>
          </>
        )}

        {/* ── Step 1: Work Authorization ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Work Authorization</h2>
            <p className="text-sm text-gray-500 mb-5">Add the countries where you're legally authorized to work.</p>
            {(profile?.work_authorizations?.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {profile.work_authorizations.map(w => (
                  <div key={w.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-2xl">{w.country_code === "US" ? "🇺🇸" : w.country_code === "GB" ? "🇬🇧" : "🌐"}</span>
                    <div>
                      <div className="text-sm font-medium">{w.country_name}</div>
                      <div className="text-xs text-gray-400 capitalize">{fmt(w.auth_type)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={`${(profile?.work_authorizations?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add a Country</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Country Name" value={authForm.country_name}
                  onChange={e => setAuthForm(p => ({ ...p, country_name: e.target.value }))}
                  placeholder="United States" />
                <Input label="Code" value={authForm.country_code}
                  onChange={e => setAuthForm(p => ({ ...p, country_code: e.target.value.toUpperCase() }))}
                  placeholder="US" />
                <Select label="Auth Type" value={authForm.auth_type}
                  onChange={e => setAuthForm(p => ({ ...p, auth_type: e.target.value }))}
                  options={[
                    { value: "citizen",            label: "Citizen" },
                    { value: "permanent_resident", label: "Perm. Resident" },
                    { value: "work_visa",          label: "Work Visa" },
                    { value: "other",              label: "Other" },
                  ]} />
              </div>
              <button onClick={handleAddWorkAuth} disabled={saving || !authForm.country_name}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? "Saving…" : "+ Add Country"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Past Customers ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Past Customers</h2>
            <p className="text-sm text-gray-500 mb-5">Add companies or clients you've worked with.</p>
            {(profile?.consultant_customers?.length ?? 0) > 0 && (
              <div className="space-y-3 mb-5">
                {profile.consultant_customers.map(c => (
                  <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="font-medium text-gray-900">{c.company_name}</div>
                    {c.role_held && <div className="text-sm text-gray-500">{c.role_held}</div>}
                    {(c.start_date || c.end_date) && (
                      <div className="text-xs text-gray-400 mt-1">
                        {fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : "Present"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`${(profile?.consultant_customers?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add a Customer</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Company Name" value={custForm.company_name}
                  onChange={e => setCustForm(p => ({ ...p, company_name: e.target.value }))} />
                <Input label="Role Held" value={custForm.role_held}
                  onChange={e => setCustForm(p => ({ ...p, role_held: e.target.value }))} />
                <Input label="Start Date" type="date" value={custForm.start_date}
                  onChange={e => setCustForm(p => ({ ...p, start_date: e.target.value }))} />
                <Input label="End Date" type="date" value={custForm.end_date}
                  onChange={e => setCustForm(p => ({ ...p, end_date: e.target.value }))}/>
              </div>
              <Textarea label="Description" value={custForm.description}
                onChange={e => setCustForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddCustomer} disabled={saving || !custForm.company_name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? "Saving…" : "+ Add Customer"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Projects ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Projects</h2>
            <p className="text-sm text-gray-500 mb-5">Showcase portfolio projects and past deliverables.</p>
            {(profile?.consultant_projects?.length ?? 0) > 0 && (
              <div className="space-y-3 mb-5">
                {profile.consultant_projects.map(p => (
                  <div key={p.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{p.title}</div>
                        {p.client_name && <div className="text-xs text-gray-400">{p.client_name}</div>}
                      </div>
                      {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View →</a>}
                    </div>
                    {p.tech_stack?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.tech_stack.map(s => <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{s}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`${(profile?.consultant_projects?.length ?? 0) > 0 ? "border-t border-gray-100 pt-5" : ""}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add a Project</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Title" value={projForm.title}
                  onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))} />
                <Input label="Client Name" value={projForm.client_name}
                  onChange={e => setProjForm(p => ({ ...p, client_name: e.target.value }))} />
                <Input label="URL" value={projForm.url}
                  onChange={e => setProjForm(p => ({ ...p, url: e.target.value }))} />
                <Input label="Tech Stack (comma-separated)" value={projForm._tech}
                  onChange={e => setProjForm(p => ({ ...p, _tech: e.target.value }))} />
              </div>
              <Textarea label="Description" value={projForm.description}
                onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
              <button onClick={handleAddProject} disabled={saving || !projForm.title}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? "Saving…" : "+ Add Project"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Skills ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Skills</h2>
            <p className="text-sm text-gray-500 mb-5">Add your technical skills and areas of expertise.</p>
            {(profile?.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {profile.skills.map(s => (
                  <span key={s} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">{s}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddSkill(); } }}
                placeholder="e.g. SAP S/4HANA, React, Python…"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleAddSkill} disabled={saving || !skillInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? "…" : "+ Add"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : null}
          className={`px-4 py-2 text-sm border border-gray-200 rounded-xl transition-colors ${
            step > 0 ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : "invisible"}`}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button onClick={skip} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
              Skip
            </button>
          )}
          <button onClick={handleNext}
            disabled={saving || (step === 0 && !basicsForm.headline.trim())}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : isLast ? "Complete Profile →" : step === 0 ? "Save & Continue →" : "Continue →"}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        <button onClick={onComplete} className="hover:text-gray-600 underline underline-offset-2">
          Skip all and go to profile
        </button>
      </p>
    </div>
  );
}

// ============================================================
// CLIENT ONBOARDING WIZARD
// ============================================================

const ONBOARDING_STEPS_CLIENT = [
  { id: "company", label: "Company Info",    Icon: Building2,         desc: "Basic company details" },
  { id: "contact", label: "Primary Contact", Icon: Phone,             desc: "Who we'll work with" },
  { id: "prefs",   label: "Preferences",     Icon: SlidersHorizontal, desc: "Consulting needs & budget" },
];

function ClientOnboardingView({ auth, onComplete }) {
  const { profile, loading, updateProfile } = useClientProfile(auth.user?.id);
  const [step, setSt]   = useState(0);
  const [saving, setSaving] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    company_name: "", industry: "", company_size: "",
    founded_year: "", hq_location: "", website: "", description: "",
  });
  const [contactForm, setContactForm] = useState({
    contact_name: "", contact_title: "", contact_email: "", contact_phone: "",
  });
  const [prefsForm, setPrefsForm] = useState({
    budget: "", _categories: "", notes: "",
  });

  useEffect(() => {
    if (profile) {
      setCompanyForm(f => ({
        company_name:  profile.company_name  ?? f.company_name,
        industry:      profile.industry      ?? f.industry,
        company_size:  profile.company_size  ?? f.company_size,
        founded_year:  profile.founded_year  ?? f.founded_year,
        hq_location:   profile.hq_location   ?? f.hq_location,
        website:       profile.website       ?? f.website,
        description:   profile.description   ?? f.description,
      }));
      setContactForm(f => ({
        contact_name:  profile.contact_name  ?? f.contact_name,
        contact_title: profile.contact_title ?? f.contact_title,
        contact_email: profile.contact_email ?? f.contact_email,
        contact_phone: profile.contact_phone ?? f.contact_phone,
      }));
      setPrefsForm(f => ({
        budget:       profile.budget                          ?? f.budget,
        _categories:  profile.preferred_categories?.join(", ") ?? f._categories,
        notes:        profile.notes                           ?? f.notes,
      }));
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;

  const total  = ONBOARDING_STEPS_CLIENT.length;
  const isLast = step === total - 1;

  async function handleNext() {
    setSaving(true);
    try {
      if (step === 0) {
        await updateProfile({
          ...companyForm,
          founded_year: companyForm.founded_year ? Number(companyForm.founded_year) : null,
        });
      } else if (step === 1) {
        await updateProfile(contactForm);
      } else {
        const { _categories, ...rest } = prefsForm;
        await updateProfile({
          ...rest,
          preferred_categories: _categories.split(",").map(s => s.trim()).filter(Boolean),
        });
      }
      if (!isLast) setSt(s => s + 1);
      else onComplete();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  function skip() { if (!isLast) setSt(s => s + 1); else onComplete(); }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-xl font-bold">TC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Set Up Your Company Profile</h1>
        <p className="text-gray-500 mt-1 text-sm">Help consultants understand your needs — takes 3 minutes.</p>
      </div>

      <OnboardingRoadmap steps={ONBOARDING_STEPS_CLIENT} current={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* ── Step 0: Company Info ── */}
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Company Information</h2>
            <p className="text-sm text-gray-500 mb-5">Tell consultants about your organization.</p>
            <Input label="Company Name *" value={companyForm.company_name}
              onChange={e => setCompanyForm(p => ({ ...p, company_name: e.target.value }))}
              placeholder="Acme Corporation" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Industry" value={companyForm.industry}
                onChange={e => setCompanyForm(p => ({ ...p, industry: e.target.value }))}
                placeholder="e.g. Financial Services" />
              <Input label="Company Size" value={companyForm.company_size}
                onChange={e => setCompanyForm(p => ({ ...p, company_size: e.target.value }))}
                placeholder="e.g. 500–1,000 employees" />
              <Input label="Founded Year" type="number" value={companyForm.founded_year}
                onChange={e => setCompanyForm(p => ({ ...p, founded_year: e.target.value }))} />
              <Input label="HQ Location" value={companyForm.hq_location}
                onChange={e => setCompanyForm(p => ({ ...p, hq_location: e.target.value }))}
                placeholder="City, Country" />
            </div>
            <Input label="Website" value={companyForm.website}
              onChange={e => setCompanyForm(p => ({ ...p, website: e.target.value }))}
              placeholder="https://yourcompany.com" />
            <Textarea label="Description" value={companyForm.description}
              onChange={e => setCompanyForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What does your company do?" />
          </>
        )}

        {/* ── Step 1: Primary Contact ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Primary Contact</h2>
            <p className="text-sm text-gray-500 mb-5">Who should consultants contact for this account?</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Full Name" value={contactForm.contact_name}
                onChange={e => setContactForm(p => ({ ...p, contact_name: e.target.value }))}
                placeholder="Jane Smith" />
              <Input label="Title / Role" value={contactForm.contact_title}
                onChange={e => setContactForm(p => ({ ...p, contact_title: e.target.value }))}
                placeholder="VP of Technology" />
              <Input label="Email" type="email" value={contactForm.contact_email}
                onChange={e => setContactForm(p => ({ ...p, contact_email: e.target.value }))}
                placeholder="jane@company.com" />
              <Input label="Phone" value={contactForm.contact_phone}
                onChange={e => setContactForm(p => ({ ...p, contact_phone: e.target.value }))}
                placeholder="+1 555 000 0000" />
            </div>
          </>
        )}

        {/* ── Step 2: Consulting Preferences ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Consulting Preferences</h2>
            <p className="text-sm text-gray-500 mb-5">Help us match you with the right consultants.</p>
            <Input label="Annual Consulting Budget" value={prefsForm.budget}
              onChange={e => setPrefsForm(p => ({ ...p, budget: e.target.value }))}
              placeholder="e.g. $500K annual consulting" />
            <Input label="Areas of Interest (comma-separated)" value={prefsForm._categories}
              onChange={e => setPrefsForm(p => ({ ...p, _categories: e.target.value }))}
              placeholder="Cloud, AI, ERP, Cybersecurity" />
            <Textarea label="Additional Notes" value={prefsForm.notes}
              onChange={e => setPrefsForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Special requirements, compliance needs, vetting criteria…" />
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setSt(s => s - 1) : null}
          className={`px-4 py-2 text-sm border border-gray-200 rounded-xl transition-colors ${
            step > 0 ? "text-gray-600 hover:bg-gray-50" : "invisible"}`}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button onClick={skip} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
              Skip
            </button>
          )}
          <button onClick={handleNext}
            disabled={saving || (step === 0 && !companyForm.company_name.trim())}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : isLast ? "Complete Setup →" : "Save & Continue →"}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        <button onClick={onComplete} className="hover:text-gray-600 underline underline-offset-2">
          Skip all and go to dashboard
        </button>
      </p>
    </div>
  );
}

// ============================================================
// MANAGER / ADMIN WELCOME SCREEN
// ============================================================
function ManagerAdminWelcomeView({ auth, onComplete }) {
  const roleInfo = {
    manager: {
      Icon: FileText,
      title: "Welcome, Manager!",
      desc: "You have full access to manage cases, assign consultants, review the kanban board, configure SLAs, and run reports.",
      highlights: ["Create & manage cases", "Assign consultants", "Track progress on Kanban", "Configure SLA rules", "Generate reports"],
    },
    admin: {
      Icon: Settings,
      title: "Welcome, Administrator!",
      desc: "You have complete platform access including user management, all cases, system configuration, and reporting.",
      highlights: ["Manage all users & roles", "Full case oversight", "Configure system settings", "DB connections", "Arena & leaderboard"],
    },
  };
  const info = roleInfo[auth.role] ?? roleInfo.manager;

  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-6 shadow-lg">
        <info.Icon className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{info.title}</h1>
      <p className="text-gray-500 text-sm mb-8">{info.desc}</p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 text-left">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Your Access Includes</p>
        <ul className="space-y-2">
          {info.highlights.map(h => (
            <li key={h} className="flex items-center gap-3 text-sm text-gray-700">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
              {h}
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onComplete}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow">
        Go to Dashboard →
      </button>
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const auth = useAuth();
  const [activeView, setActiveView]     = useState("dashboard");
  const [authed, setAuthed]             = useState(false);
  const [onboardingRole, setOnboarding] = useState(null); // role string or null
  const unreadCount                     = useUnreadCount();

  // Sync authed state with auth session
  useEffect(() => {
    if (!auth.loading) setAuthed(!!auth.user);
  }, [auth.loading, auth.user]);

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed || !auth.user) {
    return <AuthScreen onAuth={(newRole = null) => {
      setAuthed(true);
      if (newRole) setOnboarding(newRole);
    }} />;
  }

  function completeOnboarding(view = "dashboard") {
    setOnboarding(null);
    setActiveView(view);
  }

  // Show role-specific onboarding wizard for new signups — full-screen, no sidebar
  if (onboardingRole && auth.user) {
    const bg = "min-h-screen bg-[#EAF4FD] p-6";
    if (onboardingRole === "consultant") {
      return (
        <div className={bg}>
          <ConsultantOnboardingView auth={auth} onComplete={() => completeOnboarding("profile")} />
        </div>
      );
    }
    if (onboardingRole === "client") {
      return (
        <div className={bg}>
          <ClientOnboardingView auth={auth} onComplete={() => completeOnboarding("client-profile")} />
        </div>
      );
    }
    // manager / admin — welcome screen
    return (
      <div className={bg}>
        <ManagerAdminWelcomeView auth={auth} onComplete={() => completeOnboarding("dashboard")} />
      </div>
    );
  }

  async function handleSignOut() {
    await auth.signOut();
    setAuthed(false);
    setOnboarding(null);
    setActiveView("dashboard");
  }

  function renderView() {
    switch (activeView) {
      case "dashboard":      return <Dashboard auth={auth} />;
      case "projects":       return <ProjectsView auth={auth} />;
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
      case "client-profile": return auth.isClient ? <ClientProfileView auth={auth} /> : <Dashboard auth={auth} />;
      case "lifecycle":      return (auth.isAdmin || auth.isManager) ? <LifecycleSettingsView auth={auth} /> : <Dashboard auth={auth} />;
      case "notifications":  return <NotificationsView />;
      case "invoices":       return <InvoicesView auth={auth} />;
      case "kanban":         return <KanbanView auth={auth} />;
      case "time":           return <TimeEntriesView auth={auth} />;
      default:               return <Dashboard auth={auth} />;
    }
  }

  return (
    <div className="min-h-screen bg-[#EAF4FD]">
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

