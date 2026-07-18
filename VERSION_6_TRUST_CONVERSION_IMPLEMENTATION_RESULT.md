# Version 6 — Website Trust and Conversion Improvements (Milestone 52)

Improves customer trust and conversion wording across the live site.
**No payment code, checkout logic, order creation logic, or PayFast
configuration was touched — only visible copy (and, in two files, the
display-only `label`/`description` strings behind the checkout's
payment method radios) changed.**

## What Was Changed

- Reviewed the homepage, shop page, product detail page, cart,
  checkout, about, contact, FAQ, shipping policy, returns policy,
  schools and wholesale pages.
- Rewrote the homepage's trust section and schools/wholesale banner.
- Corrected stale "demo only" wording on the checkout page and in the
  payment method labels, which contradicted the accurate wording
  already fixed in the FAQ back in Milestone 48 (Bank Transfer and
  Cash / Card on Delivery place real orders; PayFast is coming soon).
- Added a delivery threshold note to the shared order summary
  (cart and checkout).
- Added "Good For", "Delivery" and "Support" sections to every product
  detail page, built only from real product data already on the page.
- Added a support line to the Shipping Policy page.
- Added a Support FAQ entry, and widened the School Orders FAQ answer
  to explicitly cover churches and bulk educational gifts.

## Pages Changed

- `src/pages/home.js`
- `src/pages/productDetails.js`
- `src/pages/checkoutPage.js`
- `src/pages/shippingPolicy.js`
- `src/components/orderSummary.js` (shared by cart and checkout)
- `src/js/orders.js` (payment method display labels only)
- `src/data/faqs.js`
- `src/css/pages.css`, `src/css/components.css` (styling for the
  above, no behavioural change)

Reviewed but not changed: shop page, cart page markup itself, about
page, contact page, returns policy, schools page, wholesale page,
footer, header — these were already accurate and on message, so
changing them wasn't necessary and risked scope creep without adding
value.

## Trust Improvements

Homepage trust section rewritten (`src/pages/home.js`) to cover, in
four short items:

- Seasonedz Group is a South African small business, serving families,
  schools and churches.
- Products serve every age, from young learners to adults, and
  support creativity, learning, faith and quiet time.
- Real, human support is available — not automated.
- Delivery is available across South Africa (R80, free from R700).

No emojis were used (the checkmark icon is a plain Unicode character,
already used elsewhere on the site, e.g. the About page). No fake
reviews, ratings or testimonials were added anywhere.

## Delivery Wording Improvements

- **Order summary** (`src/components/orderSummary.js`, shown on both
  cart and checkout): now shows "Orders of R700 or more qualify for
  free delivery" or "This order qualifies for free delivery"
  underneath the total, so the R80 / free-from-R700 rule is visible
  at the point of decision, not just buried in the Shipping Policy.
- **Checkout notice**: rewritten to state plainly that delivery is
  arranged manually by hand right now, without promising instant
  delivery or automated courier tracking.
- **Shipping Policy**: added a short "Need Help?" section pointing to
  the Contact page.
- **Product pages**: every product now has a "Delivery" note stating
  the R80 / free-from-R700 rule and that delivery is currently
  arranged manually, linking to the Shipping Policy.

## Product Page Improvements

Added to every product detail page (`src/pages/productDetails.js`),
inside the existing description block, using only real data already
on the page:

- **Good For** — one sentence built from the product's real
  `ageRange` and a short, honest, per-category context phrase (e.g.
  "home, pre-school and the classroom" for kids' books, "Sunday
  school and family devotion time" for Bible titles). Not a
  per-product invented claim — the category phrase is generic to all
  products in that category.
- **Delivery** — the same R80 / free-from-R700 / manual-delivery note
  as elsewhere, linked to the Shipping Policy.
- **Support** — a short line inviting pre-purchase questions, linked
  to the Contact page.

No fake reviews, star ratings, or customer quotes were added. The
existing `rating`/`reviewCount` display and the Milestone 48 decision
to exclude them from SEO structured data are unchanged.

## School and Bulk Order Improvements

The homepage's schools/wholesale banner was rewritten:

- **Before**: "Bulk pricing for schools, churches and organisations is
  coming soon" — this was stale. The Schools and Wholesale pages
  already have working enquiry forms wired to the real backend Enquiry
  API (confirmed in earlier milestones), so bulk pricing enquiries
  were never actually "coming soon."
- **After**: "Schools, Churches & Bulk Orders" with copy naming
  preschools, schools, churches and bulk educational gifts, and two
  buttons linking directly to the existing `/schools` and `/wholesale`
  pages (previously a single generic "Enquire Now" link to `/contact`).

The School Orders FAQ answer was widened to explicitly mention
churches, Sunday schools and bulk educational gifts, alongside the
existing preschool/primary school/aftercare wording.

No new backend flow, form, or enquiry type was created — both existing
pages' existing forms and the existing `SCHOOL`/`WHOLESALE` enquiry
types were reused unchanged.

## WhatsApp / Contact Visibility

Reviewed the Contact page and footer. Email, phone and location are
already shown on the Contact page and in the footer of every page —
no changes were needed to improve their visibility further. The
WhatsApp number on the Contact page is honestly labelled
"(coming soon)" and is a placeholder, not a real number — per
instruction, no new number was added or invented, and this label was
left exactly as is rather than being surfaced more prominently, since
doing so would overstate its current availability.

## FAQ Improvements

- Added a new **Support** category FAQ: "How can I contact Seasonedz
  Group for support?" — points to the Contact page, email, phone and
  footer, and sets an honest expectation ("please allow us a little
  time to respond").
- Widened the **School Orders** FAQ to explicitly mention churches,
  Sunday schools and bulk educational gifts.
- Confirmed the existing **Delivery** and **Payment** FAQ answers
  (corrected in Milestone 48) already state the R80 / free-from-R700
  rule and "Bank Transfer or Cash / Card on Delivery place a real
  order; PayFast is coming soon" accurately — no PayFast wording
  anywhere implies it is live.

## Payment Safety Confirmation

- No file under `backend/` was touched.
- No `.env` file was touched.
- `src/js/orders.js`: only the `label` and `description` string values
  on `PAYMENT_METHODS` changed. The `value` fields
  (`"bank-transfer"`, `"payfast"`, `"cash-on-delivery"`), the
  `disabled` flag, and the `payfastEnabled` computation are byte-for-
  byte unchanged — confirmed by diff review.
- `src/pages/checkoutPage.js`: only comments and the visible notice
  text changed. `renderPaymentMethods()`, the form fields, form
  submission wiring, and the Place Order button are unchanged.
- No file under `src/js/api/`, `src/js/app.js`, `src/js/cart.js`, or
  `src/js/validation.js` was touched — the actual order creation and
  payment-initiation code paths are untouched.

## Testing Result

Ran the frontend locally (`npm run dev`) and checked every changed
page in a real browser (Playwright):

| Check | Result |
|---|---|
| Homepage trust section (4 items) renders with correct copy | Passed |
| Homepage schools/wholesale banner renders, links to `#/schools` and `#/wholesale` | Passed |
| Product page: Good For / Delivery / Support sections render with correct, product-specific text | Passed |
| Cart order summary shows the free-delivery threshold note | Passed |
| Checkout demo notice shows the corrected, accurate wording | Passed |
| Checkout payment method labels show "Bank Transfer" / "PayFast (Coming Soon)" / "Cash / Card on Delivery" (no more "(Demo Only)") | Passed |
| PayFast radio still `disabled` | Passed |
| FAQ page includes the new Support entry | Passed |
| Console errors | Only the standard, expected "backend not running locally" connection-refused warnings — harmless, unrelated to this milestone |

Also swept every added line of visible copy for em dashes/en dashes;
the only remaining ones are inside developer `//` comments (not
customer-facing), consistent with the "avoid hyphens and dash symbols
in visible marketing copy" instruction.
