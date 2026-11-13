// POST /api/scan  (Bearer license)  { images:[{data,mediaType}], categories:[{name,subtypes}] }
// Shelf's own AI relay. Pro-only, metered per customer per month. The Anthropic key never leaves the server.
import { json, licenseFrom, getSub, PRO_STATUSES, scanLimit, scansUsed, usageStore, monthKey } from "../lib/shelf.mjs";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGES = 4;
const MAX_B64 = 2_800_000; // about 2 MB per image after base64

const SYSTEM = `You read photos of personal care products: skincare, hair, body, makeup, fragrance, nails, and supplements.
Identify every distinct product you can clearly see. Read names and brands from the packaging; do not guess brands you cannot read.
Respond with JSON only, no prose and no code fences.`;

function instructions(categories) {
  const cats = (categories || []).slice(0, 20).map((c) =>
    `- ${String(c.name).slice(0, 40)}${c.subtypes && c.subtypes.length ? ": " + c.subtypes.slice(0, 20).map((s) => String(s).slice(0, 30)).join(", ") : ""}`
  ).join("\n");
  return `Categories and sub-types to choose from:
${cats || "- Skincare\n- Hair\n- Body\n- Makeup\n- Other"}

Return: {"products":[{"name":"","brand":"","category":"","subtype":"","size":"","actives":"","lifeAmount":0,"lifeUnit":"months","website":"","notes":""}]}
Rules:
- name: product name as printed, without the brand.
- category: exactly one of the category names above. subtype: one of that category's sub-types, or "" if none fit.
- size: as printed, e.g. "1 fl oz / 30 ml". Empty if not visible.
- actives: key active or notable ingredients printed on the front, comma separated. Empty if not visible.
- lifeAmount + lifeUnit ("days","weeks","months"): typical time one unit of this size lasts with normal daily use. 0 if you cannot estimate.
- website: brand domain only if printed on the pack.
- notes: under 12 words, only if genuinely useful (e.g. "travel size"). Otherwise "".
- At most 12 products. If no product is readable, return {"products":[]}.`;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const lic = licenseFrom(req);
  if (!lic) return json({ error: "Scanning needs Shelf Pro." }, 401);

  const sub = await getSub(lic.cid);
  if (!sub || !PRO_STATUSES.has(sub.status)) return json({ error: "Scanning needs an active Shelf Pro plan." }, 402);

  const limit = scanLimit(sub);
  const used = await scansUsed(lic.cid);
  if (used >= limit) {
    return json({ error: `You've used all ${limit} scans for this month. They reset on the 1st.`, scansUsed: used, scansLimit: limit }, 429);
  }

  const body = await req.json().catch(() => null);
  const images = body && Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  if (!images.length) return json({ error: "Add a photo first." }, 400);
  for (const im of images) {
    if (!im || !TYPES.has(im.mediaType) || typeof im.data !== "string" || im.data.length > MAX_B64) {
      return json({ error: "One of the photos couldn't be used. Try a JPEG or PNG under 2 MB." }, 400);
    }
  }

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
            { type: "text", text: instructions(body.categories) },
          ],
        }],
      }),
    });
  } catch {
    return json({ error: "The reader is unreachable right now. Try again in a minute." }, 502);
  }
  if (!r.ok) return json({ error: "The reader couldn't process that photo. Try again." }, 502);

  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return json({ error: "The label couldn't be read. Try a closer, well-lit photo." }, 422);
  }
  const products = (Array.isArray(parsed.products) ? parsed.products : []).slice(0, 12);

  // Count the scan only when it succeeded.
  await usageStore().set(monthKey() + "/" + lic.cid, String(used + 1));
  return json({ products, scansUsed: used + 1, scansLimit: limit });
};
export const config = { path: "/api/scan" };
