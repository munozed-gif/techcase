export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const { model, system, messages, max_tokens = 2048, mcp_servers } = req.body ?? {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "messages array is required" } });
  }

  // Build beta headers — only add MCP client when servers are provided (PDF is now GA, no beta header needed)
  const betaFeatures = [];
  if (mcp_servers?.length) betaFeatures.push("mcp-client-2025-04-04");

  const body = {
    model: model || "claude-haiku-4-5-20251001",
    system,
    messages,
    max_tokens,
  };
  if (mcp_servers?.length) body.mcp_servers = mcp_servers;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  if (betaFeatures.length) headers["anthropic-beta"] = betaFeatures.join(",");

  const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

  async function callAnthropicApi(requestBody) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    return { response, data };
  }

  try {
    let { response, data } = await callAnthropicApi(body);

    // If the model is rejected (pattern mismatch = model not available for this API key),
    // retry once with the fallback haiku model that we know is available.
    if (!response.ok && data.error?.message?.includes("did not match the expected pattern") && body.model !== FALLBACK_MODEL) {
      const fallback = await callAnthropicApi({ ...body, model: FALLBACK_MODEL });
      response = fallback.response;
      data = fallback.data;
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ?? { message: "Anthropic API error" } });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Internal server error" } });
  }
}
