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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const PORT = Number(process.env.PORT ?? 3101);
const __dir = dirname(fileURLToPath(import.meta.url));

// Resolve the ADT server entry point:
//   1. ADT_PATH env var (explicit override)
//   2. Sibling clone: ../mcp-abap-abap-adt-api/dist/index.js
//   3. npm package:   ./node_modules/mcp-abap-abap-adt-api/dist/index.js
function resolveAdtScript() {
  if (process.env.ADT_PATH) return process.env.ADT_PATH;
  const sibling = resolve(__dir, '..', 'mcp-abap-abap-adt-api', 'dist', 'index.js');
  if (existsSync(sibling)) return sibling;
  return resolve(__dir, 'node_modules', 'mcp-abap-abap-adt-api', 'dist', 'index.js');
}

const ADT_SCRIPT = resolveAdtScript();
console.log(`[bridge] Using ADT server: ${ADT_SCRIPT}`);

// ── Persistent subprocess client ─────────────────────────────
let adtClient = null;

async function getClient() {
  if (adtClient) return adtClient;

  const transport = new StdioClientTransport({
    command: 'node',
    args: [ADT_SCRIPT],
    env: {
      ...process.env,
      SAP_URL:      process.env.SAP_URL,
      SAP_USER:     process.env.SAP_USER,
      SAP_PASSWORD: process.env.SAP_PASSWORD,
      SAP_CLIENT:   process.env.SAP_CLIENT   ?? '100',
      SAP_LANGUAGE: process.env.SAP_LANGUAGE ?? 'EN',
    },
  });

  const client = new Client({ name: 'adt-http-bridge', version: '1.0.0' });
  await client.connect(transport);

  transport.onclose = () => {
    console.warn('[bridge] ADT subprocess closed — will respawn on next request');
    adtClient = null;
  };

  adtClient = client;
  console.log('[bridge] Connected to mcp-abap-abap-adt-api subprocess');
  return client;
}

// ── Express app ───────────────────────────────────────────────
const app = express();
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
  res.json({ status: 'ok', service: 'abap-adt-bridge', version: '1.0.0' });
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
    const client = await getClient();
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

app.listen(PORT, () => {
  console.log(`[bridge] ABAP ADT bridge listening on port ${PORT}`);
  console.log(`[bridge] MCP endpoint: http://localhost:${PORT}/mcp`);
  // Warm up the subprocess connection
  getClient().catch(err => console.error('[bridge] Subprocess warmup failed:', err.message));
});
