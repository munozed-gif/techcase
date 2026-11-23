// Settings → Security (admins only): login activity per user, sign-in history, force sign-out,
// and the inactivity sign-out limits per role.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, LogOut, History, Search, Activity, Timer, Monitor, Smartphone, RefreshCw, X } from "lucide-react";
import { CardCarousel } from "./CardCarousel.jsx";
import { supabase } from "../lib/supabase.js";
import { SESSION_DEFAULTS, DEFAULT_ROLE_MINUTES } from "../lib/sessionSecurity.js";

const ROLES = ["admin", "manager", "area_leader", "dispatch", "consultant", "headhunter", "client", "key_user", "project_manager", "internal_consultant", "final_user", "invited_client"];
const ROLE_LABEL = r => r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const PRESETS = [0, 15, 30, 60, 120, 240, 480];
const EVENT = {
  signed_in:  { label: "Signed in",          cls: "bg-green-100 text-green-700" },
  signed_out: { label: "Signed out",         cls: "bg-gray-100 text-gray-600" },
  timed_out:  { label: "Timed out",          cls: "bg-amber-100 text-amber-700" },
  forced_out: { label: "Ended by admin",     cls: "bg-red-100 text-red-700" },
};

function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function ago(v) {
  if (!v) return "";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
function fmtMinutes(m) {
  if (!m) return "Never";
  return m % 60 === 0 ? `${m / 60} h` : `${m} min`;
}
export function describeDevice(ua) {
  if (!ua) return { text: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /node|undici|axios|curl/i.test(ua) ? "API client" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { text: os ? `${browser} on ${os}` : browser, mobile: /Mobi|iPhone|Android/.test(ua) };
}

function EventPill({ e }) {
  const m = EVENT[e] ?? { label: e, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}

function HistoryTable({ rows, showUser }) {
  if (!rows) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-300" /></div>;
  if (rows.length === 0) return <div className="text-sm text-gray-400 p-4 bg-gray-50 rounded-xl">No sign-in events recorded yet.</div>;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
          <th className="text-left px-4 py-2.5">When</th>{showUser && <th className="text-left px-4 py-2.5">User</th>}
          <th className="text-left px-4 py-2.5">Event</th><th className="text-left px-4 py-2.5">Device</th><th className="text-left px-4 py-2.5">IP</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => {
            const d = describeDevice(r.user_agent);
            return (
              <tr key={r.id}>
                <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{fmtTime(r.created_at)}<div className="text-gray-400">{ago(r.created_at)}</div></td>
                {showUser && <td className="px-4 py-2.5 text-xs"><div className="font-semibold text-gray-800">{r.full_name ?? "—"}</div><div className="text-gray-400">{r.email}</div></td>}
                <td className="px-4 py-2.5"><EventPill e={r.event} />
                  {r.remember && r.event === "signed_in" && <div className="text-[10px] text-gray-400 mt-0.5">Kept signed in on device</div>}
                  {r.event === "forced_out" && r.actor_name && <div className="text-[10px] text-gray-400 mt-0.5">by {r.actor_name}</div>}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600" title={r.user_agent ?? ""}>{d.text}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{r.ip ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UserDetail({ user, onClose, onForce }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.rpc("admin_login_history", { p_user: user.id, p_limit: 100 }).then(({ data }) => setRows(Array.isArray(data) ? data : []));
  }, [user.id]);
  return (
    <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/40 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900">{user.full_name}</div>
          <div className="text-xs text-gray-500">{user.email} · {ROLE_LABEL(user.role)}</div>
        </div>
        {user.open_sessions > 0 && (
          <button onClick={() => onForce(user)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">
            <LogOut size={13} />Sign out everywhere</button>
        )}
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white" aria-label="Close"><X size={15} /></button>
      </div>
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Open sessions ({user.open_sessions})</div>
        {(user.sessions ?? []).length === 0 ? <div className="text-xs text-gray-400">None — the user is signed out on every device.</div> : (
          <div className="grid sm:grid-cols-2 gap-2">
            {user.sessions.map(s => {
              const d = describeDevice(s.user_agent);
              const Ic = d.mobile ? Smartphone : Monitor;
              return (
                <div key={s.id} className="flex items-start gap-2 p-2.5 bg-white rounded-xl border border-gray-100">
                  <Ic size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs min-w-0">
                    <div className="font-semibold text-gray-800">{d.text}{s.remember && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">kept signed in</span>}</div>
                    <div className="text-gray-500">Since {fmtTime(s.started)} · IP {s.ip ?? "—"}</div>
                    <div className="text-gray-400">Last renewed {ago(s.refreshed)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">History</div>
        <HistoryTable rows={rows} />
      </div>
    </div>
  );
}

function LoginActivity() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("admin_login_overview");
    if (e) setError(e.message); else { setError(null); setUsers(Array.isArray(data) ? data : []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (detail && users) setDetail(users.find(u => u.id === detail.id) ?? null); }, [users]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function force(u) {
    if (!window.confirm(`Sign ${u.full_name} out of all ${u.open_sessions} device(s)? Open tabs close within about 2 minutes.`)) return;
    setBusy(u.id);
    const { error: e } = await supabase.rpc("admin_force_sign_out", { p_user: u.id });
    setBusy(null);
    if (e) setError(e.message); else load();
  }

  const shown = useMemo(() => (users ?? []).filter(u =>
    (!onlyOpen || u.open_sessions > 0) &&
    (!search || `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()))), [users, search, onlyOpen]);

  if (!users && !error) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>;
  const online = v => v && Date.now() - new Date(v).getTime() < 5 * 60 * 1000;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Login activity</h2>
        <p className="text-sm text-gray-500">When each user last signed in and was last active, and which devices are signed in now. Times are in your time zone. Only admins see this.</p>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, email or role…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />Signed in now</label>
        <button onClick={load} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Refresh"><RefreshCw size={14} /></button>
      </div>
      {detail && <UserDetail user={detail} onClose={() => setDetail(null)} onForce={force} />}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <th className="text-left px-4 py-2.5">User</th><th className="text-left px-4 py-2.5">Last sign-in</th>
            <th className="text-left px-4 py-2.5">Last active</th><th className="text-left px-4 py-2.5">Devices</th><th />
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {shown.map(u => (
              <tr key={u.id} className={`align-top ${detail?.id === u.id ? "bg-blue-50/50" : ""}`}>
                <td className="px-4 py-2.5 text-xs"><div className="font-semibold text-gray-800 flex items-center gap-1.5">
                  {online(u.last_active_at) && <span className="w-2 h-2 rounded-full bg-green-500" title="Active in the last 5 minutes" />}{u.full_name ?? "—"}</div>
                  <div className="text-gray-400">{u.email} · {ROLE_LABEL(u.role ?? "")}</div></td>
                <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{fmtTime(u.last_sign_in_at)}<div className="text-gray-400">{ago(u.last_sign_in_at)}</div></td>
                <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{fmtTime(u.last_active_at)}<div className="text-gray-400">{ago(u.last_active_at)}</div></td>
                <td className="px-4 py-2.5 text-xs">{u.open_sessions > 0
                  ? <span className="font-semibold text-gray-800">{u.open_sessions} signed in</span> : <span className="text-gray-400">Signed out</span>}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => setDetail(detail?.id === u.id ? null : u)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Sessions and history"><History size={14} /></button>
                  {u.open_sessions > 0 && <button onClick={() => force(u)} disabled={busy === u.id} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40" title="Sign out everywhere">
                    {busy === u.id ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentEvents() {
  const [rows, setRows] = useState(null);
  const [type, setType] = useState("");
  const load = useCallback(() => {
    setRows(null);
    supabase.rpc("admin_login_history", { p_limit: 300 }).then(({ data }) => setRows(Array.isArray(data) ? data : []));
  }, []);
  useEffect(() => { load(); }, [load]);
  const shown = rows && (type ? rows.filter(r => r.event === type) : rows);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Sign-in history</h2>
        <p className="text-sm text-gray-500">Every sign-in, sign-out, inactivity time-out and admin sign-out, newest first (last 300).</p>
      </div>
      <div className="flex items-center gap-2">
        <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All events</option>{Object.entries(EVENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Refresh"><RefreshCw size={14} /></button>
      </div>
      <HistoryTable rows={shown} showUser />
    </div>
  );
}

function InactivitySettings({ ssCtx }) {
  const cfg = { ...SESSION_DEFAULTS, ...(ssCtx.settings["session_security"] ?? {}) };
  const roles = cfg.roles ?? {};
  const save = patch => ssCtx.setSetting("session_security", { ...cfg, ...patch });
  const setRole = (r, v) => save({ roles: { ...roles, [r]: v } });
  const sw = on => `relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${on ? "bg-blue-600" : "bg-gray-300"}`;
  const Switch = ({ on, onClick }) => (
    <button onClick={onClick} className={sw(on)} role="switch" aria-checked={on}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
  const box = "p-4 bg-gray-50 rounded-xl border border-gray-100";

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Inactivity sign-out</h2>
        <p className="text-sm text-gray-500">Signs users out after a period without using the platform (mouse, keyboard, touch or scrolling, in any tab). They get a warning first. Changes apply within seconds to everyone signed in.</p>
      </div>
      <div className={box + " flex items-start gap-4"}>
        <Switch on={cfg.enabled} onClick={() => save({ enabled: !cfg.enabled })} />
        <div>
          <div className="text-sm font-semibold text-gray-800">Sign out inactive users</div>
          <div className="text-xs text-gray-500 mt-0.5">Off: users stay signed in until they sign out.</div>
        </div>
      </div>
      <div className={box + " flex items-start gap-4"}>
        <Switch on={cfg.allow_remember !== false} onClick={() => save({ allow_remember: cfg.allow_remember === false })} />
        <div>
          <div className="text-sm font-semibold text-gray-800">Allow "Keep me signed in on this device"</div>
          <div className="text-xs text-gray-500 mt-0.5">When a user ticks it at sign-in, that device skips the inactivity limit. Turn this off to apply the limit to everyone.</div>
        </div>
      </div>
      <div className={box}>
        <label className="text-sm font-semibold text-gray-800">Warning before sign-out
          <div className="flex items-center gap-2 mt-2">
            <select value={cfg.warn_seconds} onChange={e => save({ warn_seconds: Number(e.target.value) })} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
              {[30, 60, 120, 300].map(s => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
            </select>
          </div></label>
      </div>
      <div className={box}>
        <div className="text-sm font-semibold text-gray-800 mb-1">Limit per role</div>
        <div className="text-xs text-gray-500 mb-3">How long a user of each role can be inactive before being signed out. Roles not set here use {DEFAULT_ROLE_MINUTES} min.</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {ROLES.map(r => {
            const v = roles[r] ?? DEFAULT_ROLE_MINUTES;
            const custom = !PRESETS.includes(Number(v));
            return (
              <div key={r} className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
                <span className="flex-1 text-xs font-semibold text-gray-700">{ROLE_LABEL(r)}</span>
                <select value={custom ? "custom" : v} disabled={!cfg.enabled}
                  onChange={e => setRole(r, e.target.value === "custom" ? 45 : Number(e.target.value))}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white disabled:opacity-50">
                  {PRESETS.map(p => <option key={p} value={p}>{fmtMinutes(p)}</option>)}
                  <option value="custom">Custom…</option>
                </select>
                {custom && <input type="number" min="1" max="1440" defaultValue={v} disabled={!cfg.enabled}
                  onBlur={e => { const n = Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || 0)); if (n && n !== Number(v)) setRole(r, n); }}
                  className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs" title="Minutes" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SettingsSecurityTab({ ssCtx }) {
  return (
    <CardCarousel storageKey="settings_security_slide" slides={[
      { id: "activity", label: "Login activity", Icon: Activity, content: <LoginActivity /> },
      { id: "history", label: "Sign-in history", Icon: History, content: <RecentEvents /> },
      { id: "inactivity", label: "Inactivity sign-out", Icon: Timer, content: <InactivitySettings ssCtx={ssCtx} /> },
    ]} />
  );
}
