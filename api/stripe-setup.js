import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Creates all Stripe products and prices, returns price IDs to save in system_settings
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { plans } = req.body ?? {};
  if (!plans) return res.status(400).json({ error: "plans object required" });

  try {
    const priceIds = {};

    for (const [key, cfg] of Object.entries(plans)) {
      if (!cfg.amount || cfg.amount <= 0) continue;

      // Find or create product
      const existingProducts = await stripe.products.list({ limit: 100 });
      let product = existingProducts.data.find(p => p.metadata?.planKey === key);

      if (!product) {
        product = await stripe.products.create({
          name: cfg.label,
          metadata: { planKey: key },
        });
      }

      // Find existing active recurring price for this product/amount
      const existingPrices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
      let price = existingPrices.data.find(
        p => p.unit_amount === cfg.amount * 100 && p.recurring?.interval === "month"
      );

      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: cfg.amount * 100,
          currency: cfg.currency ?? "usd",
          recurring: { interval: "month" },
        });
      }

      priceIds[key] = price.id;
    }

    return res.status(200).json({ priceIds });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
