# Version 1 Demo Audit

> **Update (Version 2, Milestone 16):** several items below have since
> been connected to a real backend running locally — products/
> categories, checkout, order confirmation/tracking, and the Contact/
> Schools/Wholesale/Distributor forms. This document is kept as-is, as
> an accurate historical record of Version 1. See
> **`VERSION_2_INTEGRATION_NOTES.md`** for what has actually changed
> and what (cart/wishlist, real payment, real courier tracking, login)
> is still demo/local-only.

This document lists every part of the Seasonedz Group website that is
currently **demo only, sample content, or a placeholder** — built to
show how the feature will work, but not yet connected to anything real
(a backend, a payment provider, a courier, or a mailbox).

Nothing in this list is a bug. It's an honest map of what Version 1
is and isn't, so nobody mistakes a working demo for a production
system. Each item below is grouped by area, with its current status,
why it's demo only, and the version where it's expected to be
upgraded.

---

## Data Storage & Persistence

### Local Storage cart
- **Current status:** Fully functional. Adding, removing, updating
  quantities and clearing the cart all work and persist across page
  refreshes (`src/js/cart.js`).
- **Why demo only:** Everything is stored in the browser's Local
  Storage under the key `seasonedz_cart`. There is no server, so the
  cart is tied to one browser on one device and is never validated
  against real stock or pricing.
- **Upgrade in:** Version 2 (backend + database).

### Local Storage wishlist
- **Current status:** Fully functional (`src/js/wishlist.js`, key
  `seasonedz_wishlist`).
- **Why demo only:** Same as the cart — browser-only, no account to
  attach it to.
- **Upgrade in:** Version 2, once customer accounts exist. Wishlists
  should then sync to the logged-in customer's account.

### Local Storage demo orders
- **Current status:** Fully functional. Guest checkout creates a real
  order object, saved under `seasonedz_orders`, with a generated order
  number (`src/js/orders.js`).
- **Why demo only:** No backend exists to actually receive, store or
  process an order. Orders only exist in the browser that placed them
  — clearing site data deletes them permanently, and they are never
  seen by anyone at Seasonedz Group.
- **Upgrade in:** Version 2 (backend + database) — orders should be
  created and stored server-side, with the frontend only ever
  displaying what the server confirms.

---

## Checkout & Orders

### Frontend-only checkout
- **Current status:** The full guest checkout flow works end to end —
  delivery details form, validation, payment method selection, order
  creation, cart clearing, and redirect to a confirmation page
  (`src/pages/checkoutPage.js`, `src/js/app.js`).
- **Why demo only:** No backend receives the order, no payment is
  actually charged, and no stock is reserved or shipped.
- **Upgrade in:** Version 2. Real checkout requires a backend to
  create the order, verify prices/stock server-side, and take real
  payment.

### Demo payment methods
- **Current status:** Three options shown at checkout — Bank Transfer
  (Demo Only), PayFast (Coming Soon, disabled), and Cash/Card on
  Delivery (Demo Only) (`src/js/orders.js` → `PAYMENT_METHODS`).
- **Why demo only:** None are connected to a real payment provider.
  The selected method is only saved on the demo order object.
- **Upgrade in:** Version 2 for real PayFast integration; other
  methods may be added later depending on the business's needs.

### Order confirmation demo receipt
- **Current status:** Fully built — shows order number, customer
  name, date, status, payment method, delivery address and an itemised
  summary (`src/pages/orderConfirmation.js`).
- **Why demo only:** It's a receipt for a demo order, not a real
  purchase. No email copy is sent, and the "order" was never
  transmitted anywhere beyond this browser.
- **Upgrade in:** Version 2, once real orders exist — this page's
  design can largely carry over.

### Demo order tracking
- **Current status:** Fully built — customers can look up a demo
  order by number and see a status stepper (Order Placed → Order
  Confirmed → Preparing → Ready for Delivery → Out for Delivery →
  Delivered) (`src/pages/trackOrder.js`, `src/js/orders.js`).
- **Why demo only:** The status never changes on its own — it's a
  fixed value on the saved order object, not live courier data. A
  demo-only helper (`setOrderStatusForDemo`) exists in code to preview
  different stages, but is not exposed to customers anywhere in the UI.
- **Upgrade in:** Version 2 for backend-driven order status; Version 2
  or 3 for real courier tracking (see below).

### Payment success page
- **Current status:** Not built in Version 1. There is no
  `#/payment-success` route — checkout redirects straight to order
  confirmation instead, since no real payment step exists yet to
  succeed or fail.
- **Why demo only / not built:** Without a real payment provider,
  there is nothing genuine for a "success" page to confirm.
- **Upgrade in:** Version 2, alongside real PayFast integration.

### Payment failed page
- **Current status:** Not built in Version 1, for the same reason as
  payment success above.
- **Why demo only / not built:** No real payment attempt can currently
  fail.
- **Upgrade in:** Version 2, alongside real PayFast integration.

---

## Enquiry & Contact Forms

### Contact form
- **Current status:** Fully styled and validated on the frontend
  (`src/pages/contact.js`, shared `src/components/enquiryForm.js`). On
  submit, it shows: *"Thank you. This demo form does not send messages
  yet. Please contact Seasonedz Group directly using our Contact page
  while backend email support is being prepared."*
- **Why demo only:** There is no backend or email service to receive
  the message.
- **Upgrade in:** Version 2 (backend + real email sending).

### Schools enquiry form
- **Current status:** Same shared form component, same demo message
  (`src/pages/schools.js`).
- **Why demo only:** Same as the contact form.
- **Upgrade in:** Version 2.

### Wholesale enquiry form
- **Current status:** Same shared form component, same demo message
  (`src/pages/wholesale.js`).
- **Why demo only:** Same as the contact form.
- **Upgrade in:** Version 2.

### Distributor enquiry form
- **Current status:** Same shared form component, same demo message,
  plus an explicit notice that distributor applications are reviewed
  manually, not automatically (`src/pages/distributor.js`).
- **Why demo only:** Same as the contact form.
- **Upgrade in:** Version 2.

---

## Content

### Sample product data
- **Current status:** 10 realistic sample products with full detail
  (price, description, features, age range, stock status, tags)
  (`src/data/products.js`).
- **Why demo only:** These are placeholder products written for this
  build, not Seasonedz Group's real, final catalogue.
- **Upgrade in:** Version 2 — real product data should replace this
  file's contents (or the file should be replaced by data fetched from
  a real backend). Pages/components don't need to change either way,
  since they only depend on the data shape.

### Placeholder product images
- **Current status:** Generated colour-block placeholder images for
  every product, category and the hero banner (`public/images/`).
- **Why demo only:** No real product photography exists yet for this
  build.
- **Upgrade in:** Version 2 — swap in real photography, same file
  names/paths.

### Sample testimonials
- **Current status:** Four sample reviews (parent, teacher,
  school/church, mindfulness customer) clearly labelled as sample
  content on the Testimonials page (`src/data/testimonials.js`,
  `src/pages/testimonials.js`).
- **Why demo only:** These are illustrative quotes written for this
  preview, not verified customer feedback.
- **Upgrade in:** Version 2 — replace with real, permission-cleared
  customer reviews.

### Blog starter content
- **Current status:** Five full sample posts covering educational
  colouring, Bible learning, mindfulness, school creativity and
  product tips (`src/data/blogPosts.js`).
- **Why demo only:** Written to demonstrate the blog listing/post
  layout, not as the business's actual ongoing content.
- **Upgrade in:** Version 2 or later — replace or extend with real
  posts as Seasonedz Group publishes them.

---

## Delivery, Courier & Communication

### Shipping fee estimate
- **Current status:** Flat R80 standard delivery, free over R700
  (`src/js/cart.js` → `calculateDeliveryFee`), shown consistently on
  the cart, checkout and order confirmation pages.
- **Why demo only:** This is a placeholder flat rate, not a real
  courier-calculated quote based on weight, size or destination.
- **Upgrade in:** Version 2, once courier integration exists.

### Courier integration
- **Current status:** Not built. Delivery time estimates on the
  Shipping Policy and tracking pages are deliberately general
  ("3–5 business days", "confirmed once courier integration is
  complete") rather than specific promises.
- **Why demo only:** No courier API is connected.
- **Upgrade in:** Version 2 or 3, depending on business priority.

### Email notifications
- **Current status:** Not built. No order confirmation emails, no
  contact form emails, no notifications of any kind are sent.
- **Why demo only:** No backend or email service is connected.
- **Upgrade in:** Version 2 (backend), likely alongside real checkout.

---

## Accounts & Administration

### Login and registration
- **Current status:** Not built. All shopping (including checkout) is
  guest-only by design for Version 1.
- **Why demo only:** No backend exists to authenticate or store
  customer accounts.
- **Upgrade in:** Version 2 or 3, depending on business priority —
  guest checkout can continue to exist alongside accounts.

### Customer dashboard
- **Current status:** Not built. There is no order history view
  beyond the single order confirmation/tracking pages.
- **Why demo only:** Requires accounts and a backend first.
- **Upgrade in:** Version 2 or 3, after login/registration exists.

### Admin dashboard
- **Current status:** Not built. All product/category/content data is
  edited directly in source files (see README for how).
- **Why demo only:** Requires a backend and admin authentication.
- **Upgrade in:** Version 2 or 3, depending on business priority.

---

## Security

### Security limitation of frontend-only data
- **Current status:** All cart, wishlist and order data lives in
  unencrypted browser Local Storage, readable and editable by anyone
  with access to that browser (e.g. via developer tools). Prices shown
  in the cart/checkout are never re-verified anywhere — the browser is
  fully trusted.
- **Why demo only:** There is no server to be the source of truth.
  This is explicitly called out in code comments in `cart.js` and
  `orders.js`.
- **Upgrade in:** Version 2 is non-negotiable here — once real money
  is involved, every price and stock check must be verified
  server-side before an order is accepted. Frontend-stored data should
  never again be trusted for anything with real financial or personal
  consequences.
