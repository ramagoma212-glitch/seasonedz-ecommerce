# Version 4 — Hosted PayFast Sandbox Round Trip Test (Milestone 30)

## Date of Test

2026-07-15 through 2026-07-16 (session spanned midnight). Branch:
`version-4-payfast-hardening`.

## Testing Environment

- Frontend: local Vite dev server, `http://localhost:5173`.
- Backend: local Express/tsx dev server, `http://localhost:5000`.
- Database: shared Supabase PostgreSQL (same one local dev and Render
  production both use — test orders cleaned up afterward per usual
  discipline).
- Browser automation: Playwright (installed ad hoc into an isolated
  scratch directory, never added as a project dependency), used to
  drive a real browser through the full customer checkout flow,
  including submitting a real form POST to PayFast's actual sandbox
  and clicking PayFast's own "Complete Payment" / "Cancel transaction"
  buttons.

## Tunnel Approach

Two tunnel tools were used across this milestone:

1. **localtunnel (`loca.lt`)**, run via `npx localtunnel --port 5000`.
   Proved highly unreliable in this environment: sessions dropped
   unprompted after several minutes even while idle, and — separately
   — appeared to terminate whenever a stray local backend process was
   force-killed (`Stop-Process -Force`), consistent with all
   background processes in this tool session sharing a single Windows
   job object. Six separate localtunnel sessions were started and lost
   across this milestone; none survived long enough to see a real ITN
   arrive.
2. **ngrok**, started by the user directly in their own terminal
   (`https://glorious-dilation-movable.ngrok-free.dev`), entirely
   outside this session's own process tree. This was stable for the
   remainder of testing and was not affected by any local backend
   restart. **Recommendation:** prefer ngrok (or another tunnel started
   in a separate, user-controlled terminal) over a tool-spawned
   localtunnel session for any future hosted sandbox testing in this
   environment.

## Env Flags Used

```
PAYFAST_ENABLED=true
PAYFAST_MODE=sandbox
PAYFAST_VERIFY_SOURCE=true   (tested, then set to false — see below)
PAYFAST_VALIDATE_SERVER=true
TRUST_PROXY=true
BACKEND_PUBLIC_URL=<tunnel URL>
PAYFAST_NOTIFY_URL=<tunnel URL>/api/payments/payfast/notify
PAYFAST_RETURN_URL="http://localhost:5173/#/payment-success"
PAYFAST_CANCEL_URL="http://localhost:5173/#/payment-cancelled"
VITE_API_BASE_URL=http://localhost:5000/api
VITE_PAYFAST_ENABLED=true
```

All reverted to safe local defaults after testing (see "Local Env
Rollback" below).

## A Real Bug Was Found and Fixed

The first several round-trip attempts failed at PayFast's own
`/eng/process` page with a genuine `400 Bad Request — Generated
signature does not match submitted signature` — a real rejection from
PayFast's real sandbox infrastructure, not a mock. Extensive
elimination (independent signature recomputation, passphrase
variations tried both empty and set to a real value on both the
backend and the PayFast merchant dashboard, encode/decode round-trip
testing against Node's actual `querystring` parser, merchant-ID
verification) traced this to **two real, distinct bugs in
`backend/src/utils/payfastSignature.ts`**, both invisible to Milestone
22's original self-consistency testing since that only ever checked
this code against itself:

1. **PHP `urlencode()` vs. JavaScript `encodeURIComponent()`.**
   `encodeURIComponent` leaves six characters unescaped that PHP's
   `urlencode()` — what PayFast's signature spec is actually built on —
   escapes: `! ' ( ) * ~`. The order's own `item_description` field
   (`"1 item(s) — Seasonedz Group order …"`) always contains literal
   parentheses, so every real signature check involving it failed
   regardless of credentials. Fixed by escaping all six characters to
   match PHP's behaviour exactly.
2. **Empty-valued ITN fields must not be dropped when verifying.**
   PayFast's real ITN always posts a fixed schema, including unused
   optional fields (`custom_str1-5`, `custom_int1-5`) as empty-value
   keys (`custom_str1=`). PayFast's own signature *includes* these
   empty-valued keys. `generatePayfastSignature`'s existing behaviour
   (correct for the *initiate* direction, which simply never adds an
   unused field to the object at all) was to drop any empty-string
   value — silently producing a different hash for every real ITN,
   regardless of merchant credentials. Fixed by giving
   `generatePayfastSignature` a `skipEmptyValues` option (default
   `true`, preserving initiate's existing behaviour) and having
   `verifyPayfastSignature` pass `false`.

Both fixes are in `backend/src/utils/payfastSignature.ts`, with the
reasoning recorded in code comments. Confirmed fixed by independent
recomputation matching PayFast's real submitted signature exactly, and
by full round trips subsequently reaching PayFast's real payment page
(not the error page) and, later, genuine ITN acceptance.

## Whether the Hosted PayFast Sandbox Page Was Reached

**Yes**, consistently, both before and after the signature fix (before
the fix: reached PayFast's real *error* page; after: reached PayFast's
real *payment* page, `https://sandbox.payfast.co.za/eng/process/payment/<uuid>`,
showing the correct order number and amount and a live sandbox wallet
balance).

## Whether ITN Was Received

**Yes**, via ngrok. Never confirmed via localtunnel (every localtunnel
session died before or during the window a real ITN would have
arrived — see "Known Limitations").

## Whether Server Validation Passed

**Yes.** With `PAYFAST_VALIDATE_SERVER=true` throughout, the final
successful round trip's ITN was POSTed back to PayFast's real sandbox
validate endpoint and returned `"VALID"`, and the order was correctly
marked `PAID`. This is a genuine, proven acceptance path — not just
the rejection path Milestone 29 had already proven.

## Whether Source Verification Passed

**No — and this is the one requirement of this milestone left
unresolved.** With `PAYFAST_VERIFY_SOURCE=true`, the real PayFast ITN
(arriving via ngrok, with `TRUST_PROXY=true`) was correctly and safely
**rejected** with `403 PayFast source verification failed.` — the code
did exactly what it's supposed to do when it can't confirm a source
(reject, don't guess, don't fake acceptance). Per this milestone's own
pre-approved fallback (task 9), a second, clearly-labelled test was run
with `PAYFAST_VERIFY_SOURCE=false` and `PAYFAST_VALIDATE_SERVER=true`
kept on — that combination is what produced the successful `PAID`
result above.

The exact underlying reason source verification fails through this
tunnel was not conclusively root-caused (doing so would need
inspecting the actual source IP ngrok forwards, which was out of scope
to log). The two candidate explanations are: (a) ngrok's forwarding
doesn't preserve PayFast's real caller IP in a way this single-hop
`TRUST_PROXY` setting resolves correctly, or (b) PayFast's real
outbound ITN-sending IP doesn't match what `www.payfast.co.za` /
`w1w.payfast.co.za` / `w2w.payfast.co.za` currently resolve to via DNS
at verification time. Both remain equally plausible from this test
alone.

**To restate this milestone's own required framing plainly:**

- Hosted sandbox payment round trip works.
- PayFast server validation works.
- Source verification acceptance remains unproven through this tunnel.
- Production payments are still not ready.

## Payment Status Result

Representative successful order **`SG-2026-4EV6`** (since deleted as
part of cleanup — see below):

```
status: CONFIRMED
paymentStatus: PAID
payment.status: PAID
payment.provider: PAYFAST
payment.paidAt: 2026-07-15T23:47:12.996Z
payment.failureReason: null
```

Set only by the backend's own verified ITN processing — never by the
frontend, never by the return-URL redirect alone.

## Frontend Success Page Result

Confirmed correct at every stage:

- Immediately after PayFast's redirect (before the ITN had arrived):
  showed *"Payment is being verified… We're still waiting for PayFast
  to confirm this payment"* with **Payment Status: Pending** — reading
  the backend's real (not-yet-updated) state, not assuming success from
  the redirect.
- Revisited after the backend had processed the ITN: showed *"Payment
  Confirmed… Your order has been received"* with **Order Status:
  Confirmed** / **Payment Status: Paid**.
- At no point did the frontend itself set or claim a paid state; every
  render was a direct read of `GET /api/orders/:orderNumber/tracking`.

**Payment-cancelled path also tested** (not just "if practical" —
fully exercised): a customer clicking PayFast's own "Cancel
transaction" (confirmed via its own "Are you sure?" dialog) correctly
redirected to `#/payment-cancelled`, which showed *"Payment was not
completed"* with **Payment Status: Pending** (not "Cancelled").
This is correct, not a bug: PayFast does not send a server-to-server
ITN for a payment the customer cancelled before completing, so the
order's real backend `paymentStatus` legitimately has nothing to
transition to and correctly stays `PENDING` — the page accurately
reflects that, rather than fabricating a `CANCELLED` state the backend
never confirmed.

## Database Cleanup Result

18 test orders created during this milestone's testing were deleted
(`SG-2026-MG25`, `LEP4`, `B2UC`, `BTQ2`, `DBDV`, `T75T`, `EJLK`, `L2SS`,
`B78R`, `6FNA`, `VLSC`, `QRFL`, `YHPU`, `U4F4`, `L8RM`, `4EV6`, `NDFF`,
`ATAH`), each of which had decremented stock by 1 unit of the same
product at creation time. Stock was restored by exactly +18 units
(24 → 42) to match. `SG-2026-28SM` was confirmed to still exist,
untouched, both before and after cleanup.

## Local Env Rollback Result

`backend/.env` restored to safe local defaults:

```
PAYFAST_ENABLED=false
PAYFAST_VERIFY_SOURCE=false
PAYFAST_VALIDATE_SERVER=false
TRUST_PROXY=false
BACKEND_PUBLIC_URL=http://localhost:5000
PAYFAST_NOTIFY_URL=http://localhost:5000/api/payments/payfast/notify
```

Root `.env`'s `VITE_PAYFAST_ENABLED` set back to `false`. Local backend
and frontend dev servers stopped. The user's own ngrok terminal session
was left as-is — it runs outside this session's process tree, so
stopping it (if desired) is the user's own call, not something this
session attempted or should attempt. Render was never touched.

## Known Limitations

1. **Source verification acceptance remains unproven** through any
   tunnel tested so far (see above) — this is the primary open item
   carried into whatever comes next.
2. **localtunnel is not viable for this kind of testing in this
   environment** — six sessions were lost to a mix of external
   flakiness and an apparent shared-process-group interaction with
   local backend restarts. ngrok, run independently by the user, had
   neither problem.
3. **The signature bugs fixed this milestone were real and would have
   blocked every future real ITN**, sandbox or production, until
   caught — a strong argument that any future signature-adjacent code
   change should be re-verified against a real hosted round trip (not
   just crafted self-consistency tests) before being trusted.
4. This test used a sandbox merchant account and a temporary tunnel
   only. `PAYFAST_ENABLED` remains `false` on Render; enabling it in
   production remains a separate, deliberate decision this milestone
   does not make.

## Recommendation for Next Milestone

1. Root-cause the source-verification gap specifically — ideally by
   testing against a real, non-tunnel public endpoint (e.g. an actual
   staging deployment) to isolate whether the failure is tunnel-specific
   (ngrok not preserving the real caller IP as `TRUST_PROXY` expects)
   or a genuine mismatch between PayFast's real outbound IP and what
   its published hostnames currently resolve to.
2. Until source verification is either proven or a documented,
   deliberate decision is made to launch without it, keep treating it
   as a genuine gap in the production-readiness story — signature
   verification and server validation are now both proven; source
   verification is not.
3. Keep `PAYFAST_ENABLED=false` on Render until that decision is made
   explicitly, separately from this milestone.
