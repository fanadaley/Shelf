// GET /api/config  Public settings the app needs. The Amazon tag is public by design: it appears in every affiliate link.
import { json } from "../lib/shelf.mjs";
export default async () => json({ amazonTag: process.env.AMAZON_ASSOCIATE_TAG || "" });
export const config = { path: "/api/config" };
