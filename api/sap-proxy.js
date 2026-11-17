// Server-side SAP proxy — forwards browser requests to SAP, bypassing CORS.
// Uses https module with rejectUnauthorized:false to handle SAP self-signed certs.

import https from "node:https";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const SB_URL  = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SB_ANON = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const normHost = (h) => String(h ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

// Only logged-in, approved platform users, and only towards SAP hosts saved in the
// platform's SAP settings (otherwise this endpoint would relay requests to any host).
async function checkCaller(token, sapTarget) {
  if (!SB_URL || !SB_ANON) return { error: "SAP proxy is not configured on the server" };
  if (!token) return { error: "App login required — sign in to the platform and retry" };
  const db = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await db.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Your session expired — sign in again and retry" };
  // RLS: settings are only readable by approved users.
  const { data: row } = await db.from("system_settings").select("value").eq("key", "sap_integration").maybeSingle();
  const target = normHost(sapTarget);
  for (const cfg of Object.values(row?.value ?? {})) {
    const envs = Array.isArray(cfg?.environments) ? cfg.environments : (cfg?.host ? [cfg] : []);
    if (envs.some(e => e?.host && normHost(e.host) === target)) return { userId };
  }
  return { error: `${target} is not a SAP system saved in the platform` };
}

// SAP passwords are kept server-side (sap_env_secrets): the app sends "user:" and the
// password is looked up for this user (sap_env_password_for checks access).
const SVC_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const SVC_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
async function fillPassword(authHeader, userId, sapTarget, sapClient) {
  if (!authHeader?.startsWith("Basic ") || !SVC_URL || !SVC_KEY) return authHeader;
  const dec = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const i = dec.indexOf(":");
  const user = i >= 0 ? dec.slice(0, i) : dec;
  const pass = i >= 0 ? dec.slice(i + 1) : "";
  if (!user || (pass && pass !== "undefined")) return authHeader;
  const svc = createClient(SVC_URL, SVC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: pw } = await svc.rpc("sap_env_password_for",
    { p_user: userId, p_host: String(sapTarget), p_username: user, p_client: sapClient ? String(sapClient) : null });
  return typeof pw === "string" && pw ? "Basic " + Buffer.from(`${user}:${pw}`).toString("base64") : authHeader;
}

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sap-Target, sap-client, X-CSRF-Token, Accept, X-App-Token");
  res.setHeader("Access-Control-Expose-Headers", "X-CSRF-Token, sap-metadata-content-type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const sapTarget = req.headers["x-sap-target"];
  if (!sapTarget) return res.status(400).json({ error: "Missing X-Sap-Target header" });
  const caller = await checkCaller(req.headers["x-app-token"] || null, sapTarget);
  if (caller.error) return res.status(403).json({ error: caller.error });

  const urlPath = req.url.replace(/^\/api\/sap-proxy/, "") || "/";
  const sapUrl = `${sapTarget.replace(/\/$/, "")}${urlPath}`;

  const forwardHeaders = {};
  for (const key of ["authorization", "accept", "sap-client", "x-csrf-token", "content-type"]) {
    if (req.headers[key]) forwardHeaders[key] = req.headers[key];
  }
  if (forwardHeaders.authorization) {
    forwardHeaders.authorization = await fillPassword(forwardHeaders.authorization, caller.userId, sapTarget, req.headers["sap-client"]);
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
