# Shelf: Phase 1 (web app + Stripe paywall on Netlify)

Standalone beauty/skincare tracker extracted from Northstar. No Northstar code paths, data, relays, or keys are included.

## What's in the box

```
shelf/
  public/index.html            The app (single file, local-first, installable PWA)
  public/manifest.webmanifest  PWA manifest + icons
  netlify/functions/
    checkout.mjs   POST /api/checkout        Starts Stripe Checkout (7-day trial for new customers)
    verify.mjs     POST /api/verify          Confirms checkout, issues a signed license key
    status.mjs     GET  /api/status          Returns plan status + scan usage
    portal.mjs     POST /api/portal          Opens Stripe billing portal (cancel, switch plan, card)
    webhook.mjs    POST /api/stripe-webhook  Keeps subscription status current
    scan.mjs       POST /api/scan            Shelf's own AI relay: Pro-only, 50 scans/mo, 20 during trial
  netlify/lib/shelf.mjs        Shared helpers (tokens, Netlify Blobs storage)
  .env.example                 Every environment variable, documented
```

## Free vs Pro (as built)

| | Free | Pro |
|---|---|---|
| Products | 20 | Unlimited |
| Manual add, photo, stock level, rating, reorder flag | Yes | Yes |
| Shelf strip, Running low list (from stock + flags) | Yes | Yes |
| Run-out countdown from purchase date + expected life | Field saved, locked | Yes |
| AI scan (single label or whole shelf) | No | 50/month (20 during trial) |
| Smart sorts (runs out soonest, days left, rating) | No | Yes |
| Retire products (in use / inactive) | No | Yes |
| CSV export, JSON backup | No | Yes |
| CSV import, restore backup | Within the 20 cap | Yes |

Free users can enter "how long one lasts" and the purchase date. The moment they upgrade, every product lights up with a countdown. That's the conversion hook.

## Setup, in order (about 45 minutes)

**1. Anthropic key for Shelf (do this first)**
- console.anthropic.com: create a new Workspace named "Shelf". Create an API key inside it.
- Set a monthly spend limit on the workspace (start at $25). Haiku 4.5 reads a label for well under a cent, so $25 covers thousands of scans.
- This key is separate from Northstar's. Revoking one never touches the other.

**2. Stripe (test mode first)**
- Products: create "Shelf Pro" with two recurring prices: $4.99 monthly and $29.99 yearly. Copy both `price_...` IDs.
- Settings > Billing > Customer portal: turn it on. Allow cancel, allow switching between the two prices, allow card updates.
- Developers > Webhooks: add endpoint `https://YOUR-SITE.netlify.app/api/stripe-webhook`, events `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`. Copy the signing secret.

**3. Netlify**
- New GitHub repo `shelf`, push this folder. Netlify > Add new site > Import from GitHub. Build settings come from `netlify.toml`; no build command needed.
- Site configuration > Environment variables: add everything in `.env.example`. Generate `LICENSE_SECRET` with `openssl rand -hex 32` and never change it (changing it invalidates every customer's license key).
- Deploy.

**4. Test the full loop (test mode)**
- Open the site, tap Try Pro, pay with card `4242 4242 4242 4242`, any future date, any CVC.
- You land back in the app with "Your 7-day Pro trial has started." Scan a product. Open Settings > Manage subscription and cancel; within seconds the webhook flips you back to Free.
- In Stripe, use Test clocks to fast-forward past day 7 and confirm the renewal charge and status.

**5. Go live**
- Swap to live keys, live price IDs, and a live webhook secret in Netlify env vars. Redeploy.
- Create a 100%-off promo code for yourself (checkout accepts promo codes) so your own account runs Pro for free.

## Local development

```
npm install
npm install -g netlify-cli
netlify link
netlify dev
```
Open `http://localhost:8888/?pro=1` to preview Pro screens without paying. That override only works on localhost; scans still go through the real function.

## Moving your own products over from Northstar

On your Mac, open Northstar in Chrome, open DevTools (Cmd+Option+J), and run:

```js
copy(JSON.stringify({app:"shelf",version:1,data:{products:store.beauty.products,categories:store.beauty.categories,settings:{}}}))
```

Paste into a new file named `shelf-backup.json`. In Shelf: Settings > Restore backup. Your products, photos, ratings, purchase dates, and expected-life values carry over. Procedures stay in Northstar.

## Decisions made for you

- **Trial requires a card.** Stripe trial with card on file converts far better than a cardless trial, and it lets the server meter AI scans per paying identity from minute one.
- **One trial per customer.** A returning customer who resubscribes goes straight to paid.
- **No accounts in Phase 1.** Identity is a signed license key issued at checkout. It restores Pro on a second device (Settings shows it; Restore Pro accepts it). Real accounts arrive with sync.
- **Data stays on the device.** Nothing about a customer's shelf touches your servers. Scan photos pass through to Anthropic and are not stored. That's a clean privacy story for launch.
- **Beauty procedures and the Northstar To Buy link were dropped.** Shelf does one job. "Running low" plus "Reordered" replaces To Buy; "Shop" opens the product's store link.

## Known limits (acceptable for validation)

- The 20-product cap is enforced in the browser, so a technical user could bypass it. The costly feature, AI scanning, is enforced on the server and cannot be bypassed.
- Sync is not built. It is listed as a Pro feature in the plan but deliberately not advertised on the paywall until it ships.

## Next

- **Phase 1.5:** Firebase Auth (email link) + Firestore sync behind the same license, which also replaces license keys with sign-in. Add a Privacy Policy and Terms page (Stripe and the App Store both require them).
- **Phase 2:** Capacitor wrap on your Mac, Apple Developer account, StoreKit subscription mirroring these two prices. Keep web checkout as the higher-margin channel.
