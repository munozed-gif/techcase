// Session security: login activity logging, "keep me signed in on this device", inactivity sign-out.
import { supabase } from "./supabase.js";

export const REMEMBER_KEY = "arena_remember_device";   // "1" = this device skips the inactivity limit
const REMEMBER_MARKED_KEY = "arena_remember_marked";    // session id already marked as remembered
export const ACTIVITY_KEY = "arena_last_activity";      // { sid, t } shared by every tab
export const SIGNOUT_REASON_KEY = "arena_signout_reason";

export const SESSION_DEFAULTS = { enabled: false, warn_seconds: 60, allow_remember: true, roles: {} };
export const DEFAULT_ROLE_MINUTES = 60;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export const isRememberedDevice = () => ls.get(REMEMBER_KEY) === "1";
export function setRememberDevice(on) { on ? ls.set(REMEMBER_KEY, "1") : ls.del(REMEMBER_KEY); }

/** Session id from the access token (Supabase puts it in the JWT as session_id). */
export function sessionIdFromToken(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, "="))).session_id ?? null;
  } catch { return null; }
}

/** Minutes of inactivity allowed for a role (0 = never signs out). */
export function inactivityMinutes(cfg, role) {
  const c = { ...SESSION_DEFAULTS, ...(cfg ?? {}) };
  if (!c.enabled) return 0;
  if (c.allow_remember !== false && isRememberedDevice()) return 0;
  const v = c.roles?.[role];
  return v === undefined || v === null || v === "" ? DEFAULT_ROLE_MINUTES : Math.max(0, Number(v) || 0);
}

export function readActivity() {
  try { return JSON.parse(ls.get(ACTIVITY_KEY) ?? "null"); } catch { return null; }
}
export function writeActivity(sid, t = Date.now()) { ls.set(ACTIVITY_KEY, JSON.stringify({ sid, t })); }

/** Mark this session as a remembered device in the login log (once per session). */
export async function markRememberedSession(sid) {
  if (!sid || !isRememberedDevice() || ls.get(REMEMBER_MARKED_KEY) === sid) return;
  const { error } = await supabase.rpc("session_log", { p_event: "remember", p_remember: true });
  if (!error) ls.set(REMEMBER_MARKED_KEY, sid);
}

/** Why the user was signed out, shown once on the sign-in screen. */
export function setSignOutReason(reason) { ls.set(SIGNOUT_REASON_KEY, JSON.stringify(reason)); }
export function peekSignOutReason() {
  try { const v = ls.get(SIGNOUT_REASON_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function clearSignOutReason() { ls.del(SIGNOUT_REASON_KEY); }

/**
 * Sign out and record why. reason: 'signed_out' (user), 'timed_out' (inactivity),
 * 'forced_out' (ended by an admin / expired — already recorded server-side).
 */
export async function signOutLogged(reason = "signed_out") {
  if (reason === "signed_out" || reason === "timed_out") {
    try {
      await Promise.race([
        supabase.rpc("session_log", { p_event: reason }),
        new Promise(r => setTimeout(r, 2500)),
      ]);
    } catch { /* never block signing out */ }
  }
  ls.del(ACTIVITY_KEY);
  ls.del(REMEMBER_MARKED_KEY);
  await supabase.auth.signOut();
}
