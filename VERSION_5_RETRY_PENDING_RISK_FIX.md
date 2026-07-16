# Version 5 — Retry While PENDING Risk Fix (Milestone 34)

Removes the duplicate-payment risk identified in
`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`: a customer
could previously retry a PayFast payment while the order was still
`PENDING` — meaning a first attempt genuinely still in flight and a
retry attempt could both independently complete, with PayFast having no
way to know they were "the same order."

## New Rule

- PayFast retry is allowed only when `paymentStatus` is `FAILED` or
  `CANCELLED`.
- PayFast retry is **not** allowed when `paymentStatus` is `PENDING`.
- PayFast retry is **not** allowed when `paymentStatus` is `PAID`.
- PayFast retry is **not** allowed for `BANK_TRANSFER` or any other
  non-PayFast payment method.
- Checkout's own first initiation (immediately after creating a fresh
  `PAYFAST` order, which always starts `PENDING`) is unaffected — it
  must still work exactly as before.

## Checkout Initiation vs. Retry Initiation

The single endpoint `POST /api/payments/payfast/initiate` now takes an
optional `context` field: `"checkout"` or `"retry"`.

- **`context: "checkout"`** — used only by the checkout flow's own
  first PayFast redirect, right after `POST /api/orders` creates a new
  order. May only initiate an order that is still `PENDING` — the one
  state a freshly-created order can be in.
- **`context: "retry"`** — used by the "Try PayFast Again" button on
  the payment-success/cancelled/failed pages. May only initiate an
  order that is `FAILED` or `CANCELLED`.
- **Missing or unrecognized `context`** — safely defaults to the
  stricter retry-eligible set (`FAILED`/`CANCELLED` only), never the
  permissive checkout set. Only the literal string `"checkout"` ever
  unlocks initiating a `PENDING` order. This is a deliberate fail-closed
  default: an old client or a bug that forgets to send `context` gets
  the safe behaviour, not the permissive one.

This split lives entirely in `initiatePayfastPayment()`
(`backend/src/services/payfast.service.ts`) via
`initiationEligibleStatuses(context)`. The notify/ITN side
(`processPayfastNotification`'s `COMPLETE` case) is unchanged — it must
still accept completing from `PENDING`, `FAILED`, or `CANCELLED`
(`PAYFAST_COMPLETABLE_STATUSES`, renamed from the old
`PAYFAST_RETRY_ELIGIBLE_STATUSES` but with the same three values),
since a `COMPLETE` ITN might belong to either a checkout-initiated
attempt (order still `PENDING`) or a retry-initiated one (order still
`FAILED`/`CANCELLED` right up until the ITN arrives — initiation never
touches `order.paymentStatus`).

## Allowed / Blocked Statuses

| Initiation context | `PENDING` | `FAILED` | `CANCELLED` | `PAID` | `REFUNDED` | Non-PayFast method |
|---|---|---|---|---|---|---|
| `checkout` | ✅ Allowed | ❌ | ❌ | ❌ | ❌ | ❌ (always, any context) |
| `retry` (or missing/invalid) | ❌ Blocked | ✅ Allowed | ✅ Allowed | ❌ | ❌ | ❌ (always, any context) |

A blocked retry on a `PENDING` order returns a specific, honest
customer-facing message rather than a generic error:

> "Your payment is still being verified. Please wait a few minutes
> before trying again or contact Seasonedz Group."

Every other blocked case (PAID/REFUNDED, non-PayFast method, cancelled/
refunded order) keeps its existing message — see
`backend/src/services/payfast.service.ts`.

Nothing about this fix creates a new order, creates a new `Payment` row
(still exactly one per order, reused on every attempt), reduces stock
again (already decremented once at order creation), or marks anything
as paid — `initiatePayfastPayment` never did any of those things, and
still doesn't.

## Frontend Changes

- `src/js/api/paymentsApi.js` — `initiatePayfastPayment(orderNumber,
  context)` now sends `context` in the request body.
- `src/js/payfastRetry.js` — `retryPayfastPayment(orderNumber,
  context)` takes `context` and passes it straight through; both
  parameters are required at every call site rather than defaulted, so
  intent is explicit at the call site.
- `src/js/app.js` — checkout's `redirectToPayfast()` passes
  `"checkout"`; the "Try PayFast Again" button's `handleRetryPayfast()`
  passes `"retry"`.
- `src/components/payfastRetry.js` — `isPayfastRetryEligible()` no
  longer includes `PENDING` in its eligible-statuses list, so the "Try
  PayFast Again" button is never shown at all for a `PENDING` order
  (not just disabled-with-wording — genuinely not rendered). This is a
  UI convenience only; the backend independently rejects `PENDING`
  retries regardless of what the frontend shows.

## Page Wording

- **`PENDING`** (all three status pages): no retry button. Offers
  "Check Again", "Track Order", and "Contact Seasonedz Group" instead.
  `paymentSuccess.js` already had "please do not place another order
  yet" copy; `paymentCancelled.js`/`paymentFailed.js` gained a dedicated
  `isPendingPayfast` branch so a `PENDING` PayFast order no longer falls
  through to the generic "Try Again → new checkout" link, which would
  have been misleading for an order whose first attempt might still
  complete.
- **`FAILED`/`CANCELLED`**: "Try PayFast Again" offered, as before.
- **`PAID`**: "Payment Confirmed" (or "Good News — This Order Is
  Already Paid" on the cancelled/failed pages), never any retry option.

## Pending Payment Storage

Unchanged — `src/js/pendingPayment.js` still expires a stored
`orderNumber`/`paymentMethod` reference after 24 hours, and every page
still clears it only once the backend returns a terminal status
(`PAID`/`FAILED`/`CANCELLED`), never just because a retry was blocked or
because the customer landed on a status page.

## Testing

All testing was local-only, using controlled test orders created
directly via Prisma (bypassing checkout) plus real local checkout
submissions — no hosted PayFast payment was completed at any point;
every attempt that would have redirected to PayFast's real sandbox page
was intercepted and aborted before leaving localhost.

**Backend** (`POST /api/payments/payfast/initiate`, local dev,
`PAYFAST_ENABLED=true` via an inline environment override — `.env`
itself was never edited):

| Case | Result |
|---|---|
| `PENDING` + `context: "checkout"` | ✅ Allowed — real signed PayFast fields returned |
| `PENDING` + `context: "retry"` | ✅ Blocked — "still being verified" message |
| `FAILED` + `context: "retry"` | ✅ Allowed |
| `CANCELLED` + `context: "retry"` | ✅ Allowed |
| `PAID` + `context: "retry"` | ✅ Blocked — "already been processed" |
| `BANK_TRANSFER` + `context: "retry"` | ✅ Blocked — "not created for PayFast payment" |
| `PENDING` + missing `context` | ✅ Blocked (safe default) |
| `FAILED` + missing `context` | ✅ Allowed (safe default still permits retry-eligible statuses) |
| `PENDING` + invalid `context` (e.g. `"bogus"`) | ✅ Blocked, same as missing |

**Frontend** (local dev, `VITE_PAYFAST_ENABLED=true` via an inline
environment override, real local backend):

- Checkout's own PayFast initiation: confirmed via network capture that
  `POST /api/payments/payfast/initiate` was sent with `context:
  "checkout"`, and that the resulting signed form (captured and aborted
  before reaching PayFast) was correctly built.
- `payment-success`/`payment-cancelled`/`payment-failed` for a
  `PENDING` order: no retry button on any of the three; "Check Again",
  "Track Order", and "Contact Seasonedz Group" all present.
- Same three pages for `FAILED`/`CANCELLED` orders: retry button
  present, with the correct order number.
- Clicking retry on a `FAILED` order: confirmed via network capture
  that `context: "retry"` was sent.
- `PAID` order on `payment-success`: "Payment Confirmed", no retry
  button.
- Database checks before/after: no duplicate orders, no duplicate
  `Payment` rows (still exactly one per order), no unexpected stock
  change from any retry attempt.
- Zero console errors across every page tested.

One real environmental quirk encountered during testing, unrelated to
this fix: this local environment's Supabase connection pool became
temporarily congested from many short-lived one-off Prisma scripts run
earlier in the same session, making real order-creation calls take up
to ~9 seconds instead of the usual sub-second response — never a hang,
confirmed by re-testing with a longer timeout. Test wait times were
adjusted accordingly; this is a local tooling artifact, not a product
behaviour change.

## Database Cleanup

11 test orders created during this milestone's testing (5 direct-Prisma
controlled test orders, 6 from real local checkout submissions) were
deleted, and stock on "School Starter Colouring Pack" was restored by
exactly the 6 units the real-checkout orders had decremented (40 → 46,
matching the pre-testing baseline). `SG-2026-28SM` was confirmed
untouched throughout.

## Remaining Future Improvement: Payment Attempt Model

This fix removes the specific race this milestone targets (a `PENDING`
order's first attempt colliding with a retry), but it does not add real
duplicate-*detection*. `Payment` is still a strict one-to-one with
`Order` (`Payment.orderId String @unique`), and PayFast's own
per-transaction `pf_payment_id` is still never compared against a
previously-recorded value — a second, genuinely different successful
PayFast transaction for an order already marked `PAID` would still be
silently acknowledged as a "duplicate notification," indistinguishable
from a harmless repeated delivery of the same ITN. Building a real
payment-attempt model (tracking each PayFast attempt and its
`pf_payment_id` separately) remains recommended future work — see
`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`'s retry
recommendation (Option D) and this repo's suggested Milestone plan.
