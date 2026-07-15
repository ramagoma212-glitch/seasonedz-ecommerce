# PayFast Sandbox Setup (Version 3, Milestone 20)

This document covers **configuration only**. No PayFast code has been
written yet — no payment initiation, no ITN (Instant Transaction
Notification) handling, no redirect to PayFast. That's later work
(Milestone 21+). This milestone makes the backend safely *ready* for
that work and closes a risk found during the Milestone 19 audit (see
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

## Why PAYFAST_ENABLED Remains False Until Payment Initiation and ITN Are Built

Before this milestone, `PaymentMethod.PAYFAST` was already a valid
value accepted by `POST /api/orders` — the frontend UI disabled the
PayFast radio button, but a raw API call could still create an order
with `paymentMethod: PAYFAST` that would sit unpaid forever, since no
code exists to ever resolve it (no payment initiation to redirect the
customer, no ITN to confirm payment). `PAYFAST_ENABLED` closes that gap
at the API level: `POST /api/orders` now rejects `paymentMethod:
PAYFAST` with a clean `400` ("PayFast payments are not available
yet...") unless `PAYFAST_ENABLED=true`. This flag should only be
flipped to `true` once payment initiation and ITN verification are
fully built and tested against PayFast's sandbox — not before.
