# API Routes (Version 2, Milestones 12-14)

Product, Category and guest Order API, backed by the real Supabase
database seeded in Milestone 11, hardened in Milestone 14. **Nothing
here is connected to the frontend yet** — the frontend continues to
run entirely on its own static data and Local Storage. This document
is the reference for what the API returns today.

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
  - Exceeding either returns a clean `429`:
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
`BANK_TRANSFER`, `PAYFAST`, `CASH_ON_DELIVERY`, `MANUAL` (accepting
`PAYFAST` here is just schema-level validation — no real PayFast
integration exists; the frontend's own UI is what currently keeps
PayFast disabled as a selectable option).

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

## Known Limitations

- **The frontend is not connected.** It still reads its own static
  data and Local Storage; nothing on the site calls this API yet —
  including checkout, which still creates Local Storage demo orders
  exactly as before.
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
- No enquiry API yet — the frontend's four demo forms (Contact,
  Schools, Wholesale, Distributor) still show their "doesn't send yet"
  message. The `Enquiry` model exists in the schema (Milestone 10) but
  nothing reads/writes it yet.
- No `/api/products`/`/api/orders` write (create/update/delete) or
  bulk-admin routes — everything added through Milestone 14 is either
  read-only or, for orders, guest-create-and-lookup only.
