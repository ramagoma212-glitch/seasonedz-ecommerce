# Version 7, Milestone 68: Product Image Upload Planning

**Planning only. No code, schema, storage bucket, or product data was changed by this milestone.**

This document plans a safe product image upload system for admin product management, building on the product management backend (Milestone 66) and frontend (Milestone 67), both already live on `main`. It follows the same "plan first, implement later" discipline already used for email (`EMAIL_SETUP.md`) and PayFast (`PAYFAST_SETUP.md`, `VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`) in this project — nothing here is built or turned on by this milestone.

## 1. Current Image System — Findings

Reviewed directly against the live code (`backend/prisma/schema.prisma`, `backend/src/services/product.service.ts`, `backend/src/services/adminProduct.service.ts`, `src/js/api/mappers.js`, `src/js/paths.js`, `src/pages/adminProductForm.js`, `src/pages/adminProducts.js`) and the live database (24 `ProductImage` rows across the 10 real products).

- **`ProductImage` model already has everything a first version needs**: `id`, `productId` (FK, `onDelete: Cascade`), `url` (plain string — no blob/base64), `altText` (optional string, **currently always `null`** in the live data — never populated by the seed), `sortOrder` (`Int`, default `0`, already used correctly — e.g. product `SG-0001` has images at sortOrder 0/1/2), `isPrimary` (`Boolean`, default `false`, already used correctly — exactly one `true` per product in the sample checked), `createdAt`. **No schema change is needed for the plan below.**
- **Linking to `Product`**: `Product.images ProductImage[]`, standard one-to-many, cascade delete (deleting a product deletes its images — not touched by this milestone).
- **Current URLs are root-relative static paths**, e.g. `/images/product-1.jpg`, pointing at files in `public/images/` that Vite bundles into the frontend build and GitHub Pages serves. Confirmed both in the database (`ProductImage.url` values) and on disk (`public/images/product-1.jpg` exists, also present in `dist/images/` after build).
- **Public product pages** (`backend/src/services/product.service.ts`): every product query includes `images: { orderBy: { sortOrder: "asc" } }`; `getPrimaryImageUrl()` picks the row with `isPrimary: true`, falling back to `images[0]` if none is flagged primary; the API response exposes this as `image` (primary URL) and `gallery` (all URLs in `sortOrder`).
- **Admin product detail** (`backend/src/services/adminProduct.service.ts`, `getProductForAdmin`): already selects and returns `images: { url, altText, isPrimary, sortOrder }[]`, ordered by `sortOrder` — this is a **read-only** projection. `images` is not in `ALLOWED_UPDATE_FIELDS` for `updateProduct()`, and `createProduct()` never touches `ProductImage` at all — **there is currently no write path for images anywhere in the admin API**, confirmed by reading the full allow-list and the create/update service code.
- **Main image ordering**: exists (`sortOrder`, ascending), already correctly populated for all 10 real products.
- **Alt text**: the column exists but is unused — every existing row has `altText: null`. No accessibility text exists today for any product image.
- **Image status**: no per-image status field exists (no draft/pending/archived state on `ProductImage` itself — only the parent `Product.status` gates public visibility).
- **Static/GitHub paths today**: yes — every current image is a relative path resolved against the frontend's own Vite `BASE_URL` via `withBase()` (`src/js/paths.js`), used in `src/js/api/mappers.js` (`mapApiProductToFrontendShape`) to turn `/images/product-1.jpg` into `${BASE_URL}images/product-1.jpg`, which is what makes it resolve correctly under the GitHub Pages sub-path (`/seasonedz-ecommerce/...`).
- **Admin frontend today** (`adminProducts.js`, `adminProductForm.js`): displays **no image UI at all** — the create/edit form only shows a fixed note, *"Image upload is coming later. For now, product images are managed separately."* No existing image preview, no image list, nothing to build on top of yet.

### A concrete technical finding that matters for the next milestone

`withBase()` (`src/js/paths.js`) is:
```js
export function withBase(path) {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
```
This **unconditionally** prepends the GitHub Pages base path — it does not check whether `path` is already an absolute URL. A future Supabase Storage URL (e.g. `https://<project>.supabase.co/storage/v1/object/public/product-images/...`) passed through this function would be mangled into something like `/seasonedz-ecommerce/https://<project>.supabase.co/...`, which would 404. **This means `withBase()` and its one caller, `mapApiProductToFrontendShape()` in `src/js/api/mappers.js`, must be updated in the implementation milestone (69/70) to pass absolute URLs through unchanged** (e.g. `path.startsWith("http") ? path : withBase(path)`) while still resolving the existing relative static paths exactly as today. This is a real, non-obvious blocker to flag now so it isn't missed later — not something to fix in this documentation-only milestone.

## 2. Supabase Storage Fit — Recommendation

**Recommended: Supabase Storage**, unless a blocker surfaces during implementation (none found during this planning pass).

Reasoning:
- The project already runs its database on Supabase Postgres — one fewer vendor relationship, one fewer bill, one fewer set of credentials to manage, consistent with this project's general preference for minimal new surface area (e.g. Milestone 67 reused the existing public `/api/categories` endpoint rather than adding a new one).
- The backend (Render) is the only thing that would ever hold upload credentials — the plan below (Sections 4, 12, 14) keeps all uploads server-side. The frontend (GitHub Pages) never talks to Supabase directly and never sees a service role key.
- Public product images are, in general, not sensitive documents — a public bucket serving them directly by URL is standard practice for storefront product photography (Section 3 below explains this in more depth, and Section 15 covers the DRAFT-visibility nuance).
- Storing images as base64 in the database is explicitly avoided — `ProductImage.url` is already designed as a plain reference string, matching the existing schema and this project's own stated principle (`VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` Section 11: "never store raw base64 image data in the database").
- Committing uploaded images into the Git repository is avoided entirely — external storage exists specifically so the repo doesn't accumulate binary bloat, and so a new product photo doesn't require a code deploy (the exact limitation the current static-asset system has today, per `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` Section 11's own framing).

**Important gap found during this planning pass**: the backend currently only talks to Supabase via a raw Postgres connection string (`DATABASE_URL`/`DIRECT_URL`, used by Prisma) — there is **no** existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `@supabase/supabase-js` dependency anywhere in `backend/package.json` or `backend/src/config/env.ts` today. Wiring up Storage access is new integration work for Milestone 69, not something already half-built.

## 3. Storage Bucket Plan

- **Recommended bucket name**: `product-images`.
- **Recommended visibility: public bucket**, for the first version.
- **Why public**: product photos are meant to be seen by anyone browsing the storefront — that's their entire purpose. A public bucket lets the existing `<img src="...">` pattern keep working unchanged (no signed-URL refresh logic, no extra backend round-trip just to view an image), matches how the current static `/images/*` assets already behave (publicly reachable, unauthenticated), and keeps the implementation milestone simpler and lower-risk.
- **Risks of a public bucket**:
  - Anyone with a direct image URL can view that file, including images belonging to a `DRAFT` product that isn't listed anywhere publicly yet (Section 15 covers why this is an acceptable risk for ordinary product photography, not customer or business-sensitive data).
  - A public bucket requires disciplined **write** access control — "public" must mean public-read, private-write. Only the backend (using a service role key, never exposed to the browser) may upload, replace, or delete objects; the bucket's own storage policies must not grant public/anon insert or delete rights. This must be explicitly configured when the bucket is actually created (Milestone 69), not assumed by default.
  - If a private bucket + signed URLs is ever required later (e.g. for a hypothetical future non-product, sensitive image use case), that is a bigger, separate design — not recommended for product photography now.

## 4. Folder Structure Plan

Recommended path pattern, generated entirely from server-known safe values (product id, a timestamp, and a sanitized filename) — never from user-supplied names, emails, or other personal data:

```
products/{productId}/main/{timestamp}-{safe-file-name}.{ext}
products/{productId}/gallery/{timestamp}-{safe-file-name}.{ext}
```

- `{productId}` — the product's own database id (already a safe, non-guessable `cuid`, never a customer name or admin email).
- `{timestamp}` — a numeric upload timestamp (e.g. `Date.now()`), guarantees uniqueness and gives a natural chronological order without needing to read the file back.
- `{safe-file-name}` — the original filename's base, lowercased, spaces and unsafe characters stripped/replaced (e.g. via a slug-style transform), truncated to a reasonable length. The **admin's original filename is never trusted as-is** — no path separators, no `..`, no unicode tricks, no executable-looking extensions carried through.
- `{ext}` — derived from the validated MIME type (Section 5), not blindly copied from the uploaded filename's extension, so a file renamed to `photo.jpg` that is actually something else cannot smuggle a mismatched extension into storage.

Must avoid (confirmed against this plan): customer names, admin emails, secrets/tokens of any kind, and the raw original filename. None of the above pattern includes any of those.

## 5. Allowed File Rules

- **Allowed types**: `image/jpeg`, `image/png`, `image/webp` only.
- **Max file size**: 5 MB per file (within the 3–5 MB range asked for — 5 MB gives realistic phone-camera photos headroom while still being a firm, easy-to-communicate limit).
- **Max dimensions**: recommend a practical cap (e.g. 4000×4000px) primarily to reject obviously wrong/huge uploads early — not a hard requirement to enforce with complex logic in the first version; file-size limit does most of the real protective work.
- **Reject SVG** in the first version — SVG can embed scripts and is a known XSS vector if ever rendered inline or fetched in a context that executes it; not worth the risk for product photography, which doesn't need vector graphics.
- **Reject PDF and any non-image file** outright.
- **Rename files safely** per the path pattern in Section 4 — the admin's original filename is never used as the stored object key.
- **Validate both MIME type and extension on the backend** — never trust the browser's reported `Content-Type` alone; a lightweight server-side check (e.g. reading the file's magic bytes/signature, not just trusting the extension or header) is the safer approach and should be part of the Milestone 69 implementation, consistent with this project's existing "backend remains the final authority" discipline already established for every other product field (`VERSION_7_PRODUCT_MANAGEMENT_FRONTEND_RESULT.md`).

## 6. Image Processing Decision

**Recommended for the first version: accept optimized JPG/PNG/WebP as-is, enforced only by the file-size and MIME-type limits above.** No server-side resizing, compression, or format conversion in Milestone 69.

Reasoning: this project's established pattern (e.g. product management backend/frontend) has consistently favored the smallest safe first version over speculative complexity ("Don't add features... beyond what the task requires"). Real image processing (automatic WebP conversion, thumbnail generation, dimension normalization) is a legitimate future improvement but adds real complexity — a new processing dependency or step, more failure modes, more to test — that isn't required to ship a working, safe upload feature. A future milestone can add compression/conversion once the basic upload path has been live and stable.

## 7. Database Behaviour Plan

**Use the existing `ProductImage` table as-is — no schema change needed.** All fields the plan requires already exist:

| Field | Exists today? | Plan |
|---|---|---|
| `url` | Yes | Stores the full public Supabase Storage URL for the object (replacing today's relative static-asset paths for newly uploaded images only — Section 11). |
| `altText` | Yes (unused, always `null` today) | Should become a **required, non-empty field for new uploads** going forward (accessibility — matches the original plan's own flagged intent in `VERSION_7_PRODUCT_MANAGEMENT_PLAN.md` Section 11), even though it stays optional on the column itself so existing rows with `null` don't break anything. |
| `sortOrder` | Yes, already correctly used | New gallery images append at the next available `sortOrder`; reordering (Section 8) updates it. |
| `isPrimary`/main image | Yes, already correctly used | Exactly one `ProductImage` per product should have `isPrimary: true` at a time — enforced in application code (a transaction that flips the previous primary to `false` when a new one is set), not a database constraint, matching this project's existing style of enforcing business rules in the service layer (e.g. `ALLOWED_UPDATE_FIELDS`). |
| `productId` | Yes | Unchanged — FK to the product being edited. |
| `createdAt` | Yes | Unchanged — already auto-set. |

**No schema change, no migration, is proposed by this milestone or planned as necessary for Milestone 69's first version.**

## 8. Main Image and Gallery Rules

- Each product has **one main (primary) image** — `isPrimary: true` on exactly one `ProductImage` row.
- A product can have **multiple gallery images** — all other rows for that product, ordered by `sortOrder`.
- The admin explicitly **chooses** the main image (a "Set as main" action on any existing image).
- **If a product has no images yet, the first uploaded image automatically becomes the main image** — avoids a product ever having gallery images but no primary, which would otherwise require extra admin steps for the common case.
- **Reordering** gallery images (drag-and-drop or up/down controls) is possible later because `sortOrder` already exists — not required for the first implementation; explicitly deferred, matching Section 13.
- **Removing an image** needs care (see Section 10) — most importantly, removing the current main image must never silently leave a product with zero primary image while other images still exist; the service layer should promote the next image (e.g. lowest remaining `sortOrder`) to primary automatically if the removed image was the primary one.

## 9. Replace Image Behaviour Plan

Recommended order of operations, chosen specifically to avoid ever showing a broken image on the live storefront:

1. **Upload the new image first** (to Storage, under a new, unique path per Section 4 — never overwrite the old object in place).
2. **Create (or update) the `ProductImage` database record** pointing at the new URL.
3. **Confirm the new URL is reachable** (the upload step itself already implies this — the object exists in the bucket the moment the upload call succeeds).
4. **Only then** remove/archive the old image's database reference (and, per Section 10, optionally its storage object).

This ordering means there is never a window where the database points at an image that doesn't exist yet — the new image is always fully in place before the old reference is touched.

## 10. Delete Image Behaviour Plan

**Recommendation: do not add image deletion to the first implementation (Milestone 69).** It's the riskiest of the CRUD operations here — a wrong delete is unrecoverable for a re-uploaded file with no backup, and the task list for this milestone explicitly calls out being cautious about "actual storage deletion."

If/when delete is added in a later milestone, the safer order is:
1. **Soft-remove the database record first** (e.g. just detach/delete the `ProductImage` row — the product immediately stops referencing it, which is the part that actually matters for what customers see).
2. **Only delete the storage object after the database update succeeds** — if the database step fails, nothing in Storage is touched, so there's no orphaned reference to a deleted file.
3. Alternatively, **leave the now-unused storage object in place** for a later manual/scheduled cleanup pass, rather than deleting it synchronously in the same request — trades a small amount of unused storage for a strictly simpler, harder-to-get-wrong first version.

Until deletion is built, an admin who uploads a wrong image can still fix it via **replace** (Section 9), which is enough for the "safe DRAFT test product" workflow this project already uses.

## 11. Current Product Image Migration Plan

- **Do not migrate any of the 10 real products' existing static images now, or automatically as part of Milestone 69.** They currently work correctly and cost nothing to leave alone.
- **Keep existing static `/images/product-N.jpg` URLs working exactly as they do today** — the public product-service code and `withBase()`/`mappers.js` (once updated per Section 1's finding) must continue to resolve relative paths exactly as now, for any `ProductImage.url` that isn't already an absolute URL.
- **Allow the two systems to coexist**: some `ProductImage.url` values are relative static paths (existing products), others are absolute Supabase Storage URLs (newly uploaded images) — both resolve correctly once the `withBase()` fix (Section 1) ships, since it only needs to check whether the URL is already absolute.
- **Migrate real products' images later, one at a time, only if/when explicitly requested** — e.g. an admin re-uploading a nicer photo for a specific product via the new UI, not a bulk migration script. This avoids ever needing to touch all 10 real products' data at once for a purely cosmetic/infrastructure change.

## 12. Future Admin Backend Routes Plan

All future routes require `requireAdminAuth`, mounted the same way every other admin route already is — added to the existing `backend/src/routes/adminDashboard.routes.ts` router (which already applies `requireAdminAuth` once, at the router level, per its own existing comment), **not built or added by this milestone**:

```
POST   /api/admin/products/:id/images            — upload a new image (main or gallery)
GET    /api/admin/products/:id/images             — list a product's images
PATCH  /api/admin/products/:id/images/:imageId    — e.g. set as primary, update alt text
DELETE /api/admin/products/:id/images/:imageId    — (later milestone — see Section 10)
```

**First implementation (Milestone 69) should focus on**:
- `POST /api/admin/products/:id/images` — upload.
- `PATCH /api/admin/products/:id/images/:imageId` — set primary (and/or alt text).
- `GET /api/admin/products/:id/images` — list (may already be partially covered by the existing admin product detail response, which already returns `images[]` — Section 1).

Route-ordering note (this project's own established discipline, e.g. `/admin/products/low-stock` before `/admin/products/:id` today): any future literal-segment route must stay registered before a wildcard route of the same shape, so the new `/images` sub-routes need the same care once actually added.

**None of these routes are implemented by this milestone.**

## 13. Future Admin Frontend UI Plan

On the existing product edit page (`src/pages/adminProductForm.js`), replacing today's static "Image upload is coming later" note, a future version would add:
- Current image preview (main image + gallery thumbnails), reading the `images[]` array the admin API already returns today.
- An "Upload main image" control.
- An "Upload gallery image" control.
- A preview of the selected file **before** it's actually uploaded (standard `<input type="file">` + local preview, no new dependency needed).
- An alt text field per image.
- A "Set as main" button per gallery image.
- A "Remove image" button — **only once Section 10's delete plan is actually approved and built**, not in the first version.
- A clear, visible message near the upload controls: *"Images are public product images — do not upload private, confidential, or customer-identifying photos."*

**No drag-and-drop** is needed for the first version — plain file-picker inputs and simple buttons are sufficient and lower-risk. **None of this UI is built by this milestone.**

## 14. Security Plan

- Only an authenticated admin (existing `requireAdminAuth` session-cookie check) may upload, exactly like every other admin write today.
- Every upload goes **through the backend** — the browser never talks to Supabase Storage directly, so it never needs any Supabase credential at all.
- The **Supabase service role key must never be sent to, stored in, or exposed by the frontend** — it lives only in the backend's environment (Render), read via `backend/src/config/env.ts`, the same pattern already used for every other secret in this project (PayFast merchant key, admin session secret, etc.).
- File type and size are validated **on the backend**, not just the browser (Section 5) — client-side checks (if any are added to the future UI) are convenience only, never the actual enforcement.
- Filenames are sanitized server-side before being used in any storage path (Section 4).
- SVG is rejected in the first version (Section 5).
- Executable files, and anything not matching the allowed image MIME types, are rejected outright.
- No secrets, tokens, customer data, or admin identity ever appear in a storage path or filename.
- No sensitive tokens (session cookies, service role key, etc.) are ever logged.
- Error responses returned to the client never include stack traces or internal details — matching the existing pattern already used for every other admin error path (`VERSION_7_PRODUCT_MANAGEMENT_FRONTEND_RESULT.md`: "unexpected → generic safe message").

## 15. Public Visibility Plan

- `DRAFT` (and `ARCHIVED`) products **stay hidden from the public shop** exactly as they are today — this milestone changes nothing about `VISIBLE_STATUSES` or any public route.
- Because the recommended bucket is public (Section 3), a `DRAFT` product's uploaded images **could** be reached directly by someone who already has the exact image URL, even though the product itself never appears in any public listing, search result, or slug lookup.
- **This is an acceptable tradeoff for ordinary product photography** — a photo of a toy or product is not a private document, an unguessable Storage URL is not linked from anywhere public while the product is `DRAFT`, and this is the same practical model most e-commerce platforms use for unpublished/draft product images.
- **If stronger privacy is ever required** (e.g. a hypothetical future case involving genuinely sensitive images), the future-work option is a private bucket with time-limited signed URLs — explicitly **not** recommended for the first version, since it adds real complexity (URL expiry/refresh logic) for a risk level that doesn't apply to product catalog photography.

## 16. Testing Plan (Future — Milestone 69/71)

To be run once the feature is actually built, following this project's established non-mutating-first discipline:
- Unauthenticated upload attempt returns `401`.
- Invalid file type (e.g. `.pdf`, `.svg`) is rejected with a clear `400`.
- Oversized file (over the size limit) is rejected with a clear `400`.
- A valid image upload creates a `ProductImage` record with the expected fields.
- The uploaded image's URL actually loads (returns the image, not a 404/403).
- A `DRAFT` product's uploaded image remains unreachable from any public listing/search (though the direct URL itself may still resolve, per Section 15).
- An `ACTIVE` product's image displays correctly on its public product page.
- All existing static `/images/product-N.jpg` URLs still work, unchanged, after the feature ships (regression check).
- Replacing an image never results in a broken `<img>` on the product page at any point (Section 9's ordering).
- No product text, price, or stock value changes as a side effect of any image test.
- No PayFast configuration or behavior changes.
- No checkout behavior changes.
- No environment secrets (service role key, etc.) are ever exposed in a response, log, or error message.

**None of these tests are run by this milestone — there is no code yet to test.**

## 17. Required Environment Variables (Future — Not Added Now)

The backend currently has **no** Supabase Storage–specific environment variables at all — only `DATABASE_URL`/`DIRECT_URL` (a plain Postgres connection string used by Prisma), confirmed by reading `backend/.env.example` and `backend/src/config/env.ts` in full.

When Milestone 69 actually implements this, it will need (illustrative names, **not added by this milestone**, following the exact same "safety-switch + placeholder" convention this project already uses for `PAYFAST_ENABLED`/`EMAIL_ENABLED`):

- `SUPABASE_URL` — the project's Supabase API URL (this is safe to be public-ish, but still kept in env config, not hardcoded).
- `SUPABASE_SERVICE_ROLE_KEY` — required for the backend to upload/manage objects in a bucket with restricted write access. **This is a highly sensitive secret** — equivalent in sensitivity to a database admin password.
- Possibly a feature flag, e.g. `PRODUCT_IMAGE_UPLOAD_ENABLED=false`, mirroring `PAYFAST_ENABLED`'s pattern of shipping code that's inert until explicitly turned on in a real environment.

**Warnings for whoever adds these later**:
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend** — it must only ever be read by backend code running on Render, never bundled into any frontend build, never sent in any API response.
- **Never paste the real key into chat, a commit, or any tracked file** — same discipline already followed for every other credential in this project (PayFast merchant key, admin session secret, admin setup password).
- This milestone did **not** request, view, or record any real Supabase key — nothing of that kind was needed for a documentation-only pass, and nothing was exposed.

## 18. Risks

- **`withBase()` mismatch (Section 1)** — must be fixed in the implementation milestone or every new Supabase-hosted image URL will 404 on the live site. Flagged clearly here so it isn't missed.
- **Public bucket write-access misconfiguration** — if the bucket's storage policies aren't set correctly when actually created, an anonymous user could theoretically upload or delete objects; must be explicitly verified as part of Milestone 69, not assumed.
- **New dependency/integration surface** — no Supabase SDK or Storage API integration exists in this backend today; this is genuinely new code, not a small extension of something already working, so Milestone 69 should budget real testing time for it.
- **File validation bypass** — a malicious or malformed upload (spoofed MIME type, corrupted image, oversized file) must be caught server-side, not just client-side; this plan calls for the backend to be the final authority (Section 14), consistent with every other part of this admin system.
- **Orphaned storage objects** — the "leave unused files for later cleanup" option in Section 10 means Storage usage can grow slowly over time; acceptable for a first version, worth revisiting once real usage patterns are known.

## 19. Recommended Next Milestones

- **Milestone 68** — Product image upload planning *(this milestone)*.
- **Milestone 69** — Product image upload backend implementation (Storage integration, upload/list/set-primary routes, server-side validation, the `withBase()` fix).
- **Milestone 70** — Product image upload frontend implementation (admin UI on the product edit page).
- **Milestone 71** — Product image upload live test with a DRAFT product (following this project's established non-mutating-first, then one-explicitly-approved-write testing pattern).
- **Milestone 72** — Product management polish and live safety review.
- **Milestone 73** — Clean up or archive test products (`SG-ADMIN-TEST-001`, `SG-ADMIN-UI-TEST-002`).

## 20. Safety Confirmation

- Only documentation was added — this file, `VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md`.
- No code files changed.
- No schema changed.
- No migration created.
- No storage bucket created.
- No image uploaded.
- No product data changed.
- No product images changed.
- No orders changed.
- No payments changed.
- No PayFast changes.
- No checkout changes.
- No env files changed.
- No credentials added or viewed.
- No seed script run.
