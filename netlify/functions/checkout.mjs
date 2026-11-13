// POST /api/checkout  { plan: "yearly" | "monthly" }  -> { url }
import { json, stripe, siteUrl, licenseFrom } from "../lib/shelf.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { plan } = await req.json().catch(() => ({}));
  const price = plan === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  if (!price) return json({ error: "Pricing is not configured." }, 500);

  const site = siteUrl(req);
  const lic = licenseFrom(req); // returning customer: reuse their Stripe customer, no second trial
  const params = {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: site + "/?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: site + "/?checkout=cancel",
  };
  if (lic) params.customer = lic.cid;
  else params.subscription_data = { trial_period_days: Number(process.env.TRIAL_DAYS || 7) };

  try {
    const session = await stripe().checkout.sessions.create(params);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message || "Checkout could not start." }, 500);
  }
};
export const config = { path: "/api/checkout" };
