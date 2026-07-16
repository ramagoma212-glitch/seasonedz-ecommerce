# Version 4 — Payment Failure and Retry Polish (Milestone 31)

Polishes the customer-facing payment failure/cancelled/retry
experience without weakening backend payment security. **The frontend
still never marks a payment as paid, failed or cancelled — the
backend's notify route remains the only path that can ever change
`paymentStatus`.** This milestone only ever adds a way to *re-initiate*
an existing eligible order's PayFast attempt, and reads/displays
whatever the backend already has on record — nothing here writes
payment status.

## Retry Behaviour

A customer whose PayFast payment didn't reach `PAID` — still pending,
failed, or cancelled before completing — can click **"Try PayFast
Again"** from the payment-success, payment-cancelled or payment-failed
page. This calls the *same* `POST /api/payments/payfast/initiate`
endpoint checkout itself uses, with the same `orderNumber`, and submits
whatever PayFast form fields/signature it returns — exactly the same
mechanism as the first attempt, just invoked again. No new order is
ever created; the existing `Payment` row is reused, never duplicated;
stock is never touched (it was only ever decremented once, at order
creation).

## What Can Retry

| `paymentMethod` | `paymentStatus` | Retry? |
|---|---|---|
| `PAYFAST` | `PENDING` | Yes |
| `PAYFAST` | `FAILED` | Yes |
| `PAYFAST` | `CANCELLED` | Yes |
| `PAYFAST` | `PAID` | **No** |
| `PAYFAST` | `REFUNDED` | **No** |
| `BANK_TRANSFER` (or any non-PayFast method) | any | **No** |

`Order.status` being `CANCELLED` or `REFUNDED` also blocks retry
regardless of `paymentStatus` (a separate, pre-existing check).

## What Cannot Retry, and Why

- **`PAID` orders never retry** — there's nothing to retry; the
  frontend shows a confirmation instead, and the backend independently
  rejects an initiate attempt for a paid order with `400` (`"This
  order's payment has already been processed."`) even if a stale page
  or a direct API call tried anyway.
- **`REFUNDED` orders never retry** — a refunded order is never
  re-chargeable; retrying would be nonsensical regardless of what a
  customer's browser shows.
- **`BANK_TRANSFER` orders never show or accept PayFast retry** —
  they were never a PayFast payment to begin with; the backend
  rejects with `400` (`"This order was not created for PayFast
  payment."`) and the frontend never renders the button for a
  non-PayFast order in the first place.
- **A single failed/cancelled *attempt* never cancels the *order*** —
  `Order.status` deliberately stays as it was (see
  `backend/PAYFAST_SETUP.md`'s "FAILED/CANCELLED `order.status`
  decision") specifically so retry remains possible; this milestone is
  what makes that retry actually reachable from the customer-facing
  pages, rather than just a theoretical possibility.

## Backend Changes

`backend/src/services/payfast.service.ts`:

- Added `PAYFAST_RETRY_ELIGIBLE_STATUSES` (`PENDING`, `FAILED`,
  `CANCELLED`), shared by two places that previously used two
  *different* (and inconsistent) checks:
  - `initiatePayfastPayment`'s eligibility check previously only
    allowed `PENDING` — a `FAILED` or `CANCELLED` order's retry
    attempt was rejected outright before this milestone.
  - `processPayfastNotification`'s `COMPLETE`-status guard previously
    only allowed completing from `PENDING` or `FAILED` — **not**
    `CANCELLED`. Fixing only the initiation check would have let a
    customer retry from `CANCELLED`, reach PayFast, pay successfully,
    and then have the resulting real ITN rejected at this guard — a
    real payment taken with no way for the backend to ever record it
    as paid. Both checks now use the same list, so a retry that's
    allowed to *start* is guaranteed to be allowed to *finish*.

`backend/src/services/order.service.ts`:

- Added `paymentMethod` to `OrderTrackingOutput` — the tracking
  endpoint the payment-status pages already call didn't expose it, and
  the frontend needs it to know whether an order was ever a PayFast
  order at all before offering PayFast retry.

## Frontend Changes

- **`src/js/payfastRetry.js`** (new) — `submitPayfastForm()` (the
  hidden-form-and-submit mechanic, extracted from `js/app.js` where it
  was checkout-only) and `retryPayfastPayment()` (calls initiate, then
  submits the form; throws on failure so callers show their own
  contextual error). Used by both checkout's first attempt and every
  retry button, so this logic exists in exactly one place.
- **`src/components/payfastRetry.js`** (new) — `isPayfastRetryEligible()`
  (a frontend-side mirror of the backend's allow-list, display-only —
  never the authority) and `renderPayfastRetryButton()`.
- **`src/js/app.js`** — `redirectToPayfast` (checkout) now calls the
  shared `retryPayfastPayment` instead of duplicating the form-building
  code; added a `data-action="retry-payfast"` handler
  (`handleRetryPayfast`) that disables the button, calls
  `retryPayfastPayment`, and on failure re-enables it with an inline
  error message next to it — never a silent failure, never a redirect
  to somewhere unrelated.
- **`src/pages/paymentSuccess.js` / `paymentCancelled.js` /
  `paymentFailed.js`** — each now shows "Try PayFast Again" instead of
  (or alongside, for the pending case) their previous generic "Try
  Again" (which just started an entirely new order at `#/checkout`)
  whenever `isPayfastRetryEligible` says the order qualifies. All three
  also now clear the pending-payment Local Storage reference once the
  backend reports a terminal status (`PAID`/`FAILED`/`CANCELLED`) —
  previously only payment-success did this.

## Why the Frontend Cannot Mark Payment Status

Every one of these three pages is reachable by a customer just typing
or bookmarking the URL — landing on `payment-success` proves nothing by
itself, and PayFast's own documentation is explicit that the
server-to-server ITN (`POST /api/payments/payfast/notify`) is the only
trustworthy confirmation of a payment outcome. If the frontend could
mark a payment as paid, failed or cancelled from its own read of a
redirect, a customer could reach any of these pages directly (with any
order number) and cause exactly that write. Every render in all three
pages is a `GET /api/orders/:orderNumber/tracking` read followed by
`if/else` on whatever the backend already has — never a write.

## Why the Cancelled Page Does Not Automatically Cancel an Order

Reaching `payment-cancelled` (PayFast's `cancel_url`) only proves the
customer's *browser* navigated there — it says nothing about whether
the *payment* actually completed. PayFast's ITN can arrive before or
after this redirect, in either order, so a customer could land on
"cancelled" for an order that (a) is still genuinely pending, or (b) —
rarer, but real — already completed in another tab moments earlier.
Automatically cancelling the order on page load would risk cancelling
a real completed or still-processing payment based on nothing but
browser navigation. Instead, the page always re-fetches the order's
real status and shows exactly that (including a "Good News — This
Order Is Already Paid" state for the rare already-paid case).

## Pending Payment Storage

`src/js/pendingPayment.js` stores only `orderNumber`, `paymentMethod`
and `createdAt` in Local Storage — never a status, a signature, or any
PayFast field, and never treated as proof of anything (every page
using it still re-fetches the order's real status before showing
anything). This milestone adds a 24-hour expiry: `getPendingPayment()`
now discards (and clears) a stored record older than that, so a stale
reference from days ago can't keep resurfacing the wrong order. It
continues to be cleared only once the backend reports a terminal
status (`PAID`/`FAILED`/`CANCELLED`), never just because a status page
was visited.

## Testing

All scenarios tested locally against controlled backend states (5 test
orders created directly via Prisma covering each `paymentMethod`/
`paymentStatus` combination below — no repeated hosted PayFast round
trips needed, per this milestone's own instruction):

- PayFast `PENDING`/`FAILED`/`CANCELLED` retry: backend `POST
  /initiate` returns `200` with a real PayFast sandbox `processUrl`;
  frontend shows "Try PayFast Again" on all three status pages where
  applicable; one full click-through (payment-failed → click → real
  navigation to `sandbox.payfast.co.za`) confirmed working end-to-end.
- PayFast `PAID` retry: backend rejects with `400`; frontend shows no
  retry button on any of the three pages, shows a paid confirmation
  instead.
- `BANK_TRANSFER` retry: backend rejects with `400`; frontend shows no
  retry button on payment-success or payment-cancelled (the two pages
  where it's reachable for a non-PayFast order).
- Confirmed via direct database checks: no duplicate order or `Payment`
  row created by any retry attempt; product stock unchanged
  (42 → 42) across every test order and retry call.
- No secrets printed at any point; 0 console errors on a clean test
  run (an earlier run's apparent errors were the local rate limiter
  triggered by rapid manual testing, not an application fault —
  confirmed by re-running against a fresh backend process).
- All 5 test orders deleted afterward; `SG-2026-28SM` confirmed
  untouched throughout.

## Known Limitations

- **Retrying while genuinely still `PENDING` is offered, not
  withheld** — if a customer's first PayFast attempt is still
  legitimately in flight (ITN not yet arrived) and they click retry
  anyway, the backend allows it (a second `initiate` call is harmless —
  no duplicate order, no stock change). If *both* the original and the
  retry attempt are separately completed on PayFast's side, PayFast
  itself would process two separate payments; this backend's own
  idempotency (Milestone 22) only protects against a *duplicate ITN for
  the same completed payment*, not against a customer genuinely paying
  twice through two different PayFast sessions. This is an inherent
  risk of any "retry while pending" design, not something introduced or
  fixable by this milestone's own code.
- **This milestone does not touch source verification** — the one gap
  identified in Milestone 30 (`PAYFAST_VERIFY_SOURCE`'s acceptance path
  unproven through a tunnel) remains exactly as it was.
- No admin visibility into retry attempts specifically — same general
  limitation as the rest of this project until an admin dashboard
  exists (out of scope, per this milestone's own constraints).
