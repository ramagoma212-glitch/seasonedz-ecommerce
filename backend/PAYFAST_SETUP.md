# PayFast Sandbox Setup (Version 3, Milestones 20-21)

This document originally covered **configuration only** (Milestone
20). Milestone 21 adds the first real PayFast code: a **payment
initiation** endpoint that prepares (but does not send or verify) a
PayFast payment for an existing order. **No ITN (Instant Transaction
Notification) handling exists yet, and no order can be marked as paid
yet** — that's later work. See "Payment Initiation" below for what
Milestone 21 actually added, and closes a risk found during the
Milestone 19 audit (see `../VERSION_3_PAYMENT_READINESS_AUDIT.md`).

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
checked, source validated, amount and order reference matched against
the stored `Order` record. Once ITN handling exists, `paymentStatus`
must only ever be set to `PAID` by that verified server-to-server
check — never by anything the frontend sends or claims.

## Payment Initiation (Version 3, Milestone 21)

`POST /api/payments/payfast/initiate` (full request/response reference
in `API_ROUTES.md`'s "Payment Routes" section) takes an existing
order's `orderNumber`, checks it's a `PAYFAST` order still `PENDING`
payment, and returns the exact PayFast form fields + signature a
frontend can `POST` to redirect the customer to PayFast's sandbox or
production payment page.

- **Requires `PAYFAST_ENABLED=true`.** If it isn't, every call returns
  a clean `503`: `"PayFast payments are not enabled."`
- **Every field comes from the backend's own `Order` record** —
  `amount` is `Order.total` (formatted to 2 decimals), never anything
  a client sends. `m_payment_id` is the order's own `orderNumber`.
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
- **Still not built:** actually redirecting a customer to PayFast (that
  form-submission piece lives in the frontend, a later milestone), and
  ITN verification — see "Why the Frontend Never Decides Payment
  Success" above, which still fully applies. Nothing in this milestone
  can mark an order as paid.

## Why PAYFAST_ENABLED Remains False (in Any Real Deployment) Until ITN Is Built Too

Before Milestone 20, `PaymentMethod.PAYFAST` was already a valid value
accepted by `POST /api/orders` — the frontend UI disabled the PayFast
radio button, but a raw API call could still create an order with
`paymentMethod: PAYFAST` that would sit unpaid forever, since no code
existed to ever resolve it. `PAYFAST_ENABLED` closed that gap at the
API level: `POST /api/orders` rejects `paymentMethod: PAYFAST` with a
clean `400` unless `PAYFAST_ENABLED=true`.

Milestone 21 adds payment *initiation* (above), but that's still only
half the picture — an order can now be prepared for PayFast, but
nothing yet verifies whether the customer actually paid. Until ITN
verification exists, there is still no trustworthy way to mark an
order `PAID`. `PAYFAST_ENABLED=true` is safe to use **locally, with
sandbox credentials, for testing initiation** (as this milestone did),
but should stay `false` in any real (deployed) environment until ITN
verification is fully built and tested end-to-end against PayFast's
sandbox.
