# Seasonedz Group — Backend (Version 2 Foundation)

This is the backend API for the Seasonedz Group e-commerce website —
currently the **foundational setup only**. It runs as a separate
project alongside the existing frontend (see the root `README.md` for
the frontend), with its own `package.json`, its own dependencies, and
its own dev server.

**Current status: foundation only.** There is no database connection,
no real data models, no product/order APIs, and nothing here is
connected to the frontend yet. The only working endpoint is a health
check. See "What's Coming Later" below.

## Tech Stack

- Node.js + Express
- TypeScript (ES Modules, `NodeNext` module resolution)
- Prisma installed and configured, planned for PostgreSQL — **no
  models defined yet, no database connection made**

## Installing Dependencies

From inside the `backend/` folder:

```bash
cd backend
npm install
```

## Running Locally

1. Copy the example environment file and adjust if needed (the
   defaults work out of the box for local development):

   ```bash
   cp .env.example .env
   ```

2. Start the dev server (auto-restarts on file changes):

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:5000` by default.

### Other Scripts

```bash
npm run build   # Compile TypeScript to dist/
npm run start   # Run the compiled build (node dist/server.js)
npm run lint    # Type-check without emitting (tsc --noEmit)
```

`lint` is a type-check rather than a full ESLint setup for now — kept
deliberately minimal for this foundational milestone. A proper ESLint
config can be added later without changing this script's name.

## Environment Variables

Defined in `.env.example` (copy to `.env` for local use — `.env` is
git-ignored and must never be committed):

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Port the API listens on | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | *(empty — not required yet)* |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |

All environment variables are read in one place: `src/config/env.ts`.

## Available Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Returns a simple JSON status check |

Example response:

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
    routes/
      index.ts                  Mounts every route group under /api
      health.routes.ts           GET /api/health
    controllers/
      health.controller.ts       Health check handler
    middleware/
      notFound.middleware.ts     Clean JSON 404 for unmatched routes
      error.middleware.ts         Clean JSON error handler
    utils/
      apiResponse.ts             Consistent success/error response helpers
  prisma/
    schema.prisma               Placeholder — no models yet
  .env.example
  package.json
  tsconfig.json
```

## What's Coming Later

This milestone is deliberately just the foundation. Future backend
milestones will add, roughly in this order:

1. **Database schema** — real Prisma models (Product, Category, Order,
   Customer, etc.) and a real PostgreSQL connection.
2. **Product & category APIs** — read endpoints the frontend can
   eventually switch to instead of its static data files.
3. **Order APIs** — real order creation/lookup, replacing the
   frontend's Local Storage demo orders.
4. **Connecting the frontend** — swapping the frontend's static
   data/Local Storage for real API calls.
5. **Payment integration** (PayFast), **courier integration**, and
   **authentication** (login/registration), each as their own
   milestone.
6. **Admin dashboard** for managing products, categories and orders.

Nothing above exists yet — this README will be updated as each piece
lands.
