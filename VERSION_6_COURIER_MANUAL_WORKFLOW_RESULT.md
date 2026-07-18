# Version 6 — Courier Manual Workflow Improvement Result (Milestone 54)

Improves customer-facing delivery wording and adds an internal manual
fulfilment checklist, building on `VERSION_6_COURIER_INTEGRATION_PLAN.md`
(Milestone 47) and `backend/DELIVERY_SETUP.md` (Version 3, Milestone
25). **No courier API, credentials, or automation of any kind was
added. The R80 / free-from-R700 delivery pricing rule is unchanged.
No backend file, checkout logic, or PayFast configuration was
touched.**

## What Was Reviewed

- `src/pages/checkoutPage.js` — checkout delivery/payment wording.
- `src/pages/shippingPolicy.js`, `src/pages/returnsPolicy.js` — policy
  pages.
- `src/pages/orderConfirmation.js` — already accurate and honest about
  manual tracking ("there's no live courier tracking yet"); reviewed,
  not changed.
- `src/components/orderSummary.js` (cart/checkout order summary) —
  already shows the delivery fee and free-delivery-threshold note
  (Milestone 52); reviewed, not changed.
- `src/data/faqs.js` — existing Delivery-category FAQ entries.
- `src/js/cart.js` (`calculateDeliveryFee`) and
  `backend/src/config/delivery.ts` (`STANDARD_DELIVERY_FEE`,
  `FREE_DELIVERY_THRESHOLD`) — confirmed the R80/R700 rule and its
  single source of truth; not touched.
- `VERSION_6_COURIER_INTEGRATION_PLAN.md` and `backend/DELIVERY_SETUP.md`
  — confirmed the existing manual courier lifecycle
  (`Shipping.status`, `Order.fulfilmentStatus`, manual database
  updates, no admin dashboard) this milestone's checklist builds on.

## Delivery Wording Improvements

- **Checkout**: added a dedicated delivery note (separate from the
  existing payment notice) stating the R80/free-from-R700 rule, that
  Seasonedz Group confirms and arranges delivery manually once the
  order is placed, and that tracking details are shared manually —
  plus the real Email/WhatsApp contact details.
- **Shipping Policy**: restructured into the sections requested —
  "How Delivery Currently Works" (new intro section), "Delivery
  Fees", "Delivery Times", "Manual Courier Arrangement" (renamed from
  "Order Processing" for clarity), "Tracking Updates" (renamed from
  "Tracking Your Order"), and "Delivery Support" (now using the real
  contact details, and explicitly mentioning wrong delivery addresses).
- **FAQ**: see below.
- Nowhere does any of this promise instant delivery, automatic
  tracking, or a specific delivery timeframe — every change keeps the
  existing "times will vary" / "not yet live, real time" framing
  already established in Milestones 25 and 47.

## Checkout Delivery Note Result

Added `renderDeliveryNote()` to `checkoutPage.js`, shown after the
existing payment notice: states the R80/free-from-R700 rule, that
delivery is confirmed and arranged manually after the order is
placed, and that tracking is shared manually once available, followed
by the shared contact support note (Email/WhatsApp). The existing
payment notice's own text was trimmed to remove the now-redundant
generic "contact us" line, since delivery-specific contact is now its
own clearly delivery-focused note.

## Shipping Policy Result

Six clear sections, in order: How Delivery Currently Works, Delivery
Fees, Delivery Times, Manual Courier Arrangement, Tracking Updates,
Delivery Support. Every section keeps the honest, non-promising
framing already required by `backend/DELIVERY_SETUP.md`'s "What Not
to Do Yet" (no specific delivery timeframes, no claim of live
tracking).

## FAQ Delivery Result

Delivery category now has six entries (one tightened, four new):

| Question | Status |
|---|---|
| Do you deliver countrywide in South Africa? | Unchanged |
| How much does delivery cost, and when is it free? | Tightened wording (was "How much does delivery cost?") |
| How is my order delivered? | New — explains manual courier arrangement |
| Can I track my delivery? | New — honest about no live tracking yet, links to Track Order page |
| What if my delivery address is wrong? | New — contact us before dispatch, with real Email/WhatsApp links |
| Who do I contact for delivery help? | New — real Email/WhatsApp links |

## Manual Fulfilment Checklist

**Step 1, Check new orders daily.** Query the database (or Prisma
Studio) for orders created since the last check, per
`VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s "Daily Order Check
Process" — no admin dashboard exists yet.

**Step 2, Confirm payment status.** For `BANK_TRANSFER`: check the
real business bank account/statement for a matching transfer. For
`CASH_ON_DELIVERY`: no upfront confirmation needed. For `PAYFAST`:
`paymentStatus` already reflects a verified ITN — no manual check
needed for the payment itself.

**Step 3, Confirm customer delivery details.** Re-read the order's
`deliveryStreetAddress`/`deliverySuburb`/`deliveryCity`/
`deliveryProvince`/`deliveryPostalCode`/`deliveryNotes` for anything
that looks incomplete or inconsistent before booking a courier. If
something looks wrong, contact the customer using their order's own
email/phone first, per the new "What if my delivery address is
wrong?" FAQ.

**Step 4, Pack order carefully.** Match packed items against the
order's line items (`OrderItem` snapshots product name/slug/quantity
at time of purchase, so this is always accurate even if the live
catalogue changes later).

**Step 5, Choose courier option manually.** No courier is
automatically selected or quoted. Pick a suitable courier for the
parcel's size/weight and the delivery address, per
`VERSION_6_COURIER_INTEGRATION_PLAN.md`'s Courier Guy/PUDO/Bob Go
notes (an evaluation, not a decision made here).

**Step 6, Book courier outside the website.** Use the courier's own
portal/phone/app — there is no courier API integration in this
codebase, and this milestone does not add one.

**Step 7, Save waybill or tracking number.** Record whatever
reference the courier provides once booked, ready for Step 8.

**Step 8, Send tracking update manually to customer.** Contact the
customer directly (their order's own email/phone, or Seasonedz
Group's own Email/WhatsApp for follow-up questions) with the
waybill/tracking reference from Step 7 — there is no automated email
send for this yet (see `VERSION_6_EMAIL_SERVICE_PLAN.md`; email
sending stays disabled, unchanged by this milestone).

**Step 9, Mark order status manually where possible or note
externally.** Update `Order.fulfilmentStatus` and the related
`Shipping` fields (`status`, `courierName`, `trackingNumber`,
`trackingUrl`, `shippedAt`) directly in the database, per
`backend/DELIVERY_SETUP.md`'s "How Order Status and Fulfilment Status
Should Work". If a direct database update isn't practical in the
moment, note the update externally (e.g. a shared spreadsheet or
notes) and apply it to the database as soon as possible afterward —
consistency between what's recorded and what's true matters more than
speed.

**Step 10, Handle delivery problems through customer support.** Any
delivery issue (delayed, lost, wrong address, damaged in transit) is
handled directly with the customer via Seasonedz Group's own contact
channels (Email: `Nedzamb1a@gmail.com`, WhatsApp: `+27 72 844 5644`),
per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s existing refund/issue
handling process — never through an automated system, since none
exists.

## What Changed on the Website

- `src/pages/checkoutPage.js` — new dedicated delivery note.
- `src/pages/shippingPolicy.js` — restructured into six clearer
  sections, using the real contact details.
- `src/data/faqs.js` — Delivery category expanded from two entries to
  six.
- This document (new).

## What Remains Manual

Everything described in the checklist above: daily order checks,
payment confirmation for Bank Transfer, delivery address review,
packing, courier selection, courier booking, waybill/tracking capture,
customer notification, and `fulfilmentStatus`/`Shipping` database
updates. No part of the courier lifecycle is automated by this or any
prior milestone.

## What Should Be Automated Later

Unchanged from `VERSION_6_COURIER_INTEGRATION_PLAN.md`'s own priority
order, restated here for convenience:

1. Automatic tracking number/URL capture from a courier's booking
   response (removes Step 7's manual data entry, lowest risk).
2. Courier webhook-based status updates (in-transit/delivered),
   following the same ITN-style verification pattern already proven
   for PayFast payments.
3. Real-time courier quotes at checkout — the most complex and
   highest-risk change; only worth it once real shipping cost
   variance justifies replacing the current flat R80/free-from-R700
   rule.

An admin dashboard (to replace direct database writes for Step 9)
remains explicitly out of scope for this and every prior milestone,
per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s "Recommended Future
Admin Dashboard Features".

## Safety Confirmation

- No payment code changed — no file under `backend/src/services/`,
  `backend/src/controllers/`, `src/js/orders.js`, or
  `src/js/api/paymentsApi.js` was touched.
- No checkout payment behaviour changed — `checkoutPage.js`'s payment
  method radios, form fields, and submission wiring are byte-for-byte
  unchanged; only the delivery note (new) and one trimmed sentence in
  the existing payment notice changed.
- No PayFast changes — confirmed live (see Testing Result).
- No backend order creation logic changed — no file under
  `backend/src/` was touched at all.
- No delivery price logic changed — `src/js/cart.js`'s
  `calculateDeliveryFee` and `backend/src/config/delivery.ts` were
  reviewed, not edited. The R80/R700 rule is stated, never
  recalculated, wherever this milestone touched wording.
- No `.env` file changed.
- No credentials added.
- No real courier booking made — this milestone only wrote
  documentation and static customer-facing wording; no courier
  portal, API, or account was touched.
- No test order created.

## Testing Result

Ran the frontend locally (`npm run dev`) and checked every changed
page plus the homepage, cart, and a product page in a real browser
(Playwright):

| Check | Result |
|---|---|
| Checkout: new delivery note shows R80/free-from-R700 rule and contact details | Passed |
| Shipping Policy: all six sections render with correct content | Passed |
| FAQ: all six Delivery entries render, including the four new ones with working Email/WhatsApp links | Passed |
| Cart/checkout order summary: unchanged, still shows delivery fee and free-delivery note | Passed |
| PayFast radio still `disabled`, label still "PayFast (Coming Soon)" | Passed |
| Bank Transfer radio still selectable, not disabled | Passed |
| Console errors | Only the standard, expected "backend not running locally" connection-refused warnings — harmless, unrelated to this milestone |
| Backend `npm run build` | Passed |
| Backend `npm run lint` | Passed |
| Frontend `npm run build` | Passed |
