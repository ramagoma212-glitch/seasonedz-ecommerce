# Version 2 Integration Notes (Milestone 16)

What changed when the frontend was connected to the backend API,
locally. Read this alongside `backend/API_ROUTES.md` (the API
contract) and `VERSION_1_DEMO_AUDIT.md` (what Version 1 looked like
before any of this existed).

## Running Both Servers Locally

Full Version 2 functionality needs **both** servers running at once:

```bash
# Terminal 1 — backend (see backend/README.md for env var setup)
cd backend
npm run dev          # http://localhost:5000

# Terminal 2 — frontend
npm run dev          # http://localhost:5173
```

The frontend reads `VITE_API_BASE_URL` from `.env` (copy
`.env.example` if `.env` doesn't exist — the default,
`http://localhost:5000/api`, matches the backend's default port).
**The frontend still works if the backend isn't running** — see
"Fallback and Error Behaviour" below.

## What's Now Connected to the Backend

- **Products and categories** (homepage rails, Shop, Categories,
  Product Details, Search) load from `GET /api/products` /
  `GET /api/categories` — see `src/js/api/productsApi.js`.
- **Checkout** submits to `POST /api/orders` — see
  `src/js/api/ordersApi.js` and the submit handler in `src/js/app.js`.
  Only `productSlug`/`quantity` are ever sent per cart item; no price,
  subtotal, delivery fee or total is ever sent — the backend
  recalculates all of that from real database prices and rejects
  anything it can't fulfil (unknown product, inactive, insufficient
  stock).
- **Order confirmation** (`#/order-confirmation?order=...`) fetches
  `GET /api/orders/:orderNumber`.
- **Order tracking** (`#/track-order?order=...`) fetches
  `GET /api/orders/:orderNumber/tracking`.
- **Contact, Schools, Wholesale and Distributor forms** submit to
  `POST /api/enquiries`, each with the matching `type` (`CONTACT` /
  `SCHOOL` / `WHOLESALE` / `DISTRIBUTOR`) — see
  `src/js/api/enquiriesApi.js` and `src/components/enquiryForm.js`.
  Wholesale now also asks for company name and estimated quantity
  (both required, matching the backend's validation for that type);
  Schools asks for the same estimated quantity optionally; Distributor
  requires a company name. This is a deliberate, small addition to
  those forms' fields — see `backend/API_ROUTES.md`'s "Enquiry Routes"
  section for exactly what each type requires.

## What's Still Local Storage / Still Not Real

- **Cart and wishlist** are unchanged — still pure Local Storage
  (`src/js/cart.js`, `src/js/wishlist.js`), by design. There is no
  server-side cart or wishlist in this version.
- **Payment is still not processed online.** Checkout still only
  selects a payment method; no PayFast or other real payment
  integration exists yet. See the demo notices on the checkout and
  order confirmation pages.
- **Courier tracking is still not real.** The tracking page shows a
  status set manually in the backend's database, not a live courier
  API. The backend's own tracking response is explicit about this too
  (`trackingSource: "backend-demo"`).
- **No login/registration/customer accounts, no customer or admin
  dashboard.** Every API call here is a public, guest-facing one.
- **Production backend deployment is still pending.** Everything above
  only works when the backend is running *locally*
  (`http://localhost:5000`). The deployed GitHub Pages frontend has no
  backend to reach yet — this milestone is local integration only, and
  deliberately does not touch `.github/workflows/deploy.yml` or add any
  production backend hosting.

## Fallback and Error Behaviour

**Products/categories:** if the backend can't be reached, the frontend
falls back to the original static data (`src/data/products.js` /
`src/data/categories.js`) automatically, with a `console.warn` in the
browser dev tools only — never a customer-facing error. The site looks
and behaves exactly like Version 1 in that case. This fallback is
deliberately silent-to-the-customer since "backend not running" is a
completely normal state during local development.

**Search/filter/sort** (`src/js/search.js`) is unchanged and still
runs entirely client-side against whichever product array the above
returns (API-backed or static) — this was a deliberate choice over
pushing filters through API query params: the catalogue is small (10
seed products), the existing filter UI (price *ranges*, a "low-stock"
option) doesn't map 1:1 onto the API's query params (plain
minPrice/maxPrice, only in-stock/out-of-stock), and reusing the
already-working, already-tested filter code was lower-risk than
rebuilding it around the API for this milestone. `src/js/api/mappers.js`
converts the API's product/category shape to exactly the shape
`search.js`, product cards, cart and wishlist already expect, so
neither of them needed to change.

**Checkout, order confirmation, order tracking, and enquiry forms** —
if the backend is unreachable, each shows a plain, clear message
rather than silently pretending to succeed:
- Checkout: *"We could not connect to the order system right now.
  Please try again shortly."*
- Enquiry forms: *"We could not send your enquiry right now. Please
  try again shortly."*
- Order confirmation/tracking: a similar banner, with the order number
  shown so the customer isn't left with nothing.

If the backend returns a validation error (`400` with an `errors`
array), the checkout and enquiry forms show it inline, next to the
relevant field where one exists — anything that doesn't map to a
specific field (e.g. a stock problem) shows as a form-level banner
instead. See `showCheckoutErrors`/`mapBackendErrorsToCheckoutForm` and
`showEnquiryFieldErrors` in `src/js/app.js`.

**Old (Version 1) orders**: an order created before the backend
existed only ever lived in this browser's Local Storage, so it will
always 404 against the backend. Order confirmation and tracking both
fall back to that old Local Storage data in this case — via
`src/js/orders.js`, kept around for exactly this — but render it with
an explicit **"Local Demo Order (Version 1)"** notice, never presented
as if it were a real backend order.

## Notable Implementation Details

- **The router now supports async page renders**
  (`src/js/router.js`): a page's `render()` can return a `Promise`
  instead of a string, and the router awaits it before updating the
  page. Pages that don't need backend data (cart, wishlist, info
  pages, blog, policies) are completely unchanged.
- **Product `id` uses the slug, not the database's internal ID** (see
  `mapApiProductToFrontendShape` in `src/js/api/mappers.js`) — the
  static data's `id` and `slug` were always identical strings, and
  cart/wishlist Local Storage entries are keyed by this `id`. Using the
  slug keeps anything already saved in a customer's browser working
  correctly regardless of whether products came from the API or the
  static fallback.
- **`src/js/orders.js` is intentionally kept, not deleted** — it's
  still the source of the Version 1 local-demo-order fallback described
  above, and its `PAYMENT_METHODS` list is still what the checkout
  page's radio buttons render from (`src/js/api/mappers.js` maps those
  same values to the backend's `PaymentMethod` enum only at submit
  time).
- **CORS**: the backend's `FRONTEND_URL` was already set to
  `http://localhost:5173` from Milestone 14's hardening work, so no
  backend change was needed for the frontend dev server to be allowed
  — confirmed by testing an actual browser request (see Testing below).
