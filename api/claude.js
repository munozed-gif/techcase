import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const FREE_MONTHLY_LIMIT = 10;

// ── Supabase service-role client (bypasses RLS) ──────────────
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _db;
}

// ── AES-256-GCM decrypt ──────────────────────────────────────
function decryptApiKey(enc) {
  if (!enc || !process.env.ENCRYPTION_SECRET) return null;
  try {
    const [ivHex, encHex, tagHex] = enc.split(".");
    const key = crypto.scryptSync(process.env.ENCRYPTION_SECRET, "techcase-ai-salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

// ── Usage check (does NOT increment yet) ────────────────────
async function checkUsage(userId) {
  const { data: user } = await db()
    .from("users")
    .select("is_pro, anthropic_api_key_enc")
    .eq("id", userId)
    .single();

  if (!user) return { allowed: true, apiKey: null, isPro: false, isByok: false, used: 0, usageId: null };

  // BYOK — use their own key, no limit
  if (user.anthropic_api_key_enc) {
    const apiKey = decryptApiKey(user.anthropic_api_key_enc);
    if (apiKey) return { allowed: true, apiKey, isPro: false, isByok: true, used: 0, usageId: null };
  }

  // Pro — unlimited via master key
  if (user.is_pro) return { allowed: true, apiKey: null, isPro: true, isByok: false, used: 0, usageId: null };

  // Free tier — check monthly count
  const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { data: row } = await db()
    .from("ai_usage")
    .select("id, generations_used")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  const used = row?.generations_used ?? 0;
  if (used >= FREE_MONTHLY_LIMIT) {
    return {
      allowed: false, apiKey: null, isPro: false, isByok: false,
      used, limit: FREE_MONTHLY_LIMIT, usageId: row?.id ?? null,
    };
  }
  return {
    allowed: true, apiKey: null, isPro: false, isByok: false,
    used, limit: FREE_MONTHLY_LIMIT, usageId: row?.id ?? null,
    month,
  };
}

// ── Increment usage after a successful call ──────────────────
async function incrementUsage(userId, usageId, used, month) {
  if (!userId || !month) return;
  if (usageId) {
    await db().from("ai_usage").update({ generations_used: used + 1 }).eq("id", usageId);
  } else {
    await db().from("ai_usage").insert({ user_id: userId, month, generations_used: 1 });
  }
}

// ── Main handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const { model, system, messages, max_tokens = 2048, mcp_servers, user_id } = req.body ?? {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "messages array is required" } });
  }

  // ── AI usage gate ────────────────────────────────────────
  let usage = { allowed: true, apiKey: null, isPro: false, isByok: false, used: 0, usageId: null, month: null };
  if (user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      usage = await checkUsage(user_id);
    } catch {
      // DB unreachable — allow the call rather than block the user
    }
    if (!usage.allowed) {
      return res.status(402).json({
        error: {
          code: "ai_limit_reached",
          message: `You've used all ${FREE_MONTHLY_LIMIT} free AI generations this month. Add your Anthropic API key in Profile → AI, or ask your admin to enable Pro.`,
          used: usage.used,
          limit: FREE_MONTHLY_LIMIT,
        },
      });
    }
  }

  // ── Build Anthropic request ──────────────────────────────
  const betaFeatures = [];
  if (mcp_servers?.length) betaFeatures.push("mcp-client-2025-04-04");

  // Normalize model aliases — some stored settings use IDs the API rejects
  const MODEL_ALIASES = {
    'claude-haiku-4-5':  'claude-haiku-4-5-20251001',
    'claude-sonnet-5':   'claude-sonnet-4-6',
    'claude-sonnet-5-5': 'claude-sonnet-4-6',
    'claude-opus-5-5':   'claude-sonnet-4-6',
    'claude-haiku-5-5':  'claude-haiku-4-5-20251001',
    'claude-fable-5-1':  'claude-sonnet-4-6',
  };
  const resolvedModel = MODEL_ALIASES[model] ?? model ?? "claude-haiku-4-5-20251001";

  const body = { model: resolvedModel, system, messages, max_tokens };
  if (mcp_servers?.length) body.mcp_servers = mcp_servers;

  const anthropicKey = usage.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": anthropicKey,
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

    if (!response.ok && data.error?.message?.includes("did not match the expected pattern") && body.model !== FALLBACK_MODEL) {
      const fallback = await callAnthropicApi({ ...body, model: FALLBACK_MODEL });
      response = fallback.response;
      data = fallback.data;
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ?? { message: "Anthropic API error" } });
    }

    // ── Increment usage on success (free tier only) ────────
    if (user_id && !usage.isPro && !usage.isByok && usage.month) {
      incrementUsage(user_id, usage.usageId, usage.used, usage.month).catch(() => {});
    }

    // Surface remaining quota to the caller
    if (!usage.isPro && !usage.isByok) {
      res.setHeader("X-AI-Generations-Used", String(usage.used + 1));
      res.setHeader("X-AI-Generations-Limit", String(FREE_MONTHLY_LIMIT));
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Internal server error" } });
  }
}
