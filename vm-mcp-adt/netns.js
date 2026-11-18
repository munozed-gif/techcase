// Per-project VPN network namespaces (see arena-netns and setup-netns.sh).
//
// A SAP environment linked to a VPN profile is reached through that profile's own network
// namespace: the VPN client runs inside it (its routes and DNS stay inside), the bridge's
// direct SAP requests go through a SOCKS proxy inside it, and the SAP connection processes
// for that environment are started inside it. Environments without a profile use the VM's
// network as before. Each request's network is carried with AsyncLocalStorage, so sapFetch()
// and getClient() pick it up without changing every call site.
import { execFile } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, writeFile } from 'node:fs/promises';

export const HELPER = process.env.ARENA_NETNS_HELPER || '/usr/local/sbin/arena-netns';
const BASE = '/var/lib/arena-netns';
const IDLE_MS = Number(process.env.VPN_IDLE_MINUTES ?? 30) * 60 * 1000;
const CONNECT_TIMEOUT_MS = 60_000;

export const netContext = new AsyncLocalStorage();
/** The network of the current request: { id, ns, idx, socksUrl } or null (VM network). */
export function currentNet() { return netContext.getStore()?.net ?? null; }

const nets = new Map();        // profile id -> { id, ns, idx, socksUrl, type, version, state, lastUsed, error, pending }

function helper(args, { timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('sudo', ['-n', HELPER, ...args], { timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error((String(stderr || '').trim() || err.message).slice(0, 400)));
      resolve(String(stdout || '').trim());
    });
  });
}

export async function helperAvailable() {
  try { await helper(['list'], { timeout: 5000 }); return true; } catch { return false; }
}

const nsName = (id) => 'arena-' + String(id).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);

async function existingIndexes() {
  const out = await helper(['list']).catch(() => '');
  const map = new Map();
  for (const line of out.split('\n')) {
    const [ns, idx] = line.trim().split(/\s+/);
    if (ns && Number(idx) > 0) map.set(ns, Number(idx));
  }
  return map;
}

async function pickIndex(ns) {
  const existing = await existingIndexes();
  if (existing.has(ns)) return existing.get(ns);
  const used = new Set([...existing.values(), ...[...nets.values()].map(n => n.idx)]);
  for (let i = 1; i <= 250; i++) if (!used.has(i)) return i;
  throw new Error('No free VPN slots on this VM (250 in use)');
}

// Write the files the helper reads for this VPN type (directory is private to the bridge user).
async function writeVpnFiles(ns, vpn) {
  const dir = `${BASE}/${ns}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const w = (name, content) => writeFile(`${dir}/${name}`, String(content ?? ''), { mode: 0o600 });
  const clean = (v) => String(v ?? '').replace(/[\r\n]/g, '').trim();
  await w('type', vpn.type);
  if (vpn.type === 'fortinet') {
    const gw = clean(vpn.gateway).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const [host, portInHost] = gw.split(':');
    const lines = [
      `host = ${host}`,
      `port = ${clean(vpn.port) || portInHost || '443'}`,
      `username = ${clean(vpn.username)}`,
      `password = ${clean(vpn.secret)}`,
    ];
    if (clean(vpn.realm)) lines.push(`realm = ${clean(vpn.realm)}`);
    if (clean(vpn.trusted_cert)) lines.push(`trusted-cert = ${clean(vpn.trusted_cert)}`);
    await w('forti.conf', lines.join('\n') + '\n');
  } else if (['anyconnect', 'globalprotect', 'pulse'].includes(vpn.type)) {
    const gw = clean(vpn.gateway);
    await w('gateway', vpn.port && !/:\d+/.test(gw.replace(/^https?:\/\//, '')) ? `${gw}:${clean(vpn.port)}` : gw);
    await w('user', clean(vpn.username));
    await w('pass', clean(vpn.secret) + '\n');
    await w('servercert', clean(vpn.trusted_cert));
    await w('authgroup', clean(vpn.realm));
  } else if (vpn.type === 'openvpn') {
    await w('openvpn.conf', vpn.config || '');
    await w('auth', vpn.username ? `${clean(vpn.username)}\n${clean(vpn.secret)}\n` : '');
  } else if (vpn.type === 'wireguard') {
    await w('wg.conf', vpn.config || '');
  } else {
    throw new Error(`Unsupported VPN type "${vpn.type}"`);
  }
}

async function vpnInterface(ns) {
  try { return await helper(['status', ns], { timeout: 5000 }); } catch { return null; }
}

// A readable reason from the VPN client's log (certificate pin to confirm, login refused…).
async function explainVpnFailure(ns) {
  const log = await helper(['log', ns], { timeout: 5000 }).catch(() => '');
  const pin = log.match(/trusted-cert\s*=?\s*([0-9a-f]{64})/i)?.[1];
  if (pin) {
    const subject = log.match(/subject:[\s\S]{0,40}?CN=([*\w.-]+)/i)?.[1];
    return `the gateway's certificate${subject ? ` (${subject})` : ''} could not be verified. If you trust it, paste this pin in the profile's "Gateway certificate" field: ${pin}`;
  }
  if (/permission denied|authentication failed|login failed|invalid (user|password)|VPN credentials/i.test(log)) {
    return 'the gateway refused the login — check the VPN user and password (and whether this account needs MFA)';
  }
  if (/could not resolve|name or service not known|connection refused|timed out|no route/i.test(log)) {
    return 'the VM could not reach the gateway — check the gateway host and port';
  }
  const last = log.split('\n').map(l => l.trim()).filter(l => /error|fail/i.test(l)).slice(-2).join(' · ');
  return last ? last.slice(0, 300) : `check gateway, user and password (log: ${BASE}/${ns}/vpn.log on the VM)`;
}

async function bringUp(vpn) {
  const ns = nsName(vpn.id);
  const idx = await pickIndex(ns);
  await helper(['up', ns, String(idx)]);
  await writeVpnFiles(ns, vpn);
  await helper(['vpn-stop', ns]).catch(() => {});
  await helper(['vpn-start', ns], { timeout: 45_000 });
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let iface = null;
  while (Date.now() < deadline) {
    iface = await vpnInterface(ns);
    if (iface) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!iface) {
    await helper(['vpn-stop', ns]).catch(() => {});
    throw new Error(`The VPN "${vpn.name ?? vpn.id}" did not connect within ${CONNECT_TIMEOUT_MS / 1000}s — ${await explainVpnFailure(ns)}`);
  }
  await helper(['socks', ns, String(idx)]);
  console.log(`[netns] ${vpn.type} VPN "${vpn.name ?? vpn.id}" up in ${ns} (${iface})`);
  return { ns, idx, iface, socksUrl: `socks5h://10.231.${idx}.2:1080` };
}

/**
 * Make sure the VPN of this profile is connected; returns the network for netContext.
 * Concurrent callers share one connection attempt. A profile whose settings changed
 * (updated_at) is reconnected.
 */
export async function ensureNetwork(vpn) {
  if (!vpn?.id) return null;
  const version = String(vpn.updated_at ?? '');
  let n = nets.get(vpn.id);
  if (n?.state === 'up' && n.version === version) {
    if (await vpnInterface(n.ns)) { n.lastUsed = Date.now(); return n; }
    console.warn(`[netns] VPN in ${n.ns} dropped — reconnecting`);
  }
  if (n?.pending) return n.pending;
  const entry = n ?? { id: vpn.id };
  nets.set(vpn.id, entry);
  entry.pending = (async () => {
    try {
      const up = await bringUp(vpn);
      Object.assign(entry, up, { type: vpn.type, name: vpn.name, version, state: 'up', error: null, lastUsed: Date.now() });
      return entry;
    } catch (e) {
      Object.assign(entry, { state: 'error', error: e.message });
      throw e;
    } finally {
      entry.pending = null;
    }
  })();
  return entry.pending;
}

export async function disconnectNetwork(id) {
  const n = nets.get(id);
  const ns = n?.ns ?? nsName(id);
  const idx = n?.idx ?? (await existingIndexes()).get(ns);
  if (idx) await helper(['down', ns, String(idx)]).catch(e => console.warn(`[netns] down ${ns}: ${e.message}`));
  nets.delete(id);
  console.log(`[netns] ${ns} disconnected`);
}

export async function networkStatus(id) {
  const n = nets.get(id);
  const ns = n?.ns ?? nsName(id);
  const iface = await vpnInterface(ns);
  return {
    id, ns, state: iface ? 'up' : (n?.pending ? 'connecting' : (n?.state === 'error' ? 'error' : 'down')),
    iface, error: n?.error ?? null, type: n?.type ?? null,
    idleMinutes: n?.lastUsed ? Math.round((Date.now() - n.lastUsed) / 60000) : null,
  };
}

export function touchNetwork(id) { const n = nets.get(id); if (n) n.lastUsed = Date.now(); }

/** Stop VPNs not used for IDLE_MS (the caller passes ids still used by open SAP connections). */
export async function reapIdleNetworks(idsInUse = new Set()) {
  for (const n of [...nets.values()]) {
    if (n.state !== 'up' || idsInUse.has(n.id)) continue;
    if (Date.now() - (n.lastUsed ?? 0) > IDLE_MS) {
      console.log(`[netns] ${n.ns} idle for ${Math.round(IDLE_MS / 60000)} min — disconnecting`);
      await disconnectNetwork(n.id);
    }
  }
}

/** Command + args to start a process inside the network (or on the VM network when null). */
export function spawnInNetwork(net, command, args) {
  if (!net) return { command, args };
  return { command: 'sudo', args: ['-n', HELPER, 'exec', net.ns, command, ...args] };
}
