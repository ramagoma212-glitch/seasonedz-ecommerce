# Version 7, Milestone 70: Product Image Upload Frontend UI — Result

**Frontend UI implementation only. No Supabase configuration, no bucket, no successful image upload. One approved, non-mutating error-path test was run against a DRAFT test product — no data changed.**

Adds the admin-facing Product Images section to the product edit page, using the protected image routes already live from Milestone 69 (`GET/POST/PATCH /api/admin/products/:id/images`). No backend file was touched.

## UI Added

On `/admin/products/:id/edit` only (never on the create page, since a product needs an id before it can have images), below the existing product form:

- **Product Images** section heading.
- Current images, if any: a preview thumbnail, a "Main image" badge (reusing the existing `.admin-badge--success` style) when `isPrimary` is true, alt text (or "No alt text" in italics if empty), and sort order.
- **"No images uploaded yet for this product."** message when the product has no images — this is what both DRAFT test products currently show, since neither has ever had an image uploaded.
- An **Upload New Image** form: file input (`accept="image/jpeg,image/png,image/webp"`), a required alt text field, a Gallery/Main image radio choice (defaulting to Gallery), and the exact helper text requested: *"Allowed files: JPG, PNG or WebP, up to 5 MB. Product images are public once uploaded. Image upload uses Supabase Storage and must be configured first."*
- A **"Set as main"** button on every existing non-primary image (hidden on whichever image is already primary).
- An **"Edit alt text"** button on every existing image, which reveals an inline text field + Save/Cancel for that one image.

**No delete/remove button, no drag-and-drop, no bulk upload anywhere** — confirmed by direct code review of every new render function.

## API Client Functions Added

In `src/js/api/adminDashboardApi.js`:
- `getProductImages(productId)` — `GET /admin/products/:id/images`.
- `uploadProductImage(productId, file, altText, kind)` — builds a `FormData` (`image`, `altText`, optional `kind`) and `POST`s it.
- `updateProductImage(productId, imageId, payload)` — `PATCH /admin/products/:id/images/:imageId`.

All three use the existing `adminRequest()` wrapper (`adminApiClient.js`), so they get the same `credentials: "include"` cookie handling and `ApiError`/`ApiUnavailableError` shape as every other admin call.

**One necessary fix in the shared client**: `adminRequest()` previously always set `Content-Type: application/json` unconditionally, which would have corrupted a multipart upload (the browser must set its own `multipart/form-data; boundary=...` header, only when Content-Type is left unset). Fixed to detect a `FormData` body and skip the JSON header in that case, with a comment explaining why so this isn't accidentally "simplified" back to a bug later.

## Upload Not-Configured Handling

The backend's real message for this state — `"Product image upload is not configured."`, HTTP `503` — is technical and was explicitly called out as something the UI must not show verbatim. The upload handler (`app.js`) maps a `503` from this endpoint to: **"Image upload is not configured yet. Please finish Supabase Storage setup first."** Every other error status still shows its own appropriate message (`400`/`404` show the backend's own safe message; `401` redirects to login; anything else falls back to a single generic "Something went wrong" sentence) — the friendly override applies only to `503`.

**Confirmed working exactly as designed** in the live, approved test (see Testing Completed below).

## Current Images Display

Reads the product's images via the new `getProductImages(id)` call (fetched alongside the product and categories in the same `Promise.all` the edit page already used), independent of the images already embedded in the product-detail response — matching the milestone's explicit instruction to add this as its own API function.

## Main Image Display

An image with `isPrimary: true` shows a green "Main image" badge and never shows a "Set as main" button (there's nothing to set it to — it already is). Every other image shows "Set as main", wired to `updateProductImage(productId, imageId, { isPrimary: true })`.

## No Delete Confirmation

Confirmed via full code review of `adminProductForm.js` (the two new render functions) and `app.js` (the new event handlers) — no delete/remove button, no corresponding handler, no call to any delete-shaped endpoint (there isn't one — Milestone 69 never added a `DELETE` route either).

## Absolute URL Behaviour

Every image URL is passed through `withBase()` (`src/js/paths.js`) before being used as an `<img src>` — the same fix from Milestone 69 that makes relative static paths (`/images/product-N.jpg`) and absolute Supabase Storage URLs both resolve correctly, without needing any special-casing in this new code.

## Files Created

- `VERSION_7_PRODUCT_IMAGE_UPLOAD_FRONTEND_RESULT.md` — this document.

## Files Modified

- `src/pages/adminProductForm.js` — added `renderProductImageCard`, `renderImageUploadForm`, `renderProductImagesSection`; wired into `renderAdminProductEdit` via a third `getProductImages(id)` call in the existing `Promise.all`.
- `src/js/api/adminDashboardApi.js` — three new functions (see above).
- `src/js/api/adminApiClient.js` — `FormData`-aware `Content-Type` handling in `adminRequest()`.
- `src/js/app.js` — `setupAdminProductImages()` plus its handlers (`handleAdminImageUploadSubmit`, `handleAdminImageSetPrimary`, `handleAdminImageAltSubmit`), and the `friendlyAdminImageErrorMessage()` 503-translation helper.
- `src/css/pages.css` — new styles for the image cards, upload form, and section heading classes.

**`src/css/components.css` was not modified** — the existing `.admin-badge`/`.form-banner`/`.btn` classes already covered everything this UI needed.

## Testing Completed

| Check | Result |
|---|---|
| Backend build/lint/`prisma validate`/`migrate status` (regression — no backend file touched) | All pass, no schema drift |
| Frontend build | Passes, 85 modules |
| Unauthenticated `GET /api/admin/products/:id/images` | `401 "Authentication required."` |
| Unauthenticated `POST /api/admin/products/:id/images` | `401 "Authentication required."` |
| Unauthenticated `PATCH /api/admin/products/:id/images/:imageId` | `401 "Authentication required."` |
| Authenticated UI check (owner-performed, in browser, on `SG-ADMIN-UI-TEST-002`) | Product Images section appeared with "No images uploaded yet for this product.", the full Upload New Image form (file input, required alt text, Gallery/Main radio, exact helper text), and the Upload Image button. No delete button anywhere. |
| Approved optional error test (owner-performed) | Owner selected a real small JPG, entered alt text "Test image", left Gallery selected, and clicked Upload. Result: the exact expected banner appeared — *"Image upload is not configured yet. Please finish Supabase Storage setup first."* |
| Database state before vs. after the error test | Identical — `ProductImage` count 24 before and after; `SG-ADMIN-TEST-001` and `SG-ADMIN-UI-TEST-002` both still at 0 images |

## Why No Successful Upload Test Was Run

Supabase Storage is not configured (Milestone 69's own conclusion, unchanged here — `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` still unset, no bucket exists), so a real, successful upload is not possible yet regardless of approval. The one write-shaped test that *was* approved and run — clicking Upload while unconfigured — is the correct test to run *before* Supabase is set up, and it passed: the UI degrades gracefully with a clear, non-technical message, and no database row was created.

## Manual Setup Required Before Milestone 71

Unchanged from Milestone 69's own documented next steps:
1. Create the `product-images` bucket in the Supabase dashboard (public-read) — requires separate approval, not done by this milestone.
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` directly in Render's environment settings (never pasted into chat or any tracked file).
3. Optionally set `PRODUCT_IMAGES_BUCKET` only if a different bucket name is intentionally used.

Once both are done, **Milestone 71** — a single, explicitly-approved live upload test using a DRAFT test product — can finally exercise the actual Storage upload path this UI is built to talk to.
