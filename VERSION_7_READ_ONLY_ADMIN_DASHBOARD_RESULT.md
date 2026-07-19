# Version 7, Milestone 59: Read Only Admin Dashboard — Result

**Branch:** `version-7-read-only-admin-dashboard` (off `main` @ `7a69c37`)
**Scope:** Strictly read-only. No order/enquiry/product write, update, or delete route exists anywhere in this milestone.

## What was implemented

A protected admin dashboard giving the owner visibility into orders, enquiries, and low-stock products after login — replacing the Milestone 58 "you are signed in" placeholder with real (but entirely read-only) business data, plus dedicated orders/enquiries list and order-detail pages.

## Backend routes added

Mounted at `/api/admin` (after `/api/admin/auth`), every route protected end-to-end by `requireAdminAuth` applied once at the router level (`backend/src/routes/adminDashboard.routes.ts`) rather than per-handler:

- `GET /api/admin/dashboard` — overview: order counts, recent orders, recent enquiries, low-stock products, manual reminders.
- `GET /api/admin/orders` — paginated order list (`?page=`, `?limit=`, optional `?status=`/`?paymentStatus=` filters).
- `GET /api/admin/orders/:orderNumber` — full order detail (reuses `order.service.ts`'s existing `getOrderByNumber()` output shape unchanged).
- `GET /api/admin/enquiries` — paginated enquiry list (`?page=`, `?limit=`, optional `?type=`/`?status=` filters), message truncated to a 140-character preview.
- `GET /api/admin/products/low-stock` — products where `stockQuantity <= lowStockThreshold`.

**No POST, PATCH, PUT, or DELETE route exists under `/api/admin` beyond the login/logout already added in Milestone 58.** Confirmed by grepping the new backend files for `.create(`, `.update(`, `.delete(`, `.upsert(`, and any `router.post/patch/put/delete` call — none found.

## Frontend admin pages added

- `/admin` — rebuilt from the Milestone 58 placeholder into the real dashboard: welcome text, overview cards (total/pending/paid orders, low-stock count), recent orders table, recent enquiries table, low-stock table, manual action reminders, sign-out button.
- `/admin/orders` — paginated orders table (order number links through to detail).
- `/admin/orders/:orderNumber` — full order detail: summary, customer, delivery address, payment, shipping, items, totals.
- `/admin/enquiries` — paginated enquiries table with a message preview.

None of these routes are linked from the public site's header, footer, or any customer-facing navigation — same "direct URL only" choice made in Milestone 58, unchanged here.

**No edit, delete, or status-update button exists on any admin page.** Every admin page in this milestone renders data only; the only interactive elements are pagination links, the order-number link to the detail page, and the existing Sign Out button.

## Data shown

- **Overview:** total orders, pending-payment orders, paid orders, 10 most recent orders, 10 most recent enquiries, all currently-low-stock products, 5 static manual-reminder lines (matching `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s real current manual process — nothing here is actionable from the dashboard itself).
- **Orders list/detail:** order number, customer name/email/phone, total, payment method/status, order status, fulfilment status, item count, full delivery address, payment record, shipping record, line items.
- **Enquiries list:** type, name, email, phone, subject-or-company, a truncated message preview, status, date.
- **Low stock:** product name, SKU, slug, stock quantity, low-stock threshold, status.

## Security protections

- Every new route requires a valid admin session (`requireAdminAuth`, applied once at the router level — a route added later under this router can't accidentally ship unauthenticated).
- Unauthenticated requests to all 5 new routes confirmed to return `401` before any handler logic runs.
- Order detail reuses the exact same field-by-field-built output shape `order.service.ts` already uses for the public, order-number-gated customer lookup — no internal ids, no `costPrice`, and (confirmed by direct inspection) no `passwordHash`/`tokenHash` anywhere in any admin response shape.
- CORS untouched — no change to `backend/src/app.ts`'s origin allowlist.
- Rate limiting untouched — the existing general `/api` backstop (100 req/15min) continues to apply; no admin dashboard route needed its own dedicated limiter since `requireAdminAuth` is the primary protection for these reads.
- No private customer detail is logged — these are read endpoints with no new logging added.
- Production error verbosity gating (`error.middleware.ts`) is unchanged — no stack trace exposure in production.
- Frontend never stores a session token in `localStorage` — the existing HttpOnly cookie flow (Milestone 58) is reused unchanged; every new admin API call goes through the same `credentials: "include"` wrapper.
- Every admin page redirects to `/admin/login` on a `401` from any of its own API calls, not just an initial check — confirmed for `/admin`, `/admin/orders`, `/admin/orders/:orderNumber`, `/admin/enquiries`.

## Read only confirmation

- No `POST`/`PATCH`/`PUT`/`DELETE` route was added under `/api/admin` in this milestone.
- No Prisma `create`/`update`/`delete`/`upsert` call exists anywhere in `adminDashboard.service.ts`, `adminDashboard.controller.ts`, or `adminDashboard.routes.ts`.
- No frontend admin page has an edit, delete, status-change, or product-add control — pagination links and the order-detail link are the only interactive elements besides Sign Out.
- Order detail intentionally reuses the **existing** `getOrderByNumber()` read function from `order.service.ts` rather than writing a new one — nothing new touches order data at all.

## What's not implemented yet

- No order status update (Milestone 60, per `VERSION_7_ADMIN_DASHBOARD_PLAN.md`).
- No enquiry status update (part of Milestone 61).
- No product stock/detail view beyond the low-stock list (Milestone 62).
- No product add/edit (Milestones 63 planning, 64 implementation).
- No product image upload (Milestone 65).
- No search or filter UI on the orders/enquiries list pages (the backend supports `status`/`paymentStatus`/`type` query filters already, but no frontend control exposes them yet — deliberately deferred, matching the plan's "Search or filters... not part of the read-only MVP").
- No audit log of who viewed what.

## Testing result

**Backend:**
- `npm run build` (`prisma generate && tsc`) — pass.
- `npm run lint` (`tsc --noEmit`) — pass.

**Frontend:**
- `npm run build` (`vite build`) — pass.

**Unauthenticated API tests** (curl, no cookie):
| Route | Result |
|---|---|
| `GET /api/admin/dashboard` | `401` |
| `GET /api/admin/orders` | `401` |
| `GET /api/admin/orders/:orderNumber` | `401` |
| `GET /api/admin/enquiries` | `401` |
| `GET /api/admin/products/low-stock` | `401` |

**Unauthenticated frontend tests** (Playwright, no session):
- `#/admin` → redirects to `#/admin/login`. Pass.
- `#/admin/orders` → redirects to `#/admin/login`. Pass.
- `#/admin/orders/:orderNumber` → redirects to `#/admin/login`. Pass.
- `#/admin/enquiries` → redirects to `#/admin/login`. Pass.

**Service-layer data verification** (direct, read-only, no admin session needed — run against the real database to confirm query correctness beyond the type-checker):
- `getDashboardOverview()` returned correct counts (3 total orders, 3 pending, 0 paid, matching the database directly) and correctly shaped `recentOrders`/`recentEnquiries`/`lowStockProducts`/`manualReminders`.
- `listOrdersForAdmin()` and `listEnquiriesForAdmin()` returned correct pagination metadata (`total`, `page`, `totalPages`).
- `getOrderByNumber()` (reused for order detail) confirmed to contain no `passwordHash` or `tokenHash` key anywhere in its output.
- `getLowStockProducts()` correctly returned only the 2 products where `stockQuantity <= lowStockThreshold`.

**Authenticated dashboard rendering (owner's own login):** Not independently re-tested by this assistant — per the milestone's explicit instruction, only the owner should log in with real credentials, and this assistant does not ask for or handle the password. The unauthenticated-path tests above, combined with the direct service-layer data verification, together confirm the same code paths the authenticated view depends on (data fetching, shaping, and the identical `requireAdminAuth` gate already proven working in Milestone 58) — but the actual rendered dashboard in a real logged-in browser session should still be spot-checked by the owner before this is considered fully proven in production.

## Production safety confirmation

- No production data was changed: `AdminUser` count (1), `AdminSession` count (0), `Order` count (3), `Product` count (10), `Enquiry` count (0), `Payment` count (3) — all identical to the pre-milestone baseline, re-verified after all local testing.
- No orders were created.
- No enquiries were created.
- No product data changed.
- No order status changed.
- No payment code changed — `backend/src/services/payfast.service.ts`, `backend/src/controllers/payment.controller.ts`, and every checkout-path file are untouched.
- No PayFast changes — `PAYFAST_ENABLED` and related config untouched.
- No checkout behaviour changed.
- No email provider connected; no real email sent.
- No courier API added.
- No credentials added anywhere.
- No real `.env` file changed — this milestone touched no environment file at all (no new env var was needed).

## Next milestone recommendation

Milestone 60 — order status update workflow: a `PATCH /api/admin/orders/:orderNumber/status` endpoint replacing today's direct-database-write process, with its own validation (e.g. don't allow `DELIVERED` before `PAID`) and a change log — the first writable admin feature, deliberately built only after this read-only dashboard is proven stable in real use.
