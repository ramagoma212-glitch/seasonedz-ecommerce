# Version 4 — QA and Production Readiness Review (Milestone 32)

Full QA, security, and production-readiness review of everything built
in Version 4 (Milestones 27-31) before deciding whether this branch —
`version-4-payfast-hardening` — is safe to push, merge, deploy, or have
`PAYFAST_ENABLED` turned on anywhere real. This milestone made no
functional code changes; it is a review, a set of tests, and
documentation fixes only.

## Version 4 Summary

Five commits on this branch since `main`:

- **Milestone 27 — PayFast Sandbox Round Trip Plan.** Planning only:
  how a real hosted round trip would work, source-IP verification
  options, recommended build order.
- **Milestone 28 — Public Sandbox Test Setup.** A step-by-step guide
  for using a temporary public tunnel (ngrok/localtunnel) to let
  PayFast's real infrastructure reach a local backend. No round trip
  run yet.
- **Milestone 29 — Source Verification Hardening.** Added
  `PAYFAST_VERIFY_SOURCE` (DNS-based domain check on the ITN's source
  IP) and `PAYFAST_VALIDATE_SERVER` (PayFast's own server-confirmation
  endpoint), both disabled by default, layered on top of — never
  instead of — signature/amount/merchant-ID verification. Only
  rejection paths provable at the time (crafted local requests).
- **Milestone 30 — Hosted PayFast Sandbox Round Trip Test.** The real
  test: checkout → PayFast's real sandbox payment page → a real ITN
  delivered over a public tunnel → genuine backend-verified
  `PAID`/`CONFIRMED`. Found and fixed two real signature bugs along the
  way (a PHP `urlencode()` encoding gap, and empty-valued ITN fields
  being incorrectly dropped before recomputing the signature) — neither
  was catchable by Milestone 22's original crafted-signature
  self-tests, since those only ever checked the code against itself.
  Proved `PAYFAST_VALIDATE_SERVER`'s acceptance path; `PAYFAST_VERIFY_SOURCE`
  correctly and safely rejected the same real ITN through the tunnel
  used, and its acceptance path remains unproven.
- **Milestone 31 — Payment Failure and Retry Polish.** A customer can
  now retry a PayFast payment that didn't reach `PAID` ("Try PayFast
  Again" on the success/cancelled/failed pages). Found and fixed a
  related backend gap: the notify flow's `COMPLETE` guard only allowed
  completing from `PENDING`/`FAILED`, not `CANCELLED` — retrying a
  cancelled order would have been allowed to *start* but silently
  failed to ever record as paid.

## Test Results

All testing this milestone was done locally against controlled
database states (existing test orders, Prisma-crafted states, and one
new checkout) — no new hosted PayFast payment was run; it wasn't
necessary to re-verify anything this milestone's QA needed.

### Backend QA

| Check | Result |
|---|---|
| `GET /api/health` | ✅ `200` |
| `GET /api/products` | ✅ `200` |
| `GET /api/categories` | ✅ `200` |
| Bank transfer order creation | ✅ Order created (`SG-2026-K9JE`) |
| PayFast order blocked, `PAYFAST_ENABLED=false` | ✅ `400`, `"PayFast payments are not available yet."` |
| PayFast order allowed, `PAYFAST_ENABLED=true` | ✅ Order created |
| Initiate: invalid request (malformed order number) | ✅ `400` |
| Initiate: unknown order | ✅ `404` |
| Initiate: wrong payment method (bank transfer) | ✅ `400`, `"This order was not created for PayFast payment."` |
| Initiate: valid PayFast order (`PENDING`) | ✅ `200`, real sandbox `processUrl` returned |
| Initiate: `PAID` order retry | ✅ Blocked, `400` |
| Initiate: `FAILED` order retry | ✅ Allowed, `200` |
| Initiate: `CANCELLED` order retry | ✅ Allowed, `200` |
| Notify: invalid signature | ✅ Rejected, `403` |
| Notify: wrong amount | ✅ Rejected, `400` |
| Notify: wrong merchant ID | ✅ Rejected, `400` |
| Notify: valid `COMPLETE` | ✅ Order marked `PAID`/`CONFIRMED`, `payment.paidAt` set |
| Notify: duplicate `COMPLETE` | ✅ Idempotent acknowledgement, no re-processing |
| Notify: `FAILED`/`CANCELLED` | ✅ Correctly marked, never `PAID`; `order.status` stays `PENDING` per documented decision |
| Stock during any initiate/notify call | ✅ Unchanged throughout (41 before and after all initiate/notify tests) |
| Secrets/raw payloads in test output | ✅ None printed |

### Frontend QA — `VITE_PAYFAST_ENABLED=false`

| Check | Result |
|---|---|
| PayFast option disabled, shows "Coming Soon" | ✅ |
| Bank transfer checkout | ✅ Order created, redirected to confirmation |
| Order confirmation page | ✅ Shows correct order number |
| Order tracking page | ✅ Shows correct order number |
| Enquiry forms (Contact/Schools/Wholesale/Distributor) | ✅ All four render a form |
| Console errors | ✅ 0 |

### Frontend QA — `VITE_PAYFAST_ENABLED=true`

| Check | Result |
|---|---|
| PayFast option selectable | ✅ |
| Checkout creates PayFast order | ✅ (`SG-2026-G2YL`) |
| Initiation works | ✅ `200`, fields returned |
| Frontend posts backend-generated fields, never its own signature | ✅ **Proven directly** — the exact form POST captured (and aborted before reaching PayFast) matched the backend's `/initiate` response byte-for-byte |
| Success page reads backend status | ✅ `PAID` → "Payment Confirmed" |
| Failed page reads backend status | ✅ `FAILED` → correct status + retry button |
| Cancelled page reads backend status | ✅ `CANCELLED` → correct status + retry button |
| Retry button calls backend initiation | ✅ Confirmed via network capture |
| Retry does not create a duplicate order | ✅ (retry re-initiates the same order; no new order possible via this endpoint) |
| No frontend page writes payment status | ✅ Every page is a read of `GET /api/orders/:orderNumber/tracking` |
| Pending payment storage expires safely | ✅ **Directly proven** — a 25-hour-old record was discarded (both from render and from Local Storage); a fresh record still worked |
| Console errors | ✅ 0 |

### Email and Delivery Regression QA

| Check | Result |
|---|---|
| `EMAIL_ENABLED` defaults `false` | ✅ |
| No real email sending occurs | ✅ No `send*Email` function is called from anywhere outside `services/email/` itself — not even a gated no-op call site exists yet |
| Delivery below R700 is R80 | ✅ Confirmed via live order (R459 subtotal → R80 fee) and code (`calculateDeliveryFee`) |
| Delivery at R700+ is free | ✅ Confirmed via code — `subtotal.gte(freeDeliveryThreshold)`, so exactly R700 qualifies |
| Tracking page doesn't claim live courier tracking | ✅ Explicit disclaimer present: *"Tracking is a Seasonedz Group backend status, not a live courier... Real courier tracking is coming later."* |
| Courier integration remains manual | ✅ `COURIER_INTEGRATION_ENABLED = false`, hardcoded |

## Security Review

| Item | Result |
|---|---|
| `PAYFAST_ENABLED` defaults `false` | ✅ (`backend/.env.example`) |
| `VITE_PAYFAST_ENABLED` defaults `false` | ✅ (`.env.example`) |
| `PAYFAST_VERIFY_SOURCE` defaults `false` | ✅ |
| `PAYFAST_VALIDATE_SERVER` defaults `false` | ✅ |
| `TRUST_PROXY` defaults `false` | ✅ |
| No PayFast secrets exposed to frontend | ✅ No `VITE_`-prefixed variable references merchant ID/key/passphrase anywhere in the codebase |
| No PayFast passphrase tracked | ✅ Confirmed via `git grep` across all tracked files |
| No `DATABASE_URL`/`DIRECT_URL` tracked | ✅ Confirmed via `git grep` |
| No `.env` file tracked | ✅ Only `.env.example` / `.env.*.example` are tracked (`.gitignore` explicitly ignores every other `.env*`) |
| `.env.example` files are placeholders only | ✅ |

No secrets, credentials, or connection strings were found anywhere in
tracked files during this review.

## PayFast Verification Status

| Check | Status |
|---|---|
| Signature verification | **Proven** — real PayFast infrastructure, both directions (Milestone 30); re-confirmed today |
| Amount verification | **Proven** — re-confirmed today (wrong amount correctly rejected) |
| Merchant ID verification | **Proven** — re-confirmed today (wrong merchant ID correctly rejected) |
| Server validation (`PAYFAST_VALIDATE_SERVER`) | **Proven — both rejection and acceptance paths** (Milestone 29 rejection, Milestone 30 acceptance, against real PayFast infrastructure both times) |
| Source verification (`PAYFAST_VERIFY_SOURCE`) | **Rejection path proven; acceptance path NOT proven.** A real PayFast ITN, through the tunnel used in Milestone 30, was correctly and safely rejected — the exact reason (tunnel IP forwarding vs. a genuine DNS/IP mismatch) was not isolated. |
| Idempotency | **Proven** — duplicate `COMPLETE` notifications safely acknowledged without re-processing; re-confirmed today |
| Payment status mapping | **Proven** — all three real statuses (`COMPLETE`/`FAILED`/`CANCELLED`) correctly mapped; re-confirmed today |
| Retry eligibility | **Proven** — `PENDING`/`FAILED`/`CANCELLED` can retry, `PAID`/`REFUNDED`/non-PayFast cannot, both at initiation and at the point a retried payment tries to actually complete; re-confirmed today |

**Important, stated plainly as required:** the source verification
*rejection* path is proven. The *acceptance* path — a genuine PayFast
source correctly passing `PAYFAST_VERIFY_SOURCE`— is not proven
through any tunnel tested so far. Real live payments are not ready
until this is resolved, or a formal, documented, deliberate decision is
made to go live without it.

## Retry While PENDING — Risk Review

Current behaviour (Milestone 31, re-confirmed this milestone):

- Retry is **allowed** for `PAYFAST` orders with `paymentStatus`
  `PENDING`, `FAILED`, or `CANCELLED`.
- Retry is **blocked** for `PAID`, `REFUNDED`, and any non-PayFast
  order.
- Retry while `PENDING` is useful: a customer who abandoned PayFast's
  page (closed the tab, lost connection) has no other way back into
  payment for that order without it.
- Retry while `PENDING` carries a real, if narrow, risk: if the
  customer's *original* attempt was not actually abandoned — just slow
  to confirm — and they retry and complete a *second* PayFast session
  for the same order, and PayFast then confirms **both**, this
  backend's own idempotency only protects against a duplicate *ITN for
  the same completed payment*. It does not detect or prevent two
  genuinely separate successful PayFast payments for one order. This
  would need to be caught and reconciled manually (there is no admin
  dashboard yet to surface it).

**Recommendation: Option A.** Keep retry while `PENDING` as it is for
now; do not enable `PAYFAST_ENABLED` in production until duplicate
payment handling is improved *or* this risk is explicitly, separately
accepted as a documented trade-off at the time that decision is made.

Reasoning: this risk cannot cause any real-world harm today —
`PAYFAST_ENABLED` is `false` in every deployed environment, so no real
PayFast payment can happen at all yet. The risk only becomes live at
the same moment someone decides to turn production PayFast on — which
is already blocked by the more fundamental, unresolved source-verification
gap above. Bundling both open items into that same future decision
point is more honest than fixing one in isolation now: Option B
(disabling `PENDING` retry entirely) would remove a genuinely useful
feature for a risk that's low-probability given ordinary customer
behaviour (a customer retries because they believe the first attempt
failed, not while knowingly leaving it in flight); Option C (a cooldown
period) adds real engineering complexity without eliminating the risk
outright, since a customer could still wait out the cooldown and have
both attempts eventually succeed. Revisit this choice specifically
when production PayFast enablement is next considered, not before.

## Email Status

`EMAIL_ENABLED` defaults `false`; every `send*Email` function is a safe
no-op when disabled (Milestone 24); nothing in the current codebase
calls any of them at all yet — order/payment/enquiry flows complete
with no email side effect whatsoever. No real email has ever been sent
by this codebase.

## Delivery Status

R80 standard delivery fee below R700 subtotal, free at R700 or above —
unchanged since Milestone 25, confirmed via both a live order and
direct code review this milestone. No courier API, credentials, or
live tracking exist anywhere; the tracking page explicitly and
honestly says so.

## Known Limitations

1. **Source verification's acceptance path is unproven** — the single
   biggest open item blocking real production PayFast. See "PayFast
   Verification Status" above.
2. **Retry while `PENDING` carries a narrow duplicate-payment risk** —
   not currently exploitable (PayFast is disabled everywhere real), but
   must be revisited before production enablement. See "Retry While
   PENDING" above.
3. **No admin dashboard** — unrecognised PayFast statuses, duplicate-payment
   reconciliation, and general order oversight all rely on direct
   database access; nothing here is in scope to change per this
   milestone's own constraints.
4. **No real email sending** — order/payment/enquiry confirmations are
   prepared but not wired up.
5. **No real courier integration** — delivery status is manually
   maintained.
6. **localtunnel proved unreliable** for hosted PayFast testing in this
   environment (Milestone 30); ngrok, run independently of this
   session's own process, did not have the same problem.

## Recommendation: Ready to Push?

**Yes.** The branch is clean, every commit is local-only so far, no
secrets or credentials are present anywhere in it, and pushing a branch
(as opposed to merging or deploying) has no effect on any live system.

## Recommendation: Ready to Merge?

**Yes**, following the same reasoning already used for Version 3's
merge: merging this code into `main` does not enable anything — every
new capability (source verification, server validation, retry) stays
behind its own flag, and `PAYFAST_ENABLED`/`VITE_PAYFAST_ENABLED` stay
`false` regardless of what's merged. All QA in this review passed, the
one genuinely open item (source verification's acceptance path) is a
pre-production concern, not a merge-safety concern, and this milestone
found and fixed two real, non-trivial bugs (the signature encoding gap
and the notify `COMPLETE`/`CANCELLED` guard) that should not sit
un-merged any longer than necessary.

## Recommendation: Ready to Deploy?

**Yes, on the same basis as merging** — deploying this code to Render
does not change any Render environment variable and does not enable
PayFast; it only ships the same flag-gated code that's already been
proven safe locally and (for Version 3's underlying code) in
production already. As with every previous deploy in this project,
this is the user's own action to take when ready, not something this
review performs.

## Recommendation: Ready for Production PayFast?

**No.** Two items must be resolved (or explicitly, separately accepted
as documented trade-offs) before `PAYFAST_ENABLED=true` anywhere real:

1. Source verification's acceptance path must be proven (or its
   absence formally accepted) — see "PayFast Verification Status."
2. The retry-while-`PENDING` duplicate-payment risk should be improved
   or formally accepted — see "Retry While PENDING."

Both are documentation/decision items or narrowly-scoped future code
changes, not blockers to anything else in this review.

## Clear Next Steps

1. If desired: push this branch (`version-4-payfast-hardening`) so it
   exists on the remote — no functional effect.
2. If desired: merge into `main` and deploy, following the same
   checklist pattern used for Version 3's merge — the code stays inert
   (`PAYFAST_ENABLED=false`) either way.
3. Before ever setting `PAYFAST_ENABLED=true` in Render: resolve or
   formally accept both open items above, as their own deliberate,
   separate decision — never as a side effect of a routine deploy.
4. If pursuing the source-verification gap further: test against a
   real, non-tunnel public endpoint (e.g. an actual staging deployment)
   to isolate whether the failure is tunnel-specific or a genuine
   mismatch between PayFast's real outbound IP and what its published
   hostnames resolve to.
