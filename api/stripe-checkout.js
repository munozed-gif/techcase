import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SB_URL  = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SB_ANON = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

// Partner plans: the caller must be signed in and an owner/admin of the partner. The partner id
// goes into the session and subscription metadata; the webhook sets partners.plan from it.
async function partnerCheckout(req, res, body) {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_ANON) return res.status(401).json({ error: "Sign in to upgrade the partner plan" });
  const db = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user?.id) return res.status(401).json({ error: "Your session expired — sign in again" });
  const { data: allowed } = await db.rpc("is_partner_member", { p: body.partnerId, roles: ["owner", "admin"] });
  if (allowed !== true) return res.status(403).json({ error: "Only the partner's owner or admins can change its plan" });
  const { data: partner } = await db.from("partners").select("id, name, status, plan, stripe_customer_id").eq("id", body.partnerId).maybeSingle();
  if (!partner || partner.status !== "approved") return res.status(403).json({ error: "This partner account is not approved" });
  if (partner.plan === "pro") return res.status(400).json({ error: "This partner is already on Pro" });

  const { data: row } = await db.from("system_settings").select("value").eq("key", "stripe_price_ids").maybeSingle();
  const priceId = (row?.value ?? {}).partner_pro;
  if (!priceId) return res.status(503).json({ error: "Partner Pro is not set up in Stripe yet — contact the administrator" });

  const metadata = { partnerId: partner.id, planKey: "pro", roleType: "partner", userId: u.user.id };
  const origin = req.headers.origin || "";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    ...(partner.stripe_customer_id ? { customer: partner.stripe_customer_id } : { customer_email: u.user.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: `${origin}?stripe=success&plan=partner_pro`,
    cancel_url: `${origin}?stripe=cancel`,
  });
  return res.status(200).json({ url: session.url, sessionId: session.id });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body ?? {};
  if (body.partnerId) {
    try { return await partnerCheckout(req, res, body); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }

  const { priceId, userId, userEmail, planKey, roleType, successUrl, cancelUrl } = body;

  if (!priceId || !userId || !userEmail) {
    return res.status(400).json({ error: "priceId, userId, and userEmail are required" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, planKey, roleType },
      success_url: successUrl || `${req.headers.origin}?stripe=success&plan=${planKey}`,
      cancel_url:  cancelUrl  || `${req.headers.origin}?stripe=cancel`,
    });
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
