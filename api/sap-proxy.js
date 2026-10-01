// Server-side SAP proxy — forwards browser requests to SAP, bypassing CORS.
// Uses https module with rejectUnauthorized:false to handle SAP self-signed certs.

import https from "node:https";
import http from "node:http";

const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchSap(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
      rejectUnauthorized: false,
    };
    const sapReq = lib.request(reqOptions, sapRes => {
      const chunks = [];
      sapRes.on("data", c => chunks.push(c));
      sapRes.on("end", () => resolve({ status: sapRes.statusCode, headers: sapRes.headers, body: Buffer.concat(chunks) }));
    });
    sapReq.on("error", reject);
    if (options.body?.length) sapReq.write(options.body);
    sapReq.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sap-Target, sap-client, X-CSRF-Token, Accept");
  res.setHeader("Access-Control-Expose-Headers", "X-CSRF-Token, sap-metadata-content-type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const sapTarget = req.headers["x-sap-target"];
  if (!sapTarget) return res.status(400).json({ error: "Missing X-Sap-Target header" });

  const urlPath = req.url.replace(/^\/api\/sap-proxy/, "") || "/";
  const sapUrl = `${sapTarget.replace(/\/$/, "")}${urlPath}`;

  const forwardHeaders = {};
  for (const key of ["authorization", "accept", "sap-client", "x-csrf-token", "content-type"]) {
    if (req.headers[key]) forwardHeaders[key] = req.headers[key];
  }

  let body = Buffer.alloc(0);
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", c => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  let sapRes;
  try {
    sapRes = await fetchSap(sapUrl, { method: req.method, headers: forwardHeaders, body });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach SAP: ${e.message}` });
  }

  for (const h of ["x-csrf-token", "content-type", "sap-metadata-content-type"]) {
    if (sapRes.headers[h]) res.setHeader(h, sapRes.headers[h]);
  }

  res.status(sapRes.status).send(sapRes.body);
}
