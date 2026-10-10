import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function encryptApiKey(plaintext) {
  const key = crypto.scryptSync(process.env.ENCRYPTION_SECRET, "techcase-ai-salt", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["POST", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });

  const { user_id, api_key } = req.body ?? {};
  if (!user_id) return res.status(400).json({ error: "user_id is required" });

  if (!process.env.ENCRYPTION_SECRET) {
    return res.status(500).json({ error: "ENCRYPTION_SECRET is not configured on the server." });
  }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === "DELETE") {
      // Remove stored key
      await db.from("users").update({ anthropic_api_key_enc: null }).eq("id", user_id);
      return res.status(200).json({ ok: true });
    }

    if (!api_key || typeof api_key !== "string" || !api_key.startsWith("sk-ant-")) {
      return res.status(400).json({ error: "Invalid API key format. Must start with sk-ant-" });
    }

    const encrypted = encryptApiKey(api_key.trim());
    const { error } = await db.from("users").update({ anthropic_api_key_enc: encrypted }).eq("id", user_id);
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
