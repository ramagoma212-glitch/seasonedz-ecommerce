# Version 2 Local QA Notes (Milestone 18)

Full local QA review of Version 2, ahead of pushing to GitHub and any
real deployment. **Nothing was deployed and nothing was pushed as
part of this milestone** — this document records the state as
verified locally, so that decision can be made with clear information.

## Version 2 Current Status

Milestones 9 through 18 are complete. Locally, both the backend
(Express + TypeScript + Prisma + Supabase PostgreSQL) and the frontend
(Vite + vanilla JS) run and work together correctly. The backend has
never been deployed anywhere; the frontend has never been rebuilt or
redeployed to point at anything but `localhost`.

| Milestone | What it delivered |
|---|---|
| 9 | Backend project foundation (Express, TypeScript, health check) |
| 10 | Database schema design (Prisma models, no live database yet) |
| 11 | Real Supabase database migration + starter seed data (6 categories, 10 products) |
| 12 | Read-only Product/Category API |
| 13 | Guest Order API (server-verified pricing/stock, transactional) |
| 14 | API hardening — rate limiting, multi-origin CORS, stricter env validation, consistent validation-error shape |
| 15 | Enquiry API (Contact/Schools/Wholesale/Distributor) |
| 16 | Frontend connected to all of the above, locally, with static-data fallback |
| 17 | Backend deployment preparation (Render docs, checklist, `render.yaml`) — not deployed |
| 18 | This QA pass — full local test sweep, database cleanup, small documentation fixes |

## What Now Works Locally

Verified directly in this milestone (see "Manual Testing Summary"
below for the full detail):

- Backend: health check, full product/category browsing (including
  featured/best-sellers/new-arrivals and category-filtered listing),
  guest order creation/lookup/tracking, all four enquiry types plus
  status lookup, rate limiting, CORS, and the production build
  (`prisma generate && tsc`) all work correctly against the real
  Supabase database.
- Frontend: every page loads correctly with live backend data
  (homepage rails, Shop, Categories, Search, filters, Product Details),
  cart and wishlist (Local Storage, unchanged), full checkout →
  order confirmation → tracking flow against the real backend,
  checkout validation errors (both client-side and backend-returned),
  all four enquiry forms, the mobile menu, and the 404 page.
- The frontend's static-data/no-backend fallback works correctly and
  visibly: with the backend stopped, the site still browses normally
  (via the original static product data) and checkout/enquiry
  submission shows a clear "could not connect" message rather than
  pretending to succeed.
- No console errors and no unexpected failed network requests were
  observed in any of the above.

## What Still Needs Deployment

Nothing has been deployed. Before Version 2 is live for anyone but a
local developer:

1. The backend needs to actually be deployed (Render or similar) —
   see `backend/DEPLOYMENT.md` for the full, already-written plan, and
   `backend/DEPLOYMENT_CHECKLIST.md` for what to verify before/after.
2. The frontend's `VITE_API_BASE_URL` needs to point at that real
   deployed backend URL, and the frontend needs to be rebuilt and
   redeployed to GitHub Pages — it's baked in at build time, so the
   live site keeps working exactly as it does today (static
   fallback, since it has no reachable backend) until that happens.
3. Both of the above are **deliberately not part of this milestone** —
   this is a local QA checkpoint, not a deploy.

## What Is Still Not Real Yet

Unchanged from previous milestones, confirmed still true today:

- **Payment**: no PayFast or any other real payment processing.
  Checkout only records a chosen payment method; no money moves.
- **Courier integration**: order tracking is a status set manually in
  the database (`trackingSource: "backend-demo"` in the API
  response), not a live courier API.
- **Login / registration / customer accounts**: every route is
  public/guest-only. There is no authentication anywhere in this
  system.
- **Customer dashboard**: no order history view tied to an account —
  orders are only ever looked up by order number.
- **Admin dashboard**: no UI or route for staff to manage products,
  categories, orders, or enquiries. `AdminUser` exists as a schema
  placeholder only (Milestone 10) and is never used.
- **Email notifications**: no order confirmation emails, no enquiry
  acknowledgement emails. The frontend confirmation/reference-number
  shown on screen is the only acknowledgement a customer gets.

## What Must Happen Before Pushing and Deploying

- [ ] Review this document and the two deployment docs
      (`backend/DEPLOYMENT.md`, `backend/DEPLOYMENT_CHECKLIST.md`)
      and decide whether to proceed.
- [ ] Push this branch (`version-2-backend`) to GitHub — not done as
      part of this milestone, only on explicit instruction.
- [ ] Follow `backend/DEPLOYMENT_CHECKLIST.md` in full for the actual
      deploy — including rotating the Supabase password first if
      there's any doubt it was ever exposed, and applying
      `prisma migrate deploy` (not `migrate dev`) against production.
- [ ] After the backend is deployed, update `VITE_API_BASE_URL` and
      rebuild/redeploy the frontend (see `backend/DEPLOYMENT.md`
      section 8).
- [ ] Re-run the key manual tests from `backend/MANUAL_TEST_CHECKLIST.md`
      against the real deployed URL once it exists, not just
      `localhost`.

## Known Risks

- **In-memory rate limiting** doesn't survive a restart and isn't
  shared across multiple instances — fine for a single Render
  instance, but worth knowing if the backend ever scales
  horizontally (see `backend/API_ROUTES.md`).
- **No automated test suite.** All verification (this milestone
  included) is manual — real, but not regression-proof the way an
  automated suite would be. `backend/MANUAL_TEST_CHECKLIST.md` is the
  current substitute.
- **No email notifications** means a customer's only record of an
  order or enquiry is the on-screen confirmation/reference number —
  worth being explicit about this with any real customer, since
  Version 1's demo language ("no real payment/shipping") no longer
  fully describes the system (orders are now real database records).
- **CORS origin is exact-match, scheme+host only.** If the GitHub
  Pages URL, custom domain, or local dev port ever changes, the
  corresponding `FRONTEND_URL`/`FRONTEND_PRODUCTION_URL` must be
  updated or the frontend will be silently blocked from reading API
  responses (see `backend/DEPLOYMENT.md`).
- **Stray local dev-server processes**: on this Windows development
  machine, `tsx watch`/Vite's dev server has repeatedly left a child
  `node.exe` process bound to its port after being stopped, across
  every milestone's testing in this session history. Not a code bug,
  but worth knowing if `EADDRINUSE`/`EPERM` (file-lock) errors show up
  unexpectedly during local development — check for a leftover
  process on the relevant port before assuming something is broken.

## Manual Testing Summary

All testing below was performed locally (backend on
`http://localhost:5000`, frontend on `http://localhost:5173`) against
the real Supabase database.

**Secrets audit:** `backend/.env` and root `.env` are both git-ignored
and were never committed (confirmed via `git log --all --full-history`
returning nothing for either path). Both `.env.example` files contain
placeholders only. A repository-wide search found no committed
`postgresql://` connection strings, no populated `DATABASE_URL`/
`DIRECT_URL` values, and no other credential patterns.

**Backend API** (curl): `/api/health` (fast, no DB query, no secrets),
`/api/products`, `/api/categories`, `/api/products/featured`,
`/api/products/best-sellers`, `/api/products/new-arrivals`,
`/api/products/:slug`, `/api/categories/:slug/products` — all `200`,
no `costPrice` in any response. A valid guest order was created
(`POST /api/orders`, `201`) and successfully looked up via
`GET /api/orders/:orderNumber` and its `/tracking` variant. All four
enquiry types (`CONTACT`/`SCHOOL`/`WHOLESALE`/`DISTRIBUTOR`) were
created (`201`) and looked up via `GET /api/enquiries/:id/status`
(narrow, safe shape only). An unknown route returned a clean JSON
`404`. Rate limiting was confirmed still active (the order-creation
limiter blocked a request once its 10/15-minute budget was used).
CORS was confirmed to allow `http://localhost:5173` and reject an
arbitrary unrelated origin.

**Frontend** (real headless-browser session, Playwright, installed to
an isolated scratch directory — not part of this repository): Home
(product rails), Shop, Categories, Search, a category filter, Product
Details, Cart, Wishlist, and the 404 page all rendered correctly with
no console errors. A full checkout completed successfully against the
real backend and redirected to order confirmation; a second checkout
attempt with an invalid email was correctly caught by client-side
validation and never reached the backend. The completed order was
re-viewed on both the order confirmation and tracking pages,
correctly showing real backend data. All four enquiry forms
(Contact/Schools/Wholesale/Distributor) submitted successfully with a
reference number shown on screen. On a mobile viewport (375×812), the
mobile menu opened correctly and neither the checkout page nor the
product details page showed horizontal overflow. With the backend
fully stopped, the Shop page still rendered all 10 products via the
static fallback, with only a developer-facing console warning (never
a customer-facing error).

**Database cleanup:** all order and enquiry rows found in the
database were test artifacts from this milestone's testing and from
earlier milestones' testing sessions that had not previously been
cleaned up — none were real customer data. All were deleted using
explicit ID lists (never a blanket delete). Product stock levels,
which had drifted from repeated test orders across milestones, were
restored to their original seeded values by re-running the idempotent
seed script (`npm run seed`), which only touches
Category/Product/ProductImage/ProductTag and never orders or
enquiries. Final confirmed state: **6 categories, 10 products, 0
orders, 0 enquiries.**

**Builds:** `backend`: `npm run build` (`prisma generate && tsc`) and
`npm run lint` (`tsc --noEmit`) both pass. Root: `npm run build`
(Vite) passes, 62 modules, unaffected by this milestone's
documentation-only frontend changes.

## Issues Found and Fixed This Milestone

- Two stale claims in `backend/API_ROUTES.md` still said "the frontend
  is not connected" / "nothing on the site calls this API yet" — true
  through Milestone 15, false since Milestone 16. Corrected.
- Product stock quantities had drifted from accumulated test orders
  across several milestones' testing sessions; restored via
  `npm run seed`.
- A Windows-specific `EPERM` file-lock error occurred when running
  `npm run build` in `backend/` while its own dev server was still
  running (the Prisma query engine DLL was in use) — resolved by
  stopping the dev server first before building. Not a code bug.
- All accumulated test orders/enquiries (10 orders, 8 enquiries) from
  this and prior milestones' testing were removed from the database
  (see "Database cleanup" above).

No functional code changes were needed — every API route, page, and
integration behaved exactly as documented.
