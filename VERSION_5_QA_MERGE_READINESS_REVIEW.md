# Version 5 — QA and Merge Readiness Review (Milestone 37)

A full QA pass across everything built in Version 5 so far
(Milestones 33-36), on branch `version-5-payfast-readiness`, before any
decision to push, merge, deploy, or enable production PayFast.

## Version 5 Summary

- **Milestone 33 — PayFast Production Readiness Investigation.**
  Investigated both blockers carried over from Version 4: source
  verification's unproven acceptance path, and the retry-while-`PENDING`
  duplicate-payment risk. Recommended (without implementing) using
  server validation as the real production gate with DNS source
  matching demoted to best-effort, and disabling retry while `PENDING`.
  See `VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md`.
- **Milestone 34 — Retry While PENDING Risk Fix.** Implemented: `POST
  /api/payments/payfast/initiate` now takes a `context: "checkout" |
  "retry"` field. Checkout's own first attempt may initiate a `PENDING`
  order; a customer retry may only initiate `FAILED`/`CANCELLED` — never
  `PENDING`. Missing/invalid `context` safely defaults to the stricter
  retry set. See `VERSION_5_RETRY_PENDING_RISK_FIX.md`.
- **Milestone 35 — PayFast Verification Strategy Update.** Replaced the
  hard on/off `PAYFAST_VERIFY_SOURCE` with
  `PAYFAST_SOURCE_VERIFICATION_MODE` (`off | monitor | enforce`).
  `monitor` runs the DNS source check and logs the outcome without ever
  blocking. `PAYFAST_VALIDATE_SERVER=true` is now documented as a
  required production precondition. See
  `VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`.
- **Milestone 36 — Render PayFast Sandbox QA Plan.** Produced the exact
  test plan and Render environment checklist for a real sandbox round
  trip against the deployed backend — not yet run. See
  `VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`.

## Backend QA Result

All local backend tests passed, run against `PAYFAST_ENABLED=true`
(and other flags set via inline environment overrides — `.env` itself
was never edited) with controlled test orders created directly via
Prisma, plus real checkout submissions through the actual API.

| Check | Result |
|---|---|
| Bank transfer checkout still works | ✅ `201 Created` |
| PayFast order creation blocked when `PAYFAST_ENABLED=false` | ✅ `400`, "PayFast payments are not available yet." |
| PayFast order creation works when `PAYFAST_ENABLED=true` | ✅ `201 Created` |
| Checkout-context initiation for `PENDING` | ✅ Allowed — real signed PayFast fields returned |
| Retry-context initiation for `PENDING` | ✅ Blocked — "still being verified" message |
| Retry allowed for `FAILED` | ✅ Allowed |
| Retry allowed for `CANCELLED` | ✅ Allowed |
| Retry blocked for `PAID` | ✅ Blocked — "already been processed" |
| Retry blocked for `BANK_TRANSFER` | ✅ Blocked — "not created for PayFast payment" |
| Missing `context` on `PENDING` | ✅ Blocked (safe default) |
| Invalid `context` (`"bogus"`) on `FAILED` | ✅ Allowed (safe default = retry-eligible set) |
| Invalid signature | ✅ Blocked (`403`) |
| Wrong amount | ✅ Blocked (`400`) |
| Wrong merchant ID | ✅ Blocked (`400`) |
| `PAYFAST_VALIDATE_SERVER=true`, crafted invalid data | ✅ Blocked (`400`) — real PayFast sandbox validate call correctly said not-`"VALID"` |
| `PAYFAST_SOURCE_VERIFICATION_MODE=monitor`, failing source check | ✅ **Not blocked** — marked `PAID`, failure only logged |
| `PAYFAST_SOURCE_VERIFICATION_MODE=enforce`, failing source check | ✅ Blocked (`403`) |
| Duplicate `COMPLETE` | ✅ Idempotent acknowledgement, no re-processing |
| Stock during initiate/notify | ✅ Unchanged — only the two real `POST /api/orders` calls in this QA decremented stock, exactly as expected |

## Frontend QA Result

**`VITE_PAYFAST_ENABLED=false`** (against a local backend with
`PAYFAST_ENABLED=true`, to prove the frontend gate independently of the
backend flag):

| Check | Result |
|---|---|
| PayFast option disabled | ✅ Radio `disabled`, label "PayFast (Coming Soon)" |
| Bank transfer checkout works | ✅ Real order created, correct confirmation page |
| Order confirmation works | ✅ Correct order number, delivery fee, payment method shown |
| Tracking works | ✅ Correct order number and status; explicitly disclaims live courier tracking |
| Enquiry forms work | ✅ Contact form submitted, real backend reference returned |
| Console errors | ✅ Zero |

**`VITE_PAYFAST_ENABLED=true`**:

| Check | Result |
|---|---|
| PayFast option selectable | ✅ Radio not disabled |
| Checkout sends `context: "checkout"` | ✅ Confirmed via network capture; real signed form built (intercepted before reaching PayFast — no hosted payment run) |
| Retry buttons send `context: "retry"` | ✅ Confirmed via network capture |
| `PENDING` pages show no active retry | ✅ No retry button on success/pending status page |
| `FAILED`/`CANCELLED` pages show retry | ✅ Retry button present with correct order number |
| `PAID` pages show confirmed | ✅ "Payment Confirmed" shown, no retry button |
| No frontend page writes payment status | ✅ Every status page only ever reads `GET /api/orders/:orderNumber/tracking` |
| Console errors | ✅ Zero |

One local-environment artifact encountered during testing, unrelated to
the app: this session's Supabase connection pool became briefly
congested from many short-lived test scripts, occasionally slowing (not
breaking) real order-creation calls to several seconds. Confirmed by
re-testing with longer waits each time — never a functional defect.

## Security Audit

| Check | Result |
|---|---|
| `PAYFAST_ENABLED` defaults `false` | ✅ |
| `VITE_PAYFAST_ENABLED` is `"false"` in GitHub Actions | ✅ |
| `PAYFAST_VALIDATE_SERVER` defaults `false` | ✅ |
| `PAYFAST_SOURCE_VERIFICATION_MODE` defaults safe | ✅ Defaults to `"off"` (via the legacy fallback, since `PAYFAST_VERIFY_SOURCE` also defaults `false`) |
| `PAYFAST_VERIFY_SOURCE` legacy fallback does not accidentally enable enforcement | ✅ `false`/unset → `"off"`; only an explicit `true` → `"enforce"` |
| `TRUST_PROXY` defaults `false` | ✅ |
| `EMAIL_ENABLED` defaults `false` | ✅ |
| No PayFast credentials tracked | ✅ `PAYFAST_MERCHANT_ID`/`PAYFAST_MERCHANT_KEY` empty in `.env.example` |
| No passphrase tracked | ✅ `PAYFAST_PASSPHRASE` empty in `.env.example` |
| No `DATABASE_URL`/`DIRECT_URL` tracked | ✅ Empty in `.env.example` |
| No `.env` files tracked | ✅ Only `.env.example`, `.env.production.example`, `backend/.env.example` |
| `.env.example` files contain placeholders only | ✅ |

## Retry While PENDING Fix Result

Confirmed structurally intact and re-verified directly this milestone:
`initiationEligibleStatuses()` only allows `PENDING` under `context:
"checkout"`; every other context (including missing/invalid) only
allows `FAILED`/`CANCELLED`. Both the direct backend test matrix above
and the frontend's retry-button visibility confirm this end-to-end.

## Verification Strategy Result

Confirmed structurally intact and re-verified directly this milestone:
`PAYFAST_SOURCE_VERIFICATION_MODE` correctly gates `off`/`monitor`/
`enforce` behaviour, the legacy boolean fallback maps safely, and
`monitor` mode's core safety property (log, never block) was directly
re-proven.

## Render Sandbox QA Readiness

The plan and Render environment checklist from Milestone 36
(`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`) are ready to execute
whenever the user chooses to. **The actual round trip has not been
run** — this milestone did not run it, per instructions, and running it
requires the user to manually apply the Render environment checklist
first.

## Known Limitations

- **Production PayFast still disabled** — `PAYFAST_ENABLED` and
  `VITE_PAYFAST_ENABLED` remain `false` in every deployed environment.
- **The Render sandbox payment test has not been run yet** — Milestone
  36 only produced the plan; the real round trip against the deployed
  backend is still pending.
- **Production PayFast should not be enabled until the Render sandbox
  test passes and rollback is completed** — a single successful test is
  necessary but not by itself sufficient; the rollback checklist must
  also be completed immediately afterward, restoring Render to its safe
  default state.
- **A payment-attempt model is still a future improvement** — genuine
  duplicate-payment *detection* (comparing PayFast's `pf_payment_id`
  across attempts) is not yet built; today's fix removes the specific
  race condition but doesn't add detection for a hypothetical double
  charge from some other cause.

## Recommendations

- **Ready to push? Yes.** All QA passed, working tree is clean, builds
  are clean, and this branch contains only documentation and backend
  logic changes already thoroughly tested locally. Pushing publishes
  the branch for review — it does not deploy or affect production.
- **Ready to merge? Yes, code-wise** — the branch is internally
  consistent, tested, and backward-compatible (every existing
  environment variable still behaves exactly as before unless someone
  explicitly opts into the new ones). This is a recommendation on code
  readiness only; the decision of *when* to merge remains the user's.
- **Ready to deploy? Yes, code-wise, with no functional change to
  production** — every new capability stays behind flags that default
  to their current, already-deployed-safe values. Deploying this branch
  to Render would not change any live behavior on its own.
- **Ready to enable production PayFast? No.** The Render sandbox
  round trip (Milestone 36's plan) has not been run. Production PayFast
  should not be enabled until that test passes and the rollback
  checklist is completed — see "Known Limitations" above.
