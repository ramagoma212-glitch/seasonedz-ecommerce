# API Routes (Version 2, Milestone 12)

Read-only Product and Category API, backed by the real Supabase
database seeded in Milestone 11. **Nothing here is connected to the
frontend yet** — the frontend continues to run entirely on its own
static data in `src/data/`. This document is the reference for what
the API returns today.

Base path for every route: `/api`.

## Response Envelope

Every response follows the same shape (`src/utils/apiResponse.ts`):

- Success: `{ "success": true, "message": string, "data": ... }`
- Error: `{ "success": false, "message": string, "errors"?: ... }`

## Health

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Simple status check (unchanged from Milestone 9) |

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
returns a `400` error (a value that specific deserves an explicit
error rather than being silently dropped). If both are given and
`minPrice > maxPrice`, that's also a `400`. An unrecognised `sort` or
`stock` value is **not** an error — it's treated as if the parameter
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

## Known Limitations

- **The frontend is not connected.** It still reads its own static
  data in `src/data/`; nothing on the site calls this API yet.
- Read-only: no create/update/delete routes for products or
  categories. Admin management is a future milestone.
- No order API yet (no checkout/order endpoints).
- No pagination — `/api/products` and its filtered variants return
  every matching row in one response. Fine at 10 seed products; will
  need pagination before a real catalogue is loaded.
- No authentication — every route here is public by design (it's a
  read-only public storefront API).
- Unknown routes return a clean JSON 404 (`notFoundMiddleware`);
  unhandled errors return a clean JSON 500 without leaking internals
  in production (`errorMiddleware`) — both were already in place from
  Milestone 9 and are unchanged here.
