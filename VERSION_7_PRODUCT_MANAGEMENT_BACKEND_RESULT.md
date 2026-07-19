# Version 7, Milestone 66: Product Management Backend — Result

**Backend implementation only. No production product was created or edited. No stock or price changed. No frontend, PayFast, checkout, schema, or seed file was touched.**

Implements the routes designed in `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` (Milestone 65).

## Routes Added

Mounted in the existing `backend/src/routes/adminDashboard.routes.ts`, all inheriting `requireAdminAuth` from the router-level guard proven since Milestone 59:

```
GET   /api/admin/products              — list, every status, paginated/filterable
GET   /api/admin/products/:id          — detail by id
POST  /api/admin/products              — create
PATCH /api/admin/products/:id          — edit
```

**No `PATCH /api/admin/products/:id/stock` was added.** Stock is already one of the fields editable through the general `PATCH /:id` route; a separate stock-only endpoint would have added surface area without a clear benefit for this milestone's scope — noted as available to reconsider later (e.g., if a stock-change note/history feature is ever built, per the plan's Section 15).

**No `DELETE` route exists anywhere** — confirmed by grep across every new/modified file. `ProductStatus.ARCHIVED` remains the only way to remove a product from sale, per the plan's Section 5.

**Route ordering note:** `/products/low-stock` (Milestone 59, a literal path) is registered *before* the new `/products/:id` (a wildcard) specifically so Express doesn't mistake a request for `/products/low-stock` as a request for product id `"low-stock"`. Verified directly — see Testing.

## Files Created

- `backend/src/services/adminProduct.service.ts` — all validation, slug/SKU handling, and the four database operations (list, get, create, update).
- `backend/src/controllers/adminProduct.controller.ts` — the four route handlers.

## Files Modified

- `backend/src/routes/adminDashboard.routes.ts` — route mounts and an updated file-level comment. **No other file was touched** — confirmed via `git add -A -n` (dry-run stage preview), which listed exactly these three files.

## Create Product Validation Summary

- `name` — required, trimmed, max 200 characters.
- `sku` — required, must be unique (checked before insert; a race is still caught by the database's own unique constraint and converted to `409`).
- `categoryId` — required, must reference an existing `Category` row.
- `price` — required, numeric, `> 0`.
- `oldPrice` — optional, numeric, `> 0` if supplied.
- `stockQuantity` — optional, defaults to `0`; if supplied, must be a non-negative integer.
- `lowStockThreshold` — optional, defaults to `5`; if supplied, must be a non-negative integer.
- `status` — optional, **defaults to `DRAFT`** (per the plan's Section 6 — "so nothing goes live accidentally before the admin is ready"); if supplied, must be a real `ProductStatus` value.
- `shortDescription`/`description`/`ageRange`/`discountLabel` — optional, trimmed, length-capped (200 chars for short fields, 5000 for `description`).
- `features` — optional; must be an array of trimmed, non-empty strings, each ≤200 characters, max 20 items — validated as exactly the flat bullet-list shape the existing seed data already uses, never trusted as arbitrary JSON.
- `isFeatured`/`isBestSeller`/`isNewArrival` — optional booleans, default `false`.
- Every text field is trimmed before validation and storage; nothing is ever rendered as HTML by this backend — that responsibility (escaping on display) stays with whichever future UI shows it, matching this project's existing `escapeHtml()` discipline everywhere else.
- **No image is created through this route** — `ProductImage` rows are entirely untouched by product creation; image upload remains deferred to Milestones 68-69.

## Edit Product Validation Summary

- Product must exist — `404` otherwise.
- **Only an explicit allow-list of 15 fields is ever accepted**: `name`, `shortDescription`, `description`, `price`, `oldPrice`, `stockQuantity`, `lowStockThreshold`, `status`, `categoryId`, `ageRange`, `features`, `discountLabel`, `isFeatured`, `isBestSeller`, `isNewArrival`. **Any other key present in the request body — including `id`, `createdAt`, `sku`, `slug`, `ratingAverage`, `reviewCount`, `costPrice`, or any typo/unknown field — is rejected with a `400` naming exactly which field(s) aren't allowed.** This is a runtime check, not just a comment: `Object.keys(input)` is compared against the allow-list before any field is processed.
- Each supplied field is validated with the same rules as create (price `>0`, stock/threshold non-negative integers, status a real enum value, `categoryId` must reference an existing category, text trimmed and length-capped, `features` validated as a bullet-list array).
- If `categoryId` is supplied, it's independently re-checked against the `Category` table (not just trusted from the request) before being applied.
- If no recognised field is present in the body at all, returns `400` ("No editable fields were provided") rather than silently succeeding with an empty update.
- **Never touches `OrderItem`** — confirmed by code inspection: no query in `updateProduct()` references `OrderItem` at all. Past orders' snapshotted `productName`/`productSlug`/`sku`/`unitPrice` remain exactly as they were, regardless of any product edit.

## Restricted Fields

`id`, `createdAt`, `updatedAt`, `sku`, `slug`, `ratingAverage`, `reviewCount`, `costPrice` — none of these appear in `ALLOWED_UPDATE_FIELDS`, so submitting any of them in a `PATCH` request is rejected with `400`, exactly matching `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` Section 7. `costPrice` is additionally never selected or returned by the detail/list queries at all — not just excluded from editing, excluded from the response entirely, matching the public API's own existing discipline (`product.service.ts`'s `toProductOutput` never includes it either) and the plan's explicit "if unsure, leave costPrice out" instruction.

## Slug and SKU Handling

**SKU:** required at creation, checked for uniqueness before insert; a duplicate returns `409` with a clear message. Never editable via `PATCH` (not in the allow-list).

**Slug — the two-path approach the task asked me to choose and document:**
- **If the admin explicitly supplies a slug**, a collision returns `409` — explicit input deserves clear, honest feedback, never a silent rewrite of what they typed.
- **If no slug is supplied**, one is generated from `name` (lowercased, non-alphanumeric runs collapsed to single hyphens, trimmed of leading/trailing hyphens) and, only in this auto-generated case, a collision is resolved automatically by appending a numeric suffix (`-2`, `-3`, ...), bounded to 50 attempts as a safety net against a pathological loop. This is friendlier for the common "just let it default" path while never silently altering anything the admin actually typed themselves.

Slug is never editable via `PATCH` in this first version, matching the plan's Section 10 ("existing-product slug changes should be restricted... changing a live product's slug changes its public URL").

## Stock and Price Safety

- Stock validated as a non-negative integer on both create and update — never allowed negative.
- Price validated as `> 0` on both create and update — never zero or negative.
- Both `price` and `oldPrice` are stored/read as Prisma `Decimal`, converted to plain numbers only at the API boundary (`.toNumber()`), matching the exact convention `product.service.ts`'s public `toProductOutput` already uses.
- Neither create nor update touches `OrderItem` — past order prices remain snapshotted and immune to any later product price change, exactly as the schema's own existing design already guarantees.
- The existing order-creation stock-decrement transaction (`order.service.ts`) is completely untouched by this milestone — an admin stock edit is a separate, direct write to the current on-hand count, never a re-implementation of or interference with that mechanism.

## Image Upload Deferral Confirmation

**Confirmed deferred.** No `ProductImage` create/update/delete logic exists anywhere in the new code. The detail response includes existing images as **read-only** URLs (`url`, `altText`, `isPrimary`, `sortOrder`) so a future edit UI can display what's already there, but nothing in this milestone can add, change, or remove an image row. Image upload remains planned for Milestones 68-69.

## What Was Not Implemented

- No frontend admin product pages or buttons — `src/` is entirely untouched (confirmed via the same dry-run stage preview).
- No `DELETE` route, no bulk update, no image upload.
- No `ProductChangeHistory`/audit trail for product edits — per the plan's Section 15, this remains a recommended near-term follow-up, not built here.
- No role-based permission distinction — any authenticated admin may use these routes, matching the existing precedent for order-status updates.
- No schema change — every field used already existed exactly as designed; no migration was created.

## Testing Completed

| Check | Result |
|---|---|
| Backend `npm run build` (`prisma generate && tsc`) | Pass |
| Backend `npm run lint` (`tsc --noEmit`) | Pass |
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| `npx prisma migrate status` | "Database schema is up to date!" — no schema change in this milestone |
| Unauthenticated `GET /api/admin/products` | `401` |
| Unauthenticated `GET /api/admin/products/:id` | `401` |
| Unauthenticated `POST /api/admin/products` | `401` |
| Unauthenticated `PATCH /api/admin/products/:id` | `401` |
| Unauthenticated `GET /api/admin/products/low-stock` (regression — route-ordering check) | `401`, correctly matched the literal route, not swallowed by the new `/:id` wildcard |
| Public `GET /api/products` (regression) | `200` |
| Public `GET /api/products/:slug` (regression) | `200` |
| Static check: no `DELETE` route/handler anywhere in the new or modified files | Confirmed via grep — none found |
| Static check: only the 3 expected files changed | Confirmed via `git add -A -n` dry-run — no frontend, PayFast, checkout, schema, or seed file touched |
| Database state before vs. after all testing | Identical — 10 products, 6 categories, every product's `price`/`stockQuantity`/`updatedAt` byte-for-byte unchanged |

## Why No Authenticated Product Write Test Was Run Yet

This milestone's task explicitly withheld approval for that: *"Do not run authenticated create or update against production data unless separately approved."* Testing was limited to what's safe without authentication (all four new routes correctly reject unauthenticated requests before touching any data — `requireAdminAuth` checks the session cookie before any database call, the same design already proven since Milestone 58) plus static code/route review. This mirrors exactly the same phased discipline used for Milestone 63's order-status backend: prove the code is correct and safe by construction and by unauthenticated-path testing first; a first authenticated create/update test against a deliberately chosen, explicitly approved case should be its own separate next step.

## Next Milestone Recommendation

Once the owner explicitly approves a first real authenticated test (e.g., creating one test product, or editing one field of an existing product, with the exact same approval shape already used for Milestones 63/64's order-status tests), that confirms the backend end-to-end. After that: Milestone 67 — product management frontend implementation (`/admin/products[...]` pages, per `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` Section 13), reusing the admin table/card/badge patterns already proven since Milestone 59.
