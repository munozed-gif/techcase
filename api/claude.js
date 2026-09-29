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

  // Build beta headers — always include PDF support; add MCP client when servers are provided
  const betaFeatures = ["pdfs-2024-09-25"];
  if (mcp_servers?.length) betaFeatures.push("mcp-client-2025-04-04");

  const body = {
    model: model || "claude-haiku-4-5-20251001",
    system,
    messages,
    max_tokens,
  };
  if (mcp_servers?.length) body.mcp_servers = mcp_servers;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": betaFeatures.join(","),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ?? { message: "Anthropic API error" } });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Internal server error" } });
  }
}
