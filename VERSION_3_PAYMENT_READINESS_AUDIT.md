# Version 3 — Payment Readiness Audit (Milestone 19)

*(See the "Milestone 20", "Milestone 21", "Milestone 22", "Milestone
23", and "Milestone 24" sections near the end of this document for the
sandbox configuration, payment initiation, ITN verification, frontend
checkout flow, and email preparation work that followed this audit.)*

Planning-only review of what exists today and what real PayFast payment
integration will need. **No PayFast code, no payment logic changes, and
no schema migration were made in this milestone** — this document is
the audit and the plan, nothing else.

Live systems reviewed:
- Frontend: https://ramagoma212-glitch.github.io/seasonedz-ecommerce/
- Backend: https://seasonedz-ecommerce.onrender.com/api
- Database: Supabase PostgreSQL

## 1. Current State

Guest checkout today creates a real backend `Order` row with a real,
server-calculated total and a `Payment` row created alongside it — but
no payment provider is ever called. Every price comes from the
database at order-creation time (`backend/src/services/order.service.ts`),
never from the request body. The customer picks a payment *method*,
not a payment *outcome* — nothing on the current checkout path ever
sets `paymentStatus` to anything other than `PENDING`.

**Schema (`backend/prisma/schema.prisma`):**

| Model/Enum | Relevant shape |
|---|---|
| `Payment` | one-to-one with `Order`. Fields: `method`, `status`, `amount`, `provider`, `providerReference`, `paidAt`, `failureReason`. |
| `Order` | `status` (OrderStatus), `paymentStatus` (PaymentStatus), `fulfilmentStatus` (FulfilmentStatus), `paymentMethod` (PaymentMethod), `subtotal`/`deliveryFee`/`discountTotal`/`total`. |
| `PaymentStatus` | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` |
| `PaymentMethod` | `BANK_TRANSFER`, `PAYFAST`, `CASH_ON_DELIVERY`, `MANUAL` |
| `OrderStatus` | `PENDING`, `CONFIRMED`, `PROCESSING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `REFUNDED` |

**Checkout request body** (`POST /api/orders`, validated in
`backend/src/validators/order.validator.ts`): `customer.*`,
`deliveryAddress.*`, `paymentMethod` (must be one of the
`PaymentMethod` enum values), `items[].{productSlug, quantity}` only —
no price/subtotal/total field is ever read from the request.

**Order creation flow** (`backend/src/services/order.service.ts`):
re-prices every item from the database, runs an atomic
`stockQuantity >= quantity` stock guard, then creates `Order` +
`OrderItem[]` + `Payment` + `Shipping` together in one Prisma
transaction. `Order.status` starts `PENDING`, `paymentStatus` starts
`PENDING`.

**Payment placeholder creation:** yes — a `Payment` row is always
created (`status: PENDING, amount: total, provider: null`) regardless
of chosen method. Nothing ever updates it afterwards; there is no code
path anywhere that sets `paymentStatus` to `PAID`.

**Order confirmation page** (`src/pages/orderConfirmation.js`): fetches
`GET /api/orders/:orderNumber`, displays order/payment status via
`humanizeEnum()`, and shows an explicit demo notice: *"Payment is
still not processed online... PayFast and real courier tracking are
coming later."*

**Order tracking page** (`src/pages/trackOrder.js`): fetches
`GET /api/orders/:orderNumber/tracking`, with its own demo notice that
tracking is a manually-set backend status, not a live courier feed.

**Existing payment-success / payment-failed route or page: none.**
Confirmed by reading `src/js/router.js` (no `payment-success`,
`payment-failed`, or `payment-cancelled` route defined) and
`src/pages/` (no such files exist). Checkout currently redirects
straight from a successful `POST /api/orders` to
`#/order-confirmation?order=...` — there is no payment step to land on
in between.

## 2. What Is Ready

- Server-side pricing and stock verification — real, already correct,
  needs no change for PayFast.
- `Order.total` is trustworthy and already the right value to hand to
  a payment provider.
- `Order.orderNumber` is unique and human-readable — ready to serve as
  the PayFast order reference (`m_payment_id`).
- `Payment` model already has `provider`, `providerReference`,
  `paidAt`, `failureReason` — a real provider integration can start
  writing into these without a schema change for the basics.
- CORS/env pattern (`backend/src/config/env.ts`) already distinguishes
  required vs. optional vars and refuses silent localhost fallbacks in
  production — the same pattern extends cleanly to PayFast env vars.
- Rate limiting pattern (`backend/src/middleware/rateLimit.middleware.ts`)
  already gives write-heavy routes their own limiter — a future ITN
  route can follow the same shape (though see Risks — ITN itself
  should not be rate-limited the same way a browser-facing route is).

## 3. What Is Not Ready

- **No PayFast code exists anywhere** — no signature generation, no
  ITN handler, no payment-initiation call. This is by design (not yet
  built), not a bug.
- **No payment-success / payment-failed / payment-cancelled pages or
  routes** — checkout has only one outcome today (order created →
  order confirmation), with no branch for "redirect to a payment
  provider and come back."
- **The "PayFast disabled" protection is UI-only.** The checkout
  radio button for PayFast is `disabled` in
  `src/js/orders.js` (`PAYMENT_METHODS`), but the backend validator's
  `PAYMENT_METHOD_VALUES` (`backend/src/validators/order.validator.ts`)
  already accepts `"PAYFAST"` as a valid `paymentMethod` value for
  `POST /api/orders`. A direct API call (bypassing the UI) can create
  an order today with `paymentMethod: PAYFAST`, which will sit at
  `paymentStatus: PENDING` forever with no process to ever resolve it.
  Not exploitable for taking money (no charge is ever attempted either
  way), but worth a deliberate decision in Version 3: either accept
  this as harmless, or have the backend also reject `PAYFAST` until
  the real integration exists.
- **Demo wording is present everywhere it should be** (see below) but
  is written specifically for "no payment integration exists" — it
  will need updating once PayFast sandbox testing begins, so it
  doesn't claim "no real payment" while a real (sandbox) payment flow
  is being tested.

## 4. Demo-Only Review

| Area | Current wording / behaviour |
|---|---|
| Bank transfer | `src/js/orders.js`: "Bank Transfer (Demo Only)" — "no real bank transfer is processed." Selectable; backend accepts it, creates a `Payment` row that's never marked paid. |
| PayFast | "PayFast (Coming Soon)" — `disabled: true` in the UI. Backend enum already accepts it (see above). |
| Cash on Delivery | "Cash / Card on Delivery (Demo Only)". |
| Payment status display | Rendered via `humanizeEnum(order.paymentStatus)` — plain enum label (e.g. "Pending"), no extra demo qualifier; relies on the surrounding demo-notice banner for context. |
| Order status display | Same pattern — `humanizeEnum(order.status)`. |
| Order confirmation wording | Explicit demo notice: *"Payment is still not processed online... no real payment has been taken and no goods have shipped yet."* |
| Tracking wording | Explicit demo notice: *"Tracking is a Seasonedz Group backend status, not a live courier... updated manually."* |

## 5. PayFast Requirements (Planning Only — No Code Added)

- **PayFast merchant account** — a real (or sandbox) PayFast merchant
  account is required before any integration work starts.
- **Merchant ID / Merchant Key** — identify the merchant account;
  included in every outgoing payment request and in signature
  generation.
- **Passphrase** (if configured on the merchant account) — an
  additional shared secret PayFast supports; if the account has one
  set, it must be included in signature generation on *both* the
  outgoing request and the inbound ITN check, or every signature will
  silently fail to match.
- **Sandbox/test mode** — PayFast has a distinct sandbox endpoint
  (`sandbox.payfast.co.za`) separate from production
  (`www.payfast.co.za`); this must be an explicit config flag, tested
  fully in sandbox before any production credentials are used.
- **Return URL** — where PayFast redirects the customer's browser
  after a successful payment attempt. Not proof of payment by itself
  (see Security, below).
- **Cancel URL** — where PayFast redirects if the customer backs out
  before paying.
- **Notify URL (ITN)** — a backend endpoint PayFast calls
  server-to-server with the final payment result. This is the only
  trustworthy source of truth for payment status.
- **Payment amount** — must be `Order.total`, taken from the database,
  formatted exactly to PayFast's required 2-decimal format. Never a
  client-supplied number.
- **Order reference** — `Order.orderNumber` (already unique, already
  exists) — passed to PayFast so the ITN can be matched back to the
  right order.
- **Signature generation** — PayFast requires an MD5 signature computed
  from an exact ordered set of POST fields (+ passphrase, if set). The
  ITN handler must recompute and compare this the same way on every
  inbound notification.
- **ITN/payment notification handling** — a dedicated POST endpoint
  that must: verify the signature, verify the request actually
  originated from PayFast (PayFast requires posting the notification
  data back to PayFast's servers for confirmation, and validating the
  source), and check that the amount and order reference match the
  stored order — all before trusting it.
- **Payment verification before marking an order as paid** — only a
  verified ITN (never the browser return URL, never anything the
  frontend claims) may set `paymentStatus: PAID`.

## 6. Security Planning

These rules apply to all future PayFast work and should gate any
Milestone 20+ code review:

- **Frontend must not decide payment success.** Already true today —
  `paymentStatus` is set only by the backend. Must remain true: no
  future flow may set payment state from a query string, a redirect
  parameter, or any client-side flag.
- **Backend must create the payment request.** The backend builds the
  signed PayFast payload/redirect; the frontend only ever redirects
  the browser to a URL the backend hands it.
- **Backend must verify the PayFast notification.** Signature check +
  PayFast confirmation POST-back + amount/reference match, independent
  of anything the frontend or the browser redirect claims.
- **Order total must come from the backend order record.** Already
  true for order creation; must stay true for the PayFast amount too —
  read from the stored `Order.total`, never recalculated from request
  input or trusted from a redirect param.
- **Payment status must only update after trusted backend
  verification.** Only the ITN handler (or a future explicit admin
  action) may write `PaymentStatus.PAID`. The payment-success page is
  display-only — it must re-fetch the order's real status rather than
  assume success because PayFast redirected there.
- **PayFast secrets must live only in backend env variables** — never
  in frontend code, and never in a `VITE_`-prefixed variable (those
  get baked into public client JS, exactly like `VITE_API_BASE_URL`
  already is intentionally).
- **No PayFast secret must be exposed to the frontend.** The frontend
  only ever needs the resulting redirect URL and the order reference,
  never merchant credentials.

## 7. Environment Variable Planning

No real values below — names and purposes only:

| Variable | Purpose |
|---|---|
| `PAYFAST_MERCHANT_ID` | PayFast merchant account ID. |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant account key. |
| `PAYFAST_PASSPHRASE` | Optional shared secret, if configured on the PayFast account. |
| `PAYFAST_MODE` | `sandbox` or `production` — selects the PayFast endpoint. |
| `PAYFAST_RETURN_URL` | Frontend URL PayFast redirects to after successful payment. |
| `PAYFAST_CANCEL_URL` | Frontend URL PayFast redirects to if the customer cancels. |
| `PAYFAST_NOTIFY_URL` | Backend ITN endpoint PayFast calls server-to-server. |
| `FRONTEND_PRODUCTION_URL` | Already exists (Milestone 14/17) — reused as the base for return/cancel URLs. |
| `BACKEND_PUBLIC_URL` | New — the backend doesn't currently know its own public URL; needed to construct `PAYFAST_NOTIFY_URL` pointing at the live Render service. |

All of these are backend-only and would follow the existing
`render.yaml` pattern of `sync: false` for secrets (`PAYFAST_MERCHANT_ID`,
`PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`), same as
`DATABASE_URL`/`DIRECT_URL` today.

## 8. Database/Schema Review

**Is the current `Payment` model enough for Version 3? Mostly, not
fully.** `provider`, `providerReference`, `paidAt`, and `failureReason`
already exist and cover the basics. A few fields are likely needed
once real ITN data is in hand — **not added in this milestone:**

| Possible future field | Why |
|---|---|
| `providerPayload` (Json?) | Store the raw ITN payload for audit trail / dispute resolution. |
| `signature` (String?) | Store the signature PayFast sent, for audit trail. |
| `verifiedAt` (DateTime?) | When the ITN was independently verified — distinct from `paidAt` (when PayFast says the payment happened). |
| `paymentUrl` (String?) | The generated PayFast redirect URL, if a "resume a pending payment" flow is wanted. |
| `paymentReference` (String?) | A PayFast-side reference distinct from `providerReference`, if needed — may end up collapsing into the existing field once real field names are known. |

**Recommendation: do not migrate yet.** These are additive, nullable
fields — safe to add in Milestone 20 once a real PayFast sandbox
response has been seen and the exact field shape is known, rather than
guessing now and migrating twice.

## 9. Frontend Page Review

| Page | Status |
|---|---|
| `payment-success` | Does not exist. Needs a route + page that re-fetches the real order/payment status from the backend before displaying anything — never trusts the redirect itself. |
| `payment-failed` | Does not exist. Needs a route + page. |
| `payment-cancelled` | Does not exist. PayFast distinguishes "cancelled" (customer backed out) from "failed" (payment attempted and declined) — recommend a distinct third page, since the right customer-facing wording differs ("your order is still saved, you can pay again" vs. "the payment failed, try again or choose another method"). |
| Checkout payment step | Needs to branch: `BANK_TRANSFER`/`CASH_ON_DELIVERY` keep today's flow (create order → order confirmation directly); `PAYFAST` would need to create the order first (still unpaid), then redirect the browser to the PayFast payment URL the backend returns, instead of going straight to order confirmation. |
| Order confirmation updates | Needs to handle a `PAYFAST` order still awaiting payment differently from a `BANK_TRANSFER`/`CASH_ON_DELIVERY` order — likely the payment-success/payment-failed pages become the primary landing point for PayFast orders, with order confirmation reachable afterward as it is today. |

## 10. Backend Route Plan (Planning Only — Nothing Built)

- `POST /api/payments/payfast/initiate` (name indicative) — given an
  existing `orderNumber`, backend builds the signed PayFast
  payload/redirect server-side.
- `POST /api/payments/payfast/notify` — the ITN webhook PayFast calls.
  Public and unauthenticated by necessity (PayFast can't send a bearer
  token), so it must validate signature + source + confirmation
  POST-back instead of relying on auth.
- Possibly `GET /api/orders/:orderNumber/payment-status` — a light
  endpoint for the payment-success page to re-check real status
  without exposing the full order.

## 11. Recommended Implementation Order (Milestone 20+)

1. Add the nullable `Payment` schema fields (§8) in one small
   migration, once real PayFast sandbox field shapes are confirmed.
2. Build the PayFast payment-initiation endpoint in sandbox mode —
   returns a redirect URL, no ITN handling yet.
3. Build the ITN/notify endpoint with full verification (signature,
   source validation, confirmation POST-back), tested against
   PayFast's sandbox ITN simulator before anything else touches it.
4. Add `payment-success` / `payment-failed` / `payment-cancelled`
   frontend pages, wired to re-fetch real order state rather than
   trust redirect parameters.
5. Update checkout to branch on `PAYFAST` vs. other methods.
6. Enable the PayFast radio button in the UI only once the above is
   fully tested end-to-end in sandbox.
7. Only then consider a further milestone to go live with real
   production PayFast credentials.

## 12. Risks and Warnings

- Never trust the PayFast "return" redirect as proof of payment — only
  the verified ITN.
- PayFast's ITN can arrive out of order, more than once, or be
  delayed — the notify handler must be idempotent (safe to process the
  same notification twice without double-marking or double-counting).
- Render's free-tier cold start (noted in
  `VERSION_2_LIVE_STABILITY_REVIEW.md`) could delay the backend's
  response to an ITN call — confirm PayFast's retry behaviour covers
  this, or consider a paid Render tier before accepting real payments.
- If a passphrase is used, it must match exactly between the PayFast
  dashboard setting and the backend config, or every signature check
  fails silently.
- Decide deliberately (§3) whether to keep or block
  `PaymentMethod.PAYFAST` at the validator level while the integration
  is incomplete — currently accepted at the API level, UI-disabled
  only.
- Amount/currency formatting must match PayFast's exact expectations
  (fixed 2 decimals, no thousands separators) — small formatting
  differences break signature verification.
- Real money is involved once this goes live — a full sandbox-only
  milestone should be completed and tested before any production
  PayFast credentials are ever entered into Render's environment
  variables.

## 13. Next Milestone Recommendation

**Milestone 20: PayFast Sandbox Integration.** Build payment
initiation, ITN verification, and the success/failed/cancelled pages,
fully tested against PayFast's sandbox — no production credentials, no
live charge — before any further milestone considers going live.

---

## Milestone 20 — PayFast Sandbox Setup and Payment Configuration

Configuration-only follow-up to this audit. No payment initiation, no
ITN handling, and no redirect to PayFast were built — this milestone
only prepares the backend safely and fixes the one concrete risk this
audit found (§3 above: `PaymentMethod.PAYFAST` was accepted by
`POST /api/orders` even though nothing could ever resolve such an
order). Full detail in `backend/PAYFAST_SETUP.md`.

**What changed:**

- `backend/.env.example` — added safe placeholders for `PAYFAST_ENABLED`,
  `PAYFAST_MODE`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
  `PAYFAST_PASSPHRASE`, `BACKEND_PUBLIC_URL`, `PAYFAST_RETURN_URL`,
  `PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL` — no real values.
- `backend/src/config/env.ts` — now reads and validates all of the
  above. `PAYFAST_MODE` must be `sandbox` or `production`. The
  merchant-credential and URL variables are only eagerly required
  (backend refuses to start, naming exactly what's missing) when
  `PAYFAST_ENABLED=true` — with the default `false`, nothing about
  this backend's startup behaviour changes.
- `backend/src/config/payfast.ts` (new) — exposes a single
  `payfastConfig` object (`mode`, `merchantId`, `merchantKey`,
  `passphrase`, `processUrl`, `returnUrl`, `cancelUrl`, `notifyUrl`) to
  backend code only. `processUrl` resolves to PayFast's sandbox or
  production endpoint based on `mode`. Nothing calls PayFast with it
  yet.
- **Risk fix:** `backend/src/validators/order.validator.ts` now
  rejects `paymentMethod: PAYFAST` with a clean `400` — *"PayFast
  payments are not available yet. Please choose another payment
  method."* — unless `PAYFAST_ENABLED=true`. This closes the gap this
  audit found at the API level (the frontend already disabled this
  option in the UI, but the backend previously accepted it anyway).

**Decision recorded:** the "required for sandbox payment work" env
vars (§7 above) are validated as required only when `PAYFAST_ENABLED`
is `true`, not unconditionally. Requiring them unconditionally would
have meant the currently-running local dev backend — and the live
Render deployment, once this code ships there — would refuse to start
at all without new PayFast vars, for a feature that's still fully
disabled by default. Gating the requirement behind the same flag that
gates the feature itself avoids that disruption while still giving
real, meaningful validation once PayFast is actually turned on.

**Still not built (unchanged from §3/§11 above):** payment initiation,
signature generation, ITN handling, and the payment-success/
payment-failed/payment-cancelled frontend pages. `PAYFAST_ENABLED`
stays `false` until all of that exists and has been tested in
PayFast's sandbox.

---

## Milestone 21 — PayFast Payment Initiation

Builds the first real PayFast code: a backend endpoint that *prepares*
a PayFast sandbox/production payment for an existing order. **No order
is marked as paid, no ITN/notify handling exists, and nothing redirects
a real customer to PayFast yet** — that's still later work. Full detail
in `backend/PAYFAST_SETUP.md` and `backend/API_ROUTES.md`'s "Payment
Routes" section.

**What was built:**

- `POST /api/payments/payfast/initiate` — takes `{ "orderNumber":
  "SG-YYYY-XXXX" }`, validates the order exists and is eligible
  (`paymentMethod: PAYFAST`, `paymentStatus: PENDING`, `status` not
  `CANCELLED`/`REFUNDED`, `total > 0`), and returns the exact form
  fields + MD5 signature a frontend can `POST` to PayFast.
- `backend/src/services/payfast.service.ts` (new) — the eligibility
  checks and field-building, all sourced from the backend's own `Order`
  record (never a client-supplied amount).
- `backend/src/utils/payfastSignature.ts` (new) — PayFast's documented
  custom-integration signature algorithm (ordered fields, blanks
  dropped, PHP-style URL-encoding, optional passphrase, MD5). The raw
  string being hashed is never logged, since it contains
  `merchant_key` and (if configured) the passphrase.
- `backend/src/controllers/payment.controller.ts` and
  `backend/src/routes/payment.routes.ts` (new), registered in
  `backend/src/routes/index.ts` under `/api/payments`. Same rate-limit
  pattern as order/enquiry creation (10 requests / 15 min / IP, its own
  counter).

**Gated the same way as Milestone 20's fix:** the whole route returns
a clean `503` (`"PayFast payments are not enabled."`) unless
`PAYFAST_ENABLED=true` — so it stays inert in any environment where
that flag isn't explicitly turned on.

**Payment record:** on a successful initiation, the order's `Payment`
row is updated with `provider: "PAYFAST"` and `providerReference:
orderNumber` — `status` is left exactly as it was (`PENDING`), and no
stock is touched.

**Security properties carried over from the audit (§5/§6 above), now
concretely true in code, not just planned:**

- The amount sent to PayFast is `Order.total` from the database —
  never anything the request body could influence (the request body
  only ever contains `orderNumber`).
- `merchant_id`/`merchant_key`/`passphrase` are read only from backend
  env vars (`src/config/payfast.ts`) — never present in any frontend
  code or bundle.
- The passphrase is never returned in the API response — only the
  final computed `signature` is.
- `paymentStatus` is not, and cannot be, set to `PAID` by this
  endpoint — there's simply no code path here that writes it.

**Still not built:** the frontend pages/redirect flow that will
actually use this endpoint (`payment-success`/`payment-failed`/
`payment-cancelled`, checkout branching for `PAYFAST` — see §9 above),
and ITN verification — the only thing that can ever move an order to
`paymentStatus: PAID`. `PAYFAST_ENABLED` should stay `false` in any
real/deployed environment until that exists too (see
`backend/PAYFAST_SETUP.md`).

---

## Milestone 22 — PayFast ITN and Payment Verification

Builds `POST /api/payments/payfast/notify` — **the only code path in
this backend allowed to set `paymentStatus: PAID`.** Full detail in
`backend/PAYFAST_SETUP.md` and `backend/API_ROUTES.md`'s "Payment
Routes" section.

**What was built:**

- `POST /api/payments/payfast/notify` — accepts PayFast's
  server-to-server ITN (form-urlencoded), verifies it, and updates
  `Payment`/`Order` only once every check passes.
- `backend/src/services/payfast.service.ts` — `processPayfastNotification()`,
  covering: required-field presence, `merchant_id` match, signature
  verification, order lookup, exact amount match, eligibility
  (payment method/provider/order status), status mapping, and
  idempotency.
- `backend/src/utils/payfastSignature.ts` — `verifyPayfastSignature()`,
  recomputing PayFast's signature over every field it actually posted
  (minus `signature`) and comparing with `crypto.timingSafeEqual`.
- `backend/src/app.ts` — `express.urlencoded({ extended: false })`
  (was `extended: true`) — PayFast posts a flat form body, and `false`
  (the `querystring` parser) is what its signature verification
  assumes; nothing else on this backend reads a urlencoded body, so
  JSON routes are unaffected.
- Renamed `PaymentInitiationError` → `PaymentError` (used by both
  `/initiate` and `/notify` now) — a pure rename, no behaviour change.

**Signature verification result:** implemented per PayFast's
documented custom-integration rules, verified working end-to-end in
testing (valid ITN accepted, single-byte-tampered signature rejected
with `403`). The raw string being hashed and the signature itself are
never logged anywhere.

**Amount verification result:** `amount_gross` is compared against
`Order.total` as a `Prisma.Decimal`, never a plain string — confirmed
a mismatched amount is rejected with a clean `400` and no DB write
occurs.

**Payment status mapping (documented decision):** `COMPLETE` →
`Payment.status/Order.paymentStatus = PAID`, `Order.status =
CONFIRMED`. `FAILED`/`CANCELLED` → matching `Payment.status`/
`Order.paymentStatus`, but **`Order.status` is deliberately left
unchanged (`PENDING`)** rather than auto-cancelling the order — a
single failed/cancelled payment attempt shouldn't prevent the customer
from retrying payment. Any other status is acknowledged but never
marks anything as paid; a note is saved to `Payment.failureReason` for
later investigation.

**Idempotency result:** confirmed via testing — a duplicate `COMPLETE`
for an already-`PAID` order returns a clean `200` acknowledgement with
no DB write and no stock change; a stale `FAILED`/`CANCELLED` arriving
after `PAID` is likewise acknowledged without downgrading the order.

**Stock:** never touched by this endpoint — confirmed by both code
review (no `stockQuantity` write anywhere in `processPayfastNotification`)
and direct testing (stock unchanged after a COMPLETE notification).

**Source IP verification — deliberately not implemented, documented as
a known gap** (task 12's explicit allowance): it can't be meaningfully
tested locally (no way to originate a request from PayFast's real
infrastructure to confirm the check works), and a check that's never
been exercised is riskier than an honest gap. Signature verification
is the primary defence in the meantime. Flagged clearly in
`backend/PAYFAST_SETUP.md` as required before any real production
PayFast credentials are used.

**Security properties now concretely true in code:**

- The frontend cannot decide payment success — no code path outside
  `/notify` can set `paymentStatus: PAID`.
- The amount verified is always `Order.total` from the database, never
  anything from the notification alone (it must *match* the stored
  total, not merely be present).
- `return_url`/`cancel_url` are confirmed to be navigation-only — the
  notify endpoint doesn't read or depend on them at all.

**Still not built:** the frontend pages that will actually receive a
customer back from PayFast (`payment-success`/`payment-failed`/
`payment-cancelled`), checkout branching for `PAYFAST`, source IP
verification, and email notification. `PAYFAST_ENABLED` should stay
`false` in any real/deployed environment until the frontend flow has
been tested against a genuine browser round-trip to PayFast's sandbox
— everything verified so far has been via direct, crafted requests
(`curl`), not a real PayFast interaction.

---

## Milestone 23 — Frontend PayFast Checkout Flow

Connects the checkout page to `POST /api/payments/payfast/initiate`
and adds the three customer-facing pages a PayFast redirect needs.
Full detail in `backend/PAYFAST_SETUP.md`'s "Frontend Checkout Flow"
section.

**What was built:**

- `VITE_PAYFAST_ENABLED` (root `.env`/`.env.example`, default `false`)
  — a **frontend-only** UI gate (`src/js/orders.js`'s
  `PAYMENT_METHODS`) for whether PayFast is selectable at checkout.
  Independent of the backend's own `PAYFAST_ENABLED` — flipping this
  alone can never let a real PayFast order through if the backend
  isn't also configured for it; the backend re-validates regardless.
- `src/js/api/paymentsApi.js` (new) — `initiatePayfastPayment(orderNumber)`,
  a thin wrapper matching the existing `ordersApi.js`/`enquiriesApi.js`
  style.
- `src/js/pendingPayment.js` (new) — a small Local Storage helper
  (`orderNumber`, `paymentMethod`, `createdAt` only — never a status or
  a PayFast field) so the payment-result pages can recover the order
  number if the URL doesn't have one.
- `src/js/app.js` — checkout now branches on `paymentMethod`: `PAYFAST`
  creates the order (same Order API call as `BANK_TRANSFER`), calls
  `/initiate`, then builds and submits a hidden `<form method="POST">`
  to the returned `processUrl` using the returned `fields` verbatim —
  **no field or signature is ever generated in the frontend.** If
  initiation itself fails after the order was created, the customer is
  sent to the real order's confirmation page rather than left stuck.
- `src/pages/paymentSuccess.js`, `paymentCancelled.js`,
  `paymentFailed.js` (new), registered in `src/js/router.js` as
  `#/payment-success`, `#/payment-cancelled`, `#/payment-failed`. All
  three are **read-only** — each only calls
  `GET /api/orders/:orderNumber/tracking` and renders whatever
  `paymentStatus` comes back; none of them can write anything.
- `backend/src/services/payfast.service.ts` — `return_url`/`cancel_url`
  now get `?orderNumber=<orderNumber>` appended (inside the hash
  fragment, since these are hash-router URLs) so the new pages know
  which order to look up.
- `src/pages/checkoutPage.js` and `src/pages/orderConfirmation.js` —
  wording updated so neither page claims "no real payment has been
  taken" when a PayFast order has actually been paid; both now reflect
  the order's real `paymentStatus`.

**Checkout flow result:** verified locally — `BANK_TRANSFER` checkout
is unchanged; a `PAYFAST` checkout creates a real `PAYFAST` order,
calls `/initiate`, and submits a real hidden form (`method="POST"`) to
PayFast's sandbox `processUrl` with every field (including `signature`)
taken directly from the backend's response.

**Payment success/cancelled/failed page results:** all three load
correctly with an `orderNumber` from the query string; `payment-success`
correctly shows the "being verified" (`PENDING`) message when no ITN
has confirmed payment yet, and would show "Payment Confirmed" only once
`paymentStatus` is genuinely `PAID` (confirmed by re-using Milestone
22's ITN test to move a test order to `PAID` and reloading the page).
None of the three pages make any write API call — confirmed by code
review (no `apiPost`/mutating call anywhere in any of the three files).

**Backend return/cancel URL result:** confirmed via a real `/initiate`
call that `return_url`/`cancel_url` come back with `?orderNumber=...`
correctly appended after the `#` fragment (e.g.
`http://localhost:5173/#/payment-success?orderNumber=SG-2026-XXXX`).

**Order status read result:** `GET /api/orders/:orderNumber/tracking`
already returned everything the new pages need (`paymentStatus`,
`status`) — reviewed, no backend response changes were necessary.

**Security properties reconfirmed at the frontend layer:**

- The frontend never marks a payment as paid, failed, or cancelled —
  no code path in any of the three new pages writes anything.
- The frontend never builds a PayFast field or signature — it only
  ever relays the backend's `/initiate` response into a form.
- `VITE_PAYFAST_ENABLED` is a UI convenience only, not a security
  boundary — the backend's own `PAYFAST_ENABLED` is what actually
  decides whether a `PAYFAST` order/payment can be created.

**Still not done:** a real end-to-end round trip through PayFast's own
hosted sandbox payment page has not yet been performed (testing so far
inspected the generated form and exercised the pages directly via
query strings) — see `backend/PAYFAST_SETUP.md`'s "Known Limitations".
No live/production PayFast credentials are in use anywhere, and
nothing from this milestone has been deployed.

---

## Milestone 24 — Order and Payment Email Preparation

Builds a clean, testable email service and five plain-text templates —
**no real email is sent, no provider is integrated, and no
order/payment/enquiry flow was changed to call it.** Full detail in
`backend/EMAIL_SETUP.md`.

**Root `.env` hygiene finding:** root (frontend) `.env` was found to
still contain non-`VITE_`-prefixed PayFast backend values
(`PAYFAST_MODE`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
`PAYFAST_PASSPHRASE`, `BACKEND_PUBLIC_URL`, `PAYFAST_RETURN_URL`,
`PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL`) — first noticed during
Milestone 23, still present. These look like real user-configured
sandbox merchant credentials (a different merchant ID than the generic
public PayFast test account used for automated testing throughout
Milestones 21-23), sitting in the wrong file and pointing at production
URLs. **Not removed or moved automatically** — this was reported to
the user directly, asking them to move or delete these lines
themselves, rather than an AI session guessing at intent with
credential-like data it didn't create. Both `.env.example` files
remain placeholder-only, and both `.env` files remain git-ignored —
those checks pass.

**What was built:**

- `backend/.env.example` — added `EMAIL_ENABLED=false`,
  `EMAIL_PROVIDER=console`, `EMAIL_FROM_NAME=Seasonedz Group`,
  `EMAIL_FROM_ADDRESS=`, `ADMIN_NOTIFICATION_EMAIL=`, plus optional
  future-provider placeholders (`RESEND_API_KEY`, `SENDGRID_API_KEY`,
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`) — all empty, no
  provider chosen yet.
- `backend/src/config/env.ts` — reads and validates the above.
  `EMAIL_FROM_ADDRESS`/`ADMIN_NOTIFICATION_EMAIL` are only eagerly
  required when `EMAIL_ENABLED=true` (same pattern as
  `PAYFAST_ENABLED`); provider API keys are never validated, since no
  provider is wired up yet.
- `backend/src/services/email/` (new) — `email.types.ts`
  (`OrderEmailData`/`EnquiryEmailData`, deliberately independent of
  `order.service.ts`/`enquiry.service.ts`'s own output types),
  `emailTemplates.ts` (five plain-text templates — order created,
  payment confirmed, payment failed/cancelled, admin new order, admin
  new enquiry — South African English, no fake bank details, a
  placeholder line for bank transfer instructions), `email.service.ts`
  (`sendOrderCreatedEmail`, `sendPaymentConfirmedEmail`,
  `sendPaymentFailedEmail`, `sendAdminNewOrderEmail`,
  `sendAdminNewEnquiryEmail` — all safe no-ops unless
  `EMAIL_ENABLED=true`, and even then only log masked metadata in
  `console` mode).

**Email service result:** verified locally — with `EMAIL_ENABLED=false`
(default), every send function is confirmed to do nothing (no console
output at all). With `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=console`,
each send logs exactly one line: template name, a masked recipient
(e.g. `j***@e***.com`), and an order number/enquiry reference — never
the rendered body, a full address, or any other personal detail.

**Templates created:** all five render without throwing against mock
order/enquiry data, covering every payment method's next-step wording
(bank transfer, PayFast, cash on delivery) and both admin notification
templates.

**Emails are prepared only, not wired automatically.** Reviewed and
documented (not modified) exact hook points for a future milestone:
`order.controller.ts`'s `createOrderHandler` (after order creation),
`payfast.service.ts`'s `processPayfastNotification` (inside the
`COMPLETE`/`FAILED`/`CANCELLED` branches that represent a *newly*
resolved status — deliberately not the idempotency early-return
branches, so a repeated ITN can never trigger a duplicate email once
wired up), and `enquiry.controller.ts`'s `createEnquiryHandler` (after
enquiry creation). None of these three files were changed — order
creation, ITN verification, and enquiry creation behave identically to
before this milestone.

**Still not done:** no real provider is chosen or integrated, no email
has ever actually been sent (by design), and the send functions aren't
called from anywhere in the request-handling code yet. That's
deliberately left for a later milestone, once a provider decision is
made.
