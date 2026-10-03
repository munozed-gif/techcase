#!/usr/bin/env node
// Local SAP proxy — run this on your VPN-connected machine.
// Listens on http://localhost:3001 and forwards requests to SAP,
// adding CORS headers so the browser accepts the response.
//
// Usage:
//   node local-sap-proxy.js
//
// Then in TechCase → SAP System settings → VPN Proxy URL, enter:
//   http://localhost:3001

import https from "node:https";
import http from "node:http";

const PORT = process.env.PORT || 3001;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function fetchSap(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: options.headers || {},
        agent: isHttps ? httpsAgent : undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
    if (options.body?.length) req.write(options.body);
    req.end();
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers":
    "Authorization, Accept, Content-Type, X-CSRF-Token, sap-client, corrNbr, X-Sap-Target",
  "Access-Control-Expose-Headers": "X-CSRF-Token, sap-metadata-content-type",
  "Access-Control-Max-Age": "3600",
};

const server = http.createServer(async (req, res) => {
  // CORS preflight
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const sapTarget = req.headers["x-sap-target"];
  if (!sapTarget) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing X-Sap-Target header" }));
    return;
  }

  const urlPath = req.url || "/";
  const sapUrl = `${sapTarget.replace(/\/$/, "")}${urlPath}`;

  const forwardHeaders = {};
  for (const key of ["authorization", "accept", "sap-client", "x-csrf-token", "content-type", "corrnbr"]) {
    if (req.headers[key]) forwardHeaders[key] = req.headers[key];
  }

  let body = Buffer.alloc(0);
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  let sapRes;
  try {
    sapRes = await fetchSap(sapUrl, { method: req.method, headers: forwardHeaders, body });
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Could not reach SAP: ${e.message}` }));
    return;
  }

  for (const h of ["x-csrf-token", "content-type", "sap-metadata-content-type"]) {
    if (sapRes.headers[h]) res.setHeader(h, sapRes.headers[h]);
  }

  res.writeHead(sapRes.status);
  res.end(sapRes.body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SAP proxy listening on http://localhost:${PORT}`);
  console.log(`Set VPN Proxy URL in TechCase settings to: http://localhost:${PORT}`);
});
