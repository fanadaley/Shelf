// POST /api/verify  { sessionId }  -> { token, email, ent }
// Called when Stripe Checkout redirects back. Issues the signed license key.
import { json, stripe, saveSub, signToken, entitlement } from "../lib/shelf.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId || !/^cs_/.test(sessionId)) return json({ error: "Missing checkout session." }, 400);
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (s.status !== "complete" || !s.subscription || !s.customer) return json({ error: "Checkout is not complete." }, 402);
    await saveSub(s.subscription);
    const cid = typeof s.customer === "string" ? s.customer : s.customer.id;
    const email = (s.customer_details && s.customer_details.email) || "";
    const token = signToken({ v: 1, cid, email, iat: Date.now() });
    return json({ token, email, ent: await entitlement(cid) });
  } catch (e) {
    return json({ error: e.message || "Could not confirm checkout." }, 500);
  }
};
export const config = { path: "/api/verify" };
