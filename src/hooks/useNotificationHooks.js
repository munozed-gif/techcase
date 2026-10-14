import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

// useCaseSpecification, useUnreadCount, useNotifications, useLeaderboard

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
    const chRef = { current: null };
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) { setLoading(false); return; }
      supabase.from("notifications")
        .select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(50)
        .then(({ data }) => {
          if (cancelled) return;
          setNotifications(data ?? []);
          setUnreadCount((data ?? []).filter(n => !n.is_read).length);
          setLoading(false);
          const ch = supabase.channel(`notif-view-${user.id}`)
            .on("postgres_changes",
              { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
              payload => { setNotifications(p => [payload.new, ...p]); setUnreadCount(p => p + 1); })
            .subscribe();
          chRef.current = ch;
        });
    });
    return () => { cancelled = true; if (chRef.current) supabase.removeChannel(chRef.current); };
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
        .select("id, headline, skills, featured_skills, years_experience, expertise_level, availability_type, hourly_rate");

      if (!profiles?.length) { setLoading(false); return; }

      const ids = profiles.map(p => p.id);

      // 2. Fetch users, ratings, applications keyed by consultant user-id in parallel
      const [{ data: usersData }, { data: ratingsData }, { data: appsData }] = await Promise.all([
        supabase.from("users").select("id, full_name, avatar_url").in("id", ids),
        supabase.from("case_ratings").select("ratee_id, scores").in("ratee_id", ids).eq("ratee_role", "consultant"),
        supabase.from("applications").select("consultant_id, status").in("consultant_id", ids),
      ]);

      const ranked = profiles.map(c => {
        const cRatings    = (ratingsData ?? []).filter(r => r.ratee_id === c.id);
        const scores      = cRatings.map(r => {
          const vals = Object.values(r.scores ?? {});
          return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        });
        const apps        = (appsData    ?? []).filter(a => a.consultant_id === c.id);
        const avgRating   = scores.length
          ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
        return {
          ...c,
          user:          (usersData ?? []).find(u => u.id === c.id) ?? null,
          avgRating,
          ratingCount:   cRatings.length,
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

export { useCaseSpecification, useUnreadCount, useNotifications, useLeaderboard };
