# Seasonedz Group Website — Release Notes

## Version 1 Frontend MVP

A complete, professional frontend e-commerce experience for Seasonedz
Group — built with Vite and vanilla JavaScript, deployed to GitHub
Pages, with no backend, database, or real payment/courier/email
integration yet. See `VERSION_1_DEMO_AUDIT.md` for a full breakdown of
every demo-only area, and `README.md` for how to run, build and edit
the project.

---

## Completed Milestones

| # | Milestone |
|---|---|
| 1 | Project Foundation |
| 2 | Product Catalog and Product Details |
| 3 | Search, Filters and Sorting |
| 4 | Cart and Wishlist |
| 5 | Guest Checkout and Demo Orders |
| 6 | Order Tracking |
| 7 | Business Trust Pages |
| 8 | Final Polish and Release Review |

---

## What Works

- **Full product browsing:** homepage, shop grid, categories, product
  detail pages with image galleries, related products.
- **Discovery:** keyword search, category/price/age/stock/tag filters
  (all URL-based and shareable), sorting.
- **Cart and wishlist:** add/remove/update quantities, persists across
  refresh via Local Storage, header badges stay in sync everywhere.
- **Guest checkout:** full delivery details form with field-level
  validation (including South African phone and postal code checks),
  payment method selection, demo order creation.
- **Order confirmation and tracking:** a real order number is
  generated per order, orders are saved and can be looked up by
  number, with a visual status stepper.
- **Business trust pages:** About, Contact (with a demo enquiry form),
  FAQ (accordion, 11 categories), Testimonials, Schools, Wholesale,
  Distributor — each with its own enquiry form where relevant.
- **Blog:** listing page and individual post pages with related posts.
- **Policies:** Shipping, Returns, Privacy, Terms & Conditions and
  Cookies policy pages, each in plain, honest language.
- **404 handling**, consistent page titles per route, and a
  responsive, accessible design across mobile and desktop.
- **Deployment:** live on GitHub Pages via GitHub Actions, triggered
  on push to `main`.

## What Is Demo Only

In short: **everything that would normally require a backend.**
That includes the cart, wishlist and order data (all Local Storage,
not a database), checkout (no real payment is taken), order tracking
(status is fixed, not live courier data), and every enquiry form
(contact, schools, wholesale, distributor — none of them send real
messages). Product data, images, testimonials and blog posts are all
realistic sample content, not final business content.

The full, itemised list — with current status, why it's demo only,
and which future version should upgrade it — lives in
**`VERSION_1_DEMO_AUDIT.md`**. Read that before treating anything in
this site as production-ready.

## What Must Be Reviewed Before Real Launch

- **All sample content** — product data, images, testimonials and
  blog posts must be replaced with real Seasonedz Group content.
- **Brand assets** — confirm the logo, colours and fonts in use match
  final brand guidelines (a real logo is already in place at
  `public/images/logo-placeholder.jpeg`; the filename is a holdover
  and can be renamed safely).
- **Legal copy** — the Privacy Policy, Terms & Conditions, Returns
  Policy and Shipping Policy are written in plain, honest language for
  a demo site, not reviewed by a legal professional. This should
  happen before real customer data or payments are involved.
- **Contact details** — email, phone and WhatsApp numbers in the
  footer and Contact page are placeholders and need to be replaced
  with real ones.
- **Security posture** — every price, stock level and order shown on
  this site currently comes from the browser itself, with nothing
  verified server-side. This is explicitly fine for a demo and
  explicitly not fine once real money is involved (see the Security
  section of `VERSION_1_DEMO_AUDIT.md`).

## Recommended Next Step

**Version 2: backend and database foundation.**

Nearly every "demo only" item in this release traces back to the same
root cause — there is no server. Building a real backend (API +
database) first, then reconnecting the existing frontend to it piece
by piece (starting with product data and cart/order persistence),
gives the most leverage: it unblocks real checkout, real payment,
real order tracking, accounts, and an admin dashboard, roughly in that
order of priority.
