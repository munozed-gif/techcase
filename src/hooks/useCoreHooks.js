import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { logEvent, notifyCaseParticipants } from "../lib/utils.js";

// useMilestones, useCaseComments, useSlaConfig, useDbConnections,
// useProjectDbConnections, useSubCases, useClientTeamMembers, useInvoices,
// useProjects, useTimeEntries, useCaseActivities, useProjectTemplates, useCaseDocuments

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
    if (!isDone) {
      const ms = milestones.find(m => m.id === id);
      if (ms) notifyCaseParticipants(caseId, null, "Milestone reached", `Milestone completed: "${ms.title}".`, { case_id: caseId, event_type: "milestone" });
    }
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
      notifyCaseParticipants(caseId, user?.id, "Progress updated", `Case progress updated to ${progressUpdate}%.`, { case_id: caseId, event_type: "progress" });
    }
    if (!isInternal) {
      notifyCaseParticipants(caseId, user?.id, "New comment on case", body.length > 100 ? body.slice(0, 97) + "…" : body, { case_id: caseId, event_type: "comment" });
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
        .select("*").eq("client_id", clientId).maybeSingle();
      setSla(data ?? null);
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

function useProjectDbConnections(projectId, clientId) {
  const [projectConns, setProjectConns] = useState([]);
  const [clientConns,  setClientConns]  = useState([]);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("db_connections").select("*").eq("project_id", projectId).order("created_at"),
      clientId
        ? supabase.from("db_connections").select("*").eq("client_id", clientId).is("project_id", null).order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
    setProjectConns(p ?? []);
    setClientConns(c ?? []);
  }, [projectId, clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addConnection(conn) {
    const row = { ...conn, project_id: projectId };
    if (clientId) row.client_id = clientId;
    const { error } = await supabase.from("db_connections").insert(row);
    if (error) throw error;
    await fetchAll();
  }

  async function deleteConnection(id) {
    await supabase.from("db_connections").delete().eq("id", id);
    await fetchAll();
  }

  return { projectConns, clientConns, addConnection, deleteConnection, refetch: fetchAll };
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
        manager:manager_id(id, full_name, avatar_url)
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
    // Block duplicate email in this client's team
    const { data: dup } = await supabase
      .from("client_team_members")
      .select("id")
      .eq("client_id", clientId)
      .ilike("email", member.email.trim())
      .maybeSingle();
    if (dup) throw new Error("This email is already a member of this client's team.");

    // Check if the email already has a platform account
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, full_name, role")
      .ilike("email", member.email.trim())
      .maybeSingle();

    const { error } = await supabase.from("client_team_members").insert({
      ...member,
      client_id: clientId,
    });
    if (error) throw error;
    await fetchMembers();
    return { existingUser: existingUser ?? null };
  }
  async function updateMember(id, updates) {
    const { error } = await supabase.from("client_team_members").update(updates).eq("id", id);
    if (error) throw error;
    await fetchMembers();
  }
  async function removeMember(id) {
    const { error } = await supabase.from("client_team_members").delete().eq("id", id);
    if (error) throw error;
    await fetchMembers();
  }
  return { members, addMember, updateMember, removeMember, refetch: fetchMembers };
}


// ============================================================
// V9 NEW HOOKS
// ============================================================

function useInvoices(filters = {}) {
  const [invoices, setInvoices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit]           = useState(20);
  const filterKey = JSON.stringify(filters);

  useEffect(() => { setLimit(20); }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select(`*, client:client_id(id, full_name, client_profiles(company_name)),
               case:case_id(id, title), consultant:consultant_id(id, full_name)`,
        { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filters.client_id) query = query.eq("client_id", filters.client_id);
    if (filters.status)    query = query.eq("status", filters.status);
    if (filters.case_id)   query = query.eq("case_id", filters.case_id);
    const { data, count } = await query;
    setInvoices(data ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, limit]);

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

  const hasMoreInvoices = invoices.length < totalCount;
  function loadMoreInvoices() { setLimit(l => l + 20); }

  return { invoices, loading, totalCount, hasMore: hasMoreInvoices, loadMore: loadMoreInvoices, createInvoice, updateInvoice, deleteInvoice, refetch: fetchInvoices };
}

function useProjects(filters = {}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const filterKey = JSON.stringify(filters);

  const fetchProjects = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    let q = supabase
      .from("projects")
      .select(`*, client:client_id(id, full_name, avatar_url, client_profiles(company_name)), cases(id, status)`)
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
    logEvent('project.created', { entityType: 'project', entityId: row.id, entityName: row.name ?? row.title });
    await fetchProjects(true);
    return row;
  }

  async function updateProject(id, updates) {
    const { data: row, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await fetchProjects(true);
    return row;
  }

  async function closeProject(id, newStatus) {
    // Cascade: close all non-terminal cases in this project
    await supabase.from("cases")
      .update({ status: newStatus })
      .eq("project_id", id)
      .neq("status", "completed")
      .neq("status", "cancelled");
    const { data: row, error } = await supabase.from("projects").update({ status: newStatus }).eq("id", id).select().single();
    if (error) throw error;
    await fetchProjects(true);
    return row;
  }

  async function deleteProject(id) {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    await fetchProjects(true);
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
               case:case_id(id, title, estimated_hours, budget, project_id),
               approver:approved_by(full_name)`)
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
    // Notify manager: someone logged time
    const { data: me } = await supabase.from("users").select("full_name").eq("id", user.id).single().catch(() => ({ data: null }));
    const who = me?.full_name ?? "A consultant";
    const hrs = Number(data.hours).toFixed(1);
    notifyCaseParticipants(caseId, user.id, "Time logged", `${who} logged ${hrs}h${data.description ? ` — ${data.description}` : ""}.`, { case_id: caseId, event_type: "time_log" });
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

// ── Case Activities ──────────────────────────────────────────
function useCaseActivities(caseId, refreshKey = 0) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading]       = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!caseId) { setLoading(false); return; }
    setLoading(true);

    // Fetch activities without a FK join so a missing column never silences the whole query.
    const { data, error: fetchErr } = await supabase
      .from("case_activities")
      .select("*")
      .eq("case_id", caseId)
      .order("sort_order")
      .order("task_no");

    if (fetchErr) {
      console.error("[useCaseActivities] SELECT failed:", fetchErr.message);
      setLoading(false);
      return;
    }

    // Enrich sub_case activities: fetch linked case + its time in parallel.
    const enriched = await Promise.all((data ?? []).map(async (act) => {
      if (act.activity_type !== "sub_case" || !act.linked_case_id) return act;
      const [{ data: linkedCase }, { data: subActs }, { data: timeData }] = await Promise.all([
        supabase.from("cases").select("id, title, case_ref, status, progress_pct").eq("id", act.linked_case_id).maybeSingle(),
        supabase.from("case_activities").select("progress_pct, est_hours").eq("case_id", act.linked_case_id),
        supabase.from("time_entries").select("hours").eq("case_id", act.linked_case_id),
      ]);
      const subProgress = subActs?.length
        ? Math.round(subActs.reduce((s, a) => s + a.progress_pct * (a.est_hours || 1), 0) /
                     subActs.reduce((s, a) => s + (a.est_hours || 1), 0))
        : (linkedCase?.progress_pct ?? 0);
      const subHoursUsed = timeData?.reduce((s, t) => s + (t.hours || 0), 0) ?? 0;
      return { ...act, linked_case: linkedCase, sub_progress: subProgress, sub_hours_used: subHoursUsed };
    }));

    setActivities(enriched);
    setLoading(false);
  }, [caseId, refreshKey]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  async function addActivity(data) {
    const maxNo = activities.length ? Math.max(...activities.map(a => a.task_no)) : 0;
    const { error } = await supabase.from("case_activities").insert({
      ...data, case_id: caseId, task_no: maxNo + 1, sort_order: maxNo + 1,
    });
    if (error) throw error;
    await fetchActivities();
  }

  async function updateActivity(id, updates) {
    const { error } = await supabase.from("case_activities")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await fetchActivities();
  }

  async function deleteActivity(id) {
    const { error } = await supabase.from("case_activities").delete().eq("id", id);
    if (error) throw error;
    await fetchActivities();
  }

  return { activities, loading, addActivity, updateActivity, deleteActivity, refetch: fetchActivities };
}

function useProjectTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]   = useState(true);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from('project_templates').select('*').order('created_at');
    setTemplates(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function createTemplate(data) {
    const { data: row, error } = await supabase.from('project_templates').insert(data).select().single();
    if (error) throw error;
    await fetchTemplates();
    return row;
  }

  async function updateTemplate(id, updates) {
    const { error } = await supabase.from('project_templates')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await fetchTemplates();
  }

  async function deleteTemplate(id) {
    const { error } = await supabase.from('project_templates').delete().eq('id', id);
    if (error) throw error;
    await fetchTemplates();
  }

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate, refetch: fetchTemplates };
}

// ── Stage access rules ───────────────────────────────────────
// Returns effective permissions for the current user + lifecycle stage.
// bypass_roles always get the fully-open set regardless of rules.
function getStageRules(stage, userAuth) {
  const open = {
    editable: true, can_log_time: true, can_add_activities: true,
    can_comment: true, can_upload_docs: true,
    can_edit_activity_phase: true, can_edit_activity_predecessors: true,
    visible_tabs: null, tab_order: null,
  };
  if (!stage?.rules) return open;
  const r = stage.rules;
  const bypass = r.bypass_roles ?? ["admin", "manager"];
  const isBypassed = bypass.some(role => {
    if (role === "admin")      return userAuth.isAdmin;
    if (role === "manager")    return userAuth.isManager;
    if (role === "consultant") return userAuth.isConsultant;
    if (role === "client")     return userAuth.isClient;
    return false;
  });
  if (isBypassed) return open;
  return {
    editable:                    r.editable                    ?? true,
    can_log_time:                r.can_log_time                ?? true,
    can_add_activities:          r.can_add_activities          ?? true,
    can_comment:                 r.can_comment                 ?? true,
    can_upload_docs:             r.can_upload_docs             ?? true,
    can_edit_activity_phase:     r.can_edit_activity_phase     ?? true,
    can_edit_activity_predecessors: r.can_edit_activity_predecessors ?? true,
    visible_tabs:                r.visible_tabs                ?? null,
    tab_order:                   r.tab_order                   ?? null,
  };
}

// ── Activity adherence helper ────────────────────────────────
function activityAdherence(act) {
  if (act.progress_pct === 100) return "complete";
  if (!act.end_date_plan) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (today > act.end_date_plan) return "overdue";
  if (!act.start_date_plan) return "on_track";
  const total = (new Date(act.end_date_plan) - new Date(act.start_date_plan + "T00:00:00")) / 86400000;
  const elapsed = (Date.now() - new Date(act.start_date_plan + "T00:00:00")) / 86400000;
  const expected = total > 0 ? Math.round((elapsed / total) * 100) : 0;
  if (act.progress_pct >= expected - 10) return "on_track";
  if (act.progress_pct >= expected - 25) return "at_risk";
  return "behind";
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
    const safeName = file.name
      .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip accents
      .replace(/[^a-zA-Z0-9.\-_]/g, "_");                // replace spaces/special chars
    const path = `${caseId}/${Date.now()}-${safeName}`;
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
    notifyCaseParticipants(caseId, user.id, "Document uploaded", `New document attached: "${file.name}"${notes ? ` — ${notes}` : ""}.`, { case_id: caseId, event_type: "document" });
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

export {
  useMilestones,
  useCaseComments,
  useSlaConfig,
  useDbConnections,
  useProjectDbConnections,
  useSubCases,
  useClientTeamMembers,
  useInvoices,
  useProjects,
  useTimeEntries,
  useCaseActivities,
  useProjectTemplates,
  useCaseDocuments,
  getStageRules,
  activityAdherence,
};
