# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project actually is

A production e-commerce site for Seasonedz Group (colouring books, markers, crayons — South Africa), live at `https://www.seasonedzgroup.co.za`. The frontend is a plain JS SPA (no framework) deployed to GitHub Pages; the backend (`backend/`) is an Express + TypeScript + Prisma API deployed on Render at `https://api.seasonedzgroup.co.za`, backed by a real Supabase PostgreSQL database.

**`README.md` is badly stale** — it describes "Version 1–5" and says things like "no admin dashboard," "no customer accounts," "PayFast disabled." None of that reflects reality: PayFast is live, there's a full admin system, customer accounts, coupons, B2B CRM/outreach, affiliate/referral programmes, digital downloads, and SEO/structured-data work, all well past 200 numbered milestones (commit history calls them "Milestone N", not "Version N"). Trust `git log` and the actual code over `README.md`'s own status claims. The backend's 65 Prisma models, 138 services and 70 controllers are a better indicator of real scope than anything either README describes.

## The one rule that overrides every other instinct here

**The local `backend/.env` points at the live production Supabase database.** There is no separate local/dev database. Any script run locally that touches data is touching the real store the live site reads from. Consequences:

- Never write a one-off script that deletes/mutates rows without a before/after read-only count diff.
- Backend tests require an explicit opt-in because of this: `npm test` only runs with `TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION=true` set (see `backend/package.json`) — this is not boilerplate, it's a guardrail.
- A throwaway investigation script belongs in `backend/` itself (so it can resolve `node_modules`/Prisma), run via `npx tsx`, and gets deleted immediately after use — never committed.
- Schema changes are additive-only: review with `prisma migrate diff` before applying, apply with `prisma migrate deploy`, never `db push` against this database.
- A local script's "send email" path reads the **local** `backend/.env` email config, which is usually a no-op — it does not prove the deployed app would actually send anything. To prove a real send, exercise it through the deployed app.

## Commands

Frontend (repo root):
```bash
npm run dev                      # Vite dev server
npm run build                    # production build to dist/
npm run preview                  # preview the production build
npm run test:smoke                # Playwright smoke suite, project=local (starts its own local server)
npm run test:smoke:live           # same suite against the live production site
npm run test:feed                 # node:test over scripts/*.test.mjs (static route/sitemap/merchant-feed generator)
node scripts/generate-static-routes.mjs   # regenerate per-route <head>/sitemap.xml/robots.txt/merchant feed into dist/ (needs a prior `npm run build`)
```
Single Playwright file/test: `npx playwright test tests/smoke/seo.spec.js --project=local` (add `-g "test name"` to filter to one test). Always check for and kill orphaned `node.exe` Playwright processes before trusting a run (`Get-CimInstance Win32_Process -Filter "name='node.exe'"` and filter for `playwright` in the command line on Windows).

Backend (`backend/`):
```bash
npm run dev                       # tsx watch src/server.ts
npm run build                     # prisma generate && tsc
npm run lint                      # tsc --noEmit
npm test                          # TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION=true tsx --test src/**/*.test.ts — against the real DB, see above
```
Single backend test file: `cross-env TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION=true tsx --test src/services/coupon.service.test.ts`. Tests sit next to the code they test (`*.test.ts`), using Node's built-in test runner, not a separate framework.

## Deployment

Two independent pipelines, both triggered by a push to `main`, with no shared "deploy" step:
- **Frontend**: `.github/workflows/deploy.yml` builds, runs the smoke suite, runs `generate-static-routes.mjs`, and deploys to GitHub Pages.
- **Backend**: Render auto-deploys from `rootDir: backend` (see `render.yaml` / `backend/DEPLOYMENT.md`); its build command explicitly needs `--include=dev` since `NODE_ENV=production` would otherwise skip the TypeScript devDependencies the build needs to compile.

A CI failure that looks unrelated to the actual diff (SEO metadata step, Playwright webServer timeout) is often the build's live-API fetch in `generate-static-routes.mjs` hitting a transient issue, not a real regression — `gh run rerun <id> --failed` first before assuming the code is wrong.

## Architecture that spans multiple files

**Frontend routing/rendering.** `src/js/router.js` is a hash-based router; each route in `src/pages/` exports a `render(params)` returning an HTML string, re-rendered on every navigation (nothing is mounted once and left alone — event handling in `app.js` is delegated for exactly this reason). The site is 100% client-rendered for body content; `scripts/generate-static-routes.mjs` only rewrites each route's pre-JS `<head>` (title/description/canonical/OG/JSON-LD) at build time so crawlers and link previews see real per-route metadata without waiting on JS — this script's own output must stay in sync with what `src/js/seo.js` sets at runtime, which is why several builder functions in it are deliberately said to "mirror" a client-side equivalent field-for-field.

**The slug-vs-id trap.** `src/js/api/mappers.js`'s `mapApiProductToFrontendShape()` sets `id: apiProduct.slug` — a carry-over from the pre-backend static-data era. Every cart/wishlist line's `productId` is therefore actually a slug, not a real database id. Order creation and the wishlist service were built around this correctly from the start (they resolve by slug); the one place that got this wrong (the coupon preview endpoint expecting a real id) silently broke every real coupon application for weeks before being found and fixed. When wiring any new endpoint that receives a "product id" from the frontend, assume it's a slug unless proven otherwise.

**Pricing/stock authority is always the backend.** The cart/wishlist in Local Storage, and anything the frontend sends, is never trusted. `backend/src/services/order.service.ts`'s `createOrder()` re-looks-up every item by slug and re-prices/re-validates stock from the database before an order is created — a price or id the frontend sends is informational only.

**Coupons: resolve-once, reuse everywhere.** `backend/src/services/coupon.service.ts` has one shared `resolve()` function behind both `previewCoupon()` (non-binding, used by the live "Apply Coupon" UI) and `resolveCouponForOrder()` (binding, called inside `order.service.ts`'s transaction). This guarantees preview and real checkout can never structurally disagree about whether a coupon applies — but it only protects logic downstream of already-correct inputs; a bad translation from HTTP request to `CouponEligibleLine[]` upstream of `resolve()` can still break every coupon invisibly (see the slug-vs-id trap above). Coupon redemption happens inside the same DB transaction as order creation, so any order that commits consumes a one-time-use coupon's use, regardless of whether payment later completes.

**Payment confirmation only ever comes from one place.** `backend/src/services/payfast.service.ts`'s ITN (webhook) handler is the only code path allowed to mark an order `PAID`/`CONFIRMED` for a real-priced order — never the frontend, never a redirect callback. A zero-total order (e.g. a 100%-off coupon) is the one exception, and even that is decided purely from the server's own computed total inside `order.service.ts`, never from anything the client claims.

**Email.** One dispatch path (`email.service.ts`) wraps the single Brevo provider call so a provider failure never breaks an order/enquiry/payment request handler. Every email type (orders, enquiries, B2B outreach) shares one hardcoded `EMAIL_REPLY_TO` address — there is no per-call-site override. Templates are plain-text only by design (no HTML emails yet).

**Admin vs. customer auth are separate systems** — different session/cookie handling, different login flows (admin has 2-step password+OTP), under `backend/src/routes/` split accordingly. Don't assume a pattern from one applies to the other.

**Supabase RLS.** Tables are RLS-enabled with anon/authenticated grants revoked (Milestone 154) — the backend's own service-role Prisma connection bypasses RLS by design (that's the whole point), but any new direct Supabase client usage (e.g. storage) must account for RLS being actually enforced now, not assume open access.
