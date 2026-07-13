# Seasonedz Group — Backend (Version 2)

This is the backend API for the Seasonedz Group e-commerce website. It
runs as a separate project alongside the existing frontend (see the
root `README.md` for the frontend), with its own `package.json`, its
own dependencies, and its own dev server.

**Current status: Product/Category API plus a guest Order API.** A
real PostgreSQL database (hosted on Supabase) holds a starter
catalogue (6 categories, 10 products). On top of it: read-only
`/api/products` and `/api/categories` routes (Milestone 12), and now
`/api/orders` for guest order creation and lookup (Milestone 13) — see
the full reference in `API_ROUTES.md`. Order creation verifies every
product and price server-side (never trusts a client-supplied price)
and reduces stock inside a database transaction. There is still no
write API for products/categories, no login, no admin dashboard, no
real payment or courier integration, and **nothing here is connected
to the frontend yet** — it continues to run entirely on its own static
data and Local Storage, including checkout. See "What's Coming Later"
below.

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
real values — `.env` is git-ignored and must never be committed):

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Port the API listens on | `5000` |
| `DATABASE_URL` | PostgreSQL connection string used by the app at runtime (Supabase's pooled/pgbouncer connection) | *(empty in `.env.example` — must be a real value in `.env`)* |
| `DIRECT_URL` | Direct (non-pooled) PostgreSQL connection, used only by Prisma Migrate (Supabase's pooler doesn't support migration DDL) | *(empty in `.env.example` — must be a real value in `.env`)* |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |

All environment variables are read in one place: `src/config/env.ts`.
`.env.example` intentionally ships with both database URLs empty —
real Supabase credentials belong only in the git-ignored `.env`, never
in a tracked template file.

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
    "environment": "development",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

Every response (success or error) follows the same envelope shape —
see `src/utils/apiResponse.ts`:

- Success: `{ success: true, message, data }`
- Error: `{ success: false, message, errors }`

Any route that doesn't exist returns a clean JSON 404 in the same
error shape (via `src/middleware/notFound.middleware.ts`), and any
unhandled error returns a clean JSON 500 (via
`src/middleware/error.middleware.ts`) — never Express's default HTML
error pages.

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
      error.middleware.ts         Clean JSON error handler
    utils/
      apiResponse.ts             Consistent success/error response helpers
      query.ts                    Safe query-string parsing helpers
      money.ts                    Delivery fee calculation (Decimal-safe)
      orderNumber.ts               Unique SG-YYYY-XXXX order number generator
  prisma/
    schema.prisma               Full data model (see DATABASE_SCHEMA_PLAN.md)
    seed.ts                      Starter categories/products (npm run seed)
    migrations/                  Generated SQL migration history
  API_ROUTES.md                 Full Product/Category API reference
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
4. **Connecting the frontend** — swapping the frontend's static
   data/Local Storage for real API calls.
5. **Payment integration** (PayFast), **courier integration**, and
   **authentication** (login/registration), each as their own
   milestone.
6. **Admin dashboard** for managing products, categories and orders.

This README will be updated as each piece lands.
