// Shared shelves. A shelf is shared as an unlisted link: /s/<id>.
// POST   /api/share            { snapshot, id?, key? } -> { id, key }   create, or update with the owner key
// GET    /api/share/:id        -> { snapshot, updated }
// DELETE /api/share/:id        (x-share-key header) -> { deleted: true }
import { json, sharesStore, sha256, randomId, normUrl } from "../lib/shelf.mjs";

const MAX_BODY = 5_000_000;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const s = (v, n) => String(v == null ? "" : v).slice(0, n);
const img = (v) => (typeof v === "string" && v.length <= 160_000 && IMG_RE.test(v) ? v : "");
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");

function clean(snap) {
  if (!snap || typeof snap !== "object") return null;
  const products = (Array.isArray(snap.products) ? snap.products : []).slice(0, 400).map((p) => ({
    id: s(p.id, 40),
    name: s(p.name, 120),
    brand: s(p.brand, 80),
    category: s(p.category, 40),
    subtype: s(p.subtype, 40),
    size: s(p.size, 40),
    rating: Math.max(0, Math.min(5, parseInt(p.rating, 10) || 0)),
    status: ["star", "active", "retired"].includes(p.status) ? p.status : "active",
    review: s(p.review, 1200),
    actives: s(p.actives, 300),
    url: normUrl(s(p.url, 600)),
    shape: ["dropper","pump","jar","tube","tall","spray","tub","lip"].includes(p.shape) ? p.shape : "",
    color: /^#[0-9a-fA-F]{6}$/.test(p.color || "") ? p.color : "",
    img: img(p.img),
    pics: (Array.isArray(p.pics) ? p.pics : []).slice(0, 3).map(img).filter(Boolean),
    since: date(p.since),
  })).filter((p) => p.id && p.name);
  const ids = new Set(products.map((p) => p.id));
  const r = snap.routine || {};
  const steps = (a) => (Array.isArray(a) ? a : []).map((x) => s(x, 40)).filter((x) => ids.has(x)).slice(0, 20);
  return {
    v: 1,
    profile: { name: s(snap.profile && snap.profile.name, 40) || "A friend", bio: s(snap.profile && snap.profile.bio, 200) },
    products,
    routine: { am: steps(r.am), pm: steps(r.pm), note: s(r.note, 600) },
    categories: (Array.isArray(snap.categories) ? snap.categories : []).slice(0, 30).map((c) => ({
      name: s(c.name, 40), color: /^#[0-9a-fA-F]{6}$/.test(c.color || "") ? c.color : "#56646C", icon: s(c.icon, 20),
    })),
  };
}

export default async (req, context) => {
  const store = sharesStore();
  const id = context.params && context.params.id;

  if (req.method === "GET") {
    if (!id) return json({ error: "Missing shelf id." }, 400);
    const rec = await store.get(id, { type: "json" });
    if (!rec) return json({ error: "This shelf isn't shared anymore." }, 404);
    return json({ snapshot: rec.snap, updated: rec.updated });
  }

  if (req.method === "DELETE") {
    if (!id) return json({ error: "Missing shelf id." }, 400);
    const rec = await store.get(id, { type: "json" });
    if (rec && rec.keyHash !== sha256(req.headers.get("x-share-key") || "")) return json({ error: "Not your shelf." }, 403);
    await store.delete(id);
    return json({ deleted: true });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Your shelf is too large to share. Remove a few photos and try again." }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  const snap = clean(body.snapshot);
  if (!snap) return json({ error: "Nothing to share." }, 400);

  let shareId = body.id, key = body.key;
  if (shareId) {
    const rec = await store.get(shareId, { type: "json" });
    if (!rec || rec.keyHash !== sha256(key || "")) shareId = null; // unknown or not theirs: issue a fresh link
  }
  if (!shareId) { shareId = randomId(10); key = randomId(32); }
  const now = Date.now();
  const prev = await store.get(shareId, { type: "json" });
  await store.setJSON(shareId, { keyHash: sha256(key), snap, created: prev ? prev.created : now, updated: now });
  return json({ id: shareId, key, updated: now });
};
export const config = { path: ["/api/share", "/api/share/:id"] };
