// Online payments (Settings → Pricing → Payments). When payments are off, or the chosen gateway is
// not set up for a plan, every "Upgrade" button sends a plan request instead (plan_requests table)
// that an administrator approves on the Approvals page.
//
// system_settings.payment_gateway = { enabled: boolean, provider: 'stripe' | … }

// The most used payment gateways for SaaS subscriptions. Only Stripe is integrated today (checkout,
// webhook, products); the others are listed so the choice is visible, and can be added later.
export const PAYMENT_PROVIDERS = [
  { id: "stripe",       name: "Stripe",        integrated: true,  note: "Cards, wallets and subscriptions worldwide" },
  { id: "paypal",       name: "PayPal",        integrated: false, note: "PayPal balance and cards, very common in LATAM" },
  { id: "mercadopago",  name: "Mercado Pago",  integrated: false, note: "Local payment methods in Latin America" },
  { id: "paddle",       name: "Paddle",        integrated: false, note: "Merchant of record: handles taxes and invoices" },
  { id: "lemonsqueezy", name: "Lemon Squeezy", integrated: false, note: "Merchant of record for software subscriptions" },
  { id: "braintree",    name: "Braintree",     integrated: false, note: "PayPal's card and wallet gateway" },
  { id: "adyen",        name: "Adyen",         integrated: false, note: "Enterprise gateway, many local methods" },
  { id: "razorpay",     name: "Razorpay",      integrated: false, note: "India and Southeast Asia" },
];

export function paymentGateway(settings) {
  const v = settings?.payment_gateway ?? {};
  return { enabled: v.enabled === true, provider: v.provider || "stripe" };
}

/** True when an upgrade to this plan can be paid online right now (otherwise: send a request). */
export function canPayOnline(settings, priceKey) {
  const g = paymentGateway(settings);
  if (!g.enabled) return false;
  const p = PAYMENT_PROVIDERS.find(x => x.id === g.provider);
  if (!p?.integrated) return false;
  if (g.provider === "stripe") return !!(settings?.stripe_price_ids ?? {})[priceKey];
  return false;
}
