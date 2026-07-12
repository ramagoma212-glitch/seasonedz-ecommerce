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

> **Version 2 backend work has started** in the `backend/` folder
> (Node.js + Express + TypeScript, foundation only so far — see
> `backend/README.md`). The frontend documented in this README is
> unaffected and continues to run exactly as described below.

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

### 2. Run the development server

```bash
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`) — open it
in your browser.

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
                               per-page document titles)
      storage.js               Safe Local Storage read/write helpers
      cart.js, wishlist.js      Cart/wishlist logic + Local Storage persistence
      orders.js                 Demo order creation, lookup, and status/tracking model
      search.js                  Search, filter and sort logic for the shop/search pages
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

**Important:** prices in the cart are never re-verified anywhere.
Once a real backend exists, every price must be checked server-side
before an order is accepted — see the Security section of
`VERSION_1_DEMO_AUDIT.md`.

## How Demo Orders Work

1. A customer fills in the guest checkout form (`src/pages/checkoutPage.js`).
2. On submit, `src/js/validation.js` validates every field
   (client-side only).
3. If valid, `src/js/orders.js`'s `createOrder()` builds an order
   object — generating a readable order number like `SG-2026-A1B2` —
   and saves it to Local Storage under `seasonedz_orders`.
4. The cart is cleared, and the customer is redirected to
   `#/order-confirmation?order=<order-number>`.
5. The same order can later be looked up on the Track Order page
   (`#/track-order?order=<order-number>`), which shows a status
   stepper driven by `orders.js`'s fixed demo status model — the
   status never changes on its own (there's a `setOrderStatusForDemo`
   helper for developers to preview different stages, but no
   customer-facing control to change it).

No real payment is taken, no goods are shipped, and no order is ever
seen outside the browser that created it.

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

Cart, wishlist, checkout, orders, tracking, and every contact/enquiry
form are all demo-only — see **`VERSION_1_DEMO_AUDIT.md`** for the
full, itemised breakdown of what's demo vs. real, and why.

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

### Version 2 — Backend & Database Foundation (recommended next step)

- Real backend + database, replacing Local Storage as the source of
  truth for products, cart, wishlist and orders.
- Real payment processing (PayFast), with server-side price/stock
  verification.
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
