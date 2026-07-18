# Version 7 — Admin Dashboard Plan (Milestone 57)

Planning and security review only. **No admin route, login, API, or
product management feature was built or exposed by this milestone. No
database data was changed. No code outside this document was added.**

## Current State

Reviewed directly against the live codebase:

- **No authentication exists anywhere in this backend.** There is no
  `auth.middleware.ts`, no login route, no session or token handling,
  and no password hashing library installed (`backend/package.json`
  has no `bcrypt`, `argon2`, `jsonwebtoken`, or session package —
  confirmed by reading its `dependencies`).
- **`AdminUser` exists in the database schema but is fully
  unused.** `backend/prisma/schema.prisma`'s `AdminUser` model
  (`id`, `name`, `email` (unique), `role` (`ADMIN`/`STAFF`),
  `isActive`, timestamps) has **no password/credential field at
  all** — it was always a placeholder (see the schema's own comment:
  *"No authentication is built in Version 2 — there is deliberately no
  password/credential field here. A future auth milestone must add one
  as a securely hashed credential... designed as part of that
  milestone rather than bolted on here"*). No row in this table is
  created or seeded anywhere in this codebase.
- **No admin routes or controllers exist.** `backend/src/routes/`
  contains only `health`, `product`, `category`, `order`, `enquiry`,
  `payment` — all mounted publicly in `backend/src/routes/index.ts`.
  There is no `admin.routes.ts`, `admin.controller.ts`, or
  `admin.service.ts` anywhere.
- **No admin pages exist on the frontend.** `src/js/router.js`'s
  `routeDefs` has no `/admin` entry of any kind.
- **Every existing read endpoint is public and un-authenticated by
  design**, matching how customers use this site (no login anywhere on
  the storefront either): `GET /api/orders/:orderNumber` and
  `GET /api/orders/:orderNumber/tracking` require knowing the exact
  order number (an unguessable `SG-YYYY-XXXX` code) but no login;
  `GET /api/enquiries/:id/status` similarly requires the exact
  enquiry id. **Neither route lists all orders or all enquiries** —
  there is no existing "list everything" endpoint of any kind, admin
  or otherwise, so an admin dashboard's list views need genuinely new
  backend endpoints, not just an auth wrapper on something that
  already exists.
- **Environment validation already has an established, reusable
  pattern** worth following for admin auth: `PAYFAST_ENABLED` and
  `EMAIL_ENABLED` (`backend/src/config/env.ts`) both default to
  `"false"`, are read via `getEnv(NAME, "false").trim().toLowerCase()
  === "true"`, and only *eagerly* validate their required companion
  variables (throwing a clear startup error naming exactly what's
  missing) inside an `if (thatFlagIsTrue) { ... }` block — so the
  backend never demands credentials for a feature that's off. A future
  `ADMIN_ENABLED` (or similar) flag should follow this exact shape.
- **CORS is already `credentials: true`** (`backend/src/app.ts`),
  meaning cookie-based session auth is already compatible with the
  existing CORS configuration without further changes to that layer —
  relevant to the authentication recommendation below.
- **Rate limiting is already established**
  (`backend/src/middleware/rateLimit.middleware.ts`): a general
  backstop on all of `/api`, plus dedicated tighter limiters for order
  creation, enquiry creation, and payment initiation. A future admin
  login route should get its own dedicated limiter, following this
  exact pattern (brute-force protection).

## Available Data For Admin

Already in the database and queryable via Prisma today, with no
schema change needed for a read-only dashboard:

| Data | Model(s) | Notes |
|---|---|---|
| Orders | `Order` | `orderNumber`, `status`, `paymentStatus`, `fulfilmentStatus`, `paymentMethod`, `subtotal`/`deliveryFee`/`discountTotal`/`total`, `notes`, timestamps |
| Order items | `OrderItem` | Snapshotted `productName`/`productSlug`/`sku`/`quantity`/`unitPrice`/`lineTotal` at time of purchase — always accurate even if the live catalogue changes later |
| Customer details | `Order` (denormalised directly on the order) | `customerEmail`, `customerPhone`, `customerFirstName`, `customerLastName` — stored on the order itself, not just via the optional `Customer` relation, so this is always available even for guest checkout |
| Delivery address | `Order` (denormalised) | `deliveryStreetAddress`, `deliverySuburb`, `deliveryCity`, `deliveryProvince`, `deliveryPostalCode`, `deliveryCountry`, `deliveryNotes` |
| Payment records | `Payment` | `method`, `status`, `amount`, `provider`, `providerReference`, `paidAt`, `failureReason` — one per order |
| Shipping records | `Shipping` | `status` (`NOT_STARTED` → `DELIVERED`), `courierName`, `trackingNumber`, `trackingUrl`, `estimatedDelivery`, `shippedAt`, `deliveredAt` — already exists in the schema, currently only ever set manually |
| Enquiries | `Enquiry` | `type` (`CONTACT`/`SCHOOL`/`WHOLESALE`/`DISTRIBUTOR`), `status` (`NEW`→`CLOSED`), `name`, `email`, `phone`, `companyName`, `organisationType`, `subject`, `message`, `province`, `city`, `estimatedQuantity` |
| Products | `Product` | `name`, `slug`, `sku`, `description`, `shortDescription`, `price`/`oldPrice`/`costPrice`, `stockQuantity`, `lowStockThreshold`, `status`, `ageRange`, `features` (Json), `ratingAverage`/`reviewCount`, `isFeatured`/`isBestSeller`/`isNewArrival`, `discountLabel` |
| Stock quantities | `Product.stockQuantity` / `Product.lowStockThreshold` | Already the field a "low stock" admin view would filter on |

**Missing / not yet available:**

- No admin-facing "list all orders" or "list all enquiries" query
  exists in any service today — `order.service.ts` and
  `enquiry.service.ts` only support single-record lookups. New service
  functions (list, paginate, filter by status) would need to be
  written — planning only, not built by this milestone.
- No audit trail of who changed what — `Order.updatedAt` /
  `Product.updatedAt` show *when* something last changed, never *who*
  or *what specifically* changed. No `AdminActivityLog` model or
  equivalent exists.
- No image storage is configured anywhere in this project (no S3,
  Cloudinary, Supabase Storage, or local upload handling) — relevant
  to the future product image upload feature, see below.
- `Order.status`, `Order.paymentStatus`, and `Shipping` fields have no
  API route to update them today — every update happens by direct
  database write, per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md` and
  `backend/DELIVERY_SETUP.md`.

## Security Requirements

Non-negotiable for any future admin implementation:

- The admin dashboard must require login — no admin page or admin API
  route may be reachable without an authenticated session.
- Admin API routes must be protected by middleware that runs before
  the route handler, not a check inside each handler (a single
  `requireAdminAuth` middleware, applied to the whole `/api/admin`
  router, is far harder to accidentally skip on a new route than a
  per-handler check).
- No admin page may expose customer data (order details, delivery
  addresses, enquiry messages) to an unauthenticated request, under
  any circumstance — including error states (a failed-auth response
  must never leak the data it's protecting).
- Admin passwords must be hashed with a real password hashing
  algorithm (bcrypt or argon2) — never stored or compared as plain
  text, never a reversible encryption.
- Whatever session or token mechanism is chosen must be secure: an
  `HttpOnly`, `Secure`, `SameSite` cookie for a session-based approach,
  or a signed, short-lived, properly-verified token for a JWT-based
  approach — never a token or session id that's guessable, stored in
  `localStorage` unprotected against XSS, or lacking an expiry.
- No admin credential of any kind may exist in source code, in a
  tracked file, in this repository's GitHub history, or in any AI
  assistant conversation (this one included) — the same discipline
  already enforced for PayFast and email credentials throughout this
  project.
- `backend/.env.example` may only ever contain empty placeholder
  values for any future admin-related variable (e.g. an
  `ADMIN_SESSION_SECRET` placeholder), exactly like every other
  credential-shaped variable in that file today.
- CORS must remain exactly as strict as it is today — an explicit
  origin allowlist, never a wildcard — and must not be loosened to
  accommodate admin auth; a cookie-based session already works fine
  under the current `credentials: true` configuration.
- Rate limiting must apply to the admin login route specifically (its
  own dedicated limiter, tighter than the general backstop, following
  the existing `orderCreationRateLimiter`/`enquiryCreationRateLimiter`
  pattern) to slow down credential-guessing attempts.
- Production must never have a default, seeded, or hardcoded admin
  user with a known password — the first real admin account must be
  created deliberately, with a real password, by whoever operates this
  going forward, not shipped as part of any migration or seed script.

## Authentication Recommendation

**Option A (backend session or JWT based admin login using the
existing `AdminUser` model) is recommended — lowest risk for this
project.**

Reasoning, weighed against this project's actual constraints:

- The backend is already a single Express/Prisma service with direct
  database access to `AdminUser` — no new external service or account
  needs to be provisioned to start.
- Admin user needs are simple today (one or a handful of staff
  accounts, no complex roles beyond the existing `ADMIN`/`STAFF`
  enum, no third-party identity federation requirement) — exactly the
  case Option A fits well and Option B (Supabase Auth or another
  external auth provider) would be overkill for right now.
- The frontend is a static GitHub Pages site with no server-side
  rendering — a signed, `HttpOnly` session cookie (Option A,
  session-based) works cleanly with this shape once CORS
  `credentials: true` is used correctly (already the case), same as
  it would with Option B; there's no frontend-architecture reason to
  prefer one over the other.
- Introducing Supabase Auth (Option B) would add a second identity
  system alongside the existing Supabase-hosted Postgres database used
  only for data, plus a new dependency, new environment variables, and
  a new failure mode to reason about — extra complexity this project
  doesn't need yet, and something that could always be adopted later
  if multi-admin/SSO needs grow.
- Within Option A, a **session cookie is preferred over a JWT** for
  this specific case: sessions are trivially revocable (delete the
  session server-side; a JWT needs a denylist or short expiry plus
  refresh complexity to achieve the same), and there is no
  cross-service/cross-domain need here that would justify a stateless
  token — the admin dashboard and its API live behind the same
  logical backend.

**What Option A requires, not yet added:**

- A `passwordHash` field added to `AdminUser` (a real, planned schema
  change for a future milestone — not made by this one).
- A password hashing library (`bcrypt` or `argon2`) added as a backend
  dependency.
- A session mechanism — either a lightweight signed-cookie session
  (e.g. `express-session` with a secure cookie config) or a hand-rolled
  minimal equivalent — plus a `requireAdminAuth` middleware that reads
  it.
- An `ADMIN_SESSION_SECRET`-shaped environment variable, following the
  exact `getEnv`/`getOptionalEnv` + eager-validation-when-enabled
  pattern already used for `PAYFAST_ENABLED`/`EMAIL_ENABLED`.

None of the above is implemented by this milestone.

## Frontend Route Plan (Planning Only)

Proposed, matching the existing `router.js` `routeDefs` pattern
(including its existing support for dynamic segments like
`/product/:slug`, directly reusable for `/admin/orders/:orderNumber`):

| Route | Purpose | Milestone |
|---|---|---|
| `/admin/login` | Admin login form | 58 |
| `/admin` | Dashboard overview | 59 |
| `/admin/orders` | Orders list | 59 |
| `/admin/orders/:orderNumber` | Order detail | 59 |
| `/admin/enquiries` | Enquiries list | 61 |
| `/admin/products` | Products/stock view | 62 |
| `/admin/products/new` | Add product | 64 (future) |
| `/admin/products/:id/edit` | Edit product | 64 (future) |
| `/admin/settings` | Admin settings | later, undecided |

None of these routes exist today; none are added by this milestone.

## Backend API Plan (Planning Only)

Proposed, mounted under a new `/api/admin` router (following the exact
mounting pattern already used in `routes/index.ts`) and protected end
to end by a `requireAdminAuth` middleware:

| Route | Purpose | Milestone |
|---|---|---|
| `POST /api/admin/login` | Authenticate, start session | 58 |
| `POST /api/admin/logout` | End session (or invalidate token) | 58 |
| `GET /api/admin/me` | Confirm current admin identity | 58 |
| `GET /api/admin/orders` | List orders (paginated, filterable by status) | 59 |
| `GET /api/admin/orders/:orderNumber` | Order detail (reuses existing order data, admin-only view) | 59 |
| `GET /api/admin/enquiries` | List enquiries (paginated, filterable by type/status) | 61 |
| `GET /api/admin/products` | List products with stock | 62 |
| `PATCH /api/admin/orders/:orderNumber/status` | Update order/fulfilment status | 60 (later only) |
| `POST /api/admin/products` | Create product | 64 (future only) |
| `PATCH /api/admin/products/:id` | Edit product | 64 (future only) |
| `POST /api/admin/products/:id/images` | Upload product image | 65 (future only) |

No route above is implemented by this milestone.

## Read Only First Approach (Recommended)

The first real admin implementation (Milestone 59, after Milestone
58's login foundation) should be **strictly read-only**. Recommended
scope:

- Total orders count.
- Pending orders count (`paymentStatus: PENDING`).
- Confirmed or paid orders count (`paymentStatus: PAID`).
- A recent orders list (most recent N, with status badges).
- A recent enquiries list.
- A low-stock products list (`stockQuantity <= lowStockThreshold`).
- Manual action reminders (static, honest text — e.g. "Bank Transfer
  orders need manual payment confirmation," "Courier booking is
  manual," matching the real current operational state documented in
  `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`).

**No order status update, no product add/edit, in this first
implementation** — those are explicitly separate, later milestones
(60 and 64 respectively), only built once login and the read-only view
are stable and proven safe in real use.

## Future Writable Features (Not Built Yet)

In the order they should be added, each its own milestone, only after
the read-only dashboard is stable:

1. **Order status update** (Milestone 60) — a `PATCH` endpoint
   replacing today's direct-database-write workflow for
   `fulfilmentStatus`/`Shipping` fields. Needs its own validation
   (e.g. don't allow marking `DELIVERED` before `PAID`) and should log
   what changed.
2. **Enquiry status management** (part of Milestone 61) — marking an
   enquiry `IN_REVIEW`/`RESPONDED`/`CLOSED` from the dashboard instead
   of it staying `NEW` forever.
3. **Product add/edit** (Milestones 63 planning, 64 implementation) —
   see below.
4. **Product image upload** (Milestone 65) — deliberately separated
   from product add/edit itself, since it introduces a genuinely new
   concern (file storage) this project has never had before.

## Future Product Add and Edit Plan

**Explicitly not built in Milestone 57, 58, or 59.** Documented here
only so the eventual implementation has a clear, safe target.

**Fields a future product form needs:** name, slug, SKU, category,
price, original price (if used), stock quantity, short description,
full description, features (bullet list), age range, images,
visibility status (draft/active/archived, reusing the existing
`ProductStatus` enum), SEO title, SEO description.

**Safety needs, all still to be decided/designed when that milestone
starts:**

- **Image upload storage decision.** No storage provider is
  configured anywhere in this project today. Realistic options:
  Supabase Storage (same project as the existing database, likely
  simplest), or a dedicated provider (Cloudinary, S3). Not decided by
  this milestone.
- **Image size and format validation** — server-side, never trusting
  a client-declared MIME type alone; a maximum file size; a fixed
  allowed format set (e.g. JPEG/PNG/WebP only).
- **Required field validation** — the same server-side-never-trust-
  the-client discipline already used for order creation
  (`order.service.ts` never trusts a client-supplied price) must
  extend to product price/stock too.
- **Price validation** — must be a positive number, sensible decimal
  precision (matches the existing `@db.Decimal(10, 2)` column).
- **Stock validation** — must be a non-negative integer; must not
  silently corrupt `stockQuantity` for a product that already has
  pending orders referencing it.
- **Slug uniqueness** — already enforced at the database level
  (`Product.slug @unique`), but the admin UI needs a clear, friendly
  error rather than a raw database constraint error surfacing to the
  admin.
- **Product preview before publishing** — a way to see the real
  product page rendering before it goes live, reducing the risk of a
  broken or incomplete listing reaching customers.
- **Hide instead of delete** — reuse the existing `ProductStatus`
  enum (`DRAFT`/`ACTIVE`/`ARCHIVED`/`OUT_OF_STOCK`) rather than ever
  hard-deleting a product row, since `OrderItem` and `ProductTag`
  reference products and historical orders must never break (the
  schema's own existing design already assumes products can become
  inactive without being deleted — see `OrderItem`'s snapshot fields).
- **Audit notes for changes** — no mechanism exists today to record
  who changed a product's price/stock/description and when, beyond
  the bare `updatedAt` timestamp. Worth a lightweight audit log model
  before this ships, so a pricing mistake can be traced and corrected
  confidently.
- **Rollback or backup plan** — the same discipline already
  established for the product content sync scripts
  (`VERSION_6_PRODUCT_DATABASE_SYNC_PLAN.md`,
  `backend/prisma/product-content-backup-2026-07-18.json`): before any
  admin-driven bulk or risky change, a backup of the affected rows'
  prior values should be captured first.

**This milestone (57) makes no decision on any of the above** — it
only documents that these decisions need to be made deliberately when
Milestones 63/64/65 start, not improvised mid-implementation.

## Admin UX Plan

Kept simple and mobile friendly, matching the storefront's own
existing simple/warm/professional visual language rather than
introducing a separate design system:

- **Login page** — a single centered form (email, password), no
  distracting chrome.
- **Sidebar or top navigation** — collapsible on mobile (the
  storefront's existing header already has a proven mobile
  hamburger-menu pattern in `layout.css`/`responsive.css` worth
  reusing rather than inventing a new one).
- **Overview cards** — the read-only MVP's counts (total/pending/paid
  orders, low stock count), laid out in a responsive grid that
  collapses to one column on mobile, following the same
  `.product-grid`-style mobile-first breakpoint approach already
  proven for the storefront's product grid (Milestone 53).
- **Orders table** — order number, customer name, total, payment
  status badge, fulfilment status badge, date; on narrow screens,
  either a horizontally-scrollable table (contained, not causing
  page-level horizontal scroll — the same discipline already
  established site-wide) or a stacked card layout per order.
- **Enquiries table** — similar shape: type, name, date, status badge.
- **Product stock table** — name, SKU, stock quantity, low-stock
  indicator.
- **Order detail page** — full order information (items, customer,
  delivery address, payment, shipping) in clearly separated sections,
  reusing the existing `.order-confirmation__card` visual pattern
  already used on the customer-facing order confirmation page.
- **Clear status badges** — reuse the existing `.badge` component
  already used elsewhere on the site, with status-appropriate color
  coding.
- **Search or filters** — explicitly a later addition once the basic
  tables exist and prove useful; not part of the read-only MVP.

## Operational Workflow

How the owner should use the admin dashboard once it exists (mirrors
`VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s existing manual process,
which the dashboard replaces the "direct database query" step of, not
the underlying process itself):

1. Check orders daily (replaces a manual database query with the
   orders list view).
2. Confirm payment (Bank Transfer still requires checking the real
   bank account outside this codebase; PayFast already confirms
   itself via ITN once live).
3. Confirm delivery details (order detail page shows the full
   delivery address at a glance).
4. Pack order.
5. Book courier manually (still outside this codebase — see
   `VERSION_6_COURIER_INTEGRATION_PLAN.md`; no automation is added by
   the admin dashboard).
6. Send tracking manually (still a manual customer contact via
   Email/WhatsApp until real email sending and/or courier integration
   exist).
7. Respond to enquiries (enquiries list surfaces new enquiries that
   need a reply, sent manually via Email/WhatsApp).
8. Follow up on pending payments (orders list, filtered to
   `PENDING`, replaces manually querying for this).
9. Review stock levels (low-stock view surfaces this without a manual
   query).
10. Request product updates from the developer when needed, until
    product add/edit (Milestone 64) exists — the admin dashboard's
    first version does not let the owner change a product themselves.

## Risks and Blockers

- No admin authentication exists yet — the dashboard cannot be built
  before Milestone 58 lands safely.
- No real email sending exists yet — the admin dashboard cannot
  trigger a customer notification automatically; every customer
  contact stays manual (Email/WhatsApp) regardless of what the
  dashboard shows.
- No courier automation exists yet — booking and tracking stay
  entirely manual regardless of the dashboard.
- PayFast production verification is still pending — the dashboard's
  payment-status view is accurate for whatever payment methods are
  actually live at the time, not a reason to delay the dashboard
  itself.
- Manual order monitoring remains required even after the dashboard
  ships — it replaces *how* the owner sees the same data, not the
  underlying manual fulfilment process itself.
- The admin dashboard must never expose customer data (orders,
  delivery addresses, enquiry messages) without authentication — the
  single highest-priority risk to design against from the very first
  line of admin code.
- Order status updates, if added too early or without validation, can
  create real mistakes (e.g. marking an unpaid order as delivered) —
  this is exactly why Milestone 60 is deliberately separated from the
  read-only Milestone 59, and why the read-only version should be
  proven stable first.
- Product add/edit, if added without server-side validation, can
  break live product pages customers are actively viewing (a missing
  required field, an invalid price, a broken slug) — this is exactly
  why Milestones 63 (planning) and 64 (implementation) are separated,
  and why "product preview before publishing" is a listed requirement,
  not an optional nicety.
- Product image upload needs a storage decision that doesn't exist
  yet (see Future Product Add and Edit Plan above) — this is a
  meaningful new piece of infrastructure for this project, not a
  small addition, and deserves its own milestone (65) rather than
  being folded into product add/edit itself.

## Recommended Milestone Sequence

1. **Milestone 57** — Admin dashboard planning and security review
   (this milestone).
2. **Milestone 58** — Admin authentication foundation (login,
   sessions, `requireAdminAuth` middleware, no dashboard content yet).
3. **Milestone 59** — Read only admin dashboard (overview, orders
   list/detail, enquiries list, low-stock view — no writes).
4. **Milestone 60** — Order status update workflow (the first
   writable admin feature, deliberately after 59 is proven stable).
5. **Milestone 61** — Admin enquiries management (status updates for
   enquiries).
6. **Milestone 62** — Admin product stock view (read-only product/
   stock detail beyond the basic list in 59).
7. **Milestone 63** — Product add and edit planning (concrete field
   list, validation rules, and UI design — planning only, same spirit
   as this milestone).
8. **Milestone 64** — Product add and edit implementation.
9. **Milestone 65** — Product image upload planning (storage decision,
   validation rules — planning only, implementation would be a further
   milestone beyond this sequence).
10. **Milestone 66** — Admin dashboard polish and mobile review
    (matching the same polish discipline already applied to the
    storefront in Milestone 56).

## Safety Confirmation

- No admin route was exposed — no file under `src/pages/` or
  `src/js/router.js` was created or modified for `/admin`.
- No login was implemented — no password hashing dependency, session
  library, or auth middleware was added anywhere in `backend/`.
- No backend admin API was added — `backend/src/routes/index.ts` and
  every existing route file are unchanged; no `admin.routes.ts`,
  `admin.controller.ts`, or `admin.service.ts` exists.
- No product add or edit feature was implemented — `product.routes.ts`
  and `product.controller.ts` are unchanged.
- No database data was changed — no migration, no seed script run, no
  direct database write of any kind during this milestone.
- No production data was written — confirmed no `psql`, Prisma
  migration, or script execution occurred.
- No payment code changed — no file under `backend/src/services/`,
  `backend/src/controllers/payment.controller.ts`, or any checkout
  path was touched.
- No PayFast changes — `PAYFAST_ENABLED` and related config are
  untouched; confirmed live (see Testing below).
- No `.env` file changed.
- No credentials of any kind were added anywhere in this document or
  the codebase.
- No test order was created.
- No real email was sent — this milestone touched no code at all,
  only documentation.
