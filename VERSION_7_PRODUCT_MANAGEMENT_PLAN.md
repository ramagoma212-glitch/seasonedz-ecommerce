# Version 7, Milestone 65: Product Management — Planning

**Planning only. No schema change, no migration, no database write, no admin product route, no product management UI — only this document was added.**

Builds on `VERSION_7_ADMIN_DASHBOARD_PLAN.md` (Milestone 57) and `VERSION_7_READ_ONLY_ADMIN_DASHBOARD_RESULT.md` (Milestone 59), and follows the same phased discipline already proven across the order-status workflow (Milestones 60-64: plan → audit plan → audit implementation → backend → frontend).

## 1. Current Product Schema Findings

Reviewed directly against `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/src/routes/product.routes.ts`, `backend/src/controllers/product.controller.ts`, `backend/src/services/product.service.ts`, `backend/src/services/adminDashboard.service.ts`, and the admin frontend files. (The task referenced `backend/src/services/admin/adminDashboard.service.ts` — as in every prior milestone, no `admin/` subfolder exists; the real path is `backend/src/services/adminDashboard.service.ts`.)

**`Product` model fields** (`schema.prisma`): `id` (cuid), `name`, `slug` (unique), `sku` (optional, unique), `description` (optional), `shortDescription` (optional), `price` (`Decimal(10,2)`), `oldPrice` (optional `Decimal(10,2)`), `costPrice` (optional `Decimal(10,2)` — internal only, never exposed to the storefront, "used for margin reporting once an admin dashboard exists" per the schema's own existing comment), `stockQuantity` (`Int`, default `0`), `lowStockThreshold` (`Int`, default `5`), `status` (`ProductStatus` enum, default `DRAFT`), `ageRange` (optional string), `features` (optional `Json` — "deliberately loose... since the exact shape may evolve"), `categoryId` (required FK), `images`/`tags`/`orderItems` relations, `ratingAverage` (`Decimal(3,2)`, default `0`), `reviewCount` (`Int`, default `0`), `isFeatured`/`isBestSeller`/`isNewArrival` (booleans), `discountLabel` (optional string), `createdAt`/`updatedAt`.

**`Category` model fields**: `id`, `name`, `slug` (unique), `description` (optional), `imageUrl` (optional), `isActive` (default `true`), `sortOrder` (default `0`), `products` relation, `createdAt`/`updatedAt`.

**`ProductImage` model fields**: `id`, `productId` (FK, `onDelete: Cascade`), `url` (plain string — no blob/base64 storage), `altText` (optional), `sortOrder` (default `0`), `isPrimary` (boolean), `createdAt`.

**`ProductStatus` enum**: `DRAFT`, `ACTIVE`, `ARCHIVED`, `OUT_OF_STOCK`.

**No dimensions, weight, or other physical-metadata field exists** — confirmed by reading the full model; `features` (`Json`) is the only flexible/extensible field, currently used for bullet-point feature lists (per its own schema comment), not structured specs.

**Current public product API** (`product.routes.ts`, all `GET`, no auth): `GET /api/products` (list, filterable by `search`/`category`/`minPrice`/`maxPrice`/`ageRange`/`tag`/`stock`, sortable), `GET /api/products/featured`, `GET /api/products/best-sellers`, `GET /api/products/new-arrivals`, `GET /api/products/:slug`. **No create, update, or delete route exists anywhere in this codebase today** — confirmed by reading the full route file.

**Current admin low-stock API** (Milestone 59, still live): `GET /api/admin/products/low-stock` — read-only, `requireAdminAuth`-protected, returns `name`/`sku`/`slug`/`stockQuantity`/`lowStockThreshold`/`status` for every product where `stockQuantity <= lowStockThreshold`. This is the only admin-facing product endpoint that exists today.

**Current seed file behaviour** (`backend/prisma/seed.ts`): upserts `Category` and `Product` rows **by slug**, `connectOrCreate`s tags, and *replaces* (deletes then recreates) each product's `ProductImage` rows on every run. Its own comment already states it's "safe to re-run" — but only in the sense that re-running it with the *same* seed data is idempotent. It is explicitly a starter/dev dataset mirror (its own comment: "nothing reads from this database yet" — now outdated, but the upsert-by-slug mechanism is unchanged), never designed as a live-editing tool.

## 2. Current Product Management Gap

- **The owner cannot add a product from the admin dashboard.** No create route, no admin form.
- **The owner cannot edit a product's price, stock, or description from the admin dashboard.** No update route, no admin form. Every field is currently set once, either by the seed script or a direct database write.
- **The owner cannot upload a product image from the admin dashboard.** No upload endpoint, no storage integration; images are static files referenced by relative path (`/images/product-1.jpg`), bundled with the frontend build — adding a genuinely new image today requires a code change and redeploy, not an admin action.
- **Editing `seed.ts` and re-running it is not a safe way to update live products.** Because the seed script upserts by slug using its own hardcoded data for *every* product it lists, re-running it after only intending to change one product's price would silently reset every other seeded product's `price`/`stockQuantity`/`description`/etc. back to whatever the seed file's snapshot says — overwriting any real stock changes (e.g., from real orders) or any other manual edits that happened since the file was last updated. This is a genuine live-data risk, not a hypothetical one, given `stockQuantity` already changes via real order creation (`order.service.ts`'s stock-decrement transaction) — a seed re-run would silently undo that.

## 3. Product Management Goals

Eventually, the admin dashboard should let the owner: add a product; edit product details; update price; update stock; mark a product active or inactive; assign a category; edit description and features; edit age range and product facts; view low stock (already live); do all of this safely while customers continue to browse and order online. **Product image upload is explicitly a separate, later concern** (Milestones 68-69) — not attempted in the first implementation.

## 4. Recommended First Version (Safest Scope)

- Product list in admin (reuses the same table/pagination pattern already proven for orders/enquiries since Milestone 59).
- Product detail/edit page.
- Create product page.
- Editable: text fields, price, stock quantity, category, active/inactive status.
- **No delete product** (of any kind — see Section 5).
- **No image upload** yet.
- **No bulk updates.**
- **No automatic discount engine** (`oldPrice`/`discountLabel` already exist in the schema and can be edited as plain fields, but no automated discount *calculation* logic should be introduced).
- **No direct database editing by the owner** as an accepted normal workflow going forward — the whole point of this feature is to retire that need, the same way the order-status admin UI (Milestones 60-64) retired direct-database order-status edits.

## 5. What Must Not Be Allowed First

- No product delete, no bulk delete — matches this project's existing "final statuses require careful policy, never a quick undo via deletion" discipline (established for orders in `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md` Section 12) and the schema's own existing design: `OrderItem`/`ProductTag` reference products, and historical orders must never break if a product is later hidden — exactly why `ProductStatus` has `ARCHIVED` as a non-destructive alternative to deletion already built into the enum.
- No payment changes, no order changes — product management stays entirely out of `backend/src/services/payfast.service.ts`, `order.service.ts`, and every payment/checkout file.
- No direct image upload until storage is planned (Milestone 68) and approved.
- No editing SKU after creation unless carefully approved as its own decision — a SKU is typically an external inventory/accounting reference; changing it silently could break reconciliation outside this codebase.
- No automatically changing slug in a way that breaks existing links — a product's URL (`/product/:slug`) may already be shared, bookmarked, or indexed by search engines; slug edits need explicit confirmation, never a silent side effect of renaming a product.
- No changing product ID — the primary key, never editable by any admin action.
- No changing historical order items — `OrderItem` already snapshots `productName`/`productSlug`/`sku`/`unitPrice` at time of purchase specifically so a later product edit *cannot* retroactively change what a past order says the customer bought or paid; this must remain true after product management ships.
- No running `seed.ts` against production to "update" a live product — per Section 2's finding, this is a real risk, not a style preference.

## 6. Create Product Fields (Actual Schema Field Names)

| Field | Schema name | Notes |
|---|---|---|
| Product name | `name` | Required. |
| Slug | `slug` | Auto-generated from `name` for new products (Section 10); required, unique. |
| SKU | `sku` | Optional in the schema, but recommended as required at creation time for real inventory tracking — a decision for the implementation milestone to confirm with the owner. |
| Category | `categoryId` | Required — chosen from existing `Category` rows; no "create category inline" in the first version. |
| Short description | `shortDescription` | Optional. |
| Full description | `description` | Optional. |
| Price | `price` | Required, `Decimal(10,2)`. |
| Old price | `oldPrice` | Optional — for showing a strikethrough original price. |
| Stock quantity | `stockQuantity` | Required, integer, defaults to `0`. |
| Low stock threshold | `lowStockThreshold` | Optional, defaults to `5` — editable so the owner can tune per-product. |
| Status | `status` | Required — `DRAFT`/`ACTIVE`/`ARCHIVED`/`OUT_OF_STOCK`; new products should default to `DRAFT` so nothing goes live accidentally before the owner is ready. |
| Featured / Best seller / New arrival | `isFeatured` / `isBestSeller` / `isNewArrival` | Optional booleans, default `false`. |
| Age range | `ageRange` | Optional string. |
| Features | `features` | Optional `Json` — a simple bullet-list editor (add/remove line) is enough for the first version; no rich structured-spec UI yet. |
| Discount label | `discountLabel` | Optional string (e.g. "Save 20%") — plain text field, not calculated. |

**Not exposed on the create form:** `costPrice` (internal-only, never shown to the storefront — the schema's own existing comment already establishes this; whether the *admin* should eventually see it for margin reporting is a separate future decision, not assumed here), `ratingAverage`/`reviewCount` (aggregate fields, never hand-set), `id`/`createdAt`/`updatedAt` (system-managed).

## 7. Edit Product Fields

**Safe to edit:** `name`, `description`, `shortDescription`, `features`, `price`, `oldPrice`, `stockQuantity`, `lowStockThreshold`, `categoryId`, `status`, `isFeatured`/`isBestSeller`/`isNewArrival`, `ageRange`, `discountLabel`.

**Restricted (not on the normal edit form, or require explicit extra confirmation if ever exposed):**
- `sku` — see Section 5; if ever allowed, a separate, deliberately-harder-to-reach control with its own confirmation, not a normal text field.
- `slug` — same treatment; changing it must warn about breaking existing links (Section 10).
- `id` — never editable, full stop.
- `createdAt` — system-managed, never editable.
- Historical `OrderItem` snapshot fields — not reachable from product editing at all; they belong to a different model and are never touched by any product-management code path.
- `ratingAverage`/`reviewCount` — aggregate fields; the schema's own comment already says these are "recalculated whenever a future Review model is added... not maintained by hand" — product editing must not introduce manual overrides of them.
- `costPrice` — not on the standard edit form for the first version; if margin reporting is ever built, it deserves its own reviewed decision about who can see/edit it, not silent inclusion in the general edit form.

## 8. Stock Rules

- Stock can be increased or decreased manually by the admin.
- Stock cannot go negative — validated server-side (`stockQuantity >= 0`), matching the same "never trust client input, validate server-side" discipline already used everywhere else in this backend (e.g., `order.service.ts` never trusts a client-supplied price).
- The low-stock warning threshold (already visible via the Milestone 59 low-stock view) should stay visible on the edit form too, so the admin can see at a glance whether their new stock number would trigger the warning.
- **When a customer orders, stock is already reduced automatically today** — confirmed in `order.service.ts`'s `createOrder()`, which uses an atomic `updateMany` with a `stockQuantity: { gte: item.quantity }` guard inside a transaction specifically to prevent overselling under concurrent orders. Product management must not duplicate or conflict with this existing mechanism — an admin stock *edit* is a separate, direct write to the current on-hand count, not a re-implementation of the order-time decrement.
- An admin stock edit must never change any past order's data — `OrderItem`'s snapshot fields already guarantee this structurally; a stock edit only ever touches `Product.stockQuantity`.
- A stock-change note or full stock history is **not required for the first version**, but is recommended as a natural future addition once the pattern is proven — this project already has a working template for exactly this shape of feature (`OrderStatusHistory`, Milestones 61-62), which a future `ProductStockHistory` (or a broader `ProductChangeHistory`, Section 15) could closely mirror.

## 9. Price Rules

- Price must be numeric.
- Price must be greater than `0` — validated server-side.
- Currency is always South African Rand, matching the storefront's existing `R${amount.toFixed(2)}` convention everywhere else in this codebase (no currency selector, no multi-currency support).
- **Changing a product's price only ever affects future orders.** `OrderItem.unitPrice`/`lineTotal` are snapshotted at order-creation time (confirmed in `order.service.ts`) — a later price edit on `Product.price` cannot retroactively change what a past order recorded or charged.
- Past order item prices must never change — already structurally guaranteed by the snapshot design; product management must not add any code path that touches `OrderItem` at all.
- **No discount *engine*** in the first version — `oldPrice`/`discountLabel` remain plain, manually-set fields (Section 4); no automatic percentage calculation, no scheduled sales, no coupon system.
- A confirmation step for large price changes (e.g., a price drop or increase beyond some percentage) is a reasonable UX safety net worth including in the implementation milestone's design — flagged here as a recommendation, not a hard requirement, since "large" needs a concrete threshold the owner should weigh in on.

## 10. Slug and SEO Rules

- Slug must remain unique — already enforced at the database level (`Product.slug @unique`); the admin UI needs a clear, friendly error rather than a raw database constraint error surfacing to the admin (this exact requirement was already flagged in `VERSION_7_ADMIN_DASHBOARD_PLAN.md`'s "Future Product Add and Edit Plan" section from Milestone 57, and remains true here).
- For new products, slug should auto-generate from `name` (lowercased, hyphenated, matching the existing seed data's slug shape), with the admin able to review/adjust before saving.
- **Existing-product slug changes should be restricted or require explicit confirmation** — changing a live product's slug changes its public URL (`/product/:slug`), breaking any external link, bookmark, or search-engine index entry pointing at the old one. If ever allowed, the confirmation should say so plainly, not bury it as a routine field edit.
- SEO fields (meta title, meta description) do not exist in the current schema at all — out of scope for this milestone, flagged here only as a possible future addition, not decided.

## 11. Image Strategy (Planning Only — Not Implemented)

- **Current product images are stored as plain URL strings pointing at static frontend assets** (`/images/product-N.jpg`), bundled into the Vite build and served from GitHub Pages — confirmed via `ProductImage.url` (a plain string column) and the seed file's actual values. There is no blob storage, no CDN, no upload endpoint anywhere in this codebase today.
- **Image upload is explicitly not part of the first product-edit implementation** — the schema already supports storing an arbitrary URL per `ProductImage` row, so a first product-management version can still let the admin *type* an image URL (if one already exists as a static asset or external link) without needing real upload infrastructure — but building a genuine upload feature is deferred to Milestones 68-69, consistent with `VERSION_7_ADMIN_DASHBOARD_PLAN.md`'s original sequencing (Milestone 65 there, renumbered here).
- **Future image upload needs a storage decision** — realistic options, same framing already used for email/courier provider decisions in this project (`EMAIL_SETUP.md`, `DELIVERY_SETUP.md`): Supabase Storage (same project as the existing database, likely simplest to wire up), Cloudinary, or another dedicated image host/CDN. Not decided by this milestone.
- Future rules to design when that milestone starts: **image size limits** (max file size, max dimensions), **required alt text** (already a schema field, `ProductImage.altText`, currently always optional — accessibility-minded default should probably make it required for new uploads), **main image vs. gallery** (`ProductImage.isPrimary` already exists for this), **never store raw base64 image data in the database** (the `url` column is a reference, not a payload — this must stay true), **never commit large image files into Git** (this project's own repo history should stay free of binary bloat — external storage exists specifically to avoid this).

## 12. Future Backend Routes (Planning Only — Not Implemented)

```
GET   /api/admin/products
GET   /api/admin/products/:id        (or :slug — implementation milestone to decide)
POST  /api/admin/products
PATCH /api/admin/products/:id
PATCH /api/admin/products/:id/stock  (if stock is split into its own focused endpoint)
```

All must require `requireAdminAuth`, mounted the same router-level way every existing `/api/admin` route already is (`adminDashboard.routes.ts`'s `router.use(requireAdminAuth)` pattern, proven since Milestone 59 and extended safely through Milestone 64's write route). **None of these routes are implemented by this milestone** — confirmed no route file was created or modified.

## 13. Future Frontend Pages (Planning Only — Not Implemented)

```
/admin/products
/admin/products/new
/admin/products/:id        (or :slug)
/admin/products/:id/edit
```

All admin-only, reachable only by direct URL exactly like every existing admin page since Milestone 58 (`/admin/login`, `/admin`, `/admin/orders`, etc.) — **no public navigation link**, per this project's established "no public admin link in main navigation" discipline. **No delete button anywhere in the first version.** None of these pages exist yet — confirmed no frontend file was created or modified.

## 14. Validation Rules (For The Future Implementation)

- `name` required, non-empty after trim.
- `sku` required for create (per Section 6's recommendation), unique — clear error on duplicate, not a raw constraint error.
- `categoryId` required, must reference an existing category.
- `price` required, numeric, greater than `0`.
- `stockQuantity` required, integer, `>= 0`.
- `slug` unique — clear error on duplicate.
- Description/short-description length limits (a sensible cap, e.g. matching the 500-character note limit already established for order-status notes, or a larger cap appropriate for a product description — a concrete number for the implementation milestone to set).
- `features` — a reasonable limit on list length/item length (avoid unbounded input).
- **No HTML injection** — every text field trimmed and, wherever later rendered back to an admin or customer, escaped exactly the way this project already handles every other user- or admin-influenced string (`escapeHtml()`, used consistently across the storefront and the admin dashboard since Milestone 59).
- Trim all text fields before validation and storage — matching the existing `parseStringParam`-style convention already used in `backend/src/utils/query.ts`.
- Safe, specific error messages — never a raw database constraint error or stack trace reaching the client, matching this project's existing `error.middleware.ts` production-safety gating.

## 15. Audit/History Recommendation

**Full product audit history is not required for the first implementation, but is recommended as a near-term follow-up, not an indefinitely-deferred one.** At minimum, the following changes are worth logging once a `ProductChangeHistory` (or similarly-named) model exists: price changes, stock changes, active/inactive (`status`) changes, and product creation itself. This project already has a proven, working template for exactly this shape of feature — `OrderStatusHistory` (Milestones 61-62: schema design, migration, `changedByAdminUserId` + email/name snapshot fields, `onDelete: SetNull` from the admin side so history survives an admin being deleted) — a future `ProductChangeHistory` should closely mirror that design rather than inventing a new pattern. **Recommendation: document this now (done, here), design and build it as its own planning + implementation milestone pair once the first product-management version is live and stable** — the same "prove read/write works, then add audit" ordering already used for orders should not be skipped for products either.

## 16. Permissions

**For now: any authenticated admin (passing `requireAdminAuth`) may manage products — no role distinction**, exactly matching the existing precedent for order-status updates (Milestone 63's own permissions section) and for the same reason: `AdminUser.role` (`ADMIN`/`STAFF`) exists in the schema but is not read or branched on anywhere in the codebase today. **Future, not implemented now:** `OWNER` could add/edit products; `STAFF` could be limited to stock updates and order viewing only. This would require extending the existing `UserRole` enum and adding real permission checks — a deliberate future decision, not assumed or partially built here.

## 17. Online Selling Safety

- Product changes must go through the future admin-authenticated APIs only — never a direct production database edit, once this feature exists (mirrors Section 2's "seed.ts is not a safe live-editing tool" finding and this project's broader "no more accepted direct-database workflows" trajectory).
- Every rule above must be validated server-side, never trusted from the client alone — the established discipline throughout this entire backend (order creation, admin auth, order-status transitions).
- **Do not edit product data directly in the production database** once the admin UI exists — the whole point of building it.
- **Do not run `seed.ts` against production** to update live products — confirmed as a real risk in Section 2, not a hypothetical one.
- **Do not delete products that have active or historical orders** — `OrderItem.productId` is already nullable-on-delete in spirit precisely so a product *can* eventually be removed from the catalogue without breaking historical orders (per the schema's own existing comment), but the safe mechanism for "remove from sale" is `ProductStatus.ARCHIVED`, not a hard delete, in the first version and likely indefinitely (Section 5).
- **Inactive products should disappear from the public shop but remain visible in admin** — this already partially works today: `product.service.ts`'s `VISIBLE_STATUSES` (`ACTIVE`, `OUT_OF_STOCK`) already excludes `DRAFT`/`ARCHIVED` from every public query; the admin product list (once built) should show all statuses, including `DRAFT`/`ARCHIVED`, so the owner can still find and manage them.
- **Existing carts may need graceful handling if price or stock changes** while a customer has an item in their cart — this project's cart is client-side (Local Storage, per `src/js/cart.js`), and checkout already re-verifies price and stock server-side at order-creation time (`order.service.ts`'s `verifyItems()`, which "never trusts a client-supplied price" and re-checks stock availability) — so a stale cart price/stock is already handled safely today by re-validation at checkout, not by anything product management needs to add. This existing behavior should be explicitly re-confirmed, not assumed unchanged, once product editing is live (Section 18's testing plan already includes "checkout still works").

## 18. Testing Plan (For The Future Implementation Milestones)

- Unauthenticated admin product routes return `401`.
- Create product validates required fields (`name`, `sku`, `categoryId`, `price`, `stockQuantity`).
- Duplicate SKU rejected with a clear error.
- Duplicate slug rejected with a clear error.
- Invalid price (zero, negative, non-numeric) rejected.
- Invalid stock (negative, non-integer) rejected.
- Editing a product only ever affects future display/orders — an existing order's `OrderItem` snapshot is unchanged after editing the same product's price/name/description.
- Marking a product `ARCHIVED`/`DRAFT` hides it from every public product list/detail query (`VISIBLE_STATUSES` still excludes it) while it remains visible/editable in the admin product list.
- Admin product pages redirect to `/admin/login` when logged out, matching every existing admin page's behavior.
- PayFast remains disabled throughout (regression check, same as every prior milestone).
- Checkout still works end-to-end after a product edit (regression check, per Section 17's cart/stale-price note).
- No `.env` file changed by any of this work.

## 19. Risks

- **Confusing "edit" with "safe to change retroactively."** The single biggest risk this plan guards against: every price/description/stock edit must only ever affect the live product going forward, never any existing `OrderItem` snapshot — already structurally guaranteed by the schema's existing snapshot design, but the implementation milestone must not accidentally introduce a code path (e.g., a careless join or a "sync existing orders" feature) that violates it.
- **SKU/slug edits look like normal field edits but aren't** — without deliberate friction (confirmation, or outright restriction), an admin could unintentionally break an external inventory reference (SKU) or a shared/indexed URL (slug) with what feels like a routine text-field change.
- **Reaching for `seed.ts` as a shortcut** for a live update remains an ongoing temptation until the real admin UI exists and is trusted — Section 2's finding should be treated as a standing warning for whoever operates this in the meantime, not just a one-time note.
- **Deferring audit history entirely** (rather than treating it as "soon, not now") risks repeating exactly the mistake this project already corrected for orders — Milestone 60's original order-status plan explicitly warned against shipping a write feature before its audit trail exists; the same warning applies here.
- **Image upload's absence in the first version** means the owner still cannot add a genuinely new product image without a code deploy until Milestones 68-69 ship — an acceptable, deliberate limitation for now, but worth being upfront with the owner about, since "add a product" without "add its picture" is only half the feature they ultimately want.

## 20. Recommended Next Milestones

1. **Milestone 65** — Product management planning (this milestone).
2. **Milestone 66** — Product management backend implementation: `GET/POST/PATCH /api/admin/products[...]` (Section 12), full server-side validation (Section 14), all behind `requireAdminAuth` — no delete, no image upload.
3. **Milestone 67** — Product management frontend implementation: `/admin/products[...]` pages (Section 13), reusing the existing admin table/card/badge patterns already proven since Milestone 59.
4. **Milestone 68** — Product image upload planning: concrete storage-provider decision, size/format rules, alt-text policy (Section 11) — planning only, same spirit as this milestone.
5. **Milestone 69** — Product image upload implementation.
6. **Milestone 70** — Product management polish and live safety test: a deliberately-approved first real create/edit test against production (mirroring the exact approval shape already used for Milestones 63-64's order-status tests), plus a review of whether `ProductChangeHistory` (Section 15) is ready to build next.

## 21. Safety Confirmation

- Only documentation was added — `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md`.
- No code files changed.
- No schema changed — `backend/prisma/schema.prisma` untouched.
- No migration created.
- No production data changed.
- No product data changed.
- No stock changed.
- No price changed.
- No admin product write route added.
- No product management button added anywhere.
- No PayFast changes.
- No checkout changes.
- No `.env` file changed.
- No credentials added.
- No test product created.
