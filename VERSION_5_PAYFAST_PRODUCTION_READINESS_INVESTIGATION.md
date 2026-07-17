# Version 5 — PayFast Production Readiness Investigation (Milestone 33)

An investigation-only milestone. No payment logic, backend logic, or
Render configuration was changed. This document reviews the two
blockers carried over from Version 4 and recommends (without
implementing) a strategy for each, then gives a production readiness
decision.

## Current State

Confirmed directly from code and tracked config on branch
`version-5-payfast-readiness` (branched from `main` at `5810bee`):

| Flag / fact | Value | Where |
|---|---|---|
| `PAYFAST_ENABLED` default | `false` | `backend/src/config/env.ts:54` |
| `VITE_PAYFAST_ENABLED` in GitHub Actions | `"false"` | `.github/workflows/deploy.yml:48` |
| `PAYFAST_VERIFY_SOURCE` default | `false` | `backend/src/config/env.ts:105` |
| `PAYFAST_VALIDATE_SERVER` default | `false` | `backend/src/config/env.ts:106` |
| `TRUST_PROXY` default | `false` | `backend/src/config/env.ts:110-111` |
| `EMAIL_ENABLED` default | `false` | `backend/src/config/env.ts:123` |
| Production PayFast credentials tracked in git | None | `backend/.env.example` has `PAYFAST_MERCHANT_ID=`, `PAYFAST_MERCHANT_KEY=`, `PAYFAST_PASSPHRASE=` all empty |
| `.env` files tracked in git | None | only `.env.example`, `.env.production.example`, `backend/.env.example` are tracked |

Every flag needed for a real production PayFast payment is off by
default, and no real credential is committed anywhere. Nothing in this
milestone changes any of that.

### Files reviewed

`backend/src/utils/payfastSourceVerification.ts`,
`backend/src/utils/payfastServerValidation.ts`,
`backend/src/utils/payfastSignature.ts`,
`backend/src/services/payfast.service.ts`,
`backend/src/config/payfast.ts`, `backend/src/config/env.ts`,
`backend/src/app.ts`, `backend/prisma/schema.prisma` (Payment model),
`src/js/payfastRetry.js`, `src/components/payfastRetry.js`,
`src/pages/paymentSuccess.js`, `src/pages/paymentCancelled.js`,
`src/pages/paymentFailed.js`, `VERSION_4_QA_PRODUCTION_READINESS_REVIEW.md`,
`VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`,
`VERSION_4_PAYMENT_RETRY_POLISH.md`. No inaccuracies were found in any
of them — nothing needed even a small documentation correction.

## Source Verification Investigation

**How `req.ip` is read.** `payfastSourceVerification.ts` calls
`getRequestSourceIp(req)`, which just reads `req.ip` (normalizing an
IPv4-mapped IPv6 form like `::ffff:102.130.116.4` down to
`102.130.116.4`). It deliberately never reads `X-Forwarded-For`
directly — a client can set that header to anything, so trusting it
without Express's own proxy-hop validation in front of it would defeat
the point.

**How `X-Forwarded-For` and `trust proxy` interact.** Express only
derives `req.ip` from `X-Forwarded-For` when `app.set("trust proxy", N)`
is configured. `app.ts` only calls this when `TRUST_PROXY=true`, and
uses exactly `1` (trust one hop), never `true` (which would trust the
whole chain and let a client spoof it if more than one real proxy were
in front). With `trust proxy` off (the default), `req.ip` is whatever
directly connected to the Node process — on Render, that's Render's own
proxy, never the real caller.

**How `TRUST_PROXY=1` behaves through ngrok vs. Render.** "Trust one
hop" means: take the right-most address in `X-Forwarded-For` that isn't
the direct connection, on the assumption there is exactly one proxy
between the real client and this app. That assumption was tested
through ngrok during Milestone 30's hosted round trip, and is **untested
on Render itself** — these are two different network topologies, and a
setting proven (or disproven) on one says nothing definitive about the
other. Render's own edge infrastructure may involve a different
effective hop count than ngrok's tunnel infrastructure does.

**How DNS-based PayFast domain resolution is compared.**
`verifyPayfastSource()` resolves `www.payfast.co.za` /
`w1w.payfast.co.za` / `w2w.payfast.co.za` (production) or
`sandbox.payfast.co.za` (sandbox) via live DNS at verification time, and
checks whether the request's source IP is in that resolved set. This is
deliberately not a hardcoded IP allowlist (PayFast doesn't publish a
citable one), but it means the check's accuracy depends on PayFast's
DNS records reflecting the actual outbound server that sent the ITN at
that moment — something this codebase has no independent way to
confirm.

**Why the real sandbox ITN through ngrok failed source verification.**
Milestone 30's real hosted round trip test set
`PAYFAST_VERIFY_SOURCE=true` and got a genuine `403` rejection from a
real PayFast ITN. Per `VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`,
the exact cause was never conclusively isolated between two equally
plausible candidates: (a) ngrok's forwarding not preserving PayFast's
real caller IP in a way a single-hop `TRUST_PROXY` setting resolves
correctly, or (b) PayFast's real outbound ITN IP simply not matching
what its own domains currently resolve to via DNS. The test correctly
treated this as "reject, don't guess" rather than weakening the check to
force a pass — so the rejection path is proven, but the *reason* for
rejection through a tunnel specifically was not, and by extension
neither was whether the same check would pass against Render's own
proxy topology.

**Whether PayFast server validation is a more reliable production
proof than DNS source-IP matching.** Yes. `validateWithPayfastServer()`
POSTs the exact ITN payload back to PayFast's own `/eng/query/validate`
endpoint and only trusts a literal `"VALID"` response — this is
protocol-guaranteed by PayFast regardless of network topology, proxies,
or tunnels, and it was the check that actually produced Milestone 30's
one genuine `PAID` result (with `PAYFAST_VERIFY_SOURCE=false`,
`PAYFAST_VALIDATE_SERVER=true`). DNS-based source-IP matching, by
contrast, is a heuristic on top of an unpublished, unstable input
(PayFast's current DNS answers), which is inherently a best-effort
signal, not a guarantee — a mismatch is a strong (if reason-unknown)
signal something is wrong, but a match/non-match through a proxy or
tunnel can't be trusted as authoritative either way.

**Whether the current approach is too strict for tunnels and
proxies.** For any topology with more than exactly one real intervening
hop (or a proxy whose header-forwarding behaviour isn't fully
understood — true of both the ngrok tunnel tested and, so far,
untested, of Render's own edge), yes: source verification will produce
false rejections that have nothing to do with whether the notification
genuinely came from PayFast. It is safe (it fails closed, never fakes a
pass), but "safe" here means "unusable as a production gate until
proven on the exact real deployment topology," not "ready."

## Source Verification Recommendation

**Recommended: a combination of Option C and Option D.**

- **Option C** as the permanent architecture: PayFast server validation
  (`PAYFAST_VALIDATE_SERVER`) plus signature, merchant ID, and amount
  verification (already always-on in `payfast.service.ts`, independent
  of any flag) should be the actual production trust gate. DNS-based
  source-IP verification should remain available but demoted to
  best-effort/logging — informative when it matches, never a sole
  reason to reject given its dependency on live DNS and untested proxy
  hop-counts.
- **Option D** as the process gate before flipping `PAYFAST_ENABLED` in
  Render: whichever verification combination is chosen must actually be
  proven with a real PayFast sandbox round trip against the real Render
  deployment — not local development, not a tunnel — since Render's own
  proxy topology has never been tested at all. Milestone 30 proved
  server validation's acceptance path through ngrok; it did not prove
  anything about Render's topology, because Render was never in that
  request path.

Option A (treat DNS source verification as merely "optional") is close
to this recommendation but doesn't go far enough — it still implies
source-IP matching might gate production in some configuration. Option
B (trust headers only behind a known proxy like Render) doesn't change
the underlying reliability problem; it's a refinement of the current
`TRUST_PROXY` mechanism, not a fix, since Render's real hop count is
still unproven either way. No code was changed to implement this
recommendation — see "What Must Not Be Done Yet" below.

## Retry While PENDING Investigation

**Which statuses can retry.** `PAYFAST_RETRY_ELIGIBLE_STATUSES =
[PENDING, FAILED, CANCELLED]` (`payfast.service.ts:64`), used
identically at initiation (`initiatePayfastPayment`) and at the point a
retried payment tries to actually complete (`processPayfastNotification`'s
`COMPLETE` case) — a retry that can start is guaranteed to be able to
finish. `PAID` and `REFUNDED` can never retry.

**Why `PENDING` retry was allowed.** A first PayFast attempt leaves an
order `PENDING` until its ITN arrives, which can take minutes. Most
customers who see "pending" believe the first attempt failed and want
to try again — refusing that would be a real usability cost for the
overwhelmingly common case where the first attempt genuinely didn't
succeed.

**How duplicate PayFast payments could happen.** Every retry calls
`initiatePayfastPayment`, which reuses the order's single `Payment` row
(schema: `Payment.orderId String @unique` — a strict one-to-one, no
per-attempt table) and always sets `m_payment_id: order.orderNumber` —
identical on every attempt. If a customer's first attempt is still
genuinely in flight (not yet failed, just slow) and they retry and
complete a second, separate PayFast session for the same order, PayFast
has no way to know these are "the same order" from its side, and both
could independently be charged and independently send `COMPLETE` ITNs.

**What happens if two `COMPLETE` ITNs arrive for the same order.** The
first to arrive marks the order `PAID` normally. The second hits
`if (order.paymentStatus === PaymentStatus.PAID) return { message:
"Payment already recorded as PAID; duplicate notification
acknowledged." }` — acknowledged and discarded, no error, no alert.

**Whether idempotency prevents double status updates but not double
customer charge.** Exactly that. The order-level idempotency check only
asks "is this order already PAID?" — it says nothing about whether the
incoming ITN represents the *same* PayFast transaction as the one
already recorded, or a *different, second* transaction that also
completed. Both cases produce the identical "duplicate notification
acknowledged" response today. If the customer really was charged twice,
this backend currently has no signal that would ever surface that.

**Whether PayFast has a payment ID that could help detect this.** Yes —
`pf_payment_id`, PayFast's own per-transaction reference, is already
read (`pfPaymentId` in `payfast.service.ts:216`) and stored as
`providerReference` on the single `Payment` row. But it's never
*compared*: nothing checks "does this ITN's `pf_payment_id` match the
one we already recorded as PAID?" A second `COMPLETE` ITN with a
genuinely different `pf_payment_id` for the same order (a real
double-charge) and a harmless re-delivery of the identical ITN PayFast
already sent (a documented, expected occurrence) currently produce the
exact same code path and the exact same log-free outcome. There is
today no way to distinguish "duplicate delivery of one payment" from
"two separate successful payments" — that distinction is exactly what
a payment-attempt model (Option D) would enable.

**What the customer experience should be.** The existing pages already
show honest, real-time status (never assuming success or failure) and,
for `PENDING`, an explicit "please do not place another order yet"
warning alongside the retry button — but the warning is advisory text
only; the button remains clickable regardless. The customer experience
gap isn't dishonesty (nothing here lies about status), it's that the
UI *offers* a genuinely risky action with only a text warning as the
deterrent.

## Retry Recommendation

**Recommended: Option A now, Option D as the durable fix.**

- **Option A** (disable retry while `PENDING`; allow only `FAILED` and
  `CANCELLED`) is the safest practical change before production, and
  the simplest. It structurally removes the specific race described
  above: a `FAILED` or `CANCELLED` order's original attempt is already
  known to be dead (PayFast said so, or the customer explicitly backed
  out), so a second attempt can't collide with a still-live first one.
  A `PENDING` order's first attempt might still resolve positively
  later — that's precisely the case that creates the risk, and it's
  the one case Option A removes.
- **Option D** (a payment-attempt model, tracking each PayFast attempt
  and its `pf_payment_id` separately) is the right long-term fix,
  because it's the only option that creates real *detection*: without
  it, a genuine double-charge and a harmless duplicate ITN delivery are
  indistinguishable. This is correctly scoped as its own future
  milestone (a schema change), not something to do now.

Option B (a cooldown) only narrows the race window without closing it —
a customer can still wait it out and retry while the first attempt is
genuinely still live — while adding real complexity (a timer, clock-skew
handling, "why can't I retry yet" support questions). Option C (stronger
warning text) is already effectively in place (`paymentSuccess.js`'s
"please do not place another order yet") and doesn't prevent the race
at all — it's a good complement to Option A, not a substitute for it.

No code was changed to implement this recommendation — see below.

## Security Review

Nothing in this investigation weakens any existing check. All findings
above describe **existing, already-shipped** behaviour; no new gaps were
introduced by looking for them. Specifically re-confirmed during this
review:

- Signature verification, merchant-ID match, and amount match in
  `processPayfastNotification` are unconditional — never gated behind
  any flag, unlike source verification and server validation.
- `PAYFAST_VALIDATE_SERVER` and `PAYFAST_VERIFY_SOURCE` both fail
  closed (network error/timeout/mismatch → reject), never fail open.
- No credential, passphrase, or raw PayFast payload is logged anywhere
  in the reviewed files.
- The retry-eligibility list is identical at initiation and at
  completion, so no retry can be started that's silently doomed to fail
  later (or, conversely, no status can complete that shouldn't have
  been retryable in the first place).

## Production Readiness Decision

**Is Version 5 allowed to enable PayFast in production now? No —
despite item 1 below now being proven, this remains a separate,
deliberate decision not yet made.**

**What had to happen first:**

1. ~~Prove (or formally, explicitly accept as a documented trade-off) an
   acceptance path for PayFast's notification verification — running a
   real PayFast sandbox round trip **against the actual Render
   deployment**, not local development and not a tunnel, using server
   validation (plus signature/merchant/amount) as the gate.~~ — **done.**
   A real controlled round trip against the deployed Render backend
   completed successfully: `PAYFAST_VALIDATE_SERVER=true` genuinely
   accepted a real PayFast ITN, and `PAYFAST_SOURCE_VERIFICATION_MODE=monitor`
   ran without blocking the payment. See
   `VERSION_5_RENDER_PAYFAST_SANDBOX_TEST_RESULT.md`. A single
   successful round trip is evidence, not exhaustive proof — see that
   document's "What This Does Not Prove."
2. ~~Either implement Option A (disable `PENDING` retry pre-production)
   or formally, explicitly accept the current duplicate-payment risk as
   a documented trade-off~~ — **done as of Milestone 34.** Retry while
   `PENDING` is now blocked at the backend regardless of what any
   frontend client sends; see `VERSION_5_RETRY_PENDING_RISK_FIX.md`.
   The residual, narrower risk (a payment-attempt model for genuine
   duplicate *detection*, Option D) remains open future work, not a
   production blocker in the same way.
3. With both (1) and (2) now resolved, enabling `PAYFAST_ENABLED` /
   `VITE_PAYFAST_ENABLED` in Render production is unblocked from a
   technical-proof standpoint — but remains its own separate,
   deliberate go-live decision, not something this document or any
   single test result makes automatically.

## Recommended Version 5 Implementation Milestones

- **Milestone 33 — Production readiness investigation.** This
  milestone. Complete.
- **Milestone 34 — Retry while PENDING risk fix.** Complete — Option A
  implemented (retry disabled while `PENDING`, allowed only for
  `FAILED`/`CANCELLED`, via a `context: "checkout" | "retry"` split on
  `POST /api/payments/payfast/initiate`); frontend copy and
  `isPayfastRetryEligible` updated to match. See
  `VERSION_5_RETRY_PENDING_RISK_FIX.md`.
- **Milestone 35 — PayFast verification strategy update.** Complete —
  Option C implemented via a new `PAYFAST_SOURCE_VERIFICATION_MODE`
  (`off | monitor | enforce`); `PAYFAST_VALIDATE_SERVER=true` documented
  as a required production precondition. See
  `VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`.
- **Milestone 36 — PayFast final sandbox QA.** Complete — the plan
  (`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`) was executed as a
  real round trip **against the deployed Render backend** (not a
  tunnel), proving the updated verification strategy's acceptance path
  directly on the real production topology. See
  `VERSION_5_RENDER_PAYFAST_SANDBOX_TEST_RESULT.md`.
- **Milestone 37 — Production PayFast enablement checklist.** The
  actual go-live checklist and (if approved) flipping `PAYFAST_ENABLED`
  in Render with real production credentials.
- **Milestone 38 — Optional email provider integration.** Connect a
  real email provider (currently console-only); independent of the
  PayFast decision and can proceed on its own timeline.

Milestone 34 is complete as of `VERSION_5_RETRY_PENDING_RISK_FIX.md`.
Milestone 35 is complete as of
`VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`. Milestone 36 is
complete, planning and execution both — see
`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md` and
`VERSION_5_RENDER_PAYFAST_SANDBOX_TEST_RESULT.md`. Milestone 37 (this
document's own numbering) covers Version 5's QA/merge readiness review,
already completed separately — see `VERSION_5_QA_MERGE_READINESS_REVIEW.md`.

## Milestone 36 — Final PayFast Sandbox QA Plan for Render (Complete)

Produced the exact test plan and Render environment checklist for a
sandbox round trip against the real deployed backend — see
`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md` for full detail:
manual Render env checklist (sandbox credentials only, applied by the
user directly in Render's dashboard — no secret values requested or
printed here), the recommended approach (a local frontend pointed at
the live Render backend, so the public GitHub Pages frontend never
needs `VITE_PAYFAST_ENABLED=true` at any point), step-by-step test
steps, a rollback checklist, and a risk review. No code changes were
required for this plan — everything it depends on (server validation,
`monitor` mode, retry-while-`PENDING` blocking) already exists from
Milestones 29 and 34-35.

**The plan was then executed as a real controlled round trip** — see
`VERSION_5_RENDER_PAYFAST_SANDBOX_TEST_RESULT.md` for the full result.
Server validation genuinely accepted a real PayFast ITN on Render;
source verification's `monitor` mode ran without blocking. Rollback was
completed immediately afterward and independently confirmed.

## What Must Not Be Done Yet

Still true after Milestones 34-36 and the Render sandbox test:

- PayFast is not enabled in Render production.
- No live PayFast credentials were added anywhere.
- No Render environment variables remain changed — the sandbox test's
  temporary values were rolled back and the rollback was confirmed.
- Nothing was deployed as part of this document's own work.
- No real email was sent.
- No courier integration was added.
- No login was added.
- No admin dashboard was added.
- Enabling `PAYFAST_ENABLED` in Render production remains a separate,
  deliberate decision not yet made, even though the Render sandbox
  round trip now succeeded.
