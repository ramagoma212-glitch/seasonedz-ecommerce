# Deployment Safety Checklist

Work through this before and after any real deploy of the backend
(Render or otherwise). See `backend/DEPLOYMENT.md` for the full
deployment plan this checklist accompanies.

## Before Deploying

- [ ] **Supabase database password rotated if it was ever exposed** —
      e.g. pasted somewhere it shouldn't have been, shown in a shared
      terminal, or committed by mistake at any point. If in doubt,
      rotate it: Supabase dashboard → Project Settings → Database →
      Reset database password. Update both Render's environment
      variables and local `.env` afterward.
- [ ] **`.env` was never committed.** Run `git log --all --full-history -- backend/.env`
      — it should return nothing. Also double-check
      `backend/.env.example` has no real values (only empty
      placeholders and the non-secret example GitHub Pages URL).
- [ ] **All required environment variables are added in the host
      dashboard** (Render's Environment tab, or equivalent) — not in
      any file in this repository:
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` (Render sets this itself — only add manually if the
        host requires it)
  - [ ] `DATABASE_URL` (Supabase pooled connection)
  - [ ] `DIRECT_URL` (Supabase direct connection)
  - [ ] `FRONTEND_URL`
  - [ ] `FRONTEND_PRODUCTION_URL` (if a second allowed origin is
        needed — e.g. local dev **and** the live GitHub Pages site
        both calling the same deployed backend)
- [ ] **CORS production origin set correctly** — scheme + host only,
      no path (see `backend/DEPLOYMENT.md`'s "CORS Settings" section).
      For the GitHub Pages frontend, that's exactly
      `https://ramagoma212-glitch.github.io`, not the `/seasonedz-ecommerce/`
      project path.
- [ ] **Any pending Prisma migrations are applied with
      `prisma migrate deploy`** (against the production
      `DATABASE_URL`/`DIRECT_URL`) — see `backend/DEPLOYMENT.md`
      section 7. Never `prisma migrate dev` against production.

## After Deploying

- [ ] **Health check passes**: `GET https://YOUR-BACKEND-DOMAIN/api/health`
      returns `200` quickly.
- [ ] **Product API tested**: `GET /api/products`, `GET /api/categories`,
      and a single product lookup all return real data.
- [ ] **Order API tested**: a real `POST /api/orders` succeeds end to
      end (use a test product/address, matching
      `backend/API_ROUTES.md`'s example body), and
      `GET /api/orders/:orderNumber` /
      `GET /api/orders/:orderNumber/tracking` return it correctly.
- [ ] **Enquiry API tested**: a real `POST /api/enquiries` succeeds,
      and `GET /api/enquiries/:id/status` returns the narrow, safe
      status shape (no personal details).
- [ ] **Rate limits working**: confirm the general and
      order/enquiry-specific limits still return a clean `429` when
      exceeded (see `backend/MANUAL_TEST_CHECKLIST.md`) — a fresh
      deploy has fresh in-memory counters, so this is worth
      re-checking once, not assumed to carry over from local testing.
- [ ] **No secrets printed** — check the host's live log output for
      the health check and a few real requests; confirm no
      `DATABASE_URL`, `DIRECT_URL`, or other secret value ever appears
      (only variable *names* should ever appear, e.g. in a startup
      validation error — see `src/config/env.ts`).
- [ ] **Frontend `VITE_API_BASE_URL` updated** to the real deployed
      backend URL (`https://YOUR-BACKEND-DOMAIN/api`) — see
      `backend/DEPLOYMENT.md` section 8.
- [ ] **GitHub Pages redeployed** after the `VITE_API_BASE_URL` update
      — it's baked in at frontend build time, so the live site keeps
      using the old value (or none) until rebuilt and redeployed.
