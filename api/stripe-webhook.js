import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supabase admin client (service role) to write system_settings
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(typeof c === "string" ? Buffer.from(c) : c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function updateUserPlan(userId, plan, roleType) {
  // Read current user_plans from system_settings
  const { data: row } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "user_plans")
    .maybeSingle();

  const existing = row?.value ?? {};
  const updated  = { ...existing, [userId]: { plan, roleType, updatedAt: new Date().toISOString() } };

  await supabase.from("system_settings").upsert(
    { key: "user_plans", value: updated },
    { onConflict: "key" }
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, planKey, roleType } = session.metadata ?? {};
    if (userId && planKey && roleType) {
      await updateUserPlan(userId, planKey, roleType);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    // Downgrade to free when subscription cancelled
    const sub = event.data.object;
    const { userId, roleType } = sub.metadata ?? {};
    if (userId && roleType) {
      await updateUserPlan(userId, "free", roleType);
    }
  }

  return res.status(200).json({ received: true });
}
