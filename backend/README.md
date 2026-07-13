# Seasonedz Group — Backend (Version 2)

This is the backend API for the Seasonedz Group e-commerce website. It
runs as a separate project alongside the existing frontend (see the
root `README.md` for the frontend), with its own `package.json`, its
own dependencies, and its own dev server.

**Current status: Product/Category API, a guest Order API, and API
hardening.** A real PostgreSQL database (hosted on Supabase) holds a
starter catalogue (6 categories, 10 products). On top of it: read-only
`/api/products` and `/api/categories` routes (Milestone 12), guest
`/api/orders` creation/lookup (Milestone 13), and — as of Milestone 14
— rate limiting, multi-origin CORS, stricter startup environment
validation, and consistent validation-error responses across the whole
API. See the full reference in `API_ROUTES.md`. Order creation
verifies every product and price server-side (never trusts a
client-supplied price) and reduces stock inside a database
transaction. There is still no write API for products/categories, no
login, no admin dashboard, no real payment or courier integration, and
**nothing here is connected to the frontend yet** — it continues to
run entirely on its own static data and Local Storage, including
checkout. See "What's Coming Later" below.

## Tech Stack

- Node.js + Express
- TypeScript (ES Modules, `NodeNext` module resolution)
- Prisma + PostgreSQL (hosted on Supabase) — schema migrated, seeded
  with starter data; read-only Product/Category API and a guest Order
  API (server-side pricing, stock, and totals) built on top of it

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

All environment variables are read in one place: `src/config/env.ts`,
which validates them **at startup** — if `DATABASE_URL`, `DIRECT_URL`
or `FRONTEND_URL` is missing, the backend throws immediately with a
clear message naming the missing variable (never its value) instead of
starting in a broken or insecure state. `.env.example` intentionally
ships with both database URLs (and `FRONTEND_PRODUCTION_URL`) empty —
real Supabase credentials belong only in the git-ignored `.env`, never
in a tracked template file.

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

**Full reference — query parameters, sort values, stock-filter
semantics, exact output shapes, and example responses — is in
[`API_ROUTES.md`](./API_ROUTES.md).** Product/category routes are
read-only (no create/update/delete yet); order routes are guest-only
(no login, no admin order list yet). Every route here is public (no
authentication yet).

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
  requests / 15 minutes / IP on `POST /api/orders` specifically.
  Exceeding either returns a clean `429` JSON response.
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
      prisma.ts                  Shared PrismaClient instance
    routes/
      index.ts                  Mounts every route group under /api
      health.routes.ts           GET /api/health
      product.routes.ts          /api/products routes
      category.routes.ts         /api/categories routes
      order.routes.ts             /api/orders routes
    controllers/
      health.controller.ts       Health check handler
      product.controller.ts      Product route handlers (query parsing, responses)
      category.controller.ts     Category route handlers
      order.controller.ts         Order route handlers (validation, responses)
    services/
      product.service.ts         Product Prisma queries + output shaping
      category.service.ts        Category Prisma queries + output shaping
      order.service.ts            Product verification, order transaction, tracking
    validators/
      order.validator.ts          POST /api/orders request-shape validation
    middleware/
      notFound.middleware.ts     Clean JSON 404 for unmatched routes
      error.middleware.ts         Clean JSON error handler (incl. malformed JSON -> 400)
      rateLimit.middleware.ts     express-rate-limit configs (general + order creation)
    utils/
      apiResponse.ts             Consistent success/error response helpers
      query.ts                    Safe query-string parsing helpers
      money.ts                    Delivery fee calculation (Decimal-safe)
      orderNumber.ts               Unique SG-YYYY-XXXX order number generator
  prisma/
    schema.prisma               Full data model (see DATABASE_SCHEMA_PLAN.md)
    seed.ts                      Starter categories/products (npm run seed)
    migrations/                  Generated SQL migration history
  API_ROUTES.md                 Full API reference (routes, security, errors)
  MANUAL_TEST_CHECKLIST.md      Manual regression checklist for all routes
  .env.example
  package.json
  tsconfig.json
```

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
5. **Connecting the frontend** — swapping the frontend's static
   data/Local Storage for real API calls.
6. **Enquiry API** — a real endpoint backing the frontend's four demo
   forms (Contact, Schools, Wholesale, Distributor).
7. **Payment integration** (PayFast), **courier integration**, and
   **authentication** (login/registration), each as their own
   milestone.
8. **Admin dashboard** for managing products, categories and orders.

This README will be updated as each piece lands.
