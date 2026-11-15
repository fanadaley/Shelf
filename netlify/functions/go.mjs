// GET /go/:id/:pid  Opens a product link from a friend's shared shelf, adds the affiliate tag, and counts the click.
import { sharesStore, clicksStore, tagUrl, monthKey } from "../lib/shelf.mjs";

export default async (req, context) => {
  const { id, pid } = context.params || {};
  const back = new URL("/s/" + encodeURIComponent(id || ""), req.url).href;
  const rec = id ? await sharesStore().get(id, { type: "json" }) : null;
  const p = rec && rec.snap.products.find((x) => x.id === decodeURIComponent(pid || ""));
  const url = p && tagUrl(p.url);
  if (!url) return Response.redirect(back, 302);
  try {
    const k = id + "/" + monthKey();
    const n = Number((await clicksStore().get(k)) || 0);
    await clicksStore().set(k, String(n + 1));
  } catch {}
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
};
export const config = { path: "/go/:id/:pid" };
