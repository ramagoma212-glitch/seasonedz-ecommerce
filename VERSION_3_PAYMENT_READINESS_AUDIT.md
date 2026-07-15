# Version 3 — Payment Readiness Audit (Milestone 19)

*(See "Milestone 20" section near the end of this document for the
sandbox configuration work that followed this audit.)*

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
