# Version 7, Milestone 69: Product Image Upload Backend Implementation — Result

**Backend implementation only. No admin upload UI. No real product's images were changed. No successful upload was run against Supabase Storage — the feature is implemented but not yet configured (Phase A below).**

Implements the backend half of `VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md` (Milestone 68): admin-only image upload/list/set-primary routes for products, backed by Supabase Storage, with server-side validation and a safe "not configured" failure mode when the required environment variables aren't set yet.

## Phase A — Readiness Check (Before Any Code Was Written)

Checked directly against the live backend config and dependencies, without printing any secret value:

| Item | Status |
|---|---|
| `SUPABASE_URL` | **Missing** — not present in `backend/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Missing** — not present in `backend/.env` |
| Existing Supabase SDK (`@supabase/supabase-js`) | **Missing** — not previously a dependency |
| Existing storage client | **Missing** — the backend only ever talked to Supabase via `DATABASE_URL`/`DIRECT_URL` (a plain Postgres connection string, used by Prisma), never via the Supabase API/SDK |
| Existing upload middleware (`multer` or similar) | **Missing** — not previously a dependency |
| Bucket `product-images` | **Cannot be safely checked** — checking bucket existence requires calling the Supabase Storage API, which requires the same missing credentials; no bucket check was attempted |

**Conclusion**: nothing was pre-existing to build on. Per the milestone's own instruction, this did not stop the work — the code below is implemented so it's safe and inert when this configuration is missing, with a clear runtime error, and no Supabase bucket was created.

## Routes Added

All under the existing `router.use(requireAdminAuth)` in `backend/src/routes/adminDashboard.routes.ts` — no new router, no separate auth check needed, same discipline as every admin route since Milestone 58:

| Route | Purpose |
|---|---|
| `GET /api/admin/products/:id/images` | List a product's images (read-only) |
| `POST /api/admin/products/:id/images` | Upload a new image (multipart, field name `image`) |
| `PATCH /api/admin/products/:id/images/:imageId` | Set primary, and/or update `altText`/`sortOrder` |

**No `DELETE` route** — deliberately absent, per the plan's Section 10 recommendation and this milestone's explicit instruction.

No route-ordering conflict with the existing `GET/PATCH /api/admin/products/:id` — the new routes have one additional path segment (`/images`), so Express only matches them against a request that actually includes it.

## Files Created

- `backend/src/services/supabaseStorage.service.ts` — thin Supabase Storage helper: `isProductImageUploadConfigured()`, `uploadProductImage()`, `removeProductImageObjectBestEffort()`. Creates the Supabase client lazily (only on first real use, never at import time), so a backend with no Supabase config still starts and serves every other route normally.
- `backend/src/services/adminProductImage.service.ts` — all validation, safe-path generation, and the three operations (`listProductImages`, `uploadImageForProduct`, `updateProductImage`). Its own `AdminProductImageError` class, same pattern as `AdminProductError`/`OrderStatusUpdateError`.
- `backend/src/controllers/adminProductImage.controller.ts` — the three HTTP handlers, plus the `multer` memory-storage middleware (`uploadProductImageMiddleware`) and a shared error-mapping helper for `multer.MulterError`/`AdminProductImageError`/`ProductImageStorageError`.
- `VERSION_7_PRODUCT_IMAGE_UPLOAD_BACKEND_RESULT.md` — this document.

## Files Modified

- `backend/package.json` / `package-lock.json` — added `multer` (`^2.2.0`) and `@supabase/supabase-js` (`^2.110.7`) as dependencies, `@types/multer` as a dev dependency. Chose `multer` because it's the standard, widely-used Express multipart middleware with a simple memory-storage mode (no disk writes) and per-request file-count/size limits built in — no custom parsing needed. Chose the current major versions of both since this is new code with no legacy compatibility constraint.
- `backend/src/config/env.ts` — added `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both `getOptionalEnv`, never eagerly required — a deployment with neither set must keep starting normally) and `PRODUCT_IMAGES_BUCKET` (defaults to `"product-images"`). A startup warning logs only that these are missing, never any value.
- `backend/.env.example` — documents the three new variable names with placeholder (empty) values and comments, following the exact same convention already used for `PAYFAST_*`/`EMAIL_*`. No real values were added anywhere.
- `backend/src/routes/adminDashboard.routes.ts` — three new route registrations (see above).
- `src/js/paths.js` — `withBase()` fix (see below).

## Storage Approach

- **Client**: `@supabase/supabase-js`, constructed once (lazily) with the service role key, `persistSession`/`autoRefreshToken` both disabled (irrelevant for a server-only client).
- **Upload**: `supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: false })`, followed by `getPublicUrl(path)` to get the URL stored on the `ProductImage` row. `upsert: false` because every generated path already includes a timestamp — a collision would indicate a bug, not an expected overwrite.
- **Never on disk**: `multer.memoryStorage()` keeps the uploaded file entirely in memory as a `Buffer`; nothing is written to the server's local filesystem, even temporarily.

## Env Vars Needed (Not Added to Any Real Environment)

- `SUPABASE_URL` — the Supabase project's API URL.
- `SUPABASE_SERVICE_ROLE_KEY` — **highly sensitive**, equivalent to a database admin password. Never added to Render by me; the owner must add it directly in Render's environment settings when ready. Not pasted into chat, code, or any tracked file at any point in this milestone.
- `PRODUCT_IMAGES_BUCKET` — optional, defaults to `product-images`; only needs setting if a different bucket name is intentionally used.

**Nothing was added to Render, GitHub Actions secrets, or any real `.env` file.** `backend/.env.example` was updated with empty placeholders only, exactly like every other credential already documented there.

## Bucket Name

`product-images` (default, matches the plan). **No bucket was created** — this milestone does not call any bucket-creation API, and none was approved.

## File Validation

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp` — enforced server-side in `adminProductImage.service.ts`, independent of whatever `Content-Type` the browser claims for the multipart field.
- Max size: 5 MB, enforced twice — once by `multer`'s own `limits.fileSize` (rejects oversized uploads before the full body is even buffered) and again by an explicit service-layer check (defence in depth, and the source of the clean `400` message multer's own error doesn't give).
- Empty files (`size <= 0`) rejected.
- SVG, PDF, and any other non-allow-listed type rejected with a clear `400`.
- `altText` required, trimmed, non-empty, max 200 characters.
- `kind` optional, must be exactly `"main"` or `"gallery"` if provided.
- The file's extension is **never** taken from the original filename — it's derived only from the validated MIME type (`image/jpeg` → `.jpg`, etc.), so a mismatched or spoofed filename extension can't reach storage.

## Path Strategy

```
products/{productId}/main/{timestamp}-{safe-name}.{ext}
products/{productId}/gallery/{timestamp}-{safe-name}.{ext}
```

`{productId}` is the product's own database id (already a safe `cuid`). `{timestamp}` is `Date.now()`. `{safe-name}` is derived from the original filename — lowercased, non-alphanumeric characters collapsed to `-`, trimmed, capped at 60 characters, falling back to `"image"` if that leaves nothing. **No customer name, admin email, or secret ever appears in a path** — the only inputs are the product id and a sanitized fragment of the uploaded filename.

## Primary Image Behaviour

- A product's **first-ever** uploaded image automatically becomes primary, regardless of the requested `kind`.
- An explicit `kind: "main"` always makes the new image primary (and, in the same database transaction, unsets whichever image was previously primary for that product).
- `kind: "gallery"` (or omitted, once the product already has at least one image) never changes the existing primary.
- **Order of operations**: the file is uploaded to Storage *first*; the `ProductImage` row is only created after that succeeds. If the database write then fails, a best-effort cleanup attempts to remove the now-orphaned Storage object (wrapped so a cleanup failure never masks the real error) — matching the plan's Section 10 recommendation exactly.

## PATCH Image Behaviour

- Supports setting `isPrimary: true` (unsets any other primary for that product in the same transaction — attempting `isPrimary: false` directly is rejected with a clear `400`, since "not primary" only makes sense by making a different image primary), updating `altText`, and updating `sortOrder`.
- Validates the image actually belongs to the given product (`404` otherwise).
- **Never accepts a file upload** (no multer middleware on this route).
- **Never deletes** the storage object or the `ProductImage` row.
- Returns both the updated image and the product's full current image list, so a future UI can refresh its view from one response.

## Absolute URL Fix

`src/js/paths.js`'s `withBase()` previously prepended the GitHub Pages base path unconditionally, which would have mangled a real Supabase Storage URL (e.g. `/seasonedz-ecommerce/https://<project>.supabase.co/...`, a 404). Fixed to check for `http://`/`https://` and return those URLs unchanged; existing relative static paths (`/images/product-N.jpg`) resolve exactly as before. Verified with a full frontend build (85 modules, no errors) — this is the exact fix the planning milestone flagged as necessary before any real Supabase-hosted image could work.

## What Was Not Implemented

- No admin frontend upload UI (explicitly out of scope — Milestone 70).
- No `DELETE` image route (explicitly deferred — plan Section 10).
- No image compression/resizing/format conversion (explicitly deferred — plan Section 6).
- No Supabase bucket was created.
- No real product's images were uploaded, replaced, or changed.
- No gallery reordering UI or drag-and-drop (not requested for this backend-only milestone; `sortOrder` is settable via `PATCH` but nothing calls it yet outside tests).

## Testing Completed

All non-mutating, run against the local dev server (pointed at the same shared Supabase database) and, for the deeper validation cases, via direct service-layer calls (bypassing HTTP/auth only because those calls throw *before* any database write — verified by checking the `ProductImage` count for the test product before and after each call):

| Check | Result |
|---|---|
| `GET /api/admin/products/:id/images` unauthenticated | `401 "Authentication required."` |
| `POST /api/admin/products/:id/images` unauthenticated | `401 "Authentication required."` |
| `PATCH /api/admin/products/:id/images/:imageId` unauthenticated | `401 "Authentication required."` |
| Upload attempt with Supabase not configured (direct service call, real DRAFT test product id) | Threw `ProductImageStorageError`, `503`, `"Product image upload is not configured."` — image count unchanged (0 before, 0 after) |
| Missing `altText` | `AdminProductImageError`, `400`, `"altText is required."` |
| Disallowed MIME type (`image/svg+xml`) | `AdminProductImageError`, `400`, `"Unsupported image type..."` |
| Oversized file (6 MB, over the 5 MB limit) | `AdminProductImageError`, `400`, `"Image file is too large..."` |
| Empty file (0 bytes) | `AdminProductImageError`, `400`, `"Uploaded file is empty."` |
| Non-existent product id | `AdminProductImageError`, `404`, `"Product not found: ..."` |
| `listProductImages()` for the test product | Returned `[]` (correct — no images exist for it), read-only, no side effects |
| Backend build/lint/`prisma validate`/`migrate status` | All pass, no schema drift |
| Frontend build | Passes, 85 modules, no errors |

**No successful upload to real Supabase Storage was tested or run** — the feature is not yet configured (Phase A), and even once it is, this milestone's instructions are explicit that any real upload test — including against a DRAFT test product — requires separate, later approval.

## Upload Configuration Status

**Not configured.** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both unset in the current environment (local and, presumably, Render — not checked or touched there). The three new routes are fully implemented and protected by `requireAdminAuth`, but any authenticated request to them beyond a validation error will currently receive `503 "Product image upload is not configured."` until the owner adds real values.

### What the owner must do before this feature can actually upload anything

1. In the Supabase dashboard, create a bucket named `product-images` (public-read, per the plan's Section 3) — **not done by this milestone**, requires separate approval.
2. In Render's environment settings (not in any file in this repo), add:
   - `SUPABASE_URL` — the project's API URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — the service role key. **Add this directly in Render — never paste it into chat, a commit, or any tracked file.**
3. Optionally set `PRODUCT_IMAGES_BUCKET` only if a bucket name other than `product-images` is intentionally used.

## Next Milestone Recommendation

- **Milestone 70** — Product image upload frontend implementation (the admin UI on the product edit page, per the plan's Section 13), which can be built and locally tested against this backend even before Supabase is configured (it will simply see the same `503` this milestone's tests saw).
- Once both Supabase env vars and the bucket are in place (owner action, separately approved), **Milestone 71** — a single, explicitly-approved live upload test using a DRAFT test product, exactly as this project's established pattern requires for every other first real write.
