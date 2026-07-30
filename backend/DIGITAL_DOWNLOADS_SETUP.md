# Digital Downloads Setup (Version 7, Milestone 152)

Secure digital product downloads — a `Product` can be `PHYSICAL` (the
existing behaviour, unchanged) or `DIGITAL` (a file customers download
after payment, no physical delivery). This document covers the one
required manual step and the environment variables involved.

## Required manual step: create the private Supabase Storage bucket

This backend never creates a Storage bucket itself — it must be created
once, manually, in the Supabase dashboard:

1. Open the Supabase project dashboard &rarr; Storage.
2. Create a new bucket named `digital-products` (or whatever value
   `DIGITAL_PRODUCTS_BUCKET` is set to — see below).
3. **Leave "Public bucket" turned OFF.** This is the single most
   important step — a public bucket would defeat the entire point of
   this feature (see "Why a separate, private bucket" below).
4. Set the bucket's own file size limit to **50 MB**, matching this
   backend's own `MAX_FILE_SIZE_BYTES` (see below) exactly — a file the
   backend accepts should never be able to fail the storage upload step
   on size alone.
5. No special RLS policies are required beyond the default (private)
   behaviour — every read/write to this bucket goes through the
   backend's own service-role client
   (`src/services/digitalAssetStorage.service.ts`), never a
   browser-facing anon key.

Until this bucket exists (or until `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` are set at all), every digital-asset
upload/download route responds with a clear "not configured" error —
every other route on the site is unaffected, exactly like the existing
product-image upload feature's own "not configured" behaviour.

## Why a separate, private bucket

The existing `product-images` bucket (`PRODUCT_IMAGES_BUCKET`,
`src/services/supabaseStorage.service.ts`) is deliberately **public** —
storefront product photos are meant to be freely viewable. Digital
product files are the opposite: they must never be reachable without
proof of payment. Reusing the same public bucket for both would risk a
purchased file becoming a permanent, guessable public URL. Keeping them
as two entirely separate services/buckets/env-var pairs makes that
separation structural, not just a runtime check that could be gotten
wrong later.

## Environment variables

| Variable | Required when | Notes |
|---|---|---|
| `SUPABASE_URL` | Already required for product images | Shared with the image-upload feature — same Supabase project, same service-role client pattern. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already required for product images | Never logged, never sent to the frontend. |
| `DIGITAL_PRODUCTS_BUCKET` | Optional | Defaults to `digital-products`. Only change this if you created the bucket under a different name. |

No new `*_ENABLED` flag exists for this feature — it uses the same
"configured or not" pattern as product image upload: the feature is
considered live the moment both Supabase variables are set and the
bucket exists, with no separate on/off switch to remember.

## How downloads actually work (for developers)

- `Product.productType` (`PHYSICAL` | `DIGITAL`, default `PHYSICAL`).
- `DigitalAsset` — one row per digital product (`productId` unique),
  storing `storageBucket`/`storagePath` (internal only, never exposed
  to any API response) plus safe display metadata (`displayName`,
  `mimeType`, `fileSizeBytes`, `pageCount`, `version`, `isActive`).
- `OrderItem.productType`/`digitalAssetId` are **snapshotted** at order
  creation time, same philosophy as `productName`/`unitPrice` — a
  historical order's digital-vs-physical composition and which exact
  file it entitles never depends on the live `Product`/`DigitalAsset`
  row still existing or being unchanged.
- Download access (`src/services/digitalDownload.service.ts`)
  re-verifies, on **every single request**: the order is genuinely
  `paymentStatus: PAID`, the requesting customer actually owns the
  order (or holds a valid, unexpired guest token), and the specific
  order item is a digital item with an active, download-enabled asset.
  Only then does it call
  `digitalAssetStorage.service.ts`'s `createSignedDownloadUrl()` — a
  **5-minute** signed URL, generated fresh every time, never cached or
  reused.
- Guest (no account) access uses a random, hashed, 7-day-expiring
  `GuestDownloadToken` — created once, right after a guest order's
  PayFast payment is confirmed PAID, and emailed as a one-time secure
  link (`/download/:token` on the frontend). The order number alone is
  never treated as permission to download anything.
- Courier Guy automatic booking (`autoBookCourierForPaidOrder()`) skips
  itself entirely for a digital-only order (every line item `DIGITAL`)
  — nothing to courier. A mixed order (at least one `PHYSICAL` item)
  still books exactly as before. The digital-only check itself is a
  small, pure, independently-exported function
  (`courierGuy.service.ts`'s `isDigitalOnlyOrder()`), specifically so
  it can be verified directly against controlled `OrderItem` rows
  without needing to enable any real Courier Guy config flag.
- Stock checks/decrements are skipped entirely for `DIGITAL` order
  items — there is no finite inventory to track for a downloadable file.
- **Version 7, Milestone 152B**: a digital-only order is never charged
  a delivery fee (R0, regardless of subtotal/registered status) — see
  `DELIVERY_SETUP.md`. A mixed order is still charged normally.

## Admin validation

A `DIGITAL` product cannot be set to `ACTIVE` status until it has an
active `DigitalAsset` row — enforced server-side
(`adminProduct.service.ts`'s `assertDigitalProductHasFileIfActive()`),
not just a frontend hint. Deleting a digital product's file is likewise
blocked while the product is `ACTIVE` — move it to `DRAFT`/`ARCHIVED`
first.

## Allowed file types and size

PDF and ZIP only (`application/pdf`, `application/zip`,
`application/x-zip-compressed`), validated by MIME type; a filename
ending in a known-dangerous extension (`.exe`, `.js`, `.html`, `.svg`,
`.bat`, `.cmd`, etc.) is rejected outright as a second, independent
check. Maximum file size: 50 MB (`adminDigitalAsset.service.ts`'s
`MAX_FILE_SIZE_BYTES`) — Milestone 153A: matches the real Supabase
`digital-products` bucket's own configured 50 MB limit exactly. Note
this is buffered fully in the Node process's memory during upload
(multer `memoryStorage()`, matching the existing product-image upload
pattern); revisit this limit if real uploads ever approach it on a
small hosting plan.
