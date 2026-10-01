// Server-side SAP proxy — forwards browser requests to SAP, bypassing CORS.
// The browser calls /api/sap-proxy/<path> and passes X-Sap-Target + Authorization.
// The proxy forwards the request to X-Sap-Target/<path> from the server side.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sap-Target, sap-client, X-CSRF-Token, Accept");
  res.setHeader("Access-Control-Expose-Headers", "X-CSRF-Token, sap-metadata-content-type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const sapTarget = req.headers["x-sap-target"];
  if (!sapTarget) {
    return res.status(400).json({ error: "Missing X-Sap-Target header" });
  }

  // Build SAP URL: target + everything after /api/sap-proxy
  const urlPath = req.url.replace(/^\/api\/sap-proxy/, "") || "/";
  const sapUrl = `${sapTarget.replace(/\/$/, "")}${urlPath}`;

  // Forward all relevant headers except host
  const forwardHeaders = {};
  const passThrough = ["authorization", "accept", "sap-client", "x-csrf-token", "content-type"];
  for (const key of passThrough) {
    if (req.headers[key]) forwardHeaders[key] = req.headers[key];
  }

  let body = undefined;
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
    sapRes = await fetch(sapUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body?.length ? body : undefined,
    });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach SAP: ${e.message}` });
  }

  // Forward response headers the client cares about
  const fwdResHeaders = ["x-csrf-token", "content-type", "sap-metadata-content-type"];
  for (const h of fwdResHeaders) {
    const v = sapRes.headers.get(h);
    if (v) res.setHeader(h, v);
  }

  const responseBody = await sapRes.arrayBuffer();
  res.status(sapRes.status).send(Buffer.from(responseBody));
}
