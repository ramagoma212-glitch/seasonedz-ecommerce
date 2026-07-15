# API Routes (Version 2, Milestones 12-17)

Product, Category, guest Order, and Enquiry API, backed by the real
Supabase database seeded in Milestone 11, hardened in Milestone 14.
**As of Milestone 16, the frontend calls this API locally** (with a
static-data fallback if the backend isn't running) — see
`../VERSION_2_INTEGRATION_NOTES.md`. Nothing is deployed anywhere yet
(Milestone 17 only prepared for that — see `DEPLOYMENT.md`). This
document is the reference for what the API returns today.

Base path for every route: `/api`.

## Response Envelope

Every response follows the same shape (`src/utils/apiResponse.ts`):

- Success: `{ "success": true, "message": string, "data": ... }`
- Error: `{ "success": false, "message": string, "errors"?: ... }`

### Validation error format

Every validation failure across the whole API — order body validation
and product query validation alike — uses the same `errors` shape, an
array of `{ field, message }`:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "customer.email", "message": "Please provide a valid email address." },
    { "field": "maxPrice", "message": "maxPrice must not be less than minPrice." }
  ]
}
```
HTTP status: `400`. All matching problems are reported together in one
response (e.g. two invalid query params, or every missing checkout
field) rather than one-at-a-time.

Product/order **business-rule** errors that aren't shape validation —
unknown product slug, insufficient stock, "not found" lookups — are
still a clean `400`/`404`, just as a single `message` with no `errors`
array (they're reported as soon as the first problem is found, since
there's nothing meaningful to report per-field).

### Other error statuses

| Status | Meaning | Example |
|---|---|---|
| `400` | Validation failure, business-rule failure (bad stock/price/product), or a malformed JSON body | Invalid email; insufficient stock; unparseable request body |
| `404` | Route, product or order not found | `GET /api/products/not-a-real-product` |
| `429` | Rate limit exceeded | See "Rate Limiting" below |
| `500` | Unexpected server error — message is generic in production, the real error in development | — |

A malformed JSON request body (e.g. truncated/invalid JSON) is caught
specifically and returns `400` with `{ "message": "Request body must
be valid JSON." }`, rather than falling through to a generic `500`.

## Security & Rate Limiting

- **Helmet** sets standard security headers on every response.
- **CORS** only allows explicitly configured origins — never a
  wildcard, in any environment. See "CORS" below.
- **Body size limit**: `express.json()`/`express.urlencoded()` both
  cap request bodies at `1mb`.
- **Rate limiting** (`express-rate-limit`, in-memory — resets on
  restart, not shared across multiple instances):
  - General limit on all of `/api`: **100 requests / 15 minutes / IP**.
  - Additional, stricter limit on `POST /api/orders`: **10 requests /
    15 minutes / IP** (stacks on top of the general limit).
  - Additional, separate limit on `POST /api/enquiries`: **10 requests
    / 15 minutes / IP** — its own counter, independent of the orders
    limit above, even though the numbers match.
  - Additional, separate limit on `POST /api/payments/payfast/initiate`
    (Version 3, Milestone 21): **10 requests / 15 minutes / IP** — its
    own counter, same reasoning as orders/enquiries.
  - Exceeding any of these returns a clean `429`:
    `{ "success": false, "message": "Too many requests. Please try again later." }`.
- **Environment variables are validated at startup** — `DATABASE_URL`,
  `DIRECT_URL` and `FRONTEND_URL` are all required; the backend fails
  immediately with a clear error naming the missing variable (never
  its value) rather than starting in a broken or insecure state. See
  `src/config/env.ts` and README.md's "Environment Variables" section.
- **No secrets are ever included in a response or a log line** — error
  logging (development only) prints the error object, never `env`/
  `process.env` values.
- **`costPrice` is never returned by any route** — every product/order
  output is built field-by-field (never a raw spread of the Prisma
  row), so an internal-only column can't leak just because it exists
  on the model.

## CORS

Allowed origins come from two environment variables (`src/config/
env.ts`):

| Variable | Required | Purpose |
|---|---|---|
| `FRONTEND_URL` | Always | The primary allowed origin (local dev server, or the deployed frontend in production) |
| `FRONTEND_PRODUCTION_URL` | Optional | A second allowed origin — e.g. the deployed GitHub Pages URL, so both a local dev frontend and the live site can call this API at once |

Any request whose `Origin` header isn't one of these is not blocked
outright at the server (a non-browser client can always set any Origin
header — CORS can't stop that), but the response is sent **without**
an `Access-Control-Allow-Origin` header, so a real browser refuses to
let that origin's JavaScript read it. There is no wildcard fallback in
any environment. Requests with no `Origin` header at all (curl,
server-to-server calls, health checks) are always allowed — CORS only
ever governs what a browser page is allowed to read.

In production, `FRONTEND_URL` has no built-in default — it must be set
explicitly to the real deployed frontend origin, or the backend fails
to start.

## Health

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Status check — service name, version, environment, timestamp |

Example response:

```json
{
  "success": true,
  "message": "Seasonedz API is running",
  "data": {
    "service": "seasonedz-backend",
    "version": "0.1.0",
    "environment": "development",
    "timestamp": "2026-07-13T00:47:35.219Z"
  }
}
```
Never includes `DATABASE_URL`, `DIRECT_URL`, or any other secret.

## Product Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/products` | List products, with search/filter/sort support |
| GET | `/api/products/featured` | Products with `isFeatured: true` |
| GET | `/api/products/best-sellers` | Products with `isBestSeller: true` |
| GET | `/api/products/new-arrivals` | Products with `isNewArrival: true` |
| GET | `/api/products/:slug` | A single product by slug |

All read-only — there are no create/update/delete product routes in
this milestone. Admin product management is a future milestone.

### GET /api/products — Query Parameters

| Parameter | Type | Behaviour |
|---|---|---|
| `search` | string | Matches (case-insensitive) against product name, shortDescription, description, category name, tag names, and ageRange |
| `category` | string (slug) | Only products in that category |
| `minPrice` | number | Only products priced at or above this value |
| `maxPrice` | number | Only products priced at or below this value |
| `ageRange` | string | Case-insensitive substring match against the product's ageRange (e.g. `3-8`) |
| `stock` | `in-stock` \| `out-of-stock` | See "Stock Filter Behaviour" below |
| `tag` | string (slug) | Only products with that tag |
| `sort` | see below | Defaults to `featured` |

**Invalid values:** a non-numeric or negative `minPrice`/`maxPrice`
returns a `400` using the standard validation error shape (see
"Validation error format" above) — a value that specific deserves an
explicit error rather than being silently dropped, e.g.:

```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "minPrice", "message": "minPrice must be a non-negative number" }] }
```

If both `minPrice` and `maxPrice` are invalid, both errors come back
in the same `errors` array. If both are validly-formed numbers but
`minPrice > maxPrice`, that's also a `400` (`field: "maxPrice"`). An
unrecognised `sort` or `stock` value is **not** an error — it's
treated as if the parameter
were omitted, since a typo'd sort/stock value still produces a
perfectly valid product list.

### Supported `sort` values

| Value | Order |
|---|---|
| `featured` (default) | Featured products first, then newest first |
| `price-asc` | Price, low to high |
| `price-desc` | Price, high to low |
| `rating` | Highest `ratingAverage` first (ties broken by `reviewCount`) |
| `newest` | Most recently created first |
| `name-asc` | Alphabetical by name |

### Stock Filter Behaviour

The product endpoints **never** return `DRAFT` or `ARCHIVED` products,
under any filter combination.

- No `stock` param (default): only `ACTIVE` products.
- `stock=in-stock`: `ACTIVE` products with `stockQuantity > 0`.
- `stock=out-of-stock`: products that are either status
  `OUT_OF_STOCK`, or `ACTIVE` with `stockQuantity <= 0`.

A product's individual page (`GET /api/products/:slug`) is a little
more permissive than the list default: it will still return a product
whose status is `OUT_OF_STOCK` (so a product page doesn't 404 just
because it's temporarily unavailable), but never `DRAFT` or
`ARCHIVED`.

### Examples

```
GET /api/products?search=abc
GET /api/products?category=bible-colouring-books
GET /api/products?minPrice=0&maxPrice=100
GET /api/products?tag=faith
GET /api/products?sort=price-asc
GET /api/products?stock=in-stock
```

### Example response — GET /api/products/abc-colouring-book-for-kids-with-fun-facts

```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "id": "cmrig90wv0007ln789bfnno93",
    "name": "ABC Colouring Book for Kids with Fun Facts",
    "slug": "abc-colouring-book-for-kids-with-fun-facts",
    "sku": "SG-0001",
    "category": { "id": "cmrig8stc...", "name": "Kids Colouring Books", "slug": "kids-colouring-books" },
    "price": 149,
    "oldPrice": null,
    "stockQuantity": 50,
    "stockStatus": "In Stock",
    "image": "/images/product-1.jpg",
    "gallery": ["/images/product-1.jpg", "/images/product-2.jpg", "/images/product-6.jpg"],
    "shortDescription": "A colourful A-Z colouring book packed with fun facts for little learners.",
    "description": "Help your child learn their ABCs while having fun...",
    "features": ["40 pages of colouring fun", "A fun fact printed on every page", "..."],
    "ageRange": "3-8 years",
    "tags": ["kids", "educational", "alphabet", "colouring book"],
    "ratingAverage": 4.8,
    "reviewCount": 36,
    "isFeatured": true,
    "isBestSeller": true,
    "isNewArrival": false,
    "discountLabel": null,
    "createdAt": "2026-07-12T23:53:39.292Z",
    "updatedAt": "2026-07-12T23:53:39.292Z"
  }
}
```

Notes on this shape:

- **Decimal fields (`price`, `oldPrice`, `ratingAverage`) are always
  serialized as JavaScript numbers, never strings.** This matches the
  frontend's existing static product data shape and is safe at ZAR
  currency scale. If this ever needs arbitrary precision, it should
  change to strings — pick one, don't mix.
- `costPrice` (internal, from the Prisma schema) is **never** included
  in any API response — the output is built field-by-field, not via
  spreading the Prisma row, specifically so an internal-only column
  can never leak just because it exists on the model.
- `tags` is an array of tag name strings (not slugs, not objects), and
  `category` is a small `{ id, name, slug }` object.
- `createdAt`/`updatedAt` are ISO 8601 strings (Express serializes
  `Date` that way automatically).

### Example response — GET /api/products/not-a-real-product

```json
{
  "success": false,
  "message": "Product not found: not-a-real-product"
}
```
HTTP status: `404`.

### List response shape — GET /api/products

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [ /* ProductOutput[] */ ],
    "count": 10,
    "filters": {
      "search": null, "category": null, "minPrice": null,
      "maxPrice": null, "ageRange": null, "tag": null, "stock": null
    },
    "sort": "featured"
  }
}
```

`GET /api/products/featured`, `/best-sellers` and `/new-arrivals` use
the simpler `{ products, count }` shape — they take no filters, so
there's no `filters`/`sort` to echo back.

## Category Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/categories` | List active categories, each with a product count |
| GET | `/api/categories/:slug/products` | A category plus its active products |

### Category output shape

```json
{
  "id": "cmrig8stc0000ln7804zl664m",
  "name": "Kids Colouring Books",
  "slug": "kids-colouring-books",
  "description": "Fun, educational colouring books for young learners.",
  "imageUrl": "/images/product-1.jpg",
  "productCount": 1,
  "isActive": true,
  "sortOrder": 0
}
```

`productCount` always counts `ACTIVE` products only — it answers "how
many products would a customer see in this category right now",
matching the product list endpoints' default behaviour.

### Example response — GET /api/categories/not-a-real-category/products

```json
{ "success": false, "message": "Category not found: not-a-real-category" }
```
HTTP status: `404`.

## Order Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/orders` | Create a guest order |
| GET | `/api/orders/:orderNumber` | Look up an order by its order number |
| GET | `/api/orders/:orderNumber/tracking` | A lighter-weight tracking view of an order |

Guest checkout only — there's no login, so any request with a valid
body can create an order (the same trust model as the frontend's demo
checkout, just server-side now). There are no admin order-list routes
and no authenticated customer order-history routes yet.

**The backend never trusts a price, subtotal, delivery fee or total
sent by the client.** Every item is re-looked-up by `productSlug` and
re-priced from `Product.price` in the database; any `price`,
`subtotal`, `deliveryFee` or `total` field present in the request body
is simply never read.

### POST /api/orders — Request Body

```json
{
  "customer": {
    "firstName": "Rolivhuwa",
    "lastName": "Nedzamba",
    "email": "customer@example.com",
    "phone": "0712345678"
  },
  "deliveryAddress": {
    "streetAddress": "123 Example Street",
    "suburb": "Pretoria West",
    "city": "Pretoria",
    "province": "Gauteng",
    "postalCode": "0183",
    "country": "South Africa",
    "deliveryNotes": "Optional note"
  },
  "paymentMethod": "BANK_TRANSFER",
  "items": [
    { "productSlug": "abc-colouring-book-for-kids-with-fun-facts", "quantity": 2 }
  ]
}
```

`paymentMethod` must be one of the schema's `PaymentMethod` values:
`BANK_TRANSFER`, `PAYFAST`, `CASH_ON_DELIVERY`, `MANUAL`. **`PAYFAST`
is only accepted if the backend has `PAYFAST_ENABLED=true`** (Version
3, Milestone 20) — otherwise it's rejected with a clean `400`:
`"PayFast payments are not available yet. Please choose another
payment method."` This exists so an order can never be created with
`paymentMethod: PAYFAST` that nothing can ever resolve. Once an order
is created with `paymentMethod: PAYFAST`, see "Payment Routes" below
for how to actually prepare a PayFast payment for it.

`deliveryAddress.province` must be one of: Eastern Cape, Free State,
Gauteng, KwaZulu Natal, Limpopo, Mpumalanga, Northern Cape, North
West, Western Cape.

`items[].quantity` must be a whole number from 1 to 99. Two lines for
the same `productSlug` are merged (summed) before the stock check, so
they can't individually pass a stock check that their combined
quantity would fail.

### Validation error example

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "customer.email", "message": "Please provide a valid email address." },
    { "field": "deliveryAddress.postalCode", "message": "Postal code must be 4 digits." }
  ]
}
```
HTTP status: `400`.

### Stock / product error example

Product-level problems (not found, not `ACTIVE`, out of stock, or
requested quantity exceeds `stockQuantity`) are also a clean `400`,
just not part of the `errors` array above (they're reported as soon as
the first bad item is found, rather than validated field-by-field):

```json
{ "success": false, "message": "Only 4 of \"Little Hands Big Faith New Testament Bible Colouring Book\" left in stock (requested 10)." }
```

### Success response — POST /api/orders

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderNumber": "SG-2026-EXAT",
    "order": {
      "orderNumber": "SG-2026-EXAT",
      "createdAt": "2026-07-13T00:29:33.170Z",
      "customer": { "firstName": "Rolivhuwa", "lastName": "Nedzamba", "email": "customer@example.com", "phone": "0712345678" },
      "deliveryAddress": { "streetAddress": "123 Example Street", "suburb": "Pretoria West", "city": "Pretoria", "province": "Gauteng", "postalCode": "0183", "country": "South Africa", "deliveryNotes": "Optional note" },
      "status": "PENDING",
      "paymentStatus": "PENDING",
      "fulfilmentStatus": "NOT_STARTED",
      "paymentMethod": "BANK_TRANSFER",
      "items": [
        { "productSlug": "abc-colouring-book-for-kids-with-fun-facts", "productName": "ABC Colouring Book for Kids with Fun Facts", "sku": "SG-0001", "quantity": 2, "unitPrice": 149, "lineTotal": 298 }
      ],
      "subtotal": 298,
      "deliveryFee": 80,
      "discountTotal": 0,
      "total": 378,
      "payment": { "method": "BANK_TRANSFER", "status": "PENDING", "amount": 378, "provider": null, "paidAt": null },
      "shipping": { "status": "NOT_STARTED", "courierName": null, "trackingNumber": null, "trackingUrl": null, "estimatedDelivery": null, "shippedAt": null, "deliveredAt": null }
    }
  }
}
```
HTTP status: `201`.

`GET /api/orders/:orderNumber` returns the same `order` shape directly
as `data` (no `orderNumber` wrapper). No internal IDs (order/
customer/product/payment/shipping IDs) and no `costPrice` are ever
included — the same convention as the Product API (Milestone 12).

**Design decisions, documented as required:**

- **`Order.status` starts at `PENDING`, not `CONFIRMED`.**
  `paymentStatus` also starts `PENDING` — nothing has actually
  confirmed payment yet (there's no real PayFast/bank reconciliation),
  so it would be misleading to mark the order itself `CONFIRMED`
  automatically. A staff member (or, once real payment integration
  exists, a payment webhook) is what should move it to `CONFIRMED`.
- **Delivery fee rule** (`src/utils/money.ts`): flat R80, free at a
  subtotal of R700 or more — the same rule as the frontend's demo cart
  (`src/js/cart.js`). Comment in the code notes a real courier API
  will replace this later.
- **Stock is decremented inside the same database transaction that
  creates the order**, using an atomic `UPDATE ... WHERE stockQuantity
  >= quantity` guard per item — if any item's stock is insufficient at
  write time, the whole transaction (order, items, payment, shipping,
  every stock decrement) rolls back and no order is created.
- All monetary math (subtotal, delivery fee, total) uses Prisma's
  `Decimal` type throughout, only converting to a JS number at the
  very end for the API response — consistent with the Product API's
  documented Decimal-as-number convention.

### GET /api/orders/:orderNumber/tracking

```json
{
  "success": true,
  "message": "Order tracking retrieved successfully",
  "data": {
    "orderNumber": "SG-2026-EXAT",
    "createdAt": "2026-07-13T00:29:33.170Z",
    "status": "PENDING",
    "paymentStatus": "PENDING",
    "fulfilmentStatus": "NOT_STARTED",
    "shippingStatus": "NOT_STARTED",
    "deliveryCity": "Pretoria",
    "deliveryProvince": "Gauteng",
    "trackingSteps": [
      { "key": "order-placed", "label": "Order Placed", "isComplete": false, "isCurrent": true, "isPending": false },
      { "key": "order-confirmed", "label": "Order Confirmed", "isComplete": false, "isCurrent": false, "isPending": true },
      { "key": "preparing-order", "label": "Preparing Your Order", "isComplete": false, "isCurrent": false, "isPending": true },
      { "key": "ready-for-delivery", "label": "Ready for Delivery", "isComplete": false, "isCurrent": false, "isPending": true },
      { "key": "out-for-delivery", "label": "Out for Delivery", "isComplete": false, "isCurrent": false, "isPending": true },
      { "key": "delivered", "label": "Delivered", "isComplete": false, "isCurrent": false, "isPending": true }
    ],
    "trackingSource": "backend-demo"
  }
}
```

`trackingSteps` mirrors the frontend's existing demo tracking stepper
(`src/js/orders.js`), mapped from the real backend `OrderStatus` enum.
`CANCELLED`/`REFUNDED` orders aren't part of this 6-step progression —
every step comes back `isPending: true` and the top-level `status`
field communicates the real state instead. **`trackingSource` is
always `"backend-demo"`: there is no real courier tracking yet** —
this whole response is derived from `Order`/`Shipping` rows this
backend itself set, never a live courier API.

### GET /api/orders/not-real-order and /api/orders/not-real-order/tracking

```json
{ "success": false, "message": "Order not found: not-real-order" }
```
HTTP status: `404`.

## Payment Routes (Version 3, Milestone 21)

| Method | Route | Description |
|---|---|---|
| POST | `/api/payments/payfast/initiate` | Prepare a PayFast sandbox/production payment for an existing `PAYFAST` order |

**Preparation only — no payment is actually taken by this route, and
no order is ever marked as paid here.** It looks up an existing order,
checks it's eligible, and returns the exact form fields (+ signature) a
frontend needs to `POST` the customer's browser to PayFast. Marking an
order as paid only ever happens later, via a verified PayFast ITN
(Instant Transaction Notification) — not built yet (see
`../VERSION_3_PAYMENT_READINESS_AUDIT.md`).

**Requires `PAYFAST_ENABLED=true`** (see `PAYFAST_SETUP.md`) — if
PayFast isn't enabled, every call to this route returns a clean `503`:

```json
{ "success": false, "message": "PayFast payments are not enabled." }
```

### POST /api/payments/payfast/initiate — Request Body

```json
{ "orderNumber": "SG-2026-A1B2" }
```

`orderNumber` is required and must match the Seasonedz order number
format (`SG-YYYY-XXXX`, case-insensitive — normalised to uppercase).
An invalid shape returns a `400` in the usual `errors` array shape; an
`orderNumber` that doesn't exist returns a `404`.

### Order eligibility checks

Before preparing a payment, the order must satisfy all of:

- The order exists.
- `order.paymentMethod` is `PAYFAST` (an order created with
  `BANK_TRANSFER`, `CASH_ON_DELIVERY`, or `MANUAL` is rejected with a
  clean `400` — PayFast is never initiated for a different payment
  method).
- `order.status` is not `CANCELLED` or `REFUNDED`.
- `order.paymentStatus` is `PENDING` (an order already paid/failed/
  refunded can't be re-initiated).
- `order.total` is greater than zero.

Any failed check returns a clean `400` (or `404` if the order doesn't
exist) with a single `message`, the same convention as the order
business-rule errors above.

### Success response — POST /api/payments/payfast/initiate

```json
{
  "success": true,
  "message": "PayFast payment prepared successfully",
  "data": {
    "processUrl": "https://sandbox.payfast.co.za/eng/process",
    "method": "POST",
    "fields": {
      "merchant_id": "10000100",
      "merchant_key": "46f0cd694581a",
      "return_url": "https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/payment-success",
      "cancel_url": "https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/payment-cancelled",
      "notify_url": "https://seasonedz-ecommerce.onrender.com/api/payments/payfast/notify",
      "name_first": "Rolivhuwa",
      "name_last": "Nedzamba",
      "email_address": "customer@example.com",
      "cell_number": "0712345678",
      "m_payment_id": "SG-2026-A1B2",
      "amount": "378.00",
      "item_name": "Seasonedz Group Order SG-2026-A1B2",
      "item_description": "2 item(s) — Seasonedz Group order SG-2026-A1B2",
      "signature": "5f4dcc3b5aa765d61d8327deb882cf99"
    }
  }
}
```

(`merchant_id`/`merchant_key` above are PayFast's own publicly
documented generic sandbox test values, shown only as a shape example
— never real credentials.) The frontend's job (later milestone) is to
build a plain HTML `<form method="POST" action="{processUrl}">` with
one hidden input per `fields` entry and submit it, redirecting the
customer's browser to PayFast. **`paymentStatus` stays `PENDING`** —
this route never changes it, and stock is not touched again (it was
already decremented once, at order creation).

### Failure examples

```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "orderNumber", "message": "Order number is required." }] }
```
```json
{ "success": false, "message": "Order not found: SG-2026-ZZZZ" }
```
```json
{ "success": false, "message": "This order was not created for PayFast payment." }
```
HTTP status: `400` for validation/business-rule failures, `404` if the
order doesn't exist, `503` if `PAYFAST_ENABLED` is not `true`.

## Enquiry Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/enquiries` | Submit an enquiry |
| GET | `/api/enquiries/:id/status` | A safe, limited status lookup for one enquiry |

This backs all four frontend demo forms — Contact, Schools, Wholesale,
Distributor — via one `Enquiry` model, distinguished by `type`. **This
is not an admin dashboard.** There is no list-all-enquiries route and
no way to publicly browse enquiries; `GET /:id/status` only ever
returns the narrow, non-identifying shape documented below, never the
full enquiry.

`POST /api/enquiries` has its own rate limit, separate from
`POST /api/orders`'s: **10 requests / 15 minutes / IP** (on top of the
general 100/15min limit on all of `/api` — see "Security & Rate
Limiting" above).

### POST /api/enquiries — Request Body

```json
{
  "type": "CONTACT",
  "name": "Example Name",
  "email": "customer@example.com",
  "phone": "0712345678",
  "companyName": "Optional Company",
  "organisationType": "Optional",
  "subject": "Optional subject",
  "message": "Customer message",
  "province": "Gauteng",
  "city": "Pretoria",
  "estimatedQuantity": 50
}
```

`type` must be one of `CONTACT`, `SCHOOL`, `WHOLESALE`, `DISTRIBUTOR`
(the `EnquiryType` enum). `name`, `email` and `message` are always
required; `phone` (if given) must look South African; `province` (if
given) must be one of the 9 provinces (same list as the Order API);
`estimatedQuantity` (if given) must be a positive whole number.
`companyName`, `organisationType`, `subject`, `city` are always
optional free text.

**Type-specific rules** (see `src/validators/enquiry.validator.ts`):

| Type | Extra requirement |
|---|---|
| `CONTACT` | None — `name`/`email`/`message` are already enough. |
| `SCHOOL` | None enforced — `organisationType`/`companyName` and `estimatedQuantity` are useful but optional, so the form doesn't feel demanding. |
| `WHOLESALE` | `companyName` **required**; `estimatedQuantity` **required** (and must be positive). |
| `DISTRIBUTOR` | `companyName` **required**. `city`/`province` are encouraged but not enforced. |

**Note on `estimatedQuantity` storage:** the schema's
`Enquiry.estimatedQuantity` is deliberately a free-text `String?`
field (see `DATABASE_SCHEMA_PLAN.md`/`schema.prisma` — wholesale and
distributor enquiries don't always give a precise number). This
endpoint's *input* validation is stricter — it only accepts a clean
positive integer from the API — and that integer is then stored as a
string. The schema itself is unchanged and still has room for freer
text if a future milestone needs it.

### Validation error example

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Please provide a valid email address." },
    { "field": "companyName", "message": "Company name is required for wholesale enquiries." }
  ]
}
```
HTTP status: `400`. Same shape as every other validation error in this
API (see "Validation error format" above).

### Success response — POST /api/enquiries

```json
{
  "success": true,
  "message": "Enquiry received successfully",
  "data": {
    "id": "cmril912i0000qhkogml41nym",
    "type": "CONTACT",
    "status": "NEW",
    "createdAt": "2026-07-13T02:13:37.577Z"
  }
}
```
HTTP status: `201`. **Deliberately narrow** — the response never
echoes back the name/email/phone/message/etc. that were just
submitted, even though the caller obviously already has that data;
this keeps the response shape identical to (and reusable by) the
status-lookup endpoint below.

### GET /api/enquiries/:id/status

```json
{
  "success": true,
  "message": "Enquiry status retrieved successfully",
  "data": {
    "id": "cmril912i0000qhkogml41nym",
    "type": "CONTACT",
    "status": "NEW",
    "createdAt": "2026-07-13T02:13:37.577Z",
    "message": "Your enquiry has been received."
  }
}
```

**Privacy note:** this is a public, unauthenticated endpoint (there's
no login in this version), so it is deliberately limited to
`id`/`type`/`status`/`createdAt`/a friendly status `message`. It never
returns `name`, `email`, `phone`, `companyName`, or the enquiry's own
`message` text — those are only ever visible to whatever reads the
database directly (there is no admin dashboard yet). The database
query backing this route uses Prisma's `select` to fetch only those
four safe columns, so the rest can't leak even by accident.

If the id doesn't match any enquiry:

```json
{ "success": false, "message": "Enquiry not found: not-real-id" }
```
HTTP status: `404`.

## Known Limitations

- **The frontend is connected locally (Milestone 16), but nothing is
  deployed anywhere.** Cart and wishlist still stay in Local Storage
  by design — see `../VERSION_2_INTEGRATION_NOTES.md` for exactly
  what's connected and what still falls back to static/local data.
- Read-only Product/Category API: no create/update/delete routes for
  products or categories. Admin management is a future milestone.
- Guest orders only: no login, no authenticated customer order
  history, no admin order-list route yet.
- No real payment processing (PayFast or otherwise) and no real
  courier integration — `Payment`/`Shipping` rows are placeholders
  ready for those integrations, matching the schema design from
  Milestone 10.
- No pagination — `/api/products` and its filtered variants return
  every matching row in one response. Fine at 10 seed products; will
  need pagination before a real catalogue is loaded.
- No authentication — every route here is public by design (it's a
  public storefront + guest-checkout API).
- Unknown routes return a clean JSON 404 (`notFoundMiddleware`);
  unhandled errors return a clean JSON 500 without leaking internals
  in production (`errorMiddleware`) — both were already in place from
  Milestone 9 and are unchanged here.
- Rate limiting is in-memory (per process) — it resets on every
  restart and isn't shared across multiple instances. Fine for this
  single-process milestone; a real multi-instance deployment would
  need a shared store (e.g. Redis) instead.
- The Enquiry API (Milestone 15) exists and works, but **the
  frontend's four demo forms are not wired up to it yet** — Contact,
  Schools, Wholesale and Distributor still show their "doesn't send
  yet" message. Swapping that over is a future milestone.
- No enquiry list/admin route of any kind — `GET /:id/status` is
  intentionally the only way to read anything back, and it only ever
  returns the narrow, non-identifying status shape (see "Enquiry
  Routes" above). There's no way to browse or search enquiries via
  this API.
- No `/api/products`/`/api/orders`/`/api/enquiries` write
  (update/delete) or bulk-admin routes — everything is either
  read-only, or create-and-narrow-lookup only.
