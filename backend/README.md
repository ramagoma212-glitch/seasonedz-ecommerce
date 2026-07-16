# Seasonedz Group — Backend (Version 5)

This is the backend API for the Seasonedz Group e-commerce website. It
runs as a separate project alongside the existing frontend (see the
root `README.md` for the frontend), with its own `package.json`, its
own dependencies, and its own dev server.

**Current status: live and deployed.** A real PostgreSQL database
(hosted on Supabase) holds a starter catalogue (6 categories, 10
products), with `/api/products`, `/api/categories`, `/api/orders` and
`/api/enquiries` on top of it (Milestones 12-15), hardened with rate
limiting, multi-origin CORS and stricter startup validation (Milestone
14). As of Milestone 16, the frontend calls this API — see
`../VERSION_2_INTEGRATION_NOTES.md`. As of Milestone 17/18, this
backend is deployed and live on Render at
`https://seasonedz-ecommerce.onrender.com/api`, with the production
frontend build (on GitHub Pages) configured to use it — see
`DEPLOYMENT.md` and `../VERSION_2_LIVE_STABILITY_REVIEW.md`. See the
full API reference in `API_ROUTES.md`. Order creation verifies every
product and price server-side (never trusts a client-supplied price)
and reduces stock inside a database transaction. There is still no
write API for products/categories, no login, and no admin dashboard.
Version 3 (Milestones 19-25) added PayFast payment integration, email
preparation, and delivery rules, all sandbox/local-only, and has since
been merged and deployed (still disabled by default in production) —
see `PAYFAST_SETUP.md`, `EMAIL_SETUP.md`, `DELIVERY_SETUP.md`, and
`../VERSION_3_PAYMENT_READINESS_AUDIT.md`. Version 4 (Milestones 27-32)
proved a real hosted PayFast sandbox round trip end-to-end, added
optional source-verification/server-validation hardening, and added
customer-facing payment retry — see `../VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`,
`../VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`,
`../VERSION_4_PAYMENT_RETRY_POLISH.md`, and
`../VERSION_4_QA_PRODUCTION_READINESS_REVIEW.md`. Version 4 was merged
and deployed live — see `../VERSION_4_LIVE_STABILITY_REVIEW.md`.
Version 5 (Milestones 33-37) is closing the two remaining production
blockers: retry-while-`PENDING` is now fixed
(`../VERSION_5_RETRY_PENDING_RISK_FIX.md`), source verification now has
a safer `off | monitor | enforce` mode
(`../VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`), and a Render
sandbox QA plan exists but hasn't been run yet
(`../VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`) — see
`../VERSION_5_QA_MERGE_READINESS_REVIEW.md` for the current
production-readiness recommendation. `PAYFAST_ENABLED` remains `false`
in every deployed environment.

## Tech Stack

- Node.js + Express
- TypeScript (ES Modules, `NodeNext` module resolution)
- Prisma + PostgreSQL (hosted on Supabase) — schema migrated, seeded
  with starter data; read-only Product/Category API, a guest Order API
  (server-side pricing, stock, and totals), and an Enquiry API built on
  top of it

## Installing Dependencies

From inside the `backend/` folder:

```bash
cd backend
npm install
```

## Running Locally

1. Copy the example environment file and fill in real values (a real
   `DATABASE_URL`/`DIRECT_URL` are required from Milestone 11 onward —
   see "Environment Variables" below):

   ```bash
   cp .env.example .env
   ```

2. Apply the schema and seed starter data (only needed once, or after
   a schema change):

   ```bash
   npx prisma migrate dev
   npm run seed
   ```

3. Start the dev server (auto-restarts on file changes):

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:5000` by default.

### Other Scripts

```bash
npm run build   # Compile TypeScript to dist/
npm run start   # Run the compiled build (node dist/server.js)
npm run lint    # Type-check without emitting (tsc --noEmit)
npm run seed    # Re-run prisma/seed.ts (safe to re-run — upserts by slug)
```

`lint` is a type-check rather than a full ESLint setup for now — kept
deliberately minimal for this foundational milestone. A proper ESLint
config can be added later without changing this script's name.

## Environment Variables

Defined in `.env.example` (copy to `.env` for local use, then fill in
real values):

> **`.env` is git-ignored and must never be committed.** Real database
> credentials and any other secret belong only in your local `.env` —
> never in `.env.example` or any other tracked file. Double-check
> `git status` before committing if you've ever hand-edited `.env`.

| Variable | Purpose | Required? |
|---|---|---|
| `NODE_ENV` | `development` or `production` | Defaults to `development` if unset |
| `PORT` | Port the API listens on | Defaults to `5000` if unset |
| `DATABASE_URL` | PostgreSQL connection string used by the app at runtime (Supabase's pooled/pgbouncer connection) | **Required — no default.** Backend fails to start without it |
| `DIRECT_URL` | Direct (non-pooled) PostgreSQL connection, used only by Prisma Migrate (Supabase's pooler doesn't support migration DDL) | **Required — no default.** Backend fails to start without it |
| `FRONTEND_URL` | Primary allowed CORS origin | **Required.** Defaults to `http://localhost:5173` outside production; in production it must be set explicitly — no localhost fallback |
| `FRONTEND_PRODUCTION_URL` | Optional second allowed CORS origin (e.g. deployed GitHub Pages URL) | Optional — omit if there's only one frontend origin |
| `PAYFAST_ENABLED` | Feature flag — real PayFast checkout stays blocked until `true` | Defaults to `false`. See "PayFast Sandbox Setup" below |
| `PAYFAST_MODE` | `sandbox` or `production` | Defaults to `sandbox` |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` | PayFast merchant credentials | **Required only if `PAYFAST_ENABLED=true`** |
| `PAYFAST_PASSPHRASE` | Optional PayFast account passphrase | Optional, even when PayFast is enabled |
| `BACKEND_PUBLIC_URL` | This backend's own public URL, used to build the notify URL | **Required only if `PAYFAST_ENABLED=true`** |
| `PAYFAST_RETURN_URL` / `PAYFAST_CANCEL_URL` / `PAYFAST_NOTIFY_URL` | Where PayFast redirects/notifies after a payment attempt | **Required only if `PAYFAST_ENABLED=true`** |
| `EMAIL_ENABLED` | Feature flag — real email sending stays off until `true` | Defaults to `false`. See "Email Setup" below |
| `EMAIL_PROVIDER` | `console` (log-only) or a future real provider name | Defaults to `console` |
| `EMAIL_FROM_NAME` | Display name emails would be sent from | Defaults to `Seasonedz Group` |
| `EMAIL_FROM_ADDRESS` | Sender address | **Required only if `EMAIL_ENABLED=true`** |
| `ADMIN_NOTIFICATION_EMAIL` | Where admin notification emails would go | **Required only if `EMAIL_ENABLED=true`** |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` / `SMTP_*` | Future provider credentials | Not required by anything yet — no provider is integrated |

All environment variables are read in one place: `src/config/env.ts`,
which validates them **at startup** — if `DATABASE_URL`, `DIRECT_URL`
or `FRONTEND_URL` is missing, the backend throws immediately with a
clear message naming the missing variable (never its value) instead of
starting in a broken or insecure state. `.env.example` intentionally
ships with both database URLs (and `FRONTEND_PRODUCTION_URL`) empty —
real Supabase credentials belong only in the git-ignored `.env`, never
in a tracked template file. The PayFast variables follow the same
naming-not-value pattern, but are only *required* to be present when
`PAYFAST_ENABLED=true` — see below.

### Configuring allowed frontend origins (CORS)

The backend only accepts cross-origin requests from origins you list
explicitly — never a wildcard:

- Local development: `FRONTEND_URL=http://localhost:5173` (the Vite
  dev server default — already set in `.env.example`).
- Production/deployed: set `FRONTEND_URL` to your real deployed
  frontend origin. If you need to allow **both** a local dev frontend
  and a deployed one to call the same backend at once (e.g. while
  testing against the live database), also set
  `FRONTEND_PRODUCTION_URL` to the second origin, for example:

  ```
  FRONTEND_URL=http://localhost:5173
  FRONTEND_PRODUCTION_URL=https://ramagoma212-glitch.github.io
  ```

Full CORS behaviour (including how non-matching origins are handled)
is documented in `API_ROUTES.md`'s "CORS" section.

## PayFast Sandbox Setup (Version 3, Milestone 20)

Configuration only — no PayFast code runs yet. Full detail (including
why each rule exists) is in [`PAYFAST_SETUP.md`](./PAYFAST_SETUP.md);
short version:

- `POST /api/orders` rejects `paymentMethod: PAYFAST` with a clean
  `400` ("PayFast payments are not available yet...") unless
  `PAYFAST_ENABLED=true` — this stays `false` until real payment
  initiation and ITN verification are built and tested in sandbox.
- All PayFast credentials (`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
  `PAYFAST_PASSPHRASE`) live only in the backend's environment
  variables — never in frontend code, never committed to Git.
- `src/config/payfast.ts` exposes this config to backend code only; it
  picks PayFast's sandbox or production process URL based on
  `PAYFAST_MODE`.
- No real PayFast account is needed to run this backend locally today
  — leave `PAYFAST_ENABLED=false` (the `.env.example` default) and
  everything else works exactly as before.

## Email Setup (Version 3, Milestone 24)

Preparation only — no real email is sent yet, and no order/payment/
enquiry flow calls the email service automatically. Full detail
(including exactly where those calls will go later) is in
[`EMAIL_SETUP.md`](./EMAIL_SETUP.md); short version:

- `src/services/email/` has a working, testable email layer:
  `email.types.ts` (input shapes), `emailTemplates.ts` (five plain-text
  templates), `email.service.ts` (`sendOrderCreatedEmail`,
  `sendPaymentConfirmedEmail`, `sendPaymentFailedEmail`,
  `sendAdminNewOrderEmail`, `sendAdminNewEnquiryEmail`).
- With `EMAIL_ENABLED=false` (the `.env.example` default), every one of
  those functions is a safe no-op.
- With `EMAIL_PROVIDER=console` (the default), a "send" only logs
  template name + a masked recipient + an order number/enquiry
  reference — never the rendered body, a full email address, or any
  personal detail.
- No real email provider is integrated yet — `EMAIL_PROVIDER` values
  other than `console` just log a "not implemented" warning.

## Delivery Setup (Version 3, Milestone 25)

Full detail in [`DELIVERY_SETUP.md`](./DELIVERY_SETUP.md); short
version:

- Delivery fee rule (unchanged): **R80** flat rate, **free from R700**.
  Single source of truth is now `src/config/delivery.ts`
  (`STANDARD_DELIVERY_FEE`, `FREE_DELIVERY_THRESHOLD`) — `utils/money.ts`
  and `services/delivery.service.ts` both read from it instead of
  hardcoding the numbers.
- `src/services/delivery.service.ts` (new) — `calculateDeliveryFee`,
  `getDeliverySummary`, `getManualCourierStatus`. No courier provider
  is contacted by anything here.
- Courier fulfilment is entirely manual — no courier API, credentials,
  or integration exist anywhere in this codebase. `COURIER_INTEGRATION_ENABLED`
  is hardcoded `false` in `config/delivery.ts`.

## Available Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Returns a simple JSON status check |
| GET | `/api/products` | List products — supports `search`, `category`, `minPrice`, `maxPrice`, `ageRange`, `stock`, `tag`, `sort` |
| GET | `/api/products/featured` | Featured products |
| GET | `/api/products/best-sellers` | Best-selling products |
| GET | `/api/products/new-arrivals` | Newest-arrival products |
| GET | `/api/products/:slug` | A single product by slug |
| GET | `/api/categories` | List categories, each with a product count |
| GET | `/api/categories/:slug/products` | A category plus its products |
| POST | `/api/orders` | Create a guest order (server-verified pricing/stock) |
| GET | `/api/orders/:orderNumber` | Look up an order by its order number |
| GET | `/api/orders/:orderNumber/tracking` | A lighter-weight tracking view of an order |
| POST | `/api/enquiries` | Submit an enquiry (Contact/Schools/Wholesale/Distributor) |
| GET | `/api/enquiries/:id/status` | A safe, limited status lookup — no personal details |

**Full reference — query parameters, sort values, stock-filter
semantics, exact output shapes, and example responses — is in
[`API_ROUTES.md`](./API_ROUTES.md).** Product/category routes are
read-only (no create/update/delete yet); order and enquiry routes are
guest-only (no login, no admin list-all route for either). Every route
here is public (no authentication yet). The enquiry status lookup is
deliberately narrow — see "Enquiry Routes" in `API_ROUTES.md` for
exactly what it does and doesn't return.

Example response (`GET /api/health`):

```json
{
  "success": true,
  "message": "Seasonedz API is running",
  "data": {
    "service": "seasonedz-backend",
    "version": "0.1.0",
    "environment": "development",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

Every response (success or error) follows the same envelope shape —
see `src/utils/apiResponse.ts`:

- Success: `{ success: true, message, data }`
- Error: `{ success: false, message, errors }`

Validation failures (order body, product query filters) all use the
same `errors: [{ field, message }]` array — see "Validation error
format" in `API_ROUTES.md`.

Any route that doesn't exist returns a clean JSON 404 in the same
error shape (via `src/middleware/notFound.middleware.ts`), and any
unhandled error returns a clean JSON 500 (via
`src/middleware/error.middleware.ts`) — never Express's default HTML
error pages. A malformed JSON request body is caught specifically and
returns a `400` instead of a `500`.

## Security & Rate Limiting

Hardened in Milestone 14 — full detail in `API_ROUTES.md`'s "Security
& Rate Limiting" and "CORS" sections. Summary:

- **Helmet** on every response (standard security headers).
- **CORS** allows only explicitly configured origins (`FRONTEND_URL` +
  optional `FRONTEND_PRODUCTION_URL`) — never a wildcard, in any
  environment. See "Configuring allowed frontend origins" above.
- **Request body size** capped at `1mb`.
- **Rate limiting** (`express-rate-limit`, in-memory): 100 requests /
  15 minutes / IP across all of `/api`; an additional, stricter 10
  requests / 15 minutes / IP each on `POST /api/orders` and
  `POST /api/enquiries` specifically (separate counters — one doesn't
  affect the other). Exceeding any of these returns a clean `429` JSON
  response.
- **Environment variables validated at startup** (see "Environment
  Variables" above) — the backend refuses to start in a misconfigured
  state rather than failing confusingly later.
- **No secrets in responses or logs** — error logging (development
  only) never prints `env`/`process.env` values, and no route response
  includes `costPrice` or any other internal-only field.

## Folder Structure

```
backend/
  src/
    app.ts                    Express app configuration (middleware + routes)
    server.ts                  Starts the HTTP server
    config/
      env.ts                    Reads and validates environment variables
      payfast.ts                 PayFast config (sandbox-proven end-to-end as of Milestone 30 — still disabled by default)
      delivery.ts                 Delivery fee rule + courier flags (Milestone 25 — no courier API)
      prisma.ts                  Shared PrismaClient instance
    routes/
      index.ts                  Mounts every route group under /api
      health.routes.ts           GET /api/health
      product.routes.ts          /api/products routes
      category.routes.ts         /api/categories routes
      order.routes.ts             /api/orders routes
      enquiry.routes.ts            /api/enquiries routes
    controllers/
      health.controller.ts       Health check handler
      product.controller.ts      Product route handlers (query parsing, responses)
      category.controller.ts     Category route handlers
      order.controller.ts         Order route handlers (validation, responses)
      enquiry.controller.ts        Enquiry route handlers (validation, responses)
    services/
      product.service.ts         Product Prisma queries + output shaping
      category.service.ts        Category Prisma queries + output shaping
      order.service.ts            Product verification, order transaction, tracking
      enquiry.service.ts           Enquiry creation + narrow public status lookup
      delivery.service.ts           Delivery fee summary + manual courier status (Milestone 25 — no courier API)
      email/                       Email service (Milestone 24 — preparation only, nothing sends yet)
        email.types.ts               Input shapes for templates (OrderEmailData, EnquiryEmailData)
        emailTemplates.ts             Plain-text template rendering
        email.service.ts              sendOrderCreatedEmail/sendPaymentConfirmedEmail/etc. — no-op unless EMAIL_ENABLED=true
    validators/
      shared.ts                   Validation primitives shared by every validator below
      order.validator.ts          POST /api/orders request-shape validation
      enquiry.validator.ts         POST /api/enquiries request-shape + type-specific validation
    middleware/
      notFound.middleware.ts     Clean JSON 404 for unmatched routes
      error.middleware.ts         Clean JSON error handler (incl. malformed JSON -> 400)
      rateLimit.middleware.ts     express-rate-limit configs (general, order, enquiry)
    utils/
      apiResponse.ts             Consistent success/error response helpers
      query.ts                    Safe query-string parsing helpers
      money.ts                    Delivery fee calculation (Decimal-safe, reads config/delivery.ts)
      orderNumber.ts               Unique SG-YYYY-XXXX order number generator
  prisma/
    schema.prisma               Full data model (see DATABASE_SCHEMA_PLAN.md)
    seed.ts                      Starter categories/products (npm run seed)
    migrations/                  Generated SQL migration history
  API_ROUTES.md                 Full API reference (routes, security, errors)
  PAYFAST_SETUP.md               PayFast sandbox setup + verification detail (updated through Milestone 31)
  EMAIL_SETUP.md                  Email service + templates plan (Milestone 24 — preparation only)
  DELIVERY_SETUP.md                Delivery rules + manual courier workflow (Milestone 25 — no courier API)
  MANUAL_TEST_CHECKLIST.md      Manual regression checklist for all routes
  DEPLOYMENT.md                  Render deployment plan (preparation only — not deployed yet)
  DEPLOYMENT_CHECKLIST.md         Safety checklist for before/after a real deploy
  .env.example
  package.json
  tsconfig.json
```

## Deployment

**Deployed and live** on Render at
`https://seasonedz-ecommerce.onrender.com/api` — see
`../VERSION_2_LIVE_STABILITY_REVIEW.md` for the post-deployment
verification. `DEPLOYMENT.md` has the full deployment plan (Render
settings, environment variables, CORS, Prisma migration notes, and how
the frontend's `VITE_API_BASE_URL` was updated and redeployed), and
`DEPLOYMENT_CHECKLIST.md` has the safety checklist that was worked
through before and after. An optional `render.yaml` at the repo root
pre-fills Render's settings. **Real environment secrets are never
committed to Git** — they're only ever entered directly in the hosting
provider's dashboard. Version 3's PayFast/email code (Milestones 19-25)
**is** part of this live deployment, but stays inactive there —
`PAYFAST_ENABLED`/`EMAIL_ENABLED` stay `false` in any real environment
until they're ready (Version 4 proved the PayFast flow works
end-to-end in sandbox; Version 5, Milestones 33-37, closed the retry
and source-verification-strategy blockers but hasn't changed this);
see `PAYFAST_SETUP.md`/`EMAIL_SETUP.md`.

## What's Coming Later

Future backend milestones will add, roughly in this order:

1. ~~**Database schema** — real Prisma models (Product, Category,
   Order, Customer, etc.) and a real PostgreSQL connection.~~ Done —
   see `DATABASE_SCHEMA_PLAN.md`.
2. ~~**Product & category APIs** — read endpoints the frontend can
   eventually switch to instead of its static data files.~~ Done — see
   `API_ROUTES.md`.
3. ~~**Order APIs** — real order creation/lookup, replacing the
   frontend's Local Storage demo orders.~~ Done — see `API_ROUTES.md`.
   Guest checkout only; no admin order list or authenticated order
   history yet.
4. ~~**API hardening** — rate limiting, multi-origin CORS, stricter
   startup environment validation, consistent validation-error
   responses.~~ Done — see `API_ROUTES.md`.
5. ~~**Enquiry API** — a real endpoint backing the frontend's four demo
   forms (Contact, Schools, Wholesale, Distributor).~~ Done — see
   `API_ROUTES.md`.
6. ~~**Connecting the frontend** — swapping the frontend's static
   data/Local Storage/demo form messages for real API calls.~~ Done —
   see `../VERSION_2_INTEGRATION_NOTES.md`. Cart/wishlist remain Local
   Storage by design.
7. ~~**Backend deployment preparation** — production-ready scripts,
   environment validation, CORS, and a documented Render deployment
   plan.~~ Done — see "Deployment" above. **Not actually deployed
   yet.**
8. Actually deploying the backend, then updating the frontend's
   `VITE_API_BASE_URL` and redeploying it to GitHub Pages.
9. **Payment integration** (PayFast), **courier integration**, and
   **authentication** (login/registration), each as their own
   milestone.
10. **Admin dashboard** for managing products, categories, orders and
    enquiries.

This README will be updated as each piece lands.
