import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Loader2, Lock, Plus, RefreshCw, Unplug, Plug, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { bridgeAuthHeaders } from "../lib/bridgeAuth.js";

// Project VPN profiles: each SAP environment can use its own VPN, which the ADT bridge runs in
// an isolated network space on the VM (several customers' VPNs side by side, no route
// conflicts). Secrets are saved server-side (save_sap_vpn_profile) and never read back.

export const VPN_TYPES = [
  { value: 'fortinet',      label: 'FortiGate SSL VPN',          fields: ['gateway', 'port', 'username', 'secret', 'trusted_cert', 'realm'] },
  { value: 'anyconnect',    label: 'Cisco AnyConnect / ASA',     fields: ['gateway', 'username', 'secret', 'trusted_cert', 'realm'] },
  { value: 'globalprotect', label: 'Palo Alto GlobalProtect',    fields: ['gateway', 'username', 'secret', 'trusted_cert', 'realm'] },
  { value: 'pulse',         label: 'Ivanti / Pulse Secure',      fields: ['gateway', 'username', 'secret', 'trusted_cert', 'realm'] },
  { value: 'openvpn',       label: 'OpenVPN (.ovpn file)',       fields: ['config', 'username', 'secret'] },
  { value: 'wireguard',     label: 'WireGuard (.conf file)',     fields: ['config'] },
];
const typeMeta = (t) => VPN_TYPES.find(x => x.value === t) ?? VPN_TYPES[0];

const FIELD_LABEL = {
  gateway: 'Gateway (host or URL)', port: 'Port', username: 'VPN user', secret: 'VPN password',
  trusted_cert: 'Gateway certificate (sha256 pin, only if self-signed)', realm: 'Realm / group (optional)',
  config: 'Client configuration file',
};

const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60";

export async function listVpnProfiles(scopes) {
  const { data, error } = await supabase.rpc('list_sap_vpn_profiles', { p_scopes: scopes.filter(Boolean) });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function registeredBridgeUrl(fallback) {
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'adt_bridge_tunnel_url').maybeSingle();
    if (typeof data?.value === 'string' && data.value.trim()) return data.value.trim().replace(/\/$/, '');
  } catch { /* use fallback */ }
  return (fallback || '').trim().replace(/\/$/, '');
}

/** Ask the bridge about / connect / disconnect the VPN of this SAP environment. */
export async function projectVpnAction(env, action) {
  const base = await registeredBridgeUrl(env?.adt_mcp_url);
  if (!base) return { ok: false, error: 'No ADT bridge URL registered — is the VM running?' };
  try {
    const r = await fetch(`${base}/net/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bridgeAuthHeaders(base)) },
      body: JSON.stringify({ host: env.host, username: env.username, client: env.client || '100' }),
      signal: AbortSignal.timeout(action === 'connect' ? 90000 : 20000),
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { ok: false, error: `Bridge returned HTTP ${r.status}` }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function ProfileForm({ scopeKey, profile, onSaved, onCancel }) {
  const [d, setD] = useState(() => ({
    name: profile?.name ?? '', vpn_type: profile?.vpn_type ?? 'fortinet', gateway: profile?.gateway ?? '',
    port: profile?.port ?? '', username: profile?.username ?? '', secret: '', config: '',
    trusted_cert: profile?.trusted_cert ?? '', realm: profile?.realm ?? '',
    dns: profile?.options?.dns ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const meta = typeMeta(d.vpn_type);
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true); setErr(null);
    const { data, error } = await supabase.rpc('save_sap_vpn_profile', {
      p_id: profile?.id ?? null, p_scope: scopeKey, p_name: d.name, p_type: d.vpn_type,
      p_gateway: meta.fields.includes('gateway') ? d.gateway : null,
      p_port: meta.fields.includes('port') && d.port ? Number(d.port) : null,
      p_username: meta.fields.includes('username') ? d.username : null,
      // Empty = keep the saved secret (it is never shown again).
      p_secret: meta.fields.includes('secret') && d.secret ? d.secret : null,
      p_config: meta.fields.includes('config') && d.config ? d.config : null,
      p_trusted_cert: meta.fields.includes('trusted_cert') ? d.trusted_cert : null,
      p_realm: meta.fields.includes('realm') ? d.realm : null,
      p_options: { ...(profile?.options ?? {}), dns: d.dns.trim() },
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved?.(data);
  }

  async function readFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200_000) { setErr('That file is too large for a VPN configuration'); return; }
    set('config', await f.text());
  }

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-3 space-y-2 bg-blue-50/40 dark:bg-blue-900/10">
      <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
        {profile ? 'Edit VPN profile' : 'New project VPN profile'}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Name</label>
          <input value={d.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Admosa FortiGate" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">VPN type</label>
          <select value={d.vpn_type} onChange={e => set('vpn_type', e.target.value)} className={inputCls}>
            {VPN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {meta.fields.filter(f => f !== 'config').map(f => (
          <div key={f} className={f === 'trusted_cert' ? 'sm:col-span-2' : ''}>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">{FIELD_LABEL[f]}</label>
            <input
              type={f === 'secret' ? 'password' : 'text'} autoComplete={f === 'secret' ? 'new-password' : 'off'}
              value={d[f]} onChange={e => set(f, e.target.value)}
              placeholder={f === 'secret' && profile?.has_secret ? 'Saved securely — type to replace'
                : f === 'gateway' ? 'vpn.customer.com' : f === 'port' ? '443' : ''}
              className={inputCls} />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
            DNS servers (optional — the customer's internal DNS, if SAP host names only exist there)
          </label>
          <input value={d.dns} onChange={e => set('dns', e.target.value)} placeholder="e.g. 10.0.0.10, 10.0.0.11" className={inputCls} />
        </div>
        {meta.fields.includes('config') && (
          <div className="sm:col-span-2">
            <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
              {FIELD_LABEL.config} {profile?.has_config && !d.config ? '— saved securely; choose a file to replace' : ''}
            </label>
            <input type="file" accept=".ovpn,.conf,.txt" onChange={readFile} className="text-xs" />
            {d.config && <p className="text-[10px] text-green-600 mt-1">File loaded ({d.config.length} characters)</p>}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400">
        The VPN must log in without a phone push or SMS code (MFA). Ask the customer for a service account,
        a certificate login or a site-to-site connection if theirs requires MFA.
      </p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !d.name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}Save profile
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300">Cancel</button>
      </div>
    </div>
  );
}

/**
 * Network access of one SAP environment in "Project VPN" mode: pick / create / edit the
 * environment's VPN profile and see, connect or disconnect it.
 * scopeKeys: the sap_integration keys whose profiles may be used (project first, then customer).
 */
export function ProjectVpnSelector({ env, scopeKeys, ownScopeKey, canEdit, onChange }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [editing, setEditing] = useState(null);   // null | 'new' | profile
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try { setProfiles(await listVpnProfiles(scopeKeys)); }
    catch (e) { setLoadErr(e.message); }
    setLoading(false);
  }, [scopeKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const selected = profiles.find(p => p.id === env.vpn_profile_id) ?? null;

  async function act(action) {
    setBusy(action);
    if (action !== 'status') setStatus(null);
    setStatus(await projectVpnAction(env, action));
    setBusy(null);
  }

  // Show the current state as soon as a profile is selected (and after the panel re-renders).
  useEffect(() => {
    if (selected?.id && env.host && env.username) act('status');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = status?.vpn?.state;
  return (
    <div className="space-y-2">
      {loadErr && <p className="text-xs text-red-500">Could not load VPN profiles: {loadErr}</p>}
      <div className="flex gap-2 items-center">
        <select value={env.vpn_profile_id ?? ''} disabled={!canEdit || loading}
          onChange={e => { onChange(e.target.value || null); setStatus(null); }}
          className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white dark:bg-gray-700 dark:text-gray-100">
          <option value="">{loading ? 'Loading…' : '— Choose a VPN profile —'}</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>🔒 {p.name} — {typeMeta(p.vpn_type).label}{p.scope_key !== ownScopeKey ? ' (customer)' : ''}</option>
          ))}
        </select>
        <button type="button" onClick={load} title="Reload profiles" className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500"><RefreshCw size={12} /></button>
      </div>

      {canEdit && !editing && (
        <div className="flex gap-3">
          <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 dark:text-blue-400">
            <Plus size={11} />New VPN profile
          </button>
          {selected && selected.scope_key === ownScopeKey && (
            <button onClick={() => setEditing(selected)} className="text-[11px] text-blue-500 hover:text-blue-700 dark:text-blue-400">Edit “{selected.name}”</button>
          )}
        </div>
      )}
      {editing && (
        <ProfileForm scopeKey={ownScopeKey} profile={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async (id) => { setEditing(null); await load(); if (id) onChange(id); }} />
      )}

      {selected && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 space-y-1.5">
          <div className="flex items-start gap-2 text-xs min-w-0">
            <Lock size={12} className="text-gray-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-700 dark:text-gray-200 truncate">{selected.name}</div>
              <div className="text-gray-400 break-all">{selected.gateway ?? typeMeta(selected.vpn_type).label}</div>
            </div>
          </div>
          {/* State on its own line: a long gateway name must never push it out of view. */}
          <div className="text-xs">
            {busy === 'connect' ? (
              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Connecting… (up to a minute)</span>
            ) : busy === 'status' && !st ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Loader2 size={11} className="animate-spin" />Checking…</span>
            ) : st ? (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${st === 'up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : st === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                {st === 'up' && <CheckCircle2 size={11} />}
                {st === 'up' ? `Connected${status.vpn.iface ? ' · ' + (status.vpn.iface.split(' ')[1] ?? status.vpn.iface) : ''}`
                  : st === 'down' ? 'Not connected' : st === 'not-set-up' ? 'VM not set up' : st}
              </span>
            ) : !status ? (
              <span className="text-[11px] text-gray-400">State unknown — press Status</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => act('status')} disabled={!!busy} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50">
              {busy === 'status' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}Status
            </button>
            <button onClick={() => act('connect')} disabled={!!busy || !env.host || !env.username} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-green-300 text-green-700 dark:text-green-300 disabled:opacity-50">
              {busy === 'connect' ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}Connect
            </button>
            <button onClick={() => act('disconnect')} disabled={!!busy} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50">
              {busy === 'disconnect' ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}Disconnect
            </button>
          </div>
          {status?.error && <p className="text-[11px] text-red-500 flex gap-1"><XCircle size={12} className="shrink-0 mt-0.5" />{status.error}</p>}
          {status && status.mode === 'direct' && <p className="text-[11px] text-amber-600">Save the environment first — the bridge still sees it without a VPN profile.</p>}
          <p className="text-[10px] text-gray-400">Connects by itself when the project uses SAP, and disconnects after 30 idle minutes.</p>
        </div>
      )}
    </div>
  );
}
