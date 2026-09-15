import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { logEvent, notify, notifyCaseParticipants, notifyManagers } from "../lib/utils.js";

// useCases, useApplications, useRatings

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
        client:client_id(id, full_name, email, avatar_url, client_profiles(company_name)),
        manager:manager_id(id, full_name, email, avatar_url),
        case_assignments(consultant_id, time_commitment,
          users:consultant_id(id, full_name, avatar_url)),
        case_key_users(user_id, area, users:user_id(full_name, email, role)),
        applications(consultant_id, submitted_at, consultant:consultant_id(full_name, avatar_url)),
        project:project_id(id, name, avatar_url, client:client_id(id, avatar_url))
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
    logEvent('case.created', { entityType: 'case', entityId: row.id, entityName: row.title });
    await fetchCases();
    notifyManagers("New case created", `Case "${row.title}" has been submitted and needs review.`);
    return row;
  }

  async function updateCase(id, updates) {
    let _oldStatus = null;
    if (updates.status) {
      const { data: _old } = await supabase.from('cases').select('status').eq('id', id).single();
      _oldStatus = _old?.status ?? null;
    }
    const { data: rows, error } = await supabase.from("cases").update(updates).eq("id", id).select();
    const row = rows?.[0] ?? null;
    if (error) throw error;
    await fetchCases();
    if (updates.status) {
      const { data: { user } } = await supabase.auth.getUser();
      const STATUS_LABELS = {
        open: "Open", in_progress: "In Progress", on_hold: "On Hold",
        technical_test: "Technical Test", functional_test: "Functional Test",
        user_test: "User Test (UAT)", completed: "Completed", cancelled: "Cancelled",
        estimated: "Estimated", assigned: "Assigned",
      };
      const label = STATUS_LABELS[updates.status] ?? updates.status.replace(/_/g, " ");
      const TEST_MSG = {
        technical_test:  "The case has moved to Technical Testing — verify code correctness and edge cases.",
        functional_test: "The case has moved to Functional Testing — validate against the functional specification.",
        user_test:       "The case is ready for User Acceptance Testing (UAT) — business sign-off required.",
      };
      const body = TEST_MSG[updates.status] ?? `Case status changed to "${label}".`;
      notifyCaseParticipants(id, user?.id, `Status → ${label}`, body, { case_id: id, event_type: "status_change" });
      logEvent('case.status_changed', { userId: user.id, userEmail: user.email, entityType: 'case', entityId: id, entityName: rows?.[0]?.title, oldValue: { status: _oldStatus }, newValue: { status: updates.status } });
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
        case:case_id(id, title, status, project:project_id(id, name, avatar_url, client:client_id(id, avatar_url)), client:client_id(id, avatar_url, client_profiles(company_name))),
        team:team_id(id, name, members:consultant_team_members(id, user_id, email, role, status, member:user_id(id, full_name, avatar_url)))
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
      const { data } = await supabase.from("case_ratings")
        .select("id, case_id, scores, comment, created_at, rater:rater_id(full_name, avatar_url), case:case_id(title)")
        .eq("ratee_id", consultantId)
        .eq("ratee_role", "consultant")
        .order("created_at", { ascending: false });
      const mapped = (data ?? []).map(r => {
        const vals = Object.values(r.scores ?? {});
        const score = vals.length > 0
          ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
          : 0;
        return { ...r, score };
      });
      setRatings(mapped);
      const positiveScores = mapped.map(r => r.score).filter(s => s > 0);
      setAvgRating(
        positiveScores.length > 0
          ? parseFloat((positiveScores.reduce((a, b) => a + b, 0) / positiveScores.length).toFixed(2))
          : null
      );
      setLoading(false);
    })();
  }, [consultantId]);

  async function submitRating({ caseId, score, comment }) {
    const { data: { user } } = await supabase.auth.getUser();
    const scores = { overall: score };
    const { data, error } = await supabase.from("case_ratings").insert({
      case_id: caseId ?? null,
      rater_id: user.id,
      ratee_id: consultantId,
      rater_role: "client",
      ratee_role: "consultant",
      scores,
      comment: comment || null,
    }).select().single();
    if (error) throw error;
    const newEntry = { ...data, score, rater: { full_name: null } };
    const newRatings = [...ratings, newEntry];
    setRatings(newRatings);
    const sum = newRatings.reduce((a, r) => a + r.score, 0);
    setAvgRating(parseFloat((sum / newRatings.length).toFixed(2)));
    return data;
  }

  return { ratings, avgRating, loading, submitRating };
}


export { useCases, useApplications, useRatings };
