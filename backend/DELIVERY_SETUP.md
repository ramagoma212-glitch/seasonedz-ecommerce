# Delivery Setup (Version 3, Milestone 25 — Preparation Only)

This document covers delivery rules and courier workflow **as they
exist today** plus **preparation only** for a future real courier
integration. No courier API is integrated, no courier credentials
exist anywhere in this codebase, and courier fulfilment remains
entirely manual.

## Current Delivery Fee Rule

- Standard delivery: **R80** flat rate.
- Free delivery: only for a **logged-in registered customer**, on a
  subtotal of **R500 or more**. A guest checkout always pays R80,
  regardless of subtotal.
- Version 7, Milestone 131 replaced the old flat "free from R700 for
  everyone" rule with this registered-account benefit — see
  `backend/src/config/delivery.ts`'s own header comment for the full
  rule and rationale.
- **Version 7, Milestone 152B**: a **digital-only** order (every line
  item `DIGITAL`, none `PHYSICAL`) is never charged a delivery fee —
  **R0** regardless of subtotal or registered-customer status, since
  there is nothing to physically deliver. A **mixed** order (at least
  one `PHYSICAL` item alongside digital ones) is charged the normal
  fee above, unaffected by the digital items also being present.

Eligibility is decided **only** from the verified `customer_session`
cookie (`req.customerUser.type === "REGISTERED"`, read in
`order.controller.ts` via `optionalCustomerAuth` and passed into
`order.service.ts`'s `createOrder()`) — never from anything a request
body claims. Whether an order has any physical item is likewise decided
only from the verified line items themselves
(`order.service.ts`'s own `verifiedItems`), never a client claim.

Single source of truth: `backend/src/config/delivery.ts`
(`STANDARD_DELIVERY_FEE`, `REGISTERED_FREE_DELIVERY_THRESHOLD`).
`backend/src/utils/money.ts`'s `calculateDeliveryFee(subtotal,
isRegisteredCustomer, hasPhysicalItems = true)` (Decimal-based, used
directly by `order.service.ts`'s real order transaction) and
`backend/src/services/delivery.service.ts`'s plain-number
`calculateDeliveryFee()`/`getDeliverySummary()` (for anything else that
needs the rule) both read from this one config module — the third
`hasPhysicalItems` parameter defaults `true` so every pre-Milestone-152B
caller keeps its exact prior behaviour unless it explicitly says an
order has no physical items. The frontend's own copy (`src/js/cart.js`,
used for the cart/checkout display before an order is even created)
still has its own matching constants and the same
`hasPhysicalItems`-parameter shape — this duplication is intentional
(client-side display estimate vs. server-side authoritative
calculation); the backend never trusts a client-supplied delivery fee,
customerId, registered status, or product-type composition regardless.

## Manual Courier Process

There is no courier API integration. Today, the full lifecycle is:

1. An order is created (`POST /api/orders`) with `Shipping.status:
   NOT_STARTED` and no courier details.
2. Once payment is confirmed — immediately for `BANK_TRANSFER`/
   `CASH_ON_DELIVERY` (nothing currently verifies those server-side
   beyond order creation itself), or via a verified PayFast ITN for
   `PAYFAST` (Milestone 22) — Seasonedz Group staff manually prepare
   the order.
3. Staff manually update `Order.fulfilmentStatus` and `Shipping`
   fields (`status`, `courierName`, `trackingNumber`, `trackingUrl`,
   `shippedAt`, `deliveredAt`) directly — there is no admin dashboard
   yet (out of scope for this milestone and several before it), so
   this happens via direct database access.
4. The customer's Track Order page reflects whatever was manually set
   — it is a real, honest status display, but it is **not** a live
   courier feed. See "Why Courier Tracking Is Not Live Yet" below.

## How Order Status and Fulfilment Status Should Work

Three separate status fields already exist on `Order` (unchanged by
this milestone, documented here for clarity since courier prep touches
all three):

| Field | Meaning | Set by |
|---|---|---|
| `Order.status` | Overall order lifecycle (`PENDING` → `CONFIRMED` → ... → `DELIVERED`, or `CANCELLED`/`REFUNDED`) | Order creation; PayFast ITN moves `PENDING` → `CONFIRMED` on a verified `COMPLETE` (Milestone 22) |
| `Order.paymentStatus` | Whether payment is confirmed | Order creation (`PENDING`); PayFast ITN (`PAID`/`FAILED`/`CANCELLED`) |
| `Order.fulfilmentStatus` / `Shipping.status` | Physical preparation/delivery progress (`NOT_STARTED` → `PACKING` → `READY` → `SHIPPED` → `DELIVERED`, or `RETURNED`) | Manually, by Seasonedz Group staff |

`fulfilmentStatus`/`Shipping.status` should only meaningfully advance
past `NOT_STARTED` once `paymentStatus` reflects a genuinely confirmed
payment (or, for bank transfer/cash on delivery, once staff have
otherwise confirmed the order) — this is a process expectation for
whoever operates the manual workflow today, not something enforced in
code yet (there's no admin dashboard to enforce it through).

## Future Courier Integration Options

No provider has been chosen. Realistic options for a future milestone,
similar in spirit to the email provider options documented in
`EMAIL_SETUP.md`:

- **The Courier Guy** — widely used in South Africa, has a developer
  API for rate quotes, waybill generation, and tracking.
- **PUDO** — locker/pickup-point network, useful if Seasonedz Group
  wants a cheaper collection-point delivery option alongside door-to-door.
- **Bob Go (formerly Bob Go / "Bobgo")** — a South African multi-courier
  aggregator API (quotes across several couriers at once), which could
  reduce the need to integrate multiple courier APIs individually.

Whichever is chosen, the integration work would replace the manual
steps above with real API calls, most likely inside a new
`courier.service.ts` alongside the existing `delivery.service.ts`
(delivery *fee* rules) and `payfast.service.ts` (a useful structural
parallel: a `*.service.ts` per external concern, an `*Enabled` flag,
and a config module).

## Future Courier Environment Variables (Documentation Only)

**Placeholders only — nothing here is read by any code yet, and none
of these should ever contain real values in this milestone:**

```
COURIER_PROVIDER=
COURIER_API_KEY=
COURIER_API_SECRET=
COURIER_WEBHOOK_SECRET=
COURIER_COLLECTION_ADDRESS_ID=
```

Following the same pattern as `PAYFAST_ENABLED`/`EMAIL_ENABLED`, a
future `COURIER_INTEGRATION_ENABLED` flag (already present, hardcoded
`false`, in `backend/src/config/delivery.ts`) would need to become a
real env-driven flag at that point, defaulting to `false`, with
credentials only eagerly required once it's explicitly turned on.

## What Not to Do Yet

- Do not add real Courier Guy, PUDO, Bob Go, or any other courier
  credentials anywhere (env files, code, or otherwise).
- Do not call any courier API, sandbox or production.
- Do not invent specific delivery timeframes (e.g. "3-5 business
  days") anywhere customer-facing unless that number is actually
  configured and meant — the current wording deliberately stays
  general ("times will vary").
- Do not claim live/real-time courier tracking exists anywhere in the
  UI — every tracking-related notice must stay honest that this is a
  manually-updated backend status, not a live feed.
- Do not build an admin dashboard for this (explicitly out of scope
  for this and prior milestones).

## Why Courier Tracking Is Not Live Yet

There is no courier API integrated, so there is nothing to poll or
receive webhooks from. Every "tracking" surface in this codebase
(`GET /api/orders/:orderNumber/tracking`, the Track Order page, the
order confirmation page) reflects `Order.fulfilmentStatus`/`Shipping`
fields that a human sets directly — the same honest framing already
established for payment (a browser redirect isn't proof of payment;
here, a status field isn't a live courier feed). This will only change
once a real courier provider is chosen and integrated in a future
milestone, at which point tracking data would come from that
provider's API/webhooks instead of manual entry.

## Automatic Courier Guy Booking (Version 7, Milestones 139-141 — foundation built, DISABLED by default)

Courier Guy quoting (Milestone 108) and manual admin booking (Milestone
112) are both real and live, gated behind `COURIER_GUY_ENABLED` and
`COURIER_GUY_BOOKING_ENABLED`. Milestone 139 adds the foundation for
**automatic** booking — triggered by the backend itself the moment a
PayFast payment is confirmed PAID, with no admin action needed — but
**this stays fully disabled in production until the owner explicitly
approves turning it on.**

### The new flag: `COURIER_GUY_AUTO_BOOKING_ENABLED`

A third, independent flag — separate from `COURIER_GUY_ENABLED` (quote)
and `COURIER_GUY_BOOKING_ENABLED` (manual admin booking). All three must
be `true` for automatic booking to ever run. Turning automatic booking
off never disables the admin's own manual quote/book flow, and vice
versa. **Defaults to `false`.**

### `COURIER_GUY_AUTO_BOOKING_SERVICE_CODES` — the approved priority list (Milestone 141)

Automatic booking no longer relies on one fixed service code. Instead,
`autoBookCourierForPaidOrder()` calls the existing, read-only
`getCourierQuote()` first, then picks the **first code from this list
(in order) that actually appears in that order's live quote**:

```
COURIER_GUY_AUTO_BOOKING_SERVICE_CODES=LOF,ECO
```

- Comma-separated, case-insensitive, trimmed. Matched against each
  quote option's `serviceLevelCode` only (not `serviceLevelId`).
- If multiple quote options share the same approved code, the cheapest
  is chosen (first occurrence if tied on price).
- If the list is missing or empty, automatic booking safely skips
  every order and records `courierBookingError` — it never falls back
  to picking an arbitrary/cheapest service outside this list.
- **`SDX` (Same Day Express) is deliberately never included by
  default.** It is the one code that appears in *every* zone's quote
  (see the Milestone 140 finding below), which would make it tempting
  to include as a universal fallback — but it is a premium, same-day
  price tier, not an appropriate default for ordinary automatic
  fulfilment. Only `LOF` and `ECO` — the respective cheapest tier in
  each of the two zone families Seasonedz Group actually ships to —
  are approved by default.
- If neither `LOF` nor `ECO` appears in a quote (e.g. only `SDX` was
  returned), the attempt fails safely and is recorded, exactly like any
  other automatic-booking failure — no booking is ever made outside the
  approved list.

### `COURIER_GUY_DEFAULT_SERVICE_CODE` — legacy/reference only, no longer used

This single fixed-code variable predates the quote-first approach above
(Milestone 139) and is **no longer read by the automatic-booking
selection logic**. It is kept in code only for reference/rollback and
can be left unset. Do not rely on it — set
`COURIER_GUY_AUTO_BOOKING_SERVICE_CODES` instead.

### Milestone 140 finding: a single fixed code is not enough

Real quote checks (2026-07-26, against 4 real orders covering Pretoria,
Johannesburg/Sandton, Polokwane, and Cape Town — all deleted afterward)
found that Courier Guy's own `/rates` response depends on the
**delivery zone relative to the collection address**, not just parcel
size:

- **Gauteng addresses** (Pretoria, Johannesburg/Sandton both confirmed
  identical): only "Local" tier codes are offered — `LOF` (Local
  Overnight, ~R117), `LSF`/`LSE` (Local Same Day Flyer/Economy,
  ~R134), `LOX` (Local Overnight Parcel, ~R135), plus `SDX` (Same Day
  Express, premium, ~R1031).
- **Everywhere else** (Polokwane, Cape Town both confirmed identical in
  code set, though `OVN`/`SDX` pricing varies by distance): only
  "national" tier codes are offered — `ECO` (Economy, ~R117), `OVN`
  (Overnight, R187-R197 depending on distance), plus `SDX` again.

**`ECO` and `LOF` never appear in the same quote response.** A fixed
`COURIER_GUY_DEFAULT_SERVICE_CODE` set to either one will make
automatic booking fail (safely — see below — but still fail) for
every order in the *other* zone. Since Seasonedz Group's collection
address is in Gauteng, this means roughly half of South Africa's
provinces would never auto-book successfully with a single fixed
code — not a rare edge case.

**Implemented in Milestone 141:** `autoBookCourierForPaidOrder()` now
calls `getCourierQuote()` first, then picks the first match from the
approved `COURIER_GUY_AUTO_BOOKING_SERVICE_CODES` list (default
`LOF,ECO`) tried in priority order, rather than assuming one fixed code
is always present. If neither approved code appears in the quote, the
attempt fails safely and records `courierBookingError`, exactly as it
already did before. Automatic booking is still disabled by default
(`COURIER_GUY_AUTO_BOOKING_ENABLED=false`) until a real, controlled
live test is explicitly approved — see the checklist below.

### What happens on a real PayFast payment once enabled

`processPayfastNotification()`'s `"COMPLETE"` handling calls
`autoBookCourierForPaidOrder(orderNumber)` immediately after an order's
`paymentStatus` genuinely transitions to `PAID` for the first time —
fire-and-forget, exactly like the existing payment-confirmation email.
A duplicate ITN can never trigger a second attempt (the same
idempotency guard that protects the email protects this too). If
Courier Guy accepts the booking, the order gets the same
`courierShipmentId`/`trackingNumber`/etc. fields a manual booking would
save. If Courier Guy rejects it, is unreachable, or the order is
missing something it needs, the attempt fails safely: **the PayFast
payment itself is never affected, the order stays `PAID`**, and
`Shipping.courierBookingAttemptedAt`/`courierBookingError` are set so
an admin can see something needs attention — visible on the admin
order detail page. Retrying is simply using the existing manual
quote/book form on that same page; no separate "retry" button exists
because none is needed.

### Rollback and cancellation warning — read this before ever enabling

**Once a real Courier Guy shipment is created via the API, turning
`COURIER_GUY_AUTO_BOOKING_ENABLED` back to `false` (or reverting the
code) does not cancel that shipment.** The booking already happened on
Courier Guy's side and is a real, billable, physical-world commitment.
This codebase has no cancellation API call implemented anywhere. **A
wrong-address booking, or any booking that needs to be undone, must be
handled directly in the Courier Guy portal or via their support** —
never assume disabling the website feature undoes anything already
booked.

### Before ever setting `COURIER_GUY_AUTO_BOOKING_ENABLED=true` in production

1. Confirm `COURIER_GUY_AUTO_BOOKING_SERVICE_CODES` (default `LOF,ECO`) still matches what Courier Guy actually returns, via a real, manually-confirmed quote first.
2. Get explicit owner approval for a real, controlled live test.
3. Watch the very first automatically-booked order closely in the admin dashboard.
4. Know how to cancel/correct a booking in the Courier Guy portal before you need to.
