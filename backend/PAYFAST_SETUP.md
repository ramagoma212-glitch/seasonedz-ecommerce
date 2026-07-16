# PayFast Sandbox Setup (Version 3, Milestones 20-22)

This document originally covered **configuration only** (Milestone
20). Milestone 21 added **payment initiation** — an endpoint that
prepares (but does not send or verify) a PayFast payment for an
existing order. **Milestone 22 adds ITN (Instant Transaction
Notification) verification — the only code path in this backend
allowed to mark an order as paid.** See "Payment Initiation" and "ITN
/ Payment Verification" below for what each milestone added. This work
closes a risk found during the Milestone 19 audit (see
`../VERSION_3_PAYMENT_READINESS_AUDIT.md`).

## Sandbox Account Needed

A PayFast **sandbox** merchant account is required before any real
integration work starts (separate from a live/production PayFast
account). Sign up at PayFast and enable sandbox mode to get sandbox
credentials — these are safe to test with and never move real money.

## Merchant ID and Merchant Key

Every PayFast request (and its signature) is tied to a specific
merchant account via:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`

Sandbox and production accounts have **different** credentials — never
reuse one for the other.

## Passphrase Support

PayFast merchant accounts can optionally have a passphrase configured
in the PayFast dashboard. If yours has one, set `PAYFAST_PASSPHRASE` —
it must be included in signature generation (both the outgoing payment
request and the inbound ITN check) once that code exists, or every
signature will silently fail to match. If your account has no
passphrase configured, leave `PAYFAST_PASSPHRASE` empty.

## Environment Variables

All defined in `.env.example` with safe placeholders only (no real
values are ever committed):

| Variable | Purpose |
|---|---|
| `PAYFAST_ENABLED` | Feature flag — see "Why PAYFAST_ENABLED remains false" below |
| `PAYFAST_MODE` | `sandbox` or `production` |
| `PAYFAST_MERCHANT_ID` | Merchant account ID |
| `PAYFAST_MERCHANT_KEY` | Merchant account key |
| `PAYFAST_PASSPHRASE` | Optional — only if configured on the account |
| `BACKEND_PUBLIC_URL` | This backend's own public URL, used to build `PAYFAST_NOTIFY_URL` |
| `PAYFAST_RETURN_URL` | Frontend URL PayFast redirects to after a successful payment |
| `PAYFAST_CANCEL_URL` | Frontend URL PayFast redirects to if the customer cancels |
| `PAYFAST_NOTIFY_URL` | Backend ITN endpoint PayFast calls server-to-server |

`src/config/env.ts` reads all of these. `PAYFAST_MERCHANT_ID`,
`PAYFAST_MERCHANT_KEY`, `BACKEND_PUBLIC_URL`, `PAYFAST_RETURN_URL`,
`PAYFAST_CANCEL_URL`, and `PAYFAST_NOTIFY_URL` are only **eagerly
required** (the backend refuses to start without them, naming exactly
which are missing) when `PAYFAST_ENABLED=true`. With the default
`PAYFAST_ENABLED=false`, none of these need to be set at all — this
backend (and the current Render deployment) keeps running exactly as
it does today.

`src/config/payfast.ts` exposes this configuration to backend code as
a single `payfastConfig` object, and picks the correct PayFast process
URL for the configured mode:

- Sandbox: `https://sandbox.payfast.co.za/eng/process`
- Production: `https://www.payfast.co.za/eng/process`

> **Reminder: quote `.env` values containing `#`.** This frontend uses
> a hash-based router (`https://.../#/payment-success`), and `dotenv`
> treats an unquoted `#` as the start of a comment — everything after
> it in the value is silently dropped. If `PAYFAST_RETURN_URL`/
> `PAYFAST_CANCEL_URL` are set without quotes, only
> `http://localhost:5173/` survives; the `#/payment-success` part
> vanishes. Always quote these in `.env`:
> ```
> PAYFAST_RETURN_URL="http://localhost:5173/#/payment-success"
> PAYFAST_CANCEL_URL="http://localhost:5173/#/payment-cancelled"
> ```
> (Found and fixed while testing Milestone 21; worth remembering every
> time these are set, including for a future production deployment.)

## Sandbox Mode vs. Production Mode

`PAYFAST_MODE=sandbox` must be used for all development and testing —
it points at PayFast's sandbox environment and never moves real money.
`PAYFAST_MODE=production` must only be set once a full sandbox test
(payment initiation + ITN verification, end to end) has passed and
real production PayFast credentials are being used deliberately.

## Why PayFast Secrets Stay Only in Backend Env Variables

`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and `PAYFAST_PASSPHRASE`
are used to build a signature that proves a payment request/notification
really came from (or is destined for) this merchant account. If any of
these leaked to the frontend (e.g. a `VITE_`-prefixed variable, which
gets baked into public client JS the same way `VITE_API_BASE_URL`
already intentionally is), anyone could forge a valid-looking signed
payment request or notification. They must exist only as backend
environment variables, read only by backend code, and never printed to
logs or included in any API response.

## Why the Frontend Never Decides Payment Success

A browser redirect (PayFast's "return" URL) is not proof that a
payment actually succeeded — a customer can navigate to that URL
directly, and browser-side JavaScript can be tampered with. The only
trustworthy source of truth is a **verified backend ITN**: signature
checked, amount and order matched against the stored `Order` record
(source IP validation is a documented gap — see "ITN / Payment
Verification" below). As of Milestone 22, `paymentStatus` is only ever
set to `PAID` by `POST /api/payments/payfast/notify` after all of
those checks pass — never by anything the frontend sends or claims,
and never by the return-URL redirect itself.

## Payment Initiation (Version 3, Milestone 21)

`POST /api/payments/payfast/initiate` (full request/response reference
in `API_ROUTES.md`'s "Payment Routes" section) takes an existing
order's `orderNumber`, checks it's a `PAYFAST` order with a
retry-eligible `paymentStatus` (see "Payment Retry" below), and returns
the exact PayFast form fields + signature a frontend can `POST` to
redirect the customer to PayFast's sandbox or production payment page.
This is also the same endpoint a customer's "Try PayFast Again" retry
uses (Version 4, Milestone 31) — initiation and retry are the same
request, just called again for an order whose first attempt didn't
reach `PAID`.

- **Requires `PAYFAST_ENABLED=true`.** If it isn't, every call returns
  a clean `503`: `"PayFast payments are not enabled."`
- **Every field comes from the backend's own `Order` record** —
  `amount` is `Order.total` (formatted to 2 decimals), never anything
  a client sends. `m_payment_id` is the order's own `orderNumber`.
- **`return_url`/`cancel_url` have `?orderNumber=<orderNumber>`
  appended** (Version 3, Milestone 23), so the frontend's
  payment-success/payment-cancelled pages know which order they're
  showing. Since these URLs point at the frontend's hash-based router
  (e.g. `http://localhost:5173/#/payment-success`), the query has to
  go *inside* the `#` fragment, not before it — a normal query string
  before `#` would never reach the router at all. Plain string
  concatenation is correct here specifically because everything after
  `#` is just a string the SPA parses itself, not something the
  browser or a server interprets — see the `appendOrderNumberToUrl`
  comment in `src/services/payfast.service.ts`.
- **`paymentStatus` stays `PENDING`.** This endpoint only *prepares* a
  payment attempt — it never marks anything as paid, and stock is not
  touched again (it was already decremented once, at order creation).
  The related `Payment` record is updated with `provider: "PAYFAST"`
  and `providerReference: orderNumber` so it's clear a PayFast attempt
  was prepared, but `status` is left exactly as it was.
- **Signature generation** (`src/utils/payfastSignature.ts`) follows
  PayFast's documented custom-integration rules: fields in submission
  order, blank values dropped, PHP-style URL-encoding (spaces as `+`),
  passphrase appended if configured, then MD5-hashed. The raw string
  that gets hashed (which includes `merchant_key` and, if set, the
  passphrase) is never logged anywhere.
- **The passphrase itself is never returned in any API response** —
  only the final `signature` is. A frontend or anyone inspecting the
  response can never recover the passphrase from it.
- **Still not built (as of Milestone 21):** actually redirecting a
  customer to PayFast — that form-submission piece lives in the
  frontend, still a later milestone. ITN verification is covered next.

## ITN / Payment Verification (Version 3, Milestone 22)

`POST /api/payments/payfast/notify` (full request/response reference
in `API_ROUTES.md`'s "Payment Routes" section) is the endpoint PayFast
itself calls, server-to-server, after a customer completes, fails, or
cancels a payment attempt at PayFast. **It is the only code path in
this backend allowed to set `paymentStatus: PAID`.**

### Expected PayFast fields

Read from the form-urlencoded body: `m_payment_id` (looked up as
`Order.orderNumber`), `pf_payment_id`, `payment_status`, `amount_gross`,
`merchant_id`, `signature`. `amount_fee`, `amount_net`, `item_name`,
`email_address` are also present on a real ITN but not read — there's
no schema field to store them in yet.

### Signature verification

`src/utils/payfastSignature.ts`'s `verifyPayfastSignature()`
recomputes the signature from every field PayFast actually posted
(minus `signature` itself), in the order posted, with the configured
passphrase appended if set — the exact same rules as generating one
for `/initiate`, just run in reverse. Compared with
`crypto.timingSafeEqual`, not `===` (a byte-for-byte, non-short-circuit
comparison). **The raw string that gets hashed, and the signature
itself, are never logged.** A mismatch returns a clean `403` and
changes nothing.

### Amount verification

`amount_gross` must equal `Order.total` **exactly** (compared as
decimals — `Prisma.Decimal.eq()` — so formatting differences like
`"918"` vs `"918.00"` don't cause a false mismatch). The amount is
never taken from anything but the order already stored in the
database. A mismatch returns a clean `400` and changes nothing.

### Idempotency

PayFast documents that the same ITN can be delivered more than once.
This endpoint is safe to call repeatedly with an identical
notification:

- A duplicate `COMPLETE` for an order already `paymentStatus: PAID` —
  no re-update, no stock change, a clean `200` acknowledgement.
- A `FAILED`/`CANCELLED` notification arriving after an order is
  already `PAID` — acknowledged without changing anything (ITN
  delivery order isn't guaranteed; a late notification must never
  downgrade a genuinely paid order).

**Stock is never touched here** — it was already decremented once, at
order creation (Milestone 13).

### Payment status mapping

| PayFast status | `Payment.status` | `Order.paymentStatus` | `Order.status` |
|---|---|---|---|
| `COMPLETE` | `PAID` | `PAID` | `CONFIRMED` |
| `FAILED` | `FAILED` | `FAILED` | unchanged (stays `PENDING`) |
| `CANCELLED` | `CANCELLED` | `CANCELLED` | unchanged |
| anything else | unchanged | unchanged | unchanged (a note is saved to `Payment.failureReason` instead) |

**FAILED/CANCELLED `order.status` decision, documented as required:**
a single failed or cancelled payment *attempt* doesn't cancel the
whole *order* — `order.status` is deliberately left as `PENDING`
rather than moved to `CANCELLED`, so the customer can still retry
payment (PayFast again, or arrange another method) without the order
itself having been prematurely cancelled. Only `paymentStatus`
reflects the failed/cancelled attempt.

### Payment Retry (Version 4, Milestone 31; tightened Version 5, Milestone 34)

A customer whose PayFast attempt didn't reach `PAID` can retry — the
frontend calls the same `POST /api/payments/payfast/initiate` again
with the same `orderNumber`, no new order is ever created, and the
existing `Payment` row is reused (never duplicated).

**`POST /api/payments/payfast/initiate` takes an optional `context`
field: `"checkout"` or `"retry"`.** Checkout's own first PayFast
redirect (right after `POST /api/orders` creates a fresh order, which
always starts `PENDING`) sends `context: "checkout"`. The "Try PayFast
Again" button on the payment-status pages sends `context: "retry"`.
Missing or unrecognized `context` safely defaults to the stricter
`"retry"` behaviour — only the literal string `"checkout"` ever unlocks
initiating a `PENDING` order. This split exists because allowing
`PENDING` to retry was a real duplicate-payment risk: a first attempt
still genuinely in flight and a retry attempt could both independently
complete, with PayFast having no way to know they were "the same
order" — see `VERSION_5_RETRY_PENDING_RISK_FIX.md` and
`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`.

| `Order.paymentMethod` | `Order.paymentStatus` | `context: "checkout"` | `context: "retry"` (or missing/invalid) |
|---|---|---|---|
| `PAYFAST` | `PENDING` | **Yes** — the one state a fresh order can be in | **No** — `"Your payment is still being verified. Please wait a few minutes before trying again or contact Seasonedz Group."` |
| `PAYFAST` | `FAILED` | No | **Yes** |
| `PAYFAST` | `CANCELLED` | No | **Yes** |
| `PAYFAST` | `PAID` | No | **No** — `"This order's payment has already been processed."` |
| `PAYFAST` | `REFUNDED` | No | **No** — same message; a refunded order is never re-chargeable |
| `BANK_TRANSFER` (or any non-PayFast method) | any | No | **No** — `"This order was not created for PayFast payment."` |

The notify flow's `COMPLETE` guard is unaffected by any of this — it
still accepts completing from `PENDING`, `FAILED`, or `CANCELLED`
(`PAYFAST_COMPLETABLE_STATUSES` in `src/services/payfast.service.ts`),
since a real ITN might belong to either a checkout-initiated attempt
(order still `PENDING`) or a retry-initiated one (order still
`FAILED`/`CANCELLED` right up until the ITN arrives — initiation never
touches `order.paymentStatus`). A retry that's allowed to *start* is
still guaranteed to be allowed to *finish*.

`Order.status` being `CANCELLED` or `REFUNDED` also blocks retry
regardless of `paymentStatus` (a separate, pre-existing check — an
order can be administratively cancelled/refunded independent of what
its last payment attempt reported). Retry never reduces stock again
(it was only ever decremented once, at order creation) and never
creates a second `Payment` row.

The frontend mirrors the `"retry"` set (`FAILED`/`CANCELLED` only, no
longer `PENDING`) for *display* purposes only (`isPayfastRetryEligible`
in `src/components/payfastRetry.js`) so a `PENDING` order never shows a
"Try PayFast Again" button in the first place — but the backend
re-checks independently every time regardless of what the frontend
decided to show. See `VERSION_4_PAYMENT_RETRY_POLISH.md` and
`VERSION_5_RETRY_PENDING_RISK_FIX.md` for the full frontend-side detail
(retry pages, the shared retry helper, pending-payment storage).

### Return URL Is Never Trusted

`return_url`/`cancel_url` exist purely for customer navigation after
they leave PayFast's site — a browser landing there proves nothing and
is never checked by this backend. Only a verified `/notify` call can
ever change `paymentStatus`. The frontend pages at those URLs (a later
milestone) must re-fetch the order's real status from the API rather
than assume success because of how they got there.

### Source IP Verification and Server Validation (Version 4, Milestone 29)

**Now implemented, disabled by default.** Two further checks exist on
top of signature/amount/merchant-ID verification, each gated behind
its own flag (both default `false`):

- **`PAYFAST_VERIFY_SOURCE`** — resolves PayFast's own domains via DNS
  at verification time and confirms the ITN's source IP matches
  (`src/utils/payfastSourceVerification.ts`). No fixed IP list is
  hardcoded — PayFast doesn't publish one to hardcode.
- **`PAYFAST_VALIDATE_SERVER`** — POSTs the received ITN back to
  PayFast's own validation endpoint and requires a `"VALID"` response
  (`src/utils/payfastServerValidation.ts`) — PayFast's own recommended
  custom-integration confirmation step.

Both were deliberately left disabled through Milestone 28, for the
same reason as before: they can't be meaningfully proven against real
PayFast traffic from local development alone, and a check that's never
been exercised is riskier than an honest, documented gap. Milestone 29
built and tested both — their *rejection* paths are proven (a local
request correctly fails source verification; crafted data correctly
fails PayFast's real sandbox server validation) — but their
*acceptance* paths (a genuine PayFast-originated ITN passing both
checks) can only be proven by Milestone 30's actual hosted sandbox
round trip. See `VERSION_4_PAYFAST_SOURCE_VERIFICATION.md` for full
detail, including `TRUST_PROXY` (needed for `req.ip` to reflect the
real caller behind Render's or a tunnel's reverse proxy) and exactly
which PayFast domains are checked per mode.

**Before any real production PayFast credentials are used, both
`PAYFAST_VERIFY_SOURCE=true` and `PAYFAST_VALIDATE_SERVER=true` should
be set** — this remains a documentation/operational requirement, not
something enforced in code.

## Frontend Checkout Flow (Version 3, Milestone 23)

The frontend now has a real (sandbox) PayFast checkout path, gated by
its own feature flag, separate from the backend's:

- **`VITE_PAYFAST_ENABLED`** (root `.env` / `.env.example`, default
  `false`) — controls whether the PayFast radio button is selectable
  at checkout at all (`src/js/orders.js`'s `PAYMENT_METHODS`). This is
  a **UI-only** gate. It never bypasses the backend's own
  `PAYFAST_ENABLED` check — a determined client could still POST
  `paymentMethod: PAYFAST` directly, and the backend independently
  rejects it if *its* flag is off. Two separate flags, two separate
  layers, neither trusts the other.
- **Checkout flow** (`src/js/app.js`): for `PAYFAST`, the order is
  created first via the existing Order API (exactly like
  `BANK_TRANSFER`), then `POST /api/payments/payfast/initiate` is
  called for that order, then a hidden `<form method="POST">` is built
  from the backend's response fields and submitted — a real (non-SPA)
  browser navigation to PayFast. **The frontend never builds a
  PayFast field or a signature itself** — `src/js/api/paymentsApi.js`
  only ever forwards the backend's response verbatim into that form.
- **Local Storage pending-payment reference**
  (`src/js/pendingPayment.js`): a small, non-sensitive record
  (`orderNumber`, `paymentMethod`, `createdAt` — never a status, never
  a PayFast field) saved right before redirecting, so the
  payment-success/cancelled/failed pages can still find the order if
  the URL comes back without a query string for some reason. It's a
  convenience lookup, never proof of anything.
- **`payment-success` / `payment-cancelled` / `payment-failed` pages**
  (`src/pages/`) are all **read-only**: each one calls
  `GET /api/orders/:orderNumber/tracking` and displays whatever
  `paymentStatus` the backend actually has on record. **None of them
  can ever mark a payment as paid, failed, or cancelled** — there is no
  write call anywhere in any of the three files. If `paymentStatus` is
  still `PENDING`, `payment-success` says so explicitly ("Payment is
  being verified... please do not place another order yet") rather
  than assuming success just because PayFast redirected there.

## Why PAYFAST_ENABLED Remains False (in Any Real Deployment) Until the Full Flow Is Proven

Before Milestone 20, `PaymentMethod.PAYFAST` was already a valid value
accepted by `POST /api/orders` — the frontend UI disabled the PayFast
radio button, but a raw API call could still create an order with
`paymentMethod: PAYFAST` that would sit unpaid forever, since no code
existed to ever resolve it. `PAYFAST_ENABLED` closed that gap at the
API level: `POST /api/orders` rejects `paymentMethod: PAYFAST` with a
clean `400` unless `PAYFAST_ENABLED=true`.

Milestones 21-23 add payment initiation, ITN verification, and the
full frontend flow (checkout redirect + success/cancelled/failed
pages) — the whole loop can now be tested locally, as this milestone
did (backend with crafted requests in M21-22; the frontend flow with a
real browser in M23, redirecting to PayFast's actual sandbox
`processUrl`). Milestone 29 adds source verification and server
validation (both still disabled by default). `PAYFAST_ENABLED=true`/
`VITE_PAYFAST_ENABLED=true` are safe to use **locally, with sandbox
credentials**, for exactly this kind of testing. They should stay
`false` in any real (deployed) environment until: a full manual
sandbox payment has actually been completed through PayFast's real
hosted payment page (not just a form built and inspected locally), and
`PAYFAST_VERIFY_SOURCE`/`PAYFAST_VALIDATE_SERVER` have both been
proven against that real round trip (Milestone 30).

## Known Limitations (as of Milestone 31)

- **A real hosted PayFast sandbox round trip is now proven** (Version
  4, Milestone 30) — checkout through PayFast's real sandbox payment
  page, a real ITN delivered over a public tunnel, and genuine
  backend-verified `PAID`/`CONFIRMED`. Two real signature bugs were
  found and fixed in the process (PHP `urlencode()` encoding gap;
  empty-valued ITN fields incorrectly dropped) — see
  `VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`.
- **Server validation's acceptance path is proven; source
  verification's is not.** `PAYFAST_VALIDATE_SERVER=true` correctly
  accepted a real ITN in Milestone 30. `PAYFAST_VERIFY_SOURCE=true`
  correctly and safely *rejected* the same real ITN through the tunnel
  used — the exact cause (tunnel IP forwarding vs. a genuine DNS/IP
  mismatch) wasn't isolated. Both flags stay disabled by default; this
  remains the one open item before `PAYFAST_ENABLED` could ever be
  considered for production.
- **Payment retry is implemented** (Version 4, Milestone 31) — see
  "Payment Retry" above and `VERSION_4_PAYMENT_RETRY_POLISH.md`. A
  customer can retry a `PENDING`/`FAILED`/`CANCELLED` PayFast order
  without a new order or a second `Payment` row; `PAID`/`REFUNDED`
  orders and non-PayFast orders never offer or accept retry.
- **No email notification** on a successful/failed payment — a
  customer or the business isn't told anything happened beyond
  whatever the frontend shows on its next page load.
- **No admin visibility** into unrecognised PayFast statuses beyond
  `Payment.failureReason` — there's no admin dashboard yet to surface
  these for review.
- **`PAYFAST_ENABLED` and `VITE_PAYFAST_ENABLED` must both stay
  `false` in any real/deployed environment** until the above are
  addressed — see the section above for exactly what "addressed"
  means.
