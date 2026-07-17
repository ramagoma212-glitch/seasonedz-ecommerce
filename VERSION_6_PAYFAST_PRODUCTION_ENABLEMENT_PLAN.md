# Version 6 — PayFast Production Enablement Plan (Milestone 38)

A planning-only milestone. **No code was changed, no payment was run,
no test order was created, no Render environment variable was
changed, and nothing was deployed, merged, or pushed.** This document
plans what production PayFast enablement will look like once the
PayFast business account's verification is approved — it does not
enable anything itself.

## Why This Milestone Exists Now

The PayFast business account is still pending verification. Until
PayFast approves it, no live Merchant ID/Key can exist, and no real
production payment can ever be taken — regardless of how ready the
code is. This milestone exists to plan the remaining steps precisely,
so that once verification completes, enabling PayFast in production is
a matter of following an already-agreed checklist rather than
re-deriving one under time pressure.

## Current Safe State

Confirmed directly from code, tracked config, and the live deployment
on branch `version-6-payfast-production-planning` (branched from `main`
at `cd8ca6e`):

| Check | Result |
|---|---|
| `PAYFAST_ENABLED` default | `false` — `backend/src/config/env.ts:54` |
| `VITE_PAYFAST_ENABLED` in GitHub Actions | `"false"` — `.github/workflows/deploy.yml:48` |
| `PAYFAST_VALIDATE_SERVER` default | `false` — `backend/src/config/env.ts:105` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` default | `"off"` (via the legacy-boolean fallback) — `backend/src/config/env.ts:153` |
| `TRUST_PROXY` default | `false` — `backend/src/config/env.ts:158` |
| `EMAIL_ENABLED` default | `false` — `backend/src/config/env.ts:171` |
| Live PayFast credentials tracked in git | None — only `.env.example`-style files, all with empty credential fields |
| `.env` files tracked in git | None — only `.env.example`, `.env.production.example`, `backend/.env.example` |
| Render rollback after sandbox test | Confirmed — `POST /api/payments/payfast/initiate` returns `503`/"not enabled" again, live checkout shows PayFast disabled |
| Live PayFast enabled anywhere | No |

Live re-confirmed at the time of writing this plan:
`GET /api/health` → `200`; `POST /api/payments/payfast/initiate` →
`503`, `"PayFast payments are not enabled."`.

## What Version 5 Proved

Reviewed: `VERSION_5_RENDER_PAYFAST_SANDBOX_TEST_RESULT.md`,
`VERSION_5_QA_MERGE_READINESS_REVIEW.md`,
`VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`,
`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`,
`backend/PAYFAST_SETUP.md`.

- **A real sandbox payment reached PayFast** — checkout redirected to
  PayFast's genuine sandbox `processUrl`
  (`https://sandbox.payfast.co.za/eng/process`), not a crafted or
  local simulation.
- **The ITN reached Render directly** — no tunnel involved this time;
  `PAYFAST_NOTIFY_URL` pointed straight at
  `https://seasonedz-ecommerce.onrender.com/api/payments/payfast/notify`,
  and the resulting `Payment.providerReference` (`"3276963"`) is a
  genuine PayFast-issued transaction reference.
- **Server validation passed** — `PAYFAST_VALIDATE_SERVER=true` was
  active and genuinely accepted the real ITN against PayFast's own
  validation endpoint.
- **Source verification ran in `monitor` mode and did not block** —
  `PAYFAST_SOURCE_VERIFICATION_MODE=monitor` was active; the payment
  completed regardless of the DNS source check's own outcome, exactly
  as `monitor` mode is designed to behave.
- **Payment became `PAID` only through the backend ITN** — confirmed
  via `status: CONFIRMED` / `paymentStatus: PAID` on the real order,
  a state only ever set inside `processPayfastNotification`'s
  `COMPLETE` case, never by the browser's return-URL redirect.
- **The frontend success page read the backend status correctly** —
  displayed "Payment Confirmed" / "Paid" only after fetching the
  order's real status from the API, never assumed from having landed
  on that page.
- **Rollback returned production to fully disabled mode** —
  independently reconfirmed afterward: `/initiate` returns `503`, the
  live checkout page shows PayFast disabled, health remains `200`.

This closes the last open *technical* proof gap from
`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`. What remains
before production enablement is no longer a code/proof question — it's
the PayFast account itself, plus operational readiness, both covered
below.

## PayFast Verification Blocker

**Live PayFast cannot proceed until all of the following are true:**

- PayFast account verification is approved by PayFast.
- The correct account holder or authorised representative is
  confirmed — the account must be held by Seasonedz Group (or its
  legitimate authorised representative), not an unrelated individual.
- The correct Seasonedz Group bank account is linked as the
  settlement account.
- A live Merchant ID and Merchant Key are available from the verified
  account.
- A decision is made on whether to use a live passphrase (optional on
  PayFast, but a deliberate choice either way).
- The owner explicitly confirms that no unauthorised personal bank
  account is linked to the account — this must be a positive,
  deliberate confirmation, not an assumption.

None of this is something code, testing, or documentation can resolve
— it depends entirely on PayFast's own verification process and the
business's own account setup.

## PayFast Account Readiness Checklist

To be worked through once PayFast verification is underway/approved:

- [ ] A live PayFast account exists for Seasonedz Group.
- [ ] The account is verified by PayFast.
- [ ] The business or authorised account holder on the account is
      correct.
- [ ] Any required business documents have been submitted and
      accepted by PayFast.
- [ ] The linked bank account is verified.
- [ ] The settlement bank account is confirmed correct (Seasonedz
      Group's own account, not a personal or unrelated account).
- [ ] The live Merchant ID is available.
- [ ] The live Merchant Key is available.
- [ ] A decision has been made on the live passphrase (use one, or
      deliberately don't).
- [ ] Desired payment methods are enabled on the PayFast account (card,
      EFT, etc., as the business wants to offer).
- [ ] Support contact details on the PayFast account are correct and
      current.

## Render Production Environment Plan (Documented, Not Set)

**These values are documented for later use only — none of them are
set as part of this milestone, and no Render environment variable was
touched.**

| Variable | Planned production value |
|---|---|
| `PAYFAST_ENABLED` | `true` |
| `PAYFAST_MODE` | `production` |
| `PAYFAST_VALIDATE_SERVER` | `true` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` | `monitor` |
| `TRUST_PROXY` | `true` |
| `BACKEND_PUBLIC_URL` | `https://seasonedz-ecommerce.onrender.com` |
| `PAYFAST_NOTIFY_URL` | `https://seasonedz-ecommerce.onrender.com/api/payments/payfast/notify` |
| `PAYFAST_RETURN_URL` | `https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/payment-success` |
| `PAYFAST_CANCEL_URL` | `https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/payment-cancelled` |
| `PAYFAST_MERCHANT_ID` | *(live merchant ID — not yet available)* |
| `PAYFAST_MERCHANT_KEY` | *(live merchant key — not yet available)* |
| `PAYFAST_PASSPHRASE` | *(live passphrase, if used — decision pending)* |

`PAYFAST_SOURCE_VERIFICATION_MODE=monitor` is deliberately planned here
rather than `enforce` — per
`VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`, `enforce` should
only follow once `monitor` mode's logs show it reliably passing against
real production PayFast traffic over time, not immediately at launch.

## Frontend Enablement Plan

GitHub Actions (`.github/workflows/deploy.yml`) would eventually need:

```
VITE_PAYFAST_ENABLED: "true"
```

**But only after all of the following, in order:**

1. PayFast account verification is approved.
2. Live credentials are configured safely in Render (per the
   environment plan above).
3. A small real payment test plan is approved (see below) — not run
   yet, just agreed.
4. A rollback plan is ready (see below).
5. An order-monitoring process is ready (see "Operational Readiness
   Checklist" below).

Flipping this flag is the single change that would let real customers
select PayFast — it should be the last step taken, once every
precondition above is already true, not the first.

## First Real Payment Test Plan

A safe, minimal, deliberately small first real-money test — **not run
as part of this milestone**:

1. Use one low-value product, or the smallest practical order total.
2. The business owner acts as the test customer — a real person who
   can immediately confirm the outcome, not an anonymous test.
3. Complete a real payment on PayFast's real production page.
4. Confirm the ITN reaches Render (check the order's `Payment` record
   for a genuine `providerReference` and `paidAt`).
5. Confirm server validation passes against PayFast's real production
   validation endpoint.
6. Confirm the order becomes `PAID` and `CONFIRMED` only via that ITN.
7. Confirm the frontend success page shows the confirmed status.
8. Confirm the transaction appears in the PayFast merchant dashboard
   itself — the one confirmation source entirely outside this
   codebase.
9. Confirm there's a clear refund/handling plan for this specific test
   transaction (refund it, or treat it as a genuine first sale —
   decided in advance, not improvised after the fact).
10. Immediately after, explicitly decide: keep PayFast enabled, or
    roll back — do not leave this decision implicit or "for later."

## Rollback Plan

Immediate rollback, to be applied the moment a decision is made to stop
(whether after the first real payment test or at any later point):

**Render:**

| Variable | Rollback value |
|---|---|
| `PAYFAST_ENABLED` | `false` |
| `PAYFAST_VALIDATE_SERVER` | `false` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` | `off` |
| `TRUST_PROXY` | `false` |

**GitHub Actions:**

| Variable | Rollback value |
|---|---|
| `VITE_PAYFAST_ENABLED` | `"false"` |

**Confirm after rollback:**

- `POST /api/payments/payfast/initiate` returns
  `{"success":false,"message":"PayFast payments are not enabled."}`.
- Live checkout shows PayFast "Coming Soon" or disabled.
- `GET /api/health` still returns `200`.

This is the exact same rollback discipline already proven twice this
project (Version 4's and Version 5's sandbox tests) — nothing new needs
to be invented here, only repeated.

## Operational Readiness Checklist

What Seasonedz Group must have in place **before** live PayFast, not
after:

- [ ] Someone checks new orders daily.
- [ ] Someone checks paid orders in the PayFast merchant dashboard.
- [ ] Someone confirms fulfilment manually (no admin dashboard exists
      yet — see "Risks" below).
- [ ] Someone contacts the customer if a payment stays `PENDING` too
      long.
- [ ] The manual refund process (via the PayFast dashboard) is
      understood by whoever will need to use it.
- [ ] Support contact details are visible and correct on the live site.
- [ ] Shipping and returns policy pages are accurate and up to date.
- [ ] The Bank Transfer flow still works as a fallback payment option.
- [ ] Customer WhatsApp or email support is ready to handle real
      payment questions.

## Risks

- **PayFast verification is still pending** — the primary, current
  blocker; nothing below matters until this resolves.
- **No admin dashboard yet** — order/payment monitoring is entirely
  manual (direct database or PayFast dashboard review).
- **Email provider not connected yet** — customers get no automatic
  order/payment confirmation email; only the frontend pages and manual
  contact cover this today.
- **Courier API not connected yet** — fulfilment and shipment tracking
  remain entirely manual.
- **Payment-attempt model not implemented yet** — genuine
  duplicate-payment *detection* (comparing PayFast's `pf_payment_id`
  across attempts) remains unbuilt; the retry-while-`PENDING` race
  itself is fixed (Milestone 34), but detecting a hypothetical
  double-charge from some other cause is not.
- **Source verification is `monitor` mode, not `enforce`** — a
  deliberate, documented choice (see
  `VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`), not an
  oversight; revisit only once `monitor` mode shows a reliable pass
  rate against real production traffic over time.
- **Manual order monitoring is required** — every operational
  safeguard above depends on a human actually checking, since no
  automated alerting exists yet.

## Recommendation

**Do not enable live PayFast yet.** Continue only after:

1. PayFast account verification is approved, and
2. The owner explicitly confirms the correct bank account is linked
   and live credentials are ready.

Both are prerequisites the assistant cannot verify or accelerate —
they depend on PayFast's own process and the business owner's own
account setup.

## Suggested Version 6 Milestones

- **Milestone 38 — Production enablement planning.** This milestone.
  Complete.
- **Milestone 39 — Live PayFast account readiness check.** Work through
  the "PayFast Account Readiness Checklist" above once verification
  is approved.
- **Milestone 40 — Production env dry run review.** A final review of
  the Render production environment plan above against whatever the
  actual verified account provides, before any value is set.
- **Milestone 41 — Tiny real payment test.** Execute the "First Real
  Payment Test Plan" above.
- **Milestone 42 — Live PayFast launch decision.** The explicit
  keep-enabled-or-rollback decision from the tiny test, made formal.
- **Milestone 43 — Post-launch monitoring review.** Confirm the
  "Operational Readiness Checklist" is actually being followed once
  live, and catch anything missed.

Milestone 39 is not started as part of this milestone.
