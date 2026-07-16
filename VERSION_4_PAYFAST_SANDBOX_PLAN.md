# Version 4 — PayFast Sandbox Round Trip Plan (Milestone 27)

**Planning only.** No code was changed to produce this document — it
reviews what already exists (Version 3) and plans what a real, hosted
PayFast sandbox round trip needs. No PayFast code changed, no Render
settings changed, nothing deployed, nothing enabled.

## Current State (Reviewed from Version 3)

Confirmed by re-reading the actual code, not just prior notes:

- **`backend/src/config/payfast.ts`** — exposes `payfastConfig`
  (`enabled`, `mode`, `merchantId`, `merchantKey`, `passphrase`,
  `processUrl`, `returnUrl`, `cancelUrl`, `notifyUrl`) to backend code
  only. `processUrl` resolves to PayFast's sandbox or production
  endpoint based on `PAYFAST_MODE`.
- **`POST /api/payments/payfast/initiate`** — prepares PayFast form
  fields + signature from the backend's own `Order` record. Requires
  `PAYFAST_ENABLED=true`; returns `503` otherwise.
- **`POST /api/payments/payfast/notify`** — the only code path allowed
  to set `paymentStatus: PAID`. Verifies signature (`timingSafeEqual`),
  merchant ID, and amount (against `Order.total`) before touching
  anything. Idempotent. No rate limiter (deliberately — a webhook may
  retry).
- **`VITE_PAYFAST_ENABLED`** (frontend) — UI-only gate on whether the
  PayFast radio is selectable. Independent of the backend's own gate.
- **`payment-success` / `payment-cancelled` / `payment-failed`**
  (`src/pages/`) — all read-only, all call
  `GET /api/orders/:orderNumber/tracking` and display whatever
  `paymentStatus` the backend actually has on record. None can write
  anything.
- **Render production safety (documented in
  `VERSION_3_LIVE_STABILITY_REVIEW.md` and `VERSION_3_PRE_MERGE_SAFETY_CHECK.md`):**
  `PAYFAST_ENABLED` confirmed `false`/unset on live Render;
  `VITE_PAYFAST_ENABLED` explicitly `false` in
  `.github/workflows/deploy.yml`. Confirmed live: the route exists
  (`503`, not `404`) but is inert.
- **Known source IP verification gap** (`backend/PAYFAST_SETUP.md`):
  documented as not implemented, deliberately, since it can't be
  meaningfully exercised locally. Re-confirmed while reviewing for this
  milestone: **no `trust proxy` setting exists anywhere in
  `backend/src/app.ts`, and no code anywhere reads `req.ip` or an
  `X-Forwarded-For` header.** This is a genuinely blank slate, not a
  partially-built feature.
- **Everything so far has been tested via direct API calls
  (`curl`/crafted requests) or by inspecting the generated redirect
  form — no one has completed a real payment on PayFast's own hosted
  sandbox page and had PayFast's real infrastructure call back in.**
  That gap is exactly what this milestone plans to close next.

## Sandbox Round Trip Goal

A real browser submits the PayFast form → customer completes or
cancels on PayFast's actual hosted sandbox page → **PayFast's own
servers** send a real ITN to our `notify_url` → backend verifies and
updates the order → the frontend success/cancelled/failed page reads
that real backend status. Every step already has code; what's missing
is a way for step 3 (PayFast's real infrastructure reaching our
`notify_url`) to actually happen.

## Required External Setup

- **A PayFast sandbox merchant account** — already have one: sandbox
  merchant ID, merchant key, and passphrase are already present in the
  local, git-ignored `backend/.env` (moved there during the Milestone
  24 environment hygiene pass). No new sandbox account signup is
  needed to run the round trip described here. (Values not printed —
  see `backend/.env` directly if you need to confirm them yourself.)
- **A way for PayFast's real servers to reach our `notify_url` over
  the public internet** — see "Why `localhost` Cannot Work" below.
- Nothing else external is required — no new library, no new provider.

## Environment Variables Needed

All already exist (`backend/.env.example`) — none are new for the
*planning* stage. For the actual round-trip *test* (Milestone 28+),
two of them need temporary, test-specific values:

| Variable | For this round trip |
|---|---|
| `PAYFAST_ENABLED` | `true` — **only ever in a local `.env`, never on Render** |
| `PAYFAST_MODE` | `sandbox` |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` | Already set locally (sandbox account) |
| `BACKEND_PUBLIC_URL` | Must become the tunnel's public URL during the test (see below) — not `http://localhost:5000` |
| `PAYFAST_NOTIFY_URL` | Built from `BACKEND_PUBLIC_URL` — must be the public tunnel URL + `/api/payments/payfast/notify` |
| `PAYFAST_RETURN_URL` / `PAYFAST_CANCEL_URL` | Can stay pointing at `http://localhost:5173/#/payment-success` / `#/payment-cancelled` — see below, these are different from `notify_url` |
| `VITE_PAYFAST_ENABLED` | `true` — **only in local root `.env`, never in `.github/workflows/deploy.yml`** |

No brand-new environment variable is required for the round trip
itself. One new variable is *proposed* for source IP verification —
see that section below.

## Why a `localhost` Notify URL Will Not Work

`notify_url` is called **server-to-server, directly by PayFast's own
infrastructure** — not by the customer's browser. PayFast's servers,
running somewhere on the public internet, have no route to
`http://localhost:5000` or `127.0.0.1` on a developer's own machine —
that address only means "this machine" to the machine itself; it is
meaningless and unreachable from any other computer on the internet.
This isn't a configuration mistake to fix, it's a fundamental property
of what "localhost" means. **`notify_url` must be a real, public,
internet-routable URL for a genuine ITN to ever arrive.**

## Return URL and Cancel URL Requirements

These are different from `notify_url` in one important way: they are
**browser redirects**, not server-to-server calls. PayFast tells the
*customer's own browser* to navigate there after they finish on
PayFast's site. If the person running this test is doing so from their
own machine, in their own browser, against their own local dev
frontend, then `http://localhost:5173/#/payment-success` genuinely
works as a `return_url` — the browser doing the redirecting is the
same machine the dev server is running on. **Only `notify_url` strictly
needs to be public; `return_url`/`cancel_url` can stay local for a
manual, single-tester round trip.**

## Render Backend vs. a Temporary Tunnel (e.g. ngrok)

**Recommendation: use a local backend + a temporary tunnel (e.g.
ngrok), not the live Render backend.**

| | Local + tunnel | Live Render backend |
|---|---|---|
| Requires touching Render's dashboard | No | Yes — `PAYFAST_ENABLED=true` would have to be set there |
| Risk to real customers | None — `PAYFAST_ENABLED` only changes on the tester's own machine; the live site's backend and frontend are completely unaffected | Real — if `PAYFAST_ENABLED=true` were ever set on Render, the backend would start accepting real `PAYFAST` orders from real site visitors too, regardless of the frontend flag (a determined visitor doesn't need the UI to POST directly to the API) |
| Violates "do not change Render production env variables" | No | Yes, directly |
| Setup effort | One tunnel command, temporary, torn down after | None (already deployed) |

**One risk that exists either way, not unique to choosing Render:**
local dev and the live Render backend read the **same** Supabase
database (`DATABASE_URL`/`DIRECT_URL` point at one shared production
database, not separate dev/prod databases). This means **even
local+tunnel testing writes real rows into the same database real
customers' orders live in.** The existing test-data discipline used
throughout this project — clean up by precise order number/ID, restore
stock, never delete unrecognised orders — remains required for the
sandbox round trip too, regardless of which backend option is chosen.

## Risks of Using the Production Render Backend for Sandbox Testing

- Would require setting `PAYFAST_ENABLED=true` directly on Render,
  explicitly forbidden for this milestone and risky beyond it: it
  would make the *live* backend accept real `PAYFAST` orders from any
  real visitor, not just the tester, independent of what the frontend
  shows.
- Mixes test transactions into the same live service handling real
  customer traffic, logs, and rate limits.
- Makes "only ever local" much harder to guarantee — a mistake here is
  a production incident, not a local cleanup.

## Keeping `PAYFAST_ENABLED` False on Production Until Ready

Simple invariant, unchanged from Version 3: **never set
`PAYFAST_ENABLED` (or flip `VITE_PAYFAST_ENABLED` in
`.github/workflows/deploy.yml`) on Render or in the GitHub Actions
workflow.** Both stay exactly as Version 3 left them through all of
Milestones 27-31 below. Only a final, deliberate, separately-reviewed
decision (step F) should ever change that — not a side effect of
testing.

## Source IP Verification Plan

**Update (Milestone 29): implemented, disabled by default.** The plan
below (written during Milestone 27) is preserved as originally
written; see the "Milestone 29" section near the end of this document
for exactly how it was actually built, and the two differences worth
knowing about before reading the plan as if it were still the current
state:

1. The two mechanisms proposed here were built as **two separate,
   independently-flagged checks** (`PAYFAST_VERIFY_SOURCE` and
   `PAYFAST_VALIDATE_SERVER`), not one combined "source verification"
   feature — each can be turned on independently.
2. The "domain-based source validation" mechanism was simplified from
   *reverse*-resolving the source IP and confirming it forward-resolves
   back (as originally proposed below) to the more direct approach of
   *forward*-resolving PayFast's own known domains and checking the
   source IP against that result set — simpler, avoids relying on
   reverse DNS (PTR records) being configured correctly for whatever
   infrastructure PayFast's servers run on, and was what Milestone 29
   was explicitly asked to build.

**Original planning-stage framing follows, unchanged:**

### How Express/Render Receives the Client IP

Express exposes `req.ip`/`req.ips`, but by default Express does **not**
trust any `X-Forwarded-For` header — it reports the IP of whatever
directly connected to the Node process. On Render, that's Render's own
reverse proxy, not the real original client (PayFast's server, for a
genuine ITN). Confirmed by reviewing `backend/src/app.ts`: **there is
no `app.set("trust proxy", ...)` anywhere in this codebase today.**
Without it, `req.ip` on Render always resolves to Render's internal
proxy address — useless for identifying PayFast.

### Trusting the Proxy Correctly

Render's own documentation describes exactly one reverse-proxy hop in
front of the application. The correct, minimal fix is
`app.set("trust proxy", 1)` in `backend/src/app.ts` — trusting exactly
one hop, not `true` (which trusts every hop in the chain and would let
a client freely spoof `X-Forwarded-For` if there were ever more than
one proxy involved). This must be verified against Render's actual
current proxy behaviour before relying on it, not assumed.

### Comparing Against PayFast's Source

PayFast does not publish a small, fixed, static IP allowlist to
compare against directly (or at least, none is known/verified as part
of this plan — treating this as unverified rather than asserting a
specific IP range would otherwise be guessing). PayFast's own
documented custom-integration validation instead relies on two other
mechanisms, which this plan recommends as the real approach:

1. **Server confirmation POST-back** — after signature verification,
   POST the received ITN fields back to PayFast's own validation
   endpoint (sandbox: `https://sandbox.payfast.co.za/eng/query/validate`;
   production: `https://www.payfast.co.za/eng/query/validate`) and
   require a `VALID` response before trusting the notification. This
   is protocol-guaranteed regardless of PayFast's underlying IP
   infrastructure, and is the most robust check available.
2. **Domain-based source validation** — reverse-resolve the source IP
   to a hostname, confirm it ends in `.payfast.co.za`, then
   forward-resolve that hostname and confirm it maps back to the same
   IP (guards against a spoofed/forged reverse DNS entry). This is a
   secondary layer, not a replacement for (1).

Both should be added **in addition to**, never instead of, the
existing signature/amount/merchant-ID checks — defense in depth, not a
replacement for what's already there.

### Local Development Cannot Test This Normally

A local request can never genuinely originate from PayFast's real
infrastructure, so the *real* version of this check can only ever be
proven against real traffic (during the sandbox round trip itself, or
in production). **The plan is not to fake this locally.** Instead:

- Gate the whole feature behind its own new flag (recommended name:
  `PAYFAST_VERIFY_SOURCE=false` by default), following the exact same
  pattern as `PAYFAST_ENABLED`/`EMAIL_ENABLED` — safe, inert by
  default, no behaviour change for anyone until deliberately turned on.
- Unit-test the *logic* (the DNS-lookup function, the confirmation
  POST-back function) directly with crafted inputs and a mocked DNS/
  HTTP layer — this proves the code behaves correctly for known inputs
  without claiming it's been proven against real PayFast traffic.
- The *real* proof only comes from the sandbox round trip (step D
  below) and, later, real production traffic — both are honestly
  labelled as such in whatever documentation follows.

### Keeping Sandbox Testing Practical Without Weakening Production Rules

`PAYFAST_VERIFY_SOURCE` should default `false` so that today's already-
tested notify flow (signature/amount/merchant-ID checks) isn't put at
risk by adding an unproven new check on top of it. Once implemented
and exercised against real ITN traffic during the sandbox round trip,
turning it on is a deliberate, separate decision — not bundled
silently into "just testing sandbox."

## Recommended Version 4 Implementation Order

| Step | What | Why this order |
|---|---|---|
| **A** | Plan and document the sandbox round trip | This milestone (27) — understand the whole picture before writing any new code |
| **B** | Add source IP verification support, behind `PAYFAST_VERIFY_SOURCE=false` | Should exist *before* the real round trip (step D) so that round trip can also exercise/prove this new code against genuine PayFast traffic, not just the parts already tested |
| **C** | Add a documented, safe way to run a temporary sandbox test session (local backend + tunnel, `PAYFAST_ENABLED=true` locally only) | Operational setup/documentation, not necessarily new application code — makes step D repeatable and safe |
| **D** | Actually perform the PayFast hosted sandbox round trip with a public (tunnelled) local backend | The real proof: a genuine browser round trip, a genuine ITN, genuine source IP verification exercised for the first time against real traffic |
| **E** | Update docs and QA with the round trip's real results | Replace "not yet performed" language across `PAYFAST_SETUP.md`, the QA docs, and the stability review with what was actually observed |
| **F** | Only later, as its own deliberate and separately-reviewed decision: whether to enable PayFast in production | Never a side effect of any step above |

## Risks

- **Shared production database** — every step above still writes to
  the same Supabase database real customers use; test-data cleanup
  discipline is mandatory regardless of local vs. tunnel vs. Render.
- **Tunnel URLs are temporary** — a free ngrok URL typically changes
  each session; `BACKEND_PUBLIC_URL`/`PAYFAST_NOTIFY_URL` must be
  updated locally each time a new tunnel session starts, and PayFast's
  sandbox config (if using PayFast's dashboard-configured notify URL
  rather than a per-request one) may need updating too.
- **Confusing a successful round trip with production readiness** —
  a successful sandbox round trip and a working source IP check are
  necessary, not sufficient, before enabling real production payments;
  step F remains a separate, deliberate decision regardless of how
  well D and B go.
- **Accidentally leaving `PAYFAST_ENABLED=true` set locally** is low
  risk (it only affects the tester's own machine) but should still be
  reverted to the project's safe default when a testing session ends,
  to avoid confusion in a later session.

## What Must Not Be Done Yet

- Do not set `PAYFAST_ENABLED=true` (or any PayFast credential) on
  Render.
- Do not set `VITE_PAYFAST_ENABLED=true` in
  `.github/workflows/deploy.yml`.
- Do not implement source IP verification by faking or hardcoding a
  "pass" result.
- Do not perform the actual sandbox round trip yet — that's step D,
  not this milestone.
- Do not touch courier integration, real email sending, login, or an
  admin dashboard — all explicitly out of scope for Version 4 so far.

## Recommendation for Milestone 28 (as proposed in Milestone 27)

**Originally recommended:** Step B — implement source IP verification,
gated behind `PAYFAST_VERIFY_SOURCE=false`, with its logic unit-tested
against crafted inputs (never faked against real traffic it hasn't
seen) — before the actual sandbox round trip, so that round trip could
exercise and prove the new check against real PayFast traffic for the
first time.

**What actually happened:** Milestone 28 was assigned to Step C
instead — public sandbox test *setup* (tunnel/environment preparation)
— see the "Milestone 28" section below. This is a reasonable,
still-safe resequencing (setup doesn't depend on source IP
verification existing yet), not a deviation that changes any risk —
source IP verification remains recommended before Milestone 30's
actual hosted round trip, so that round trip can still prove it
against real traffic, just slightly later in the sequence than
originally suggested.

---

## Milestone 28 — Public Sandbox Test Setup

Prepares the local setup needed for a real hosted PayFast sandbox round
trip using a temporary public tunnel. **Setup, documentation, and
preflight only — no hosted payment was run.** Full detail in
`VERSION_4_PAYFAST_SANDBOX_SETUP.md`.

### Setup Approach

A temporary public tunnel (e.g. ngrok) forwards a public HTTPS URL to
the locally-running backend (`localhost:5000`). Only two existing env
vars change to make this work: `BACKEND_PUBLIC_URL` and
`PAYFAST_NOTIFY_URL`, both updated to the tunnel's URL in the local,
git-ignored `backend/.env`. `PAYFAST_RETURN_URL`/`PAYFAST_CANCEL_URL`
stay pointed at `localhost:5173`, since those are browser redirects on
the tester's own machine, not server-to-server calls.

### Tunnel Requirement

A tunnel is required specifically for `notify_url` — see below. No
tunnel is needed for `return_url`/`cancel_url`, the frontend, or the
API base URL the frontend itself uses (`VITE_API_BASE_URL` stays
`localhost` throughout).

### Why Localhost `notify_url` Does Not Work

PayFast's ITN is a server-to-server POST made by PayFast's own
infrastructure, not by the customer's browser. `localhost` only means
"this machine" to the machine itself — PayFast's servers, elsewhere on
the internet, have no route to it. A public tunnel is the only way to
give PayFast's servers a real address that forwards back to the
developer's own machine.

### Why Production Render Should Not Be Used Yet

Testing against the live Render backend would require setting
`PAYFAST_ENABLED=true` there directly — explicitly out of scope for
Version 4 so far, and risky beyond that: it would make the live
backend accept real `PAYFAST` orders from any real site visitor, not
just the tester, regardless of what the frontend shows. The
tunnel + local backend approach keeps `PAYFAST_ENABLED=true` confined
entirely to the tester's own machine.

### Known Risks

- Local dev and the live Render backend share the same Supabase
  database — every test order/enquiry created during tunnel testing is
  a real row in the same database real customers' orders live in;
  precise-ID cleanup remains mandatory.
- Tunnel URLs are typically temporary/session-specific — env vars need
  updating (and the backend restarting) each time a new tunnel session
  starts.
- Code review confirmed **no code changes were needed** for tunnel
  compatibility — `notify_url`/`return_url`/`cancel_url` were already
  fully environment-variable-driven from Milestones 20-23, with no
  hardcoded `localhost` or other fixed values anywhere in the backend
  or the three frontend payment pages reviewed.

---

## Milestone 29 — PayFast Source Verification Hardening

Implements the source verification plan above — disabled by default,
layered on top of (never instead of) the existing signature/amount/
merchant-ID checks. Full detail in
`VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`.

**What was built:**

- `PAYFAST_VERIFY_SOURCE` (default `false`) — DNS-based domain
  verification, forward-resolving PayFast's known domains and checking
  the ITN's source IP against the result (`payfastSourceVerification.ts`).
- `PAYFAST_VALIDATE_SERVER` (default `false`) — POSTs the received ITN
  back to PayFast's own validation endpoint, requires `"VALID"`
  (`payfastServerValidation.ts`).
- `TRUST_PROXY` (default `false`) — `app.set("trust proxy", 1)` only
  when explicitly enabled, so `req.ip` can reflect the real caller
  behind Render's or a tunnel's reverse proxy.
- Both new checks wired into `payfast.service.ts`'s notify flow as
  Steps 5-6, right after eligibility and before status mapping —
  failing either rejects with a clean `403` (source — same class as an
  invalid signature) or `400` (server validation — same class as an
  amount/merchant-ID mismatch), and never updates payment status.

**Tested:** with both flags `false`, the exact Milestone 22 regression
(valid COMPLETE → `PAID`/`CONFIRMED`) still passes unchanged. With
`PAYFAST_VERIFY_SOURCE=true`, a local request is correctly rejected
(`403`) — proving the rejection path, not yet the acceptance path.
With `PAYFAST_VALIDATE_SERVER=true`, crafted data POSTed to PayFast's
**real sandbox validate endpoint** is correctly rejected (`400`) — a
genuine network call to PayFast's actual infrastructure, confirming
the mechanism works end-to-end without needing a real payment to have
happened. No secrets or raw payloads logged in any test; no stock
changes during any notify call.

**Still not proven:** the *acceptance* path for either check — that a
genuine PayFast-originated ITN passes both. That requires Milestone
30's real hosted sandbox round trip, the only way a request can
actually originate from PayFast's own infrastructure.

## Milestone 30 — Hosted PayFast Sandbox Round Trip Test

Full detail in `VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`. Summary:

- **Two real bugs found and fixed** in
  `backend/src/utils/payfastSignature.ts`, both invisible to this
  document's own Milestone 22 self-consistency testing since that only
  ever checked the code against itself: (1) the URL-encoding helper
  didn't replicate PHP's `urlencode()` for six punctuation characters
  (`! ' ( ) * ~`) — the order's own `item_description` always contains
  literal parentheses, so every real signature check involving it
  failed; (2) empty-valued ITN fields (PayFast's own unused
  `custom_str1-5`/`custom_int1-5`) were being dropped before recomputing
  the signature, when PayFast's own signature includes them. Both fixed;
  confirmed via independent recomputation matching PayFast's real
  signature exactly.
- **Hosted sandbox payment round trip works** — a real customer
  checkout, through PayFast's real sandbox payment page, real
  "Complete Payment" confirmation, real ITN delivered via ngrok, ending
  in a genuinely backend-verified `PAID`/`CONFIRMED` order.
- **PayFast server validation works** — `PAYFAST_VALIDATE_SERVER=true`
  correctly accepted the real ITN via a live call to PayFast's sandbox
  validate endpoint, not just the rejection path Milestone 29 proved.
- **Source verification acceptance remains unproven through this
  tunnel** — `PAYFAST_VERIFY_SOURCE=true` correctly and safely rejected
  the real ITN (`403`); per this document's own planning, the fallback
  test (`PAYFAST_VERIFY_SOURCE=false`, `PAYFAST_VALIDATE_SERVER=true`)
  was run instead, clearly labelled, to prove the rest of the round
  trip. The exact cause (tunnel IP-forwarding vs. a genuine DNS/IP
  mismatch) was not conclusively root-caused.
- **Production payments are still not ready** — `PAYFAST_ENABLED`
  remains `false` on Render; that decision is unchanged by this
  milestone.
- **localtunnel proved unreliable** in this environment (see the round
  trip test doc for detail); ngrok, started independently by the user
  outside this session's own process tree, did not have the same
  problems and is the recommended tunnel tool going forward.
