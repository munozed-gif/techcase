import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";

// useActivityFeed, useFeedPrefs, useGlobalActivity

function useActivityFeed(visibleCaseIds, userId) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const key = visibleCaseIds.slice(0, 80).sort().join(',');

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const ids = visibleCaseIds.slice(0, 80);
    const [commRes, assignRes, notifRes] = await Promise.all([
      ids.length > 0
        ? supabase.from('case_comments')
            .select('id, case_id, body, created_at, progress_update, is_internal, author:author_id(id, full_name)')
            .in('case_id', ids).eq('is_internal', false)
            .order('created_at', { ascending: false }).limit(50)
        : { data: [] },
      ids.length > 0
        ? supabase.from('case_assignments')
            .select('case_id, time_commitment, consultant_id')
            .in('case_id', ids).limit(30)
        : { data: [] },
      supabase.from('notifications')
        .select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(50),
    ]);
    const merged = [
      ...(commRes.data ?? []).map(c => ({
        ...c, _type: c.progress_update !== null ? 'progress' : 'comment',
        actor_name: c.author?.full_name ?? t("feed.actor_someone"), _key: `comment-${c.id}`, is_unread: false,
      })),
      ...(assignRes.data ?? []).map(a => ({
        ...a, _type: 'assignment', created_at: new Date(0).toISOString(),
        actor_name: t("feed.actor_consultant"), _key: `assign-${a.case_id}-${a.consultant_id}`, is_unread: false,
      })),
      ...(notifRes.data ?? []).map(n => ({
        ...n,
        _type: n.event_type === 'status_change' ? 'status_change'
             : n.event_type === 'due_date' ? 'alert'
             : n.event_type === 'milestone' ? 'milestone'
             : n.event_type === 'document' ? 'document'
             : 'alert',
        actor_name: null, _key: `notif-${n.id}`, is_unread: !n.is_read,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 60);
    setItems(merged);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { items, loading, refresh };
}

function useFeedPrefs(userId) {
  const key = `feed_prefs_${userId}`;
  const defaults = {
    show_comments: true, show_progress: true, show_status: true,
    show_assignments: true, show_alerts: true, show_documents: true,
    scope: 'my_cases',
    visible_comments: true, visible_progress: true,
    visible_status: true, visible_assignments: true,
  };
  const [prefs, setPrefsState] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return defaults; }
  });
  function savePrefs(next) {
    const merged = { ...prefs, ...next };
    setPrefsState(merged);
    localStorage.setItem(key, JSON.stringify(merged));
  }
  return { prefs, savePrefs };
}

function useGlobalActivity(visibleCaseIds) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const key = visibleCaseIds.slice(0, 80).sort().join(',');

  useEffect(() => {
    if (visibleCaseIds.length === 0) { setActivities([]); return; }
    setLoading(true);
    (async () => {
      const ids = visibleCaseIds.slice(0, 80);
      const [{ data: comments }, { data: assignments }] = await Promise.all([
        supabase.from('case_comments')
          .select('id, case_id, body, created_at, is_internal, progress_update, hours_logged, author:author_id(full_name)')
          .in('case_id', ids)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.from('case_assignments')
          .select('case_id, time_commitment, consultant_id')
          .in('case_id', ids)
          .limit(20),
      ]);
      const items = [
        ...(comments ?? []).map(c => ({ ...c, _type: c.progress_update !== null ? 'progress' : 'comment' })),
        ...(assignments ?? []).map(a => ({ ...a, _type: 'assignment', created_at: new Date(0).toISOString() })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 40);
      setActivities(items);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { activities, loading };
}

export { useActivityFeed, useFeedPrefs, useGlobalActivity };
