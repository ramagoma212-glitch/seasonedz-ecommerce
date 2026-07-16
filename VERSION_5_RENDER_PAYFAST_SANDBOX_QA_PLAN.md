# Version 5 — Render PayFast Sandbox QA Plan (Milestone 36)

A planning-only milestone. **No PayFast sandbox payment was run as
part of this milestone** — this document is the exact test plan and
checklist for a future, deliberately-scheduled round trip against the
real deployed Render backend, to be carried out only once the user has
manually confirmed the Render sandbox environment settings below.

## Purpose

Prove, against the real Render deployment (not local development, not
a tunnel):

1. Render's backend can receive a PayFast ITN directly.
2. `PAYFAST_VALIDATE_SERVER=true` works against the deployed backend.
3. `PAYFAST_SOURCE_VERIFICATION_MODE=monitor` records the source
   verification result without blocking.
4. A payment becomes `PAID` only after a verified backend ITN — never
   from a browser redirect alone.
5. The live GitHub Pages frontend keeps PayFast disabled throughout —
   only a deliberately-run local test frontend is ever used to select
   PayFast.

## Current Code Readiness (Confirmed)

Reviewed directly from code on `version-5-payfast-readiness`:

| Check | Status |
|---|---|
| `VITE_PAYFAST_ENABLED` explicit in GitHub Actions | `"false"` — `.github/workflows/deploy.yml:48` |
| `PAYFAST_ENABLED` default | `false` — `backend/src/config/env.ts:54` |
| `PAYFAST_VALIDATE_SERVER` default | `false` — `backend/src/config/env.ts:105` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` default | `"off"` (via the legacy-boolean fallback, since `PAYFAST_VERIFY_SOURCE` also defaults `false`) — `backend/src/config/env.ts:153` |
| Production PayFast credentials tracked in git | None — only `.env.example`, `.env.production.example`, `backend/.env.example`, all with empty credential fields |
| PayFast retry while `PENDING` | Blocked — `initiationEligibleStatuses()` only allows `PENDING` under `context: "checkout"`; `context: "retry"` (or missing) only allows `FAILED`/`CANCELLED` — `backend/src/services/payfast.service.ts:105-112` |

No code changes were needed to confirm any of this — see "Whether Code
Changes Were Needed" below.

## Production Safety Rule

**The live GitHub Pages frontend must keep `VITE_PAYFAST_ENABLED=false`
throughout this entire plan, before, during, and after the sandbox test
window.** Any sandbox test against Render uses **sandbox PayFast
credentials only** — no live/production PayFast credentials are ever
used at any point in this plan.

## Render Sandbox QA Checklist (Manual — User Only)

**This checklist is for the user to check or temporarily set directly
in the Render dashboard.** No values are set here, no secrets are
requested or printed in this document, and none of this is done
automatically — the user reviews and applies these in Render's own UI
at the time they choose to run the test.

Set (or confirm already set) in Render, **only for the sandbox QA
window**:

| Variable | Value for this test |
|---|---|
| `PAYFAST_ENABLED` | `true` |
| `PAYFAST_MODE` | `sandbox` |
| `PAYFAST_VALIDATE_SERVER` | `true` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` | `monitor` |
| `TRUST_PROXY` | `true` |
| `BACKEND_PUBLIC_URL` | `https://seasonedz-ecommerce.onrender.com` |
| `PAYFAST_NOTIFY_URL` | `https://seasonedz-ecommerce.onrender.com/api/payments/payfast/notify` |
| `PAYFAST_RETURN_URL` | Local frontend success URL — e.g. `http://localhost:5173/#/payment-success` |
| `PAYFAST_CANCEL_URL` | Local frontend cancelled URL — e.g. `http://localhost:5173/#/payment-cancelled` |
| `PAYFAST_MERCHANT_ID` | Sandbox merchant ID only |
| `PAYFAST_MERCHANT_KEY` | Sandbox merchant key only |
| `PAYFAST_PASSPHRASE` | Sandbox passphrase only, or leave empty if the sandbox dashboard account has no passphrase set |

**Do not include real values in this document, in chat, or anywhere
tracked by git.** This assistant will not ask for or print any secret
value at any point in this plan or its execution — the user applies
these directly in Render's dashboard.

`VITE_PAYFAST_ENABLED` on Render/GitHub Pages is **not** part of this
checklist and must **not** be changed — the live frontend build stays
exactly as it is (`"false"`, baked in at GitHub Actions build time).

## Recommended Testing Approach

**Use a local frontend pointing at the live Render backend, not the
live GitHub Pages frontend.**

```
VITE_API_BASE_URL=https://seasonedz-ecommerce.onrender.com/api
VITE_PAYFAST_ENABLED=true
```

This is the safest approach available:

- The public, live GitHub Pages frontend is never touched, never
  redeployed, and never has PayFast enabled at any point — it keeps
  reading its own already-built `VITE_PAYFAST_ENABLED=false` bundle
  throughout, exactly as GitHub Actions already sets it.
- Only a deliberately-run local dev server (`npm run dev` with the two
  environment values above, passed as inline overrides — the same
  pattern already used throughout Milestones 34-35 — never persisted to
  a tracked file) can ever show or select PayFast, and only on the
  machine running that local server.
- A real customer browsing the live site has no path to a PayFast
  option at any point during this test — confirmed by the fact that
  `VITE_PAYFAST_ENABLED` is baked into the frontend bundle at build
  time (Vite), not read at runtime, so nothing about testing against
  Render's backend can retroactively change what the already-deployed
  GitHub Pages bundle shows.
- The Render *backend* does temporarily have `PAYFAST_ENABLED=true`
  during the test window — this is unavoidable, since that's exactly
  what's being tested — but the backend's own retry/eligibility/
  verification logic (proven in Milestones 33-35) still applies in
  full; nothing about this test weakens any of it.

## Test Steps

**A.** User updates Render's environment variables with the sandbox
values from the checklist above, directly in the Render dashboard.

**B.** Render redeploys automatically from whatever branch it's
currently configured to track (`main`, per the existing Version 4
deployment) — this milestone doesn't require merging
`version-5-payfast-readiness` first, since none of Milestones 34/35's
code changes are required for this test to run: the checklist above
only sets environment variables, and the *existing* deployed backend
(main, unchanged) already has server validation and source verification
implemented since Version 4 Milestone 29. If the user wants this test
to also exercise Milestone 34's retry-eligibility fix and Milestone
35's `monitor` mode specifically, `version-5-payfast-readiness` must be
merged and deployed to `main` first, as a separate, later, explicit
decision — not part of this milestone.

**C.** Start a local frontend dev server with the two environment
values from "Recommended Testing Approach" above, as inline overrides
(never written to a tracked `.env` file).

**D.** Confirm the local frontend's checkout page now shows PayFast as
a selectable option (not "Coming Soon", not disabled).

**E.** Create a small test cart — one low-value product, one unit, to
keep the sandbox transaction amount small and the stock/cleanup
footprint minimal.

**F.** Check out with PayFast selected as the payment method.

**G.** The browser is redirected (a real POST from the hidden form
`submitPayfastForm` builds) to PayFast's real sandbox `processUrl`.

**H.** Complete the sandbox payment on PayFast's own hosted page, using
PayFast's sandbox test card/EFT details (never anything real).

**I.** PayFast sends a real server-to-server ITN to
`PAYFAST_NOTIFY_URL` — Render's own public URL, reachable directly,
with no tunnel involved.

**J.** Render's backend independently verifies the ITN: signature,
amount, merchant ID, and (since `PAYFAST_VALIDATE_SERVER=true`) a real
call to PayFast's own server-validation endpoint.

**K.** Source verification runs in `monitor` mode: the DNS-based source
check executes and its pass/fail outcome is logged
(`[PayFast] order=... check=sourceVerification mode=monitor result=...
reason=...` — see `VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md`),
but a failure here does **not** block the payment — this is the first
real opportunity to observe this check's actual behaviour against
genuine PayFast traffic on Render's real proxy topology.

**L.** The order becomes `PAID`/`CONFIRMED` only once that verified ITN
is processed — never from the browser's own redirect back to
`return_url`.

**M.** The local frontend's payment-success page re-fetches the order's
real status from the backend (`GET /api/orders/:orderNumber/tracking`)
and displays it — it never marks anything as paid itself.

**N.** Clean up: delete the test order(s) created, and restore stock by
however many units the test checkout decremented (the same
Prisma-based cleanup pattern used throughout Milestones 30-35),
confirmed by checking stock before and after. `SG-2026-28SM` must never
be touched.

**O.** Immediately after testing (whether it succeeded or failed), the
user disables the Render sandbox PayFast environment variables — see
the rollback checklist below. This step is not optional and should
happen the same session as the test, not "later."

## Rollback Checklist

Immediately after the test window, the user must set in Render:

| Variable | Rollback value |
|---|---|
| `PAYFAST_ENABLED` | `false`, or remove it |
| `PAYFAST_VALIDATE_SERVER` | `false`, or remove it |
| `PAYFAST_SOURCE_VERIFICATION_MODE` | `off`, or remove it |
| `TRUST_PROXY` | `false`, or remove it |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` / `PAYFAST_NOTIFY_URL` / `PAYFAST_RETURN_URL` / `PAYFAST_CANCEL_URL` / `BACKEND_PUBLIC_URL` | Remove if not otherwise needed |

**Confirm after rollback:**

- The live GitHub Pages frontend still shows PayFast as disabled/
  "Coming Soon" — unaffected by any of this, since it was never
  touched.
- `POST /api/payments/payfast/initiate` against the live Render backend
  returns the clean, safe `503`:
  `{ "success": false, "message": "PayFast payments are not enabled." }`
  — not "Route not found."
- All test orders created during the sandbox QA window are deleted.
- Stock is restored to its pre-test value.

## Risk Review

- **While `PAYFAST_ENABLED=true` on Render, the backend's PayFast
  routes are genuinely active** for the whole test window — this is
  unavoidable, since it's exactly what's being tested.
- **The live frontend stays disabled, but a raw API call directly
  against `POST /api/payments/payfast/initiate` could theoretically
  attempt to initiate a PayFast payment during the window** — the
  frontend gate is a UX convenience, not a security boundary; the
  actual protection during this window is that only sandbox credentials
  are in use (so nothing can ever be a real charge) and that the window
  is short and deliberately supervised.
- **Use a short, controlled test window** — set the checklist values,
  run the test steps, roll back immediately; don't leave Render in this
  state indefinitely.
- **Use sandbox credentials only, at every step** — never live/
  production PayFast credentials, confirmed in the checklist above.
- **Disable immediately after testing** — per the rollback checklist;
  don't defer this.
- **Do not enable live credentials** at any point in this plan or its
  execution.
- **Do not treat a source-verification `monitor`-mode pass or fail as
  final production approval by itself** — review the actual logged
  outcome (and ideally repeat the test, or observe more real traffic
  over time) before ever considering
  `PAYFAST_SOURCE_VERIFICATION_MODE=enforce` on Render. A single
  `monitor`-mode observation is evidence, not proof.

## Whether Code Changes Were Needed

**No.** This milestone's plan requires no code changes — everything it
depends on (server validation, source verification's `monitor` mode,
retry-while-`PENDING` blocking) already exists in the codebase from
Milestones 29 and 34-35. Per "Test Steps" step B above, the *existing*
deployed `main` branch (Version 4) already has server validation and
source verification (as a hard boolean, not yet the new `monitor` mode)
— testing the new `monitor` mode and the retry fix specifically would
require merging `version-5-payfast-readiness` to `main` first, which is
a separate, later, explicit decision this milestone does not make or
recommend making yet. No such merge, deploy, or push happened as part
of this milestone.

## Milestone 36 Planning Summary

This milestone produced the plan and checklist only. The actual
Render sandbox round trip has **not** been run, and will not be run
until the user has manually reviewed and applied the Render environment
checklist above and explicitly confirms readiness to proceed.
