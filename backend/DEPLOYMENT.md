# Backend Deployment Guide (Render)

This document is preparation only — **the backend has not been
deployed yet.** It describes exactly how to deploy it to
[Render](https://render.com) when that's actually decided, so the
process is clear and repeatable rather than improvised on the day.
Nothing here requires the backend to actually be deployed; it's safe
to read, follow, or ignore.

Render is used as the primary example because its free/low-cost tier
suits this project well and its settings map directly onto the fields
below, but the same build/start commands and environment variables
work on Railway or any other Node host — only the exact dashboard
field names differ.

## 1. Connect the Repository

1. Push this repository to GitHub (if not already) and sign in to
   Render with GitHub.
2. **New → Web Service**, and select this repository.
3. Render will ask for the settings below — a `render.yaml` at the
   repo root can pre-fill most of them (see "Optional: render.yaml"
   below), but manual setup works exactly the same way.

## 2. Recommended Render Settings

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Environment** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |

**Root Directory matters**: this is a monorepo-style layout (frontend
at the repo root, backend in `backend/`). Setting Root Directory to
`backend` means every other command above runs from inside that
folder, and Render only redeploys this service when something under
`backend/` changes.

`npm run build` already runs `prisma generate && tsc` (see "Prisma
Deployment Notes" below) — Render doesn't need a separate Prisma
build step.

## 3. Environment Variables

Add these in Render's dashboard (**Environment** tab), never in a
committed file:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Removes the local-dev `FRONTEND_URL` fallback — see `src/config/env.ts` |
| `PORT` | *(leave unset, or use Render's `$PORT`)* | Render sets `PORT` itself and expects the app to bind to it — `server.ts` already reads `process.env.PORT` via `env.port`, so no code change is needed. If Render requires an explicit value in its UI, use whatever it suggests (commonly `10000`) |
| `DATABASE_URL` | Your Supabase pooled (pgbouncer) connection string | Same value as local `.env` — see "Supabase Database Connection Notes" below |
| `DIRECT_URL` | Your Supabase direct connection string | Only used by Prisma Migrate, not at runtime — still required, see `src/config/env.ts` |
| `FRONTEND_URL` | The frontend origin most requests will come from | Locally this is `http://localhost:5173`; once there's a real primary frontend origin, decide which of `FRONTEND_URL`/`FRONTEND_PRODUCTION_URL` it goes in — see "CORS Settings" below |
| `FRONTEND_PRODUCTION_URL` | `https://ramagoma212-glitch.github.io` | Optional second allowed origin — set this if `FRONTEND_URL` is used for local dev and the deployed GitHub Pages site needs to call this API too |

**Never paste a real value into this file or any other tracked
file.** See `backend/DEPLOYMENT_CHECKLIST.md`.

## 4. CORS Settings

The backend already supports two allowed origins at once —
`FRONTEND_URL` and the optional `FRONTEND_PRODUCTION_URL` (see
`src/config/env.ts` / `src/app.ts`) — never a wildcard, in any
environment.

**An origin is scheme + host (+ port) only — never a path.** The
deployed frontend lives at
`https://ramagoma212-glitch.github.io/seasonedz-ecommerce/`, but the
`Origin` header a browser sends from any page on that site is just:

```
https://ramagoma212-glitch.github.io
```

with no `/seasonedz-ecommerce` suffix. So `FRONTEND_PRODUCTION_URL`
must be set to exactly that bare value — adding the repo path would
never match and CORS would silently reject the real frontend.

## 5. Health Check Readiness

`GET /api/health` (`src/controllers/health.controller.ts`) is what
Render's Health Check Path should point to. It's already suitable for
this:

- Returns `200` immediately — no database query, no dependency on
  Prisma/Supabase being reachable.
- Never includes a secret (`DATABASE_URL`, `DIRECT_URL`, etc.) in its
  response — only `service`, `version`, `environment`, `timestamp`.

This means Render can consider the service "up" purely based on the
Node process responding, independent of database connectivity — a
database outage would still show as failing API requests elsewhere,
just not as a failed health check. That's an intentional, simple
choice for now; a deeper health check (e.g. an actual `SELECT 1`)
could be added later if that distinction becomes useful.

## 6. Supabase Database Connection Notes

- `DATABASE_URL` (pooled/pgbouncer, port `6543`) is what the app uses
  at runtime — this is what should be set as the Render environment
  variable the running server actually connects with.
- `DIRECT_URL` (direct, non-pooled, port `5432`) is only used by
  Prisma Migrate for schema migrations (Supabase's pooler doesn't
  support the DDL statements migrations need) — still required at
  startup (see `src/config/env.ts`), even though the running app
  never queries through it directly.
- Both values are the exact same ones already used in local
  development (`backend/.env`) — copy them into Render's dashboard,
  never into a committed file.
- If the Supabase database password is ever rotated (e.g. because it
  was accidentally exposed), update it in **both** places: Render's
  environment variables and the local `.env` file.

## 7. Prisma Deployment Notes

- **Migrations are never run automatically at server startup.**
  `src/server.ts` only starts the Express app — nothing in the
  deployed process runs `prisma migrate` on its own, and this
  document doesn't recommend adding that.
- **Do not run `prisma migrate dev` in production.** That command is
  designed for local development (it can reset/reshape the dev
  database interactively) and must never touch the real Supabase
  database.
- **Use `prisma migrate deploy` for production migrations**, run
  manually (or via a controlled CI/deploy step you set up
  deliberately later) — not automatically on every deploy:

  ```bash
  cd backend
  DATABASE_URL="..." DIRECT_URL="..." npx prisma migrate deploy
  ```

  Run this **before** deploying a backend version whose code depends
  on a schema change, using the same `DATABASE_URL`/`DIRECT_URL` as
  production. `prisma migrate deploy` only applies pending migrations
  from `prisma/migrations/` — it never generates new ones and never
  prompts interactively, which is why it's the right command for a
  real database (unlike `migrate dev`).
- `npm run build`'s `prisma generate` step only regenerates the
  Prisma Client's TypeScript types/bindings from `schema.prisma` — it
  never touches the database and is safe to run on every build.

## 8. Frontend Production API Environment

Once the backend is actually deployed and has a real URL (e.g.
`https://seasonedz-backend.onrender.com`), the frontend needs to know
about it:

```
VITE_API_BASE_URL=https://YOUR-BACKEND-DOMAIN/api
```

This is **not set yet** — this document deliberately doesn't hardcode
a backend production URL, since none exists until a real deploy
happens. When it does:

1. Set `VITE_API_BASE_URL` in the frontend's production environment
   (however the frontend build picks up env vars for its GitHub Pages
   deploy — e.g. a repository secret feeding
   `.github/workflows/deploy.yml`, since GitHub Pages serves a static
   build and can't read a runtime `.env`).
2. **Rebuild and redeploy the frontend.** `VITE_API_BASE_URL` is baked
   into the built JavaScript at build time (it's a Vite env var, not
   read at runtime), so an existing GitHub Pages deployment won't pick
   up a new backend URL until the frontend is rebuilt and redeployed.

## 9. How to Test the Deployed API

Once deployed, verify the same way local testing already works (see
`backend/MANUAL_TEST_CHECKLIST.md`), just against the real URL instead
of `localhost:5000`:

```bash
curl https://YOUR-BACKEND-DOMAIN/api/health
curl https://YOUR-BACKEND-DOMAIN/api/products
curl https://YOUR-BACKEND-DOMAIN/api/categories
```

Then spot-check an order and an enquiry submission (see
`backend/API_ROUTES.md` for exact request bodies), and confirm from a
real browser against the deployed frontend origin that CORS actually
allows it (an `Access-Control-Allow-Origin` header matching that
origin on the response) rather than just testing with `curl`, which
never enforces CORS.

## Optional: render.yaml

A `render.yaml` at the repository root (see that file) can pre-fill
the settings in section 2 when creating the service via Render's
"Blueprint" flow. It intentionally contains **no environment variable
values** — those still have to be entered in Render's dashboard by
hand (see section 3). Manual setup through Render's UI works exactly
the same way and doesn't depend on this file existing at all — use
whichever is more convenient.

## Not Covered by This Milestone

- Actually deploying (this document is preparation only).
- Production PayFast, courier integration, or any other real
  third-party service.
- Configuring GitHub Pages' own deploy workflow to inject
  `VITE_API_BASE_URL` — noted above, not implemented.
- A shared rate-limit store (Redis, etc.) for multi-instance
  deployments — the current rate limiter is in-memory and fine for a
  single Render instance (see `backend/API_ROUTES.md`).
