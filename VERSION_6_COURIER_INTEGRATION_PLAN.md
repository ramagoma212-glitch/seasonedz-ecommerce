# Version 6 — Courier Integration Plan (Milestone 47)

Planning only. **No courier API code was added as part of this
milestone**, and no courier credentials exist anywhere in this
codebase. This builds on `backend/DELIVERY_SETUP.md` (Version 3,
Milestone 25) with a concrete plan for what manual work could
eventually be automated, and what should deliberately stay manual for
now.

## Current Delivery Rule

- Standard delivery: **R80** flat rate.
- Free delivery: subtotal of **R700 or more**.
- Single source of truth: `backend/src/config/delivery.ts`
  (`STANDARD_DELIVERY_FEE`, `FREE_DELIVERY_THRESHOLD`), read by both
  the Decimal-based server-authoritative calculation
  (`backend/src/utils/money.ts`) and the plain-number version used
  elsewhere (`backend/src/services/delivery.service.ts`). The
  frontend's own matching constants (`src/js/cart.js`) are a display
  estimate only — the backend never trusts a client-supplied delivery
  fee. This rule is unchanged by this milestone.

## Current Manual Courier Workflow

There is no courier API integration today. The full lifecycle is
entirely manual, per `backend/DELIVERY_SETUP.md`:

1. Order created with `Shipping.status: NOT_STARTED`.
2. Once payment is confirmed (immediately for
   `BANK_TRANSFER`/`CASH_ON_DELIVERY`, or via verified PayFast ITN),
   staff manually prepare the order.
3. Staff manually update `Order.fulfilmentStatus` and `Shipping`
   fields directly in the database — no admin dashboard exists yet.
4. The customer's Track Order page reflects whatever was manually set
   — honest, but not a live courier feed.

## Courier Guy or PUDO Planning

Two realistic South African courier options worth evaluating when
automation becomes worthwhile:

- **The Courier Guy** — established national courier with an API for
  quote/booking/tracking; a common choice for South African ecommerce
  of this size.
- **PUDO** — locker/pickup-point-based delivery, often cheaper for
  smaller/lighter parcels (colouring books and stationery fit this
  well) and popular for cost-conscious South African ecommerce.

Neither is chosen yet — this is a future evaluation, not a decision
made here. A reasonable approach once volume justifies it: offer both
(door-to-door via Courier Guy, locker pickup via PUDO) and let the
customer choose at checkout, similar to how many South African stores
already operate.

## Courier Quote Integration (Later)

- Real-time courier quotes (by parcel weight/dimensions and delivery
  address) would replace today's flat R80/free-from-R700 rule with an
  actual carrier-calculated rate.
- This is a bigger change than it first sounds: it touches checkout UX
  (showing a quote before payment), server-side order total
  calculation (currently a simple, deterministic rule — a live quote
  introduces an external dependency into checkout), and needs its own
  fallback if the courier's quote API is briefly unavailable.
- Recommendation: keep the current flat rule until real order volume
  and real shipping cost data justify the added complexity — a flat
  rate is simpler, predictable for customers, and easier to reason
  about server-side (no external call needed to compute an order
  total).

## Address Validation Planning

- A courier API integration would typically also validate/normalise
  delivery addresses (correct suburb/postal code, flag unserviceable
  areas) before checkout completes.
- Until then, the existing checkout form's own field-level validation
  (required fields, province dropdown) is the only address check in
  place — sufficient for manual courier booking, not for automated
  quote/booking.

## Delivery Tracking Planning

- A real integration would let `Shipping.trackingNumber`/`trackingUrl`
  be set automatically from the courier's own booking response, and
  ideally receive webhook updates (in-transit, delivered) the way
  PayFast's ITN pattern already works for payments — the same
  "server-to-server notification is the only trustworthy update"
  principle already proven in this codebase could extend naturally to
  courier tracking.
- Until then, `Shipping` fields are set manually and the Track Order
  page already correctly discloses this is "a Seasonedz Group backend
  status, not a live courier" — that honest disclosure should stay in
  place even after a real integration exists for any order still
  going through manual handling.

## Order Fulfilment Process

- Unchanged from `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s own
  description: manual `fulfilmentStatus`/`Shipping` updates per paid
  order, today. A courier integration would replace the manual
  `Shipping` field entry with an automatic one, not change anything
  else about the order lifecycle.

## Manual Fallback Process

Even after any future courier integration, a manual fallback should
always exist:

- If the courier API is unavailable or a specific order needs special
  handling (oversized parcel, remote area, customer pickup
  arrangement), staff must still be able to fall back to manually
  setting `Shipping` fields directly, exactly as today.
- Never make the courier API a hard dependency for completing an
  order's fulfilment — it should be an automation on top of the manual
  process, not a replacement that could block fulfilment if it's down.

## Risks of Courier API Integration

- **External dependency in checkout** if quotes become part of
  checkout itself — an outage or slow response could block real
  customers from completing checkout entirely, unlike today's
  dependency-free flat rate.
- **Credential management** — a courier API key is another secret to
  protect, on top of PayFast and (later) email provider credentials;
  the same discipline (never tracked in git, never in `.env.example`
  with a real value) must extend to this too.
- **Webhook/tracking authenticity** — if delivery-status webhooks are
  ever added, they'd need the same "verify this genuinely came from
  the courier" discipline already built for PayFast's ITN (signature/
  source checks), not blind trust in an inbound POST.
- **Cost complexity** — real-time quotes can create confusing
  cost differences between what a customer expected and what
  checkout charges, if not communicated clearly.

## What Can Stay Manual for Now

- Courier booking itself (calling/using the courier's own portal) —
  entirely reasonable to keep manual at current order volumes.
- Delivery fee calculation — the current flat R80/free-from-R700 rule
  is simple, predictable, and needs no external dependency.
- Delivery tracking updates — manual `Shipping` field entry is honest
  and sufficient until real order volume makes it a bottleneck.

## What Should Be Automated Later

In priority order, once volume justifies the engineering effort:

1. Automatic tracking number/URL capture from courier booking
   (removes a manual data-entry step, low risk).
2. Courier webhook-based status updates (in-transit/delivered),
   following the ITN-style verification pattern already proven for
   payments.
3. Real-time courier quotes at checkout — the most complex and
   highest-risk change; only worth it once shipping cost variance
   (parcel size/weight, distance) is large enough that a flat rate is
   genuinely costing the business money either way (undercharging
   heavy/far orders, overcharging light/near ones).
