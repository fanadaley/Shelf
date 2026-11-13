// GET /api/status  (Bearer license)  -> entitlement
import { json, licenseFrom, entitlement } from "../lib/shelf.mjs";

export default async (req) => {
  const lic = licenseFrom(req);
  if (!lic) return json({ error: "That license key isn't valid." }, 401);
  try {
    return json({ email: lic.email || "", ...(await entitlement(lic.cid)) });
  } catch (e) {
    return json({ error: e.message || "Status check failed." }, 500);
  }
};
export const config = { path: "/api/status" };
