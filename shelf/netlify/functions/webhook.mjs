// POST /api/stripe-webhook  Keeps subscription status current (renewals, cancellations, failed payments).
import { json, stripe, saveSub } from "../lib/shelf.mjs";

const EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const s = stripe();
  let event;
  try {
    event = await s.webhooks.constructEventAsync(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json({ error: "Bad signature" }, 400);
  }
  if (EVENTS.has(event.type)) {
    // Re-read from Stripe so out-of-order events can't store stale status.
    const fresh = await s.subscriptions.retrieve(event.data.object.id);
    await saveSub(fresh);
  }
  return json({ received: true });
};
export const config = { path: "/api/stripe-webhook" };
