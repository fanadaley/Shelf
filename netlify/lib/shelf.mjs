// Shared helpers for Shelf's Netlify Functions.
import crypto from "node:crypto";
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function siteUrl(req) {
  return (process.env.URL || new URL(req.url).origin).replace(/\/+$/, "");
}

/* ---------- license tokens (HMAC-signed, no database lookup needed to trust them) ---------- */
function hmac(body) {
  if (!process.env.LICENSE_SECRET) throw new Error("LICENSE_SECRET is not set");
  return crypto.createHmac("sha256", process.env.LICENSE_SECRET).update(body).digest("base64url");
}
export function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(body);
}
export function verifyToken(tok) {
  if (!tok || typeof tok !== "string" || tok.indexOf(".") < 0) return null;
  const [body, sig] = tok.split(".");
  const expected = hmac(body);
  const a = Buffer.from(sig || ""), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
}
export function tokenFrom(req) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}
export function licenseFrom(req) {
  const lic = verifyToken(tokenFrom(req));
  return lic && lic.cid ? lic : null;
}

/* ---------- storage ---------- */
export const subsStore = () => getStore({ name: "shelf-subs", consistency: "strong" });
export const usageStore = () => getStore({ name: "shelf-usage", consistency: "strong" });

export function monthKey() { return new Date().toISOString().slice(0, 7); }

function periodEnd(sub) {
  const top = sub.current_period_end;
  const item = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end;
  const v = top || item;
  return v ? v * 1000 : null;
}

export async function saveSub(sub) {
  const cid = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
  const rec = {
    status: sub.status,
    subId: sub.id,
    trialEnd: sub.trial_end ? sub.trial_end * 1000 : null,
    periodEnd: periodEnd(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    interval: price && price.recurring ? price.recurring.interval : null,
    updated: Date.now(),
  };
  await subsStore().setJSON(cid, rec);
  return rec;
}

// Reads the stored record; falls back to Stripe if the webhook hasn't landed yet.
export async function getSub(cid) {
  const rec = await subsStore().get(cid, { type: "json" });
  if (rec) return rec;
  const list = await stripe().subscriptions.list({ customer: cid, status: "all", limit: 1 });
  if (list.data.length) return saveSub(list.data[0]);
  return null;
}

export function scanLimit(sub) {
  const full = Number(process.env.SCAN_LIMIT || 50);
  const trial = Number(process.env.TRIAL_SCAN_LIMIT || 20);
  return sub && sub.status === "trialing" ? trial : full;
}

export async function scansUsed(cid) {
  const n = await usageStore().get(monthKey() + "/" + cid);
  return Number(n || 0);
}

export async function entitlement(cid) {
  const sub = await getSub(cid);
  const pro = !!sub && PRO_STATUSES.has(sub.status);
  return {
    pro,
    status: sub ? sub.status : "none",
    trialEnd: sub ? sub.trialEnd : null,
    periodEnd: sub ? sub.periodEnd : null,
    cancelAtPeriodEnd: sub ? sub.cancelAtPeriodEnd : false,
    interval: sub ? sub.interval : null,
    scansUsed: await scansUsed(cid),
    scansLimit: scanLimit(sub),
  };
}

/* ---------- sharing + affiliate ---------- */
export const sharesStore = () => getStore({ name: "shelf-shares", consistency: "strong" });
export const clicksStore = () => getStore({ name: "shelf-clicks", consistency: "strong" });

export function normUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
}

// Adds the Amazon Associates tag to Amazon links. Other links pass through untouched for now.
export function tagUrl(u) {
  u = normUrl(u);
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  if (!u || !tag) return u;
  try {
    const x = new URL(u);
    if (/(^|\.)amazon\.[a-z.]+$/i.test(x.hostname)) { x.searchParams.set("tag", tag); return x.href; }
  } catch {}
  return u;
}

export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomId = (n = 10) => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.randomBytes(n);
  return Array.from(b, (x) => abc[x % abc.length]).join("");
};
