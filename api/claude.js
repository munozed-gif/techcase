import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const FREE_MONTHLY_LIMIT_DEFAULT = 10;

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
  const [{ data: user }, { data: planRow }, { data: limitRow }] = await Promise.all([
    db().from("users").select("is_pro, anthropic_api_key_enc, role").eq("id", userId).single(),
    db().from("system_settings").select("value").eq("key", "user_plans").maybeSingle(),
    db().from("system_settings").select("value").eq("key", "ai_free_monthly_limit").maybeSingle(),
  ]);
  const FREE_MONTHLY_LIMIT = Number(limitRow?.value) || FREE_MONTHLY_LIMIT_DEFAULT;

  if (!user) return { allowed: true, apiKey: null, isPro: false, isByok: false, used: 0, usageId: null };

  // Admin — unlimited, no usage tracking
  if (user.role === 'admin') return { allowed: true, apiKey: null, isPro: true, isByok: false, used: 0, usageId: null };

  // BYOK — use their own key, no limit
  if (user.anthropic_api_key_enc) {
    const apiKey = decryptApiKey(user.anthropic_api_key_enc);
    if (apiKey) return { allowed: true, apiKey, isPro: false, isByok: true, used: 0, usageId: null };
  }

  // Pro — either is_pro flag OR plan set to non-free via admin plan dropdown
  const userPlans = planRow?.value ?? {};
  const assignedPlan = userPlans[userId]?.plan ?? 'free';
  if (user.is_pro || assignedPlan !== 'free') return { allowed: true, apiKey: null, isPro: true, isByok: false, used: 0, usageId: null };

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
// ── AI cost per call (case Costs tab) ─────────────────────────
// USD per million tokens. Overridable in system_settings.cost_config.ai_prices.
const DEFAULT_AI_PRICES = {
  'claude-haiku-5-5':  { input: 0.10, output: 0.50, cache_read: 0.01,  cache_write: 0.125 },
  'claude-sonnet-5-5': { input: 2.00, output: 10.0, cache_read: 0.10,  cache_write: 2.50 },
  'claude-opus-5-5':   { input: 4.00, output: 20.0, cache_read: 0.20,  cache_write: 5.00 },
};
let _pricesCache = { at: 0, prices: DEFAULT_AI_PRICES };
async function aiPrices() {
  if (Date.now() - _pricesCache.at < 10 * 60 * 1000) return _pricesCache.prices;
  let custom = {};
  try {
    const { data } = await db().from("system_settings").select("value").eq("key", "cost_config").maybeSingle();
    custom = data?.value?.ai_prices ?? {};
  } catch { /* defaults */ }
  _pricesCache = { at: Date.now(), prices: { ...DEFAULT_AI_PRICES, ...custom } };
  return _pricesCache.prices;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function logAiUsage({ userId, caseId, projectId, feature, model, usage, mcp }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !usage) return;
  try {
    const p = (await aiPrices())[model] ?? DEFAULT_AI_PRICES['claude-haiku-5-5'];
    const inp = Number(usage.input_tokens) || 0, out = Number(usage.output_tokens) || 0;
    const cr = Number(usage.cache_read_input_tokens) || 0, cw = Number(usage.cache_creation_input_tokens) || 0;
    const cost = (inp * p.input + out * p.output + cr * (p.cache_read ?? p.input * 0.1) + cw * (p.cache_write ?? p.input * 1.25)) / 1e6;
    await db().from("ai_usage_events").insert({
      user_id: UUID_RE.test(String(userId ?? '')) ? userId : null,
      case_id: UUID_RE.test(String(caseId ?? '')) ? caseId : null,
      project_id: UUID_RE.test(String(projectId ?? '')) ? projectId : null,
      feature: String(feature ?? 'other').slice(0, 60), model,
      input_tokens: inp, output_tokens: out, cache_read_tokens: cr, cache_write_tokens: cw,
      mcp: !!mcp, cost_usd: Math.round(cost * 1e6) / 1e6,
    });
  } catch (e) { console.warn("[claude] usage log:", e.message); }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const { model, system, messages, max_tokens = 2048, mcp_servers, user_id, case_id, project_id, feature } = req.body ?? {};

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
          message: `You've used all ${usage.limit} free AI generations this month. Add your Anthropic API key in Profile → AI, or ask your admin to enable Pro.`,
          used: usage.used,
          limit: usage.limit,
        },
      });
    }
  }

  // ── Build Anthropic request ──────────────────────────────
  const betaFeatures = [];
  if (mcp_servers?.length) betaFeatures.push("mcp-client-2025-04-04");
  const hasPdfDocument = Array.isArray(messages) && messages.some(m =>
    Array.isArray(m.content) && m.content.some(b =>
      b?.type === 'document' && b?.source?.media_type === 'application/pdf'
    )
  );
  if (hasPdfDocument) betaFeatures.push('pdfs-2024-09-25');

  const SAFE_MODEL = 'claude-haiku-5-5';
  const MODEL_ALIASES = {
    'claude-haiku-4-5':          SAFE_MODEL,
    'claude-haiku-4-5-20251001': SAFE_MODEL,
    'claude-haiku-5-5':          SAFE_MODEL,
    'claude-sonnet-4-5':         SAFE_MODEL,
    'claude-sonnet-4-6':         SAFE_MODEL,
    'claude-sonnet-5':           SAFE_MODEL,
    'claude-sonnet-5-5':         SAFE_MODEL,
    'claude-opus-5-5':           SAFE_MODEL,
    'claude-fable-5-1':          SAFE_MODEL,
  };
  const resolvedModel = MODEL_ALIASES[model] ?? (model?.startsWith('claude-') ? model : SAFE_MODEL);

  // The current models think by default (adaptive thinking), and thinking counts against
  // max_tokens. Small limits set by the app (800, 2000…) could be used up by thinking before
  // any answer text — "the AI response was cut (max_tokens)". max_tokens is only a ceiling,
  // so give every call room; short answers cost the same.
  const MIN_MAX_TOKENS = 16000;
  const effectiveMaxTokens = Math.max(Number(max_tokens) || 2048, MIN_MAX_TOKENS);
  const body = { model: resolvedModel, system, messages, max_tokens: effectiveMaxTokens };
  if (mcp_servers?.length) body.mcp_servers = mcp_servers;

  const anthropicKey = usage.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": anthropicKey,
    "anthropic-version": "2023-06-01",
  };
  if (betaFeatures.length) headers["anthropic-beta"] = betaFeatures.join(",");

  const FALLBACK_MODEL = "claude-haiku-5-5";

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

    // Still no answer text because thinking used the whole limit: retry once with thinking off
    // (accepted on Haiku 5.5 at the default effort).
    const hasText = (d) => Array.isArray(d?.content) && d.content.some(b => b.type === "text" && b.text);
    if (response.ok && data?.stop_reason === "max_tokens" && !hasText(data)) {
      const retry = await callAnthropicApi({ ...body, thinking: { type: "disabled" } });
      if (retry.response.ok) { response = retry.response; data = retry.data; }
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ?? { message: "Anthropic API error" } });
    }

    // ── Cost of this call, by case and step (Costs tab) ─────
    await logAiUsage({ userId: user_id, caseId: case_id, projectId: project_id, feature, model: data?.model ?? body.model, usage: data?.usage, mcp: !!mcp_servers?.length });

    // ── Increment usage on success (free tier only) ────────
    if (user_id && !usage.isPro && !usage.isByok && usage.month) {
      incrementUsage(user_id, usage.usageId, usage.used, usage.month).catch(() => {});
    }

    // Surface remaining quota to the caller
    if (!usage.isPro && !usage.isByok) {
      res.setHeader("X-AI-Generations-Used", String(usage.used + 1));
      res.setHeader("X-AI-Generations-Limit", String(usage.limit ?? FREE_MONTHLY_LIMIT_DEFAULT));
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Internal server error" } });
  }
}
