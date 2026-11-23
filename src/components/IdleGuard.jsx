// Signs the user out after the inactivity limit set for their role (Settings → Security), with a
// warning first. Activity in any tab counts for all tabs. Also keeps "last active" up to date and
// signs out a session an admin ended (checked every 2 minutes).
import { useEffect, useRef, useState } from "react";
import { Clock, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";
import {
  SESSION_DEFAULTS, inactivityMinutes, readActivity, writeActivity, sessionIdFromToken,
  markRememberedSession, setSignOutReason, ACTIVITY_KEY,
} from "../lib/sessionSecurity.js";

const HEARTBEAT_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"];

export function IdleGuard({ role, onSignOut }) {
  const { settings } = useSystemSettings();
  const cfg = { ...SESSION_DEFAULTS, ...(settings?.session_security ?? {}) };
  const limitMin = inactivityMinutes(cfg, role);
  const warnSec = Math.max(10, Number(cfg.warn_seconds) || 60);

  const [sid, setSid] = useState(null);
  const [left, setLeft] = useState(null);       // seconds left while the warning shows
  const ending = useRef(false);
  const lastWrite = useRef(0);
  const lastBeat = useRef(0);

  // Current session id (changes only on a new sign-in).
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSid(sessionIdFromToken(data?.session?.access_token ?? "") ?? "nosid"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s?.access_token) setSid(sessionIdFromToken(s.access_token) ?? "nosid"); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // New session → start its activity clock fresh; mark a remembered device in the log.
  useEffect(() => {
    if (!sid) return;
    const a = readActivity();
    if (!a || a.sid !== sid) writeActivity(sid);
    markRememberedSession(sid === "nosid" ? null : sid);
  }, [sid]);

  async function end(reason) {
    if (ending.current) return;
    ending.current = true;
    if (reason === "timed_out") setSignOutReason({ kind: "timed_out", minutes: limitMin });
    else if (reason === "forced_out") setSignOutReason({ kind: "forced_out" });
    await onSignOut(reason);
  }

  // Record activity (throttled), shared through localStorage so every tab sees it.
  useEffect(() => {
    if (!sid) return;
    const mark = () => {
      const now = Date.now();
      if (now - lastWrite.current < 5000) return;
      // Back after the limit already passed (e.g. the computer slept): sign out, don't revive.
      const a = readActivity();
      if (limitMin && a?.sid === sid && now - a.t >= limitMin * 60000) { check(); return; }
      lastWrite.current = now;
      writeActivity(sid, now);
      setLeft(null);
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    const onStorage = e => { if (e.key === ACTIVITY_KEY) setLeft(null); };
    window.addEventListener("storage", onStorage);
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  });   // re-bind each render so check() sees the current limit

  function check() {
    if (!sid || ending.current) return;
    const a = readActivity();
    const lastT = a && a.sid === sid ? a.t : Date.now();
    const idleMs = Date.now() - lastT;

    // Heartbeat: "last active" + did an admin end this session?
    if (Date.now() - lastBeat.current >= HEARTBEAT_MS) {
      lastBeat.current = Date.now();
      const fn = idleMs < HEARTBEAT_MS ? "session_touch" : "session_check";
      supabase.rpc(fn).then(({ data }) => { if (data?.ended) end("forced_out"); }, () => {});
    }

    if (!limitMin) { setLeft(null); return; }
    const remaining = limitMin * 60 - Math.floor(idleMs / 1000);
    if (remaining <= 0) { end("timed_out"); return; }
    setLeft(remaining <= warnSec ? remaining : null);
  }

  useEffect(() => {
    if (!sid) return;
    check();
    const id = setInterval(check, left !== null ? 1000 : 5000);
    return () => clearInterval(id);
  });

  if (left === null || !limitMin) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center" style={{ background: "var(--t-card-bg)", color: "var(--t-text)" }}>
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center"><Clock size={22} className="text-amber-600" /></div>
        <h2 className="text-lg font-bold mb-1">Are you still there?</h2>
        <p className="text-sm text-gray-500 mb-5">You'll be signed out in <span className="font-bold text-gray-800">{left} s</span> because of inactivity.</p>
        <div className="flex gap-2">
          <button onClick={() => end("signed_out")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"><LogOut size={14} />Sign out</button>
          <button autoFocus onClick={() => { writeActivity(sid); setLeft(null); }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
