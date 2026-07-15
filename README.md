# Seasonedz Group — E-commerce Website

A professional frontend e-commerce website for **Seasonedz Group**, a
business selling educational colouring books, Bible colouring books,
mindfulness colouring books, markers, crayons, bundles and creative
learning products for parents, teachers, schools, churches and
wholesale/distribution partners.

Built with plain HTML5, CSS3 and JavaScript ES Modules, powered by
[Vite](https://vitejs.dev/). No frameworks, no external UI libraries.

## Current Status: Version 1 Frontend MVP

Version 1 is complete and is a **frontend-only** build: there is no
backend, no database, no real payment processing, no real courier
integration, no real email sending, and no login/accounts. Cart,
wishlist and demo orders are all saved in the browser's Local Storage.

See **`VERSION_1_RELEASE_NOTES.md`** for the full release summary and
**`VERSION_1_DEMO_AUDIT.md`** for an itemised list of every demo-only
or placeholder area, with notes on what upgrading it later would
involve.

> **Version 2: the frontend now talks to the backend, locally.** As of
> Milestone 16, the frontend calls the real backend API (`backend/`,
> see `backend/README.md`) for products/categories, checkout, order
> confirmation/tracking, and the Contact/Schools/Wholesale/Distributor
> forms — with a safe fallback to the original static data if the
> backend isn't running. See **`VERSION_2_INTEGRATION_NOTES.md`** for
> exactly what's connected, what still isn't, and how to run both
> servers locally. Cart and wishlist are still Local Storage only, and
> there's still no real payment, no real courier tracking, and no
> login — see that file for the full picture.
>
> **The backend is now deployed** at
> `https://seasonedz-ecommerce.onrender.com/api` (Render — see
> `backend/DEPLOYMENT.md` and `backend/DEPLOYMENT_CHECKLIST.md`). The
> production frontend build (`.github/workflows/deploy.yml`) is
> configured to use this URL as `VITE_API_BASE_URL` — see
> `VERSION_2_INTEGRATION_NOTES.md` for the full detail. As always, real
> environment secrets (database credentials, etc.) are never committed
> to Git — only entered directly in the hosting provider's dashboard.

### Features Included in Version 1

- Homepage, full product catalogue, categories, and product detail
  pages with image galleries and related products.
- Keyword search, category/price/age/stock/tag filters, and sorting —
  all URL-based, so any filtered/searched view is a shareable link.
- Shopping cart and wishlist, persisted in Local Storage.
- Guest checkout with delivery details, form validation, and payment
  method selection (demo only — see below).
- Demo order creation, order confirmation, and order tracking with a
  visual status stepper.
- Business trust pages: About, Contact, FAQ, Testimonials, Schools,
  Wholesale, Distributor — several with a demo enquiry form.
- Blog (listing + individual post pages).
- Policy pages: Shipping, Returns, Privacy, Terms & Conditions,
  Cookies.
- 404 page, responsive design (mobile/tablet/desktop), and GitHub
  Pages deployment via GitHub Actions.

### Features Not Included Yet

- Backend, database, or any server-side logic.
- Real payment processing (including PayFast).
- Real courier integration or live order tracking.
- Real email sending (order confirmations, contact form, enquiries).
- Login, registration, or customer accounts.
- Customer order history / customer dashboard.
- Admin dashboard.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional but recommended) Start the backend

For live products/categories, real checkout, order confirmation/
tracking, and working Contact/Schools/Wholesale/Distributor forms, the
backend needs to be running locally too — see `backend/README.md` for
its own setup (env vars, database, `npm install`). Once set up:

```bash
cd backend
npm run dev
```

It listens on `http://localhost:5000` by default. **The frontend still
works without this** — see `VERSION_2_INTEGRATION_NOTES.md` for what
falls back to static/demo behaviour when the backend isn't running.

### 3. Run the frontend development server

From the project root (a separate terminal from the backend, if it's running):

```bash
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`) — open it
in your browser. It reads `VITE_API_BASE_URL` from `.env` (copy
`.env.example` if `.env` doesn't exist yet) to know where the backend
is — not a secret, safe to see in the browser.

### Other scripts

```bash
npm run build     # Build a production bundle into /dist
npm run preview   # Preview the production build locally (respects the
                   # GitHub Pages base path — closest local simulation
                   # of the deployed site)
```

## Folder Structure

```
seasonedz-ecommerce/
  public/
    images/                Static images (logo, hero banner, product photos)

  src/
    css/                   Global stylesheets
      base.css               Design tokens (colours, spacing, type scale, etc.) and resets
      layout.css             Header, footer, container, page-level grid shells
      components.css         Reusable UI pieces (cards, buttons, forms, badges, accordions...)
      pages.css               Page-specific layout (checkout, product details, blog, etc.)
      responsive.css          Mobile/tablet media queries

    data/                   Sample content — edit these to change what's on the site
      products.js, categories.js, faqs.js, testimonials.js, blogPosts.js

    js/                     Core application logic (no UI markup)
      app.js                  Entry point — mounts header/footer, wires up all delegated
                               event handling (cart, wishlist, forms, filters, etc.)
      router.js               Hash-based router (routes, dynamic segments, query strings,
                               per-page document titles) — supports async page renders
      apiClient.js             Low-level fetch wrapper: JSON, error handling, ApiError/
                               ApiUnavailableError (see VERSION_2_INTEGRATION_NOTES.md)
      api/                     Backend API calls + response-shape mapping
        productsApi.js           Products/categories, with static-data fallback
        ordersApi.js              Order creation/lookup/tracking, order payload builder
        enquiriesApi.js           Enquiry submission
        mappers.js                 Maps backend shapes onto the existing frontend shape
      storage.js               Safe Local Storage read/write helpers
      cart.js, wishlist.js      Cart/wishlist logic + Local Storage persistence (unchanged
                               in Version 2 — see VERSION_2_INTEGRATION_NOTES.md)
      orders.js                 Version 1 demo order model — kept only as a fallback for
                               orders created before the backend existed (see notes above)
      search.js                  Search, filter and sort logic for the shop/search pages
                               (still runs client-side against API or static data alike)
      validation.js              Form validation (checkout, generic helpers)
      paths.js                    Resolves image paths against the GitHub Pages base path

    components/             Reusable render(data) -> HTML string functions
      header.js, footer.js, productCard.js, categoryCard.js, cartItem.js,
      wishlistItem.js, orderSummary.js, filterBar.js, blogCard.js, enquiryForm.js

    pages/                  One module per route, each exporting a render(params) function
      home.js, shop.js, categories.js, productDetails.js, searchResults.js,
      cartPage.js, wishlistPage.js, checkoutPage.js, orderConfirmation.js,
      trackOrder.js, about.js, contact.js, faq.js, testimonials.js,
      schools.js, wholesale.js, distributor.js, blog.js, blogPost.js,
      policies.js, shippingPolicy.js, returnsPolicy.js, privacyPolicy.js,
      terms.js, cookiesPolicy.js, notFound.js

  .github/workflows/deploy.yml   GitHub Pages deployment workflow
  vite.config.js                  Sets the GitHub Pages base path
  index.html
  package.json
```

## Editing Content

All editable content lives in `src/data/`. Pages read from these files
directly, so editing them updates the site everywhere that data is
used — no need to touch page or component code.

### Products

Edit `src/data/products.js`. Each product is a plain object; the
required fields are documented by the existing sample entries (id,
slug, name, category, categorySlug, price, oldPrice, image, gallery,
descriptions, features, ageRange, stockStatus, rating, reviewCount,
tags, and the isFeatured/isBestSeller/isNewArrival/discountLabel
flags). Use a stable, slug-based `id`/`slug` — don't reuse an existing
one. Product images live in `public/images/` and are referenced as
root-relative paths (e.g. `/images/product-1.jpg`).

### Categories

Edit `src/data/categories.js`. `productCount` is calculated
automatically from `products.js` (via a getter) — you never need to
update it by hand, and it can't drift out of sync.

### FAQs

Edit `src/data/faqs.js`. Each entry has a `category`, `question` and
`answer`. The FAQ page automatically groups entries by `category` and
renders each group as its own accordion section — add a new category
name and it appears as a new section with no other changes needed.

### Testimonials

Edit `src/data/testimonials.js`. These are clearly labelled as sample
content on the Testimonials page (see the demo notice there) — replace
them with real, permission-cleared customer reviews when available.

### Blog Posts

Edit `src/data/blogPosts.js`. Each post needs `title`, `slug`,
`category`, `excerpt` (used on the blog listing cards), `image`,
`date`, and `content` (an array of paragraph strings — plain text, not
HTML, rendered as separate `<p>` tags on the post page).

## How Cart and Wishlist Work

Both are pure Local Storage, no server involved:

- **Cart** (`seasonedz_cart`): array of `{ productId, slug, name,
  price, image, quantity }`. Managed by `src/js/cart.js`
  (`addToCart`, `removeFromCart`, `updateCartQuantity`, etc.).
- **Wishlist** (`seasonedz_wishlist`): array of `{ productId, slug,
  name, price, image, category }`, managed by `src/js/wishlist.js`.

Every cart/wishlist action goes through one delegated click/change
handler in `src/js/app.js` (since page content is re-rendered on every
route change, not just mounted once), which updates Local Storage,
refreshes the header badge counts, and shows a toast message.

**Important:** prices in the cart are still never trusted at checkout
— the backend (`backend/src/services/order.service.ts`) re-looks-up
every item by slug and re-prices it from the database before creating
an order, ignoring any price the frontend sends. See
`VERSION_2_INTEGRATION_NOTES.md`.

## How Checkout, Order Confirmation and Tracking Work (Version 2)

1. A customer fills in the guest checkout form (`src/pages/checkoutPage.js`).
2. On submit, `src/js/validation.js` validates every field client-side
   first (fast feedback), then the cart items (`productSlug` +
   `quantity` only — never price) and form data are sent to
   `POST /api/orders` (`src/js/api/ordersApi.js`).
3. The backend validates everything again, re-prices every item, and
   creates a real database order — see `backend/API_ROUTES.md`. Its
   response order number is what the frontend actually uses.
4. On success, the cart is cleared and the customer is redirected to
   `#/order-confirmation?order=<order-number>`, which fetches the real
   order from `GET /api/orders/:orderNumber`.
5. The Track Order page (`#/track-order?order=<order-number>`) calls
   `GET /api/orders/:orderNumber/tracking` for a lighter-weight status
   view with a visual stepper, driven by the backend's real
   `OrderStatus` — the status only changes if a staff member updates
   it directly in the database (there's no automated status
   progression, and no customer-facing control to change it).

**If the backend isn't running**, checkout shows a clear "could not
connect to the order system" message instead of silently creating a
fake order — see `VERSION_2_INTEGRATION_NOTES.md`. Orders placed
*before* the backend existed (Version 1, Local Storage only) still
work on the confirmation/tracking pages too, clearly labelled as old
local demo data — `src/js/orders.js` is kept around for exactly that
fallback.

No real payment is taken yet, and no goods are shipped — see the demo
notices on the checkout and confirmation pages themselves.

## How GitHub Pages Deployment Works

The site deploys automatically via GitHub Actions
(`.github/workflows/deploy.yml`) on every push to `main`, using the
official GitHub Pages Actions flow (build → upload artifact → deploy —
no `gh-pages` branch involved). `vite.config.js` sets
`base: "/seasonedz-ecommerce/"` since this is a GitHub Pages *project*
site (served from a sub-path, not the domain root); every image path
in the app is routed through `src/js/paths.js`'s `withBase()` helper
so it resolves correctly under that sub-path.

**One-time setup required in the GitHub UI** (a workflow file can't do
this itself): go to the repository's **Settings → Pages → Build and
deployment → Source**, and set it to **"GitHub Actions"**.

Live site: `https://<your-github-username>.github.io/seasonedz-ecommerce/`

## Known Demo Limitations

Cart and wishlist are still Local Storage only, and there's still no
real payment processing, no real courier tracking, and no login — see
**`VERSION_2_INTEGRATION_NOTES.md`** for exactly what's now connected
to the backend versus what's still demo/local-only. For the original
Version 1 (before any backend existed), see **`VERSION_1_DEMO_AUDIT.md`**.

## SEO Notes

Version 1 covers SEO basics only: a strong `<h1>` on every page, a
sensible heading hierarchy, a meta description in `index.html`, and a
unique `document.title` per route (set in `src/js/router.js`). Because
this is a single-page app with one `index.html` and everything
rendered client-side, that's the practical ceiling for SEO without
adding real infrastructure — search engines and social media link
previews only ever see the one static `index.html`, not per-page
content or meta tags. **Deeper SEO (per-page meta descriptions/Open
Graph tags, a sitemap, and real crawlability) requires either a
server-side rendering setup or a static pre-rendering step, and should
be scoped as part of Version 2 or later**, likely alongside the move
to a real backend.

## Future Roadmap

### Version 2 — Backend & Local Integration (in progress)

- ~~Real backend + database~~ — done (see `backend/`).
- ~~Frontend connected to the backend locally~~ (products/categories,
  checkout, order confirmation/tracking, enquiry forms) — done, see
  `VERSION_2_INTEGRATION_NOTES.md`. Cart/wishlist remain Local Storage
  by design.
- ~~Deploying the backend somewhere reachable from the live GitHub
  Pages site~~ — done, deployed on Render at
  `https://seasonedz-ecommerce.onrender.com/api`, and the production
  frontend build is configured to use it. The live GitHub Pages site
  itself still needs an actual redeploy to pick this up — see
  `VERSION_2_INTEGRATION_NOTES.md`.
- Real payment processing (PayFast), with server-side price/stock
  verification (server-side verification already exists; PayFast
  itself doesn't yet).
- Real courier integration and live order tracking.
- Real email notifications (order confirmations, contact/enquiry
  forms).
- Customer accounts (login/registration), with cart/wishlist/orders
  attached to the account.

### Version 3 and Beyond

- Customer dashboard (order history, saved details).
- Admin dashboard (manage products, categories, orders, content).
- Deeper SEO (server-side rendering or pre-rendering, sitemap, Open
  Graph/social previews).
- Analytics.
- Coupons/discounts, reviews, and other growth features as the
  business needs them.
