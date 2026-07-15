# Delivery Setup (Version 3, Milestone 25 — Preparation Only)

This document covers delivery rules and courier workflow **as they
exist today** plus **preparation only** for a future real courier
integration. No courier API is integrated, no courier credentials
exist anywhere in this codebase, and courier fulfilment remains
entirely manual.

## Current Delivery Fee Rule

- Standard delivery: **R80** flat rate.
- Free delivery: subtotal of **R700 or more**.
- This is unchanged from earlier milestones — Milestone 25 only moved
  where the numbers live (see "What Changed" below), not the rule
  itself.

Single source of truth: `backend/src/config/delivery.ts`
(`STANDARD_DELIVERY_FEE`, `FREE_DELIVERY_THRESHOLD`). `backend/src/utils/money.ts`'s
`calculateDeliveryFee()` (Decimal-based, used directly by
`order.service.ts`'s real order transaction) and
`backend/src/services/delivery.service.ts`'s plain-number
`calculateDeliveryFee()`/`getDeliverySummary()` (for anything else that
needs the rule) both read from this one config module. The frontend's
own copy (`src/js/cart.js`, used for the cart/checkout display before
an order is even created) still has its own matching constants — this
duplication is intentional (client-side display estimate vs.
server-side authoritative calculation), not something Milestone 25
changed; the backend never trusts a client-supplied delivery fee
regardless.

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
