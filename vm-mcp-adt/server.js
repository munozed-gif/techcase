#!/usr/bin/env node
/**
 * HTTP bridge: wraps mcp-abap-abap-adt-api (stdio) behind a
 * StreamableHTTP endpoint so Anthropic's MCP client can reach it.
 *
 * Setup: clone https://github.com/mario-andreschak/mcp-abap-abap-adt-api
 * into the SAME parent folder as this file, then build it:
 *   cd ../mcp-abap-abap-adt-api && npm install && npm run build
 *
 * ENV vars required:
 *   SAP_URL       e.g. https://your-sap-host:44300
 *   SAP_USER      e.g. BWDEVELOPER
 *   SAP_PASSWORD  your password
 *   SAP_CLIENT    e.g. 100  (default: 100)
 *   SAP_LANGUAGE  e.g. EN   (default: EN)
 *   PORT          HTTP port  (default: 3101)
 *
 *   ADT_PATH      override the path to index.js if needed
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const PORT = Number(process.env.PORT ?? 3101);
const SERVER_START = Date.now();
const __dir = dirname(fileURLToPath(import.meta.url));

// ── Laptop SOCKS5 tunnel helpers ──────────────────────────────
// When the laptop creates a reverse SSH tunnel (ssh -R 1080:...), all SAP traffic
// can route through the laptop's FortiClient VPN.
const SOCKS_PORT = Number(process.env.SOCKS_PORT ?? 1080);
const SOCKS_URL  = `socks5://127.0.0.1:${SOCKS_PORT}`;

function isSocksUp() {
  return new Promise(resolve => {
    const sock = net.createConnection({ host: '127.0.0.1', port: SOCKS_PORT });
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error',   () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

// SAP fetch — always uses https.request directly so we can:
//   1. Skip self-signed cert validation (SAP uses self-signed certs)
//   2. Optionally route through SOCKS5 when laptop tunnel is active
async function sapFetch(url, options = {}) {
  const useSocks = process.env.NO_SOCKS ? false : await isSocksUp();
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const mod = isHttps ? https : http;
  // The agent must match the protocol: an https.Agent on an http:// URL (e.g. a
  // private trial system on port 50000) throws 'Protocol "http:" not supported'.
  const agent = useSocks
    ? new SocksProxyAgent(SOCKS_URL)
    : (isHttps ? new https.Agent({ rejectUnauthorized: false }) : new http.Agent());
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent,
      ...(isHttps ? { rejectUnauthorized: false } : {}),
    };
    const req = mod.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: { get: (h) => res.headers[h.toLowerCase()] ?? null, entries: () => Object.entries(res.headers) },
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          text: async () => body.toString('utf8'),
          json: async () => JSON.parse(body.toString('utf8')),
        });
      });
    });
    req.on('error', reject);
    if (options.signal) {
      options.signal.addEventListener('abort', () => req.destroy(new Error('AbortError')));
    }
    const bodyData = options.body;
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// Resolve the ADT server entry point for each supported server type.
//   serverType 'abap-adt-readonly'  → mcp-abap-adt          (16 tools, read-only)
//   serverType 'abap-adt' (default) → mcp-abap-abap-adt-api (127 tools, read+write)
//
// Resolution order for each:
//   1. ADT_PATH / ADT_READONLY_PATH env var (explicit override)
//   2. Sibling git clone: ../mcp-abap-*/dist/index.js
//   3. npm package under node_modules/
function resolveAdtScript(serverType) {
  if (serverType === 'abap-adt-readonly') {
    if (process.env.ADT_READONLY_PATH) return process.env.ADT_READONLY_PATH;
    const sibling = resolve(__dir, '..', 'mcp-abap-adt', 'dist', 'index.js');
    if (existsSync(sibling)) return sibling;
    return resolve(__dir, 'node_modules', 'mcp-abap-adt', 'dist', 'index.js');
  }
  // default: abap-adt (read+write, 127 tools)
  if (process.env.ADT_PATH) return process.env.ADT_PATH;
  const sibling = resolve(__dir, '..', 'mcp-abap-abap-adt-api', 'dist', 'index.js');
  if (existsSync(sibling)) return sibling;
  return resolve(__dir, 'node_modules', 'mcp-abap-abap-adt-api', 'dist', 'index.js');
}

// Pre-resolve both scripts at startup so missing clones are caught early
const ADT_SCRIPTS = {
  'abap-adt':          resolveAdtScript('abap-adt'),
  'abap-adt-readonly': resolveAdtScript('abap-adt-readonly'),
};
Object.entries(ADT_SCRIPTS).forEach(([k, v]) => console.log(`[bridge] ${k}: ${v}`));

// ── Parse SAP credentials from Authorization header ──────────
// The app sends: Authorization: Bearer <base64(JSON)>
// JSON shape: { host, username, password, client, type, proxyUrl }
function parseSapCreds(authHeader) {
  try {
    if (!authHeader?.startsWith('Bearer ')) return null;
    return JSON.parse(Buffer.from(authHeader.slice(7), 'base64').toString('utf8'));
  } catch { return null; }
}

// ── Subprocess client pool (keyed by SAP host+user) ──────────
// mcp-abap-abap-adt-api enters an "interrupted" state (refusing further calls until
// login/dropSession) when an MCP call is cancelled mid-request. Its own SAP timeout is
// SAP_REQUEST_TIMEOUT_MS; give every MCP call a margin beyond that so the subprocess
// times out and reports first, instead of us cancelling it (README: "Cancellation
// closes real sockets ... an interrupted write may already have changed SAP").
const SAP_REQUEST_TIMEOUT_MS = 90000;
const MCP_CALL_TIMEOUT_MS    = SAP_REQUEST_TIMEOUT_MS + 15000;

const clientPool = new Map();
// Serializes all subprocess spawning — only one subprocess may be created at a time on this VM.
let _spawnMutex = Promise.resolve();

async function getClient(creds) {
  // Prefer per-request credentials from the auth token; fall back to .env
  const sapUrl      = creds?.host       || process.env.SAP_URL      || '';
  const sapUser     = creds?.username   || process.env.SAP_USER     || '';
  const sapPassword = creds?.password   || process.env.SAP_PASSWORD || '';
  const sapClient   = creds?.client     || process.env.SAP_CLIENT   || '100';
  const sapLanguage = process.env.SAP_LANGUAGE || 'EN';
  const serverType  = creds?.serverType || 'abap-adt';

  const adtScript = ADT_SCRIPTS[serverType] ?? ADT_SCRIPTS['abap-adt'];

  const key = `${sapUrl}|${sapUser}|${serverType}`;
  // Fast path — subprocess already connected
  if (clientPool.has(key)) return clientPool.get(key);

  // Acquire global spawn mutex: concurrent callers (e.g. infra check + write-queue poller)
  // both pass the pool check above because getClient is async. The mutex ensures only one
  // subprocess is ever being spawned at a time, preventing OOM on memory-constrained VMs.
  const _spawnResult = _spawnMutex.then(async () => {
    // Re-check after acquiring the lock — a concurrent call may have just spawned this client.
    if (clientPool.has(key)) return clientPool.get(key);

    // Evict all OTHER subprocess types before spawning (single-subprocess policy for this VM).
    for (const [k, c] of clientPool.entries()) {
      if (k !== key) { try { c.close?.(); } catch {} clientPool.delete(k); }
    }

    // Pass SOCKS5 proxy env vars to subprocesses — respected by axios, undici, and some node:https uses
    const proxyEnv = {};
    const socksActive = process.env.NO_SOCKS ? false : await isSocksUp();
    if (socksActive) {
      proxyEnv.ALL_PROXY   = SOCKS_URL;
      proxyEnv.HTTPS_PROXY = SOCKS_URL;
      proxyEnv.HTTP_PROXY  = SOCKS_URL;
    }

    // mcp-abap-abap-adt-api (R+W) throws if NODE_TLS_REJECT_UNAUTHORIZED=0 is set —
    // it explicitly blocks that flag and requires NODE_EXTRA_CA_CERTS instead.
    // mcp-abap-adt (R/O) uses TLS_REJECT_UNAUTHORIZED (a different var) — keep as-is.
    // mcp-abap-abap-adt-api only accepts an http:// SAP_URL with SAP_ALLOW_HTTP=1
    // ("explicitly permits a trusted private HTTP origin"). Allow it only for
    // private-network addresses (e.g. a trial system in the VM's own VPC), never
    // for public hosts.
    let privateHttp = false;
    try {
      const u = new URL(sapUrl);
      privateHttp = u.protocol === 'http:' &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost$)/.test(u.hostname);
    } catch {}
    const tlsEnv = serverType === 'abap-adt'
      ? {
          // Provide CA cert via env if available; if blank the subprocess uses system trust store
          ...(process.env.NODE_EXTRA_CA_CERTS
            ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
            : {}),
          ...(privateHttp ? { SAP_ALLOW_HTTP: '1' } : {}),
        }
      : {
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
          TLS_REJECT_UNAUTHORIZED: '0',
        };

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['--max-old-space-size=256', adtScript],
      env: {
        ...process.env,
        SAP_URL:      sapUrl,
        SAP_USER:     sapUser,
        SAP_USERNAME: sapUser,         // mcp-abap-adt uses SAP_USERNAME
        SAP_PASSWORD: sapPassword,
        SAP_CLIENT:   sapClient,
        SAP_LANGUAGE: sapLanguage,
        SAP_REQUEST_TIMEOUT_MS: String(SAP_REQUEST_TIMEOUT_MS),
        ...tlsEnv,
        ...proxyEnv,
      },
    });

    const client = new Client({ name: 'adt-http-bridge', version: '1.0.0' });
    await client.connect(transport);

    // mcp-abap-abap-adt-api runs ONE operation at a time on its single SAP session and
    // rejects overlaps with "SAP session is busy" (429). Several callers share this
    // subprocess (pipeline writes, infrastructure checks, Claude MCP sessions), so queue
    // every call: each starts only after the previous one has finished.
    const rawClientCallTool = client.callTool.bind(client);
    let callChain = Promise.resolve();
    client.callTool = (...callArgs) => {
      const run = callChain.then(() => rawClientCallTool(...callArgs));
      callChain = run.then(() => {}, () => {});
      return run;
    };

    transport.onclose = () => {
      console.warn(`[bridge] Client closed for ${key} — will respawn`);
      clientPool.delete(key);
    };

    clientPool.set(key, client);
    console.log(`[bridge] Connected subprocess (${serverType}) for ${sapUrl} / ${sapUser}`);
    return client;
  });

  // Advance the mutex regardless of success or failure so future spawns are not blocked.
  _spawnMutex = _spawnResult.then(() => {}, () => {});
  return _spawnResult;
}

// ── Auto-register tunnel URL in Supabase system_settings ─────
// When PUBLIC_URL + SUPABASE_URL + SUPABASE_ANON_KEY are set (via start-local.sh),
// upsert { key: 'adt_bridge_tunnel_url', value: PUBLIC_URL } so the platform can
// auto-detect the new URL without manual copy-paste after each restart.
async function registerTunnelUrl() {
  const publicUrl   = process.env.PUBLIC_URL?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  // Prefer service key (bypasses RLS); fall back to anon key
  // Strip any non-printable / non-ASCII chars that could corrupt the HTTP header
  const rawKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const supabaseKey = rawKey.trim().replace(/[^\x21-\x7E]/g, '');
  if (!publicUrl || !supabaseUrl || !supabaseKey) return;

  try {
    const endpoint = `${supabaseUrl}/rest/v1/system_settings`;
    const payload  = JSON.stringify({ key: 'adt_bridge_tunnel_url', value: publicUrl });
    const res = await new Promise((resolve, reject) => {
      const u = new URL(endpoint);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + '?on_conflict=key',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
      }, (r) => { r.resume(); resolve(r.statusCode); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    console.log(`[bridge] Registered tunnel URL in Supabase (HTTP ${res}): ${publicUrl}`);
  } catch (e) {
    console.warn(`[bridge] Could not register tunnel URL: ${e.message}`);
  }
}

// ── Express app ───────────────────────────────────────────────
const app = express();
// Raw body for /sap-proxy (SAP expects exact bytes); JSON for everything else
app.use('/sap-proxy', express.raw({ type: '*/*', limit: '4mb' }));
app.use(express.json({ limit: '4mb' }));

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,mcp-session-id,X-Sap-Target,X-App-Token,X-CSRF-Token,sap-client,corrNbr,Accept');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── App-user check on action endpoints ───────────────────────
// This bridge is reachable on a public Cloudflare URL, while mcp-abap-abap-adt-api is
// "a trusted operator tool, not … a multi-user service". SAP writes, the SAP proxy,
// VPN control and SAP checks therefore require a logged-in app user: the browser (or
// /api/adt-write on its behalf) sends its Supabase access token in X-App-Token, and we
// verify it with Supabase (production and preproduction). /health and /status stay open.
const APP_AUTH_PROJECTS = [
  [process.env.SUPABASE_URL,     process.env.SUPABASE_SERVICE_KEY],
  [process.env.SUPABASE_URL_DEV, process.env.SUPABASE_SERVICE_KEY_DEV],
].map(([u, k]) => [String(u || '').trim().replace(/\/$/, ''), String(k || '').trim().replace(/[^\x21-\x7E]/g, '')])
 .filter(([u, k]) => u && k);
const _appTokenCache = new Map(); // token -> valid-until (ms)
async function isValidAppToken(token) {
  if (!token || typeof token !== 'string') return false;
  const now = Date.now();
  if ((_appTokenCache.get(token) ?? 0) > now) return true;
  for (const [url, key] of APP_AUTH_PROJECTS) {
    try {
      const r = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        if (_appTokenCache.size > 500) _appTokenCache.clear();
        _appTokenCache.set(token, now + 5 * 60 * 1000);
        return true;
      }
    } catch { /* try the next project */ }
  }
  return false;
}
let _warnedNoAppAuth = false;
async function requireAppUser(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (process.env.BRIDGE_ALLOW_ANONYMOUS === '1') return next();
  if (!APP_AUTH_PROJECTS.length) {
    if (!_warnedNoAppAuth) { console.warn('[bridge] No Supabase credentials — cannot verify app users; action endpoints are OPEN'); _warnedNoAppAuth = true; }
    return next();
  }
  if (await isValidAppToken(req.headers['x-app-token'])) return next();
  return res.status(401).json({ ok: false, error: 'App login required — sign in to the platform and retry' });
}
app.use(['/sap-proxy', '/vpn', '/sap-write', '/sap-write-mcp', '/sap-info', '/mcp-test'], requireAppUser);

// Health endpoint (used by infrastructure check)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'abap-adt-bridge',
    version: '1.0.0',
    servers: {
      'abap-adt':          { available: existsSync(ADT_SCRIPTS['abap-adt']),          tools: 127 },
      'abap-adt-readonly': { available: existsSync(ADT_SCRIPTS['abap-adt-readonly']), tools: 16  },
    },
    // runtime state — helps infra check show full MCP chain
    activeSessions: null, // filled after sessions Map is defined (see /mcp-probe)
    poolClients: null,
  });
});

// MCP probe — reports runtime subprocess pool + session state
// Handler runs only after full module init so clientPool and sessions are always defined
app.get('/mcp-probe', (_req, res) => {
  res.json({
    ok: true,
    activeSessions: sessions.size,
    poolClients:    clientPool.size,
    poolKeys:       [...clientPool.keys()],
    rw: { path: ADT_SCRIPTS['abap-adt'],         exists: existsSync(ADT_SCRIPTS['abap-adt']) },
    ro: { path: ADT_SCRIPTS['abap-adt-readonly'], exists: existsSync(ADT_SCRIPTS['abap-adt-readonly']) },
  });
});

// Infrastructure status — mirrors /status on the custom MCP server
app.get('/status', async (_req, res) => {
  let vpn = false, vpnDetail = '', vpnService = '';
  const isMac = process.platform === 'darwin';
  try {
    try {
      // Mac (FortiClient uses utun*): use ifconfig; Linux: use ip link
      let ifaces = '';
      if (isMac) {
        ifaces = execSync('ifconfig 2>/dev/null | grep -oE "^(ppp|tun|utun)[0-9]+" | head -3', { timeout: 2000 }).toString().trim();
      } else {
        ifaces = execSync('ip link show up 2>/dev/null | grep -oE "(ppp|tun)[0-9]+" | head -3', { timeout: 2000 }).toString().trim();
      }
      if (ifaces) {
        const ifName = ifaces.split('\n')[0].trim();
        vpn = true; vpnService = ifName;
        vpnDetail = isMac ? `FortiClient connected (${ifName})` : `Tunnel up (${ifName})`;
        if (!isMac) {
          for (const svc of ['openfortivpn@vpn', 'openfortivpn', 'wg-quick@wg0', 'wireguard']) {
            try {
              const st = execSync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 1500 }).toString().trim();
              if (st === 'active') { vpnService = svc; vpnDetail = `Connected (${svc})`; break; }
            } catch { /* try next */ }
          }
        }
      } else {
        let svcActive = '';
        if (!isMac) {
          for (const svc of ['openfortivpn@vpn', 'openfortivpn', 'wg-quick@wg0', 'wireguard']) {
            try {
              const st = execSync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 1500 }).toString().trim();
              if (st === 'active') { svcActive = svc; break; }
            } catch { /* try next */ }
          }
        }
        vpn = false;
        vpnDetail = svcActive ? `Service running (${svcActive}) but tunnel interface missing — VPN dropped` : 'No VPN service detected';
        vpnService = svcActive;
      }
    } catch { vpnDetail = 'inactive'; }
  } catch (e) { vpnDetail = e.message?.slice(0, 80) ?? 'error'; }

  const laptopTunnel = await isSocksUp();

  const uptime = Math.floor((Date.now() - SERVER_START) / 1000);
  res.json({
    vm: true, mcp: true, vpn, vpnDetail, vpnService,
    laptopTunnel,
    laptopTunnelDetail: laptopTunnel ? `SOCKS5 tunnel active (127.0.0.1:${SOCKS_PORT}) — SAP routed via laptop VPN` : `No laptop tunnel (run: microsocks + ssh -R ${SOCKS_PORT})`,
    version: '1.0.0', uptime, timestamp: new Date().toISOString(),
  });
});

// VPN control — mirrors /vpn/start and /vpn/stop on the custom MCP server
app.post('/vpn/:action(start|stop|restart)', async (req, res) => {
  const action = req.params.action;
  try {
    const vpnCfg = req.body?.host ? req.body : null;

    if (action === 'start' && vpnCfg?.host) {
      const lines = [`host = ${vpnCfg.host}`, `port = ${vpnCfg.port || '443'}`, `username = ${vpnCfg.username || ''}`];
      if (vpnCfg.trusted_cert) lines.push(`trusted-cert = ${vpnCfg.trusted_cert}`);
      execSync('sudo mkdir -p /etc/openfortivpn', { timeout: 3000 });
      execSync('sudo tee /etc/openfortivpn/vpn.conf', { input: lines.join('\n') + '\n', timeout: 5000 });
      execSync('sudo chmod 600 /etc/openfortivpn/vpn.conf', { timeout: 3000 });
      execSync('sudo tee /etc/openfortivpn/.pw', { input: vpnCfg.password || '', timeout: 3000 });
      execSync('sudo chmod 600 /etc/openfortivpn/.pw', { timeout: 3000 });
      const wrapper = `#!/bin/bash\nexec /usr/bin/openfortivpn -c /etc/openfortivpn/vpn.conf -p "$(sudo cat /etc/openfortivpn/.pw)"\n`;
      execSync('sudo tee /etc/openfortivpn/start.sh', { input: wrapper, timeout: 3000 });
      execSync('sudo chmod 755 /etc/openfortivpn/start.sh', { timeout: 3000 });
      const dropin = `[Service]\nExecStart=\nExecStart=/etc/openfortivpn/start.sh\nRestart=no\n`;
      execSync('sudo mkdir -p /etc/systemd/system/openfortivpn@vpn.service.d', { timeout: 3000 });
      execSync('sudo tee /etc/systemd/system/openfortivpn@vpn.service.d/override.conf', { input: dropin, timeout: 3000 });
      execSync('sudo systemctl daemon-reload', { timeout: 5000 });
    }

    if (action === 'stop') {
      const noRestart = `[Service]\nExecStart=\nExecStart=/etc/openfortivpn/start.sh\nRestart=no\nRestartSec=30\n`;
      execSync('sudo mkdir -p /etc/systemd/system/openfortivpn@vpn.service.d', { timeout: 3000 });
      execSync('sudo tee /etc/systemd/system/openfortivpn@vpn.service.d/override.conf', { input: noRestart, timeout: 3000 });
      execSync('sudo systemctl daemon-reload', { timeout: 5000 });
      execSync('sudo systemctl stop openfortivpn@vpn', { timeout: 30000 });
      execSync('sudo systemctl disable openfortivpn@vpn 2>/dev/null || true', { timeout: 5000 });
    } else {
      execSync(`sudo systemctl ${action} openfortivpn@vpn`, { timeout: 120000 });
    }
    const out = execSync('if systemctl is-active --quiet openfortivpn@vpn 2>/dev/null; then echo active; else echo inactive; fi', { timeout: 4000 }).toString().trim();
    res.json({ ok: true, vpn: out === 'active', vpnDetail: out });
  } catch (e) {
    res.json({ ok: false, error: e.message?.slice(0, 200) });
  }
});

// SAP CORS proxy — browser sends ADT requests here, bridge forwards to SAP
// Same chain as infrastructure check: browser → tunnel → bridge → VM VPN → SAP
// The browser sets X-Sap-Target to the SAP host URL; we strip it and forward.
app.all('/sap-proxy*', async (req, res) => {
  const sapTarget = req.headers['x-sap-target'];
  if (!sapTarget) return res.status(400).json({ error: 'Missing X-Sap-Target header' });

  const adtPath = req.path.replace(/^\/sap-proxy/, '') || '/';
  // Only SAP ADT/ICF paths (as mcp-abap-abap-adt-api: "HTTP stays … under /sap/").
  if (!adtPath.startsWith('/sap/')) return res.status(400).json({ error: 'Only /sap/... paths can be proxied' });
  let _targetOk = false;
  try { _targetOk = /^https?:$/.test(new URL(sapTarget).protocol); } catch {}
  if (!_targetOk) return res.status(400).json({ error: 'Invalid X-Sap-Target' });
  const targetUrl = sapTarget.replace(/\/$/, '') + adtPath + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');

  const SKIP_REQ = new Set(['host', 'x-sap-target', 'x-app-token', 'connection', 'transfer-encoding', 'keep-alive']);
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP_REQ.has(k.toLowerCase())) forwardHeaders[k] = v;
  }
  forwardHeaders['host'] = new URL(sapTarget).host;

  try {
    const sapRes = await sapFetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : (req.body?.length ? req.body : undefined),
      signal: AbortSignal.timeout(30000),
    });

    const SKIP_RES = new Set(['transfer-encoding', 'connection', 'keep-alive', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']);
    for (const [k, v] of sapRes.headers.entries()) {
      if (!SKIP_RES.has(k.toLowerCase())) res.setHeader(k, v);
    }
    res.status(sapRes.status);
    const buf = await sapRes.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (e) {
    res.status(502).json({ error: `SAP proxy error: ${e.message?.slice(0, 120)}` });
  }
});

// SAP connectivity test — mirrors /sap-info on the custom MCP server
// Accepts SAP creds from Authorization header (same base64 JSON token as /mcp)
// OR from request body { host, username, password, client }
app.post('/sap-info', async (req, res) => {
  try {
    const creds = parseSapCreds(req.headers['authorization']) || {};
    const host     = (creds.host     || req.body?.host     || process.env.SAP_URL      || '').replace(/\/$/, '');
    const username = creds.username  || req.body?.username || '';
    const password = creds.password  || req.body?.password || '';
    // Callers must bring their own SAP credentials: never fall back to the VM's .env user.
    if (!username || !password) return res.status(401).json({ ok: false, error: 'SAP credentials required' });
    const client   = creds.client    || req.body?.client   || process.env.SAP_CLIENT   || '100';

    if (!host || !username || !password) {
      return res.json({ ok: false, error: 'Missing SAP credentials' });
    }

    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
    const url = `${host}/sap/bc/adt/discovery`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let r;
    try {
      r = await sapFetch(url, {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'sap-client': client,
          'Accept': 'application/atomsvc+xml',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (r.ok || r.status === 401 || r.status === 403) {
      // 401/403 means SAP is reachable, just wrong creds/perms
      if (r.ok) {
        res.json({ ok: true, status: r.status, systemInfo: `${host} (ADT reachable)` });
      } else {
        res.json({ ok: false, status: r.status, error: r.status === 401 ? 'Invalid credentials' : 'No ADT authorization' });
      }
    } else {
      res.json({ ok: false, status: r.status, error: `HTTP ${r.status}` });
    }
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'SAP request timed out' : (err.message?.slice(0, 80) || 'Connection failed');
    res.json({ ok: false, error: msg });
  }
});

// MCP connectivity test — spawns both subprocesses and calls listTools (no SAP call)
// Proves subprocess can start and speak MCP protocol. Use for infra check "MCP read/write" step.
// Body: { host, username, password, client }
app.post('/mcp-test', async (req, res) => {
  const creds     = parseSapCreds(req.headers['authorization']) || {};
  const host      = (creds.host     || req.body?.host     || '').replace(/\/$/, '');
  const username  =  creds.username || req.body?.username || '';
  const password  =  creds.password || req.body?.password || '';
  const sapClient =  creds.client   || req.body?.client   || '100';

  if (!host || !username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing SAP credentials' });
  }

  const rw = { ok: false, tools: 0, error: null };
  const ro = { ok: false, tools: 0, error: null };

  // Test subprocesses SEQUENTIALLY — never both alive simultaneously (VM memory constraint).
  // R+W: mcp-abap-abap-adt-api (127 tools) — spawn, test, then evict before R/O
  try {
    const rwClient = await getClient({ host, username, password, client: sapClient, serverType: 'abap-adt' });
    const list = await rwClient.listTools();
    rw.ok = true;
    rw.tools = list?.tools?.length ?? 0;
  } catch (e) {
    rw.error = e.message?.slice(0, 150) ?? 'spawn failed';
  } finally {
    const rwKey = `${host}|${username}|abap-adt`;
    if (clientPool.has(rwKey)) {
      try { clientPool.get(rwKey).close?.(); } catch {}
      clientPool.delete(rwKey);
    }
  }

  // R/O: mcp-abap-adt (16 tools) — spawn, test, then evict
  try {
    const roClient = await getClient({ host, username, password, client: sapClient, serverType: 'abap-adt-readonly' });
    const list = await roClient.listTools();
    ro.ok = true;
    ro.tools = list?.tools?.length ?? 0;
  } catch (e) {
    ro.error = e.message?.slice(0, 150) ?? 'spawn failed';
  } finally {
    const roKey = `${host}|${username}|abap-adt-readonly`;
    if (clientPool.has(roKey)) {
      try { clientPool.get(roKey).close?.(); } catch {}
      clientPool.delete(roKey);
    }
  }

  res.json({ ok: rw.ok || ro.ok, rw, ro });
});

// SAP write endpoint — does the full CSRF-fetch + PUT in one server-side session
// so SAP session cookies are maintained and the CSRF token is always valid.
// Body: { host, username, password, client, path, source, transport? }
app.post('/sap-write', async (req, res) => {
  try {
    const creds = parseSapCreds(req.headers['authorization']) || {};
    const host      = (creds.host     || req.body?.host     || process.env.SAP_URL      || '').replace(/\/$/, '');
    const username  = creds.username  || req.body?.username || '';
    const password  = creds.password  || req.body?.password || '';
    // Callers must bring their own SAP credentials: never fall back to the VM's .env user.
    if (!username || !password) return res.status(401).json({ ok: false, error: 'SAP credentials required' });
    const client    = creds.client    || req.body?.client   || process.env.SAP_CLIENT   || '100';
    const adtPath   = req.body?.path;
    const source    = req.body?.source;
    const transport = req.body?.transport;

    if (!host || !username || !password || !adtPath || source === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: host, username, password, path, source' });
    }

    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
    const baseHeaders = {
      'Authorization': `Basic ${basicAuth}`,
      'sap-client': client,
    };

    // Step 1: fetch CSRF token (server-side — session cookie stays in https.Agent)
    const csrfRes = await sapFetch(`${host}/sap/bc/adt/discovery`, {
      headers: { ...baseHeaders, 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
      signal: AbortSignal.timeout(15000),
    });

    const csrfToken = csrfRes.headers.get('x-csrf-token') || '';
    // Node's http module returns set-cookie as an array; handle both array and string
    const setCookieRaw = csrfRes.headers.get('set-cookie');
    const setCookieArr = Array.isArray(setCookieRaw) ? setCookieRaw : (setCookieRaw ? [setCookieRaw] : []);
    const cookieHeader = setCookieArr.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    if (!csrfRes.ok && csrfRes.status !== 200) {
      return res.json({ ok: false, status: csrfRes.status, phase: 'csrf', error: `CSRF fetch failed HTTP ${csrfRes.status}` });
    }

    // Step 2: PUT the source code with the CSRF token and session cookie
    const putHeaders = {
      ...baseHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      Accept: 'application/xml',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(transport ? { corrNbr: transport } : {}),
    };

    const putUrl = `${host}${adtPath}`;
    const putRes = await sapFetch(putUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: source,
      signal: AbortSignal.timeout(30000),
    });

    const body = await putRes.text().catch(() => '');
    res.json({ ok: putRes.ok, status: putRes.status, phase: 'write', body: body.slice(0, 400) });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out' : (err.message?.slice(0, 120) || 'Write failed');
    res.status(502).json({ ok: false, error: msg });
  }
});

// ── R/O object verification via mcp-abap-adt ─────────────────
// After a write, reads back the object using the read-only subprocess and
// returns a short summary so the platform can show it in the implementation log.
async function verifyWithRO(host, username, password, client, objtype, resolvedName) {
  try {
    const roClient = await getClient({ host, username, password, client, serverType: 'abap-adt-readonly' });

    // Discover available tools so we can pick the right one without hardcoding names.
    const listed = await roClient.listTools();
    const toolList = listed?.tools ?? [];

    // Object-type → ordered list of tool name fragments to look for (case-insensitive).
    const hints = {
      'PROG/P': ['getprogram', 'readprogram', 'program'],
      'PROG/I': ['getinclude', 'include', 'getprogram'],
      'CLAS/OC': ['getclass', 'readclass', 'class'],
      'FUGR/FF': ['getfunctiongroup', 'functiongroup', 'getfunction'],
      'DOMA/DD': ['getdomain', 'domain'],
      'DTEL/DE': ['getdataelement', 'dataelement', 'element'],
      'MSAG/N':  ['getmessageclass', 'messageclass', 'message'],
      'TABL/DT': ['gettable', 'table'],
      'STRU/DS': ['getstructure', 'structure'],
      'TABL/DS': ['getstructure', 'structure'],
    };
    const candidates = hints[objtype] ?? ['getobject', 'readobject', 'get', 'read'];
    const matched = toolList.find(t =>
      candidates.some(h => t.name.toLowerCase().includes(h))
    ) ?? toolList.find(t => /^get|^read/i.test(t.name));

    if (!matched) {
      return { ok: false, skipped: true, reason: `No read tool found for ${objtype} in R/O server (${toolList.length} tools available)` };
    }

    // Determine argument key from the tool's input schema (first required property).
    const schema = matched.inputSchema ?? matched.input_schema ?? {};
    const props   = schema.properties ?? {};
    const required = schema.required ?? [];
    const argKey  = required[0] ?? Object.keys(props)[0] ?? 'name';

    const vr    = await roClient.callTool({ name: matched.name, arguments: { [argKey]: resolvedName } });
    if (vr?.isError) throw new Error(vr.content?.[0]?.text ?? 'R/O tool isError');
    const text  = vr?.content?.[0]?.text ?? '';
    // Trim to a one-paragraph summary: first 400 chars, then a JSON preview of the whole result
    const excerpt = text.slice(0, 400).replace(/\s+/g, ' ').trim();

    return { ok: true, tool: matched.tool ?? matched.name, excerpt };
  } catch (e) {
    return { ok: false, error: e.message?.slice(0, 150) };
  }
}

// ── Transport auto-creation via ADT CTS API ───────────────────
// SAP object short texts (adtcore:description) are limited to 60 characters;
// longer ones fail with "The description is too long" (ExceptionInvalidData).
// Collapse whitespace and cut at a word boundary when possible.
function sapShortText(text, max = 60) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp >= max / 2 ? cut.slice(0, sp) : cut).replace(/[\s.,;:(\-–—]+$/, '');
}

// Accept header for "does this object exist?" GETs. ADT DDIC endpoints (data
// elements, domains, ...) only serve their vendor XML types and answer a plain
// application/xml request with 406 Not Acceptable even when the object exists,
// which made every data-element verify fail. List the vendor types first and
// fall back to anything, so SAP answers 200 (exists) or 404 (missing).
const ADT_VERIFY_ACCEPT = [
  'application/vnd.sap.adt.dataelements.v2+xml',
  'application/vnd.sap.adt.dataelements.v1+xml',
  'application/vnd.sap.adt.domains.v2+xml',
  'application/vnd.sap.adt.domains.v1+xml',
  'application/vnd.sap.adt.mc.messageclass+xml',
  'application/xml',
  '*/*',
].join(', ');

async function createTransportViaAdt(host, username, password, client, description) {
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const baseHeaders = { Authorization: auth, 'sap-client': client };

  // 1. Fetch CSRF token
  const csrfRes = await sapFetch(`${host}/sap/bc/adt/cts/transportrequests`, {
    method: 'GET',
    headers: { ...baseHeaders, 'X-CSRF-Token': 'Fetch', Accept: 'application/xml' },
    signal: AbortSignal.timeout(30000),
  });
  const csrfToken = csrfRes.headers.get('x-csrf-token') || '';
  const setCookieRaw = csrfRes.headers.get('set-cookie');
  const setCookieArr = Array.isArray(setCookieRaw) ? setCookieRaw : (setCookieRaw ? [setCookieRaw] : []);
  const cookieHeader = setCookieArr.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  if (!csrfToken || csrfToken === 'Required') {
    throw new Error(`CSRF fetch for TR creation failed HTTP ${csrfRes.status}`);
  }

  // 2. Create workbench transport request
  const safeDesc = description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:category="Workbench" tm:description="${safeDesc}"/>`;

  const createRes = await sapFetch(`${host}/sap/bc/adt/cts/transportrequests`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/vnd.sap.cts.transport.request+xml',
      Accept: 'text/plain',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: xmlBody,
    signal: AbortSignal.timeout(20000),
  });

  const respText = await createRes.text().catch(() => '');
  if (!createRes.ok && createRes.status !== 201) {
    throw new Error(`TR creation failed HTTP ${createRes.status}: ${respText.slice(0, 400)}`);
  }

  // TR number from Location header (preferred) or response body
  const location = createRes.headers.get('location') || '';
  const trPattern = /[A-Z]{1,4}K\d{6}/i;
  const fromLoc = location.match(trPattern);
  if (fromLoc) return fromLoc[0].toUpperCase();
  const fromBody = respText.match(trPattern);
  if (fromBody) return fromBody[0].toUpperCase();

  throw new Error(`TR created but could not parse TR number (Location: ${location || 'none'}, body: ${respText.slice(0, 80)})`);
}

// POST /sap-write-mcp — uses the mcp-abap-abap-adt-api MCP tools:
// Normal:      lock → setObjectSource → unLock → activateByName (+ optional createObject)
// createOnly:  createObject → lock → unLock → activateByName  (domain / data_element / message_class — no source)
// Body: { host, username, password, client, path, source, transport?,
//         autoCreate?, createOnly?, objtype?, name?, parentName?, description?,
//         parentPath?, objectSpec? }
app.post('/sap-write-mcp', async (req, res) => {
  try {
    const creds      = parseSapCreds(req.headers['authorization']) || {};
    const host       = (creds.host     || req.body?.host     || process.env.SAP_URL      || '').replace(/\/$/, '');
    const username   = creds.username  || req.body?.username || '';
    const password   = creds.password  || req.body?.password || '';
    // Callers must bring their own SAP credentials: never fall back to the VM's .env user.
    if (!username || !password) return res.status(401).json({ ok: false, error: 'SAP credentials required' });
    const sapClient  = creds.client    || req.body?.client   || process.env.SAP_CLIENT   || '100';
    const adtPath    = req.body?.path;
    const source     = req.body?.source;
    let   transport  = req.body?.transport || null;
    // Where the transport came from: 'request' (sent by the app), 'locked' (SAP says the
    // object is already locked in it), 'created' (new request made here), or null.
    let   transportSource = transport ? 'request' : null;
    // Description for a transport created here (the app sends one per case).
    const transportDescription = req.body?.transportDescription || null;
    const autoCreate = !!req.body?.autoCreate;
    const createOnly = !!req.body?.createOnly;
    const objtype    = req.body?.objtype;
    const objName    = req.body?.name;
    const parentName = req.body?.parentName  || '$TMP';
    const description= sapShortText(req.body?.description);
    const parentPath = req.body?.parentPath  || `/sap/bc/adt/packages/${(req.body?.parentName || '$TMP')}`;
    const policy     = req.body?.policy      || {};
    const capabilities = req.body?.capabilities || {};
    const effectivePolicy = {
      autoCreateTransport: true, activateAfterWrite: true, verifyAfterWrite: true,
      syntaxCheckBeforeWrite: false, stopOnSyntaxError: true,
      ...policy,
    };
    const effectiveCaps = {
      hasCts: true, hasRwMcp: true, hasRoMcp: true, hasSyntaxCheck: true, hasActivation: true,
      ...capabilities,
    };

    if (!host || !username || !password || !adtPath) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: host, username, password, path' });
    }
    if (!createOnly && source === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required field: source' });
    }

    const objectUrl       = adtPath.replace(/\/source\/main$/, '');
    const objectSourceUrl = adtPath;
    const resolvedName    = objName || objectUrl.split('/').pop()?.toUpperCase() || '';

    const creds4Pool = { host, username, password, client: sapClient, serverType: 'abap-adt' };

    const parseMcpText = (result) => {
      try { return JSON.parse(result?.content?.[0]?.text ?? '{}'); }
      catch { return { raw: result?.content?.[0]?.text }; }
    };

    // callTool: wraps client.callTool with two layers of protection:
    //   1. isError: true in the result → convert to thrown Error (SAP rejected the call)
    //   2. -32000 crash code → delete pool entry and retry once with a fresh subprocess
    // Calls that are safe to repeat after the SAP session was interrupted: reads and
    // idempotent steps. Anything else (createTransport, createObject, deletes, releases…)
    // may already have run in SAP and is NOT repeated — mcp-abap-abap-adt-api "does not
    // retry mutations" and says to "inspect writes and locks" first.
    const SAFE_TO_REPEAT = new Set([
      'searchObject', 'transportInfo', 'objectStructure', 'getObjectSource', 'ddicElement',
      'syntaxCheckCode', 'lock', 'unLock', 'setObjectSource', 'activateByName', 'healthcheck',
    ]);
    // "Previous operation was interrupted…": rejected BEFORE running → always safe to repeat.
    const INTERRUPTED_RE = /interrupted.*(login|dropSession)|dropSession before continuing/i;
    // This call itself ran into a timeout/cancellation → it may have reached SAP.
    const RAN_AND_CUT_RE = /SAP operation cancelled or timed out|Request timed out|-32001/i;
    const CRASH_RE       = /connection closed|-32000/i;

    async function callTool(name, args) {
      async function rawCall(c) {
        const result = await c.callTool({ name, arguments: args }, undefined, { timeout: MCP_CALL_TIMEOUT_MS });
        if (result?.isError) {
          const errText = result.content?.[0]?.text ?? 'tool returned isError';
          console.error(`[bridge] ${name} isError — ${errText.slice(0, 200)}`);
          const sapErr = new Error(errText.slice(0, 300));
          sapErr.isSapError = true;
          throw sapErr;
        }
        return result;
      }
      const poolKey = `${host}|${username}|abap-adt`;
      async function respawn() {
        try { clientPool.get(poolKey)?.close?.(); } catch {}
        clientPool.delete(poolKey);
        return getClient(creds4Pool);
      }
      async function recoverSession(c) {
        try { await c.callTool({ name: 'dropSession', arguments: {} }, undefined, { timeout: MCP_CALL_TIMEOUT_MS }); }
        catch (dsErr) { console.warn(`[bridge] dropSession failed: ${dsErr.message?.slice(0, 80)}`); }
        try { await c.callTool({ name: 'login', arguments: {} }, undefined, { timeout: MCP_CALL_TIMEOUT_MS }); }
        catch (liErr) { console.warn(`[bridge] login failed: ${liErr.message?.slice(0, 80)}`); }
      }

      let client = await getClient(creds4Pool);
      try {
        return await rawCall(client);
      } catch (e0) {
        const msg0 = e0?.message ?? '';
        const rejectedBeforeRunning = INTERRUPTED_RE.test(msg0);
        const ranAndCut = !rejectedBeforeRunning && RAN_AND_CUT_RE.test(msg0);
        const crashed   = !rejectedBeforeRunning && !ranAndCut && !e0?.isSapError && (e0?.code === -32000 || CRASH_RE.test(msg0));
        if (!rejectedBeforeRunning && !ranAndCut && !crashed) throw e0;
        if (name === 'dropSession' || name === 'login') throw e0;

        const why = rejectedBeforeRunning ? 'session was in interrupted state' : ranAndCut ? 'call was cancelled/timed out' : 'subprocess crashed';
        console.warn(`[bridge] '${name}': ${why} — recovering SAP session`);
        if (crashed) client = await respawn();
        await recoverSession(client);

        if (!rejectedBeforeRunning && !SAFE_TO_REPEAT.has(name)) {
          const err = new Error(`SAP ${name} was cancelled or timed out and was NOT repeated — it may already have run in SAP (session recovered).`);
          err.notRepeated = true;
          throw err;
        }
        try {
          return await rawCall(client);
        } catch (e2) {
          if (!INTERRUPTED_RE.test(e2?.message ?? '')) throw e2;
          // Session still stuck after in-place recovery: replace the subprocess once.
          console.warn(`[bridge] '${name}': session still interrupted — replacing subprocess`);
          client = await respawn();
          await recoverSession(client);
          return await rawCall(client);
        }
      }
    }

    // Inspect before writing (mcp-abap-abap-adt-api README: "inspect writes and locks").
    // searchObject sees active and inactive repository objects. Returns true/false, or
    // null when the search fails or can't be parsed (then we fall back to create-and-see).
    async function existsInRepository() {
      try {
        const r = parseMcpText(await callTool('searchObject', { query: resolvedName }));
        const items = Array.isArray(r) ? r : Array.isArray(r?.results) ? r.results : null;
        if (!items) return null;
        const typePrefix = String(objtype ?? '').split('/')[0].toUpperCase();
        return items.some(o =>
          String(o?.['adtcore:name'] ?? o?.name ?? '').toUpperCase() === resolvedName.toUpperCase()
          && (!typePrefix || String(o?.['adtcore:type'] ?? o?.type ?? '').toUpperCase().startsWith(typePrefix)));
      } catch (e) {
        console.warn(`[bridge] searchObject pre-check failed (${e.message?.slice(0, 80)}) — continuing`);
        return null;
      }
    }

    async function doLock() {
      const r = parseMcpText(await callTool('lock', { objectUrl }));
      const handle = r.lockHandle || r.lock_handle || r.handle;
      if (!handle) throw new Error(`Lock returned no handle: ${JSON.stringify(r).slice(0, 200)}`);
      return handle;
    }

    // mcp-abap-abap-adt-api README: "Obtain the transport request number (e.g., from
    // transportInfo or from the user)". If SAP reports the object is already locked in a
    // request, it must be written into that request — reuse it instead of creating one.
    if (!transport && parentName && parentName !== '$TMP' && effectiveCaps.hasCts !== false) {
      try {
        const ti = parseMcpText(await callTool('transportInfo', { objSourceUrl: objectUrl }));
        const lockedTr = ti?.LOCKS?.HEADER?.TRKORR || ti?.transportInfo?.LOCKS?.HEADER?.TRKORR || ti?.TRKORR || null;
        if (lockedTr) {
          transport = String(lockedTr).trim();
          transportSource = 'locked';
          console.log(`[bridge] transportInfo: ${resolvedName} is already in ${transport} — reusing it`);
        }
      } catch (tiErr) {
        // Typical for objects that don't exist yet; fall through to creating a request.
        console.log(`[bridge] transportInfo gave no request for ${resolvedName}: ${tiErr.message?.slice(0, 120)}`);
      }
    }

    // Auto-create transport via MCP createTransport tool (uses subprocess's live authenticated session —
    // avoids the cold CSRF GET to /sap/bc/adt/cts/transportrequests that AbortErrors on this VM).
    // Falls back to direct HTTP if the MCP tool is unavailable, then proceeds without TR as last resort.
    if (!transport && parentName && parentName !== '$TMP' && effectivePolicy.autoCreateTransport && effectiveCaps.hasCts) {
      const trDesc = transportDescription
        ? sapShortText(transportDescription)
        : `Techcase: ${resolvedName}${description ? ' - ' + description : ''}`.slice(0, 60);
      console.log(`[bridge] [timing] createTransport start for ${resolvedName} (MCP tool)`);
      const _trStart = Date.now();
      try {
        const trResult = parseMcpText(await callTool('createTransport', {
          objSourceUrl: `/sap/bc/adt/packages/${parentName}`,
          REQUEST_TEXT: trDesc,
          DEVCLASS: parentName,
        }));
        transport = trResult?.transportNumber ?? trResult?.TRKORR ?? trResult?.trkorr ?? null;
        if (transport) {
          transportSource = 'created';
          console.log(`[bridge] [timing] createTransport (MCP) done in ${Date.now() - _trStart}ms → ${transport}`);
        } else {
          console.warn(`[bridge] createTransport (MCP) returned no TR number: ${JSON.stringify(trResult).slice(0, 200)}`);
        }
      } catch (trMcpErr) {
        if (trMcpErr.notRepeated) {
          // The request may already exist in SAP: creating another one would duplicate it.
          return res.json({ ok: false, step: 'createTransport',
            error: `Creating the transport request was interrupted and NOT repeated — a request "${trDesc}" may already exist in SAP. Check SE09/SE10, enter it as the case's Transport Request, then retry.` });
        }
        console.warn(`[bridge] createTransport (MCP) failed: ${trMcpErr.message?.slice(0, 200)} — falling back to direct HTTP`);
        try {
          transport = await createTransportViaAdt(host, username, password, sapClient, trDesc);
          if (transport) transportSource = 'created';
          console.log(`[bridge] [timing] createTransport (HTTP fallback) done in ${Date.now() - _trStart}ms → ${transport}`);
        } catch (trErr) {
          console.warn(`[bridge] Could not auto-create transport (HTTP fallback): ${trErr.message?.slice(0, 200)}`);
          // Non-fatal: proceed without TR (object will be in SAP's default open request)
        }
      }
    }

    // ── createOnly path: domain / data_element / message_class ──────────────
    // These have no ABAP source/main. Create via MCP createObject + activate.
    if (createOnly) {
      if (!objtype || !resolvedName) {
        return res.status(400).json({ ok: false, error: 'createOnly requires objtype and name' });
      }
      const _coT0 = Date.now();
      const _coElapsed = () => `+${Math.round((Date.now() - _coT0) / 1000)}s`;
      console.log(`[bridge] [timing] createOnly start: ${objtype} ${resolvedName} pkg=${parentName} tr=${transport || 'none'}`);
      // Evict R/O subprocess from pool before spawning R+W — prevents simultaneous
      // subprocesses that exhaust VM memory (OOM/SIGKILL).
      const roKey = `${host}|${username}|abap-adt-readonly`;
      if (clientPool.has(roKey)) {
        try { clientPool.get(roKey).close?.(); } catch {}
        clientPool.delete(roKey);
        console.log(`[bridge] Evicted R/O pool entry to free memory before createOnly`);
      }
      let created = false;
      const existedBefore = (await existsInRepository()) === true;
      if (existedBefore) {
        console.log(`[bridge] ${resolvedName} already in SAP repository — skipping createObject (${_coElapsed()})`);
        created = true;
      } else try {
        console.log(`[bridge] [timing] createObject calling MCP (${_coElapsed()})`);
        await callTool('createObject', {
          objtype, name: resolvedName, parentName, description, parentPath,
          ...(transport ? { transport } : {}),
        });
        created = true;
        console.log(`[bridge] [timing] createObject done (${_coElapsed()})`);
      } catch (e) {
        const msg = e.message ?? '';
        console.log(`[bridge] [timing] createObject error at ${_coElapsed()}: ${msg.slice(0, 200)}`);
        if (/already exist|duplicate|409/i.test(msg)) {
          // Object already exists in SAP — treat as success, proceed to activate
          created = true;
        } else if (/ExceptionResourceNoAccess|currently editing/i.test(msg)) {
          // "currently editing" means the object EXISTS but has a lock (stale from a previous
          // crashed run). Verify via HTTP GET — if the object is there, treat as already created.
          console.log(`[bridge] createObject locked — verifying object existence via HTTP (${_coElapsed()})`);
          try {
            const _vAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
            const _vRes = await sapFetch(`${host}${objectUrl}`, {
              headers: { Authorization: _vAuth, 'sap-client': sapClient, Accept: ADT_VERIFY_ACCEPT },
              signal: AbortSignal.timeout(15000),
            });
            // 200 or 423 (locked) both confirm the object exists
            if (_vRes.ok || _vRes.status === 423) {
              console.log(`[bridge] Object ${resolvedName} exists (HTTP ${_vRes.status}) — treating lock conflict as already-created`);
              created = true;
            } else {
              return res.json({ ok: false, step: 'create', error: `SAP lock conflict: ${resolvedName} is locked but does not exist (HTTP ${_vRes.status}). Go to SM12 in SAP and delete the lock, then retry. (${msg.slice(0, 150)})` });
            }
          } catch (verifyErr) {
            return res.json({ ok: false, step: 'create', error: `SAP lock conflict: ${resolvedName} is locked by another session. Go to SM12 in SAP and delete the lock for this object, then retry. (${msg.slice(0, 150)})` });
          }
        } else if (/cancelled or timed out|inspect writes and locks|-32603|-32001|timed out/i.test(msg)) {
          // SAP may have completed the object creation even though our MCP client timed out,
          // or a previous run left the session in a "recovery needed" state.
          // Verify via direct HTTP GET before reporting failure.
          console.log(`[bridge] createObject uncertain — verifying object existence via HTTP (${_coElapsed()})`);
          try {
            const _vAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
            const _vRes = await sapFetch(`${host}${objectUrl}`, {
              headers: { Authorization: _vAuth, 'sap-client': sapClient, Accept: ADT_VERIFY_ACCEPT },
              signal: AbortSignal.timeout(15000),
            });
            if (_vRes.ok) {
              console.log(`[bridge] Object ${resolvedName} exists in SAP despite error — treating as created`);
              created = true;
            } else {
              return res.json({ ok: false, step: 'create', error: `SAP createObject timed out/cancelled and object not found (HTTP ${_vRes.status}). If a previous attempt left locks, go to SM12 in SAP and clear locks for ${resolvedName}, then retry. (${msg.slice(0, 100)})` });
            }
          } catch (verifyErr) {
            return res.json({ ok: false, step: 'create', error: `SAP createObject timed out/cancelled. Verify ${resolvedName} exists in SAP manually, then use Reset to retry. (${msg.slice(0, 100)})` });
          }
        } else {
          return res.json({ ok: false, step: 'create', error: msg.slice(0, 300) });
        }
      }

      // Message classes (MSAG) are active-on-create; skip lock/unlock/activation entirely.
      // For other types, lock → unLock → activate (lock needed to get the handle for unLock).
      const skipActivation = /^MSAG/i.test(objtype ?? '');
      // createObject implicitly locks the object in SAP. Attempt to unlock before activating.
      // If doLock() fails (e.g. lock handle not available), log it and skip activation.
      // Skip entirely for skipActivation types — there's nothing to unlock/activate and the
      // implicit createObject lock will be released when the transport is released in SAP.
      let unlocked = false;
      if (!skipActivation) {
        try {
          console.log(`[bridge] [timing] doLock start (${_coElapsed()})`);
          const createLockHandle = await doLock();
          console.log(`[bridge] [timing] unLock start (${_coElapsed()})`);
          await callTool('unLock', { objectUrl, lockHandle: createLockHandle });
          unlocked = true;
          console.log(`[bridge] [timing] unLock done (${_coElapsed()})`);
        } catch (unlockErr) {
          console.warn(`[bridge] Could not unlock ${resolvedName} before activate (${_coElapsed()}): ${unlockErr.message?.slice(0, 200)}`);
        }
      }
      let activateError = null;
      const activationAttempted = !skipActivation && unlocked && effectivePolicy.activateAfterWrite !== false && effectiveCaps.hasActivation !== false;
      if (activationAttempted) {
        try {
          console.log(`[bridge] [timing] activate start (${_coElapsed()})`);
          await activateOrThrow(callTool, resolvedName, objectUrl);
          console.log(`[bridge] [timing] activate done (${_coElapsed()})`);
        } catch (e) {
          activateError = e.message?.slice(0, 400);
          console.log(`[bridge] [timing] activate error (${_coElapsed()}): ${activateError}`);
        }
      }
      // Verify: for skipActivation types (MSAG etc.) the createObject success is authoritative —
      // the HTTP GET may return non-2xx while the implicit lock is still held (SAP returns 423).
      // For all other types verify via direct HTTP GET to avoid spawning a second subprocess.
      let verify;
      if (effectivePolicy.verifyAfterWrite === false) {
        verify = { ok: false, skipped: true, reason: 'verifyAfterWrite disabled in policy' };
      } else if (skipActivation && created) {
        verify = { ok: true, method: 'createObject-success' };
        console.log(`[bridge] [timing] verify skipped — trusted createObject success for ${objtype} (${_coElapsed()})`);
      } else {
        console.log(`[bridge] [timing] verifyViaHttp start (${_coElapsed()})`);
        const _vAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        try {
          const _vRes = await sapFetch(`${host}${objectUrl}`, {
            headers: { Authorization: _vAuth, 'sap-client': sapClient, Accept: ADT_VERIFY_ACCEPT },
            signal: AbortSignal.timeout(15000),
          });
          // 423 = locked by our own just-created session, which also proves it exists
          verify = { ok: _vRes.ok || _vRes.status === 423, method: 'http-get', status: _vRes.status,
                     ...(_vRes.ok || _vRes.status === 423 ? {} : { reason: `SAP returned HTTP ${_vRes.status} for ${objectUrl}` }) };
        } catch (e) {
          verify = { ok: false, reason: e.message?.slice(0, 100) };
        }
        console.log(`[bridge] [timing] verifyViaHttp done (${_coElapsed()}) ok=${verify.ok}`);
      }
      return res.json({
        ok: true, status: 200, createOnly: true, created: !existedBefore,
        package: parentName,
        transport: transport || null, transportSource,
        note: `${objtype} ${resolvedName} ${existedBefore ? 'already existed' : 'created'} in SAP (pkg: ${parentName}). Set properties (data type, length, labels) in SE11/SE91.`,
        verify,
        // Per-step outcome so the app can tell "done" apart from "written but not
        // activated / not confirmed". null = step not applicable or skipped by policy.
        steps: {
          created: !existedBefore,
          existed: existedBefore,
          unlocked: skipActivation ? null : unlocked,
          activated: skipActivation ? null : (activationAttempted ? !activateError : (unlocked ? null : false)),
          verified: verify.skipped ? null : verify.ok === true,
        },
        ...(activateError ? { activateError } : {}),
      });
    }

    // ── Normal path: source-based objects ───────────────────────────────────

    // 1. Auto-create if requested (skip when the object is already in the repository)
    const existedBefore = autoCreate && objtype && resolvedName ? (await existsInRepository()) === true : null;
    if (existedBefore) console.log(`[bridge] ${resolvedName} already in SAP repository — skipping createObject`);
    if (autoCreate && objtype && resolvedName && !existedBefore) {
      try {
        await callTool('createObject', {
          objtype, name: resolvedName, parentName, description, parentPath,
          ...(transport ? { transport } : {}),
        });
      } catch (e) {
        const msg = e.message ?? '';
        if (e.notRepeated && (await existsInRepository()) === true) {
          console.log(`[bridge] createObject for ${resolvedName} was interrupted but the object exists — continuing`);
        } else if (!/already exist|duplicate|409/i.test(msg)) {
          return res.json({ ok: false, step: 'create', error: msg.slice(0, 300) });
        }
      }
    }

    // 2. Lock (retry with createObject on 404)
    let lockHandle;
    try {
      lockHandle = await doLock();
    } catch (lockErr) {
      const msg = lockErr.message ?? '';
      if (/404|not found|does not exist/i.test(msg) && objtype && resolvedName) {
        try {
          await callTool('createObject', {
            objtype, name: resolvedName, parentName, description, parentPath,
            ...(transport ? { transport } : {}),
          });
          lockHandle = await doLock();
        } catch (e2) {
          const m2 = e2.message ?? '';
          // SAP says it exists but cannot lock it as if it didn't: typically an object left
          // half-created by an interrupted run. Report that instead of "already exists".
          const error = /already exist/i.test(m2)
            ? `${resolvedName} exists in SAP but cannot be locked (${msg.slice(0, 120)}). It may be half-created by an interrupted run — open it in SE11/SE80, activate or delete it, then retry.`
            : m2.slice(0, 300);
          return res.json({ ok: false, step: 'lock_after_create', error });
        }
      } else {
        return res.json({ ok: false, step: 'lock', error: msg.slice(0, 300) });
      }
    }

    // 3. setObjectSource
    try {
      await callTool('setObjectSource', {
        objectSourceUrl, source, lockHandle,
        ...(transport ? { transport } : {}),
      });
    } catch (e) {
      try { await callTool('unLock', { objectUrl, lockHandle }); } catch {}
      return res.json({ ok: false, step: 'setObjectSource', error: e.message?.slice(0, 300) });
    }

    // 4. unLock (best-effort)
    let unlocked = false;
    try { await callTool('unLock', { objectUrl, lockHandle }); unlocked = true; } catch {}

    // 5. Syntax check (optional, conditional on policy)
    let syntaxErrors = null;
    // Always for DDIC sources (tables/structures): a bad definition should fail here with
    // a clear message instead of failing activation. Args per the tool's README.
    const isDdicSource = /^TABL\//i.test(objtype ?? '') || /\/ddic\/(tables|dbtables|structures)\//i.test(objectSourceUrl);
    if ((effectivePolicy.syntaxCheckBeforeWrite || isDdicSource) && effectiveCaps.hasSyntaxCheck !== false) {
      try {
        const syntaxResult = await callTool('syntaxCheckCode', { code: source, url: objectSourceUrl, mainUrl: objectSourceUrl });
        const syntaxText = syntaxResult?.content?.[0]?.text ?? '';
        let hasErrors;
        try {
          const parsed = JSON.parse(syntaxText);
          const msgs = Array.isArray(parsed) ? parsed : (parsed?.messages ?? parsed?.results ?? null);
          hasErrors = Array.isArray(msgs)
            ? msgs.some(m => /^(E|A|X)$/i.test(String(m?.severity ?? m?.type ?? m?.kind ?? '')) || /^error$/i.test(String(m?.severity ?? '')))
            : /error|syntaxError/i.test(syntaxText) && !/no error/i.test(syntaxText);
        } catch {
          hasErrors = /error|syntaxError/i.test(syntaxText) && !/no error/i.test(syntaxText);
        }
        if (hasErrors) {
          if (effectivePolicy.stopOnSyntaxError) {
            return res.json({ ok: false, step: 'syntaxCheck', error: `Syntax errors — source saved in SAP but NOT activated: ${syntaxText.slice(0, 300)}` });
          }
          syntaxErrors = syntaxText.slice(0, 300);
        }
      } catch (e) {
        console.warn(`[bridge] syntaxCheck failed (non-fatal): ${e.message?.slice(0, 100)}`);
      }
    }

    // 5b. activateByName (conditional on policy, non-fatal)
    let activateError = null;
    const activationAttempted = effectivePolicy.activateAfterWrite !== false && effectiveCaps.hasActivation !== false;
    if (activationAttempted) {
      try {
        await activateOrThrow(callTool, resolvedName, objectUrl);
      } catch (e) {
        activateError = e.message?.slice(0, 400);
      }
    }

    const verify = (effectivePolicy.verifyAfterWrite !== false && effectiveCaps.hasRoMcp !== false)
      ? await verifyWithRO(host, username, password, sapClient, objtype, resolvedName)
      : { ok: false, skipped: true, reason: 'verifyAfterWrite disabled in policy' };
    res.json({
      ok: true, status: 200, transport: transport || null, transportSource, verify,
      steps: {
        updated: true,
        ...(existedBefore === false && autoCreate ? { created: true } : {}),
        ...(existedBefore ? { existed: true } : {}),
        unlocked,
        activated: activationAttempted ? !activateError : null,
        verified: verify.skipped ? null : verify.ok === true,
      },
      ...(activateError ? { activateError } : {}), ...(syntaxErrors ? { syntaxErrors } : {}),
    });
  } catch (err) {
    console.error('[bridge] /sap-write-mcp error:', err);
    res.status(500).json({ ok: false, error: err.message?.slice(0, 200) || 'Internal error' });
  }
});

// ── MCP endpoint ─────────────────────────────────────────────
// Session store: sessionId → { server, transport }
const sessions = new Map();

function buildServer(client) {
  const server = new Server(
    { name: 'abap-adt-bridge', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return await client.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    return await client.callTool({
      name: req.params.name,
      arguments: req.params.arguments ?? {},
    });
  });

  return server;
}

// POST /mcp — initialize or handle request
app.post('/mcp', async (req, res) => {
  try {
    const creds = parseSapCreds(req.headers['authorization']);
    // Require the caller's SAP credentials (no fallback to the VM's .env user).
    if (!creds?.username || !creds?.password) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'SAP credentials required in Authorization token' }, id: null });
    }
    const client = await getClient(creds);
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId && sessions.has(sessionId)) {
      // Existing session
      const { transport } = sessions.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const server = buildServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) sessions.delete(id);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    if (transport.sessionId) {
      sessions.set(transport.sessionId, { server, transport });
    }
  } catch (err) {
    console.error('[bridge] MCP POST error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message },
      });
    }
  }
});

// GET /mcp — SSE for server-initiated messages
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(400).json({ error: 'Unknown session ID' });
  }
  const { transport } = sessions.get(sessionId);
  await transport.handleRequest(req, res);
});

// DELETE /mcp — close session
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId && sessions.has(sessionId)) {
    const { server } = sessions.get(sessionId);
    server.close().catch(() => {});
    sessions.delete(sessionId);
  }
  res.sendStatus(204);
});

// ── Supabase write-queue poller ──────────────────────────────────────────────
// Cloudflare quick tunnels block inbound requests from Vercel's datacenter IPs.
// Instead of tunneling write requests, the platform enqueues jobs in Supabase
// and the bridge polls every 3s, applies the write to SAP, and writes back the result.
const SB_URL = (process.env.SUPABASE_URL || '').trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '').trim().replace(/[^\x21-\x7E]/g, '');

// Derive ADT object type and name from the source path.
function parseAdtPath(adtPath) {
  const p = adtPath || '';
  let m;
  if ((m = p.match(/\/sap\/bc\/adt\/programs\/programs\/([^/]+)\/source\/main/)))
    return { type: 'program', name: m[1] };
  if ((m = p.match(/\/sap\/bc\/adt\/oo\/classes\/([^/]+)\/source\/main/)))
    return { type: 'class', name: m[1] };
  if ((m = p.match(/\/sap\/bc\/adt\/functions\/groups\/([^/]+)\/fmodules\/([^/]+)\/source\/main/)))
    return { type: 'function_module', fg: m[1], name: m[2] };
  if ((m = p.match(/\/sap\/bc\/adt\/ddic\/(?:db)?tables\/([^/]+)\/source\/main/)))
    return { type: 'table', name: m[1] };
  return null;
}

// activateByName returns { success, messages, inactive } instead of throwing when SAP
// refuses the activation (e.g. "Data type ' ' does not exist"). Turn that into an error so
// a refused activation is never reported as activated.
async function activateOrThrow(callTool, objectName, objectUrl) {
  const r = await callTool('activateByName', { objectName, objectUrl });
  const text = r?.content?.[0]?.text ?? '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
  const errs = msgs.filter(m => /^[EAX]$/i.test(m?.type ?? m?.severity ?? '') || /error/i.test(m?.type ?? ''));
  const inactive = Array.isArray(parsed?.inactive) ? parsed.inactive : [];
  if (parsed && (parsed.success === false || errs.length || inactive.length)) {
    const detail = (errs.length ? errs : msgs).map(m => (m.shortText ?? m.text ?? m.message ?? '').trim()).filter(Boolean);
    const unique = [...new Set(detail)].slice(0, 4).join(' · ');
    throw new Error(`SAP did not activate ${objectName}${unique ? `: ${unique}` : ''}`);
  }
  return r;
}

// Create an ABAP object in SAP via ADT POST when PUT returns 404 (object not found).
async function createAdtObject(host, baseHeaders, csrfToken, cookieHeader, parsed, transport) {
  const sharedHeaders = {
    ...baseHeaders,
    ...(csrfToken    ? { 'X-CSRF-Token': csrfToken }  : {}),
    ...(cookieHeader ? { Cookie: cookieHeader }         : {}),
    ...(transport    ? { corrNbr: transport }           : {}),
  };
  const pkg = '$TMP'; // default local package; object can be moved to a transport later
  let createUrl, contentType, xmlBody;

  if (parsed.type === 'program') {
    createUrl = `${host}/sap/bc/adt/programs/programs`;
    contentType = 'application/vnd.sap.adt.programs.programs.v2+xml; charset=utf-8';
    xmlBody = `<?xml version="1.0" encoding="UTF-8"?><programs:programProperties xmlns:programs="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${parsed.name}" adtcore:language="EN" adtcore:name="${parsed.name}" programs:programType="1"><adtcore:packageRef adtcore:name="${pkg}"/></programs:programProperties>`;
  } else if (parsed.type === 'class') {
    createUrl = `${host}/sap/bc/adt/oo/classes`;
    contentType = 'application/vnd.sap.adt.oo.classincludes.v2+xml; charset=utf-8';
    xmlBody = `<?xml version="1.0" encoding="UTF-8"?><oo:classDefinition xmlns:oo="http://www.sap.com/adt/oo/classdefinition" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${parsed.name}" adtcore:language="EN" adtcore:name="${parsed.name}"><adtcore:packageRef adtcore:name="${pkg}"/></oo:classDefinition>`;
  } else if (parsed.type === 'function_module') {
    // Function modules require the function group to exist; attempt creation of FM only
    createUrl = `${host}/sap/bc/adt/functions/groups/${parsed.fg}/fmodules`;
    contentType = 'application/vnd.sap.adt.functions.fmodules.v3+xml; charset=utf-8';
    xmlBody = `<?xml version="1.0" encoding="UTF-8"?><fmodules:functionModule xmlns:fmodules="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${parsed.name}" adtcore:language="EN" adtcore:name="${parsed.name}"/>`;
  } else {
    return { ok: false, error: `Auto-create not supported for type: ${parsed.type}` };
  }

  const res = await sapFetch(createUrl, {
    method: 'POST',
    headers: { ...sharedHeaders, 'Content-Type': contentType, Accept: 'application/json, */*' },
    body: xmlBody,
    signal: AbortSignal.timeout(15000),
  });
  const txt = await res.text().catch(() => '');
  return { ok: res.ok || res.status === 201, status: res.status, body: txt.slice(0, 200) };
}


async function processSapWriteJob(job) {
  const host = (job.host || '').replace(/\/$/, '');
  const basicAuth = Buffer.from(`${job.username}:${job.password}`).toString('base64');
  const baseHeaders = { Authorization: `Basic ${basicAuth}`, 'sap-client': job.client || '100' };

  // Step 1: CSRF token
  const csrfRes = await sapFetch(`${host}/sap/bc/adt/discovery`, {
    headers: { ...baseHeaders, 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
    signal: AbortSignal.timeout(15000),
  });
  const csrfToken = csrfRes.headers.get('x-csrf-token') || '';
  const setCookieRaw2 = csrfRes.headers.get('set-cookie');
  const setCookieArr2 = Array.isArray(setCookieRaw2) ? setCookieRaw2 : (setCookieRaw2 ? [setCookieRaw2] : []);
  const cookieHeader = setCookieArr2.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

  if (!csrfRes.ok && csrfRes.status !== 200) {
    return { ok: false, sap_status: csrfRes.status, error: `CSRF fetch failed HTTP ${csrfRes.status}` };
  }

  const putHeaders = {
    ...baseHeaders,
    'Content-Type': 'text/plain; charset=utf-8',
    Accept: 'application/xml',
    ...(csrfToken    ? { 'X-CSRF-Token': csrfToken }  : {}),
    ...(cookieHeader ? { Cookie: cookieHeader }         : {}),
    ...(job.transport ? { corrNbr: job.transport }      : {}),
  };

  // Step 2: PUT source
  let putRes = await sapFetch(`${host}${job.path}`, {
    method: 'PUT', headers: putHeaders, body: job.source, signal: AbortSignal.timeout(30000),
  });

  // Step 3: If 404, auto-create the object in $TMP then retry PUT
  // After creating in $TMP (local package), corrNbr must NOT be sent — SAP returns 400
  // if a transport is assigned to a local-package object.
  if (putRes.status === 404) {
    const parsed = parseAdtPath(job.path);
    if (parsed) {
      console.log(`[queue] 404 — creating ${parsed.type} ${parsed.name || parsed.fg} in SAP ($TMP)...`);
      const created = await createAdtObject(host, baseHeaders, csrfToken, cookieHeader, parsed, null);
      if (created.ok) {
        console.log(`[queue] Created ${parsed.name || parsed.fg} (HTTP ${created.status}) — retrying PUT (no transport for $TMP)...`);
        // Strip corrNbr — object lives in $TMP (local), transport not applicable
        const { corrNbr: _dropped, ...putHeadersNoTransport } = putHeaders;
        putRes = await sapFetch(`${host}${job.path}`, {
          method: 'PUT', headers: putHeadersNoTransport, body: job.source, signal: AbortSignal.timeout(30000),
        });
      } else {
        return { ok: false, sap_status: created.status, error: `Auto-create failed (HTTP ${created.status}): ${created.body}` };
      }
    }
  }

  const body = await putRes.text().catch(() => '');
  const bodySnip = body.slice(0, 400);
  return { ok: putRes.ok, sap_status: putRes.status, body: bodySnip, error: putRes.ok ? null : `HTTP ${putRes.status}` };
}

async function pollWriteQueue() {
  if (!SB_URL || !SB_KEY) return;
  try {
    const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
    // Fetch up to 3 pending jobs
    const listRes = await fetch(
      `${SB_URL}/rest/v1/sap_write_queue?status=eq.pending&order=created_at.asc&limit=3`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    if (!listRes.ok) return;
    const jobs = await listRes.json().catch(() => []);
    if (!Array.isArray(jobs) || jobs.length === 0) return;

    for (const job of jobs) {
      // Claim the job
      await fetch(`${SB_URL}/rest/v1/sap_write_queue?id=eq.${job.id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });

      let patch;
      try {
        const r = await processSapWriteJob(job);
        patch = { status: r.ok ? 'done' : 'error', ok: r.ok, sap_status: r.sap_status, body: r.body || null, error: r.error || null, updated_at: new Date().toISOString() };
        console.log(`[queue] ${r.ok ? '✓' : '✗'} ${job.path?.split('/').pop() || job.path} → HTTP ${r.sap_status}`);
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Request timed out' : (e.message?.slice(0, 200) || 'Write failed');
        patch = { status: 'error', ok: false, error: msg, updated_at: new Date().toISOString() };
        console.error(`[queue] ✗ ${job.path?.split('/').pop() || job.path}: ${msg}`);
      }

      await fetch(`${SB_URL}/rest/v1/sap_write_queue?id=eq.${job.id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch { /* best-effort */ }
}

app.listen(PORT, () => {
  console.log(`[bridge] ABAP ADT bridge listening on port ${PORT}`);
  console.log(`[bridge] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[bridge] SAP credentials read from Authorization header (sent by the app)`);
  if (process.env.SAP_URL) console.log(`[bridge] .env fallback SAP_URL: ${process.env.SAP_URL}`);
  registerTunnelUrl();
  if (SB_URL && SB_KEY) {
    setInterval(pollWriteQueue, 3000);
    console.log('[bridge] Write queue poller active — polling Supabase every 3s');
  } else {
    console.log('[bridge] Write queue poller DISABLED — no Supabase credentials');
  }
});
