import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, userId, userEmail, planKey, roleType, successUrl, cancelUrl } = req.body ?? {};

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
