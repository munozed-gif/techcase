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
    version: '1.0.0',
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
    const sapRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body?.length ? body : undefined,
    });

    const buf = Buffer.from(await sapRes.arrayBuffer());

    // Build response headers: CORS overrides + SAP response headers
    const outHeaders = { ...CORS_HEADERS };
    const SKIP_RES = new Set(['transfer-encoding', 'connection', 'keep-alive', 'access-control-allow-origin']);
    for (const [k, v] of sapRes.headers.entries()) {
      if (!SKIP_RES.has(k.toLowerCase())) outHeaders[k] = v;
    }

    res.writeHead(sapRes.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `SAP proxy error: ${e.message}` }));
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'techcase-sap-mcp', version: '1.1.0', endpoints: { mcp: '/mcp', proxy: '/sap-proxy', health: '/health' } }));
    return;
  }

  // SAP CORS proxy — browser sends ADT requests here instead of directly to SAP
  if (req.url?.startsWith('/sap-proxy')) {
    await handleSapProxy(req, res);
    return;
  }

  // Only handle /mcp
  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404);
    res.end('Not found');
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

httpServer.listen(PORT, () => {
  console.log(`TechCase SAP MCP Server running on port ${PORT}`);
  console.log(`  MCP endpoint : http://localhost:${PORT}/mcp`);
  console.log(`  SAP proxy    : http://localhost:${PORT}/sap-proxy  (enter this as Proxy URL in TechCase)`);
  console.log(`  Health check : http://localhost:${PORT}/health`);
});
