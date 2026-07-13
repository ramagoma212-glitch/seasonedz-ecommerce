# Manual API Test Checklist

A quick regression checklist for manually testing the backend with
`curl` (or Postman/Insomnia) against a locally running dev server
(`npm run dev` from `backend/`, listening on `http://localhost:5000`
by default). No automated test framework exists yet — this is the
deliberate lightweight substitute (see `backend/README.md`).

Re-run this after any change to routes, validators, services, or
security middleware. Every item should already pass as of Milestone
14 — a failure means something regressed.

Tip: seed data is safe to reuse — the seed script (`npm run seed`) is
idempotent (upserts by slug), so re-seeding after a test run that
changed stock/created orders restores the original 6 categories / 10
products.

## Health

- [ ] `GET /api/health` → `200`, `data.service`/`data.version`/
      `data.environment`/`data.timestamp` present, no secrets.

## Products

- [ ] `GET /api/products` → `200`, `count: 10` on a freshly-seeded DB.
- [ ] `GET /api/products/featured`, `/best-sellers`, `/new-arrivals` →
      `200`, each a `{ products, count }` list.
- [ ] `GET /api/products/<a-real-seeded-slug>` → `200`, full product
      shape, **no `costPrice` field anywhere in the response**.
- [ ] `GET /api/products/not-a-real-product` → `404`, clean JSON.
- [ ] `GET /api/products?search=abc` → matches by name/description/
      category/tag/ageRange, case-insensitive.
- [ ] `GET /api/products?category=bible-colouring-books` → only that
      category's products.
- [ ] `GET /api/products?category=not-a-real-category` → `200`,
      `count: 0` (empty result, not an error).
- [ ] `GET /api/products?tag=not-a-real-tag` → `200`, `count: 0`.
- [ ] `GET /api/products?minPrice=0&maxPrice=100` → only products in
      range.
- [ ] `GET /api/products?minPrice=abc` → `400`,
      `errors: [{ field: "minPrice", ... }]`.
- [ ] `GET /api/products?minPrice=100&maxPrice=50` → `400`,
      `errors: [{ field: "maxPrice", ... }]`.
- [ ] `GET /api/products?minPrice=abc&maxPrice=xyz` → `400`, **both**
      errors present in the array.
- [ ] `GET /api/products?sort=price-asc` / `price-desc` / `rating` /
      `newest` / `name-asc` / `featured` → correct order each time.
- [ ] `GET /api/products?sort=not-a-real-sort` → `200`, falls back to
      `featured` (not an error).
- [ ] `GET /api/products?stock=in-stock` / `stock=out-of-stock` →
      correct filtering; unrecognised value → no filter applied.
- [ ] A `DRAFT` or `ARCHIVED` product (create one temporarily via a
      Prisma script if needed) never appears in list, search, or
      direct slug lookup — delete it again afterward.
- [ ] `GET /api/categories` → `200`, 6 categories, each with a
      `productCount`.
- [ ] `GET /api/categories/<real-slug>/products` → `200`, category +
      its products.
- [ ] `GET /api/categories/not-a-real-category/products` → `404`.

## Orders

- [ ] `POST /api/orders` with a **valid** body → `201`, correct
      `subtotal`/`deliveryFee`/`total`, `status: "PENDING"`,
      `paymentStatus: "PENDING"`, `payment`/`shipping` placeholders
      present, product `stockQuantity` decremented afterward
      (`GET /api/products/<slug>` before/after).
- [ ] `POST /api/orders` with `{}` → `400`, `errors` array lists every
      missing required field.
- [ ] Invalid `customer.email` → `400`, field-specific error.
- [ ] Invalid `customer.phone` → `400`, field-specific error.
- [ ] Invalid `deliveryAddress.province` (not one of the 9) → `400`.
- [ ] Invalid `deliveryAddress.postalCode` (not 4 digits) → `400`.
- [ ] Empty `items: []` → `400`.
- [ ] Two lines with the **same** `productSlug` → merged into one
      `OrderItem` with the summed quantity (not two separate lines).
- [ ] Unknown `productSlug` → `400`, no order created.
- [ ] `quantity: 0` or `quantity: 100` → `400` (must be 1-99).
- [ ] Quantity greater than the product's `stockQuantity` → `400`,
      message names the product and the actual stock left.
- [ ] Request includes a bogus `price`/`subtotal`/`total` →
      **ignored**; response totals are always the real database price.
- [ ] Invalid `paymentMethod` (not one of the 4 enum values) → `400`.
- [ ] Malformed JSON body (e.g. truncated) → `400`,
      `"Request body must be valid JSON."` (not `500`).
- [ ] `GET /api/orders/<real-order-number>` → `200`, full order,
      **no internal IDs, no `costPrice`**.
- [ ] `GET /api/orders/<real-order-number>/tracking` → `200`,
      `trackingSource: "backend-demo"`, correct current step.
- [ ] `GET /api/orders/not-real-order` → `404`.
- [ ] `GET /api/orders/not-real-order/tracking` → `404`.

## Enquiries

- [ ] `POST /api/enquiries` with a valid `CONTACT` body → `201`,
      `status: "NEW"`.
- [ ] Same for `SCHOOL`, `WHOLESALE` (with `companyName` +
      `estimatedQuantity`), and `DISTRIBUTOR` (with `companyName`).
- [ ] `POST /api/enquiries` with `{}` → `400`, `errors` lists `type`,
      `name`, `email`, `message`.
- [ ] Invalid `email` / invalid `phone` / invalid `type` → `400`,
      field-specific error.
- [ ] `WHOLESALE` missing `companyName` → `400`. `WHOLESALE` missing
      `estimatedQuantity` → `400` (test independently — each error
      alone, not just together).
- [ ] `DISTRIBUTOR` missing `companyName` → `400`.
- [ ] `estimatedQuantity: 0` (or negative, or non-integer) → `400`.
- [ ] `GET /api/enquiries/<real-id>/status` → `200`, only
      `id`/`type`/`status`/`createdAt`/`message` — **no `name`,
      `email`, `phone`, `companyName`, or the enquiry's own
      `message`.**
- [ ] `GET /api/enquiries/not-real-id/status` → `404`.
- [ ] 11 rapid `POST /api/enquiries` requests → the 11th returns `429`
      (separate 10/15min/IP counter from order creation — confirm a
      still-fresh order-creation request succeeds in the same window).
- [ ] Query the database directly afterward: enquiry rows exist with
      the expected fields, `estimatedQuantity` stored as a string
      (e.g. `"50"`), optional fields `null` when omitted.

## Security / Infrastructure

- [ ] Unknown route (e.g. `GET /api/nonexistent`) → `404`, clean JSON,
      not Express's default HTML error page.
- [ ] Response headers include Helmet's security headers (e.g.
      `X-Content-Type-Options`).
- [ ] Request with `Origin: http://localhost:5173` (or whatever
      `FRONTEND_URL` is set to) → response includes
      `Access-Control-Allow-Origin` for that origin.
- [ ] Request with an unrecognised `Origin` (e.g.
      `http://evil.example.com`) → response has **no**
      `Access-Control-Allow-Origin` header.
- [ ] 11 rapid `POST /api/orders` requests in one run → the 11th
      returns `429` with a clean JSON body (limit is 10/15min/IP; use
      cheap invalid-body requests so you don't create 10 real orders).
- [ ] Stop the dev server, temporarily rename/comment out
      `DATABASE_URL` in `.env`, restart → backend fails immediately
      with a clear "Missing required environment variable" message
      (never prints the actual value) — then restore `.env`.
- [ ] Throughout all of the above: no stack traces in any response, no
      environment/database values ever printed to the console or
      included in a response body.
