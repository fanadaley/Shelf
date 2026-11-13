// POST /api/portal  (Bearer license)  -> { url }  Stripe billing portal: cancel, change plan, update card.
import { json, stripe, siteUrl, licenseFrom } from "../lib/shelf.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const lic = licenseFrom(req);
  if (!lic) return json({ error: "That license key isn't valid." }, 401);
  try {
    const p = await stripe().billingPortal.sessions.create({ customer: lic.cid, return_url: siteUrl(req) + "/" });
    return json({ url: p.url });
  } catch (e) {
    return json({ error: e.message || "Billing portal could not open." }, 500);
  }
};
export const config = { path: "/api/portal" };
