# Version 5 — Render PayFast Sandbox Test Result

The controlled Render PayFast sandbox round trip planned in
`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md` (Milestone 36) has now
been run, against the real deployed Render backend (`main` at
`725f109`), and rolled back. **This is the first genuine
acceptance-path proof of PayFast's notification verification on
Render's actual production infrastructure** — every prior test
(Milestones 22, 29, 30) proved this either with crafted local requests
or through a temporary tunnel, never on Render itself.

## Result: Success

A full, real hosted PayFast sandbox payment was completed and
correctly processed end-to-end, with the live public site never
exposed to PayFast at any point.

## Test Setup

- **Live GitHub Pages frontend stayed PayFast-disabled throughout** —
  never rebuilt, never redeployed, never touched. Confirmed both before
  and after the test: the PayFast radio remains `disabled`, labelled
  "PayFast (Coming Soon)."
- **A local frontend was used for the test**, pointed at the live
  Render backend via inline environment overrides (never written to
  any tracked or untracked `.env` file):
  ```
  VITE_API_BASE_URL=https://seasonedz-ecommerce.onrender.com/api
  VITE_PAYFAST_ENABLED=true
  ```
- Render's environment was temporarily set by the user (outside this
  assistant's access) to sandbox values — `PAYFAST_ENABLED=true`,
  `PAYFAST_MODE=sandbox`, `PAYFAST_VALIDATE_SERVER=true`,
  `PAYFAST_SOURCE_VERIFICATION_MODE=monitor`, `TRUST_PROXY=true`, plus
  sandbox merchant credentials — for the duration of this test only.

## Pre-Flight Confirmations

- `POST /api/payments/payfast/initiate` had already moved from `503`
  ("not enabled") to reaching real order-lookup logic — confirming
  Render had picked up the sandbox env vars before the round trip
  began.
- Local frontend confirmed showing PayFast as selectable.

## Round Trip

1. One small test cart (1 unit, "School Starter Colouring Pack").
2. Checked out with PayFast from the local frontend — real order
   `SG-2026-PZCP` created.
3. `POST /api/payments/payfast/initiate` returned:
   - `processUrl: https://sandbox.payfast.co.za/eng/process` — genuine
     PayFast **sandbox**, never production.
   - `notify_url: https://seasonedz-ecommerce.onrender.com/api/payments/payfast/notify`
     — Render's own real public URL, no tunnel involved.
   - `return_url` / `cancel_url` both pointing to `localhost:5173`.
4. The browser was redirected to PayFast's real sandbox payment page
   and the payment was completed there using PayFast's own sandbox
   simulator control (no real card or banking details of any kind).

## Backend Verification Confirmed

- **Render's backend received the ITN directly** — no tunnel, no
  intermediary. Confirmed via the order's `Payment` record:
  `provider: "PAYFAST"`, `providerReference: "3276963"` (a genuine
  PayFast-issued transaction reference — never a self-crafted value),
  `paidAt` timestamped ~19 seconds after order creation.
- **Server validation passed** — `PAYFAST_VALIDATE_SERVER=true` was
  active for this test; a failed validation would have produced a
  `400` and left the order unpaid. The order became `PAID`, so this
  check ran and passed against PayFast's real infrastructure.
- **Source verification ran in `monitor` mode and did not block** —
  `PAYFAST_SOURCE_VERIFICATION_MODE=monitor` was active; by design,
  `monitor` never blocks regardless of its own pass/fail outcome. The
  order becoming `PAID` confirms nothing was blocked by this check.
  This assistant does not have Render dashboard/log access, so the
  exact logged pass/fail reason
  (`check=sourceVerification mode=monitor result=...`) could not be
  independently read — only that it did not prevent the payment, which
  is the specific property `monitor` mode guarantees.
- **Payment became `PAID` only through the backend ITN** — confirmed
  via `GET /api/orders/SG-2026-PZCP/tracking`: `status: "CONFIRMED"`,
  `paymentStatus: "PAID"`, amount matching the order total exactly
  (`539.00`). This state is only ever set inside
  `processPayfastNotification`'s `COMPLETE` case — never by the
  browser's return-URL redirect, which the frontend never trusts.
- **The frontend success page read the real backend status
  correctly** — after redirecting back from PayFast, the local
  success page displayed "Payment Confirmed," "Order Status:
  Confirmed," "Payment Status: Paid" — all fetched live from the
  backend, not assumed from having landed on that page.

## Cleanup

- Test order `SG-2026-PZCP` deleted.
- Stock on "School Starter Colouring Pack" restored by exactly the 1
  unit the test order had decremented.
- `SG-2026-28SM` confirmed untouched throughout.

## Rollback

Render's sandbox environment variables were rolled back by the user
immediately after the test. Confirmed afterward, read-only, with no
new test data created:

- `POST /api/payments/payfast/initiate` → `HTTP 503`,
  `{"success":false,"message":"PayFast payments are not enabled."}`.
- `GET /api/health` → `HTTP 200`, service healthy.
- Live GitHub Pages still shows PayFast disabled.

## What This Proves

The one remaining item from
`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`'s production
readiness decision — proving the verification acceptance path directly
on Render, not local development, not a tunnel — is now proven.
`PAYFAST_VALIDATE_SERVER=true` genuinely works against the deployed
backend, and `PAYFAST_SOURCE_VERIFICATION_MODE=monitor` genuinely does
not block a real payment even while running on Render's real proxy
topology.

## What This Does Not Prove

- This was a single successful round trip, not a high-volume or
  long-running observation. Per
  `VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`'s own caution, a
  single `monitor`-mode pass should not by itself be treated as final
  production approval — more real traffic over time (once/if
  `PAYFAST_ENABLED` is ever considered for production) would still be
  the stronger evidence base before ever moving to
  `PAYFAST_SOURCE_VERIFICATION_MODE=enforce`.
- Whether the specific DNS-based source check *passed or failed* this
  time is not independently confirmed (no Render log access) — only
  that it did not block, which is `monitor` mode's guarantee either
  way.
- A payment-attempt model for genuine duplicate-payment detection is
  still unbuilt (unchanged from Milestone 34/37's findings).
- Production PayFast remains disabled — this test result is evidence
  for a future, separate, deliberate decision about production
  enablement, not that decision itself.
