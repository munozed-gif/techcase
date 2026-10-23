/**
 * TechCase SAP MCP Server
 *
 * Exposes SAP ADT REST API operations as MCP tools so Claude can
 * read and write ABAP objects directly during code generation.
 *
 * Auth: each request carries a Bearer token that is base64-encoded JSON
 * of the SAP environment config: { host, username, password, client, type, proxyUrl? }
 * The TechCase platform generates this token from system_settings.sap_integration
 * before calling the Anthropic API with mcp_servers config.
 *
 * Deploy: any Node 18+ host reachable by the Anthropic API (public URL required).
 * Set PORT env var (default 3100). Optionally set ALLOWED_ORIGINS for CORS.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'http';
import https from 'https';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const SERVER_START = Date.now();
const PORT = Number(process.env.PORT ?? 3100);

// ── SAP ADT helpers ────────────────────────────────────────────────────────

function decodeCredentials(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Bearer token');
  }
  try {
    const raw = Buffer.from(authHeader.slice(7), 'base64').toString('utf8');
    const creds = JSON.parse(raw);
    if (!creds.host || !creds.username || !creds.password) {
      throw new Error('Token missing required fields: host, username, password');
    }
    return creds;
  } catch (e) {
    throw new Error(`Cannot decode SAP credentials: ${e.message}`);
  }
}

async function sapRequest(creds, path, opts = {}) {
  const base = (creds.proxyUrl?.trim() || creds.host.trim()).replace(/\/$/, '');
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Basic ${auth}`,
      'sap-client': String(creds.client || '100'),
      Accept: 'application/xml, text/xml, text/plain, */*',
      ...(opts.headers ?? {}),
    },
  });
  return res;
}

async function getCsrfToken(creds) {
  const res = await sapRequest(creds, '/sap/bc/adt/discovery', {
    method: 'GET',
    headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/atomsvc+xml' },
  });
  return res.headers.get('x-csrf-token') ?? res.headers.get('X-CSRF-Token') ?? '';
}

function objectPath(objectType, objectName) {
  const n = (objectName ?? '').toUpperCase();
  switch (objectType) {
    case 'program':
      return `/sap/bc/adt/programs/programs/${n}/source/main`;
    case 'class':
      return `/sap/bc/adt/oo/classes/${n}/source/main`;
    case 'function_module': {
      const parts = n.includes('/') ? n.split('/') : [n, n];
      return `/sap/bc/adt/functions/groups/${parts[0]}/fmodules/${parts[1]}/source/main`;
    }
    case 'table':
      return `/sap/bc/adt/ddic/dbtables/${n}/source/main`;
    case 'include':
      return `/sap/bc/adt/programs/includes/${n}/source/main`;
    case 'enhancement':
      return `/sap/bc/adt/enhancements/${n}/source/main`;
    default:
      return `/sap/bc/adt/programs/programs/${n}/source/main`;
  }
}

// ── MCP server factory ─────────────────────────────────────────────────────

function buildMcpServer(creds) {
  const server = new McpServer({
    name: 'techcase-sap',
    version: '1.7.5',
  });

  // ── Tool: live_check ────────────────────────────────────────────────────
  server.tool(
    'sap_live_check',
    'Test connectivity to the SAP system and return version info from ADT discovery.',
    {},
    async () => {
      try {
        const res = await sapRequest(creds, '/sap/bc/adt/discovery', {
          headers: { Accept: 'application/atomsvc+xml' },
        });
        if (!res.ok) {
          return { content: [{ type: 'text', text: `SAP returned HTTP ${res.status}: ${res.statusText}` }], isError: true };
        }
        const xml = await res.text();
        const title  = xml.match(/<title[^>]*>([^<]+)/)?.[1]?.trim() ?? '';
        const ver    = xml.match(/release="([^"]+)"/)?.[1] ?? '';
        const sp     = xml.match(/sp="([^"]+)"/)?.[1] ?? '';
        const info   = [title, ver && `Release ${ver}`, sp && `SP ${sp}`].filter(Boolean).join(' | ') || 'Connected';
        return { content: [{ type: 'text', text: `✅ ${info}\nHost: ${creds.host}\nClient: ${creds.client ?? '100'}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Connection failed: ${e.message}` }], isError: true };
      }
    }
  );

  // ── Tool: read_source ───────────────────────────────────────────────────
  server.tool(
    'sap_read_source',
    'Read the ABAP source code of an existing SAP object.',
    {
      object_type: z.enum(['program', 'class', 'function_module', 'table', 'include', 'enhancement'])
        .describe('SAP object type'),
      object_name: z.string().describe('SAP object name (e.g. ZPROGRAM, ZCL_MY_CLASS)'),
    },
    async ({ object_type, object_name }) => {
      try {
        const path = objectPath(object_type, object_name);
        const res = await sapRequest(creds, path, {
          headers: { Accept: 'text/plain, application/vnd.sap.adt.abapsource+text, */*' },
        });
        if (res.status === 404) {
          return { content: [{ type: 'text', text: `Object ${object_name} (${object_type}) does not exist in SAP.` }] };
        }
        if (!res.ok) {
          return { content: [{ type: 'text', text: `SAP error ${res.status}: ${await res.text()}` }], isError: true };
        }
        const source = await res.text();
        return { content: [{ type: 'text', text: source }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Read failed: ${e.message}` }], isError: true };
      }
    }
  );

  // ── Tool: write_source ──────────────────────────────────────────────────
  server.tool(
    'sap_write_source',
    'Write (PUT) ABAP source code to an existing SAP object. The object must already exist in SAP.',
    {
      object_type: z.enum(['program', 'class', 'function_module', 'table', 'include', 'enhancement'])
        .describe('SAP object type'),
      object_name: z.string().describe('SAP object name'),
      source_code: z.string().describe('Complete ABAP source code to write'),
      transport_request: z.string().optional().describe('SAP transport request number (e.g. DEV_K000123)'),
    },
    async ({ object_type, object_name, source_code, transport_request }) => {
      try {
        const path = objectPath(object_type, object_name);
        const csrfToken = await getCsrfToken(creds);
        const headers = {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-CSRF-Token': csrfToken,
          Accept: 'application/xml',
        };
        if (transport_request) headers['sap-package'] = transport_request;
        const res = await sapRequest(creds, path, {
          method: 'PUT',
          headers,
          body: source_code,
        });
        if (!res.ok) {
          const body = await res.text();
          return { content: [{ type: 'text', text: `Write failed (${res.status}): ${body.slice(0, 400)}` }], isError: true };
        }
        return { content: [{ type: 'text', text: `✅ ${object_name} written successfully to SAP.` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Write failed: ${e.message}` }], isError: true };
      }
    }
  );

  // ── Tool: activate_object ───────────────────────────────────────────────
  server.tool(
    'sap_activate_object',
    'Activate an ABAP object in SAP after writing its source.',
    {
      object_type: z.enum(['program', 'class', 'function_module', 'table', 'include', 'enhancement'])
        .describe('SAP object type'),
      object_name: z.string().describe('SAP object name'),
    },
    async ({ object_type, object_name }) => {
      try {
        const n = object_name.toUpperCase();
        const adtType = {
          program: 'PROG/P',
          class: 'CLAS/OC',
          function_module: 'FUGR/FF',
          table: 'TABL/DT',
          include: 'PROG/I',
          enhancement: 'ENHO/EI',
        }[object_type] ?? 'PROG/P';

        const body = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/${n}" adtcore:type="${adtType}" adtcore:name="${n}"/>
</adtcore:objectReferences>`;

        const csrfToken = await getCsrfToken(creds);
        const res = await sapRequest(creds, '/sap/bc/adt/activation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.sap.adt.activation.request+xml; charset=utf-8',
            'X-CSRF-Token': csrfToken,
            Accept: 'application/xml',
          },
          body,
        });
        if (!res.ok) {
          const txt = await res.text();
          return { content: [{ type: 'text', text: `Activation failed (${res.status}): ${txt.slice(0, 400)}` }], isError: true };
        }
        return { content: [{ type: 'text', text: `✅ ${object_name} activated successfully.` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Activation failed: ${e.message}` }], isError: true };
      }
    }
  );

  // ── Tool: syntax_check ──────────────────────────────────────────────────
  server.tool(
    'sap_syntax_check',
    'Run an ABAP syntax check on source code without writing it to SAP.',
    {
      object_type: z.enum(['program', 'class', 'function_module', 'include', 'enhancement'])
        .describe('SAP object type'),
      object_name: z.string().describe('SAP object name'),
      source_code: z.string().describe('ABAP source code to check'),
    },
    async ({ object_type, object_name, source_code }) => {
      try {
        const n = object_name.toUpperCase();
        const checkUrl = `/sap/bc/adt/checkruns?adtcore:objectType=${encodeURIComponent('PROG/P')}&adtcore:name=${encodeURIComponent(n)}`;
        const csrfToken = await getCsrfToken(creds);
        const res = await sapRequest(creds, checkUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-CSRF-Token': csrfToken,
            Accept: 'application/vnd.sap.adt.checkmessages+xml',
          },
          body: source_code,
        });
        const xml = await res.text();
        // Extract messages from ADT check response
        const messages = [...xml.matchAll(/<chkl:message[^>]+type="([^"]+)"[^>]*>\s*<chkl:shortText[^>]*>([^<]+)/g)]
          .map(([, type, text]) => `[${type.toUpperCase()}] ${text.trim()}`)
          .join('\n');
        if (!messages) {
          return { content: [{ type: 'text', text: `✅ No syntax errors found in ${object_name}.` }] };
        }
        return { content: [{ type: 'text', text: messages }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Syntax check failed: ${e.message}` }], isError: true };
      }
    }
  );

  // ── Tool: list_package_objects ──────────────────────────────────────────
  server.tool(
    'sap_list_package',
    'List the ABAP objects inside a SAP package/development class.',
    {
      package_name: z.string().describe('SAP package name (e.g. ZPACKAGE)'),
    },
    async ({ package_name }) => {
      try {
        const n = package_name.toUpperCase();
        const res = await sapRequest(creds, `/sap/bc/adt/repository/nodestructure?parent_name=${encodeURIComponent(n)}&parent_tech_name=${encodeURIComponent(n)}&parent_type=DEVC%2FK&is_hex_encoded=true`, {
          headers: { Accept: 'application/vnd.sap.as+xml; dataname=com.sap.adt.RepositoryObjectTreeContent' },
        });
        if (!res.ok) {
          return { content: [{ type: 'text', text: `Could not list package ${n}: HTTP ${res.status}` }], isError: true };
        }
        const xml = await res.text();
        const objects = [...xml.matchAll(/adtcore:name="([^"]+)"[^/]*adtcore:type="([^"]+)"/g)]
          .map(([, name, type]) => `${type.padEnd(12)} ${name}`)
          .join('\n');
        return { content: [{ type: 'text', text: objects || `Package ${n} is empty or not found.` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `List failed: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}

// ── CORS proxy handler ─────────────────────────────────────────────────────
// Forwards SAP ADT requests from the browser to the real SAP host server-side,
// so the platform works without VPN on the client machine.
// The browser passes the real SAP host in X-Sap-Target; credentials travel
// in the standard Authorization: Basic header as usual.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS ?? '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Authorization', 'Content-Type', 'Accept',
    'X-CSRF-Token', 'sap-client', 'X-Sap-Target',
  ].join(', '),
  'Access-Control-Expose-Headers': 'X-CSRF-Token',
  'Access-Control-Max-Age': '86400',
};

// Make an HTTPS request to SAP, bypassing self-signed cert errors.
// Returns a Promise<{ status, headers, body: Buffer }>.
function httpsRequest(targetUrl, opts = {}, bodyBuf) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      rejectUnauthorized: false,
      timeout: opts.timeout || 30000,
    };
    const req = https.request(reqOpts, sapRes => {
      const chunks = [];
      sapRes.on('data', c => chunks.push(c));
      sapRes.on('end', () => resolve({ status: sapRes.statusCode, headers: sapRes.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('SAP request timed out')); });
    req.on('error', reject);
    if (bodyBuf?.length) req.write(bodyBuf);
    req.end();
  });
}

async function handleSapInfo(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, CORS_HEADERS); res.end(); return; }

  // Parse body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
    return;
  }

  const { host, username, password, client = '100' } = body;
  if (!host || !username || !password) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'host, username and password are required' }));
    return;
  }

  const base = host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    'sap-client': String(client),
    Accept: 'application/xml, text/xml, */*',
    'X-CSRF-Token': 'Fetch',
  };

  try {
    // First try /sap/bc/adt/system/settings (richer info)
    let sapRes = await httpsRequest(`${base}/sap/bc/adt/system/settings`, { headers, timeout: 30000 });
    // Fall back to discovery if settings returns 404
    if (sapRes.status === 404) {
      sapRes = await httpsRequest(`${base}/sap/bc/adt/discovery`, { headers, timeout: 30000 });
    }
    const xml = sapRes.body.toString('utf8');

    // Extract SID + client from SAP_SESSIONID_{SID}_{CLIENT} cookie (most reliable source)
    const cookieHeader = [sapRes.headers['set-cookie']].flat().join(' ');
    const cookieSid    = cookieHeader.match(/SAP_SESSIONID_([A-Z0-9]{2,3})_\d+/)?.[1] ?? '';
    const cookieClient = cookieHeader.match(/SAP_SESSIONID_[A-Z0-9]+_(\d+)/)?.[1] ?? '';

    if (sapRes.status === 401) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 401, error: 'HTTP 401 — wrong credentials' }));
      return;
    }
    if (sapRes.status === 403) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 403, error: 'HTTP 403 — no ADT authorization' }));
      return;
    }
    if (sapRes.status === 404) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 404, error: 'HTTP 404 — ADT service not active (check SICF)' }));
      return;
    }
    if (sapRes.status < 200 || sapRes.status >= 300) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: sapRes.status, error: `HTTP ${sapRes.status}` }));
      return;
    }

    // Parse SAP system info from XML — namespace-agnostic: matches adt:, adtcore:, or no prefix
    const xAttr = (x, name) => x.match(new RegExp(`(?:^|\\s)(?:[^:>"\\s]+:)?${name}="([^"]+)"`))?.[1] ?? '';
    const xElem = (x, name) => x.match(new RegExp(`<(?:[^:>]+:)?${name}[^>]*>([^<]+)`))?.[1]?.trim() ?? '';
    const xAny  = (x, name) => xAttr(x, name) || xElem(x, name);

    // Cookie is most reliable; fall back to XML attrs, then request body
    const sid     = cookieSid || xAny(xml, 'systemId') || xAttr(xml, 'SystemId');
    const release = xAny(xml, 'systemRelease') || xAny(xml, 'abapRelease') || xAny(xml, 'release');
    const sp      = xAny(xml, 'spLevel') || xAny(xml, 'abapSP') || xAttr(xml, 'sp');
    const xmlClient = xAny(xml, 'client');
    const resolvedClient = cookieClient || xmlClient || client;
    const desc    = xElem(xml, 'title') || xAttr(xml, 'title');

    // Map numeric abapRelease (e.g. "756") to readable label when possible
    const releaseLabel = /^\d{3}$/.test(release)
      ? ({ '756': '2023', '757': '2024', '758': '2025', '755': '2022', '754': '2021', '753': '2020' }[release] ?? release)
      : release;
    const spLabel = sp ? `SP ${sp.replace(/^0+/, '') || '00'}` : '';

    // Exclude BOPF-style component names that aren't useful system identifiers
    const usefulDesc = desc && !desc.toLowerCase().includes('system') && desc.length < 50 && !/^[A-Z_]{3,}$/.test(desc) ? desc : '';
    const parts = [
      sid && `SID: ${sid}`,
      resolvedClient && `Client ${resolvedClient}`,
      releaseLabel && `Release ${releaseLabel}`,
      spLabel,
      !sid && !releaseLabel && usefulDesc,
    ].filter(Boolean);
    const systemInfo = parts.join(' | ') || (desc ? `Connected — ${desc}` : `Connected (HTTP ${sapRes.status})`);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, systemInfo, status: sapRes.status, debug: { sid, cookieSid, release, sp, resolvedClient, desc, xmlSnippet: xml.slice(0, 600) } }));
  } catch (e) {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message?.slice(0, 120) || 'SAP connection failed' }));
  }
}

async function handleSapProxy(req, res) {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const sapTarget = req.headers['x-sap-target'];
  if (!sapTarget) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-Sap-Target header with the SAP host URL' }));
    return;
  }

  // Strip /sap-proxy prefix, keep the ADT path
  const adtPath = req.url.replace(/^\/sap-proxy/, '') || '/';
  const targetUrl = sapTarget.replace(/\/$/, '') + adtPath;

  // Collect body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  // Forward all headers except hop-by-hop and our custom routing header
  const SKIP = new Set(['host', 'x-sap-target', 'connection', 'transfer-encoding', 'keep-alive']);
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP.has(k.toLowerCase())) forwardHeaders[k] = v;
  }

  try {
    const sapRes = await httpsRequest(targetUrl, { method: req.method, headers: forwardHeaders, timeout: 30000 }, body);

    // Build response headers: CORS overrides + SAP response headers
    const outHeaders = { ...CORS_HEADERS };
    const SKIP_RES = new Set(['transfer-encoding', 'connection', 'keep-alive', 'access-control-allow-origin']);
    for (const [k, v] of Object.entries(sapRes.headers)) {
      if (!SKIP_RES.has(k.toLowerCase())) outHeaders[k] = v;
    }

    res.writeHead(sapRes.status, outHeaders);
    res.end(sapRes.body);
  } catch (e) {
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `SAP proxy error: ${e.message}` }));
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // Global CORS preflight — must be first so every endpoint handles OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'OPTIONS' && req.url === '/health') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'techcase-sap-mcp', version: '1.7.5', endpoints: { mcp: '/mcp', proxy: '/sap-proxy', sapInfo: '/sap-info', health: '/health', status: '/status', restart: '/restart', update: '/update', diagnostics: '/diagnostics', vpnStart: '/vpn/start', vpnStop: '/vpn/stop', vpnRestart: '/vpn/restart' } }));
    return;
  }

  // Infrastructure status: VM reachable, MCP running, VPN connected
  if (req.method === 'GET' && (req.url === '/status' || req.url === '/status/')) {
    let vpn = false;
    let vpnDetail = '';
    let vpnService = '';
    try {
      // Primary check: verify a ppp/tun tunnel interface actually exists (service can be
      // "active" in systemd while the PPP connection has silently dropped)
      try {
        const ifaces = execSync('ip link show up 2>/dev/null | grep -E "ppp[0-9]|tun[0-9]" | head -3', { timeout: 2000 }).toString().trim();
        if (ifaces) {
          const ifName = ifaces.match(/(ppp\d+|tun\d+)/)?.[1] || 'ppp/tun';
          vpn = true;
          vpnService = ifName;
          vpnDetail = `Tunnel up (${ifName})`;
          // Also find which systemd service owns it
          const services = ['openfortivpn@vpn', 'openfortivpn', 'wg-quick@wg0', 'wireguard'];
          for (const svc of services) {
            try {
              const st = execSync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 1500 }).toString().trim();
              if (st === 'active') { vpnService = svc; vpnDetail = `Connected (${svc})`; break; }
            } catch { /* try next */ }
          }
        } else {
          // No tunnel interface — check if service is running but tunnel dropped
          const services = ['openfortivpn@vpn', 'openfortivpn', 'wg-quick@wg0', 'wireguard'];
          let svcActive = '';
          for (const svc of services) {
            try {
              const st = execSync(`systemctl is-active ${svc} 2>/dev/null`, { timeout: 1500 }).toString().trim();
              if (st === 'active') { svcActive = svc; break; }
            } catch { /* try next */ }
          }
          vpn = false;
          vpnDetail = svcActive ? `Service running (${svcActive}) but tunnel interface missing — VPN dropped` : 'No VPN service detected';
          vpnService = svcActive;
        }
      } catch { vpnDetail = 'inactive'; }
    } catch (e) {
      vpnDetail = e.message?.slice(0, 80) ?? 'error';
    }
    const uptime = Math.floor((Date.now() - SERVER_START) / 1000);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ vm: true, mcp: true, vpn, vpnDetail, vpnService, version: '1.7.5', uptime, timestamp: new Date().toISOString() }));
    return;
  }

  // VPN control — start, stop, or restart the VPN service
  if (req.method === 'POST' && (req.url === '/vpn/start' || req.url === '/vpn/stop' || req.url === '/vpn/restart')) {
    const action = req.url.endsWith('/stop') ? 'stop' : req.url.endsWith('/restart') ? 'restart' : 'start';
    try {
      // Parse optional VPN credentials from request body
      let vpnCfg = null;
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString().trim();
        if (raw) vpnCfg = JSON.parse(raw);
      } catch { /* no body or invalid JSON */ }

      // Write /etc/openfortivpn/vpn.conf from credentials if provided
      if (action === 'start' && vpnCfg?.host) {
        const lines = [
          `host = ${vpnCfg.host}`,
          `port = ${vpnCfg.port || '443'}`,
          `username = ${vpnCfg.username || ''}`,
        ];
        if (vpnCfg.trusted_cert) lines.push(`trusted-cert = ${vpnCfg.trusted_cert}`);
        const configContent = lines.join('\n') + '\n';
        execSync('sudo mkdir -p /etc/openfortivpn', { timeout: 3000 });
        execSync('sudo tee /etc/openfortivpn/vpn.conf', { input: configContent, timeout: 5000 });
        execSync('sudo chmod 600 /etc/openfortivpn/vpn.conf', { timeout: 3000 });
        // Write password to a separate file so # chars are not treated as comments
        const pw = vpnCfg.password || '';
        execSync('sudo tee /etc/openfortivpn/.pw', { input: pw, timeout: 3000 });
        execSync('sudo chmod 600 /etc/openfortivpn/.pw', { timeout: 3000 });
        // Write a wrapper script that passes password via -p (no comment-char issue)
        const wrapper = `#!/bin/bash\nexec /usr/bin/openfortivpn -c /etc/openfortivpn/vpn.conf -p "$(sudo cat /etc/openfortivpn/.pw)"\n`;
        execSync('sudo tee /etc/openfortivpn/start.sh', { input: wrapper, timeout: 3000 });
        execSync('sudo chmod 755 /etc/openfortivpn/start.sh', { timeout: 3000 });
        // Systemd drop-in to use wrapper script with RestartSec to avoid lockout loops
        const dropin = `[Service]\nExecStart=\nExecStart=/etc/openfortivpn/start.sh\nRestartSec=30\n`;
        execSync('sudo mkdir -p /etc/systemd/system/openfortivpn@vpn.service.d', { timeout: 3000 });
        execSync('sudo tee /etc/systemd/system/openfortivpn@vpn.service.d/override.conf', { input: dropin, timeout: 3000 });
        execSync('sudo systemctl daemon-reload', { timeout: 5000 });
      }

      execSync(
        `sudo systemctl ${action} openfortivpn@vpn 2>/dev/null || sudo systemctl ${action} openfortivpn 2>/dev/null`,
        { timeout: 120000 }
      );
      const out = execSync(
        'if systemctl is-active --quiet openfortivpn@vpn 2>/dev/null || systemctl is-active --quiet openfortivpn 2>/dev/null; then echo active; else echo inactive; fi',
        { timeout: 4000 }
      ).toString().trim();
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, vpn: out === 'active', vpnDetail: out }));
    } catch (e) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message?.slice(0, 200) }));
    }
    return;
  }

  // Graceful restart: respond first, then restart via systemd (or exit so systemd restarts)
  if (req.method === 'POST' && req.url === '/restart') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Restarting…' }));
    setTimeout(() => {
      try { execSync('sudo systemctl restart sap-mcp 2>/dev/null', { timeout: 8000 }); } catch { process.exit(0); }
    }, 200);
    return;
  }

  // Self-update via pull: GET /self-update?src=<url> — server fetches script from URL and restarts
  if (req.method === 'GET' && req.url?.startsWith('/self-update')) {
    try {
      const srcUrl = new URL(req.url, 'http://localhost').searchParams.get('src');
      if (!srcUrl) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing src parameter' }));
        return;
      }
      const resp = await fetch(srcUrl, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `Source URL returned HTTP ${resp.status}` }));
        return;
      }
      const script = await resp.text();
      if (!script || script.length < 500 || !script.includes('import ')) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Fetched script is empty or too short' }));
        return;
      }
      const selfPath = fileURLToPath(import.meta.url);
      writeFileSync(selfPath, script, 'utf8');
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Script updated — restarting in 1s…', bytes: script.length }));
      setTimeout(() => process.exit(0), 1000);
    } catch (e) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message?.slice(0, 200) }));
    }
    return;
  }

  // Self-update: receive new index.js content, write to disk, restart
  if (req.method === 'POST' && req.url === '/update') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      // Accept both text/plain (no CORS preflight) and application/json
      const raw = Buffer.concat(chunks).toString();
      let script;
      try { script = JSON.parse(raw).script; } catch { script = raw; }
      if (!script || script.length < 500) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid or empty script content' }));
        return;
      }
      const selfPath = fileURLToPath(import.meta.url);
      writeFileSync(selfPath, script, 'utf8');
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Script updated — restarting in 1s…', bytes: script.length }));
      setTimeout(() => process.exit(0), 1000);
    } catch (e) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message?.slice(0, 200) }));
    }
    return;
  }

  // Diagnostics: port status, journal tail, memory, process info
  if (req.method === 'GET' && req.url === '/diagnostics') {
    const diag = { version: '1.7.5', uptime: Math.floor((Date.now() - SERVER_START) / 1000), timestamp: new Date().toISOString() };
    try {
      const portOut = execSync(`ss -ltnp 2>/dev/null | grep :${PORT} | head -3`, { timeout: 2000 }).toString().trim();
      diag.portListening = !!portOut;
      diag.portDetail = portOut.slice(0, 150);
    } catch { diag.portListening = true; diag.portDetail = 'ss command unavailable'; }
    try {
      diag.journal = execSync('journalctl -u sap-mcp --no-pager -n 30 2>/dev/null', { timeout: 3000 }).toString().trim().slice(-1200);
    } catch { diag.journal = ''; }
    try {
      diag.memory = execSync('free -h 2>/dev/null | grep Mem', { timeout: 2000 }).toString().trim();
    } catch { diag.memory = ''; }
    try {
      diag.nodeProcs = execSync('ps aux 2>/dev/null | grep node | grep -v grep | head -3', { timeout: 2000 }).toString().trim();
    } catch { diag.nodeProcs = ''; }
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(diag));
    return;
  }

  // SAP info check — POST {host, username, password, client} → {ok, systemInfo}
  if (req.url === '/sap-info') {
    await handleSapInfo(req, res);
    return;
  }

  // SAP CORS proxy — browser sends ADT requests here instead of directly to SAP
  if (req.url?.startsWith('/sap-proxy')) {
    await handleSapProxy(req, res);
    return;
  }

  // Only handle /mcp
  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Auth: decode SAP credentials from Bearer token
  let creds;
  try {
    creds = decodeCredentials(req.headers.authorization);
  } catch (e) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  // Build a fresh MCP server instance per request (credentials are request-scoped)
  const mcpServer = buildMcpServer(creds);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  // Clean up on close
  res.on('close', () => {
    transport.close();
    mcpServer.close();
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (e) {
    console.error('MCP request error:', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  }
});

// ── Cloudflare tunnel URL auto-registration ────────────────────────────────

const SUPABASE_URL = 'https://xwiduokkkoaxrhfyuwye.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3aWR1b2tra29heHJoZnl1d3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Nzg4ODIsImV4cCI6MjEwNTM1NDg4Mn0.odiyfucEQgyaVr8D8dXW0l9qGn7LHxqYvfmCaV2qGcI';

async function registerTunnelUrl() {
  await new Promise(r => setTimeout(r, 10000));
  for (let i = 0; i < 15; i++) {
    try {
      const journal = execSync('journalctl -u cloudflared-tunnel --no-pager -n 100 2>/dev/null', { timeout: 5000 }).toString();
      const m = journal.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        const tunnelUrl = m[0];
        const body = JSON.stringify({ tunnel_url: tunnelUrl });
        await new Promise((resolve, reject) => {
          const url = new URL(`${SUPABASE_URL}/rest/v1/vm_tunnel_registry`);
          const options = {
            hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
              'Content-Length': Buffer.byteLength(body),
            },
          };
          const req = https.request(options, res => {
            res.resume();
            res.on('end', resolve);
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
        console.log(`Tunnel URL registered: ${tunnelUrl}`);
        return;
      }
    } catch (e) { /* ignore */ }
    await new Promise(r => setTimeout(r, 4000));
  }
  console.warn('Could not detect cloudflared tunnel URL for registration');
}

async function pollCommandQueue() {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/vm_command_queue?status=eq.pending&order=created_at.asc&limit=5`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) { setTimeout(pollCommandQueue, 60000); return; }
    const cmds = await resp.json();
    for (const cmd of (Array.isArray(cmds) ? cmds : [])) {
      const markDone = (result) => fetch(
        `${SUPABASE_URL}/rest/v1/vm_command_queue?id=eq.${cmd.id}`,
        { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'done', result, processed_at: new Date().toISOString() }) }
      ).catch(() => {});
      if (cmd.command === 'restart_mcp') {
        console.log('[queue] restart_mcp command received — restarting service');
        await markDone('restarting');
        setTimeout(() => {
          try { execSync('sudo systemctl restart sap-mcp 2>/dev/null', { timeout: 8000 }); } catch { process.exit(0); }
        }, 300);
        return; // exit loop — process will restart
      }
      if (cmd.command === 'restart_vpn') {
        try {
          execSync('sudo systemctl restart openfortivpn@vpn 2>/dev/null || sudo systemctl restart openfortivpn 2>/dev/null', { timeout: 15000 });
          await markDone('vpn restarted');
        } catch (e) { await markDone(`failed: ${e.message?.slice(0, 80)}`); }
      }
      if (cmd.command === 'get_diagnostics') {
        const parts = [];
        const run = (label, cmd2, timeout = 4000) => {
          try { parts.push(`=== ${label} ===\n${execSync(cmd2, { timeout }).toString().trim()}`); }
          catch (e) { parts.push(`=== ${label} ===\n(failed: ${e.message?.slice(0, 60)})`); }
        };
        // Try journalctl, fall back to syslog grep
        try {
          parts.push(`=== Journal (last 120 lines) ===\n${execSync('journalctl -u sap-mcp --no-pager -n 120 2>/dev/null', { timeout: 6000 }).toString().trim()}`);
        } catch {
          try {
            parts.push(`=== Journal (sudo) ===\n${execSync('sudo journalctl -u sap-mcp --no-pager -n 120 2>/dev/null', { timeout: 6000 }).toString().trim()}`);
          } catch {
            try { parts.push(`=== Syslog (sap-mcp) ===\n${execSync('grep -i sap-mcp /var/log/syslog 2>/dev/null | tail -80', { timeout: 4000 }).toString().trim()}`); }
            catch { parts.push('=== Journal ===\n(not accessible — check: sudo journalctl -u sap-mcp -n 50)'); }
          }
        }
        run('Service Status', 'systemctl status sap-mcp 2>/dev/null | head -25');
        run(`Port ${PORT}`, `ss -ltnp 2>/dev/null | grep :${PORT} | head -3 || echo 'not listening'`);
        run('Memory', 'free -h 2>/dev/null | grep Mem');
        run('Node processes', 'ps aux 2>/dev/null | grep node | grep -v grep | head -5');
        await markDone(parts.join('\n\n').slice(0, 6000));
      }
    }
  } catch { /* best-effort */ }
  setTimeout(pollCommandQueue, 60000);
}

httpServer.listen(PORT, () => {
  console.log(`TechCase SAP MCP Server running on port ${PORT}`);
  console.log(`  MCP endpoint : http://localhost:${PORT}/mcp`);
  console.log(`  SAP info     : http://localhost:${PORT}/sap-info  (POST {host,username,password,client})`);
  console.log(`  SAP proxy    : http://localhost:${PORT}/sap-proxy  (enter this as Proxy URL in TechCase)`);
  console.log(`  Health check : http://localhost:${PORT}/health`);
  console.log(`  Status       : http://localhost:${PORT}/status`);
  console.log(`  Restart      : http://localhost:${PORT}/restart  (POST)`);
  console.log(`  Diagnostics  : http://localhost:${PORT}/diagnostics`);
  registerTunnelUrl().catch(() => {});
  setTimeout(pollCommandQueue, 15000); // start polling 15s after boot
});
