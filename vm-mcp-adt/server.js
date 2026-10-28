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
const SOCKS_PORT = 1080;
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
  const useSocks = await isSocksUp();
  const parsed = new URL(url);
  const mod = parsed.protocol === 'https:' ? https : http;
  const agent = useSocks
    ? new SocksProxyAgent(SOCKS_URL)
    : new https.Agent({ rejectUnauthorized: false });
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent,
      rejectUnauthorized: false,
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
const clientPool = new Map();

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
  if (clientPool.has(key)) return clientPool.get(key);

  // Pass SOCKS5 proxy env vars to subprocesses — respected by axios, undici, and some node:https uses
  const proxyEnv = {};
  const socksActive = await isSocksUp();
  if (socksActive) {
    proxyEnv.ALL_PROXY   = SOCKS_URL;
    proxyEnv.HTTPS_PROXY = SOCKS_URL;
    proxyEnv.HTTP_PROXY  = SOCKS_URL;
  }

  // mcp-abap-abap-adt-api (R+W) throws if NODE_TLS_REJECT_UNAUTHORIZED=0 is set —
  // it explicitly blocks that flag and requires NODE_EXTRA_CA_CERTS instead.
  // mcp-abap-adt (R/O) uses TLS_REJECT_UNAUTHORIZED (a different var) — keep as-is.
  const tlsEnv = serverType === 'abap-adt'
    ? {
        // Provide CA cert via env if available; if blank the subprocess uses system trust store
        ...(process.env.NODE_EXTRA_CA_CERTS
          ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS }
          : {}),
      }
    : {
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
        TLS_REJECT_UNAUTHORIZED: '0',
      };

  const transport = new StdioClientTransport({
    command: 'node',
    args: [adtScript],
    env: {
      ...process.env,
      SAP_URL:      sapUrl,
      SAP_USER:     sapUser,
      SAP_USERNAME: sapUser,         // mcp-abap-adt uses SAP_USERNAME
      SAP_PASSWORD: sapPassword,
      SAP_CLIENT:   sapClient,
      SAP_LANGUAGE: sapLanguage,
      ...tlsEnv,
      ...proxyEnv,
    },
  });

  const client = new Client({ name: 'adt-http-bridge', version: '1.0.0' });
  await client.connect(transport);

  transport.onclose = () => {
    console.warn(`[bridge] Client closed for ${key} — will respawn`);
    clientPool.delete(key);
  };

  clientPool.set(key, client);
  console.log(`[bridge] Connected subprocess (${serverType}) for ${sapUrl} / ${sapUser}`);
  return client;

  transport.onclose = () => {
    console.warn('[bridge] ADT subprocess closed — will respawn on next request');
    adtClient = null;
  };

  adtClient = client;
  console.log('[bridge] Connected to mcp-abap-abap-adt-api subprocess');
  return client;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,mcp-session-id');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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
  const targetUrl = sapTarget.replace(/\/$/, '') + adtPath + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');

  const SKIP_REQ = new Set(['host', 'x-sap-target', 'connection', 'transfer-encoding', 'keep-alive']);
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
    const username = creds.username  || req.body?.username || process.env.SAP_USER     || '';
    const password = creds.password  || req.body?.password || process.env.SAP_PASSWORD || '';
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

  // R+W: mcp-abap-abap-adt-api (127 tools)
  try {
    const rwClient = await getClient({ host, username, password, client: sapClient, serverType: 'abap-adt' });
    const list = await rwClient.listTools();
    rw.ok = true;
    rw.tools = list?.tools?.length ?? 0;
  } catch (e) {
    rw.error = e.message?.slice(0, 150) ?? 'spawn failed';
  }

  // R/O: mcp-abap-adt (16 tools)
  try {
    const roClient = await getClient({ host, username, password, client: sapClient, serverType: 'abap-adt-readonly' });
    const list = await roClient.listTools();
    ro.ok = true;
    ro.tools = list?.tools?.length ?? 0;
  } catch (e) {
    ro.error = e.message?.slice(0, 150) ?? 'spawn failed';
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
    const username  = creds.username  || req.body?.username || process.env.SAP_USER     || '';
    const password  = creds.password  || req.body?.password || process.env.SAP_PASSWORD || '';
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
async function createTransportViaAdt(host, username, password, client, description) {
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const baseHeaders = { Authorization: auth, 'sap-client': client };

  // 1. Fetch CSRF token
  const csrfRes = await sapFetch(`${host}/sap/bc/adt/cts/transportrequests`, {
    method: 'GET',
    headers: { ...baseHeaders, 'X-CSRF-Token': 'Fetch', Accept: 'application/xml' },
    signal: AbortSignal.timeout(15000),
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
    const username   = creds.username  || req.body?.username || process.env.SAP_USER     || '';
    const password   = creds.password  || req.body?.password || process.env.SAP_PASSWORD || '';
    const sapClient  = creds.client    || req.body?.client   || process.env.SAP_CLIENT   || '100';
    const adtPath    = req.body?.path;
    const source     = req.body?.source;
    let   transport  = req.body?.transport || null;
    const autoCreate = !!req.body?.autoCreate;
    const createOnly = !!req.body?.createOnly;
    const objtype    = req.body?.objtype;
    const objName    = req.body?.name;
    const parentName = req.body?.parentName  || '$TMP';
    const description= req.body?.description || '';
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

    // Auto-create transport request when none provided, package is not $TMP, and policy allows it
    if (!transport && parentName && parentName !== '$TMP' && effectivePolicy.autoCreateTransport && effectiveCaps.hasCts) {
      try {
        const trDesc = `Techcase: ${resolvedName}${description ? ' - ' + description.slice(0, 40) : ''}`;
        transport = await createTransportViaAdt(host, username, password, sapClient, trDesc);
        console.log(`[bridge] Auto-created transport: ${transport} for ${resolvedName}`);
      } catch (trErr) {
        console.warn(`[bridge] Could not auto-create transport: ${trErr.message}`);
        // Non-fatal: proceed without TR (object goes into package's default handling)
      }
    }

    const creds4Pool = { host, username, password, client: sapClient, serverType: 'abap-adt' };

    const parseMcpText = (result) => {
      try { return JSON.parse(result?.content?.[0]?.text ?? '{}'); }
      catch { return { raw: result?.content?.[0]?.text }; }
    };

    // callTool: wraps client.callTool with two layers of protection:
    //   1. isError: true in the result → convert to thrown Error (SAP rejected the call)
    //   2. -32000 crash code → delete pool entry and retry once with a fresh subprocess
    async function callTool(name, args) {
      async function rawCall(c) {
        const result = await c.callTool({ name, arguments: args });
        // MCP tools signal SAP-level errors via isError:true instead of throwing.
        // Surfacing it here means all callers see real errors from SAP.
        if (result?.isError) {
          const errText = result.content?.[0]?.text ?? 'tool returned isError';
          console.error(`[bridge] ${name} isError — ${errText.slice(0, 200)}`);
          throw new Error(errText.slice(0, 300));
        }
        return result;
      }
      let client = await getClient(creds4Pool);
      try {
        return await rawCall(client);
      } catch (e) {
        const isCrash = e?.code === -32000 || /connection closed|-32000/i.test(e?.message ?? '');
        if (!isCrash) throw e;
        console.warn(`[bridge] MCP subprocess crashed on '${name}' (-32000) — respawning...`);
        const key = `${host}|${username}|abap-adt`;
        clientPool.delete(key);
        client = await getClient(creds4Pool);
        return await rawCall(client);
      }
    }

    async function doLock() {
      const r = parseMcpText(await callTool('lock', { objectUrl }));
      const handle = r.lockHandle || r.lock_handle || r.handle;
      if (!handle) throw new Error(`Lock returned no handle: ${JSON.stringify(r).slice(0, 200)}`);
      return handle;
    }

    // ── createOnly path: domain / data_element / message_class ──────────────
    // These have no ABAP source/main. Create via MCP createObject + activate.
    if (createOnly) {
      if (!objtype || !resolvedName) {
        return res.status(400).json({ ok: false, error: 'createOnly requires objtype and name' });
      }
      let created = false;
      try {
        await callTool('createObject', {
          objtype, name: resolvedName, parentName, description, parentPath,
          ...(transport ? { transport } : {}),
        });
        created = true;
      } catch (e) {
        const msg = e.message ?? '';
        if (/already exist|duplicate|409/i.test(msg)) {
          created = true;
        } else {
          return res.json({ ok: false, step: 'create', error: msg.slice(0, 300) });
        }
      }
      // createObject implicitly locks the object in SAP. Unlock before activating,
      // otherwise activateByName sees a lock conflict from the same user.
      try {
        const createLockHandle = await doLock();
        await callTool('unLock', { objectUrl, lockHandle: createLockHandle });
      } catch { /* best-effort — activation may still succeed */ }

      let activateError = null;
      if (effectivePolicy.activateAfterWrite !== false && effectiveCaps.hasActivation !== false) {
        try {
          await callTool('activateByName', { objectName: resolvedName, objectUrl });
        } catch (e) {
          activateError = e.message?.slice(0, 150);
        }
      }
      const verify = (effectivePolicy.verifyAfterWrite !== false && effectiveCaps.hasRoMcp !== false)
        ? await verifyWithRO(host, username, password, sapClient, objtype, resolvedName)
        : { ok: false, skipped: true, reason: 'verifyAfterWrite disabled in policy' };
      return res.json({
        ok: true, status: 200, createOnly: true, created,
        package: parentName,
        transport: transport || null,
        note: `${objtype} ${resolvedName} ${created ? 'created' : 'already existed'} in SAP (pkg: ${parentName}). Set properties (data type, length, labels) in SE11/SE91.`,
        verify,
        ...(activateError ? { activateError } : {}),
      });
    }

    // ── Normal path: source-based objects ───────────────────────────────────

    // 1. Auto-create if requested
    if (autoCreate && objtype && resolvedName) {
      try {
        await callTool('createObject', {
          objtype, name: resolvedName, parentName, description, parentPath,
          ...(transport ? { transport } : {}),
        });
      } catch (e) {
        const msg = e.message ?? '';
        if (!/already exist|duplicate|409/i.test(msg)) {
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
          return res.json({ ok: false, step: 'lock_after_create', error: e2.message?.slice(0, 300) });
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
    try { await callTool('unLock', { objectUrl, lockHandle }); } catch {}

    // 5. Syntax check (optional, conditional on policy)
    let syntaxErrors = null;
    if (effectivePolicy.syntaxCheckBeforeWrite && effectiveCaps.hasSyntaxCheck) {
      try {
        const syntaxResult = await callTool('syntaxCheckCode', { objectUrl: objectSourceUrl });
        const syntaxText = syntaxResult?.content?.[0]?.text ?? '';
        const hasErrors = /error|syntaxError/i.test(syntaxText) && !/no error/i.test(syntaxText);
        if (hasErrors) {
          if (effectivePolicy.stopOnSyntaxError) {
            return res.json({ ok: false, step: 'syntaxCheck', error: `Syntax errors: ${syntaxText.slice(0, 300)}` });
          }
          syntaxErrors = syntaxText.slice(0, 300);
        }
      } catch (e) {
        console.warn(`[bridge] syntaxCheck failed (non-fatal): ${e.message?.slice(0, 100)}`);
      }
    }

    // 5b. activateByName (conditional on policy, non-fatal)
    let activateError = null;
    if (effectivePolicy.activateAfterWrite !== false && effectiveCaps.hasActivation !== false) {
      try {
        await callTool('activateByName', { objectName: resolvedName, objectUrl });
      } catch (e) {
        activateError = e.message?.slice(0, 150);
      }
    }

    const verify = (effectivePolicy.verifyAfterWrite !== false && effectiveCaps.hasRoMcp !== false)
      ? await verifyWithRO(host, username, password, sapClient, objtype, resolvedName)
      : { ok: false, skipped: true, reason: 'verifyAfterWrite disabled in policy' };
    res.json({ ok: true, status: 200, transport: transport || null, verify, ...(activateError ? { activateError } : {}), ...(syntaxErrors ? { syntaxErrors } : {}) });
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
  if ((m = p.match(/\/sap\/bc\/adt\/ddic\/dbtables\/([^/]+)\/source\/main/)))
    return { type: 'table', name: m[1] };
  return null;
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
